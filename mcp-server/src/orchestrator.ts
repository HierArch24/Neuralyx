/**
 * NEURALYX Multi-Channel Application Orchestrator
 *
 * Executes job applications across multiple channels simultaneously:
 * - Platform Apply (browser via Playwright)
 * - Company Website / ATS Portal
 * - Email to Recruiter
 * - Recruiter Outreach (LinkedIn)
 *
 * Uses buildApplicationStrategy() output to determine channel priority,
 * fires primary immediately, schedules secondary channels with delays.
 */

import { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { upsertOrchestratorState, insertEpisode } from './orchestrator-db.js'

// These will be injected from api.ts at init
let supabaseQuery: (table: string, method: string, body?: unknown, filters?: string) => Promise<{ data: unknown; error?: string }>
let broadcastNotification: (type: string, data: Record<string, unknown>) => void
let sendEmail: (to: string, subject: string, body: string) => Promise<{ success: boolean; messageId?: string; error?: string }>
let generateCoverLetter: (job: { title: string; company: string; description?: string }) => Promise<string>
let generateChannelVariant: (coverLetter: string, tone: 'formal' | 'concise' | 'conversational', title: string, company: string) => Promise<string>
let buildStrategy: (job: Record<string, unknown>) => { strategy_type: string; primary: Record<string, unknown>; secondary: Record<string, unknown>[]; variation_required: boolean; safety_notes: string[] }
let SMTP_FROM_NAME: string
let SMTP_FROM_EMAIL: string
let SMTP_REPLY_TO: string
let NOTIFY_EMAIL: string

interface ChannelPlan {
  channel: string
  tone: string
  action: string
  target?: string
  delay_hours?: number
}

interface StrategyPlan {
  strategy_type: string
  primary: ChannelPlan
  secondary: ChannelPlan[]
  variation_required: boolean
  safety_notes: string[]
}

interface MultiOrchResult {
  job_id: string
  title: string
  company: string
  application_id: string
  strategy_type: string
  channels: { channel: string; status: string; detail: string; execution_id: string }[]
}

// ─── Initialize with dependencies from api.ts ───

export function initOrchestrator(deps: {
  supabaseQuery: typeof supabaseQuery
  broadcastNotification: typeof broadcastNotification
  sendEmail: typeof sendEmail
  generateCoverLetter: typeof generateCoverLetter
  generateChannelVariant: typeof generateChannelVariant
  buildStrategy: typeof buildStrategy
  SMTP_FROM_NAME: string
  SMTP_FROM_EMAIL: string
  SMTP_REPLY_TO: string
  NOTIFY_EMAIL: string
}) {
  supabaseQuery = deps.supabaseQuery
  broadcastNotification = deps.broadcastNotification
  sendEmail = deps.sendEmail
  generateCoverLetter = deps.generateCoverLetter
  generateChannelVariant = deps.generateChannelVariant
  buildStrategy = deps.buildStrategy
  SMTP_FROM_NAME = deps.SMTP_FROM_NAME
  SMTP_FROM_EMAIL = deps.SMTP_FROM_EMAIL
  SMTP_REPLY_TO = deps.SMTP_REPLY_TO
  NOTIFY_EMAIL = deps.NOTIFY_EMAIL
}

// ─── Smart Rules Engine ───

function applySmartRules(job: Record<string, unknown>, strategy: StrategyPlan): StrategyPlan {
  const rd = (job.raw_data || {}) as Record<string, unknown>
  const matchScore = (job.match_score as number) || 0
  const channels = (rd.apply_channels || []) as { channel: string; target?: string }[]
  const hasEmail = channels.some(c => c.channel === 'email' && c.target)
  const hasJobBoard = channels.some(c => c.channel === 'job_board')
  const hasCompanyPortal = channels.some(c => c.channel === 'company_portal')
  const recruiterEmail = (rd.recruiter_email as string) || (rd.inferred_company_email as string) || ''

  // Rule: High match (80+) → attack all channels in parallel
  if (matchScore >= 80 && channels.length > 1) {
    strategy.strategy_type = 'parallel'
    // Ensure all available channels are in the plan
    for (const ch of channels) {
      if (ch.channel !== strategy.primary.channel && !strategy.secondary.some(s => s.channel === ch.channel)) {
        strategy.secondary.push({
          channel: ch.channel,
          tone: ch.channel === 'email' ? 'conversational' : 'formal',
          action: `Apply via ${ch.channel}`,
          target: ch.target || recruiterEmail,
          delay_hours: ch.channel === 'email' ? 4 : 0,
        })
      }
    }
  }

  // Rule: If company_portal available → prioritize it
  if (hasCompanyPortal && strategy.primary.channel !== 'company_portal') {
    const portalChannel = channels.find(c => c.channel === 'company_portal')
    if (portalChannel) {
      // Move current primary to secondary
      strategy.secondary.unshift({ ...strategy.primary, delay_hours: 0 } as ChannelPlan)
      strategy.primary = { channel: 'company_portal', tone: 'formal', action: 'Apply on company careers page', target: portalChannel.target }
    }
  }

  // Rule: If email found → always add as secondary AFTER platform apply
  if (hasEmail && !strategy.secondary.some(s => s.channel === 'email') && strategy.primary.channel !== 'email') {
    const emailTarget = channels.find(c => c.channel === 'email')?.target || recruiterEmail
    if (emailTarget) {
      strategy.secondary.push({
        channel: 'email',
        tone: 'conversational',
        action: 'Send follow-up email referencing platform application',
        target: emailTarget,
        delay_hours: 4,
      })
    }
  }

  // Rule: Low match (<50) → minimal effort, single channel
  if (matchScore < 50) {
    strategy.strategy_type = 'strict'
    strategy.secondary = []
  }

  return strategy
}

// ─── Execute Multi-Channel Strategy ───

export async function executeMultiChannelStrategy(jobId: string): Promise<MultiOrchResult | null> {
  // 1. Fetch job from DB
  const { data: jobRows } = await supabaseQuery('job_listings', 'GET', undefined, `id=eq.${jobId}&select=*`)
  const jobs = jobRows as Record<string, unknown>[] | null
  if (!jobs?.length) return null
  const job = jobs[0]

  const title = job.title as string
  const company = job.company as string
  const rd = (job.raw_data || {}) as Record<string, unknown>
  const platform = job.platform as string
  const url = job.url as string

  // 2. Generate cover letter if missing
  let coverLetter = (rd.cover_letter as string) || ''
  if (!coverLetter || coverLetter.length < 50) {
    try {
      coverLetter = await generateCoverLetter({ title, company, description: job.description as string })
    } catch { /* skip */ }
  }

  // 3. Build strategy
  let strategy: StrategyPlan
  try {
    strategy = buildStrategy(job) as unknown as StrategyPlan
  } catch {
    // Fallback: simple email-only strategy
    const recruiterEmail = (rd.recruiter_email as string) || (rd.inferred_company_email as string) || ''
    strategy = {
      strategy_type: 'strict',
      primary: { channel: recruiterEmail ? 'email' : 'job_board', tone: 'formal', action: 'Apply', target: recruiterEmail || url },
      secondary: [],
      variation_required: false,
      safety_notes: [],
    }
  }

  // 4. Apply smart rules
  strategy = applySmartRules(job, strategy)

  // 5. Create job_application record
  const applicationId = randomUUID()
  await supabaseQuery('job_applications', 'POST', {
    id: applicationId,
    job_listing_id: jobId,
    platform,
    channel: strategy.primary.channel === 'email' ? 'email' : 'direct',
    status: 'applying',
    applied_via: 'multi_channel_orchestrator',
    cover_letter: coverLetter,
    strategy_plan: JSON.stringify(strategy),
    notes: `Strategy: ${strategy.strategy_type} | Channels: ${[strategy.primary, ...strategy.secondary].map(c => c.channel).join(', ')}`,
  })

  // 6. Create channel_executions for primary + all secondary
  const allChannels = [
    { ...strategy.primary, delay_hours: 0, is_primary: true },
    ...strategy.secondary.map(s => ({ ...s, is_primary: false })),
  ]

  const channelResults: MultiOrchResult['channels'] = []

  for (const ch of allChannels) {
    const execId = randomUUID()
    const isScheduled = (ch.delay_hours || 0) > 0
    const scheduledAt = isScheduled ? new Date(Date.now() + (ch.delay_hours || 0) * 3600000).toISOString() : null

    // Generate channel-specific cover letter variant
    let variant = coverLetter
    if (strategy.variation_required && ch.tone && coverLetter) {
      try {
        variant = await generateChannelVariant(coverLetter, ch.tone as 'formal' | 'concise' | 'conversational', title, company)
      } catch { variant = coverLetter }
    }

    await supabaseQuery('channel_executions', 'POST', {
      id: execId,
      application_id: applicationId,
      job_listing_id: jobId,
      channel: ch.channel,
      status: isScheduled ? 'scheduled' : 'in_progress',
      tone: ch.tone,
      cover_letter_variant: variant,
      target: ch.target || url,
      platform,
      method: `${ch.channel}_apply`,
      scheduled_at: scheduledAt,
      attempt_count: 0,
    })

    // Execute immediately if not scheduled
    if (!isScheduled) {
      const result = await executeChannel(execId, jobId, applicationId, ch as ChannelPlan, job, variant)
      channelResults.push({ channel: ch.channel, status: result.status, detail: result.detail, execution_id: execId })
    } else {
      channelResults.push({ channel: ch.channel, status: 'scheduled', detail: `Scheduled for ${scheduledAt}`, execution_id: execId })
    }

    // Broadcast SSE
    broadcastNotification('channel_execution', {
      job_id: jobId,
      application_id: applicationId,
      execution_id: execId,
      channel: ch.channel,
      status: isScheduled ? 'scheduled' : channelResults[channelResults.length - 1]?.status,
      title, company, platform,
      timestamp: new Date().toISOString(),
    })
  }

  // 7. Update job_applications status based on results
  const anyApplied = channelResults.some(c => c.status === 'applied')
  const allFailed = channelResults.filter(c => c.status !== 'scheduled').every(c => c.status === 'failed')
  await supabaseQuery('job_applications', 'PATCH', {
    status: anyApplied ? 'applied' : allFailed ? 'apply_failed' : 'applying',
    updated_at: new Date().toISOString(),
  }, `id=eq.${applicationId}`)

  // Update job_listings status
  if (anyApplied) {
    await supabaseQuery('job_listings', 'PATCH', { status: 'applied', updated_at: new Date().toISOString() }, `id=eq.${jobId}`)
  }

  return {
    job_id: jobId,
    title, company,
    application_id: applicationId,
    strategy_type: strategy.strategy_type,
    channels: channelResults,
  }
}

// ─── Execute Single Channel ───

async function executeChannel(
  execId: string, jobId: string, appId: string,
  channel: ChannelPlan, job: Record<string, unknown>, coverLetter: string,
): Promise<{ status: string; detail: string }> {
  const rd = (job.raw_data || {}) as Record<string, unknown>
  const title = job.title as string
  const company = job.company as string

  try {
    if (channel.channel === 'email') {
      // Email apply
      const target = channel.target || (rd.recruiter_email as string) || (rd.inferred_company_email as string) || ''
      if (!target || !coverLetter || coverLetter.length < 50) {
        await updateExecution(execId, 'failed', 'No email target or cover letter too short')
        return { status: 'failed', detail: 'No email target or empty cover letter' }
      }

      const emailBody = `Dear ${company} Hiring Team,\n\n${coverLetter}\n\nBest regards,\n${SMTP_FROM_NAME}\nAI Systems Engineer\n${SMTP_REPLY_TO}\nhttps://neuralyx.ai.dev-environment.site`
      const result = await sendEmail(target, `Application for ${title} — ${SMTP_FROM_NAME}`, emailBody)

      if (result.success) {
        await updateExecution(execId, 'applied', `Email sent to ${target} — ${result.messageId}`)
        return { status: 'applied', detail: `Email sent to ${target}` }
      } else {
        await updateExecution(execId, 'failed', result.error || 'Send failed')
        return { status: 'failed', detail: result.error || 'Send failed' }
      }

    } else if (channel.channel === 'job_board') {
      // Browser apply — return instructions for the apply-server/Playwright
      // The actual execution happens via the browser callback endpoint
      await updateExecution(execId, 'pending', 'Queued for browser apply via Playwright')
      return { status: 'pending', detail: `Browser apply queued: ${job.url}` }

    } else if (channel.channel === 'company_portal') {
      // Company portal — also needs browser, but different from job board
      await updateExecution(execId, 'pending', 'Queued for company portal apply')
      return { status: 'pending', detail: `Company portal apply queued: ${channel.target || job.url}` }

    } else if (channel.channel === 'cold_outreach' || channel.channel === 'recruiter') {
      // Recruiter outreach — log as pending for manual or LinkedIn automation
      await updateExecution(execId, 'scheduled', 'Recruiter outreach queued')
      return { status: 'scheduled', detail: 'Recruiter outreach pending' }

    } else {
      await updateExecution(execId, 'skipped', `Unknown channel: ${channel.channel}`)
      return { status: 'skipped', detail: `Unknown channel: ${channel.channel}` }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await updateExecution(execId, 'failed', msg)
    return { status: 'failed', detail: msg }
  }
}

// ─── Update Channel Execution Status ───

async function updateExecution(execId: string, status: string, detail: string) {
  await supabaseQuery('channel_executions', 'PATCH', {
    status,
    error_detail: status === 'failed' ? detail : null,
    executed_at: status === 'applied' || status === 'failed' ? new Date().toISOString() : null,
    attempt_count: 1, // Increment on retry logic later
    updated_at: new Date().toISOString(),
  }, `id=eq.${execId}`)
}

// ─── Process Scheduled Channels (runs every 60s) ───

export async function processScheduledChannels() {
  const now = new Date().toISOString()
  const { data } = await supabaseQuery('channel_executions', 'GET', undefined,
    `status=eq.scheduled&scheduled_at=lte.${now}&select=*&order=scheduled_at.asc&limit=10`)

  const executions = data as Record<string, unknown>[] | null
  if (!executions?.length) return

  console.log(`[Scheduler] Processing ${executions.length} scheduled channel executions`)

  for (const exec of executions) {
    const execId = exec.id as string
    const jobId = exec.job_listing_id as string
    const appId = exec.application_id as string
    const channel = exec.channel as string
    const target = exec.target as string
    const coverLetter = exec.cover_letter_variant as string

    // Fetch the job
    const { data: jobRows } = await supabaseQuery('job_listings', 'GET', undefined, `id=eq.${jobId}&select=*`)
    const jobs = jobRows as Record<string, unknown>[] | null
    if (!jobs?.length) { await updateExecution(execId, 'failed', 'Job not found'); continue }
    const job = jobs[0]

    const channelPlan: ChannelPlan = { channel, tone: exec.tone as string, action: 'Scheduled execution', target }
    const result = await executeChannel(execId, jobId, appId, channelPlan, job, coverLetter || '')

    console.log(`[Scheduler] ${job.title} @ ${job.company} — ${channel}: ${result.status}`)

    broadcastNotification('channel_execution', {
      job_id: jobId, application_id: appId, execution_id: execId,
      channel, status: result.status, detail: result.detail,
      title: job.title, company: job.company,
      timestamp: new Date().toISOString(),
    })

    // If this was a secondary that succeeded, update the parent application
    if (result.status === 'applied') {
      await supabaseQuery('job_applications', 'PATCH', {
        status: 'applied', updated_at: new Date().toISOString(),
      }, `id=eq.${appId}`)
    }
  }
}

// ─── Fallback: When primary fails, promote next secondary ───

export async function handleChannelFallback(executionId: string): Promise<boolean> {
  const { data: execRows } = await supabaseQuery('channel_executions', 'GET', undefined, `id=eq.${executionId}&select=*`)
  const execs = execRows as Record<string, unknown>[] | null
  if (!execs?.length) return false

  const failedExec = execs[0]
  const appId = failedExec.application_id as string

  // Find next pending/scheduled secondary for same application
  const { data: siblings } = await supabaseQuery('channel_executions', 'GET', undefined,
    `application_id=eq.${appId}&status=in.(scheduled,pending)&order=created_at.asc&limit=1`)
  const nextChannels = siblings as Record<string, unknown>[] | null
  if (!nextChannels?.length) return false

  const next = nextChannels[0]
  console.log(`[Fallback] Primary ${failedExec.channel} failed → promoting ${next.channel}`)

  // Execute the fallback immediately
  await supabaseQuery('channel_executions', 'PATCH', {
    status: 'in_progress', scheduled_at: null, updated_at: new Date().toISOString(),
  }, `id=eq.${next.id}`)

  return true
}

// ─── API Handler: Multi-Channel Orchestrate ───

export async function handleMultiOrchestrate(req: IncomingMessage, res: ServerResponse, readBody: (r: IncomingMessage) => Promise<string>, json: (r: ServerResponse, s: number, d: unknown) => void) {
  const body = JSON.parse(await readBody(req))
  const { job_ids, mode } = body
  if (!job_ids?.length) return json(res, 400, { error: 'job_ids array required' })

  const results: MultiOrchResult[] = []
  const browserJobs: Record<string, unknown>[] = []

  for (const jobId of job_ids) {
    const result = await executeMultiChannelStrategy(jobId)
    if (result) {
      results.push(result)
      // Collect browser-pending channels for the apply server
      for (const ch of result.channels) {
        if (ch.status === 'pending' && (ch.channel === 'job_board' || ch.channel === 'company_portal')) {
          const { data: jobRows } = await supabaseQuery('job_listings', 'GET', undefined, `id=eq.${jobId}&select=*`)
          const jobs = jobRows as Record<string, unknown>[] | null
          if (jobs?.length) {
            const j = jobs[0]
            browserJobs.push({
              id: jobId,
              url: j.url,
              title: j.title,
              company: j.company,
              cover_letter: (j.raw_data as Record<string, unknown>)?.cover_letter,
              platform: j.platform,
              execution_id: ch.execution_id,
            })
          }
        }
      }
    }
  }

  const summary = {
    total: job_ids.length,
    processed: results.length,
    channels_created: results.reduce((s, r) => s + r.channels.length, 0),
    email_applied: results.reduce((s, r) => s + r.channels.filter(c => c.channel === 'email' && c.status === 'applied').length, 0),
    browser_pending: browserJobs.length,
    scheduled: results.reduce((s, r) => s + r.channels.filter(c => c.status === 'scheduled').length, 0),
  }

  json(res, 200, { results, browser_jobs: browserJobs, summary })
}

// ============================================================
// Phase 2 — Sub-agent routing (Orchestrator state machine)
// Decides WHICH sub-agent handles an application + persists to
// orchestrator_state + apply_episodes for chatbot memory.
// ============================================================

export type SubAgent =
  | 'DirectApplyAgent'
  | 'PHPlatformAgent'
  | 'ExternalAtsAgent'
  | 'GenericFormAgent'
  | 'EmailApplyAgent'
  | 'ColdOutreachAgent'

export type RoutedChannel =
  | 'job_board'
  | 'company_portal'
  | 'external_ats'
  | 'generic_form'
  | 'email'
  | 'cold_outreach'

export type AtsType =
  | 'workday'
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'smartapply'
  | 'linkedin_easy'
  | 'kalibrr'
  | 'jobslin'
  | 'onlinejobs'
  | 'generic'
  | null

export interface ApplyChannelHint {
  type?: string
  channel?: string
  target?: string | null
  [k: string]: unknown
}

export interface RouteInput {
  application_id: string
  job: {
    id?: string
    job_url?: string | null
    url?: string | null
    company?: string | null
    title?: string | null
    application_type?: string | null
    [k: string]: unknown
  }
  raw_data?: {
    apply_channels?: ApplyChannelHint[]
    recruiter_email?: string | null
    inferred_company_email?: string | null
    [k: string]: unknown
  } | null
}

export interface RouteDecision {
  sub_agent: SubAgent
  channel: RoutedChannel
  ats_type: AtsType
  target_email?: string | null
  reason: string
  secondary: SubAgent[]
}

function safeHostname(u: string | null | undefined): string {
  if (!u) return ''
  try { return new URL(u).hostname.toLowerCase() } catch { return '' }
}

export function detectAts(u: string | null | undefined): AtsType {
  const h = safeHostname(u)
  if (!h) return null
  if (h.includes('workday')) return 'workday'
  if (h.includes('greenhouse.io')) return 'greenhouse'
  if (h.includes('lever.co')) return 'lever'
  if (h.includes('ashbyhq')) return 'ashby'
  if (h.includes('smartapply.indeed.com')) return 'smartapply'
  if (h === 'www.linkedin.com' || h === 'linkedin.com') return 'linkedin_easy'
  if (h.includes('kalibrr')) return 'kalibrr'
  if (h.includes('jobslin')) return 'jobslin'
  if (h.includes('onlinejobs.ph')) return 'onlinejobs'
  return null
}

const isPHPlatform = (a: AtsType) => a === 'kalibrr' || a === 'jobslin' || a === 'onlinejobs'
const isDirectApply = (a: AtsType) => a === 'smartapply' || a === 'linkedin_easy'
const isExternalAts = (a: AtsType) => a === 'workday' || a === 'greenhouse' || a === 'lever' || a === 'ashby'

function pickEmailFromChannels(channels?: ApplyChannelHint[]): string | null {
  if (!channels?.length) return null
  for (const c of channels) {
    const kind = (c.type || c.channel || '').toLowerCase()
    if (kind === 'email' && typeof c.target === 'string' && c.target.includes('@')) {
      return c.target
    }
  }
  return null
}

export function routeChannel(input: RouteInput): RouteDecision {
  const raw = input.raw_data || {}
  const jobUrl = input.job.job_url || input.job.url || null
  const jdEmail = pickEmailFromChannels(raw.apply_channels)
  const ats = detectAts(jobUrl)
  const secondary: SubAgent[] = []

  if (jdEmail) {
    if (raw.recruiter_email && raw.recruiter_email !== jdEmail) secondary.push('ColdOutreachAgent')
    return { sub_agent: 'EmailApplyAgent', channel: 'email', ats_type: null, target_email: jdEmail, reason: `JD specifies email target ${jdEmail}`, secondary }
  }
  if (isDirectApply(ats)) {
    if (raw.recruiter_email) secondary.push('EmailApplyAgent')
    return { sub_agent: 'DirectApplyAgent', channel: 'job_board', ats_type: ats, reason: `Direct-apply platform: ${ats}`, secondary }
  }
  if (isPHPlatform(ats)) {
    if (raw.recruiter_email) secondary.push('EmailApplyAgent')
    return { sub_agent: 'PHPlatformAgent', channel: 'job_board', ats_type: ats, reason: `PH platform: ${ats}`, secondary }
  }
  if (isExternalAts(ats)) {
    if (raw.recruiter_email) secondary.push('EmailApplyAgent')
    return { sub_agent: 'ExternalAtsAgent', channel: 'external_ats', ats_type: ats, reason: `External ATS: ${ats}`, secondary }
  }
  if ((input.job.application_type || '').toLowerCase() === 'email') {
    const target = raw.recruiter_email || raw.inferred_company_email
    if (target) return { sub_agent: 'EmailApplyAgent', channel: 'email', ats_type: null, target_email: target, reason: `application_type=email, target ${target}`, secondary: [] }
  }
  if (jobUrl) {
    if (raw.recruiter_email || raw.inferred_company_email) secondary.push('EmailApplyAgent')
    return { sub_agent: 'GenericFormAgent', channel: 'generic_form', ats_type: 'generic', reason: 'Unknown ATS with apply URL — vision-first generic form', secondary }
  }
  const emailFallback = raw.recruiter_email || raw.inferred_company_email
  if (emailFallback) {
    return { sub_agent: 'EmailApplyAgent', channel: 'email', ats_type: null, target_email: emailFallback, reason: `No URL — email ${emailFallback}`, secondary: [] }
  }
  return { sub_agent: 'ColdOutreachAgent', channel: 'cold_outreach', ats_type: null, reason: 'No apply URL, no recruiter — cold outreach fallback (needs approval)', secondary: [] }
}

export async function persistRoutingDecision(input: RouteInput, decision: RouteDecision): Promise<void> {
  const jobUrl = input.job.job_url || input.job.url || null
  await upsertOrchestratorState(input.application_id, decision.channel, {
    sub_agent: decision.sub_agent,
    ats_type: decision.ats_type,
    current_step: 'routed',
    step_name: `Routed to ${decision.sub_agent}`,
    last_url: jobUrl,
  })
  await insertEpisode({
    application_id: input.application_id,
    job_listing_id: (input.job.id as string) || null,
    domain: safeHostname(jobUrl) || null,
    channel: decision.channel,
    sub_agent: decision.sub_agent,
    episode_type: 'step_attempt',
    observation: {
      job_url: jobUrl,
      ats_type: decision.ats_type,
      target_email: decision.target_email || null,
      secondary: decision.secondary,
    },
    action: 'route_channel',
    outcome: 'routed',
    reasoning: decision.reason,
    vision_summary: `Routing: ${decision.sub_agent} via ${decision.channel}. ${decision.reason}`,
    first_try_success: null,
  })
}


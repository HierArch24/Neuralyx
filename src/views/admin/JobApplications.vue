<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useAdminStore } from '@/stores/admin'
import type { JobApplication, ChannelExecution } from '@/types/database'

const admin = useAdminStore()
const channelExecutions = ref<Record<string, ChannelExecution[]>>({})

async function fetchChannelExecutions(appId: string) {
  if (channelExecutions.value[appId]) return channelExecutions.value[appId]
  try {
    const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
    const res = await fetch(`${mcpUrl}/api/jobs/channels/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: appId }),
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const data = await res.json()
      channelExecutions.value[appId] = data.channels || []
      return data.channels || []
    }
  } catch { /* skip */ }
  return []
}

function getChannelBadges(appId: string): { channel: string; status: string; icon: string; color: string }[] {
  const execs = channelExecutions.value[appId] || []
  if (!execs.length) return []
  const badges: Record<string, { icon: string; colors: Record<string, string> }> = {
    job_board: { icon: '🖱️', colors: { applied: 'text-green-400 bg-green-500/15', pending: 'text-blue-400 bg-blue-500/15', failed: 'text-red-400 bg-red-500/15', scheduled: 'text-yellow-400 bg-yellow-500/15' } },
    email: { icon: '📧', colors: { applied: 'text-green-400 bg-green-500/15', pending: 'text-blue-400 bg-blue-500/15', failed: 'text-red-400 bg-red-500/15', scheduled: 'text-yellow-400 bg-yellow-500/15' } },
    company_portal: { icon: '🏢', colors: { applied: 'text-green-400 bg-green-500/15', pending: 'text-blue-400 bg-blue-500/15', failed: 'text-red-400 bg-red-500/15', scheduled: 'text-yellow-400 bg-yellow-500/15' } },
    cold_outreach: { icon: '🤝', colors: { applied: 'text-green-400 bg-green-500/15', pending: 'text-blue-400 bg-blue-500/15', failed: 'text-red-400 bg-red-500/15', scheduled: 'text-yellow-400 bg-yellow-500/15' } },
    recruiter: { icon: '👤', colors: { applied: 'text-green-400 bg-green-500/15', pending: 'text-blue-400 bg-blue-500/15', failed: 'text-red-400 bg-red-500/15', scheduled: 'text-yellow-400 bg-yellow-500/15' } },
    form: { icon: '📋', colors: { applied: 'text-green-400 bg-green-500/15', pending: 'text-blue-400 bg-blue-500/15', failed: 'text-red-400 bg-red-500/15', scheduled: 'text-yellow-400 bg-yellow-500/15' } },
  }
  return execs.map(e => {
    const b = badges[e.channel] || { icon: '📄', colors: { applied: 'text-green-400 bg-green-500/15', pending: 'text-gray-400 bg-gray-500/15', failed: 'text-red-400 bg-red-500/15', scheduled: 'text-yellow-400 bg-yellow-500/15' } }
    return { channel: e.channel, status: e.status, icon: b.icon, color: b.colors[e.status] || 'text-gray-400 bg-gray-500/15' }
  })
}
const filterStatus = ref('')
const filterChannel = ref('')
const searchQuery = ref('')
const currentPage = ref(1)
const perPage = 15
const showEdit = ref(false)
const editApp = ref<JobApplication | null>(null)
const showDetail = ref(false)
const detailApp = ref<JobApplication | null>(null)
const editForm = ref({ status: '', channel: '', agency_name: '', notes: '', salary_offered: '', follow_up_at: '' })

const PIPELINE = [
  { group: 'Application', stage: '1', statuses: ['applying', 'applied', 'apply_failed'], color: 'bg-blue-500', text: 'text-blue-400', bg: 'bg-blue-500/15' },
  { group: 'JD Validation', stage: '1.6', statuses: ['jd_validated', 'jd_blocked', 'jd_method_violation'], color: 'bg-indigo-500', text: 'text-indigo-400', bg: 'bg-indigo-500/15' },
  { group: 'Delivery Check', stage: '2', statuses: ['delivery_pending', 'delivery_confirmed', 'delivery_failed'], color: 'bg-sky-500', text: 'text-sky-400', bg: 'bg-sky-500/15' },
  { group: 'Screening', stage: '3', statuses: ['under_review', 'screened_out', 'phone_screen', 'endorsed'], color: 'bg-cyan-500', text: 'text-cyan-400', bg: 'bg-cyan-500/15' },
  { group: 'Pre-Assessment', stage: '4', statuses: ['video_intro', 'pre_screen_questions', 'portfolio_review', 'pre_assessment_passed'], color: 'bg-teal-500', text: 'text-teal-400', bg: 'bg-teal-500/15' },
  { group: 'Assessment', stage: '5', statuses: ['technical_test', 'test_submitted', 'test_passed', 'test_failed', 'take_home_project', 'case_study'], color: 'bg-yellow-500', text: 'text-yellow-400', bg: 'bg-yellow-500/15' },
  { group: 'Client Match', stage: '6', statuses: ['profile_sent', 'client_reviewing', 'client_approved', 'client_rejected'], color: 'bg-violet-500', text: 'text-violet-400', bg: 'bg-violet-500/15' },
  { group: 'Interview', stage: '7', statuses: ['interview_scheduled', 'interview_round_1', 'interview_round_2', 'interview_round_3', 'interview_passed', 'interview_failed'], color: 'bg-purple-500', text: 'text-purple-400', bg: 'bg-purple-500/15' },
  { group: 'Offer', stage: '8', statuses: ['offer_received', 'negotiating', 'offer_accepted', 'offer_declined', 'offer_withdrawn'], color: 'bg-green-500', text: 'text-green-400', bg: 'bg-green-500/15' },
  { group: 'Onboarding', stage: '9', statuses: ['pending_start', 'documents_submitted', 'account_setup', 'training', 'onboarded'], color: 'bg-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  { group: 'Closed', stage: '10', statuses: ['withdrawn', 'ghosted', 'position_filled', 'no_response_timeout', 'jd_method_violation', 'submission_failed', 'screening_rejected', 'assessment_failed', 'no_client_match', 'interview_rejected', 'offer_declined', 'offer_withdrawn', 'accepted_elsewhere'], color: 'bg-red-500', text: 'text-red-400', bg: 'bg-red-500/15' },
]

const aiCheckingStatus = ref(false)
const aiCheckingAll = ref(false)
const aiCheckProgress = ref('')

// URL Paste Auto-Apply
const pasteUrl = ref('')
const pasteProcessing = ref(false)
const pasteStatus = ref('')
const pasteError = ref('')
const pasteDuplicate = ref<{ exists: boolean; job_id?: string; match_type?: string; existing_status?: string } | null>(null)
const pasteStep = ref<'idle' | 'checking' | 'analyzing' | 'applying' | 'done' | 'duplicate'>('idle')

// Detail modal tab
const detailTab = ref<'pipeline' | 'overview' | 'description' | 'match' | 'cover_letter' | 'apply'>('pipeline')

// ─── Auto-Apply Engine State ───
const applyEnginePlatform = ref('indeed')
const applyEngineTarget = ref(20)
const applyEngineMinScore = ref(0)
const applyEngineFreshness = ref(30)
const applyEngineRunning = ref(false)
const applyEngineIdx = ref(0)
const applyEngineTotal = ref(0)
const applyEngineMsg = ref('')
const applyEngineResults = ref<Array<{ title: string; company: string; status: string; detail: string }>>([])
let applyEngineSSE: EventSource | null = null
let applyEngineTimer: ReturnType<typeof setTimeout> | null = null

// ─── Live Apply Monitor ───
const liveSteps = ref<Array<{ step: number; action: string; text: string; time: string }>>([])
const currentApplyJob = ref('')

// ─── Per-application apply step timeline (for accordion) ─────────────────
// Keyed by application_id (preferred) OR title|company composite key.
interface ApplyTimelineStep {
  step: number
  action: string
  ts: string
  button_text?: string
  question_text?: string
  question_type?: string
  field_kind?: string
  answer?: string
  fields_filled?: number
}
const applyStepsByApp = ref<Record<string, ApplyTimelineStep[]>>({})
const applyAccordionExpanded = ref<Record<string, boolean>>({})

function timelineKey(d: { application_id?: string; job_title?: string; company?: string }): string {
  if (d.application_id) return d.application_id
  return `${d.job_title || ''}|${d.company || ''}`
}

function pushTimelineStep(d: Record<string, unknown>) {
  const key = timelineKey(d as { application_id?: string; job_title?: string; company?: string })
  if (!key || key === '|') return
  if (!applyStepsByApp.value[key]) applyStepsByApp.value[key] = []
  applyStepsByApp.value[key].push({
    step: (d.step as number) ?? applyStepsByApp.value[key].length,
    action: (d.action as string) || '',
    ts: (d.timestamp as string) || new Date().toISOString(),
    button_text: d.button_text as string | undefined,
    question_text: d.question_text as string | undefined,
    question_type: d.question_type as string | undefined,
    field_kind: d.field_kind as string | undefined,
    answer: d.answer as string | undefined,
    fields_filled: d.fields_filled as number | undefined,
  })
  // Cap at 200 events per app to keep memory bounded
  if (applyStepsByApp.value[key].length > 200) {
    applyStepsByApp.value[key] = applyStepsByApp.value[key].slice(-200)
  }
}

function getTimelineForApp(app: { id?: string; job_listing_id?: string } | null): ApplyTimelineStep[] {
  if (!app) return []
  // Try app.id first (set by backend when creating application row)
  const direct = applyStepsByApp.value[app.id || ''] || []
  if (direct.length) return direct
  // Fallback: look up by title|company
  const job = (app as { job_listing_id?: string }).job_listing_id ? getJob((app as { job_listing_id: string }).job_listing_id) : null
  const key = `${job?.title || ''}|${job?.company || ''}`
  return applyStepsByApp.value[key] || []
}

const QUESTION_TYPE_LABEL: Record<string, { icon: string; label: string; color: string }> = {
  email:               { icon: '✉', label: 'Email', color: 'text-blue-300' },
  phone:               { icon: '☎', label: 'Phone', color: 'text-blue-300' },
  name:                { icon: '👤', label: 'Name', color: 'text-blue-300' },
  years_experience:    { icon: '📅', label: 'Years of experience', color: 'text-cyan-300' },
  salary:              { icon: '💰', label: 'Salary expectation', color: 'text-amber-300' },
  location:            { icon: '📍', label: 'Location', color: 'text-blue-300' },
  url:                 { icon: '🔗', label: 'URL / portfolio', color: 'text-purple-300' },
  file_upload:         { icon: '📎', label: 'Resume upload', color: 'text-purple-300' },
  cover_letter:        { icon: '✍', label: 'Cover letter', color: 'text-pink-300' },
  experience_summary:  { icon: '📝', label: 'Relevant experience', color: 'text-pink-300' },
  long_text:           { icon: '📝', label: 'Long-text answer', color: 'text-pink-300' },
  short_text:          { icon: '·', label: 'Short text', color: 'text-gray-300' },
  yes_no_radio:        { icon: '◉', label: 'Yes/No question', color: 'text-emerald-300' },
  experience_radio:    { icon: '◉', label: 'Experience yes/no', color: 'text-emerald-300' },
}

function questionTypeInfo(qt?: string) {
  return QUESTION_TYPE_LABEL[qt || 'short_text'] || QUESTION_TYPE_LABEL.short_text
}

const ACTION_LABEL: Record<string, { icon: string; label: string }> = {
  clicked_apply:      { icon: '🖱', label: 'Clicked Apply button' },
  cloudflare_fallback:{ icon: '🛡', label: 'Cloudflare detected — using real Edge' },
  ai_harness_rescue:  { icon: '🤖', label: 'AI rescue triggered' },
  ai_harness_done:    { icon: '🤖', label: 'AI rescue finished' },
  ai_harness_error:   { icon: '⚠', label: 'AI rescue error' },
  filled_form:        { icon: '✏', label: 'Filled form fields' },
  answered_question:  { icon: '◯', label: 'Answered question' },
  next_page:          { icon: '→', label: 'Clicked Continue / Next' },
  captcha_resolved:   { icon: '✓', label: 'CAPTCHA solved' },
  captcha_waiting:    { icon: '⏳', label: 'Waiting on CAPTCHA' },
  external_ats:       { icon: '↗', label: 'External ATS detected' },
  recovery_invoked:   { icon: '⚙', label: 'Recovery agent invoked' },
  recovery_aborted:   { icon: '✗', label: 'Recovery aborted' },
  login_wall:         { icon: '🔒', label: 'Login wall hit' },
  form_analyzed:      { icon: '🔍', label: 'Form analyzed' },
  button_disabled:    { icon: '⛔', label: 'Submit button disabled' },
  company_apply_click:{ icon: '🏢', label: 'Clicked company apply' },
}
function actionInfo(a: string) {
  return ACTION_LABEL[a] || { icon: '·', label: a.replace(/_/g, ' ') }
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return '' }
}
const liveStepEl = ref<HTMLElement | null>(null)

// ─── Engine / Monitor tab ───
const engineTab = ref<'engine' | 'monitor' | 'orchestrator'>('engine')

// ─── Orchestrator tab state ───
interface OrchEpisode {
  id: string; application_id: string; domain: string | null; channel: string | null;
  sub_agent: string | null; episode_type: string; action: string | null; outcome: string | null;
  reasoning: string | null; vision_summary: string | null; confidence: number | null;
  created_at: string
}
interface OrchStateRow {
  application_id: string; channel: string; sub_agent: string | null; ats_type: string | null;
  current_step: string | null; step_name: string | null; step_attempts: number;
  last_url: string | null; last_decision: string | null; decision_conf: number | null; updated_at: string
}
const orchFirstTry = ref({ hits: 0, total: 0, rate: 0 })
const orchRecoveries = ref<OrchEpisode[]>([])
const orchActive = ref<OrchStateRow[]>([])
const orchRouting = ref<Record<string, number>>({})
const orchLoading = ref(false)
const orchLastFetch = ref<Date | null>(null)

// ─── SmartApply smoke test ───
const smokeUrl = ref('')
const smokeTitle = ref('')
const smokeCompany = ref('')
const smokeRunning = ref(false)
interface SmokeEpisode {
  episode_type: string; action: string | null; outcome: string | null;
  reasoning: string | null; vision_summary: string | null; domain: string | null;
  confidence: number | null; created_at: string
}
interface SmokeResult {
  application_id: string; status: string; detail: string; steps: number;
  final_url: string; duration_ms: number; episode_count: number;
  recovery_count: number; form_analyzed: boolean; routed: boolean;
  episodes: SmokeEpisode[]
  next_candidate?: { job_url: string; title: string | null; company: string | null } | null
}
const smokeResult = ref<SmokeResult | null>(null)
const smokeError = ref('')

interface SmokeCandidate {
  application_id: string; url: string; page_title: string | null; domain: string | null;
  episode_type: string; outcome: string | null; vision_summary: string | null;
  company: string | null; job_title: string | null; created_at: string
}
const smokeCandidates = ref<SmokeCandidate[]>([])
const smokePickerOpen = ref(false)
const smokeLoadingCandidates = ref(false)

async function loadSmokeCandidates() {
  smokeLoadingCandidates.value = true
  const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
  try {
    const r = await fetch(`${mcpUrl}/api/smartapply/candidates`, { signal: AbortSignal.timeout(6000) })
    if (r.ok) {
      const d = await r.json()
      smokeCandidates.value = d.candidates || []
      smokePickerOpen.value = true
    }
  } catch {} finally { smokeLoadingCandidates.value = false }
}

function pickSmokeCandidate(c: SmokeCandidate) {
  smokeUrl.value = c.url
  smokeTitle.value = c.job_title || ''
  smokeCompany.value = c.company || ''
  smokePickerOpen.value = false
  smokeError.value = ''
}

function useFreshCandidate() {
  const n = smokeResult.value?.next_candidate
  if (!n) return
  smokeUrl.value = n.job_url
  smokeTitle.value = n.title || ''
  smokeCompany.value = n.company || ''
  smokeResult.value = null
  smokeError.value = ''
}

async function runSmartApplySmoke() {
  if (!smokeUrl.value.trim()) { smokeError.value = 'URL required'; return }
  smokeError.value = ''
  smokeResult.value = null
  smokeRunning.value = true
  const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
  try {
    const r = await fetch(`${mcpUrl}/api/smartapply/smoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_url: smokeUrl.value.trim(), job_title: smokeTitle.value, company: smokeCompany.value }),
      signal: AbortSignal.timeout(260000),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }))
      smokeError.value = err.error || `HTTP ${r.status}`
      return
    }
    smokeResult.value = await r.json()
    await fetchOrchestratorDashboard()
  } catch (e) {
    smokeError.value = e instanceof Error ? e.message : 'Smoke test failed'
  } finally { smokeRunning.value = false }
}

function smokeStatusColor(s: string): string {
  if (s === 'applied' || s === 'already_applied') return 'text-green-300 bg-green-500/10 border-green-500/30'
  if (s === 'captcha') return 'text-amber-300 bg-amber-500/10 border-amber-500/30'
  if (s === 'external_ats') return 'text-blue-300 bg-blue-500/10 border-blue-500/30'
  if (s === 'no_apply_button') return 'text-orange-300 bg-orange-500/10 border-orange-500/30'
  return 'text-red-300 bg-red-500/10 border-red-500/30'
}

async function fetchOrchestratorDashboard() {
  const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
  orchLoading.value = true
  try {
    const r = await fetch(`${mcpUrl}/api/orchestrator/dashboard`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return
    const d = await r.json()
    orchFirstTry.value = d.first_try || { hits: 0, total: 0, rate: 0 }
    orchRecoveries.value = d.recent_recoveries || []
    orchActive.value = d.active_states || []
    orchRouting.value = d.routing_counts || {}
    orchLastFetch.value = new Date()
  } catch {} finally { orchLoading.value = false }
}

function episodeBadge(t: string): string {
  if (t === 'recovery_action') return 'text-amber-300 bg-amber-500/10 border-amber-500/30'
  if (t === 'form_analyzed') return 'text-indigo-300 bg-indigo-500/10 border-indigo-500/30'
  if (t === 'email_sent') return 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30'
  if (t === 'email_bounced') return 'text-red-300 bg-red-500/10 border-red-500/30'
  if (t === 'abort') return 'text-red-400 bg-red-500/20 border-red-500/40'
  return 'text-neural-400 bg-neural-700/50 border-neural-600/40'
}

function formatAgo(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
const monitorLogs = ref<Array<{ time: string; cls: string; icon: string; step: number | null; text: string }>>([])
const monitorStats = ref({ applied: 0, failed: 0, captcha: 0 })
const monitorConnected = ref(false)
const monitorEl = ref<HTMLElement | null>(null)
let monitorSSE: EventSource | null = null

function monitorNow() {
  return new Date().toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function handleMonitorEvent(d: Record<string, unknown>) {
  const node = (d.node as string) || ''
  // Mirror apply_step events into per-application timeline (powers accordion)
  if (node === 'apply_step') pushTimelineStep(d)
  if (node === 'apply_start') {
    monitorLogs.value.push({ time: monitorNow(), cls: 'start', icon: '▶', step: null, text: `START → ${d.job_title || 'job'} @ ${d.company || '?'}` })
  } else if (node === 'apply_step') {
    const act = (d.action as string) || ''
    if (act === 'clicked_apply') monitorLogs.value.push({ time: monitorNow(), cls: 'click', icon: '🖱', step: d.step as number, text: `Clicked "${d.button_text || 'Apply now'}"` })
    else if (act === 'filled_form') monitorLogs.value.push({ time: monitorNow(), cls: 'fill', icon: '✏', step: d.step as number, text: `Filled form — ${d.fields_filled ?? 0} fields` })
    else if (act === 'next_page') monitorLogs.value.push({ time: monitorNow(), cls: 'next', icon: '→', step: d.step as number, text: `Clicked "${d.button_text || 'Continue'}" → next page` })
    else monitorLogs.value.push({ time: monitorNow(), cls: 'info', icon: '○', step: d.step as number, text: act })
  } else if (node === 'apply_captcha') {
    monitorStats.value.captcha++
    monitorLogs.value.push({ time: monitorNow(), cls: 'captcha', icon: '⚠', step: (d.step as number) ?? null, text: 'CAPTCHA detected — solve manually in Edge' })
  } else if (node === 'apply_success') {
    monitorLogs.value.push({ time: monitorNow(), cls: 'success', icon: '✓', step: (d.step as number) ?? null, text: 'Application submitted!' })
  } else if (node === 'apply_complete') {
    const st = (d.status as string) || ''
    if (st === 'applied') { monitorStats.value.applied++; monitorLogs.value.push({ time: monitorNow(), cls: 'success', icon: '✓', step: null, text: `APPLIED — ${d.job_title || ''} @ ${d.company || ''}` }) }
    else if (st === 'captcha') { monitorStats.value.captcha++; monitorLogs.value.push({ time: monitorNow(), cls: 'captcha', icon: '⚠', step: null, text: `CAPTCHA — ${d.job_title || ''}` }) }
    else if (st === 'already_applied') { monitorLogs.value.push({ time: monitorNow(), cls: 'info', icon: '↩', step: null, text: `Already applied — ${d.job_title || ''}` }) }
    else { monitorStats.value.failed++; monitorLogs.value.push({ time: monitorNow(), cls: 'failed', icon: '✗', step: null, text: `FAILED — ${d.job_title || ''}` }) }
  } else if (node === 'pipeline_complete' || node === 'pipeline_error') {
    monitorLogs.value.push({ time: monitorNow(), cls: 'complete', icon: '■', step: null, text: (d.message as string) || 'Pipeline complete' })
  } else if (node === 'search_start') {
    monitorLogs.value.push({ time: monitorNow(), cls: 'search', icon: '⊙', step: null, text: `Searching Indeed: ${d.query || '…'}` })
  } else if (node === 'score_complete') {
    monitorLogs.value.push({ time: monitorNow(), cls: 'score', icon: '◈', step: null, text: `Scored ${d.count || '?'} jobs — best: ${d.best_score || '?'}` })
  } else if (node === 'pipeline_start') {
    monitorStats.value.applied = 0; monitorStats.value.failed = 0; monitorStats.value.captcha = 0
    monitorLogs.value.push({ time: monitorNow(), cls: 'start', icon: '🚀', step: null, text: d.message as string || 'Pipeline starting...' })
  } else if (node === 'browser_search') {
    monitorLogs.value.push({ time: monitorNow(), cls: 'search', icon: '🔍', step: null, text: d.message as string })
  } else if (node === 'score_filter') {
    monitorLogs.value.push({ time: monitorNow(), cls: 'score', icon: '◈', step: null, text: d.message as string })
  } else if (node === 'cover_letter') {
    monitorLogs.value.push({ time: monitorNow(), cls: 'info', icon: '✍', step: null, text: d.message as string })
  } else if (node === 'rate_limit') {
    monitorLogs.value.push({ time: monitorNow(), cls: 'info', icon: '⏳', step: null, text: d.message as string })
  } else if (d.message) {
    monitorLogs.value.push({ time: monitorNow(), cls: 'info', icon: '·', step: null, text: d.message as string })
  }
  nextTick(() => { if (monitorEl.value) monitorEl.value.scrollTop = monitorEl.value.scrollHeight })
}

function connectMonitorSSE() {
  if (monitorSSE) return
  const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
  monitorSSE = new EventSource(`${mcpUrl}/api/jobs/node-status/stream`)
  monitorSSE.onopen = () => {
    monitorConnected.value = true
    monitorLogs.value.push({ time: monitorNow(), cls: 'system', icon: '✓', step: null, text: 'SSE connected — waiting for pipeline events' })
  }
  monitorSSE.onmessage = (event) => {
    try { const d = JSON.parse(event.data); handleMonitorEvent(d.data || d) } catch { }
  }
  ;(monitorSSE as EventSource).addEventListener('node_status', (event: Event) => {
    try { const d = JSON.parse((event as MessageEvent).data); handleMonitorEvent(d.data || d) } catch { }
  })
  monitorSSE.onerror = () => { monitorConnected.value = false }
}

function switchEngineTab(tab: 'engine' | 'monitor' | 'orchestrator') {
  engineTab.value = tab
  if (tab === 'monitor') connectMonitorSSE()
  if (tab === 'orchestrator') fetchOrchestratorDashboard()
}

// ─── Relay Status ───
const relayStatus = ref<'checking' | 'ok' | 'offline'>('checking')
async function checkRelayStatus() {
  try {
    const r = await fetch('http://localhost:9223/health', { signal: AbortSignal.timeout(3000) })
    relayStatus.value = r.ok ? 'ok' : 'offline'
  } catch {
    relayStatus.value = 'offline'
  }
}

const indeedSession = ref<'checking' | 'ok' | 'dead' | 'no_cdp' | 'unknown'>('unknown')
const indeedSessionDetail = ref('')
const signinOpening = ref(false)
const cdpLaunching = ref(false)
async function checkIndeedSession() {
  indeedSession.value = 'checking'
  indeedSessionDetail.value = ''
  try {
    const r = await fetch('http://localhost:9223/browser/indeed-session', { signal: AbortSignal.timeout(25000) })
    const d = await r.json().catch(() => ({}))
    if (d.signed_in) { indeedSession.value = 'ok'; return }
    // CDP not enabled on Edge → distinct state requiring CDP launch, not sign-in
    const err = String(d.error || '')
    if (/CDP port 9222 is not enabled|Edge is not running with CDP/i.test(err)) {
      indeedSession.value = 'no_cdp'
      indeedSessionDetail.value = err
    } else {
      indeedSession.value = 'dead'
      indeedSessionDetail.value = d.reason || err || ''
    }
  } catch (e) {
    indeedSession.value = 'unknown'
    indeedSessionDetail.value = e instanceof Error ? e.message : String(e)
  }
}
async function openIndeedSignin() {
  signinOpening.value = true
  try {
    await fetch('http://localhost:9223/browser/indeed-signin', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
    })
    setTimeout(() => { checkIndeedSession() }, 1500)
  } catch { /* noop */ } finally {
    signinOpening.value = false
  }
}
async function launchEdgeCdp() {
  cdpLaunching.value = true
  try {
    const r = await fetch('http://localhost:9223/browser/launch-cdp', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) {
      indeedSessionDetail.value = d.message || d.error || 'Failed to launch Edge — close Edge manually first, then retry'
    }
    setTimeout(() => { checkIndeedSession() }, 3000)
  } catch (e) {
    indeedSessionDetail.value = e instanceof Error ? e.message : String(e)
  } finally {
    cdpLaunching.value = false
  }
}

async function forceRelaunchEdgeCdp() {
  const ok = confirm('This will FORCE-CLOSE all Edge windows and relaunch with CDP + Profile 7 session restore. Any unsaved tabs will be lost (Edge restores history on relaunch). Proceed?')
  if (!ok) return
  cdpLaunching.value = true
  indeedSessionDetail.value = 'Force-closing Edge and relaunching with CDP…'
  try {
    const r = await fetch('http://localhost:9223/browser/force-relaunch-cdp', {
      method: 'POST',
      signal: AbortSignal.timeout(60000),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) {
      indeedSessionDetail.value = d.message || d.error || 'Force-relaunch failed'
    } else {
      indeedSessionDetail.value = `Relaunched (CDP ready in ${d.seconds_to_ready || '?'}s)`
    }
    setTimeout(() => { checkIndeedSession() }, 2500)
  } catch (e) {
    indeedSessionDetail.value = e instanceof Error ? e.message : String(e)
  } finally {
    cdpLaunching.value = false
  }
}

async function startPipeline() {
  // Delegate to triggerN8nWorkflow with the full target count
  await triggerN8nWorkflow(applyEngineTarget.value)
}

const n8nTriggering = ref(false)

function finishN8nRun() {
  applyEngineRunning.value = false
  n8nTriggering.value = false
  if (applyEngineSSE) { applyEngineSSE.close(); applyEngineSSE = null }
  if (applyEngineTimer) { clearTimeout(applyEngineTimer); applyEngineTimer = null }
  admin.fetchJobApplications?.()
}


function pushLive(icon: string, text: string, cls = 'info', step: number | null = null) {
  liveSteps.value.push({ step: step as number, action: cls, text: `${icon} ${text}`, time: new Date().toLocaleTimeString() })
  nextTick(() => { if (liveStepEl.value) liveStepEl.value.scrollTop = liveStepEl.value.scrollHeight })
}

function handleSSEData(d: Record<string, unknown>) {
  handleMonitorEvent(d)
  const node = (d.node as string) || ''
  const msg = (d.message as string) || ''

  // ── Pipeline-phase events → show inline in Engine tab ──
  if (node === 'pipeline_start') {
    liveSteps.value = []  // clear on new run
    pushLive('🚀', msg || 'Pipeline starting...', 'start')
  }
  else if (node === 'browser_search') pushLive('🔍', msg, 'search')
  else if (node === 'score_filter')   pushLive('◈', msg, 'score')
  else if (node === 'cover_letter')   pushLive('✍', msg, 'info')
  else if (node === 'recruiter')      pushLive('🔎', msg, 'info')
  else if (node === 'classify_done')  pushLive('✓', msg, 'score')
  else if (node === 'rate_limit')     pushLive('⏳', msg, 'info')
  else if (node === 'apply_start') {
    currentApplyJob.value = `${d.job_title || ''}${d.company ? ' @ ' + d.company : ''}`
    applyEngineMsg.value = `Applying: ${currentApplyJob.value}`
    pushLive('▶', `Applying: ${currentApplyJob.value}`, 'start')
  }
  else if (node === 'apply_step') {
    pushTimelineStep(d)
    const label = d.action === 'clicked_apply'
      ? `Clicked "${d.button_text || 'Apply now'}"`
      : d.action === 'next_page'
        ? `Clicked "${d.button_text || 'Continue'}" → next page`
        : d.action === 'answered_question'
          ? `Answered: "${(d.question_text as string || '').slice(0, 40)}" → "${(d.answer as string || '').slice(0, 30)}"`
          : `Filled form (${(d.fields_filled as number) ?? 0} fields)`
    pushLive('', label, d.action as string, d.step as number)
  }
  else if (node === 'apply_captcha') {
    if (d.action === 'captcha_blocked') pushLive('⚠', 'CAPTCHA detected — solving...', 'captcha', d.step as number)
    else if (d.action === 'captcha_timeout') pushLive('✗', 'CAPTCHA timeout — abandoned', 'captcha', d.step as number)
  }
  else if (node === 'apply_success') pushLive('✓', 'Application submitted!', 'success', d.step as number)
  else if (node === 'apply_complete') {
    const st = (d.status as string) || ''
    pushLive(st === 'applied' ? '✅' : '✗', `${st.toUpperCase()} — ${d.job_title || ''} @ ${d.company || ''}`, st === 'applied' ? 'success' : 'failed')
  }
  else if (node === 'pipeline_complete' || node === 'pipeline_error') {
    pushLive('■', msg || 'Pipeline complete', 'complete')
  }
  else if (msg && !['apply_start', 'apply_step', 'apply_captcha', 'apply_success', 'apply_complete'].includes(node)) {
    pushLive('·', msg, 'info')
  }

  if (msg && node !== 'pipeline_start') applyEngineMsg.value = msg

  if (d.node === 'apply_complete') {
    const st = (d.status as string) || 'applied'
    const finalSt = ['applied', 'captcha', 'already_applied'].includes(st) ? st : 'failed'
    // Update existing applying row if found
    const existing = applyEngineResults.value.find(r =>
      r.title === (d.job_title as string) && r.company === (d.company as string)
    )
    if (existing) {
      existing.status = finalSt
      existing.detail = (d.detail as string) || st
    } else {
      applyEngineResults.value.push({
        title: (d.job_title as string) || '',
        company: (d.company as string) || '',
        status: finalSt,
        detail: (d.detail as string) || st,
      })
    }
    applyEngineIdx.value = applyEngineResults.value.filter(r => r.status !== 'applying').length
  }

  if (d.node === 'pipeline_complete' || d.node === 'pipeline_error') {
    applyEngineMsg.value = (d.message as string) || 'Pipeline complete'
    finishN8nRun()
  }
  // Jobs found by pipeline (pre-inserted into DB as "applying")
  if (d.node === 'job_found') {
    const already = applyEngineResults.value.find(r => r.title === d.job_title && r.company === d.company)
    if (!already) {
      applyEngineResults.value.push({
        title: (d.job_title as string) || '',
        company: (d.company as string) || '',
        status: 'applying',
        detail: `Score: ${d.match_score || '?'} · ${d.location || 'Remote'}`,
      })
    }
    // Refresh table immediately so new row appears
    admin.fetchJobApplications?.()
  }
  // Refresh table after each job completes
  if (d.node === 'refresh_applications') {
    admin.fetchJobApplications?.()
  }
  // Also catch universal_apply broadcast
  if (d.type === 'apply_result' || d.type === 'apply_start') {
    const st = (d.status as string) || 'applied'
    if (d.type === 'apply_start') {
      liveSteps.value = []
      currentApplyJob.value = `${d.job_title || ''}${d.company ? ' @ ' + d.company : ''}`
      applyEngineMsg.value = `Applying: ${currentApplyJob.value}`
    }
    if (d.type === 'apply_result') {
      applyEngineResults.value.push({
        title: (d.job_title as string) || '',
        company: (d.company as string) || '',
        status: ['applied', 'captcha', 'already_applied'].includes(st) ? st : 'failed',
        detail: (d.detail as string) || st,
      })
      applyEngineIdx.value = applyEngineResults.value.length
      applyEngineMsg.value = `${st === 'applied' ? '✓ Applied' : '✗ ' + st}: ${d.job_title}`
    }
  }
}

function connectSSE() {
  if (applyEngineSSE) applyEngineSSE.close()
  const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
  applyEngineSSE = new EventSource(`${mcpUrl}/api/notifications/stream`)

  // Listen to ALL named events from the server
  const eventTypes = ['node_status', 'apply', 'apply_start', 'apply_result', 'apply_error', 'pipeline_complete', 'pipeline_error', 'message', 'job_found', 'refresh_applications']
  for (const evType of eventTypes) {
    applyEngineSSE.addEventListener(evType, (event: MessageEvent) => {
      try { handleSSEData(JSON.parse(event.data)) } catch { /* ignore */ }
    })
  }
  // Fallback unnamed events
  applyEngineSSE.onmessage = (event: MessageEvent) => {
    try { handleSSEData(JSON.parse(event.data)) } catch { /* ignore */ }
  }
  applyEngineSSE.onerror = () => { /* auto-reconnects */ }
}

async function triggerN8nWorkflow(target = 1) {
  const platform = applyEnginePlatform.value
  const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1)

  n8nTriggering.value = true
  applyEngineMsg.value = `${platformLabel}: searching → scoring → AI decision → apply...`
  applyEngineRunning.value = true
  applyEngineResults.value = []
  applyEngineIdx.value = 0
  applyEngineTotal.value = target
  liveSteps.value = []
  currentApplyJob.value = ''

  connectSSE()

  // 5-minute safety timeout
  applyEngineTimer = setTimeout(() => {
    if (applyEngineRunning.value) {
      applyEngineMsg.value = 'Pipeline timeout — check n8n for results'
      finishN8nRun()
    }
  }, 5 * 60 * 1000)

  const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
  // Honor the Match dropdown as-is. Any (0) = any job close to profession.
  const effectiveMinScore = applyEngineMinScore.value
  const payload = {
    platform,
    target,
    min_score: effectiveMinScore,
    freshness_days: applyEngineFreshness.value,
  }

  try {
    const res = await fetch(`${mcpUrl}/api/jobs/platform/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    })
    n8nTriggering.value = false
    if (res.ok) {
      const floorNote = effectiveMinScore > 0 ? ` · min match ≥${effectiveMinScore}` : ' · min match Any'
      applyEngineMsg.value = `[${platformLabel.toUpperCase()}] Pipeline started${floorNote} — scraping jobs, watch monitor for live steps...`
    } else {
      applyEngineMsg.value = `Failed to start pipeline: ${res.status}`
      finishN8nRun()
    }
  } catch (e) {
    applyEngineMsg.value = `Failed to start: ${e instanceof Error ? e.message : e}`
    finishN8nRun()
  }
}

async function stopPipeline() {
  const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
  await fetch(`${mcpUrl}/api/jobs/indeed/auto-pipeline/stop`, { method: 'POST' }).catch(() => {})
  applyEngineRunning.value = false
  applyEngineMsg.value = 'Pipeline stopped'
  if (applyEngineSSE) { applyEngineSSE.close(); applyEngineSSE = null }
}

function getJobRawData(app: JobApplication): Record<string, unknown> {
  const job = getJob(app.job_listing_id)
  return (job?.raw_data as Record<string, unknown>) || {}
}

async function handlePasteApply(forceApply = false) {
  const url = pasteUrl.value.trim()
  if (!url) return

  pasteProcessing.value = true
  pasteError.value = ''
  pasteDuplicate.value = null
  pasteStep.value = 'checking'
  pasteStatus.value = 'Step 1/6: Checking for duplicates...'

  const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'

  try {
    // ══ Step 1: Dedup check ══
    if (!forceApply) {
      const dupRes = await fetch(`${mcpUrl}/api/jobs/check-duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: url, company: url, url }),
        signal: AbortSignal.timeout(10000),
      })
      if (dupRes.ok) {
        const dupData = await dupRes.json()
        if (dupData.exists) {
          pasteDuplicate.value = dupData
          pasteStep.value = 'duplicate'
          pasteProcessing.value = false
          return
        }
      }
    }

    // ══ Step 2: Fetch & research job page ══
    pasteStep.value = 'analyzing'
    pasteStatus.value = 'Step 2/6: Fetching job page & extracting details...'

    const ingestRes = await fetch(`${mcpUrl}/api/jobs/alerts/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alerts: [{ title: 'Auto-detect', company: 'Auto-detect', url, source: 'manual_paste' }],
      }),
      signal: AbortSignal.timeout(60000),
    })

    if (!ingestRes.ok) { pasteError.value = 'Failed to fetch job page'; pasteProcessing.value = false; return }

    const ingestData = await ingestRes.json()
    const result = ingestData.results?.[0]

    if (result?.status === 'duplicate' && !forceApply) {
      pasteDuplicate.value = { exists: true, job_id: result.job_id, match_type: 'title_company', existing_status: 'exists' }
      pasteStep.value = 'duplicate'
      pasteProcessing.value = false
      return
    }

    const jobId = result?.job_id || (pasteDuplicate.value as any)?.job_id
    if (!jobId) { pasteError.value = result?.detail || 'Failed to create job record'; pasteProcessing.value = false; return }

    // ══ Step 3: AI Score & Classify ══
    pasteStatus.value = 'Step 3/6: AI scoring & classifying job...'

    try {
      const fillRes = await fetch(`${mcpUrl}/api/jobs/fill-details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs: [{ id: jobId }] }),
        signal: AbortSignal.timeout(60000),
      })
      if (fillRes.ok) {
        const fillData = await fillRes.json()
        const scored = fillData.results?.[0]
        if (scored?.data?.match_score) {
          pasteStatus.value = `Step 3/6: Scored ${scored.data.match_score}% match | ${scored.data.role_type || '?'} | ${scored.data.work_arrangement || '?'}`
        }
      }
    } catch { /* scoring optional */ }

    // ══ Step 4: Generate tailored cover letter ══
    pasteStatus.value = 'Step 4/6: Generating Problem-Solution cover letter...'

    // Fetch the job we just created to get its description
    let jobData: Record<string, unknown> | null = null
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data } = await supabase.from('job_listings').select('*').eq('id', jobId).single()
      jobData = data as unknown as Record<string, unknown>
    } catch { /* skip */ }

    if (jobData) {
      const rd = (jobData.raw_data || {}) as Record<string, unknown>
      if (!rd.cover_letter) {
        try {
          const clRes = await fetch(`${mcpUrl}/api/jobs/cover-letter`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: jobData.title,
              company: jobData.company,
              description: jobData.description,
            }),
            signal: AbortSignal.timeout(45000),
          })
          if (clRes.ok) {
            const clData = await clRes.json()
            if (clData.cover_letter) {
              // Save cover letter to job listing
              const { supabase } = await import('@/lib/supabase')
              await (supabase.from('job_listings') as any).update({
                raw_data: { ...rd, cover_letter: clData.cover_letter },
              }).eq('id', jobId)
              pasteStatus.value = `Step 4/6: Cover letter generated (${clData.cover_letter.length} chars)`
            }
          }
        } catch { /* cover letter optional */ }
      } else {
        pasteStatus.value = 'Step 4/6: Cover letter already exists'
      }
    }

    // ══ Step 5: Detect channels & build strategy ══
    pasteStep.value = 'applying'
    pasteStatus.value = 'Step 5/6: Detecting application channels & building strategy...'
    await new Promise(r => setTimeout(r, 500))

    // ══ Step 6: Apply via all available channels ══
    pasteStatus.value = 'Step 6/6: Applying via all available channels...'

    const orchRes = await fetch(`${mcpUrl}/api/jobs/multi-orchestrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_ids: [jobId] }),
      signal: AbortSignal.timeout(120000),
    })

    if (orchRes.ok) {
      const orchData = await orchRes.json()
      const orchResult = orchData.results?.[0]
      const channelCount = orchResult?.channels?.length || 0
      const emailApplied = orchData.summary?.email_applied || 0
      const browserPending = orchData.summary?.browser_pending || 0
      const scheduled = orchData.summary?.scheduled || 0

      pasteStep.value = 'done'
      pasteStatus.value = `Pipeline complete! Strategy: ${orchResult?.strategy_type || 'auto'} | ${channelCount} channel${channelCount !== 1 ? 's' : ''} (${emailApplied} email sent${browserPending ? `, ${browserPending} browser queued` : ''}${scheduled ? `, ${scheduled} scheduled` : ''})`

      // Refresh all data
      await Promise.all([admin.fetchJobApplications(), admin.fetchJobListings()])

      // Load channel executions for the new application
      for (const app of admin.jobApplications) {
        if (app.job_listing_id === jobId) {
          fetchChannelExecutions(app.id)
          // Auto-open the detail modal for the new application
          setTimeout(() => openDetail(app), 500)
        }
      }

      pasteUrl.value = ''
    } else {
      pasteStatus.value = 'Job saved & scored but apply failed. Click AI Check Status to retry.'
    }
  } catch (e) {
    pasteError.value = `Error: ${e instanceof Error ? e.message : e}`
  }

  pasteProcessing.value = false
}

function handleForceReApply() {
  pasteDuplicate.value = null
  pasteError.value = ''
  handlePasteApply(true)
}

function viewDuplicateJob() {
  if (!pasteDuplicate.value?.job_id) return
  // Find the application for this job and open its detail
  const app = admin.jobApplications.find(a => a.job_listing_id === pasteDuplicate.value?.job_id)
  if (app) {
    openDetail(app)
  } else {
    // Job exists but no application — could open the job in Jobs tab
    window.open(`/admin/jobs?search=${pasteDuplicate.value.job_id}`, '_blank')
  }
  pasteDuplicate.value = null
}

async function refreshChannelExec(appId: string) {
  delete channelExecutions.value[appId]
  await fetchChannelExecutions(appId)
}

async function aiCheckStatus(app: JobApplication) {
  aiCheckingStatus.value = true
  const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
  const job = getJob(app.job_listing_id)
  const rd = getJobRawData(app)
  const results: string[] = []

  try {
    // Step 1: Re-score the job if no match score
    if (job && (!job.match_score || job.match_score === 0)) {
      results.push('Rescoring job match...')
      try {
        const res = await fetch(`${mcpUrl}/api/jobs/fill-details`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobs: [{ id: job.id, title: job.title, company: job.company, description: job.description, location: job.location, url: job.url }] }),
          signal: AbortSignal.timeout(60000),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.results?.[0]?.data?.match_score) {
            const score = data.results[0].data
            await admin.updateRow('job_listings', job.id, {
              match_score: score.match_score,
              raw_data: { ...rd, ...score },
            })
            results.push(`Match score: ${score.match_score}%`)
          }
        }
      } catch { results.push('Score: skipped (AI unavailable)') }
    } else {
      results.push(`Match score: ${job?.match_score || '?'}% (already scored)`)
    }

    // Step 2: Generate cover letter if missing
    if (!app.cover_letter && !rd.cover_letter) {
      results.push('Generating cover letter...')
      try {
        const res = await fetch(`${mcpUrl}/api/jobs/cover-letter`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: job?.title, company: job?.company, description: job?.description }),
          signal: AbortSignal.timeout(30000),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.cover_letter) {
            await admin.updateRow('job_applications', app.id, { cover_letter: data.cover_letter })
            if (job) await admin.updateRow('job_listings', job.id, { raw_data: { ...rd, cover_letter: data.cover_letter } })
            results.push(`Cover letter: generated (${data.cover_letter.length} chars)`)
          }
        }
      } catch { results.push('Cover letter: skipped') }
    } else {
      results.push('Cover letter: exists')
    }

    // Step 3: Refresh channel executions
    results.push('Checking channels...')
    await refreshChannelExec(app.id)
    const channels = channelExecutions.value[app.id] || []
    results.push(`Channels: ${channels.length} (${channels.filter(c => c.status === 'applied').length} applied)`)

    // Step 4: Run nurture check
    results.push('Running nurture analysis...')
    const nurtureRes = await fetch(`${mcpUrl}/api/jobs/nurture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applications: [{
          id: app.id, status: app.status, created_at: app.created_at,
          follow_up_at: app.follow_up_at, job_title: job?.title || '', company: job?.company || '',
          interview_dates: app.interview_dates,
        }],
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (nurtureRes.ok) {
      const nurtureData = await nurtureRes.json()
      if (nurtureData.actions?.length) {
        for (const action of nurtureData.actions) {
          results.push(`Action: ${action.action.replace(/_/g, ' ')} — ${action.reason}`)
          if (action.follow_up_date) {
            await admin.updateRow('job_applications', app.id, { follow_up_at: action.follow_up_date })
          }
          if (action.suggested_status) {
            await admin.updateRow('job_applications', app.id, { status: action.suggested_status })
          }
        }
      } else {
        results.push('Nurture: Application on track, no actions needed')
      }
    }

    // Refresh all data
    await Promise.all([admin.fetchJobApplications(), admin.fetchJobListings()])

    alert(`AI Agent Check Complete for ${job?.title}:\n\n${results.join('\n')}`)
  } catch (e) {
    alert(`AI Check Error: ${e}`)
  }

  aiCheckingStatus.value = false
}

async function aiCheckAllStatuses() {
  aiCheckingAll.value = true
  aiCheckProgress.value = 'Checking all applications...'
  try {
    const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
    const appsToCheck = admin.jobApplications
      .filter(a => ['applied', 'delivery_pending', 'delivery_confirmed', 'under_review', 'phone_screen', 'endorsed', 'applying'].includes(a.status))
      .map(a => {
        const job = getJob(a.job_listing_id)
        return {
          id: a.id, status: a.status, created_at: a.created_at,
          follow_up_at: a.follow_up_at, job_title: job?.title || '', company: job?.company || '',
          interview_dates: a.interview_dates,
        }
      })

    aiCheckProgress.value = `Checking ${appsToCheck.length} active applications...`

    const res = await fetch(`${mcpUrl}/api/jobs/nurture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applications: appsToCheck }),
      signal: AbortSignal.timeout(60000),
    })

    if (res.ok) {
      const data = await res.json()
      aiCheckProgress.value = `Found ${data.total} actions needed across ${data.checked} applications`

      // Auto-apply follow-up dates
      for (const action of data.actions || []) {
        if (action.follow_up_date) {
          await admin.updateRow('job_applications', action.id, { follow_up_at: action.follow_up_date })
        }
        if (action.suggested_status) {
          await admin.updateRow('job_applications', action.id, { status: action.suggested_status })
        }
      }
      await admin.fetchJobApplications()
    }
  } catch { aiCheckProgress.value = 'Check failed' }
  aiCheckingAll.value = false
}

onMounted(async () => {
  checkRelayStatus()
  // NOTE: We deliberately don't auto-check Indeed session on mount — that
  // navigates the user's Edge tab to secure.indeed.com/account/view which
  // is intrusive. Session gets checked lazily during pipeline preflight,
  // or when user clicks the Recheck button in the banner.
  // Fetch all data — job_listings includes applied ones (needed for detail modal)
  await Promise.all([admin.fetchJobApplications(), admin.fetchJobListings()])
  // Load channel executions for visible applications
  for (const app of paginated.value) {
    fetchChannelExecutions(app.id)
  }
})

const filtered = computed(() => {
  let apps = [...admin.jobApplications]
  if (filterStatus.value) apps = apps.filter(a => a.status === filterStatus.value)
  if (filterChannel.value) apps = apps.filter(a => a.channel === filterChannel.value)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    apps = apps.filter(a => {
      const job = getJob(a.job_listing_id)
      return job?.title.toLowerCase().includes(q) || job?.company.toLowerCase().includes(q) || a.notes?.toLowerCase().includes(q)
    })
  }
  return apps.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
})

const totalPages = computed(() => Math.ceil(filtered.value.length / perPage))
const paginated = computed(() => filtered.value.slice((currentPage.value - 1) * perPage, currentPage.value * perPage))

function getJob(id: string) { return admin.jobListings.find(j => j.id === id) }

function getStatusInfo(s: string) {
  for (const p of PIPELINE) { if (p.statuses.includes(s)) return p }
  return PIPELINE[0]
}

function getStageIndex(s: string): number {
  for (let i = 0; i < PIPELINE.length; i++) { if (PIPELINE[i].statuses.includes(s)) return i }
  return 0
}

// Pipeline progress for a single application
function pipelineProgress(app: JobApplication) {
  const stageIdx = getStageIndex(app.status)
  return PIPELINE.map((stage, idx) => ({
    ...stage,
    active: idx === stageIdx,
    completed: idx < stageIdx,
    future: idx > stageIdx,
  }))
}

function daysSince(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / 86400000) }

function openEdit(app: JobApplication) {
  editApp.value = app
  editForm.value = {
    status: app.status, channel: app.channel, agency_name: app.agency_name || '',
    notes: app.notes || '', salary_offered: app.salary_offered ? String(app.salary_offered) : '',
    follow_up_at: app.follow_up_at ? app.follow_up_at.split('T')[0] : '',
  }
  showEdit.value = true
}

async function openDetail(app: JobApplication) {
  detailApp.value = app
  detailTab.value = 'pipeline'
  showDetail.value = true

  // Fetch channel executions
  fetchChannelExecutions(app.id)

  // If the job listing isn't loaded (applied jobs hidden from search), fetch it directly
  if (app.job_listing_id && !getJob(app.job_listing_id)) {
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data } = await supabase.from('job_listings').select('*').eq('id', app.job_listing_id).single()
      if (data) {
        // Add to the listings array so getJob() works
        const existing = admin.jobListings.findIndex(j => j.id === (data as any).id)
        if (existing >= 0) admin.jobListings[existing] = data as any
        else admin.jobListings.push(data as any)
      }
    } catch { /* skip */ }
  }
}

async function saveEdit() {
  if (!editApp.value) return
  await admin.updateRow('job_applications', editApp.value.id, {
    status: editForm.value.status, channel: editForm.value.channel,
    agency_name: editForm.value.agency_name || null, notes: editForm.value.notes || null,
    salary_offered: editForm.value.salary_offered ? Number(editForm.value.salary_offered) : null,
    follow_up_at: editForm.value.follow_up_at || null,
  })
  showEdit.value = false; await admin.fetchJobApplications()
}

const deletingId = ref<string | null>(null)
const FAILED_STATUSES = ['apply_failed', 'applying', 'failed', 'error']

function removeFromLocal(ids: string[]) {
  const set = new Set(ids)
  admin.jobApplications = admin.jobApplications.filter(a => !set.has(a.id))
}

async function deleteApp(app: JobApplication) {
  deletingId.value = app.id
  removeFromLocal([app.id])
  admin.deleteRow('job_applications', app.id).catch(() => {})
  deletingId.value = null
}

// ─── Bulk Delete ───
const selectedIds = ref<Set<string>>(new Set())
const bulkDeleting = ref(false)

function toggleSelect(id: string) {
  const s = new Set(selectedIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selectedIds.value = s
}

function selectAllFailed() {
  const failedIds = admin.jobApplications.filter(a => FAILED_STATUSES.includes(a.status)).map(a => a.id)
  selectedIds.value = new Set(failedIds)
}

function clearSelection() { selectedIds.value = new Set() }

async function bulkDelete() {
  if (!selectedIds.value.size) return
  const ids = [...selectedIds.value]
  selectedIds.value = new Set()
  removeFromLocal(ids)
  bulkDeleting.value = true
  for (const id of ids) admin.deleteRow('job_applications', id).catch(() => {})
  bulkDeleting.value = false
}

async function clearAllFailed() {
  const failedIds = admin.jobApplications.filter(a => FAILED_STATUSES.includes(a.status)).map(a => a.id)
  if (!failedIds.length) return
  removeFromLocal(failedIds)
  bulkDeleting.value = true
  for (const id of failedIds) admin.deleteRow('job_applications', id).catch(() => {})
  bulkDeleting.value = false
}
</script>

<template>
  <div>
    <!-- Stage Summary Cards -->
    <div class="flex gap-2 mb-5 overflow-x-auto pb-1">
      <button v-for="p in PIPELINE" :key="p.group" @click="filterStatus = filterStatus === p.statuses[0] ? '' : p.statuses[0]"
        class="glass-dark rounded-lg px-3 py-2 border min-w-[90px] shrink-0 cursor-pointer transition-colors text-center"
        :class="filterStatus && p.statuses.includes(filterStatus) ? 'border-cyber-purple/40' : 'border-neural-700/30 hover:border-neural-600'">
        <p class="text-[9px] text-gray-500 uppercase">{{ p.group }}</p>
        <p class="text-lg font-bold" :class="p.text">{{ admin.jobApplications.filter(a => p.statuses.includes(a.status)).length }}</p>
      </button>
    </div>

    <!-- Filters -->
    <div class="flex gap-3 mb-4 items-center">
      <div class="flex-1 relative">
        <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input v-model="searchQuery" @input="currentPage = 1" placeholder="Search by job title, company..."
          class="w-full pl-10 pr-4 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm placeholder-gray-500 focus:border-cyber-purple focus:outline-none" />
      </div>
      <select v-model="filterChannel" @change="currentPage = 1" class="px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none">
        <option value="">All Channels</option>
        <option value="direct">Direct</option><option value="agency">Agency</option><option value="freelance">Freelance</option>
      </select>
      <select v-model="filterStatus" @change="currentPage = 1" class="px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none">
        <option value="">All Statuses</option>
        <optgroup v-for="p in PIPELINE" :key="p.group" :label="p.group">
          <option v-for="s in p.statuses" :key="s" :value="s">{{ s.replace(/_/g, ' ') }}</option>
        </optgroup>
      </select>
      <span class="text-[10px] text-gray-500 shrink-0">{{ filtered.length }} apps</span>
      <!-- Bulk delete controls -->
      <div class="flex items-center gap-1 shrink-0">
        <button v-if="selectedIds.size > 0" @click="bulkDelete" :disabled="bulkDeleting"
          class="px-3 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-[10px] font-medium hover:bg-red-500/30 disabled:opacity-50 flex items-center gap-1">
          🗑 Delete {{ selectedIds.size }}
        </button>
        <button v-if="selectedIds.size > 0" @click="clearSelection"
          class="px-2 py-2 text-gray-500 hover:text-gray-300 text-[10px]">✕</button>
        <button @click="selectAllFailed" :disabled="bulkDeleting"
          class="px-3 py-2 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg text-[10px] hover:bg-red-500/20 disabled:opacity-50">
          Select Failed
        </button>
        <button @click="clearAllFailed" :disabled="bulkDeleting"
          class="px-3 py-2 bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg text-[10px] font-medium hover:bg-red-600/30 disabled:opacity-50 flex items-center gap-1">
          {{ bulkDeleting ? '...' : '🗑 Clear All Failed' }}
        </button>
      </div>
      <button @click="aiCheckAllStatuses" :disabled="aiCheckingAll"
        class="px-3 py-2 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-lg text-[10px] font-medium hover:bg-amber-500/25 disabled:opacity-50 shrink-0 flex items-center gap-1">
        <span>🧠</span>
        {{ aiCheckingAll ? aiCheckProgress : 'AI Check All' }}
      </button>
    </div>

    <!-- Quick Apply from URL -->
    <div class="mb-4 p-4 bg-neural-800/50 border border-cyber-cyan/20 rounded-xl">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">🔗</span>
        <span class="text-xs font-semibold text-cyber-cyan uppercase tracking-wider">Quick Apply from URL</span>
        <span class="text-[9px] text-gray-500">Paste a job link — AI analyzes, scores, generates cover letter, and applies</span>
      </div>
      <div class="flex gap-2">
        <input v-model="pasteUrl" type="url" placeholder="https://indeed.com/viewjob?jk=... or any job listing URL"
          :disabled="pasteProcessing" @keydown.enter="() => handlePasteApply()"
          class="flex-1 px-3 py-2.5 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-cyan focus:outline-none placeholder-gray-500 disabled:opacity-50" />
        <button @click="() => handlePasteApply()" :disabled="pasteProcessing || !pasteUrl.trim()"
          class="px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-40 flex items-center gap-2 whitespace-nowrap bg-gradient-to-r from-cyber-cyan to-cyber-purple">
          <svg v-if="pasteProcessing" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          {{ pasteProcessing ? 'Processing...' : pasteStep === 'done' ? 'Applied!' : 'Analyze & Apply' }}
        </button>
      </div>
      <!-- Step progress -->
      <div v-if="pasteProcessing || pasteStep === 'done'" class="mt-3">
        <div class="flex items-center gap-2 mb-2">
          <div v-for="(s, i) in [{id:'checking',label:'Dedup'},{id:'analyzing',label:'Research'},{id:'scoring' as any,label:'Score'},{id:'cover' as any,label:'Cover Letter'},{id:'applying',label:'Channels'},{id:'done',label:'Applied'}]" :key="s.id"
            class="flex items-center gap-1">
            <span class="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold transition-all"
              :class="pasteStep === s.id ? 'bg-cyber-cyan text-black animate-pulse' : ['checking','analyzing','scoring','cover','applying','done'].indexOf(s.id) < ['checking','analyzing','scoring','cover','applying','done'].indexOf(pasteStep) ? 'bg-green-500 text-white' : 'bg-neural-700 text-gray-600'">
              {{ ['checking','analyzing','scoring','cover','applying','done'].indexOf(s.id) < ['checking','analyzing','scoring','cover','applying','done'].indexOf(pasteStep) ? '✓' : i + 1 }}
            </span>
            <span class="text-[9px]" :class="pasteStep === s.id ? 'text-cyber-cyan font-medium' : ['checking','analyzing','scoring','cover','applying','done'].indexOf(s.id) < ['checking','analyzing','scoring','cover','applying','done'].indexOf(pasteStep) ? 'text-green-400' : 'text-gray-600'">{{ s.label }}</span>
            <span v-if="i < 5" class="text-gray-700 text-[8px]">→</span>
          </div>
        </div>
        <p v-if="pasteProcessing" class="text-xs text-cyber-cyan animate-pulse">{{ pasteStatus }}</p>
      </div>
      <!-- Success -->
      <p v-if="pasteStep === 'done' && !pasteProcessing" class="mt-2 text-xs text-green-400">{{ pasteStatus }}</p>
      <!-- Error -->
      <p v-if="pasteError" class="mt-2 text-xs text-red-400">{{ pasteError }}</p>
      <!-- Duplicate detected -->
      <div v-if="pasteStep === 'duplicate' && pasteDuplicate" class="mt-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
        <p class="text-xs text-amber-400 font-medium mb-2">
          Duplicate detected: {{ pasteDuplicate.match_type?.replace(/_/g, ' ') }}.
          {{ pasteDuplicate.existing_status === 'applied' ? 'This job has already been applied to.' : 'This job already exists in your database.' }}
        </p>
        <div class="flex gap-2">
          <button @click="handleForceReApply"
            class="px-4 py-2 rounded-lg text-xs font-medium text-white bg-gradient-to-r from-amber-500 to-red-500 hover:opacity-90">
            Re-Apply Anyway
          </button>
          <button @click="viewDuplicateJob"
            class="px-4 py-2 rounded-lg text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20">
            View Existing Application
          </button>
          <button @click="pasteDuplicate = null; pasteStep = 'idle'"
            class="px-4 py-2 rounded-lg text-xs font-medium text-gray-400 bg-neural-700 hover:bg-neural-600">
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Indeed Auto-Apply Engine -->
    <div class="mb-4 p-4 bg-neural-800/50 border border-cyber-purple/20 rounded-xl">
      <!-- Header row -->
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <span class="text-lg">🚀</span>
          <span class="text-xs font-semibold text-cyber-purple uppercase tracking-wider">Auto-Apply Engine</span>
        </div>
        <div class="flex items-center gap-2">
          <!-- Relay status badge -->
          <div class="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium"
            :class="relayStatus === 'ok' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : relayStatus === 'offline' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'"
            :title="relayStatus === 'offline' ? 'Run: scripts\\start-relay.bat' : 'Edge relay OK'"
            @click="checkRelayStatus" style="cursor:pointer">
            <span class="w-1.5 h-1.5 rounded-full"
              :class="relayStatus === 'ok' ? 'bg-green-400' : relayStatus === 'offline' ? 'bg-red-400 animate-pulse' : 'bg-gray-400'"></span>
            {{ relayStatus === 'ok' ? 'Relay OK' : relayStatus === 'offline' ? 'Relay Offline' : 'Relay...' }}
          </div>
          <div v-if="applyEngineRunning" class="flex items-center gap-1">
            <span class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            <span class="text-[10px] text-green-400">Running</span>
          </div>
        </div>
      </div>

      <!-- Tab bar -->
      <div class="flex gap-0 mb-3 border-b border-neural-700/50">
        <button @click="engineTab = 'engine'"
          class="px-4 py-1.5 text-[10px] font-medium border-b-2 transition-colors"
          :class="engineTab === 'engine' ? 'border-cyber-purple text-cyber-purple' : 'border-transparent text-gray-500 hover:text-gray-300'">
          Engine
        </button>
        <button @click="switchEngineTab('monitor')"
          class="px-4 py-1.5 text-[10px] font-medium border-b-2 transition-colors flex items-center gap-1.5"
          :class="engineTab === 'monitor' ? 'border-cyber-cyan text-cyber-cyan' : 'border-transparent text-gray-500 hover:text-gray-300'">
          <span class="w-1.5 h-1.5 rounded-full transition-colors"
            :class="monitorConnected ? 'bg-cyber-cyan animate-pulse' : 'bg-gray-600'"></span>
          Monitor
        </button>
        <button @click="switchEngineTab('orchestrator')"
          class="px-4 py-1.5 text-[10px] font-medium border-b-2 transition-colors flex items-center gap-1.5"
          :class="engineTab === 'orchestrator' ? 'border-amber-400 text-amber-400' : 'border-transparent text-gray-500 hover:text-gray-300'">
          <span>🧠</span>
          Orchestrator
          <span v-if="orchActive.length" class="text-[9px] px-1 rounded bg-amber-500/20 border border-amber-500/30">{{ orchActive.length }}</span>
        </button>
      </div>

      <!-- ── MONITOR TAB ── -->
      <div v-show="engineTab === 'monitor'" class="flex flex-col gap-0">
        <!-- Terminal log -->
        <div ref="monitorEl"
          class="h-72 overflow-y-auto bg-[#0a0a0f] rounded-lg border border-neural-700/60 p-2 font-mono text-[10px] space-y-0.5"
          style="scrollbar-width:thin; scrollbar-color:#1e293b transparent">
          <div v-if="monitorLogs.length === 0" class="flex flex-col items-center justify-center h-full gap-2 text-neural-600 pointer-events-none">
            <span class="text-2xl">⚡</span>
            <span>Waiting for pipeline events…</span>
            <span class="text-[9px] text-neural-700">Open this tab then click ⚡ 1 Job to start</span>
          </div>
          <div v-for="(log, i) in monitorLogs" :key="i"
            class="flex items-start gap-2 px-1.5 py-0.5 rounded"
            :class="{
              'text-cyan-400 bg-cyan-900/30': log.cls === 'start',
              'text-violet-400': log.cls === 'fill',
              'text-indigo-400': log.cls === 'next',
              'text-sky-400': log.cls === 'click',
              'text-green-400 bg-green-900/20': log.cls === 'success',
              'text-amber-400 bg-amber-900/20': log.cls === 'captcha',
              'text-red-400 bg-red-900/20': log.cls === 'failed',
              'text-emerald-400 bg-emerald-900/20': log.cls === 'complete',
              'text-blue-400': log.cls === 'search',
              'text-purple-400': log.cls === 'score',
              'text-slate-500': log.cls === 'system' || log.cls === 'info',
            }">
            <span class="text-slate-600 shrink-0 w-14">{{ log.time }}</span>
            <span class="text-slate-600 shrink-0 w-5 text-right">{{ log.step !== null ? String(log.step).padStart(2,'0') : '  ' }}</span>
            <span class="shrink-0 w-3.5 text-center">{{ log.icon }}</span>
            <span class="flex-1 break-all">{{ log.text }}</span>
          </div>
        </div>
        <!-- Stats + clear bar -->
        <div class="flex items-center gap-4 px-2 py-1.5 bg-neural-800/60 rounded-b border border-t-0 border-neural-700/60 text-[10px]">
          <span class="text-green-400 font-mono">{{ monitorStats.applied }} applied</span>
          <span class="text-red-400 font-mono">{{ monitorStats.failed }} failed</span>
          <span class="text-amber-400 font-mono">{{ monitorStats.captcha }} captcha</span>
          <span class="ml-auto text-slate-600 font-mono">{{ monitorLogs.length }} events</span>
          <button @click="monitorLogs = []; monitorStats = { applied: 0, failed: 0, captcha: 0 }"
            class="px-2 py-0.5 rounded border border-neural-600 text-slate-500 hover:text-slate-300 hover:border-neural-500 transition-colors">
            clear
          </button>
        </div>
        <!-- Quick launch buttons while on monitor tab -->
        <div class="flex items-center gap-2 mt-2">
          <button @click="triggerN8nWorkflow(1)" :disabled="applyEngineRunning"
            class="px-3 py-1.5 rounded text-[10px] font-bold border transition-all flex items-center gap-1 disabled:opacity-40"
            :class="n8nTriggering ? 'text-green-400 border-green-500/40 bg-green-500/10' : 'text-white bg-neural-700 border-cyber-purple/30 hover:bg-cyber-purple/20 hover:border-cyber-purple/60'"
            title="Test a single application using the current Match dropdown value">
            <span>{{ n8nTriggering ? '⟳' : '⚡' }}</span> {{ n8nTriggering ? 'Triggered!' : '1 Job' }}
          </button>
          <button v-if="applyEngineRunning" @click="stopPipeline"
            class="px-3 py-1.5 rounded text-[10px] font-bold text-white bg-gradient-to-r from-red-500 to-orange-500 flex items-center gap-1">
            <span>⏹</span> Stop
          </button>
          <span v-if="applyEngineMsg" class="text-[10px] truncate" :class="applyEngineRunning ? 'text-cyber-cyan animate-pulse' : 'text-gray-400'">{{ applyEngineMsg }}</span>
        </div>
        <!-- Live Pipeline Feed -->
        <div v-if="liveSteps.length > 0 || applyEngineRunning" class="mt-2 rounded border border-cyber-cyan/20 bg-neural-800/50 overflow-hidden">
          <div class="flex items-center gap-2 px-2 py-1 border-b border-cyber-cyan/20 bg-neural-700/40">
            <span class="w-1.5 h-1.5 rounded-full bg-cyber-cyan" :class="applyEngineRunning ? 'animate-pulse' : ''"></span>
            <span class="text-[10px] font-mono text-cyber-cyan">LIVE PIPELINE</span>
            <span class="text-[10px] text-neural-400 truncate">{{ currentApplyJob }}</span>
            <button @click="liveSteps = []" class="ml-auto text-[9px] text-neural-600 hover:text-neural-400">clear</button>
          </div>
          <div ref="liveStepEl" class="max-h-64 overflow-y-auto p-1.5 space-y-0.5 font-mono">
            <div v-for="(s, i) in liveSteps" :key="i"
              class="flex items-start gap-2 text-[10px] px-1.5 py-0.5 rounded"
              :class="s.action === 'submitted' || s.action === 'success' || s.action === 'applied' ? 'text-green-400 bg-green-500/10'
                : s.action === 'captcha' ? 'text-amber-400 bg-amber-500/10'
                : s.action === 'failed' ? 'text-red-400 bg-red-500/10'
                : s.action === 'start' ? 'text-cyber-cyan bg-cyber-cyan/5'
                : s.action === 'search' ? 'text-blue-300'
                : s.action === 'score' ? 'text-purple-300'
                : s.action === 'complete' ? 'text-gray-400'
                : 'text-neural-300'">
              <span class="text-neural-600 shrink-0">{{ s.time }}</span>
              <span class="flex-1">{{ s.text }}</span>
            </div>
            <div v-if="applyEngineRunning && liveSteps.length === 0" class="text-[10px] text-neural-500 px-1.5 py-0.5 animate-pulse">Starting pipeline...</div>
          </div>
        </div>
      </div>

      <!-- ── ORCHESTRATOR TAB ── -->
      <div v-show="engineTab === 'orchestrator'" class="flex flex-col gap-3">
        <!-- SmartApply Smoke Test -->
        <div class="rounded-lg border border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-neural-800/60 p-2.5">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-[10px] uppercase tracking-wider text-amber-300 font-bold">SmartApply Smoke Test</span>
            <span class="text-[9px] text-neural-500">— isolate a single Indeed/SmartApply run end-to-end</span>
          </div>
          <div class="flex flex-col gap-1.5">
            <div class="flex gap-1.5">
              <input v-model="smokeUrl" type="url" placeholder="https://ph.indeed.com/viewjob?jk=..."
                :disabled="smokeRunning"
                class="flex-1 px-2 py-1.5 bg-neural-900 border border-neural-600 rounded text-white text-[11px] font-mono focus:border-amber-400 focus:outline-none disabled:opacity-40" />
              <button @click="loadSmokeCandidates" :disabled="smokeRunning || smokeLoadingCandidates"
                class="px-2.5 py-1.5 rounded text-[10px] font-bold border transition-all disabled:opacity-40 shrink-0"
                :class="smokePickerOpen ? 'text-amber-300 border-amber-400/60 bg-amber-500/15' : 'text-amber-300 border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-400/60'"
                :title="'Load recent apply attempts — auto-fill fields from last run'">
                {{ smokeLoadingCandidates ? '⟳' : '📋 Last Failed' }}
              </button>
            </div>
            <!-- Candidate picker -->
            <div v-if="smokePickerOpen" class="rounded border border-amber-500/30 bg-neural-900/80 p-1.5 max-h-60 overflow-y-auto">
              <div class="flex items-center justify-between mb-1 px-1">
                <span class="text-[9px] text-amber-300 uppercase tracking-wider font-bold">Recent apply attempts</span>
                <button @click="smokePickerOpen = false" class="text-[9px] text-neural-500 hover:text-neural-300">✕ close</button>
              </div>
              <div v-if="!smokeCandidates.length" class="px-2 py-2 text-[10px] text-neural-500 text-center italic">
                No instrumented apply attempts found yet. Trigger a real apply (or any smoke test) first.
              </div>
              <div v-else class="space-y-0.5">
                <button v-for="c in smokeCandidates" :key="c.application_id"
                  @click="pickSmokeCandidate(c)"
                  class="w-full text-left px-1.5 py-1 rounded hover:bg-amber-500/10 border border-transparent hover:border-amber-500/30 transition-colors">
                  <div class="flex items-center gap-1.5">
                    <span class="px-1 py-0.5 rounded text-[8px] font-mono border shrink-0" :class="episodeBadge(c.episode_type)">
                      {{ c.episode_type }}
                    </span>
                    <span v-if="c.outcome" class="text-[8px] text-neural-400 font-mono shrink-0">{{ c.outcome }}</span>
                    <span class="text-[10px] text-amber-200 truncate font-medium">
                      {{ c.job_title || c.page_title || c.domain || '—' }}
                    </span>
                    <span v-if="c.company" class="text-[9px] text-neural-400 truncate">· {{ c.company }}</span>
                    <span class="ml-auto text-[9px] text-neural-600 font-mono shrink-0">{{ formatAgo(c.created_at) }}</span>
                  </div>
                  <div class="text-[9px] text-neural-500 font-mono truncate mt-0.5 pl-1">{{ c.url }}</div>
                </button>
              </div>
            </div>
            <div class="flex gap-1.5">
              <input v-model="smokeTitle" type="text" placeholder="Job title (optional)" :disabled="smokeRunning"
                class="flex-1 px-2 py-1.5 bg-neural-900 border border-neural-600 rounded text-white text-[10px] focus:border-amber-400 focus:outline-none disabled:opacity-40" />
              <input v-model="smokeCompany" type="text" placeholder="Company (optional)" :disabled="smokeRunning"
                class="flex-1 px-2 py-1.5 bg-neural-900 border border-neural-600 rounded text-white text-[10px] focus:border-amber-400 focus:outline-none disabled:opacity-40" />
              <button @click="runSmartApplySmoke" :disabled="smokeRunning || !smokeUrl"
                class="px-3 py-1.5 rounded text-[10px] font-bold border transition-all disabled:opacity-40"
                :class="smokeRunning ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-white bg-gradient-to-r from-amber-500 to-orange-500 border-amber-400/50 hover:brightness-110'">
                {{ smokeRunning ? '⟳ Running…' : '▶ Run' }}
              </button>
              <button @click="switchEngineTab('monitor')" :disabled="!smokeRunning"
                class="px-2 py-1.5 rounded text-[10px] border border-neural-600 text-neural-300 hover:border-cyan-400/50 hover:text-cyan-300 transition-colors disabled:opacity-30"
                title="Open Monitor tab for live trace">
                📡 Live
              </button>
            </div>
            <div v-if="smokeRunning" class="text-[9px] text-amber-300/80 animate-pulse">
              Relay driving Edge. Watch the Monitor tab for step-by-step events. Timeout 240s.
            </div>
            <div v-if="smokeError" class="text-[10px] text-red-300 bg-red-500/10 px-2 py-1 rounded border border-red-500/30">
              ⚠ {{ smokeError }}
            </div>
            <!-- Smoke result -->
            <div v-if="smokeResult" class="mt-1 rounded border border-neural-600/60 bg-neural-900/60 p-2">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-mono border" :class="smokeStatusColor(smokeResult.status)">
                  {{ smokeResult.status }}
                </span>
                <span class="text-[9px] text-neural-500 font-mono">app {{ smokeResult.application_id.slice(0,8) }}</span>
                <span class="text-[9px] text-neural-400 font-mono">{{ smokeResult.duration_ms }}ms</span>
                <span class="text-[9px] text-neural-400 font-mono">{{ smokeResult.steps }} steps</span>
                <span class="text-[9px] text-neural-400 font-mono">{{ smokeResult.episode_count }} episodes</span>
                <span v-if="smokeResult.recovery_count" class="text-[9px] text-amber-300 font-mono">
                  ⚕ {{ smokeResult.recovery_count }} recoveries
                </span>
                <span v-if="smokeResult.form_analyzed" class="text-[9px] text-indigo-300 font-mono">👁 form_analyzed</span>
                <span v-if="smokeResult.routed" class="text-[9px] text-cyan-300 font-mono">🧭 routed</span>
              </div>
              <div v-if="smokeResult.detail" class="mt-1 text-[10px] text-neural-300">{{ smokeResult.detail }}</div>
              <div v-if="smokeResult.final_url" class="mt-0.5 text-[9px] text-neural-500 font-mono truncate">
                → {{ smokeResult.final_url }}
              </div>
              <!-- Fresh candidate suggestion when JD was 404 / gone -->
              <div v-if="smokeResult.next_candidate" class="mt-1.5 flex items-center gap-1.5 rounded border border-amber-400/40 bg-amber-500/10 px-2 py-1">
                <span class="text-[10px] text-amber-200">Listing removed. Fresh candidate:</span>
                <span class="text-[10px] text-neural-100 font-mono truncate flex-1">
                  {{ smokeResult.next_candidate.title || smokeResult.next_candidate.job_url }}<span v-if="smokeResult.next_candidate.company"> · {{ smokeResult.next_candidate.company }}</span>
                </span>
                <button
                  class="px-1.5 py-0.5 rounded text-[9px] font-mono border border-amber-300/60 bg-amber-500/30 hover:bg-amber-500/50 text-amber-50"
                  @click="useFreshCandidate()"
                >📥 Use</button>
              </div>
              <!-- Episode trace -->
              <div v-if="smokeResult.episodes.length" class="mt-1.5 max-h-48 overflow-y-auto border-t border-neural-700/60 pt-1 space-y-0.5">
                <div v-for="(ep, i) in smokeResult.episodes" :key="i" class="flex items-start gap-1.5 text-[10px]">
                  <span class="text-neural-600 font-mono shrink-0 w-5 text-right">{{ i + 1 }}.</span>
                  <span class="px-1 py-0.5 rounded text-[9px] font-mono border shrink-0" :class="episodeBadge(ep.episode_type)">
                    {{ ep.episode_type }}
                  </span>
                  <span v-if="ep.action" class="text-neural-400 font-mono shrink-0">{{ ep.action }}</span>
                  <span v-if="ep.outcome" class="text-neural-500 font-mono shrink-0">→ {{ ep.outcome }}</span>
                  <span class="flex-1 text-neural-300 truncate">{{ ep.vision_summary || ep.reasoning || '' }}</span>
                </div>
              </div>
              <div v-else class="mt-1 text-[9px] text-neural-500 italic">
                No episodes written — apply never reached the orchestrator-instrumented paths. Check relay logs.
              </div>
            </div>
          </div>
        </div>

        <!-- KPI row -->
        <div class="grid grid-cols-4 gap-2">
          <!-- First-try success rate -->
          <div class="rounded-lg border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-neural-800/60 p-2">
            <div class="text-[9px] uppercase tracking-wider text-amber-300/80 font-medium">First-Try Success</div>
            <div class="flex items-baseline gap-1 mt-0.5">
              <span class="text-xl font-bold text-amber-300">{{ orchFirstTry.rate }}%</span>
              <span class="text-[9px] text-neural-400">{{ orchFirstTry.hits }}/{{ orchFirstTry.total }}</span>
            </div>
            <div class="mt-1 h-1 bg-neural-800 rounded overflow-hidden">
              <div class="h-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all"
                :style="{ width: `${Math.min(100, orchFirstTry.rate)}%` }"></div>
            </div>
            <div class="text-[9px] text-neural-500 mt-0.5">target ≥ 90%</div>
          </div>
          <!-- Active orchestrations -->
          <div class="rounded-lg border border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-neural-800/60 p-2">
            <div class="text-[9px] uppercase tracking-wider text-cyan-300/80 font-medium">Active</div>
            <div class="text-xl font-bold text-cyan-300 mt-0.5">{{ orchActive.length }}</div>
            <div class="text-[9px] text-neural-500 mt-0.5">live state rows</div>
          </div>
          <!-- Recoveries count -->
          <div class="rounded-lg border border-red-500/20 bg-gradient-to-br from-red-500/5 to-neural-800/60 p-2">
            <div class="text-[9px] uppercase tracking-wider text-red-300/80 font-medium">Recent Recoveries</div>
            <div class="text-xl font-bold text-red-300 mt-0.5">{{ orchRecoveries.length }}</div>
            <div class="text-[9px] text-neural-500 mt-0.5">last 20 episodes</div>
          </div>
          <!-- Refresh -->
          <div class="rounded-lg border border-neural-700/60 bg-neural-800/60 p-2 flex flex-col">
            <div class="text-[9px] uppercase tracking-wider text-neural-400 font-medium">Last Sync</div>
            <div class="text-[11px] text-neural-200 mt-0.5 font-mono">
              {{ orchLastFetch ? orchLastFetch.toLocaleTimeString() : '—' }}
            </div>
            <button @click="fetchOrchestratorDashboard" :disabled="orchLoading"
              class="mt-auto px-2 py-1 rounded text-[10px] border border-neural-600 hover:border-amber-500/50 hover:text-amber-300 transition-colors disabled:opacity-40">
              {{ orchLoading ? '⟳ Loading' : '↻ Refresh' }}
            </button>
          </div>
        </div>

        <!-- Routing distribution -->
        <div v-if="Object.keys(orchRouting).length" class="rounded-lg border border-neural-700/60 bg-neural-800/40 p-2">
          <div class="text-[10px] uppercase tracking-wider text-neural-400 font-medium mb-1.5">Routing Decisions — 14d</div>
          <div class="flex flex-wrap gap-1.5">
            <div v-for="(n, agent) in orchRouting" :key="agent"
              class="px-2 py-0.5 rounded text-[10px] font-mono bg-neural-700/60 border border-neural-600/50">
              <span class="text-neural-300">{{ agent }}</span>
              <span class="text-amber-300 ml-1">{{ n }}</span>
            </div>
          </div>
        </div>

        <!-- Active orchestrator states -->
        <div class="rounded-lg border border-neural-700/60 bg-neural-800/40">
          <div class="flex items-center justify-between px-2 py-1.5 border-b border-neural-700/60">
            <div class="text-[10px] uppercase tracking-wider text-cyan-300/80 font-medium">Active States</div>
            <span class="text-[9px] text-neural-500">{{ orchActive.length }} rows</span>
          </div>
          <div v-if="!orchActive.length" class="px-2 py-3 text-[10px] text-neural-500 text-center">
            No live orchestrator state. Trigger an apply to see routing activity.
          </div>
          <div v-else class="divide-y divide-neural-700/40">
            <div v-for="s in orchActive" :key="s.application_id + s.channel"
              class="flex items-center gap-2 px-2 py-1.5 text-[10px]">
              <span class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">{{ s.channel }}</span>
              <span v-if="s.sub_agent" class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/10 border border-amber-500/30 text-amber-300">{{ s.sub_agent }}</span>
              <span v-if="s.ats_type" class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-violet-500/10 border border-violet-500/30 text-violet-300">{{ s.ats_type }}</span>
              <span class="text-neural-300 truncate flex-1">{{ s.step_name || s.current_step || '—' }}</span>
              <span v-if="s.step_attempts > 1" class="text-red-300 font-mono">×{{ s.step_attempts }}</span>
              <span v-if="s.last_decision" class="text-[9px] text-neural-500 font-mono">{{ s.last_decision }}</span>
              <span class="text-neural-600 font-mono">{{ formatAgo(s.updated_at) }}</span>
            </div>
          </div>
        </div>

        <!-- Recent recoveries / episodes timeline -->
        <div class="rounded-lg border border-neural-700/60 bg-neural-800/40">
          <div class="flex items-center justify-between px-2 py-1.5 border-b border-neural-700/60">
            <div class="text-[10px] uppercase tracking-wider text-amber-300/80 font-medium">Recent Episodes</div>
            <span class="text-[9px] text-neural-500">last 20</span>
          </div>
          <div v-if="!orchRecoveries.length" class="px-2 py-3 text-[10px] text-neural-500 text-center">
            No recovery / form / email episodes yet.
          </div>
          <div v-else class="divide-y divide-neural-700/40 max-h-80 overflow-y-auto">
            <div v-for="ep in orchRecoveries" :key="ep.id"
              class="px-2 py-1.5 text-[10px] hover:bg-neural-700/20 transition-colors">
              <div class="flex items-center gap-2">
                <span class="px-1.5 py-0.5 rounded text-[9px] font-mono border" :class="episodeBadge(ep.episode_type)">
                  {{ ep.episode_type }}
                </span>
                <span v-if="ep.sub_agent" class="text-[9px] text-neural-400 font-mono">{{ ep.sub_agent }}</span>
                <span v-if="ep.domain" class="text-[9px] text-cyan-300 font-mono truncate">{{ ep.domain }}</span>
                <span v-if="ep.confidence" class="ml-auto text-[9px] text-amber-300 font-mono">conf {{ ep.confidence }}%</span>
                <span class="text-[9px] text-neural-600 font-mono">{{ formatAgo(ep.created_at) }}</span>
              </div>
              <div v-if="ep.vision_summary || ep.reasoning" class="mt-0.5 text-neural-300 text-[10px] leading-relaxed pl-0.5">
                {{ ep.vision_summary || ep.reasoning }}
              </div>
              <div v-if="ep.action" class="mt-0.5 text-[9px] text-neural-500 font-mono pl-0.5">
                → {{ ep.action }}<span v-if="ep.outcome" class="text-neural-600"> · {{ ep.outcome }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── ENGINE TAB ── -->
      <div v-show="engineTab === 'engine'">
      <!-- Relay offline warning -->
      <div v-if="relayStatus === 'offline'" class="mb-3 flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-[10px] text-red-400">
        <span>⚠</span>
        <span>Edge relay offline — run <code class="font-mono bg-red-500/10 px-1 rounded">scripts\start-relay.bat</code> then <span @click="checkRelayStatus" class="underline cursor-pointer">recheck</span></span>
      </div>
      <!-- Indeed session badge -->
      <div v-if="relayStatus === 'ok' && applyEnginePlatform === 'indeed'"
           class="mb-3 flex items-start gap-2 px-3 py-2 rounded-lg text-[10px]"
           :class="indeedSession === 'ok' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : (indeedSession === 'dead' || indeedSession === 'no_cdp') ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-neural-700/40 border border-neural-600 text-neural-300'">
        <span v-if="indeedSession === 'ok'" class="mt-0.5">✓</span>
        <span v-else-if="indeedSession === 'dead' || indeedSession === 'no_cdp'" class="mt-0.5">✗</span>
        <span v-else class="mt-0.5">⟳</span>
        <div class="flex-1 min-w-0">
          <div>
            <span v-if="indeedSession === 'ok'">Indeed session active — Edge Profile 7 signed in</span>
            <span v-else-if="indeedSession === 'no_cdp'">Edge is running without CDP — relay cannot attach. Close Edge then Launch with CDP.</span>
            <span v-else-if="indeedSession === 'dead'">Indeed session expired — applies will fail until you sign in</span>
            <span v-else-if="indeedSession === 'checking'">Checking Indeed session…</span>
            <span v-else>Session status unknown</span>
          </div>
          <div v-if="indeedSessionDetail && indeedSession !== 'ok'" class="mt-0.5 text-[9px] font-mono text-red-300/80 break-all">{{ indeedSessionDetail }}</div>
        </div>
        <span class="flex items-center gap-1 shrink-0">
          <button v-if="indeedSession !== 'checking'" @click="checkIndeedSession"
            class="px-2 py-0.5 rounded text-[9px] font-mono border border-neural-600 text-neural-300 hover:bg-neural-700">Recheck</button>
          <button v-if="indeedSession === 'no_cdp'" @click="launchEdgeCdp"
            :disabled="cdpLaunching"
            class="px-2 py-0.5 rounded text-[9px] font-mono border border-cyber-cyan/50 text-cyber-cyan hover:bg-cyber-cyan/10 disabled:opacity-50">
            {{ cdpLaunching ? 'Launching…' : 'Launch Edge CDP →' }}
          </button>
          <button v-if="indeedSession === 'no_cdp'" @click="forceRelaunchEdgeCdp"
            :disabled="cdpLaunching"
            title="Closes all Edge windows and relaunches with CDP. Session restored; unsaved tabs lost."
            class="px-2 py-0.5 rounded text-[9px] font-mono border border-red-500/50 text-red-300 hover:bg-red-500/10 disabled:opacity-50">
            {{ cdpLaunching ? '…' : 'Force Close + Relaunch ⚠' }}
          </button>
          <button v-if="indeedSession === 'dead'" @click="openIndeedSignin"
            :disabled="signinOpening"
            class="px-2 py-0.5 rounded text-[9px] font-mono border border-cyber-purple/50 text-cyber-purple hover:bg-cyber-purple/10 disabled:opacity-50">
            {{ signinOpening ? 'Opening…' : 'Sign in →' }}
          </button>
        </span>
      </div>
      <!-- Controls -->
      <div class="flex items-center gap-3 mb-3">
        <div class="flex items-center gap-1.5">
          <label class="text-[10px] text-gray-400">Platform</label>
          <select v-model="applyEnginePlatform" :disabled="applyEngineRunning"
            class="px-2 py-1.5 bg-neural-700 border border-neural-600 rounded text-white text-xs focus:border-cyber-purple focus:outline-none disabled:opacity-50">
            <option value="indeed">Indeed</option>
            <option value="linkedin">LinkedIn</option>
            <option value="kalibrr">Kalibrr</option>
            <option value="jobslin">JobsLin PH</option>
            <option value="onlinejobs">OnlineJobs.ph</option>
          </select>
        </div>
        <div class="flex items-center gap-1.5">
          <label class="text-[10px] text-gray-400">Target</label>
          <select v-model.number="applyEngineTarget" :disabled="applyEngineRunning"
            class="px-2 py-1.5 bg-neural-700 border border-neural-600 rounded text-white text-xs focus:border-cyber-purple focus:outline-none disabled:opacity-50">
            <option :value="1">1 job</option>
            <option :value="5">5 jobs</option>
            <option :value="10">10 jobs</option>
            <option :value="20">20 jobs</option>
            <option :value="30">30 jobs</option>
            <option :value="50">50 jobs</option>
          </select>
        </div>
        <div class="flex items-center gap-1.5">
          <label class="text-[10px] text-gray-400">Match</label>
          <select v-model.number="applyEngineMinScore" :disabled="applyEngineRunning"
            class="px-2 py-1.5 bg-neural-700 border border-neural-600 rounded text-white text-xs focus:border-cyber-purple focus:outline-none disabled:opacity-50">
            <option :value="0">🌐 Any (0+)</option>
            <option :value="30">🟡 Broad (30+)</option>
            <option :value="40">🟠 Fair (40+)</option>
            <option :value="50">🔵 Good (50+)</option>
            <option :value="65">🟣 Strong (65+)</option>
            <option :value="80">🟢 Top (80+)</option>
            <option :value="90">⭐ Elite (90+)</option>
          </select>
        </div>
        <div class="flex items-center gap-1.5">
          <label class="text-[10px] text-gray-400">Fresh</label>
          <select v-model.number="applyEngineFreshness" :disabled="applyEngineRunning"
            class="px-2 py-1.5 bg-neural-700 border border-neural-600 rounded text-white text-xs focus:border-cyber-purple focus:outline-none disabled:opacity-50">
            <option :value="1">1 day</option>
            <option :value="3">3 days</option>
            <option :value="7">7 days</option>
            <option :value="14">14 days</option>
            <option :value="30">30 days</option>
          </select>
        </div>
        <template v-if="!applyEngineRunning">
          <button @click="startPipeline"
            class="px-5 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-cyber-purple to-cyber-cyan hover:opacity-90 transition-all flex items-center gap-1.5">
            <span>▶</span> Start Apply
          </button>
          <button @click="triggerN8nWorkflow(1)"
            class="px-3 py-2 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5"
            :class="n8nTriggering ? 'text-green-400 border-green-500/40 bg-green-500/10' : 'text-white bg-neural-700 border-cyber-purple/30 hover:bg-cyber-purple/20 hover:border-cyber-purple/60'"
            title="Test a single application using the current Match dropdown value">
            <span>{{ n8nTriggering ? '⟳' : '⚡' }}</span> {{ n8nTriggering ? 'Triggered!' : '1 Job' }}
          </button>
        </template>
        <button v-else @click="stopPipeline"
          class="px-5 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-red-500 to-orange-500 hover:opacity-90 transition-all flex items-center gap-1.5">
          <span>⏹</span> Stop
        </button>
      </div>
      <!-- Progress Bar -->
      <div v-if="applyEngineRunning || applyEngineResults.length > 0" class="space-y-2">
        <div class="flex items-center gap-2">
          <div class="flex-1 h-3 bg-neural-700 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all duration-500"
              :class="applyEngineRunning ? 'bg-gradient-to-r from-cyber-purple to-cyber-cyan' : 'bg-green-500'"
              :style="{ width: applyEngineTotal > 0 ? (applyEngineIdx / applyEngineTotal * 100) + '%' : '0%' }"></div>
          </div>
          <span class="text-xs text-white font-mono shrink-0">
            {{ applyEngineIdx }}/{{ applyEngineTotal }}
            <span class="text-gray-500">({{ applyEngineTotal > 0 ? Math.round(applyEngineIdx / applyEngineTotal * 100) : 0 }}%)</span>
          </span>
        </div>
        <!-- Current Step -->
        <p v-if="applyEngineMsg" class="text-xs" :class="applyEngineRunning ? 'text-cyber-cyan animate-pulse' : 'text-gray-400'">{{ applyEngineMsg }}</p>
        <!-- Result Log -->
        <div v-if="applyEngineResults.length > 0" class="max-h-40 overflow-y-auto space-y-1 mt-2">
          <div v-for="(r, idx) in [...applyEngineResults].reverse()" :key="idx"
            class="flex items-center gap-2 text-[11px] py-1 px-2 rounded"
            :class="r.status === 'applied' ? 'bg-green-500/10 text-green-400' : r.status === 'captcha' ? 'bg-amber-500/10 text-amber-400' : (r.status === 'pending' || r.status === 'applying') ? 'bg-blue-500/10 text-blue-300' : 'bg-red-500/10 text-red-400'">
            <span :class="r.status === 'applying' ? 'animate-spin inline-block' : ''">{{ r.status === 'applied' ? '✓' : r.status === 'captcha' ? '⚠' : (r.status === 'applying' || r.status === 'pending') ? '⟳' : '✗' }}</span>
            <span class="font-medium">{{ r.title }}</span>
            <span class="text-gray-500">@ {{ r.company }}</span>
            <span class="ml-auto text-[9px] text-gray-600">{{ r.status }}</span>
          </div>
        </div>
        <!-- Summary -->
        <div v-if="!applyEngineRunning && applyEngineResults.length > 0" class="flex items-center gap-4 pt-2 border-t border-neural-700">
          <span class="text-[10px] text-green-400">✓ {{ applyEngineResults.filter(r => r.status === 'applied').length }} applied</span>
          <span class="text-[10px] text-red-400">✗ {{ applyEngineResults.filter(r => r.status !== 'applied' && r.status !== 'captcha').length }} failed</span>
          <span class="text-[10px] text-amber-400">⚠ {{ applyEngineResults.filter(r => r.status === 'captcha').length }} captcha</span>
        </div>
      </div>
      </div><!-- end engine tab -->
    </div>

    <!-- Empty -->
    <div v-if="filtered.length === 0" class="text-center py-16 glass-dark rounded-xl border border-neural-700/50">
      <div class="text-4xl mb-3">📋</div>
      <h3 class="text-lg font-semibold text-white mb-2">No applications</h3>
      <p class="text-gray-500 text-sm">Apply to jobs from the Jobs page to start tracking.</p>
    </div>

    <!-- Applications List -->
    <div v-else class="space-y-3">
      <div v-for="app in paginated" :key="app.id"
        class="glass-dark rounded-xl border overflow-hidden transition-colors cursor-pointer"
        :class="selectedIds.has(app.id) ? 'border-red-500/40 bg-red-900/10' : 'border-neural-700/50 hover:border-cyber-purple/40'"
        @click="openDetail(app)">
        <!-- Top row: job info + status -->
        <div class="flex items-center justify-between px-4 py-3">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <!-- Checkbox for bulk select -->
            <input type="checkbox" :checked="selectedIds.has(app.id)"
              @click.stop="toggleSelect(app.id)"
              class="w-3.5 h-3.5 rounded border-neural-600 bg-neural-800 accent-red-500 cursor-pointer shrink-0" />
            <div class="w-9 h-9 rounded-lg flex items-center justify-center text-sm shrink-0" :class="getStatusInfo(app.status).bg">
              {{ app.channel === 'agency' ? '🏢' : app.channel === 'freelance' ? '💻' : '📨' }}
            </div>
            <div class="min-w-0">
              <p class="text-sm text-white font-medium truncate">{{ getJob(app.job_listing_id)?.title || '—' }}</p>
              <p class="text-[10px] text-gray-500">{{ getJob(app.job_listing_id)?.company || '' }} · {{ app.platform }} · {{ app.channel }}{{ app.agency_name ? ` (${app.agency_name})` : '' }}</p>
            </div>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <div class="text-right">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-medium capitalize" :class="getStatusInfo(app.status).bg + ' ' + getStatusInfo(app.status).text">{{ app.status.replace(/_/g, ' ') }}</span>
              <!-- Per-channel execution badges -->
              <div v-if="getChannelBadges(app.id).length" class="flex items-center gap-1 mt-1 justify-end">
                <span v-for="badge in getChannelBadges(app.id)" :key="badge.channel"
                  class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-medium"
                  :class="badge.color"
                  :title="`${badge.channel}: ${badge.status}`">
                  {{ badge.icon }} {{ badge.status === 'applied' ? '✓' : badge.status === 'scheduled' ? '⏳' : badge.status === 'failed' ? '✗' : '…' }}
                </span>
              </div>
              <p class="text-[9px] text-gray-600 mt-0.5">{{ daysSince(app.created_at) }}d since applied</p>
            </div>
            <div class="flex gap-0.5">
              <button @click="openDetail(app)" class="p-1.5 rounded-lg hover:bg-neural-600 text-gray-500 hover:text-white transition-colors" title="Pipeline Report">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              </button>
              <button @click="openEdit(app)" class="p-1.5 rounded-lg hover:bg-neural-600 text-gray-500 hover:text-cyber-cyan transition-colors" title="Edit">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </button>
              <button @click="deleteApp(app)" :disabled="deletingId === app.id" class="p-1.5 rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors disabled:opacity-40" title="Delete">
                <svg v-if="deletingId !== app.id" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                <svg v-else class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              </button>
            </div>
          </div>
        </div>
        <!-- Pipeline progress bar -->
        <div class="px-4 pb-3">
          <div class="flex items-center gap-0.5">
            <template v-for="(stage, idx) in pipelineProgress(app)" :key="stage.group">
              <div class="flex-1 h-1.5 rounded-full transition-colors"
                :class="stage.completed ? stage.color : stage.active ? stage.color + ' animate-pulse' : 'bg-neural-700/40'" />
              <div v-if="idx < pipelineProgress(app).length - 1" class="w-0.5" />
            </template>
          </div>
          <div class="flex justify-between mt-1">
            <span class="text-[8px] text-gray-600">Applied</span>
            <span class="text-[8px] text-gray-600">Onboarded</span>
          </div>
        </div>
        <!-- Notes / follow-up -->
        <div v-if="app.notes || app.follow_up_at" class="px-4 pb-3 flex gap-4">
          <p v-if="app.notes" class="text-[10px] text-gray-500 truncate flex-1">{{ app.notes }}</p>
          <p v-if="app.follow_up_at" class="text-[10px] shrink-0" :class="new Date(app.follow_up_at) < new Date() ? 'text-red-400' : 'text-yellow-400'">
            Follow-up: {{ new Date(app.follow_up_at).toLocaleDateString() }}{{ new Date(app.follow_up_at) < new Date() ? ' (OVERDUE)' : '' }}
          </p>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-between mt-4">
      <p class="text-[10px] text-gray-500">{{ (currentPage - 1) * perPage + 1 }}-{{ Math.min(currentPage * perPage, filtered.length) }} of {{ filtered.length }}</p>
      <div class="flex items-center gap-1">
        <button @click="currentPage--" :disabled="currentPage === 1" class="px-2.5 py-1 rounded text-xs bg-neural-700 text-gray-400 hover:text-white disabled:opacity-30">&larr;</button>
        <button v-for="pg in totalPages" :key="pg" @click="currentPage = pg"
          class="w-7 h-7 rounded text-[10px] font-medium" :class="pg === currentPage ? 'bg-cyber-purple/20 text-cyber-purple' : 'text-gray-500 hover:text-white'">{{ pg }}</button>
        <button @click="currentPage++" :disabled="currentPage === totalPages" class="px-2.5 py-1 rounded text-xs bg-neural-700 text-gray-400 hover:text-white disabled:opacity-30">&rarr;</button>
      </div>
    </div>

    <!-- ═══ Pipeline Report Modal (Enlarged with Job Detail Tabs) ═══ -->
    <Teleport to="body">
      <div v-if="showDetail && detailApp" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="showDetail = false">
        <div class="glass-dark rounded-xl w-full max-w-4xl border border-neural-600 max-h-[92vh] flex flex-col">
          <div class="px-6 py-4 border-b border-neural-700 shrink-0">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-lg font-bold text-white">{{ getJob(detailApp.job_listing_id)?.title || 'Application Details' }}</h3>
                <p class="text-sm text-gray-400">{{ getJob(detailApp.job_listing_id)?.company || '' }} · {{ detailApp.platform }}</p>
              </div>
              <span class="px-3 py-1 rounded-full text-xs font-medium capitalize" :class="getStatusInfo(detailApp.status).bg + ' ' + getStatusInfo(detailApp.status).text">{{ detailApp.status.replace(/_/g, ' ') }}</span>
            </div>
            <!-- Tab navigation -->
            <div class="flex gap-1 mt-3 overflow-x-auto">
              <button v-for="tab in [
                { id: 'pipeline', label: 'Pipeline', icon: '📊' },
                { id: 'overview', label: 'Overview', icon: '📋' },
                { id: 'description', label: 'Job Details', icon: '📄' },
                { id: 'match', label: 'Match Analysis', icon: '🎯' },
                { id: 'cover_letter', label: 'Cover Letter', icon: '✉️' },
                { id: 'apply', label: 'How to Apply', icon: '🚀' },
              ]" :key="tab.id" @click="detailTab = tab.id as any"
                class="px-3 py-1.5 rounded-lg text-[10px] font-medium whitespace-nowrap transition-colors"
                :class="detailTab === tab.id ? 'bg-cyber-purple/20 text-cyber-purple border border-cyber-purple/30' : 'text-gray-500 hover:text-white hover:bg-neural-700'">
                {{ tab.icon }} {{ tab.label }}
              </button>
            </div>
            <p v-if="(detailApp as any).auto_applied" class="text-[10px] text-cyber-purple mt-1 flex items-center gap-1">
              <span>🤖</span> Auto-applied by AI Agent
            </p>
          </div>
          <div class="flex-1 overflow-y-auto p-6 space-y-4">

            <!-- ═══ TAB: OVERVIEW ═══ -->
            <div v-if="detailTab === 'overview'">
              <div class="grid grid-cols-2 gap-3">
                <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                  <p class="text-[9px] text-gray-500 uppercase">Salary</p>
                  <p class="text-sm font-medium" :class="getJob(detailApp.job_listing_id)?.salary_min ? 'text-green-400' : 'text-gray-500'">
                    {{ getJob(detailApp.job_listing_id)?.salary_min ? `${getJob(detailApp.job_listing_id)?.salary_currency || 'USD'} ${getJob(detailApp.job_listing_id)?.salary_min?.toLocaleString()} - ${getJob(detailApp.job_listing_id)?.salary_max?.toLocaleString()}` : getJobRawData(detailApp).salary_estimate || '—' }}
                  </p>
                </div>
                <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                  <p class="text-[9px] text-gray-500 uppercase">Job Type</p>
                  <p class="text-sm text-white">{{ getJob(detailApp.job_listing_id)?.job_type || getJobRawData(detailApp).job_type || '—' }}</p>
                </div>
                <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                  <p class="text-[9px] text-gray-500 uppercase">Role Type</p>
                  <p class="text-sm text-white capitalize">{{ (getJobRawData(detailApp).role_type as string || '—').replace(/_/g, ' ') }}</p>
                </div>
                <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                  <p class="text-[9px] text-gray-500 uppercase">Company Type</p>
                  <p class="text-sm text-white capitalize">{{ (getJobRawData(detailApp).company_bucket as string || '—').replace(/_/g, ' ') }}</p>
                </div>
                <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                  <p class="text-[9px] text-gray-500 uppercase">Location</p>
                  <p class="text-sm text-white">{{ getJob(detailApp.job_listing_id)?.location || '—' }}</p>
                </div>
                <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                  <p class="text-[9px] text-gray-500 uppercase">Work Arrangement</p>
                  <p class="text-sm text-white capitalize">{{ getJobRawData(detailApp).work_arrangement || '—' }}</p>
                </div>
                <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                  <p class="text-[9px] text-gray-500 uppercase">Seniority</p>
                  <p class="text-sm text-white capitalize">{{ getJobRawData(detailApp).seniority || '—' }}</p>
                </div>
                <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                  <p class="text-[9px] text-gray-500 uppercase">Platform</p>
                  <p class="text-sm text-white">{{ detailApp.platform }}</p>
                </div>
                <div v-if="getJob(detailApp.job_listing_id)?.easy_apply !== undefined" class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                  <p class="text-[9px] text-gray-500 uppercase">Easy Apply</p>
                  <p class="text-sm font-medium" :class="getJob(detailApp.job_listing_id)?.easy_apply ? 'text-green-400' : 'text-gray-400'">
                    {{ getJob(detailApp.job_listing_id)?.easy_apply ? '✓ Yes — Quick Apply' : '✗ No — External Form' }}
                  </p>
                </div>
                <div v-if="getJob(detailApp.job_listing_id)?.applicant_count" class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                  <p class="text-[9px] text-gray-500 uppercase">Applicants</p>
                  <p class="text-sm text-white">{{ getJob(detailApp.job_listing_id)?.applicant_count?.toLocaleString() }}</p>
                </div>
                <div v-if="getJob(detailApp.job_listing_id)?.poster_name" class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                  <p class="text-[9px] text-gray-500 uppercase">Posted By</p>
                  <a v-if="getJob(detailApp.job_listing_id)?.poster_linkedin_url" :href="getJob(detailApp.job_listing_id)?.poster_linkedin_url || '#'" target="_blank"
                    class="text-sm text-cyber-cyan hover:underline">{{ getJob(detailApp.job_listing_id)?.poster_name }}</a>
                  <p v-else class="text-sm text-white">{{ getJob(detailApp.job_listing_id)?.poster_name }}</p>
                </div>
                <div v-if="getJob(detailApp.job_listing_id)?.ats_type" class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                  <p class="text-[9px] text-gray-500 uppercase">ATS System</p>
                  <p class="text-sm text-white capitalize">{{ getJob(detailApp.job_listing_id)?.ats_type }}</p>
                </div>
                <div v-if="getJob(detailApp.job_listing_id)?.match_score" class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                  <p class="text-[9px] text-gray-500 uppercase">Match Score</p>
                  <p class="text-sm font-bold" :class="(getJob(detailApp.job_listing_id)?.match_score || 0) >= 80 ? 'text-green-400' : (getJob(detailApp.job_listing_id)?.match_score || 0) >= 60 ? 'text-yellow-400' : 'text-red-400'">
                    {{ getJob(detailApp.job_listing_id)?.match_score }}%
                  </p>
                </div>
                <div v-if="getJob(detailApp.job_listing_id)?.posted_at" class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                  <p class="text-[9px] text-gray-500 uppercase">Posted</p>
                  <p class="text-sm text-white">{{ new Date(getJob(detailApp.job_listing_id)!.posted_at!).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) }}</p>
                </div>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <a v-if="getJob(detailApp.job_listing_id)?.url" :href="getJob(detailApp.job_listing_id)?.url" target="_blank"
                  class="text-xs text-cyber-cyan hover:underline">View Original Listing ↗</a>
                <a v-if="getJob(detailApp.job_listing_id)?.poster_linkedin_url" :href="getJob(detailApp.job_listing_id)?.poster_linkedin_url || '#'" target="_blank"
                  class="text-xs text-blue-400 hover:underline">Recruiter LinkedIn ↗</a>
              </div>
            </div>

            <!-- ═══ TAB: JOB DETAILS ═══ -->
            <div v-if="detailTab === 'description'">
              <div v-if="getJob(detailApp.job_listing_id)?.description" class="bg-neural-800/50 rounded-lg p-4 border border-neural-700/30 text-sm text-gray-300 leading-relaxed max-h-[60vh] overflow-y-auto" v-html="getJob(detailApp.job_listing_id)?.description?.replace(/\n/g, '<br>')"></div>
              <div v-else class="text-center py-8 text-gray-500">
                <p class="text-2xl mb-2">📄</p>
                <p class="text-sm">No job description available</p>
              </div>
            </div>

            <!-- ═══ TAB: MATCH ANALYSIS ═══ -->
            <div v-if="detailTab === 'match'">
              <div class="text-center mb-4">
                <p class="text-4xl font-bold" :class="(getJob(detailApp.job_listing_id)?.match_score || 0) >= 80 ? 'text-green-400' : (getJob(detailApp.job_listing_id)?.match_score || 0) >= 60 ? 'text-yellow-400' : 'text-red-400'">
                  {{ getJob(detailApp.job_listing_id)?.match_score || '?' }}%
                </p>
                <p class="text-xs text-gray-500">Match Score</p>
                <div class="w-full bg-neural-700 rounded-full h-2 mt-2 max-w-xs mx-auto">
                  <div class="h-2 rounded-full transition-all" :style="`width: ${getJob(detailApp.job_listing_id)?.match_score || 0}%`"
                    :class="(getJob(detailApp.job_listing_id)?.match_score || 0) >= 80 ? 'bg-green-400' : (getJob(detailApp.job_listing_id)?.match_score || 0) >= 60 ? 'bg-yellow-400' : 'bg-red-400'"></div>
                </div>
              </div>
              <div v-if="(getJobRawData(detailApp).recommendation as string)" class="bg-neural-800/50 border-l-3 border-green-500 rounded-r-lg p-3 mb-3 text-xs text-gray-300">
                {{ getJobRawData(detailApp).recommendation }}
              </div>
              <div v-if="(getJobRawData(detailApp).skill_matches as string[])?.length" class="mb-3">
                <p class="text-[9px] text-green-400 uppercase font-medium mb-2">Skills Matched</p>
                <div class="flex flex-wrap gap-1.5">
                  <span v-for="s in (getJobRawData(detailApp).skill_matches as string[])" :key="s" class="px-2.5 py-1 rounded-full text-[10px] bg-green-500/10 text-green-400 border border-green-500/20">{{ s }}</span>
                </div>
              </div>
              <div v-if="(getJobRawData(detailApp).skill_gaps as string[])?.length">
                <p class="text-[9px] text-amber-400 uppercase font-medium mb-2">Skills to Highlight</p>
                <div class="flex flex-wrap gap-1.5">
                  <span v-for="s in (getJobRawData(detailApp).skill_gaps as string[])" :key="s" class="px-2.5 py-1 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">{{ s }}</span>
                </div>
              </div>
            </div>

            <!-- ═══ TAB: COVER LETTER ═══ -->
            <div v-if="detailTab === 'cover_letter'">
              <div v-if="detailApp.cover_letter || (getJobRawData(detailApp).cover_letter as string)" class="bg-neural-800/50 rounded-lg p-4 border border-neural-700/30 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{{ detailApp.cover_letter || getJobRawData(detailApp).cover_letter }}</div>
              <div v-else class="text-center py-8 text-gray-500">
                <p class="text-2xl mb-2">✉️</p>
                <p class="text-sm">No cover letter generated yet</p>
              </div>
            </div>

            <!-- ═══ TAB: HOW TO APPLY ═══ -->
            <div v-if="detailTab === 'apply'">
              <!-- Build merged channel list from raw_data + channel_executions -->
              <div class="space-y-2">
                <div class="flex items-center justify-between mb-1">
                  <p class="text-[9px] text-gray-500 uppercase font-medium tracking-wider">Application Channels</p>
                  <button @click="refreshChannelExec(detailApp.id)" class="px-2 py-1 bg-neural-700 text-gray-400 text-[9px] rounded hover:bg-neural-600 hover:text-white">↻ Refresh</button>
                </div>

                <!-- Raw data channels (AI-detected) -->
                <template v-for="(ch, i) in (getJobRawData(detailApp).apply_channels as {channel:string;status:string;detail:string;target?:string}[] || [])" :key="'raw-'+i">
                  <div class="flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors"
                    :class="{
                      'bg-green-500/5 border-green-500/20': ch.status === 'applied' || ch.status === 'done' || ch.status === 'sent',
                      'bg-orange-500/5 border-orange-500/20': ch.status === 'research_needed',
                      'bg-red-500/5 border-red-500/20': ch.status === 'failed',
                      'bg-neural-800/40 border-neural-700/30': !['applied','done','sent','research_needed','failed'].includes(ch.status)
                    }">
                    <!-- Icon -->
                    <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-lg"
                      :class="{
                        'bg-blue-500/15': ch.channel === 'job_board',
                        'bg-green-500/15': ch.channel === 'email' || ch.channel === 'recruiter_email',
                        'bg-purple-500/15': ch.channel === 'company_portal' || ch.channel === 'external_ats',
                        'bg-yellow-500/15': ch.channel === 'form',
                        'bg-cyan-500/15': ch.channel === 'cold_outreach' || ch.channel === 'linkedin',
                        'bg-neural-700': !['job_board','email','recruiter_email','company_portal','external_ats','form','cold_outreach','linkedin'].includes(ch.channel)
                      }">
                      {{ ch.channel === 'job_board' ? '🖥️' : ch.channel === 'email' ? '📧' : ch.channel === 'recruiter_email' ? '👤' : ch.channel === 'company_portal' ? '🏢' : ch.channel === 'external_ats' ? '📝' : ch.channel === 'form' ? '📋' : ch.channel === 'cold_outreach' ? '🤝' : ch.channel === 'linkedin' ? '💼' : '📌' }}
                    </div>
                    <!-- Info -->
                    <div class="flex-1 min-w-0">
                      <p class="text-[11px] font-semibold text-white">
                        {{ ch.channel === 'job_board' ? (detailApp.platform === 'indeed' ? 'Indeed Apply' : detailApp.platform === 'linkedin' ? 'LinkedIn Easy Apply' : 'Job Board Apply') : ch.channel === 'email' ? 'Direct Email' : ch.channel === 'recruiter_email' ? 'Recruiter Email' : ch.channel === 'company_portal' ? 'Company Website' : ch.channel === 'external_ats' ? 'ATS Form' : ch.channel === 'form' ? 'Application Form' : ch.channel === 'cold_outreach' ? 'Cold Outreach / LinkedIn' : ch.channel === 'linkedin' ? 'LinkedIn Message' : ch.channel.replace(/_/g,' ') }}
                      </p>
                      <p class="text-[10px] text-gray-500 truncate mt-0.5">{{ ch.detail }}</p>
                      <p v-if="ch.target && ch.target.startsWith('http')" class="text-[9px] text-cyber-cyan truncate mt-0.5">{{ ch.target }}</p>
                      <p v-else-if="ch.target && ch.target.includes('@')" class="text-[9px] text-green-400 mt-0.5">{{ ch.target }}</p>
                    </div>
                    <!-- Status + Action -->
                    <div class="flex flex-col items-end gap-1.5 shrink-0">
                      <span class="px-2 py-0.5 rounded-full text-[9px] font-medium"
                        :class="{
                          'bg-green-500/15 text-green-400': ['applied','done','sent'].includes(ch.status),
                          'bg-orange-500/15 text-orange-400': ch.status === 'research_needed',
                          'bg-red-500/15 text-red-400': ch.status === 'failed',
                          'bg-blue-500/15 text-blue-400': ch.status === 'pending',
                          'bg-gray-500/15 text-gray-400': !['applied','done','sent','research_needed','failed','pending'].includes(ch.status)
                        }">
                        {{ ch.status === 'applied' || ch.status === 'done' || ch.status === 'sent' ? '✓ Submitted' : ch.status === 'research_needed' ? 'Research Needed' : ch.status === 'pending' ? 'Pending' : ch.status === 'failed' ? 'Failed' : ch.status }}
                      </span>
                      <a v-if="ch.target && ch.target.startsWith('http')" :href="ch.target" target="_blank"
                        class="px-2 py-1 bg-cyber-purple/20 text-cyber-purple text-[9px] rounded hover:bg-cyber-purple/30 transition-colors">Open →</a>
                      <a v-else-if="ch.target && ch.target.includes('@')" :href="'mailto:'+ch.target"
                        class="px-2 py-1 bg-green-500/15 text-green-400 text-[9px] rounded hover:bg-green-500/25 transition-colors">Send Email</a>
                      <span v-else-if="ch.status === 'research_needed'" class="px-2 py-1 bg-orange-500/10 text-orange-400 text-[9px] rounded">Find Contact</span>
                    </div>
                  </div>
                </template>

                <!-- Fallback if no AI channels detected -->
                <template v-if="!(getJobRawData(detailApp).apply_channels as unknown[])?.length">
                  <!-- Always show job board channel -->
                  <div v-if="getJob(detailApp.job_listing_id)?.url" class="flex items-center gap-3 px-4 py-3 rounded-xl bg-neural-800/40 border border-neural-700/30">
                    <div class="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center text-lg shrink-0">🖥️</div>
                    <div class="flex-1 min-w-0">
                      <p class="text-[11px] font-semibold text-white">{{ detailApp.platform === 'indeed' ? 'Indeed Apply' : detailApp.platform === 'linkedin' ? 'LinkedIn Easy Apply' : 'Job Board' }}</p>
                      <p class="text-[9px] text-gray-500 truncate mt-0.5">{{ getJob(detailApp.job_listing_id)?.url }}</p>
                    </div>
                    <a :href="getJob(detailApp.job_listing_id)?.url" target="_blank" class="px-2 py-1 bg-cyber-purple/20 text-cyber-purple text-[9px] rounded hover:bg-cyber-purple/30">Open →</a>
                  </div>
                  <!-- Email channel if we have inferred email -->
                  <div v-if="getJobRawData(detailApp).recruiter_email || getJobRawData(detailApp).inferred_company_email" class="flex items-center gap-3 px-4 py-3 rounded-xl bg-neural-800/40 border border-neural-700/30">
                    <div class="w-9 h-9 rounded-lg bg-green-500/15 flex items-center justify-center text-lg shrink-0">📧</div>
                    <div class="flex-1 min-w-0">
                      <p class="text-[11px] font-semibold text-white">Direct Email</p>
                      <p class="text-[9px] text-green-400 mt-0.5">{{ getJobRawData(detailApp).recruiter_email || getJobRawData(detailApp).inferred_company_email }}</p>
                    </div>
                    <a :href="'mailto:'+(getJobRawData(detailApp).recruiter_email || getJobRawData(detailApp).inferred_company_email)" class="px-2 py-1 bg-green-500/15 text-green-400 text-[9px] rounded hover:bg-green-500/25">Send Email</a>
                  </div>
                  <!-- Cold outreach fallback -->
                  <div v-else class="flex items-center gap-3 px-4 py-3 rounded-xl bg-orange-500/5 border border-orange-500/20">
                    <div class="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center text-lg shrink-0">👤</div>
                    <div class="flex-1 min-w-0">
                      <p class="text-[11px] font-semibold text-white">Direct Email / Recruiter</p>
                      <p class="text-[9px] text-gray-500 mt-0.5">Find recruiter/HR email for {{ getJob(detailApp.job_listing_id)?.company }}</p>
                    </div>
                    <span class="px-2 py-1 bg-orange-500/10 text-orange-400 text-[9px] rounded">Research Needed</span>
                  </div>
                </template>

                <!-- Channel execution results from DB -->
                <template v-if="channelExecutions[detailApp.id]?.length">
                  <div class="pt-2 border-t border-neural-700/30 mt-2">
                    <p class="text-[9px] text-gray-600 uppercase font-medium mb-2">Execution History</p>
                    <div v-for="ex in channelExecutions[detailApp.id]" :key="ex.id" class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neural-800/20 mb-1">
                      <span class="text-xs">{{ ex.channel === 'job_board' ? '🖥️' : ex.channel === 'email' ? '📧' : ex.channel === 'company_portal' ? '🏢' : '📋' }}</span>
                      <span class="text-[10px] text-gray-400 flex-1 capitalize">{{ ex.channel?.replace(/_/g,' ') }}</span>
                      <span class="text-[9px] px-2 py-0.5 rounded-full"
                        :class="ex.status === 'applied' ? 'bg-green-500/15 text-green-400' : ex.status === 'failed' ? 'bg-red-500/15 text-red-400' : 'bg-blue-500/15 text-blue-400'">{{ ex.status }}</span>
                      <span v-if="ex.executed_at" class="text-[8px] text-gray-600">{{ new Date(ex.executed_at).toLocaleDateString() }}</span>
                    </div>
                  </div>
                </template>
              </div>

              <!-- Original listing link -->
              <div v-if="getJob(detailApp.job_listing_id)?.url" class="mt-4 pt-3 border-t border-neural-700/30">
                <a :href="getJob(detailApp.job_listing_id)?.url" target="_blank"
                  class="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyber-purple/20 to-cyber-cyan/20 border border-cyber-purple/30 text-white rounded-lg text-[11px] font-medium hover:from-cyber-purple/30 hover:to-cyber-cyan/30 transition-colors">
                  🔗 View Original Job Listing
                </a>
              </div>
            </div>

            <!-- ═══ TAB: PIPELINE (default) ═══ -->
            <div v-if="detailTab === 'pipeline'">
            <!-- Current Status -->
            <div class="text-center py-3">
              <p class="text-xs text-gray-500 mt-2">{{ daysSince(detailApp.created_at) }} days in pipeline</p>
            </div>

            <!-- Stage-by-stage pipeline -->
            <div class="space-y-1">
              <template v-for="stage in pipelineProgress(detailApp)" :key="stage.group">
                <div
                  class="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors"
                  :class="[
                    stage.active ? 'bg-neural-700/40 ring-1 ring-neural-600' : '',
                    stage.group === 'Application' && getTimelineForApp(detailApp).length ? 'cursor-pointer hover:bg-neural-700/30' : ''
                  ]"
                  @click="stage.group === 'Application' && getTimelineForApp(detailApp).length ? (applyAccordionExpanded[detailApp.id] = !applyAccordionExpanded[detailApp.id]) : null">
                  <div class="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                    :class="stage.completed ? stage.color + ' text-white' : stage.active ? stage.color + ' text-white animate-pulse' : 'bg-neural-700/50 text-gray-600'">
                    {{ stage.completed ? '✓' : stage.stage }}
                  </div>
                  <div class="flex-1">
                    <p class="text-xs font-medium" :class="stage.completed ? 'text-white' : stage.active ? 'text-white' : 'text-gray-600'">{{ stage.group }}</p>
                    <p v-if="stage.active" class="text-[10px]" :class="stage.text">Current stage — {{ detailApp.status.replace(/_/g, ' ') }}</p>
                    <p v-if="stage.group === 'Application' && getTimelineForApp(detailApp).length"
                       class="text-[10px] text-cyber-cyan mt-0.5">
                      {{ getTimelineForApp(detailApp).length }} step{{ getTimelineForApp(detailApp).length === 1 ? '' : 's' }} captured —
                      {{ applyAccordionExpanded[detailApp.id] ? 'click to collapse' : 'click to expand' }}
                    </p>
                  </div>
                  <span v-if="stage.completed" class="text-[10px] text-green-400">Done</span>
                  <span v-else-if="stage.active" class="text-[10px]" :class="stage.text">Active</span>
                  <span v-else class="text-[10px] text-gray-700">Pending</span>
                  <svg v-if="stage.group === 'Application' && getTimelineForApp(detailApp).length"
                    class="w-3 h-3 text-gray-500 transition-transform"
                    :class="applyAccordionExpanded[detailApp.id] ? 'rotate-90' : ''"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                  </svg>
                </div>

                <!-- ACCORDION: Application step timeline -->
                <div v-if="stage.group === 'Application' && applyAccordionExpanded[detailApp.id] && getTimelineForApp(detailApp).length"
                  class="ml-9 mr-2 pl-3 py-2 border-l border-cyber-cyan/30 space-y-1.5">
                  <div v-for="(s, sidx) in getTimelineForApp(detailApp)" :key="sidx"
                    class="flex items-start gap-2 text-[11px] py-1 px-2 rounded hover:bg-neural-700/30">
                    <span class="text-gray-600 shrink-0 font-mono w-5 text-right">{{ s.step ?? sidx + 1 }}.</span>
                    <span class="shrink-0">{{ actionInfo(s.action).icon }}</span>
                    <div class="flex-1 min-w-0">
                      <!-- Per-question events: show type badge + Q + A -->
                      <template v-if="s.action === 'answered_question'">
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <span class="px-1.5 py-0.5 rounded text-[9px] font-medium bg-neural-700"
                            :class="questionTypeInfo(s.question_type).color">
                            {{ questionTypeInfo(s.question_type).icon }} {{ questionTypeInfo(s.question_type).label }}
                          </span>
                          <span class="text-gray-400 truncate">Q: {{ s.question_text || '—' }}</span>
                        </div>
                        <p class="text-[10px] text-white mt-0.5 pl-1 border-l-2 border-cyber-cyan/40">
                          → {{ s.answer || '—' }}
                        </p>
                      </template>
                      <!-- Generic step -->
                      <template v-else>
                        <p class="text-gray-300">{{ actionInfo(s.action).label }}</p>
                        <p v-if="s.button_text" class="text-[10px] text-gray-500 truncate">"{{ s.button_text }}"</p>
                        <p v-else-if="s.fields_filled !== undefined" class="text-[10px] text-gray-500">{{ s.fields_filled }} fields filled</p>
                      </template>
                    </div>
                    <span class="text-[9px] text-gray-600 shrink-0 font-mono">{{ fmtTime(s.ts) }}</span>
                  </div>
                </div>
              </template>
            </div>

            <!-- Per-Channel Execution Status -->
            <div class="pt-3 border-t border-neural-700">
              <div class="flex items-center justify-between mb-2">
                <p class="text-[9px] text-gray-500 uppercase font-medium">Application Channels</p>
                <button @click="refreshChannelExec(detailApp.id)" class="px-2 py-1 bg-cyber-purple/15 text-cyber-purple text-[9px] rounded hover:bg-cyber-purple/25 transition-colors">
                  Refresh
                </button>
              </div>
              <div v-if="channelExecutions[detailApp.id]?.length" class="space-y-1.5">
                <div v-for="ch in channelExecutions[detailApp.id]" :key="ch.id"
                  class="flex items-center gap-3 px-3 py-2 rounded-lg bg-neural-800/50 border border-neural-700/30">
                  <span class="text-sm">{{ ch.channel === 'job_board' ? '🖱️' : ch.channel === 'email' ? '📧' : ch.channel === 'company_portal' ? '🏢' : ch.channel === 'recruiter' ? '👤' : ch.channel === 'cold_outreach' ? '🤝' : '📋' }}</span>
                  <div class="flex-1 min-w-0">
                    <p class="text-[11px] text-white font-medium capitalize">{{ ch.channel.replace(/_/g, ' ') }}</p>
                    <p class="text-[9px] text-gray-500 truncate">{{ ch.target || ch.platform || '—' }}</p>
                  </div>
                  <div class="text-right shrink-0">
                    <span class="px-2 py-0.5 rounded-full text-[9px] font-medium"
                      :class="ch.status === 'applied' ? 'bg-green-500/15 text-green-400' : ch.status === 'scheduled' ? 'bg-yellow-500/15 text-yellow-400' : ch.status === 'failed' ? 'bg-red-500/15 text-red-400' : ch.status === 'pending' ? 'bg-blue-500/15 text-blue-400' : 'bg-gray-500/15 text-gray-400'">
                      {{ ch.status }}
                    </span>
                    <p v-if="ch.executed_at" class="text-[8px] text-gray-600 mt-0.5">{{ new Date(ch.executed_at).toLocaleDateString() }}</p>
                    <p v-else-if="ch.scheduled_at" class="text-[8px] text-yellow-600 mt-0.5">Sched: {{ new Date(ch.scheduled_at).toLocaleString() }}</p>
                  </div>
                </div>
              </div>
              <div v-else class="text-[10px] text-gray-600 py-2">No channel executions recorded — email-only or legacy apply</div>
            </div>

            <!-- Key Info -->
            <div class="grid grid-cols-3 gap-2 pt-3 border-t border-neural-700">
              <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                <p class="text-[9px] text-gray-500 uppercase">Channel</p>
                <p class="text-xs text-white capitalize">{{ detailApp.channel }}{{ detailApp.agency_name ? ` — ${detailApp.agency_name}` : '' }}</p>
              </div>
              <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                <p class="text-[9px] text-gray-500 uppercase">Applied Via</p>
                <p class="text-xs text-white capitalize">{{ detailApp.applied_via || '—' }}</p>
              </div>
              <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                <p class="text-[9px] text-gray-500 uppercase">JD Compliance</p>
                <p class="text-xs text-green-400">Validated</p>
              </div>
              <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                <p class="text-[9px] text-gray-500 uppercase">Salary Offered</p>
                <p class="text-xs" :class="detailApp.salary_offered ? 'text-green-400' : 'text-gray-500'">{{ detailApp.salary_offered ? `${detailApp.salary_currency} ${detailApp.salary_offered.toLocaleString()}` : '—' }}</p>
              </div>
              <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                <p class="text-[9px] text-gray-500 uppercase">Follow-up</p>
                <p class="text-xs" :class="detailApp.follow_up_at ? (new Date(detailApp.follow_up_at) < new Date() ? 'text-red-400' : 'text-yellow-400') : 'text-gray-500'">
                  {{ detailApp.follow_up_at ? new Date(detailApp.follow_up_at).toLocaleDateString() : '—' }}
                </p>
              </div>
              <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                <p class="text-[9px] text-gray-500 uppercase">Days in Pipeline</p>
                <p class="text-xs text-white">{{ daysSince(detailApp.created_at) }}d</p>
              </div>
            </div>

            <!-- Application Log (if auto-applied) -->
            <div v-if="(detailApp as any).apply_log?.length" class="pt-3 border-t border-neural-700">
              <p class="text-[9px] text-gray-500 uppercase mb-2">Application Log</p>
              <div class="space-y-1 max-h-[120px] overflow-y-auto">
                <div v-for="(log, i) in (detailApp as any).apply_log" :key="i" class="flex items-center gap-2 text-[10px]">
                  <span :class="log.status === 'done' ? 'text-green-400' : log.status === 'failed' ? 'text-red-400' : 'text-gray-400'">{{ log.status === 'done' ? '✓' : log.status === 'failed' ? '✗' : '•' }}</span>
                  <span class="text-gray-300">{{ log.step }}</span>
                  <span class="text-gray-600 ml-auto">{{ log.message }}</span>
                </div>
              </div>
            </div>

            <!-- Notes -->
            <div v-if="detailApp.notes" class="pt-3 border-t border-neural-700">
              <p class="text-[9px] text-gray-500 uppercase mb-1">Notes</p>
              <p class="text-xs text-gray-300">{{ detailApp.notes }}</p>
            </div>

            </div><!-- end pipeline tab -->

            <!-- Actions (always visible) -->
            <div class="flex flex-wrap gap-2 pt-3 border-t border-neural-700">
              <button @click="openEdit(detailApp); showDetail = false" class="px-4 py-2 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-sm font-medium hover:opacity-90">Update Status</button>
              <a v-if="getJob(detailApp.job_listing_id)?.url" :href="getJob(detailApp.job_listing_id)?.url" target="_blank" class="px-4 py-2 bg-neural-700 text-gray-300 rounded-lg text-sm hover:bg-neural-600">View Job</a>
              <button @click="aiCheckStatus(detailApp)" :disabled="aiCheckingStatus" class="px-4 py-2 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-lg text-sm font-medium hover:bg-amber-500/25 disabled:opacity-50">
                {{ aiCheckingStatus ? 'Checking...' : 'AI Check Status' }}
              </button>
            </div>
          </div>
          <div class="px-6 py-3 border-t border-neural-700 shrink-0">
            <button @click="showDetail = false" class="w-full py-2 bg-neural-700 text-gray-300 rounded-lg text-sm hover:bg-neural-600">Close</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ═══ Edit Modal ═══ -->
    <Teleport to="body">
      <div v-if="showEdit" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" @click.self="showEdit = false">
        <div class="glass-dark rounded-xl p-6 w-full max-w-md border border-neural-600">
          <h3 class="text-sm font-bold text-white mb-4">Update Application</h3>
          <form @submit.prevent="saveEdit" class="space-y-4">
            <div>
              <label class="block text-[10px] text-gray-400 mb-1 uppercase">Status</label>
              <select v-model="editForm.status" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none">
                <optgroup v-for="p in PIPELINE" :key="p.group" :label="p.group">
                  <option v-for="s in p.statuses" :key="s" :value="s">{{ s.replace(/_/g, ' ') }}</option>
                </optgroup>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-[10px] text-gray-400 mb-1 uppercase">Channel</label><select v-model="editForm.channel" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none"><option value="direct">Direct</option><option value="agency">Agency</option><option value="freelance">Freelance</option></select></div>
              <div><label class="block text-[10px] text-gray-400 mb-1 uppercase">Agency</label><input v-model="editForm.agency_name" placeholder="Agency name..." class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" /></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-[10px] text-gray-400 mb-1 uppercase">Salary Offered</label><input v-model="editForm.salary_offered" type="number" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" /></div>
              <div><label class="block text-[10px] text-gray-400 mb-1 uppercase">Follow-up</label><input v-model="editForm.follow_up_at" type="date" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" /></div>
            </div>
            <div><label class="block text-[10px] text-gray-400 mb-1 uppercase">Notes</label><textarea v-model="editForm.notes" rows="3" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none resize-none" /></div>
            <div class="flex justify-end gap-2">
              <button type="button" @click="showEdit = false" class="px-4 py-2 bg-neural-700 text-gray-300 rounded-lg text-xs">Cancel</button>
              <button type="submit" class="px-4 py-2 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-xs font-medium hover:opacity-90">Save</button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

/**
 * NEURALYX Channel Performance Analytics
 * Aggregates application outcomes by channel, platform, company_bucket, role_type
 * Used by ML layer to predict channel success rates
 */

// Injected from api.ts
let supabaseQuery: (table: string, method: string, body?: unknown, filters?: string) => Promise<{ data: unknown; error?: string }>

export function initAnalytics(deps: { supabaseQuery: typeof supabaseQuery }) {
  supabaseQuery = deps.supabaseQuery
}

interface ChannelPerformanceRow {
  channel: string
  platform: string | null
  company_bucket: string | null
  role_type: string | null
  total_attempts: number
  successful_applies: number
  responses_received: number
  interviews_booked: number
  offers_received: number
  avg_response_days: number | null
}

/**
 * Aggregate channel performance from channel_executions + job_applications
 * Run nightly alongside the daily pipeline
 */
export async function aggregateChannelPerformance(): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = []
  let updated = 0

  try {
    // Fetch all channel executions with their application outcomes
    const { data: executions } = await supabaseQuery('channel_executions', 'GET', undefined, 'select=channel,platform,status,job_listing_id,application_id&order=created_at.desc&limit=1000')
    const { data: applications } = await supabaseQuery('job_applications', 'GET', undefined, 'select=id,job_listing_id,status&order=created_at.desc&limit=1000')
    const { data: listings } = await supabaseQuery('job_listings', 'GET', undefined, 'select=id,raw_data&limit=1000')

    const execs = (executions || []) as Record<string, unknown>[]
    const apps = (applications || []) as Record<string, unknown>[]
    const jobs = (listings || []) as Record<string, unknown>[]

    // Build lookup maps
    const appMap = new Map(apps.map(a => [a.id as string, a]))
    const jobMap = new Map(jobs.map(j => [j.id as string, j]))

    // Aggregate by channel + platform + company_bucket + role_type
    const aggregated = new Map<string, ChannelPerformanceRow>()

    for (const exec of execs) {
      const channel = exec.channel as string
      const platform = exec.platform as string || ''
      const jobId = exec.job_listing_id as string
      const appId = exec.application_id as string

      // Get job metadata
      const job = jobMap.get(jobId)
      const rd = (job?.raw_data || {}) as Record<string, unknown>
      const companyBucket = (rd.company_bucket as string) || ''
      const roleType = (rd.role_type as string) || ''

      const key = `${channel}|${platform}|${companyBucket}|${roleType}`

      if (!aggregated.has(key)) {
        aggregated.set(key, {
          channel, platform: platform || null, company_bucket: companyBucket || null, role_type: roleType || null,
          total_attempts: 0, successful_applies: 0, responses_received: 0, interviews_booked: 0, offers_received: 0, avg_response_days: null,
        })
      }

      const row = aggregated.get(key)!
      row.total_attempts++

      if (exec.status === 'applied') row.successful_applies++

      // Check application outcome
      const app = appMap.get(appId)
      if (app) {
        const appStatus = app.status as string
        if (['under_review', 'phone_screen', 'endorsed', 'screened_out'].includes(appStatus)) row.responses_received++
        if (appStatus.includes('interview')) row.interviews_booked++
        if (appStatus.includes('offer')) row.offers_received++
      }
    }

    // Upsert to channel_performance table
    for (const row of aggregated.values()) {
      const { error } = await supabaseQuery('channel_performance', 'POST', {
        channel: row.channel,
        platform: row.platform || '',
        company_bucket: row.company_bucket || '',
        role_type: row.role_type || '',
        total_attempts: row.total_attempts,
        successful_applies: row.successful_applies,
        responses_received: row.responses_received,
        interviews_booked: row.interviews_booked,
        offers_received: row.offers_received,
        last_updated: new Date().toISOString(),
      })
      if (error) {
        // Try PATCH (upsert not available with anon key)
        await supabaseQuery('channel_performance', 'PATCH', {
          total_attempts: row.total_attempts,
          successful_applies: row.successful_applies,
          responses_received: row.responses_received,
          interviews_booked: row.interviews_booked,
          offers_received: row.offers_received,
          last_updated: new Date().toISOString(),
        }, `channel=eq.${row.channel}&platform=eq.${row.platform || ''}&company_bucket=eq.${row.company_bucket || ''}&role_type=eq.${row.role_type || ''}`)
      }
      updated++
    }

    console.log(`[Analytics] Aggregated ${updated} channel performance rows from ${execs.length} executions`)
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'Aggregation failed')
  }

  return { updated, errors }
}

/**
 * Get channel performance predictions for a job
 * Simple heuristic-based (upgrades to ML later when enough data)
 */
export async function predictChannelSuccess(channel: string, platform: string, companyBucket: string, roleType: string): Promise<{ predicted_success_rate: number; confidence: string; data_points: number }> {
  const { data } = await supabaseQuery('channel_performance', 'GET', undefined,
    `channel=eq.${channel}&select=*&limit=10`)
  const rows = (data || []) as ChannelPerformanceRow[]

  if (!rows.length) {
    // Heuristic defaults when no data
    const defaults: Record<string, number> = {
      job_board: 0.15, email: 0.08, company_portal: 0.20, cold_outreach: 0.05, recruiter: 0.12,
    }
    return { predicted_success_rate: defaults[channel] || 0.10, confidence: 'heuristic', data_points: 0 }
  }

  const totalAttempts = rows.reduce((s, r) => s + r.total_attempts, 0)
  const totalResponses = rows.reduce((s, r) => s + r.responses_received, 0)
  const successRate = totalAttempts > 0 ? totalResponses / totalAttempts : 0.10

  return {
    predicted_success_rate: Math.round(successRate * 100) / 100,
    confidence: totalAttempts >= 50 ? 'high' : totalAttempts >= 20 ? 'medium' : 'low',
    data_points: totalAttempts,
  }
}

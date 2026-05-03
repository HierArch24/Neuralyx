/**
 * Orchestrator memory DB client.
 * Connects to the local Postgres (pgvector-enabled) that holds:
 *   orchestrator_state, apply_episodes, selectors_cache,
 *   success_embeddings, recovery_screenshots, chatbot_messages
 *
 * Kept separate from Supabase job tables by design — this is the dedicated
 * memory substrate, also dual-purposed as chatbot context store.
 */

import { Pool } from 'pg'

const ORCH_DB_HOST = process.env.ORCH_DB_HOST || 'neuralyx-postgres'
const ORCH_DB_PORT = parseInt(process.env.ORCH_DB_PORT || '5432', 10)
const ORCH_DB_NAME = process.env.ORCH_DB_NAME || 'neuralyx'
const ORCH_DB_USER = process.env.ORCH_DB_USER || 'neuralyx'
const ORCH_DB_PASS = process.env.ORCH_DB_PASS || 'neuralyx_dev'

let pool: Pool | null = null

export function getOrchPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: ORCH_DB_HOST,
      port: ORCH_DB_PORT,
      database: ORCH_DB_NAME,
      user: ORCH_DB_USER,
      password: ORCH_DB_PASS,
      max: 10,
      idleTimeoutMillis: 30000,
    })
    pool.on('error', (err) => {
      console.error('[OrchDB] pool error:', err.message)
    })
  }
  return pool
}

export async function orchQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const p = getOrchPool()
  const { rows } = await p.query(sql, params)
  return rows as T[]
}

export async function orchClose(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}

// ---------- Episode helpers ----------

export interface EpisodeRow {
  application_id: string
  job_listing_id?: string | null
  domain?: string | null
  channel?: string | null
  sub_agent?: string | null
  episode_type: string
  observation?: Record<string, unknown> | null
  action?: string | null
  outcome?: string | null
  reasoning?: string | null
  vision_summary?: string | null
  confidence?: number | null
  first_try_success?: boolean | null
  pre_flight_blockers?: Record<string, unknown>[] | null
  screenshot_path?: string | null
}

export async function insertEpisode(row: EpisodeRow): Promise<string> {
  const sql = `
    INSERT INTO apply_episodes (
      application_id, job_listing_id, domain, channel, sub_agent,
      episode_type, observation, action, outcome, reasoning,
      vision_summary, confidence, first_try_success, pre_flight_blockers,
      screenshot_path
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
    ) RETURNING id
  `
  const params = [
    row.application_id,
    row.job_listing_id || null,
    row.domain || null,
    row.channel || null,
    row.sub_agent || null,
    row.episode_type,
    row.observation ? JSON.stringify(row.observation) : null,
    row.action || null,
    row.outcome || null,
    row.reasoning || null,
    row.vision_summary || null,
    row.confidence ?? null,
    row.first_try_success ?? null,
    row.pre_flight_blockers ? JSON.stringify(row.pre_flight_blockers) : null,
    row.screenshot_path || null,
  ]
  const rows = await orchQuery<{ id: string }>(sql, params)
  return rows[0].id
}

export async function fetchEpisodes(
  applicationId: string,
  limit = 20
): Promise<Record<string, unknown>[]> {
  return orchQuery(
    `SELECT id, application_id, domain, channel, sub_agent, episode_type, observation, action, outcome, reasoning, vision_summary, confidence, first_try_success, created_at
     FROM apply_episodes WHERE application_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [applicationId, limit]
  )
}

// ---------- Selectors cache ----------

export async function getCachedSelectors(
  domain: string,
  buttonType: string,
  limit = 3
): Promise<string[]> {
  const rows = await orchQuery<{ working_selector: string }>(
    `SELECT working_selector FROM selectors_cache
     WHERE domain = $1 AND button_type = $2
       AND (success_count + 1.0) / (success_count + failure_count + 1.0) > 0.5
     ORDER BY success_count DESC LIMIT $3`,
    [domain, buttonType, limit]
  )
  return rows.map((r) => r.working_selector)
}

export async function recordSelectorOutcome(
  domain: string,
  buttonType: string,
  selector: string,
  success: boolean,
  episodeId?: string
): Promise<void> {
  const col = success ? 'success_count' : 'failure_count'
  await orchQuery(
    `INSERT INTO selectors_cache (domain, button_type, working_selector, ${col}, last_used, first_learned_from_episode)
     VALUES ($1,$2,$3,1,now(),$4)
     ON CONFLICT (domain, button_type, working_selector)
     DO UPDATE SET ${col} = selectors_cache.${col} + 1, last_used = now()`,
    [domain, buttonType, selector, episodeId || null]
  )
}

// ---------- Orchestrator state ----------

export async function upsertOrchestratorState(
  applicationId: string,
  channel: string,
  patch: Record<string, unknown>
): Promise<void> {
  const known = [
    'sub_agent', 'ats_type', 'current_step', 'step_name', 'step_attempts',
    'last_url', 'last_title', 'last_screenshot', 'failed_strategies',
    'last_decision', 'decision_conf', 'first_try_in_progress',
  ]
  const insertCols = ['application_id', 'channel'] as string[]
  const insertVals: unknown[] = [applicationId, channel]
  for (const k of known) {
    if (patch[k] !== undefined) {
      insertCols.push(k)
      insertVals.push(
        (k === 'failed_strategies' || k === 'last_screenshot') && typeof patch[k] === 'object'
          ? JSON.stringify(patch[k])
          : (patch[k] as unknown)
      )
    }
  }
  const placeholders = insertVals.map((_, i) => `$${i + 1}`).join(',')
  const updates = insertCols
    .filter((c) => c !== 'application_id' && c !== 'channel')
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ')
  const sql = `
    INSERT INTO orchestrator_state (${insertCols.join(',')})
    VALUES (${placeholders})
    ON CONFLICT (application_id, channel) DO UPDATE SET ${updates || 'updated_at = now()'}
  `
  await orchQuery(sql, insertVals)
}

export async function getOrchestratorState(
  applicationId: string
): Promise<Record<string, unknown>[]> {
  return orchQuery(
    `SELECT * FROM orchestrator_state WHERE application_id = $1 ORDER BY updated_at DESC`,
    [applicationId]
  )
}

// ---------- Email dedup (48h window per target_email + company) ----------

export async function wasRecentlyEmailed(
  targetEmail: string,
  company: string,
  hoursAgo = 48
): Promise<{ episode_id: string; sent_at: string } | null> {
  const rows = await orchQuery<{ id: string; created_at: string }>(
    `SELECT id, created_at FROM apply_episodes
     WHERE episode_type IN ('email_sent', 'email_delivered')
       AND observation->>'target_email' = $1
       AND observation->>'company' = $2
       AND created_at > now() - ($3 || ' hours')::interval
     ORDER BY created_at DESC LIMIT 1`,
    [targetEmail, company, String(hoursAgo)]
  )
  if (rows.length === 0) return null
  return { episode_id: rows[0].id, sent_at: rows[0].created_at }
}

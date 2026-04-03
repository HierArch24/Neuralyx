/**
 * Auto-Apply Agent — Orchestrates job applications
 * Supports: email, browser (job board), external forms, company portals, Google Forms
 */

import type { JobListing } from '@/types/database'

const getMcpUrl = () => import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'

export interface ApplyStep {
  action: string
  status: 'ready' | 'running' | 'done' | 'failed' | 'skipped' | 'pending'
  detail: string
  timestamp?: string
}

export interface ApplyPlan {
  application_type: string
  steps: ApplyStep[]
  cover_letter: string
  email_draft?: { to: string; subject: string; body: string } | null
  browser_instructions?: {
    url: string
    type: string
    fields_to_fill: Record<string, string>
    requires_login?: boolean
  } | null
}

export interface BatchResult {
  job_id: string
  title: string
  status: 'applied' | 'apply_failed' | 'needs_browser' | 'skipped'
  method: string
  detail: string
}

/**
 * Prepare an application plan for a single job
 */
export async function prepareApply(job: JobListing, profile?: Record<string, unknown>): Promise<ApplyPlan> {
  const res = await fetch(`${getMcpUrl()}/api/jobs/auto-apply/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job: { ...job, raw_data: job.raw_data }, profile }),
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error('Failed to prepare application plan')
  return await res.json()
}

/**
 * Send an email application
 */
export async function sendEmailApply(emailDraft: { to: string; subject: string; body: string }): Promise<{ success: boolean; detail: string; messageId?: string }> {
  const res = await fetch(`${getMcpUrl()}/api/jobs/auto-apply/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(emailDraft),
    signal: AbortSignal.timeout(30000),
  })
  return await res.json()
}

/**
 * Batch auto-apply to multiple jobs
 */
export async function batchAutoApply(
  jobs: JobListing[],
  profile?: Record<string, unknown>,
  mode: 'email_only' | 'all' = 'all',
): Promise<{ results: BatchResult[]; total: number; applied: number; failed: number; needs_browser: number }> {
  const res = await fetch(`${getMcpUrl()}/api/jobs/auto-apply/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobs: jobs.map(j => ({ ...j, raw_data: j.raw_data })), profile, mode }),
    signal: AbortSignal.timeout(600000), // 10 min for large batches
  })
  if (!res.ok) throw new Error('Batch apply failed')
  return await res.json()
}

/**
 * Get application type badge info
 */
export function getAppTypeBadge(type: string): { label: string; color: string; bg: string; icon: string } {
  const badges: Record<string, { label: string; color: string; bg: string; icon: string }> = {
    direct_apply: { label: 'Easy Apply', color: 'text-green-400', bg: 'bg-green-500/15', icon: '🟢' },
    direct_email: { label: 'Email', color: 'text-cyan-400', bg: 'bg-cyan-500/15', icon: '📧' },
    external_form: { label: 'Form', color: 'text-blue-400', bg: 'bg-blue-500/15', icon: '📋' },
    company_portal: { label: 'Portal', color: 'text-purple-400', bg: 'bg-purple-500/15', icon: '🏢' },
    google_form: { label: 'G-Form', color: 'text-yellow-400', bg: 'bg-yellow-500/15', icon: '📝' },
    unknown: { label: '?', color: 'text-gray-500', bg: 'bg-gray-500/15', icon: '❓' },
  }
  return badges[type] || badges.unknown
}

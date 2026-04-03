/**
 * 5 Parallel Detail-Fill Agents
 * Processes jobs in batches — fills role_type, company_bucket, match_score, etc.
 */

import type { JobListing } from '@/types/database'

const getMcpUrl = () => import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'

export interface FillResult {
  id: string
  data: {
    role_type?: string
    company_bucket?: string
    company_type_detail?: string
    application_type?: string
    apply_channels?: { channel: string; status: string; detail: string; target?: string }[]
    expected_filtering_layers?: string[]
    apply_method?: string
    requires_registration?: boolean
    recruiter_email?: string
    inferred_company_email?: string
    company_careers_url?: string
    external_form_url?: string
    ats_system?: string
    work_arrangement?: string
    country?: string
    match_score?: number
    skill_matches?: string[]
    skill_gaps?: string[]
    seniority?: string
    salary_estimate?: string
    recommendation?: string
  }
}

export async function fillJobDetails(
  jobs: JobListing[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ results: FillResult[]; errors: string[] }> {
  const payload = jobs.map(j => ({
    id: j.id, title: j.title, company: j.company,
    description: j.description, location: j.location, url: j.url,
  }))

  try {
    const res = await fetch(`${getMcpUrl()}/api/jobs/fill-details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobs: payload }),
      signal: AbortSignal.timeout(300000), // 5 min for large batches
    })

    if (res.ok) {
      const data = await res.json()
      onProgress?.(data.processed, data.total)
      return { results: data.results || [], errors: data.errors || [] }
    }
    return { results: [], errors: ['Fill-details API failed'] }
  } catch (e) {
    return { results: [], errors: [e instanceof Error ? e.message : 'Failed'] }
  }
}

/**
 * Process and save filled details to Supabase via admin store
 */
export function buildUpdatePayload(result: FillResult): Record<string, unknown> {
  const d = result.data
  return {
    match_score: d.match_score || null,
    raw_data: {
      role_type: d.role_type || null,
      company_bucket: d.company_bucket || null,
      company_type_detail: d.company_type_detail || null,
      application_type: d.application_type || 'unknown',
      apply_channels: d.apply_channels || [{ channel: 'job_board', status: 'pending', detail: 'Apply via job board' }],
      expected_filtering_layers: d.expected_filtering_layers || ['resume_screen', 'interview'],
      apply_method: d.apply_method || null,
      requires_registration: d.requires_registration || false,
      recruiter_email: d.recruiter_email || null,
      inferred_company_email: d.inferred_company_email || null,
      company_careers_url: d.company_careers_url || null,
      external_form_url: d.external_form_url || null,
      ats_system: d.ats_system || 'unknown',
      work_arrangement: d.work_arrangement || null,
      country: d.country || null,
      skill_matches: d.skill_matches || [],
      skill_gaps: d.skill_gaps || [],
      seniority: d.seniority || null,
      salary_estimate: d.salary_estimate || null,
      recommendation: d.recommendation || null,
    },
  }
}

// Platform logos (emoji + color)
export const PLATFORM_CONFIG: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  indeed: { label: 'Indeed', emoji: '🔵', color: 'text-blue-400', bg: 'bg-blue-500/15' },
  linkedin: { label: 'LinkedIn', emoji: '🟦', color: 'text-sky-400', bg: 'bg-sky-500/15' },
  glassdoor: { label: 'Glassdoor', emoji: '🟢', color: 'text-green-400', bg: 'bg-green-500/15' },
  ziprecruiter: { label: 'ZipRecruiter', emoji: '✅', color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  google: { label: 'Google Jobs', emoji: '🔴', color: 'text-red-300', bg: 'bg-red-500/15' },
  remoteok: { label: 'RemoteOK', emoji: '🌍', color: 'text-teal-400', bg: 'bg-teal-500/15' },
  remotive: { label: 'Remotive', emoji: '🏠', color: 'text-indigo-400', bg: 'bg-indigo-500/15' },
  himalayas: { label: 'Himalayas', emoji: '⛰️', color: 'text-amber-400', bg: 'bg-amber-500/15' },
  hackernews: { label: 'HN/YC', emoji: '🟧', color: 'text-orange-400', bg: 'bg-orange-500/15' },
  arbeitnow: { label: 'Arbeitnow', emoji: '🇪🇺', color: 'text-pink-400', bg: 'bg-pink-500/15' },
  adzuna: { label: 'Adzuna', emoji: '🔶', color: 'text-yellow-400', bg: 'bg-yellow-500/15' },
  careersatmanulife: { label: 'Manulife', emoji: '🏦', color: 'text-green-300', bg: 'bg-green-500/15' },
  accenture: { label: 'Accenture', emoji: '🏢', color: 'text-purple-400', bg: 'bg-purple-500/15' },
  unitedhealthgroup: { label: 'UnitedHealth', emoji: '🏥', color: 'text-blue-300', bg: 'bg-blue-500/15' },
  bebee: { label: 'BeBee', emoji: '🐝', color: 'text-yellow-300', bg: 'bg-yellow-500/15' },
  jobleads: { label: 'JobLeads', emoji: '📍', color: 'text-cyan-300', bg: 'bg-cyan-500/15' },
}

export function getPlatform(key: string) {
  return PLATFORM_CONFIG[key] || { label: key, emoji: '💼', color: 'text-gray-400', bg: 'bg-gray-500/15' }
}

// Country flag emoji
export function countryFlag(code: string | null | undefined): string {
  if (!code || code === 'Remote') return '🌐'
  const c = code.toUpperCase()
  if (c === 'PH') return '🇵🇭'
  if (c === 'US') return '🇺🇸'
  if (c === 'GB' || c === 'UK') return '🇬🇧'
  if (c === 'AU') return '🇦🇺'
  if (c === 'CA') return '🇨🇦'
  if (c === 'SG') return '🇸🇬'
  if (c === 'DE') return '🇩🇪'
  if (c === 'IN') return '🇮🇳'
  if (c === 'JP') return '🇯🇵'
  // Generic regional indicator
  if (c.length === 2) {
    return String.fromCodePoint(...[...c].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65))
  }
  return '🌐'
}

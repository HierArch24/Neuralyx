/**
 * Scout Agent — Searches jobs across multiple platforms
 * Works both via MCP server (local) and direct API calls (live site)
 */

export interface SearchResult {
  platform: string
  external_id: string | null
  title: string
  company: string
  location: string | null
  salary_min: number | null
  salary_max: number | null
  salary_currency: string
  job_type: string | null
  description: string | null
  requirements: string | null
  url: string
  posted_at: string | null
  status: string
}

interface SearchParams {
  query: string
  location?: string
  job_type?: string
  platform?: string
  page?: number
}

const getMcpUrl = () => import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'

/**
 * Main search function — tries MCP server first, falls back to direct API
 */
export async function searchJobs(
  params: SearchParams,
  onStatus?: (msg: string) => void,
): Promise<{ jobs: SearchResult[]; errors: string[] }> {
  const { query, location, platform } = params
  if (!query.trim()) return { jobs: [], errors: [] }

  // Try MCP server first (has JSearch + Adzuna configured)
  onStatus?.('Searching via job server...')
  try {
    const res = await fetch(`${getMcpUrl()}/api/jobs/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(15000),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.jobs?.length > 0) {
        onStatus?.(`Found ${data.jobs.length} jobs`)
        return data
      }
    }
  } catch { /* MCP not available */ }

  // Fallback: call free APIs directly from browser (no auth needed)
  const allJobs: SearchResult[] = []
  const errors: string[] = []

  // RemoteOK (free, no auth, CORS-friendly)
  onStatus?.('Searching RemoteOK...')
  try {
    const res = await fetch('https://remoteok.com/api', { signal: AbortSignal.timeout(10000) })
    if (res.ok) {
      const data = await res.json()
      const jobs = (Array.isArray(data) ? data.filter((j: Record<string, unknown>) => j.id && j.position) : [])
        .filter((j: Record<string, unknown>) => {
          const text = `${j.position} ${j.company} ${(j.tags as string[] || []).join(' ')}`.toLowerCase()
          return query.split(' ').some(w => text.includes(w.toLowerCase()))
        })
        .slice(0, 20)
        .map((j: Record<string, unknown>): SearchResult => ({
          platform: 'remoteok', external_id: j.id ? String(j.id) : null,
          title: (j.position as string) || 'Untitled', company: (j.company as string) || 'Unknown',
          location: (j.location as string) || 'Remote',
          salary_min: j.salary_min ? Number(j.salary_min) : null,
          salary_max: j.salary_max ? Number(j.salary_max) : null,
          salary_currency: 'USD', job_type: 'remote',
          description: ((j.description as string) || '').slice(0, 5000) || null, requirements: null,
          url: (j.url as string) || '', posted_at: (j.date as string) || null, status: 'new',
        }))
      allJobs.push(...jobs)
    }
  } catch { errors.push('RemoteOK unavailable') }

  // Remotive (free, no auth)
  onStatus?.('Searching Remotive...')
  try {
    const res = await fetch(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}&limit=20`, { signal: AbortSignal.timeout(10000) })
    if (res.ok) {
      const data = await res.json()
      const jobs = (data.jobs || []).map((j: Record<string, unknown>): SearchResult => ({
        platform: 'remotive', external_id: j.id ? String(j.id) : null,
        title: (j.title as string) || 'Untitled', company: (j.company_name as string) || 'Unknown',
        location: (j.candidate_required_location as string) || 'Remote',
        salary_min: null, salary_max: null, salary_currency: 'USD',
        job_type: ((j.job_type as string) || 'remote').toLowerCase(),
        description: ((j.description as string) || '').slice(0, 5000) || null, requirements: null,
        url: (j.url as string) || '', posted_at: (j.publication_date as string) || null, status: 'new',
      }))
      allJobs.push(...jobs)
    }
  } catch { errors.push('Remotive unavailable') }

  // JSearch (if key available)
  const jsearchKey = import.meta.env.VITE_JSEARCH_KEY || ''
  if (jsearchKey) {
    onStatus?.('Searching JSearch...')
    try {
      const jobs = await searchJSearchDirect(query, location || '', jsearchKey, platform)
      allJobs.push(...jobs)
    } catch { errors.push('JSearch failed') }
  }

  if (allJobs.length > 0) {
    onStatus?.(`Found ${allJobs.length} jobs`)
    return { jobs: allJobs, errors }
  }

  return { jobs: [], errors: errors.length ? errors : ['No results found. Try different keywords.'] }
}

/**
 * Direct JSearch API call (works from browser, no CORS issues)
 */
async function searchJSearchDirect(
  query: string, location: string, apiKey: string, platform?: string,
): Promise<SearchResult[]> {
  const searchQuery = location ? `${query} in ${location}` : query
  const params = new URLSearchParams({
    query: searchQuery,
    page: '1',
    num_pages: '1',
    date_posted: 'month',
  })

  const res = await fetch(`https://jsearch.p.rapidapi.com/search?${params}`, {
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
    },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`JSearch API error ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json()
  const jobs: SearchResult[] = (data.data || []).map((j: Record<string, unknown>) => {
    const employer = j.employer_name as string || 'Unknown'
    const city = j.job_city as string || ''
    const state = j.job_state as string || ''
    const country = j.job_country as string || ''
    const publisher = (j.job_publisher as string || 'google').toLowerCase().replace(/\.com$/, '').replace(/\s+/g, '')
    const empType = (j.job_employment_type as string || '').toLowerCase().replace('_', '-')
    const highlights = j.job_highlights as Record<string, string[]> | null

    return {
      platform: publisher,
      external_id: (j.job_id as string) || null,
      title: (j.job_title as string) || 'Untitled',
      company: employer,
      location: [city, state, country].filter(Boolean).join(', ') || null,
      salary_min: (j.job_min_salary as number) || null,
      salary_max: (j.job_max_salary as number) || null,
      salary_currency: (j.job_salary_currency as string) || 'USD',
      job_type: empType || null,
      description: ((j.job_description as string) || '').slice(0, 5000) || null,
      requirements: highlights?.Qualifications?.join('\n') || null,
      url: (j.job_apply_link as string) || (j.job_google_link as string) || '',
      posted_at: (j.job_posted_at_datetime_utc as string) || null,
      status: 'new',
    }
  })

  // Filter by platform if specified
  if (platform) return jobs.filter(j => j.platform.includes(platform))
  return jobs
}

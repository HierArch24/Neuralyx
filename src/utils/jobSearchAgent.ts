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

  // Fallback: direct JSearch API from browser
  onStatus?.('Searching JSearch API directly...')
  const jsearchKey = import.meta.env.VITE_JSEARCH_KEY || ''
  if (jsearchKey) {
    try {
      const jobs = await searchJSearchDirect(query, location || '', jsearchKey, platform)
      onStatus?.(`Found ${jobs.length} jobs from JSearch`)
      return { jobs, errors: [] }
    } catch (e) {
      return { jobs: [], errors: [`JSearch: ${e instanceof Error ? e.message : 'failed'}`] }
    }
  }

  // No API keys — show instructions
  return {
    jobs: [],
    errors: [
      'No job search API configured.',
      'Option 1: Run MCP server locally (docker compose up -d)',
      'Option 2: Add JSEARCH_API_KEY to .env (get free key at rapidapi.com → JSearch)',
    ],
  }
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

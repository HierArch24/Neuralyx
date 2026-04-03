/**
 * Phase 2: Playwright Scraper Agent
 * Scrapes job listings from account-based platforms via BrowserMCP/Playwright MCP
 * Called from the frontend — uses the user's logged-in Edge session
 */

import type { SearchResult } from './jobSearchAgent'

const PLATFORM_SCRAPERS: Record<string, {
  url: (query: string) => string
  parseSelector: string
  name: string
}> = {
  jobstreet: {
    url: (q: string) => `https://ph.jobstreet.com/${encodeURIComponent(q)}-jobs`,
    parseSelector: 'article[data-testid="job-card"]',
    name: 'JobStreet PH',
  },
  kalibrr: {
    url: (q: string) => `https://www.kalibrr.com/home?keyword=${encodeURIComponent(q)}`,
    parseSelector: '.job-card',
    name: 'Kalibrr',
  },
  onlinejobs: {
    url: (q: string) => `https://www.onlinejobs.ph/jobseekers/jobsearch?jobkeyword=${encodeURIComponent(q)}`,
    parseSelector: '.latest-job-post',
    name: 'OnlineJobs.ph',
  },
  bossjob: {
    url: (q: string) => `https://www.bossjob.ph/jobs?keyword=${encodeURIComponent(q)}`,
    parseSelector: '.job-card',
    name: 'Bossjob',
  },
  freelancer: {
    url: (q: string) => `https://www.freelancer.com/jobs/?keyword=${encodeURIComponent(q)}`,
    parseSelector: '.JobSearchCard-item',
    name: 'Freelancer.com',
  },
  toptal: {
    url: (_q: string) => 'https://www.toptal.com/developers/jobs',
    parseSelector: '.job-listing',
    name: 'Toptal',
  },
  metacareers: {
    url: (q: string) => `https://www.metacareers.com/jobs?q=${encodeURIComponent(q)}`,
    parseSelector: '.job-card',
    name: 'Meta Careers',
  },
  jobslin: {
    url: (q: string) => `https://ph.jobslin.com/jobs?q=${encodeURIComponent(q)}`,
    parseSelector: '.job-card',
    name: 'Jobslin PH',
  },
}

/**
 * Scrape a single platform via MCP server proxy to SearXNG
 * Falls back to parsing the platform's public search results page
 */
export async function scrapePlaywrightPlatform(
  platformId: string,
  query: string,
  onStatus?: (msg: string) => void,
): Promise<{ jobs: SearchResult[]; error?: string }> {
  const scraper = PLATFORM_SCRAPERS[platformId]
  if (!scraper) return { jobs: [], error: `Unknown platform: ${platformId}` }

  onStatus?.(`Scraping ${scraper.name}...`)
  const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'

  try {
    // Use SearXNG to search the specific platform site
    const searchQuery = `site:${new URL(scraper.url(query)).hostname} ${query}`
    const res = await fetch(`${mcpUrl}/api/jobs/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: searchQuery, platform: platformId }),
      signal: AbortSignal.timeout(20000),
    })

    if (res.ok) {
      const data = await res.json()
      if (data.jobs?.length > 0) {
        // Tag with correct platform
        const jobs = data.jobs.map((j: SearchResult) => ({ ...j, platform: platformId }))
        onStatus?.(`${scraper.name}: ${jobs.length} jobs found`)
        return { jobs }
      }
    }

    // Fallback: direct fetch of the search page and parse
    onStatus?.(`${scraper.name}: trying direct fetch...`)
    const pageRes = await fetch(scraper.url(query), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(15000),
    })

    if (pageRes.ok) {
      const html = await pageRes.text()
      const jobs = parseJobsFromHTML(html, platformId, scraper.name)
      onStatus?.(`${scraper.name}: ${jobs.length} jobs parsed`)
      return { jobs }
    }

    return { jobs: [], error: `${scraper.name}: fetch failed` }
  } catch (e) {
    return { jobs: [], error: `${scraper.name}: ${e instanceof Error ? e.message : 'failed'}` }
  }
}

/**
 * Scrape multiple platforms in parallel
 */
export async function scrapeAllPlaywrightPlatforms(
  platforms: string[],
  query: string,
  onStatus?: (msg: string) => void,
): Promise<{ jobs: SearchResult[]; errors: string[] }> {
  const allJobs: SearchResult[] = []
  const errors: string[] = []

  const results = await Promise.allSettled(
    platforms.map(p => scrapePlaywrightPlatform(p, query, onStatus))
  )

  for (const r of results) {
    if (r.status === 'fulfilled') {
      allJobs.push(...r.value.jobs)
      if (r.value.error) errors.push(r.value.error)
    } else {
      errors.push(r.reason?.message || 'Platform scrape failed')
    }
  }

  return { jobs: allJobs, errors }
}

/**
 * Basic HTML parser for job listings
 * Extracts job data from common patterns in HTML
 */
function parseJobsFromHTML(html: string, platform: string, _platformName: string): SearchResult[] {
  const jobs: SearchResult[] = []

  // Extract JSON-LD structured data if available
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)
  if (jsonLdMatch) {
    for (const match of jsonLdMatch) {
      try {
        const jsonStr = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '')
        const data = JSON.parse(jsonStr)
        const postings = Array.isArray(data) ? data : data['@type'] === 'JobPosting' ? [data] : data.itemListElement?.map((i: Record<string, unknown>) => i.item) || []
        for (const p of postings) {
          if (p['@type'] !== 'JobPosting') continue
          jobs.push({
            platform, external_id: p.identifier?.value || null,
            title: p.title || 'Untitled', company: p.hiringOrganization?.name || 'Unknown',
            location: p.jobLocation?.address?.addressLocality || p.jobLocationType || null,
            salary_min: p.baseSalary?.value?.minValue || null,
            salary_max: p.baseSalary?.value?.maxValue || null,
            salary_currency: p.baseSalary?.currency || 'PHP',
            job_type: p.employmentType || null,
            description: (p.description || '').replace(/<[^>]+>/g, ' ').slice(0, 5000) || null,
            requirements: null, url: p.url || '', posted_at: p.datePosted || null, status: 'new',
          })
        }
      } catch { /* skip invalid JSON-LD */ }
    }
  }

  // Fallback: regex patterns for common job listing HTML
  if (jobs.length === 0) {
    const titleMatches = html.match(/(?:job-title|position|listing-title)[^"]*"[^>]*>([^<]+)/gi) || []
    const companyMatches = html.match(/(?:company-name|employer|org-name)[^"]*"[^>]*>([^<]+)/gi) || []
    const urlMatches = html.match(/href="(\/(?:jobs?|c|listing)[^"]*?)"/gi) || []

    const count = Math.min(titleMatches.length, 20)
    for (let i = 0; i < count; i++) {
      const title = titleMatches[i]?.replace(/<[^>]+>/g, '').replace(/.*>/, '').trim()
      const company = companyMatches[i]?.replace(/<[^>]+>/g, '').replace(/.*>/, '').trim()
      if (!title) continue
      jobs.push({
        platform, external_id: null,
        title, company: company || 'Unknown',
        location: null, salary_min: null, salary_max: null, salary_currency: 'PHP',
        job_type: null, description: null, requirements: null,
        url: urlMatches[i]?.replace(/href="/, '').replace(/"$/, '') || '',
        posted_at: null, status: 'new',
      })
    }
  }

  return jobs
}

export const PLAYWRIGHT_PLATFORMS = Object.keys(PLATFORM_SCRAPERS)

/**
 * LinkedIn Platform Adapter
 * Handles job search (guest API + logged-in browser) and Easy Apply.
 */

import { spawn } from 'child_process'
import { join } from 'path'
import type {
  PlatformAdapter, NormalizedJob, JobDetail, ApplicationType,
  ApplyPayload, ApplyResult, RecruiterInfo, SearchFilters, PlatformLimits,
} from './platform-adapter.interface.js'

const SCRIPTS_DIR = join(process.cwd(), '..', 'scripts')
const MCP_URL = process.env.MCP_SERVER_URL || 'http://localhost:8080'

// LinkedIn job URL patterns that indicate Easy Apply
const LINKEDIN_EASY_APPLY_SIGNAL = /linkedin\.com\/jobs\/(view|search)/

// ATS URL patterns for external apply detection
const ATS_PATTERNS: Record<string, RegExp> = {
  workday:         /myworkday\.com|wd\d+\.myworkdayjobs\.com/,
  greenhouse:      /greenhouse\.io|boards\.greenhouse\.io/,
  lever:           /lever\.co/,
  ashby:           /ashbyhq\.com/,
  bamboohr:        /bamboohr\.com/,
  icims:           /icims\.com/,
  smartrecruiters: /smartrecruiters\.com/,
  jobvite:         /jobvite\.com/,
  taleo:           /taleo\.net/,
}

export class LinkedInAdapter implements PlatformAdapter {
  readonly name = 'linkedin'
  readonly baseUrl = 'https://www.linkedin.com'
  readonly supportsEasyApply = true
  readonly requiresProfile = true
  readonly defaultApplicationType: ApplicationType = 'linkedin_easy_apply'
  readonly limits: PlatformLimits = {
    maxAppsPerRun: 25,
    maxAppsPerDay: 50,
    maxConnectionsPerDay: 5,
    minSecsBetweenApps: [45, 120],
    minSecsBetweenSteps: [2, 5],
    maxRetries: 2,
  }

  // ─── Search ───

  async search(queries: string[], filters: SearchFilters): Promise<NormalizedJob[]> {
    const allJobs: NormalizedJob[] = []
    const seen = new Set<string>()

    for (const query of queries) {
      // Path A: LinkedIn guest API (fast, no auth, basic fields)
      try {
        const guestJobs = await this._searchGuestApi(query, filters)
        for (const job of guestJobs) {
          const key = `${job.title.toLowerCase()}::${job.company.toLowerCase()}`
          if (!seen.has(key)) {
            seen.add(key)
            allJobs.push(job)
          }
        }
      } catch (e) {
        console.log(`[LinkedIn] Guest API error for "${query}": ${e}`)
      }
    }

    return allJobs
  }

  private async _searchGuestApi(query: string, filters: SearchFilters): Promise<NormalizedJob[]> {
    const params = new URLSearchParams({
      keywords: query,
      location: filters.location || 'Philippines',
      start: '0',
      ...(filters.easy_apply_only ? { f_AL: 'true' } : {}),
      ...(filters.days ? { f_TPR: `r${filters.days * 86400}` } : {}),
    })

    const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })

    if (!res.ok) return []
    const html = await res.text()

    // Parse job cards from HTML
    const jobs: NormalizedJob[] = []
    const cardRegex = /<li[^>]*>[\s\S]*?<\/li>/g
    const cards = html.match(cardRegex) || []

    for (const card of cards) {
      const idMatch = card.match(/data-entity-urn="[^"]*:(\d+)"/)
      const titleMatch = card.match(/class="[^"]*sr-only[^"]*"[^>]*>([^<]+)</)
      const companyMatch = card.match(/<h4[^>]*>([^<]+)<\/h4>/)
      const locationMatch = card.match(/class="[^"]*job-search-card__location[^"]*"[^>]*>([^<]+)</)
      const urlMatch = card.match(/href="(https:\/\/www\.linkedin\.com\/jobs\/view\/[^"?]+)/)
      const easyApplyMatch = /Easy Apply/i.test(card)

      if (!idMatch || !titleMatch || !urlMatch) continue

      jobs.push({
        platform: 'linkedin',
        external_id: idMatch[1],
        title: titleMatch[1].trim(),
        company: companyMatch ? companyMatch[1].trim() : '',
        location: locationMatch ? locationMatch[1].trim() : null,
        salary_min: null,
        salary_max: null,
        salary_currency: 'PHP',
        job_type: null,
        description: null,
        requirements: null,
        url: urlMatch[1],
        posted_at: null,
        match_score: null,
        status: 'new',
        easy_apply: easyApplyMatch,
        poster_name: null,
        poster_linkedin_url: null,
        applicant_count: null,
        application_type: easyApplyMatch ? 'linkedin_easy_apply' : 'unknown',
        ats_type: null,
      })
    }

    return jobs
  }

  // ─── Job Detail ───

  async getJobDetail(jobUrl: string): Promise<JobDetail> {
    // Runs enrich-linkedin-job.ts script to get full data via logged-in browser
    const result = await this._runScript('enrich-linkedin-job.ts', { url: jobUrl })
    return result as JobDetail
  }

  // ─── Application Type Detection ───

  async detectApplicationType(job: NormalizedJob): Promise<ApplicationType> {
    // If we already know (from scrape), return it
    if (job.application_type !== 'unknown') return job.application_type as ApplicationType

    // URL-based heuristic
    if (LINKEDIN_EASY_APPLY_SIGNAL.test(job.url) && job.easy_apply) {
      return 'linkedin_easy_apply'
    }

    // Check for ATS URLs
    for (const [ats, pattern] of Object.entries(ATS_PATTERNS)) {
      if (pattern.test(job.url)) {
        return 'linkedin_external'
      }
    }

    // If the URL is off LinkedIn, it's external
    if (!job.url.includes('linkedin.com')) {
      return 'linkedin_external'
    }

    return 'linkedin_easy_apply'
  }

  // ─── Apply ───

  async apply(payload: ApplyPayload): Promise<ApplyResult> {
    const appType = payload.job_url.includes('linkedin.com') ? 'linkedin_easy_apply' : 'linkedin_external'

    if (appType === 'linkedin_easy_apply') {
      return this._runScript('apply-linkedin.ts', {
        url: payload.job_url,
        id: payload.job_id,
        title: payload.job_title,
        company: payload.company,
        cover_letter: payload.cover_letter,
      }) as Promise<ApplyResult>
    }

    // External: detect ATS and use external-ats script
    const atsType = this._detectAtsType(payload.job_url)
    return this._runScript('apply-external-ats.ts', {
      url: payload.job_url,
      id: payload.job_id,
      title: payload.job_title,
      company: payload.company,
      cover_letter: payload.cover_letter,
      ats_type: atsType,
      form_mapping: payload.form_mapping,
    }) as Promise<ApplyResult>
  }

  // ─── Recruiter Info ───

  async getRecruiterInfo(job: NormalizedJob): Promise<RecruiterInfo | null> {
    if (!job.poster_linkedin_url && !job.poster_name) return null
    return {
      found: true,
      recruiter_name: job.poster_name,
      recruiter_first_name: job.poster_name?.split(' ')[0] || null,
      recruiter_title: null,
      recruiter_linkedin_url: job.poster_linkedin_url,
      recruiter_email: null,
      email_confidence: 'none',
      company_domain: null,
    }
  }

  // ─── Session Check ───

  async checkSessionValid(): Promise<boolean> {
    try {
      const res = await fetch('https://www.linkedin.com/feed/', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        redirect: 'manual',
      })
      // If logged in: 200. If not: 302 to /login
      if (res.status === 200) return true
      // Try via CDP check (more reliable)
      const cdpRes = await fetch('http://127.0.0.1:9222/json/list').catch(() => null)
      if (!cdpRes) return false
      const tabs = await cdpRes.json() as { url: string }[]
      return tabs.some(t => t.url.includes('linkedin.com'))
    } catch {
      return false
    }
  }

  // ─── Helpers ───

  private _detectAtsType(url: string): string | null {
    for (const [ats, pattern] of Object.entries(ATS_PATTERNS)) {
      if (pattern.test(url)) return ats
    }
    return null
  }

  private _runScript(scriptName: string, input: object): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const scriptPath = join(SCRIPTS_DIR, scriptName)
      const proc = spawn('npx', ['tsx', scriptPath, '--stdin'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      })

      proc.stdin.write(JSON.stringify(input))
      proc.stdin.end()

      let stdout = ''
      let stderr = ''
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

      proc.on('close', (code) => {
        // Extract JSON result from stdout (last line that parses)
        const lines = stdout.trim().split('\n').reverse()
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line)
            resolve(parsed)
            return
          } catch {}
        }
        if (code !== 0) {
          reject(new Error(`Script ${scriptName} exited ${code}: ${stderr.slice(0, 200)}`))
        } else {
          resolve({ status: 'failed', detail: 'No JSON output from script' })
        }
      })

      proc.on('error', reject)
    })
  }
}

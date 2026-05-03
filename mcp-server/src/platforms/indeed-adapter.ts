/**
 * Indeed Platform Adapter
 *
 * Delegates to existing Indeed scripts:
 *   apply-indeed.ts        — Easy Apply via Edge Profile 7 (main apply path)
 *   indeed-apply-engine.ts — Form-step orchestration engine (multi-step forms)
 *   indeed-vision-agent.ts — Vision-based form analysis
 *
 * Indeed apply scenarios:
 *   indeed_easy_apply   — "Easy Apply" button on ph.indeed.com (same page modal)
 *   indeed_form         — Multi-step form (3+ steps, resume upload, screening Q)
 *   indeed_external     — Redirects to company ATS (workday, greenhouse, etc.)
 *   indeed_company_site — Redirects to company careers page (no ATS detected)
 */

import { spawn } from 'child_process'
import { join } from 'path'
import type {
  PlatformAdapter, NormalizedJob, JobDetail, ApplicationType,
  ApplyPayload, ApplyResult, RecruiterInfo, SearchFilters, PlatformLimits,
} from './platform-adapter.interface.js'

const SCRIPTS_DIR = join(process.cwd(), '..', 'scripts')

// ATS URL patterns — same as LinkedIn adapter, deduplicated here
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

export class IndeedAdapter implements PlatformAdapter {
  readonly name = 'indeed'
  readonly baseUrl = 'https://ph.indeed.com'
  readonly supportsEasyApply = true
  readonly requiresProfile = false   // Indeed pre-fills from account; no separate profile system
  readonly defaultApplicationType: ApplicationType = 'indeed_easy_apply' as ApplicationType
  readonly limits: PlatformLimits = {
    maxAppsPerRun: 25,
    maxAppsPerDay: 80,
    maxConnectionsPerDay: 0,
    minSecsBetweenApps: [30, 90],
    minSecsBetweenSteps: [2, 5],
    maxRetries: 2,
  }

  // ─── Search ───

  async search(queries: string[], filters: SearchFilters): Promise<NormalizedJob[]> {
    const allJobs: NormalizedJob[] = []
    const seen = new Set<string>()

    for (const query of queries) {
      try {
        const jobs = await this._searchGuestApi(query, filters)
        for (const job of jobs) {
          const key = `${job.title.toLowerCase()}::${job.company.toLowerCase()}`
          if (!seen.has(key)) { seen.add(key); allJobs.push(job) }
        }
      } catch (e) {
        console.log(`[Indeed] Guest API error for "${query}": ${e}`)
      }
    }
    return allJobs
  }

  private async _searchGuestApi(query: string, filters: SearchFilters): Promise<NormalizedJob[]> {
    const params = new URLSearchParams({
      q: query,
      l: filters.location || 'Philippines',
      sort: 'date',
      ...(filters.days ? { fromage: String(filters.days) } : {}),
    })

    const url = `https://ph.indeed.com/jobs?${params}&format=json`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
    })
    if (!res.ok) return []
    const html = await res.text()

    // Extract job keys from Indeed HTML (they embed JSON data)
    const jobs: NormalizedJob[] = []
    const jkMatches = html.matchAll(/data-jk="([a-z0-9]+)"/g)
    const titles = html.matchAll(/class="jobTitle[^"]*"[^>]*><[^>]+>([^<]+)</g)
    const companies = html.matchAll(/class="companyName[^"]*"[^>]*>([^<]+)</g)

    const jkArr = [...jkMatches].map(m => m[1])
    const titleArr = [...titles].map(m => m[1].trim())
    const companyArr = [...companies].map(m => m[1].trim())

    for (let i = 0; i < jkArr.length; i++) {
      const jk = jkArr[i]
      jobs.push({
        platform: 'indeed',
        external_id: jk,
        title: titleArr[i] || 'Unknown',
        company: companyArr[i] || 'Unknown',
        location: filters.location || 'Philippines',
        salary_min: null,
        salary_max: null,
        salary_currency: 'PHP',
        job_type: filters.job_type || null,
        description: null,
        requirements: null,
        url: `https://ph.indeed.com/viewjob?jk=${jk}`,
        posted_at: null,
        match_score: null,
        status: 'new',
        easy_apply: true,  // assume Easy Apply until detail check
        poster_name: null,
        poster_linkedin_url: null,
        applicant_count: null,
        application_type: 'indeed_easy_apply',
        ats_type: null,
      })
    }
    return jobs
  }

  // ─── Job Detail ───

  async getJobDetail(jobUrl: string): Promise<JobDetail> {
    // Scrape job detail via scrape-indeed-apply.ts
    const result = await this._runScript('scrape-indeed-apply.ts', { url: jobUrl })
    return result as JobDetail
  }

  // ─── Application Type Detection ───

  async detectApplicationType(job: NormalizedJob): Promise<ApplicationType> {
    if (job.application_type !== 'unknown') return job.application_type as ApplicationType

    // If URL is on indeed.com → likely Easy Apply or form
    if (job.url.includes('indeed.com')) return 'indeed_easy_apply' as ApplicationType

    // Check for ATS URLs
    for (const [, pattern] of Object.entries(ATS_PATTERNS)) {
      if (pattern.test(job.url)) return 'linkedin_external' as ApplicationType  // reuse 'external' concept
    }

    return 'indeed_easy_apply' as ApplicationType
  }

  // ─── Apply ───
  //
  // Indeed apply scenarios:
  //   1. Easy Apply  → apply-indeed.ts (handles modal or short form)
  //   2. Multi-step  → apply-indeed.ts (it already handles multi-step via answerQuestion engine)
  //   3. External    → company site (out of scope for automation; return status=skipped)

  async apply(payload: ApplyPayload): Promise<ApplyResult> {
    // External apply (off-indeed URL): skip — no reliable automation
    if (!payload.job_url.includes('indeed.com')) {
      return {
        job_id: payload.job_id,
        job_title: payload.job_title,
        company: payload.company,
        platform: 'indeed',
        status: 'skipped',
        method: 'indeed_external',
        detail: 'External company site — manual apply required',
      }
    }

    return this._runScript('apply-indeed.ts', {
      url: payload.job_url,
      id: payload.job_id,
      title: payload.job_title,
      company: payload.company,
      cover_letter: payload.cover_letter,
    }) as Promise<ApplyResult>
  }

  // ─── Recruiter Info ───

  async getRecruiterInfo(job: NormalizedJob): Promise<RecruiterInfo | null> {
    // Indeed rarely shows recruiter info in job listing
    if (!job.poster_name) return null
    return {
      found: true,
      recruiter_name: job.poster_name,
      recruiter_first_name: job.poster_name.split(' ')[0],
      recruiter_title: null,
      recruiter_linkedin_url: null,
      recruiter_email: null,
      email_confidence: 'none',
      company_domain: null,
    }
  }

  // ─── Session Check ───

  async checkSessionValid(): Promise<boolean> {
    try {
      const res = await fetch('https://ph.indeed.com/', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      })
      // Indeed's logged-in state requires CDP check since cookies aren't sent via fetch
      if (res.status === 200) return true
      const cdpRes = await fetch('http://127.0.0.1:9222/json/list').catch(() => null)
      if (!cdpRes) return false
      const tabs = await cdpRes.json() as { url: string }[]
      return tabs.some(t => t.url.includes('indeed.com'))
    } catch {
      return false
    }
  }

  // ─── Helpers ───

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
        const lines = stdout.trim().split('\n').reverse()
        for (const line of lines) {
          try { resolve(JSON.parse(line)); return } catch {}
        }
        if (code !== 0) {
          reject(new Error(`Script ${scriptName} exited ${code}: ${stderr.slice(0, 300)}`))
        } else {
          resolve({ status: 'failed', detail: 'No JSON output from script' })
        }
      })

      proc.on('error', reject)
    })
  }
}

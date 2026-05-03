/**
 * Kalibrr Platform Adapter
 *
 * Application types:
 *   kalibrr_quick_apply  — Profile-based Quick Apply (most jobs)
 *   kalibrr_assessment   — Quick Apply + skills test before submission
 *   kalibrr_external     — Redirect to company careers page
 *
 * Requires Kalibrr account logged in via Edge Profile 7.
 * Profile must be >= 80% complete (run setup-kalibrr-profile.ts once).
 */

import { spawn } from 'child_process'
import { join } from 'path'
import type {
  PlatformAdapter, NormalizedJob, JobDetail, ApplicationType,
  ApplyPayload, ApplyResult, RecruiterInfo, SearchFilters, PlatformLimits,
} from './platform-adapter.interface.js'

const SCRIPTS_DIR = join(process.cwd(), '..', 'scripts')

export class KalibrrAdapter implements PlatformAdapter {
  readonly name = 'kalibrr'
  readonly baseUrl = 'https://www.kalibrr.com'
  readonly supportsEasyApply = true
  readonly requiresProfile = true
  readonly defaultApplicationType: ApplicationType = 'kalibrr_quick_apply'
  readonly limits: PlatformLimits = {
    maxAppsPerRun: 30,
    maxAppsPerDay: 60,
    maxConnectionsPerDay: 0,
    minSecsBetweenApps: [30, 90],
    minSecsBetweenSteps: [2, 5],
    maxRetries: 2,
  }

  // ─── Search ───

  async search(queries: string[], filters: SearchFilters): Promise<NormalizedJob[]> {
    const result = await this._runScript('scrape-kalibrr-jobs.ts', {
      queries,
      location: filters.location || 'Philippines',
      days: filters.days || 7,
      limit: 25,
      include_recommendations: true,
    }) as { jobs: NormalizedJob[]; total: number }

    return result.jobs || []
  }

  // ─── Job Detail ───

  async getJobDetail(jobUrl: string): Promise<JobDetail> {
    // Kalibrr job detail is scraped inline during search — return minimal JobDetail
    return {
      platform: 'kalibrr',
      external_id: null,
      title: '',
      company: '',
      location: null,
      salary_min: null,
      salary_max: null,
      salary_currency: 'PHP',
      job_type: null,
      description: null,
      requirements: null,
      url: jobUrl,
      posted_at: null,
      match_score: null,
      status: 'new',
      easy_apply: true,
      poster_name: null,
      poster_linkedin_url: null,
      applicant_count: null,
      application_type: 'kalibrr_quick_apply',
      ats_type: null,
      full_description: null,
      requirements_list: [],
      benefits: [],
    }
  }

  // ─── Application Type Detection ───

  async detectApplicationType(job: NormalizedJob): Promise<ApplicationType> {
    if (job.application_type !== 'unknown') return job.application_type as ApplicationType
    if (!job.url.includes('kalibrr.com')) return 'kalibrr_external'
    return 'kalibrr_quick_apply'
  }

  // ─── Apply ───

  async apply(payload: ApplyPayload): Promise<ApplyResult> {
    return this._runScript('apply-kalibrr.ts', {
      url: payload.job_url,
      id: payload.job_id,
      title: payload.job_title,
      company: payload.company,
      cover_letter: payload.cover_letter,
    }) as Promise<ApplyResult>
  }

  // ─── Recruiter Info ───

  async getRecruiterInfo(job: NormalizedJob): Promise<RecruiterInfo | null> {
    // Kalibrr shows employer name — no LinkedIn URL typically
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
      const res = await fetch('https://www.kalibrr.com/me/profile', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      })
      return res.status === 200
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

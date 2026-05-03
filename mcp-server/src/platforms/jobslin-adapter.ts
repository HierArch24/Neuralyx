/**
 * JobsLin PH Platform Adapter
 *
 * Application types:
 *   jobslin_form      — Standard application form (name, email, resume, cover letter)
 *   jobslin_external  — Redirect to company careers page
 *
 * Many listings expose employer email directly — enables direct email apply fallback.
 * Requires jobslin.com account logged in via Edge Profile 7.
 */

import { spawn } from 'child_process'
import { join } from 'path'
import type {
  PlatformAdapter, NormalizedJob, JobDetail, ApplicationType,
  ApplyPayload, ApplyResult, RecruiterInfo, SearchFilters, PlatformLimits,
} from './platform-adapter.interface.js'

const SCRIPTS_DIR = join(process.cwd(), '..', 'scripts')

export class JobslinAdapter implements PlatformAdapter {
  readonly name = 'jobslin'
  readonly baseUrl = 'https://jobslin.com'
  readonly supportsEasyApply = true
  readonly requiresProfile = false
  readonly defaultApplicationType: ApplicationType = 'jobslin_form'
  readonly limits: PlatformLimits = {
    maxAppsPerRun: 50,
    maxAppsPerDay: 100,
    maxConnectionsPerDay: 0,
    minSecsBetweenApps: [20, 60],
    minSecsBetweenSteps: [1, 3],
    maxRetries: 2,
  }

  // ─── Search ───

  async search(queries: string[], filters: SearchFilters): Promise<NormalizedJob[]> {
    const result = await this._runScript('scrape-jobslin-jobs.ts', {
      queries,
      category: filters.category || 'IT',
      days: filters.days || 7,
      limit: filters.limit || 30,
    }) as { jobs: NormalizedJob[]; total: number }

    return result.jobs || []
  }

  // ─── Job Detail ───

  async getJobDetail(jobUrl: string): Promise<JobDetail> {
    return {
      platform: 'jobslin',
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
      application_type: 'jobslin_form',
      ats_type: null,
      full_description: null,
      requirements_list: [],
      benefits: [],
    }
  }

  // ─── Application Type Detection ───

  async detectApplicationType(job: NormalizedJob): Promise<ApplicationType> {
    if (job.application_type && job.application_type !== 'unknown') {
      return job.application_type as ApplicationType
    }
    if (!job.url.includes('jobslin.com')) return 'jobslin_external'
    return 'jobslin_form'
  }

  // ─── Apply ───

  async apply(payload: ApplyPayload): Promise<ApplyResult> {
    return this._runScript('apply-jobslin.ts', {
      url: payload.job_url,
      id: payload.job_id,
      title: payload.job_title,
      company: payload.company,
      cover_letter: payload.cover_letter,
      employer_email: (payload as any).employer_email,
    }) as Promise<ApplyResult>
  }

  // ─── Recruiter Info ───

  async getRecruiterInfo(job: NormalizedJob): Promise<RecruiterInfo | null> {
    const email = (job as any).employer_email
    if (!job.poster_name && !email) return null

    return {
      found: true,
      recruiter_name: job.poster_name || 'Hiring Manager',
      recruiter_first_name: job.poster_name?.split(' ')[0] || 'Hiring',
      recruiter_title: null,
      recruiter_linkedin_url: null,
      recruiter_email: email || null,
      email_confidence: email ? 'confirmed' : 'none',
      company_domain: email ? email.split('@')[1] : null,
    }
  }

  // ─── Session Check ───

  async checkSessionValid(): Promise<boolean> {
    try {
      const res = await fetch('https://jobslin.com/dashboard', {
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

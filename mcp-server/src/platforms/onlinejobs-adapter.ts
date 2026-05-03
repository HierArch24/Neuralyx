/**
 * OnlineJobs.ph Platform Adapter
 *
 * Application type: onlinejobs_message (ONLY)
 * Applications on OnlineJobs.ph are direct messages to the employer — no form.
 * The message IS the application.
 *
 * Requires onlinejobs.ph worker account logged in via Edge Profile 7.
 * Lower daily limits due to message-spam detection risk.
 */

import { spawn } from 'child_process'
import { join } from 'path'
import type {
  PlatformAdapter, NormalizedJob, JobDetail, ApplicationType,
  ApplyPayload, ApplyResult, RecruiterInfo, SearchFilters, PlatformLimits,
} from './platform-adapter.interface.js'

const SCRIPTS_DIR = join(process.cwd(), '..', 'scripts')

export class OnlineJobsAdapter implements PlatformAdapter {
  readonly name = 'onlinejobs'
  readonly baseUrl = 'https://www.onlinejobs.ph'
  readonly supportsEasyApply = false
  readonly requiresProfile = true
  readonly defaultApplicationType: ApplicationType = 'onlinejobs_message'
  readonly limits: PlatformLimits = {
    maxAppsPerRun: 20,
    maxAppsPerDay: 40,
    maxConnectionsPerDay: 0,
    minSecsBetweenApps: [30, 90],
    minSecsBetweenSteps: [2, 5],
    maxRetries: 1,
  }

  // ─── Search ───

  async search(queries: string[], filters: SearchFilters): Promise<NormalizedJob[]> {
    const result = await this._runScript('scrape-onlinejobs.ts', {
      queries,
      days: filters.days || 7,
      limit: filters.limit || 20,
    }) as { jobs: NormalizedJob[]; total: number }

    return result.jobs || []
  }

  // ─── Job Detail ───

  async getJobDetail(jobUrl: string): Promise<JobDetail> {
    return {
      platform: 'onlinejobs',
      external_id: null,
      title: '',
      company: '',
      location: 'Remote',
      salary_min: null,
      salary_max: null,
      salary_currency: 'PHP',
      job_type: 'remote',
      description: null,
      requirements: null,
      url: jobUrl,
      posted_at: null,
      match_score: null,
      status: 'new',
      easy_apply: false,
      poster_name: null,
      poster_linkedin_url: null,
      applicant_count: null,
      application_type: 'onlinejobs_message',
      ats_type: null,
      full_description: null,
      requirements_list: [],
      benefits: [],
    }
  }

  // ─── Application Type Detection ───

  async detectApplicationType(_job: NormalizedJob): Promise<ApplicationType> {
    return 'onlinejobs_message'
  }

  // ─── Apply ───

  async apply(payload: ApplyPayload): Promise<ApplyResult> {
    return this._runScript('apply-onlinejobs.ts', {
      url: payload.job_url,
      id: payload.job_id,
      title: payload.job_title,
      company: payload.company,
      application_message: payload.cover_letter,
      employer_name: (payload as any).employer_name,
      requires_video: (payload as any).requires_video || false,
      description: (payload as any).description,
    }) as Promise<ApplyResult>
  }

  // ─── Recruiter Info ───

  async getRecruiterInfo(job: NormalizedJob): Promise<RecruiterInfo | null> {
    const employerName = (job as any).employer_name || job.poster_name
    if (!employerName) return null

    return {
      found: true,
      recruiter_name: employerName,
      recruiter_first_name: employerName.split(' ')[0],
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
      const res = await fetch('https://www.onlinejobs.ph/jobseekers/dashboard', {
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

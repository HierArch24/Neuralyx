/**
 * Platform Adapter Interface
 * All job platform adapters implement this contract.
 * The n8n workflow calls generic endpoints; adapters handle platform differences.
 */

export interface SearchFilters {
  location?: string
  easy_apply_only?: boolean
  days?: number         // posted within N days
  job_type?: string     // 'remote' | 'hybrid' | 'onsite'
  limit?: number
  category?: string
}

export interface NormalizedJob {
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
  match_score: number | null
  status: string
  easy_apply: boolean
  poster_name: string | null
  poster_linkedin_url: string | null
  applicant_count: number | null
  application_type: string   // 'linkedin_easy_apply' | 'kalibrr_quick_apply' | 'form' | 'message' | 'unknown'
  ats_type: string | null
}

export interface JobDetail extends NormalizedJob {
  full_description: string | null
  requirements_list: string[]
  benefits: string[]
}

export type ApplicationType =
  | 'linkedin_easy_apply'
  | 'linkedin_external'
  | 'kalibrr_quick_apply'
  | 'kalibrr_assessment'
  | 'kalibrr_external'
  | 'jobslin_form'
  | 'jobslin_external'
  | 'onlinejobs_message'
  | 'indeed_easy_apply'
  | 'indeed_form'
  | 'indeed_external'
  | 'company_portal'
  | 'direct_email'
  | 'unknown'

export interface ApplyPayload {
  job_url: string
  job_id?: string
  job_title: string
  company: string
  cover_letter?: string
  form_mapping?: FormFieldMapping
  note_text?: string          // LinkedIn connection note
  recruiter_linkedin_url?: string
}

export interface FormFieldMapping {
  form_type: string
  requires_account: boolean
  has_linkedin_import: boolean
  fields: FormField[]
  screening_questions: ScreeningQuestion[]
  submit_button_selector: string
}

export interface FormField {
  selector: string
  field_type: 'text' | 'email' | 'phone' | 'select' | 'radio' | 'checkbox' | 'file' | 'textarea'
  maps_to: string
  required: boolean
  options?: string[]
}

export interface ScreeningQuestion {
  question_text: string
  field_type: 'text' | 'textarea' | 'select' | 'radio'
  options?: string[]
}

export interface ApplyResult {
  job_id?: string
  job_title: string
  company: string
  platform: string
  status: 'applied' | 'failed' | 'captcha' | 'login_required' | 'already_applied' | 'form_error' | 'session_expired' | 'skipped'
  method: string
  detail: string
  screenshot_pre?: string
  screenshot_confirm?: string
  error?: string
  applied_url?: string
}

export interface RecruiterInfo {
  found: boolean
  recruiter_name: string | null
  recruiter_first_name: string | null
  recruiter_title: string | null
  recruiter_linkedin_url: string | null
  recruiter_email: string | null
  email_confidence: 'confirmed' | 'guessed' | 'none'
  company_domain: string | null
}

export interface PlatformLimits {
  maxAppsPerRun: number
  maxAppsPerDay: number
  maxConnectionsPerDay: number
  minSecsBetweenApps: [number, number]    // [min, max] random range
  minSecsBetweenSteps: [number, number]
  maxRetries: number
}

export interface PlatformAdapter {
  readonly name: string
  readonly baseUrl: string
  readonly supportsEasyApply: boolean
  readonly requiresProfile: boolean
  readonly defaultApplicationType: ApplicationType
  readonly limits: PlatformLimits

  search(queries: string[], filters: SearchFilters): Promise<NormalizedJob[]>
  getJobDetail(jobUrl: string): Promise<JobDetail>
  detectApplicationType(job: NormalizedJob): Promise<ApplicationType>
  apply(payload: ApplyPayload): Promise<ApplyResult>
  getRecruiterInfo(job: NormalizedJob): Promise<RecruiterInfo | null>
  checkSessionValid(): Promise<boolean>
}

export interface Database {
  public: {
    Tables: {
      sections: {
        Row: Section
        Insert: Omit<Section, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Section, 'id' | 'created_at' | 'updated_at'>>
      }
      projects: {
        Row: Project
        Insert: Omit<Project, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Project, 'id' | 'created_at' | 'updated_at'>>
      }
      skills: {
        Row: Skill
        Insert: Omit<Skill, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Skill, 'id' | 'created_at' | 'updated_at'>>
      }
      tools: {
        Row: Tool
        Insert: Omit<Tool, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Tool, 'id' | 'created_at' | 'updated_at'>>
      }
      contact_messages: {
        Row: ContactMessage
        Insert: Omit<ContactMessage, 'id' | 'created_at' | 'is_read'>
        Update: Partial<Omit<ContactMessage, 'id' | 'created_at'>>
      }
      news: {
        Row: NewsArticle
        Insert: Omit<NewsArticle, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<NewsArticle, 'id' | 'created_at' | 'updated_at'>>
      }
      site_settings: {
        Row: SiteSetting
        Insert: Omit<SiteSetting, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<SiteSetting, 'id' | 'created_at' | 'updated_at'>>
      }
      credentials: {
        Row: Credential
        Insert: Omit<Credential, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Credential, 'id' | 'created_at' | 'updated_at'>>
      }
      job_listings: {
        Row: JobListing
        Insert: Omit<JobListing, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<JobListing, 'id' | 'created_at' | 'updated_at'>>
      }
      job_profile: {
        Row: JobProfile
        Insert: Omit<JobProfile, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<JobProfile, 'id' | 'created_at' | 'updated_at'>>
      }
      job_applications: {
        Row: JobApplication
        Insert: Omit<JobApplication, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<JobApplication, 'id' | 'created_at' | 'updated_at'>>
      }
      job_agent_logs: {
        Row: JobAgentLog
        Insert: Omit<JobAgentLog, 'id' | 'created_at'>
        Update: Partial<Omit<JobAgentLog, 'id' | 'created_at'>>
      }
    }
  }
}

export interface Section {
  id: string
  slug: string
  title: string
  subtitle: string | null
  content: Record<string, unknown>
  sort_order: number
  is_visible: boolean
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  title: string
  slug: string
  description: string
  image_url: string | null
  tech_stack: string[]
  category: string
  github_url: string | null
  live_url: string | null
  video_url: string | null
  is_featured: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Skill {
  id: string
  name: string
  category: string
  icon: string | null
  proficiency: number
  years_experience: number
  created_at: string
  updated_at: string
}

export interface Tool {
  id: string
  name: string
  category: string
  icon: string | null
  url: string | null
  description: string | null
  created_at: string
  updated_at: string
}

export interface ContactMessage {
  id: string
  name: string
  email: string
  subject: string
  message: string
  is_read: boolean
  created_at: string
}

export interface NewsArticle {
  id: string
  title: string
  slug: string
  summary: string
  content: string
  image_url: string | null
  video_url: string | null
  link_url: string | null
  category: string
  is_published: boolean
  is_featured: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ResumeContent {
  id: string
  content_html: string
  updated_at: string
}

export interface SiteSetting {
  id: string
  key: string
  value: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface JobListing {
  id: string
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
  notes: string | null
  raw_data: Record<string, unknown> | null
  easy_apply?: boolean
  applicant_count?: number | null
  poster_name?: string | null
  poster_linkedin_url?: string | null
  ats_type?: string | null
  recruiter_id?: string | null
  vector_indexed?: boolean
  created_at: string
  updated_at: string
}

export interface JobProfile {
  id: string
  title: string
  skills: string[]
  experience_years: number | null
  preferred_locations: string[]
  preferred_job_types: string[]
  salary_min: number | null
  salary_currency: string
  keywords: string[]
  exclude_keywords: string[]
  resume_url: string | null
  resume_text: string | null
  cover_letter_template: string | null
  auto_apply_enabled: boolean
  auto_apply_min_score: number
  created_at: string
  updated_at: string
}

export interface JobApplication {
  id: string
  job_listing_id: string
  platform: string
  channel: string
  agency_name: string | null
  status: string
  applied_via: string | null
  cover_letter: string | null
  resume_version: string | null
  salary_offered: number | null
  salary_currency: string
  interview_dates: Record<string, unknown>[]
  onboarding_checklist: Record<string, boolean>
  response_at: string | null
  follow_up_at: string | null
  start_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ChannelExecution {
  id: string
  application_id: string
  job_listing_id: string
  channel: 'job_board' | 'email' | 'company_portal' | 'form' | 'cold_outreach' | 'recruiter'
  status: 'pending' | 'scheduled' | 'in_progress' | 'applied' | 'failed' | 'skipped'
  tone: string | null
  cover_letter_variant: string | null
  target: string | null
  platform: string | null
  method: string | null
  scheduled_at: string | null
  executed_at: string | null
  attempt_count: number
  error_detail: string | null
  screenshot_url: string | null
  apply_log: Record<string, unknown>[]
  created_at: string
  updated_at: string
}

export interface JobAgentLog {
  id: string
  run_id: string
  step: string
  status: string
  message: string | null
  jobs_found: number
  jobs_matched: number
  jobs_applied: number
  errors: Record<string, unknown> | null
  started_at: string
  completed_at: string | null
  created_at: string
}

export interface Credential {
  id: string
  company: string
  service: string
  description: string | null
  label: string
  type: string
  value: string
  status: string
  notes: string | null
  last_used_at: string | null
  utilized_by: string | null
  created_at: string
  updated_at: string
}

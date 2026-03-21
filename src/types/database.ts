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

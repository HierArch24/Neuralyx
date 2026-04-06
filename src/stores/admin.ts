import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { Section, Project, Skill, Tool, ContactMessage, NewsArticle, Credential, JobListing, JobProfile, JobApplication, JobAgentLog } from '@/types/database'

export const useAdminStore = defineStore('admin', () => {
  const sections = ref<Section[]>([])
  const projects = ref<Project[]>([])
  const skills = ref<Skill[]>([])
  const tools = ref<Tool[]>([])
  const messages = ref<ContactMessage[]>([])
  const news = ref<NewsArticle[]>([])
  const credentials = ref<Credential[]>([])
  const jobListings = ref<JobListing[]>([])
  const jobProfile = ref<JobProfile[]>([])
  const jobApplications = ref<JobApplication[]>([])
  const jobAgentLogs = ref<JobAgentLog[]>([])
  const loading = ref(false)
  const lastError = ref<string | null>(null)

  // Generic CRUD helpers
  async function fetchTable<T>(table: string, target: { value: T[] }, orderBy = 'created_at') {
    loading.value = true
    lastError.value = null
    try {
      const { data, error } = await supabase.from(table).select('*').order(orderBy)
      if (error) {
        console.error(`[Admin] Failed to fetch ${table}:`, error.message)
        lastError.value = `${table}: ${error.message}`
        return
      }
      target.value = (data as T[]) ?? []
    } catch (e: any) {
      console.error(`[Admin] Network error fetching ${table}:`, e.message)
      lastError.value = `${table}: ${e.message}`
    } finally {
      loading.value = false
    }
  }

  async function insertRow(table: string, row: Record<string, unknown>) {
    const { data, error } = await supabase.from(table).insert(row as never).select()
    if (error) {
      console.error(`[Admin] Insert ${table} failed:`, error.message)
      throw error
    }
    return data?.[0] ?? data
  }

  async function updateRow(table: string, id: string, updates: Record<string, unknown>) {
    const { error } = await supabase.from(table).update(updates as never).eq('id', id)
    if (error) {
      console.error(`[Admin] Update ${table} failed:`, error.message)
      throw error
    }
  }

  async function deleteRow(table: string, id: string) {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) {
      console.error(`[Admin] Delete ${table} failed:`, error.message)
      throw error
    }
  }

  // Table-specific fetchers
  const fetchSections = () => fetchTable<Section>('sections', sections, 'sort_order')
  const fetchProjects = () => fetchTable<Project>('projects', projects, 'sort_order')
  const fetchSkills = () => fetchTable<Skill>('skills', skills, 'category')
  const fetchTools = () => fetchTable<Tool>('tools', tools, 'category')
  const fetchMessages = () => fetchTable<ContactMessage>('contact_messages', messages, 'created_at')
  const fetchNews = async () => {
    await fetchTable<NewsArticle>('news', news, 'sort_order')
    // If Supabase returned nothing, use fallback from content store
    if (news.value.length === 0) {
      try {
        const { useContentStore } = await import('./content')
        const content = useContentStore()
        if (!content.news.length) await content.fetchAll()
        if (content.news.length > 0) news.value = content.news
      } catch { /* content store unavailable */ }
    }
  }
  const fetchCredentials = () => fetchTable<Credential>('credentials', credentials, 'company')
  const fetchJobListings = () => fetchTable<JobListing>('job_listings', jobListings, 'created_at')
  const fetchJobProfile = () => fetchTable<JobProfile>('job_profile', jobProfile, 'created_at')
  const fetchJobApplications = () => fetchTable<JobApplication>('job_applications', jobApplications, 'created_at')
  const fetchJobAgentLogs = () => fetchTable<JobAgentLog>('job_agent_logs', jobAgentLogs, 'created_at')

  async function markMessageRead(id: string) {
    await updateRow('contact_messages', id, { is_read: true })
  }

  return {
    sections, projects, skills, tools, messages, news, credentials,
    jobListings, jobProfile, jobApplications, jobAgentLogs,
    loading, lastError,
    fetchSections, fetchProjects, fetchSkills, fetchTools, fetchMessages, fetchNews, fetchCredentials,
    fetchJobListings, fetchJobProfile, fetchJobApplications, fetchJobAgentLogs,
    insertRow, updateRow, deleteRow, markMessageRead,
  }
})

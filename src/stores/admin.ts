import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { Section, Project, Skill, Tool, ContactMessage } from '@/types/database'

export const useAdminStore = defineStore('admin', () => {
  const sections = ref<Section[]>([])
  const projects = ref<Project[]>([])
  const skills = ref<Skill[]>([])
  const tools = ref<Tool[]>([])
  const messages = ref<ContactMessage[]>([])
  const loading = ref(false)

  // Generic CRUD helpers
  async function fetchTable<T>(table: string, target: { value: T[] }, orderBy = 'created_at') {
    loading.value = true
    const { data, error } = await supabase.from(table).select('*').order(orderBy)
    if (error) throw error
    target.value = (data as T[]) ?? []
    loading.value = false
  }

  async function insertRow(table: string, row: Record<string, unknown>) {
    const { data, error } = await supabase.from(table).insert(row as never).select().single()
    if (error) throw error
    return data
  }

  async function updateRow(table: string, id: string, updates: Record<string, unknown>) {
    const { data, error } = await supabase.from(table).update(updates as never).eq('id', id).select().single()
    if (error) throw error
    return data
  }

  async function deleteRow(table: string, id: string) {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw error
  }

  // Table-specific fetchers
  const fetchSections = () => fetchTable<Section>('sections', sections, 'sort_order')
  const fetchProjects = () => fetchTable<Project>('projects', projects, 'sort_order')
  const fetchSkills = () => fetchTable<Skill>('skills', skills, 'category')
  const fetchTools = () => fetchTable<Tool>('tools', tools, 'category')
  const fetchMessages = () => fetchTable<ContactMessage>('contact_messages', messages, 'created_at')

  async function markMessageRead(id: string) {
    await updateRow('contact_messages', id, { is_read: true })
  }

  return {
    sections, projects, skills, tools, messages, loading,
    fetchSections, fetchProjects, fetchSkills, fetchTools, fetchMessages,
    insertRow, updateRow, deleteRow, markMessageRead,
  }
})

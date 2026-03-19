import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import type { Project, Skill, Tool } from '@/types/database'

const uid = () => crypto.randomUUID()
const now = new Date().toISOString()

const FALLBACK_SKILLS: Skill[] = [
  // Programming
  { id: uid(), name: 'Python', category: 'programming', icon: '🐍', proficiency: 92, years_experience: 4, created_at: now, updated_at: now },
  { id: uid(), name: 'TypeScript', category: 'programming', icon: '🔷', proficiency: 88, years_experience: 3, created_at: now, updated_at: now },
  { id: uid(), name: 'JavaScript', category: 'programming', icon: '⚡', proficiency: 90, years_experience: 4, created_at: now, updated_at: now },
  { id: uid(), name: 'C#', category: 'programming', icon: '🎯', proficiency: 75, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'Java', category: 'programming', icon: '☕', proficiency: 70, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'Dart', category: 'programming', icon: '🎯', proficiency: 65, years_experience: 1, created_at: now, updated_at: now },
  { id: uid(), name: 'GDScript', category: 'programming', icon: '🎮', proficiency: 60, years_experience: 1, created_at: now, updated_at: now },
  // Database
  { id: uid(), name: 'PostgreSQL', category: 'database', icon: '🐘', proficiency: 85, years_experience: 3, created_at: now, updated_at: now },
  { id: uid(), name: 'Supabase', category: 'database', icon: '⚡', proficiency: 88, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'MongoDB', category: 'database', icon: '🍃', proficiency: 72, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'Firebase', category: 'database', icon: '🔥', proficiency: 78, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'Redis', category: 'database', icon: '🔴', proficiency: 65, years_experience: 1, created_at: now, updated_at: now },
  // ML/AI
  { id: uid(), name: 'TensorFlow', category: 'ml-ai', icon: '🧠', proficiency: 80, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'PyTorch', category: 'ml-ai', icon: '🔥', proficiency: 75, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'Scikit-learn', category: 'ml-ai', icon: '📊', proficiency: 82, years_experience: 3, created_at: now, updated_at: now },
  { id: uid(), name: 'Computer Vision', category: 'ml-ai', icon: '👁️', proficiency: 72, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'NLP', category: 'ml-ai', icon: '💬', proficiency: 78, years_experience: 2, created_at: now, updated_at: now },
  // LLM
  { id: uid(), name: 'LangChain', category: 'llm', icon: '🔗', proficiency: 90, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'CrewAI', category: 'llm', icon: '🤖', proficiency: 85, years_experience: 1, created_at: now, updated_at: now },
  { id: uid(), name: 'OpenAI API', category: 'llm', icon: '🧠', proficiency: 92, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'Claude API', category: 'llm', icon: '🟠', proficiency: 90, years_experience: 1, created_at: now, updated_at: now },
  { id: uid(), name: 'RAG Pipelines', category: 'llm', icon: '📚', proficiency: 85, years_experience: 1, created_at: now, updated_at: now },
  { id: uid(), name: 'MCP Servers', category: 'llm', icon: '🔌', proficiency: 82, years_experience: 1, created_at: now, updated_at: now },
  // Automation
  { id: uid(), name: 'n8n', category: 'automation', icon: '⚙️', proficiency: 90, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'Zapier', category: 'automation', icon: '⚡', proficiency: 85, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'Make (Integromat)', category: 'automation', icon: '🔄', proficiency: 80, years_experience: 1, created_at: now, updated_at: now },
  { id: uid(), name: 'GitHub Actions', category: 'automation', icon: '🔧', proficiency: 82, years_experience: 2, created_at: now, updated_at: now },
  // Full-Stack
  { id: uid(), name: 'Vue.js', category: 'full-stack', icon: '💚', proficiency: 90, years_experience: 3, created_at: now, updated_at: now },
  { id: uid(), name: 'React', category: 'full-stack', icon: '⚛️', proficiency: 82, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'Node.js', category: 'full-stack', icon: '🟢', proficiency: 88, years_experience: 3, created_at: now, updated_at: now },
  { id: uid(), name: 'FastAPI', category: 'full-stack', icon: '🚀', proficiency: 85, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'Django', category: 'full-stack', icon: '🎸', proficiency: 75, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'Tailwind CSS', category: 'full-stack', icon: '🎨', proficiency: 92, years_experience: 3, created_at: now, updated_at: now },
  // Mobile
  { id: uid(), name: 'Flutter', category: 'mobile', icon: '📱', proficiency: 72, years_experience: 1, created_at: now, updated_at: now },
  { id: uid(), name: 'React Native', category: 'mobile', icon: '📲', proficiency: 68, years_experience: 1, created_at: now, updated_at: now },
  // Game Dev
  { id: uid(), name: 'Godot', category: 'game-dev', icon: '🎮', proficiency: 65, years_experience: 1, created_at: now, updated_at: now },
  { id: uid(), name: 'Unity', category: 'game-dev', icon: '🕹️', proficiency: 60, years_experience: 1, created_at: now, updated_at: now },
  // Cloud
  { id: uid(), name: 'Docker', category: 'cloud', icon: '🐳', proficiency: 85, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'AWS', category: 'cloud', icon: '☁️', proficiency: 70, years_experience: 1, created_at: now, updated_at: now },
  { id: uid(), name: 'Vercel', category: 'cloud', icon: '▲', proficiency: 82, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'Cloudflare', category: 'cloud', icon: '🌐', proficiency: 78, years_experience: 2, created_at: now, updated_at: now },
]

const FALLBACK_PROJECTS: Project[] = [
  {
    id: uid(), title: 'NEURALYX Portfolio', slug: 'neuralyx-portfolio',
    description: 'Cinematic portfolio with scroll-synced video background, parallax animations, and admin dashboard. Built with Vue 3, TypeScript, GSAP, and Supabase.',
    image_url: null, tech_stack: ['Vue 3', 'TypeScript', 'GSAP', 'Tailwind CSS', 'Supabase'],
    category: 'web', github_url: 'https://github.com/HierArch24/NEURALYX', live_url: 'https://neuralyx.ai.dev-environment.site',
    is_featured: true, sort_order: 1, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'AI Agent Orchestrator', slug: 'ai-agent-orchestrator',
    description: 'Multi-agent system using CrewAI and LangChain for automated research, content generation, and task delegation across intelligent AI agents.',
    image_url: null, tech_stack: ['Python', 'CrewAI', 'LangChain', 'OpenAI', 'FastAPI'],
    category: 'ai', github_url: null, live_url: null,
    is_featured: true, sort_order: 2, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'Billing System', slug: 'billing-system',
    description: 'Full-stack billing and invoice management system with real-time updates, role-based access, and automated payment tracking.',
    image_url: null, tech_stack: ['Vue.js', 'Supabase', 'PostgreSQL', 'Tailwind CSS'],
    category: 'web', github_url: null, live_url: null,
    is_featured: true, sort_order: 3, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'Automation Pipeline Engine', slug: 'automation-pipeline',
    description: 'Custom workflow automation platform integrating n8n, webhooks, and AI-powered decision nodes for business process automation.',
    image_url: null, tech_stack: ['n8n', 'Node.js', 'PostgreSQL', 'Docker'],
    category: 'automation', github_url: null, live_url: null,
    is_featured: true, sort_order: 4, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'RAG Knowledge Base', slug: 'rag-knowledge-base',
    description: 'Retrieval-augmented generation system for intelligent document search and question answering over custom knowledge bases.',
    image_url: null, tech_stack: ['Python', 'LangChain', 'ChromaDB', 'FastAPI', 'OpenAI'],
    category: 'ai', github_url: null, live_url: null,
    is_featured: true, sort_order: 5, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'MCP Server Suite', slug: 'mcp-server-suite',
    description: 'Custom Model Context Protocol servers enabling AI assistants to interact with databases, APIs, and development tools.',
    image_url: null, tech_stack: ['TypeScript', 'MCP SDK', 'Supabase', 'Node.js'],
    category: 'ai', github_url: null, live_url: null,
    is_featured: true, sort_order: 6, created_at: now, updated_at: now,
  },
]

const FALLBACK_TOOLS: Tool[] = [
  // IDE
  { id: uid(), name: 'VS Code', category: 'ide', icon: '💻', url: null, description: 'Primary code editor with extensive extensions', created_at: now, updated_at: now },
  { id: uid(), name: 'Cursor', category: 'ide', icon: '🖱️', url: null, description: 'AI-powered code editor', created_at: now, updated_at: now },
  { id: uid(), name: 'Claude Code', category: 'ide', icon: '🟠', url: null, description: 'AI coding assistant CLI', created_at: now, updated_at: now },
  // AI Tools
  { id: uid(), name: 'ChatGPT', category: 'ai-tools', icon: '🤖', url: null, description: 'OpenAI conversational AI', created_at: now, updated_at: now },
  { id: uid(), name: 'Claude', category: 'ai-tools', icon: '🟠', url: null, description: 'Anthropic AI assistant', created_at: now, updated_at: now },
  { id: uid(), name: 'Midjourney', category: 'ai-tools', icon: '🎨', url: null, description: 'AI image generation', created_at: now, updated_at: now },
  { id: uid(), name: 'GitHub Copilot', category: 'ai-tools', icon: '🤝', url: null, description: 'AI pair programming', created_at: now, updated_at: now },
  // DevOps
  { id: uid(), name: 'Docker', category: 'devops', icon: '🐳', url: null, description: 'Container orchestration', created_at: now, updated_at: now },
  { id: uid(), name: 'GitHub Actions', category: 'devops', icon: '⚙️', url: null, description: 'CI/CD automation', created_at: now, updated_at: now },
  { id: uid(), name: 'Cloudflare', category: 'devops', icon: '🌐', url: null, description: 'CDN and DNS management', created_at: now, updated_at: now },
  // Productivity
  { id: uid(), name: 'Notion', category: 'productivity', icon: '📝', url: null, description: 'Knowledge management', created_at: now, updated_at: now },
  { id: uid(), name: 'Figma', category: 'productivity', icon: '🎨', url: null, description: 'UI/UX design', created_at: now, updated_at: now },
  { id: uid(), name: 'n8n', category: 'productivity', icon: '🔄', url: null, description: 'Workflow automation', created_at: now, updated_at: now },
]

export const useContentStore = defineStore('content', () => {
  const sections = ref<{ slug: string; title: string; subtitle: string | null; content: Record<string, unknown>; sort_order: number; is_visible: boolean }[]>([])
  const projects = ref<Project[]>([])
  const skills = ref<Skill[]>([])
  const tools = ref<Tool[]>([])
  const loaded = ref(false)
  const loading = ref(false)

  const getSection = (slug: string) =>
    computed(() => sections.value.find((s) => s.slug === slug))

  const getSkillsByCategory = (category: string) =>
    computed(() => skills.value.filter((s) => s.category === category))

  const featuredProjects = computed(() =>
    projects.value.filter((p) => p.is_featured).sort((a, b) => a.sort_order - b.sort_order),
  )

  const skillCategories = computed(() => {
    const cats = new Set(skills.value.map((s) => s.category))
    return Array.from(cats).sort()
  })

  const toolCategories = computed(() => {
    const cats = new Set(tools.value.map((t) => t.category))
    return Array.from(cats).sort()
  })

  function loadFallback() {
    skills.value = FALLBACK_SKILLS
    projects.value = FALLBACK_PROJECTS
    tools.value = FALLBACK_TOOLS
    loaded.value = true
  }

  async function fetchAll() {
    if (loaded.value || loading.value) return
    loading.value = true

    try {
      const [sectionsRes, projectsRes, skillsRes, toolsRes] = await Promise.all([
        supabase.from('sections').select('*').eq('is_visible', true).order('sort_order'),
        supabase.from('projects').select('*').order('sort_order'),
        supabase.from('skills').select('*').order('proficiency', { ascending: false }),
        supabase.from('tools').select('*').order('name'),
      ])

      const hasData = skillsRes.data && skillsRes.data.length > 0

      if (hasData) {
        if (sectionsRes.data) sections.value = sectionsRes.data
        if (projectsRes.data) projects.value = projectsRes.data
        if (skillsRes.data) skills.value = skillsRes.data
        if (toolsRes.data) tools.value = toolsRes.data
        loaded.value = true
      } else {
        loadFallback()
      }
    } catch {
      console.warn('Supabase not available, using fallback content')
      loadFallback()
    } finally {
      loading.value = false
    }
  }

  return {
    sections,
    projects,
    skills,
    tools,
    loaded,
    loading,
    getSection,
    getSkillsByCategory,
    featuredProjects,
    skillCategories,
    toolCategories,
    fetchAll,
  }
})

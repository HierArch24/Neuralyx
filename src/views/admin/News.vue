<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'

import { useAdminStore } from '@/stores/admin'
import type { NewsArticle } from '@/types/database'
import { generateNewsFromUrl } from '@/utils/generateNewsFromUrl'
import { generateThumbnail } from '@/utils/generateThumbnail'

const admin = useAdminStore()
const showModal = ref(false)
const editing = ref<NewsArticle | null>(null)
const filterCategory = ref('all')
const searchQuery = ref('')

// AI URL Generation
const generateUrl = ref('')
const generating = ref(false)
const generateError = ref('')
const generateStatus = ref('')

async function generateFromUrl() {
  const url = generateUrl.value.trim()
  if (!url) return

  const apiKey = localStorage.getItem('neuralyx_openai_key') || import.meta.env.VITE_OPENAI_KEY
  if (!apiKey) {
    generateError.value = 'OpenAI API key not set. Go to Dashboard to configure it.'
    return
  }

  generating.value = true
  generateError.value = ''
  generateStatus.value = 'Starting...'

  try {
    const article = await generateNewsFromUrl(url, apiKey, (msg) => { generateStatus.value = msg })
    const maxOrder = admin.news.reduce((max, a) => Math.max(max, a.sort_order), 0)

    // Pre-fill form and open create modal
    editing.value = null
    Object.assign(form.value, {
      title: article.title,
      slug: article.slug,
      summary: article.summary,
      content: article.content,
      image_url: article.image_url || '',
      video_url: '',
      link_url: article.link_url,
      category: article.category,
      is_published: true,
      sort_order: maxOrder + 1,
    })
    showModal.value = true
    generateUrl.value = ''
    generateStatus.value = ''
  } catch (err: any) {
    generateError.value = err.message || 'Failed to generate article'
    generateStatus.value = ''
  } finally {
    generating.value = false
  }
}

// ─── Caveman: Token-Efficient Bulk Compressor ───
const cavemanRunning = ref(false)
const cavemanProgress = ref('')

async function cavemanCompress() {
  const apiKey = localStorage.getItem('neuralyx_openai_key') || import.meta.env.VITE_OPENAI_KEY || import.meta.env.VITE_GEMINI_KEY
  if (!apiKey) { alert('No AI key configured'); return }

  cavemanRunning.value = true
  const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
  let compressed = 0

  for (const article of admin.news) {
    if (!article.summary || article.summary.length < 20) continue
    cavemanProgress.value = `${compressed + 1}/${admin.news.length}`

    try {
      const res = await fetch(`${mcpUrl}/api/ai/compress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: article.summary, mode: 'caveman' }),
        signal: AbortSignal.timeout(15000),
      })
      if (res.ok) {
        const data = await res.json()
        const compressed_summary = data.compressed || ''
        if (compressed_summary && compressed_summary.length < article.summary.length) {
          await admin.updateRow('news', article.id, { summary: compressed_summary })
          compressed++
        }
      }
    } catch { /* skip */ }
  }

  await admin.fetchNews()
  cavemanRunning.value = false
  cavemanProgress.value = ''
  alert(`Caveman compressed ${compressed} summaries`)
}

async function cavemanRegenThumbnails() {
  cavemanRunning.value = true
  let count = 0
  for (const article of admin.news) {
    if (article.image_url) continue // Skip if already has image
    cavemanProgress.value = `Thumbnails ${count + 1}/${admin.news.filter(a => !a.image_url).length}`
    try {
      const apiKey = localStorage.getItem('neuralyx_openai_key') || import.meta.env.VITE_OPENAI_KEY || ''
      const thumb = await generateThumbnail(article.title, article.category, article.summary || '', article.link_url || null, apiKey)
      if (thumb) {
        await admin.updateRow('news', article.id, { image_url: thumb })
        count++
      }
    } catch { /* skip */ }
  }
  await admin.fetchNews()
  cavemanRunning.value = false
  cavemanProgress.value = ''
  alert(`Generated ${count} thumbnails`)
}

// ─── Anton: AI Content Intelligence Agent ───
const antonRunning = ref(false)
const antonStatus = ref('')
const antonSuggestions = ref<{ title: string; url: string; category: string; reason: string }[]>([])

async function antonDiscoverTopics() {
  const apiKey = localStorage.getItem('neuralyx_openai_key') || import.meta.env.VITE_OPENAI_KEY || import.meta.env.VITE_GEMINI_KEY
  if (!apiKey) { alert('No AI key configured'); return }

  antonRunning.value = true
  antonStatus.value = 'Analyzing trends...'
  antonSuggestions.value = []

  const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'

  try {
    // Get existing article titles to avoid duplicates
    const existingTitles = admin.news.map(a => a.title.toLowerCase()).join(', ')
    const existingCategories = [...new Set(admin.news.map(a => a.category))].join(', ')

    antonStatus.value = 'Querying AI for trending topics...'
    const res = await fetch(`${mcpUrl}/api/jobs/cover-letter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'content_agent',
        company: 'anton',
        description: `You are an AI content intelligence agent. Suggest 5 trending tech articles/news topics for a portfolio blog focused on: AI automation, AI agents, LLM, MCP, Claude API, DevOps, full-stack dev, marketing automation, business automation.

EXISTING articles (avoid duplicates): ${existingTitles.slice(0, 500)}
EXISTING categories: ${existingCategories}

Return ONLY a JSON array: [{"title":"Article Title","url":"https://source-url.com/article","category":"ai|tool|ai-agent|mcp|automation|web|devops","reason":"why this is trending"}]

Focus on: latest releases (past 7 days), breaking news, new open-source tools, new AI models, new MCP servers. Use real URLs from HackerNews, GitHub trending, TechCrunch, The Verge, ArsTechnica.`,
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (res.ok) {
      const data = await res.json()
      const text = data.cover_letter || ''
      // Parse JSON from AI response
      const match = text.match(/\[[\s\S]*\]/)
      if (match) {
        antonSuggestions.value = JSON.parse(match[0])
        antonStatus.value = `Found ${antonSuggestions.value.length} topics`
      } else {
        antonStatus.value = 'No structured suggestions returned'
      }
    }
  } catch (e) {
    antonStatus.value = `Error: ${e}`
  }

  antonRunning.value = false
}

async function antonAnalyzeGaps() {
  const apiKey = localStorage.getItem('neuralyx_openai_key') || import.meta.env.VITE_OPENAI_KEY || import.meta.env.VITE_GEMINI_KEY
  if (!apiKey) { alert('No AI key configured'); return }

  antonRunning.value = true
  antonStatus.value = 'Analyzing content gaps...'
  antonSuggestions.value = []

  const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'

  try {
    const categoryCounts = admin.news.reduce((acc: Record<string, number>, a) => { acc[a.category] = (acc[a.category] || 0) + 1; return acc }, {})

    const res = await fetch(`${mcpUrl}/api/jobs/cover-letter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'content_gaps',
        company: 'anton',
        description: `Analyze content gaps for an AI/automation portfolio blog. Current article counts by category: ${JSON.stringify(categoryCounts)}. Total articles: ${admin.news.length}.

Suggest 5 articles that would fill gaps — underrepresented categories, missing hot topics, missing foundational content.

Return ONLY a JSON array: [{"title":"Article Title","url":"https://relevant-source.com","category":"ai|tool|ai-agent|mcp|automation","reason":"why this fills a gap"}]`,
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (res.ok) {
      const data = await res.json()
      const text = data.cover_letter || ''
      const match = text.match(/\[[\s\S]*\]/)
      if (match) {
        antonSuggestions.value = JSON.parse(match[0])
        antonStatus.value = `Found ${antonSuggestions.value.length} gap-filling topics`
      }
    }
  } catch (e) {
    antonStatus.value = `Error: ${e}`
  }

  antonRunning.value = false
}

const NEWS_CATEGORIES = [
  { value: 'default-setup', label: '🔧 Default Setup' },
  { value: 'ai', label: 'AI' },
  { value: 'tool', label: 'Tool' },
  { value: 'mcp', label: 'MCP' },
  { value: 'ai-agent', label: 'AI Agent' },
  { value: 'skills', label: 'Skills' },
  { value: 'platform', label: 'Platform' },
  { value: 'ai-model', label: 'AI Model' },
  { value: '3d-gen', label: '3D Generation' },
  { value: 'automation', label: 'Automation' },
  { value: 'web', label: 'Web' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'devops', label: 'DevOps' },
  { value: 'general', label: 'General' },
]

// Landing page shows the 3 articles with lowest sort_order
const landingArticles = computed(() => {
  return [...admin.news]
    .filter(a => a.is_published)
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(0, 3)
})

const landingIds = computed(() => new Set(landingArticles.value.map(a => a.id)))

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'default-setup': ['default', 'default-setup', 'setup', 'configuration', 'project-template', 'init'],
  ai: ['ai', 'artificial intelligence', 'machine learning', 'ml'],
  tool: ['tool', 'cli', 'sdk', 'library', 'utility'],
  mcp: ['mcp', 'model context protocol'],
  'ai-agent': ['ai-agent', 'agent', 'autonomous', 'agentic'],
  skills: ['skills', 'learning', 'tutorial'],
  platform: ['platform', 'saas', 'service'],
  'ai-model': ['ai-model', 'llm', 'gpt', 'claude', 'gemini', 'benchmark'],
  '3d-gen': ['3d-gen', '3d', 'render'],
  automation: ['automation', 'automate', 'workflow', 'pipeline'],
  web: ['web', 'website', 'frontend', 'backend', 'seo'],
  mobile: ['mobile', 'ios', 'android'],
  devops: ['devops', 'docker', 'kubernetes', 'deploy'],
  general: ['general'],
}

// Auto-select category filter when search matches a category keyword
watch(searchQuery, (q) => {
  if (!q.trim()) return
  const lower = q.toLowerCase().trim()
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower === kw)) {
      filterCategory.value = cat
      return
    }
  }
})

const filteredArticles = computed(() => {
  let results = [...admin.news].sort((a, b) => a.sort_order - b.sort_order)
  if (filterCategory.value === 'landing') {
    return results.filter(a => landingIds.value.has(a.id))
  }
  if (filterCategory.value !== 'all') {
    results = results.filter(a => a.category === filterCategory.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    results = results.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.summary.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q)
    )
  }
  return results
})

const categoryCounts = computed(() => {
  const counts: Record<string, number> = {}
  admin.news.forEach(a => { counts[a.category] = (counts[a.category] || 0) + 1 })
  return counts
})

// Pagination
const currentPage = ref(1)
const perPage = 10
const totalPages = computed(() => Math.max(1, Math.ceil(filteredArticles.value.length / perPage)))
const paginatedArticles = computed(() => {
  const start = (currentPage.value - 1) * perPage
  return filteredArticles.value.slice(start, start + perPage)
})

const form = ref({
  title: '',
  slug: '',
  summary: '',
  content: '',
  image_url: '',
  video_url: '',
  link_url: '',
  category: 'ai',
  is_published: true,
  sort_order: 0,
})

onMounted(() => admin.fetchNews())

// Rich text editor
const editorRef = ref<HTMLDivElement | null>(null)
const showHtmlSource = ref(false)

function execCmd(cmd: string, value?: string) {
  document.execCommand(cmd, false, value)
  editorRef.value?.focus()
}

function insertLink() {
  const url = prompt('Enter URL:')
  if (url) execCmd('createLink', url)
}

function syncEditorToForm() {
  if (editorRef.value) {
    form.value.content = editorRef.value.innerHTML
  }
}

function loadEditorContent() {
  nextTick(() => {
    if (editorRef.value) {
      editorRef.value.innerHTML = form.value.content || ''
    }
  })
}

// Image preview error handling
const imgError = ref(false)
const vidError = ref(false)
watch(() => form.value.image_url, () => { imgError.value = false })
watch(() => form.value.video_url, () => { vidError.value = false })

// Image upload
const uploading = ref(false)
const uploadError = ref('')
const dragOver = ref(false)
const imageInputRef = ref<HTMLInputElement | null>(null)

async function uploadImageFile(file: File) {
  if (!file.type.startsWith('image/')) {
    uploadError.value = 'Only image files are supported'
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    uploadError.value = 'Image too large (max 10MB)'
    return
  }

  uploading.value = true
  uploadError.value = ''

  try {
    const reader = new FileReader()
    const dataUri = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

    const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
    const res = await fetch(`${mcpUrl}/api/upload-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: dataUri, filename: file.name }),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Upload failed')
    }

    const { url } = await res.json()
    // Build full URL from MCP server
    form.value.image_url = `${mcpUrl}${url}`
    imgError.value = false
  } catch (err: any) {
    uploadError.value = err.message || 'Upload failed'
  } finally {
    uploading.value = false
  }
}

function handleImageDrop(e: DragEvent) {
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) uploadImageFile(file)
}

function handleImagePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const file = item.getAsFile()
      if (file) uploadImageFile(file)
      return
    }
  }
}

function handleImageBrowse(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) uploadImageFile(file)
  input.value = '' // reset so same file can be re-selected
}

// Inline table image swap (auto-save + revert)
const inlineUploading = ref<string | null>(null) // article.id being uploaded
const inlineOriginals = ref<Record<string, string>>({}) // id → original image_url before swap

async function inlineImageDrop(e: DragEvent, article: NewsArticle) {
  const file = e.dataTransfer?.files?.[0]
  if (!file || !file.type.startsWith('image/')) return
  if (file.size > 10 * 1024 * 1024) return

  // Store original for revert (only first time)
  if (!(article.id in inlineOriginals.value)) {
    inlineOriginals.value[article.id] = article.image_url || ''
  }

  inlineUploading.value = article.id
  try {
    const reader = new FileReader()
    const dataUri = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

    const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
    const res = await fetch(`${mcpUrl}/api/upload-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: dataUri, filename: file.name }),
    })
    if (!res.ok) throw new Error('Upload failed')

    const { url } = await res.json()
    const fullUrl = `${mcpUrl}${url}`

    // Auto-save to DB
    await admin.updateRow('news', article.id, { image_url: fullUrl })
    await admin.fetchNews()
  } catch {
    // Remove from originals if save failed
    delete inlineOriginals.value[article.id]
  } finally {
    inlineUploading.value = null
  }
}

async function inlineImageBrowse(e: Event, article: NewsArticle) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''

  // Reuse drop logic via a synthetic approach
  if (!(article.id in inlineOriginals.value)) {
    inlineOriginals.value[article.id] = article.image_url || ''
  }

  inlineUploading.value = article.id
  try {
    const reader = new FileReader()
    const dataUri = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

    const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
    const res = await fetch(`${mcpUrl}/api/upload-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: dataUri, filename: file.name }),
    })
    if (!res.ok) throw new Error('Upload failed')

    const { url } = await res.json()
    const fullUrl = `${mcpUrl}${url}`
    await admin.updateRow('news', article.id, { image_url: fullUrl })
    await admin.fetchNews()
  } catch {
    delete inlineOriginals.value[article.id]
  } finally {
    inlineUploading.value = null
  }
}

async function revertImage(article: NewsArticle) {
  const original = inlineOriginals.value[article.id]
  if (original === undefined) return
  await admin.updateRow('news', article.id, { image_url: original })
  delete inlineOriginals.value[article.id]
  await admin.fetchNews()
}

const inlineDragOver = ref<string | null>(null)

// Article preview modal
const previewArticle = ref<NewsArticle | null>(null)

// Thumbnail generation
const thumbGenerating = ref<string | null>(null) // article.id
const thumbStatus = ref('')
const batchFixing = ref(false)
const batchProgress = ref({ done: 0, total: 0, current: '' })

function getApiKey() {
  return localStorage.getItem('neuralyx_openai_key') || import.meta.env.VITE_OPENAI_KEY || ''
}

async function generateThumbForArticle(article: NewsArticle) {
  thumbGenerating.value = article.id
  thumbStatus.value = ''
  try {
    const result = await generateThumbnail(
      article.title,
      article.category,
      article.summary,
      article.link_url || null,
      getApiKey(),
      (msg) => { thumbStatus.value = msg },
    )
    if (result) {
      await admin.updateRow('news', article.id, { image_url: result.url })
      await admin.fetchNews()
      thumbStatus.value = `Done! (${result.method})`
    } else {
      thumbStatus.value = 'Failed — no image generated'
    }
  } catch (err: any) {
    thumbStatus.value = err.message || 'Failed'
  } finally {
    thumbGenerating.value = null
    setTimeout(() => { thumbStatus.value = '' }, 4000)
  }
}

const articlesWithoutImages = computed(() =>
  admin.news.filter(a => !a.image_url)
)

async function batchFixMissingImages() {
  const articles = articlesWithoutImages.value
  if (!articles.length) return

  batchFixing.value = true
  batchProgress.value = { done: 0, total: articles.length, current: '' }

  for (const article of articles) {
    batchProgress.value.current = article.title
    try {
      const result = await generateThumbnail(
        article.title,
        article.category,
        article.summary,
        article.link_url || null,
        getApiKey(),
      )
      if (result) {
        await admin.updateRow('news', article.id, { image_url: result.url })
      }
    } catch { /* continue to next */ }
    batchProgress.value.done++
  }

  await admin.fetchNews()
  batchFixing.value = false
}

// ─── Permanently fix ALL images (regenerate every article's thumbnail) ───
async function batchFixAllImages() {
  if (!confirm('Regenerate ALL article thumbnails? This will overwrite existing images.')) return

  const allArticles = [...admin.news]
  batchFixing.value = true
  batchProgress.value = { done: 0, total: allArticles.length, current: '' }

  for (const article of allArticles) {
    batchProgress.value.current = article.title
    try {
      const result = await generateThumbnail(
        article.title,
        article.category,
        article.summary,
        article.link_url || null,
        getApiKey(),
      )
      if (result) {
        await admin.updateRow('news', article.id, { image_url: result.url })
      }
    } catch { /* continue to next */ }
    batchProgress.value.done++
  }

  await admin.fetchNews()
  batchFixing.value = false
  alert(`Done! Processed ${allArticles.length} articles.`)
}

function openCreate() {
  editing.value = null
  showHtmlSource.value = false
  const maxOrder = admin.news.reduce((max, a) => Math.max(max, a.sort_order), 0)
  Object.assign(form.value, {
    title: '', slug: '', summary: '', content: '', image_url: '', video_url: '', link_url: '',
    category: 'ai', is_published: true, sort_order: maxOrder + 1,
  })
  showModal.value = true
  loadEditorContent()
}

function openEdit(article: NewsArticle) {
  editing.value = article
  showHtmlSource.value = false
  Object.assign(form.value, {
    title: article.title,
    slug: article.slug,
    summary: article.summary,
    content: article.content,
    image_url: article.image_url,
    video_url: article.video_url,
    link_url: article.link_url,
    category: article.category,
    is_published: article.is_published,
    sort_order: article.sort_order,
  })
  showModal.value = true
  loadEditorContent()
}

function toggleHtmlSource() {
  if (showHtmlSource.value) {
    // Switching from source back to editor
    loadEditorContent()
  } else {
    // Switching to source — sync editor to form first
    syncEditorToForm()
  }
  showHtmlSource.value = !showHtmlSource.value
}

async function handleSave() {
  // Sync editor content before saving
  if (!showHtmlSource.value) syncEditorToForm()

  const data = {
    ...form.value,
    slug: form.value.slug || form.value.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
  }

  if (editing.value) {
    await admin.updateRow('news', editing.value.id, data)
  } else {
    await admin.insertRow('news', data)
  }
  showModal.value = false
  await admin.fetchNews()
}

async function handleDelete(id: string) {
  if (confirm('Delete this article?')) {
    await admin.deleteRow('news', id)
    await admin.fetchNews()
  }
}

async function togglePublish(article: NewsArticle) {
  await admin.updateRow('news', article.id, { is_published: !article.is_published })
  await admin.fetchNews()
}

// Pin to landing: set sort_order to 0 (top), bump others up
async function pinToLanding(article: NewsArticle) {
  if (landingIds.value.has(article.id)) return // already on landing
  // Give it sort_order 1, shift others
  const minOrder = Math.min(...admin.news.map(a => a.sort_order))
  await admin.updateRow('news', article.id, { sort_order: minOrder - 1 })
  await admin.fetchNews()
}

// Unpin from landing: set sort_order high to push off top 3
async function unpinFromLanding(article: NewsArticle) {
  if (!landingIds.value.has(article.id)) return
  const maxOrder = Math.max(...admin.news.map(a => a.sort_order))
  await admin.updateRow('news', article.id, { sort_order: maxOrder + 1 })
  await admin.fetchNews()
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-white">News & Articles</h2>
        <p class="text-xs text-gray-400 mt-1">Top 3 by sort order appear on landing page</p>
      </div>
      <button @click="openCreate"
        class="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
        style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
        + Add Article
      </button>
    </div>

    <!-- AI Generate from URL -->
    <div class="mb-4 p-4 bg-neural-800/50 border border-cyber-purple/20 rounded-xl">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-xs font-semibold text-cyber-purple uppercase tracking-wider">AI Generate from URL</span>
        <span class="text-[10px] text-gray-500">Paste a link, AI writes the article as you</span>
      </div>
      <div class="flex gap-2">
        <input
          v-model="generateUrl"
          type="url"
          placeholder="https://techcrunch.com/2026/03/..."
          :disabled="generating"
          @keydown.enter="generateFromUrl"
          class="flex-1 px-3 py-2.5 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none placeholder-gray-500 disabled:opacity-50"
        />
        <button
          @click="generateFromUrl"
          :disabled="generating || !generateUrl.trim()"
          class="px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-40 flex items-center gap-2 whitespace-nowrap"
          style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));"
        >
          <svg v-if="generating" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <span v-else>&#x2728;</span>
          {{ generating ? 'Generating...' : 'Generate' }}
        </button>
      </div>
      <p v-if="generateStatus && generating" class="mt-2 text-xs text-cyber-cyan animate-pulse">{{ generateStatus }}</p>
      <p v-if="generateError && !generating" class="mt-2 text-xs text-red-400">{{ generateError }}</p>
    </div>

    <!-- AI Content Tools -->
    <div class="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
      <!-- Caveman: Token-Efficient Summarizer -->
      <div class="p-4 bg-neural-800/50 border border-amber-500/20 rounded-xl">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-lg">🦴</span>
          <span class="text-xs font-semibold text-amber-400 uppercase tracking-wider">Caveman Compress</span>
        </div>
        <p class="text-[10px] text-gray-500 mb-3">Bulk compress article summaries — saves ~65% tokens while keeping accuracy. Uses ultra-condensed language.</p>
        <div class="flex gap-2">
          <button @click="cavemanCompress" :disabled="cavemanRunning"
            class="px-4 py-2 rounded-lg text-[11px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 disabled:opacity-40 flex items-center gap-1.5">
            <svg v-if="cavemanRunning" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            {{ cavemanRunning ? `Compressing ${cavemanProgress}...` : 'Compress All Summaries' }}
          </button>
          <button @click="cavemanRegenThumbnails" :disabled="cavemanRunning"
            class="px-4 py-2 rounded-lg text-[11px] font-medium text-gray-400 bg-neural-700 hover:bg-neural-600 disabled:opacity-40">
            Regen Thumbnails
          </button>
        </div>
      </div>

      <!-- Anton: AI Content Intelligence Agent -->
      <div class="p-4 bg-neural-800/50 border border-green-500/20 rounded-xl">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-lg">🧠</span>
          <span class="text-xs font-semibold text-green-400 uppercase tracking-wider">Anton Agent</span>
        </div>
        <p class="text-[10px] text-gray-500 mb-3">AI content intelligence — auto-discover trending topics, suggest articles, analyze content gaps, draft editorial calendar.</p>
        <div class="flex gap-2">
          <button @click="antonDiscoverTopics" :disabled="antonRunning"
            class="px-4 py-2 rounded-lg text-[11px] font-medium text-green-400 bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 disabled:opacity-40 flex items-center gap-1.5">
            <svg v-if="antonRunning" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            {{ antonRunning ? antonStatus : 'Discover Trending Topics' }}
          </button>
          <button @click="antonAnalyzeGaps" :disabled="antonRunning"
            class="px-4 py-2 rounded-lg text-[11px] font-medium text-gray-400 bg-neural-700 hover:bg-neural-600 disabled:opacity-40">
            Content Gaps
          </button>
        </div>
        <div v-if="antonSuggestions.length" class="mt-3 space-y-1.5">
          <div v-for="(s, i) in antonSuggestions" :key="i" class="flex items-center gap-2 px-3 py-2 bg-neural-700/50 rounded-lg">
            <span class="text-[10px] text-green-400 shrink-0">{{ i + 1 }}.</span>
            <p class="text-[10px] text-gray-300 flex-1">{{ s.title }}</p>
            <button @click="generateUrl = s.url; generateFromUrl()" class="text-[9px] text-cyber-cyan hover:underline shrink-0">Generate</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Batch Fix Missing Images -->
    <div v-if="articlesWithoutImages.length > 0 || batchFixing" class="mb-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-center justify-between">
      <div class="flex items-center gap-3 min-w-0">
        <span class="text-amber-400 text-lg flex-shrink-0">🖼️</span>
        <div v-if="!batchFixing" class="min-w-0">
          <p class="text-xs text-amber-400 font-medium">{{ articlesWithoutImages.length }} article{{ articlesWithoutImages.length !== 1 ? 's' : '' }} missing thumbnails</p>
          <p class="text-[10px] text-gray-500">Auto-generate via screenshot + DALL-E</p>
        </div>
        <div v-else class="min-w-0">
          <p class="text-xs text-amber-400 font-medium">Generating {{ batchProgress.done }}/{{ batchProgress.total }}...</p>
          <p class="text-[10px] text-gray-500 truncate">{{ batchProgress.current }}</p>
        </div>
      </div>
      <button @click="batchFixMissingImages" :disabled="batchFixing"
        class="px-4 py-2 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-40 flex items-center gap-2 whitespace-nowrap flex-shrink-0"
        style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
        <svg v-if="batchFixing" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        {{ batchFixing ? 'Working...' : 'Fix Missing' }}
      </button>
    </div>

    <!-- Generate All Images (always visible) -->
    <div class="mb-4 p-3 bg-neural-800/50 border border-neural-600 rounded-xl flex items-center justify-between">
      <div class="flex items-center gap-3 min-w-0">
        <span class="text-cyber-purple text-lg flex-shrink-0">⚡</span>
        <div class="min-w-0">
          <p class="text-xs text-cyber-purple font-medium">Regenerate ALL thumbnails</p>
          <p class="text-[10px] text-gray-500">Overwrites existing images for all {{ admin.news.length }} articles</p>
        </div>
      </div>
      <button @click="batchFixAllImages" :disabled="batchFixing"
        class="px-4 py-2 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-40 flex items-center gap-2 whitespace-nowrap flex-shrink-0"
        style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
        <svg v-if="batchFixing" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        {{ batchFixing ? `Generating ${batchProgress.done}/${batchProgress.total}...` : 'Generate All Images' }}
      </button>
    </div>

    <!-- Thumb generation status -->
    <p v-if="thumbStatus && thumbGenerating" class="text-xs text-cyber-cyan mb-2 px-1 animate-pulse">{{ thumbStatus }}</p>

    <!-- Search Bar -->
    <div class="mb-4">
      <div class="relative">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search articles... type 'mcp', 'tool', 'seo' to auto-filter category"
          class="w-full pl-10 pr-4 py-2.5 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none placeholder-gray-500"
        />
        <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    </div>

    <!-- Category Filter -->
    <div class="flex flex-wrap gap-2 mb-6">
      <button
        @click="filterCategory = 'all'"
        class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        :class="filterCategory === 'all' ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-neural-700 text-gray-400 hover:text-white'"
      >
        All ({{ admin.news.length }})
      </button>
      <button
        @click="filterCategory = 'landing'"
        class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        :class="filterCategory === 'landing' ? 'bg-amber-500/20 text-amber-400' : 'bg-neural-700 text-gray-400 hover:text-amber-400'"
      >
        ⭐ Landing ({{ landingArticles.length }})
      </button>
      <button
        v-for="cat in NEWS_CATEGORIES"
        :key="cat.value"
        v-show="categoryCounts[cat.value]"
        @click="filterCategory = cat.value"
        class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        :class="filterCategory === cat.value ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-neural-700 text-gray-400 hover:text-white'"
      >
        {{ cat.label }} ({{ categoryCounts[cat.value] || 0 }})
      </button>
    </div>

    <!-- Articles Table -->
    <div class="bg-neural-800 border border-neural-600 rounded-xl overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">
          <thead>
            <tr class="border-b border-neural-600 bg-neural-900/50">
              <th class="px-3 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-8">#</th>
              <th class="px-3 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-20 text-center">Image</th>
              <th class="px-3 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Article</th>
              <th class="px-3 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-24">Category</th>
              <th class="px-3 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-24">Status</th>
              <th class="px-3 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-16 text-center">Link</th>
              <th class="px-3 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-16 text-center">Details</th>
              <th class="px-3 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-40 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="article in paginatedArticles" :key="article.id"
                class="border-b border-neural-700/50 hover:bg-neural-700/30 transition-colors"
                :class="landingIds.has(article.id) ? 'bg-amber-500/[0.03]' : ''">
              <!-- Sort Order -->
              <td class="px-3 py-2">
                <span class="text-xs text-gray-500 font-mono">{{ article.sort_order }}</span>
              </td>
              <!-- Image (drop zone) -->
              <td class="px-3 py-2">
                <div
                  @dragover.prevent="inlineDragOver = article.id"
                  @dragleave="inlineDragOver = null"
                  @drop.prevent="inlineDragOver = null; inlineImageDrop($event, article)"
                  class="relative w-14 h-14 rounded-lg overflow-hidden border-2 border-dashed transition-all cursor-pointer group"
                  :class="inlineDragOver === article.id ? 'border-cyber-purple bg-cyber-purple/10' : article.image_url ? 'border-transparent' : 'border-neural-600 hover:border-gray-500'"
                >
                  <!-- Uploading spinner -->
                  <div v-if="inlineUploading === article.id" class="w-full h-full flex items-center justify-center bg-neural-700">
                    <svg class="w-5 h-5 text-cyber-purple animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  </div>
                  <!-- Current image -->
                  <template v-else-if="article.image_url">
                    <img :src="article.image_url" :alt="article.title" class="w-full h-full object-cover" />
                    <!-- Hover overlay -->
                    <div class="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-0.5">
                      <label class="text-[9px] text-white/80 cursor-pointer hover:text-white">
                        <input type="file" accept="image/*" class="hidden" @change="inlineImageBrowse($event, article)" />
                        Swap
                      </label>
                      <button v-if="article.id in inlineOriginals" type="button" @click.stop="revertImage(article)"
                        class="text-[9px] text-amber-400 hover:text-amber-300">
                        Revert
                      </button>
                    </div>
                  </template>
                  <!-- Empty: drop, click, or AI generate -->
                  <div v-else class="w-full h-full flex items-center justify-center bg-neural-700 relative group/empty">
                    <label class="absolute inset-0 cursor-pointer z-10">
                      <input type="file" accept="image/*" class="hidden" @change="inlineImageBrowse($event, article)" />
                    </label>
                    <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                  </div>
                </div>
                <!-- AI Generate / Revert buttons -->
                <div class="mt-1 flex items-center justify-center gap-1">
                  <button v-if="!article.image_url && thumbGenerating !== article.id"
                    @click.stop="generateThumbForArticle(article)"
                    class="text-[9px] text-cyber-purple hover:text-cyber-cyan flex items-center gap-0.5 transition-colors"
                    title="AI generate thumbnail">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                    AI
                  </button>
                  <span v-if="thumbGenerating === article.id" class="text-[9px] text-cyber-cyan animate-pulse">gen...</span>
                  <button v-if="article.id in inlineOriginals && inlineUploading !== article.id"
                    @click="revertImage(article)"
                    class="text-[9px] text-amber-400 hover:text-amber-300 flex items-center gap-0.5"
                    title="Revert to original image">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                    Undo
                  </button>
                </div>
              </td>
              <!-- Article Info -->
              <td class="px-3 py-2">
                <div class="min-w-0">
                  <h3 class="text-white font-medium text-sm truncate max-w-[300px]">{{ article.title }}</h3>
                  <p class="text-gray-500 text-[11px] truncate max-w-[300px] mt-0.5">{{ article.summary }}</p>
                </div>
              </td>
              <!-- Category -->
              <td class="px-3 py-2">
                <span class="px-2 py-0.5 text-[10px] rounded-full bg-cyber-purple/20 text-cyber-purple font-semibold uppercase">
                  {{ article.category }}
                </span>
              </td>
              <!-- Status -->
              <td class="px-3 py-2">
                <div class="flex flex-col gap-1">
                  <span class="px-2 py-0.5 text-[10px] rounded-full font-semibold uppercase w-fit"
                        :class="article.is_published ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'">
                    {{ article.is_published ? 'Live' : 'Draft' }}
                  </span>
                  <span v-if="landingIds.has(article.id)" class="px-2 py-0.5 text-[10px] rounded-full bg-amber-500/20 text-amber-400 font-semibold uppercase w-fit">
                    Landing
                  </span>
                </div>
              </td>
              <!-- Link -->
              <td class="px-3 py-2 text-center">
                <a v-if="article.link_url" :href="article.link_url" target="_blank" rel="noopener"
                   class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-neural-700 text-blue-400 hover:text-blue-300 hover:bg-neural-600 transition-colors"
                   title="Open source link">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                </a>
                <span v-else class="text-gray-600 text-xs">—</span>
              </td>
              <!-- Details -->
              <td class="px-3 py-2 text-center">
                <button @click="previewArticle = article"
                  class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-neural-700 text-cyan-400 hover:text-cyan-300 hover:bg-neural-600 transition-colors"
                  title="Preview article">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                </button>
              </td>
              <!-- Actions -->
              <td class="px-3 py-2">
                <div class="flex items-center justify-center gap-1">
                  <!-- Pin/Unpin -->
                  <button v-if="landingIds.has(article.id)" @click="unpinFromLanding(article)"
                    class="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors flex items-center justify-center"
                    title="Unpin from landing">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  </button>
                  <button v-else @click="pinToLanding(article)"
                    class="w-8 h-8 rounded-lg bg-neural-700 text-gray-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors flex items-center justify-center"
                    title="Pin to landing">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
                  </button>
                  <!-- Publish/Unpublish -->
                  <button @click="togglePublish(article)"
                    class="w-8 h-8 rounded-lg transition-colors flex items-center justify-center"
                    :class="article.is_published ? 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20' : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'"
                    :title="article.is_published ? 'Unpublish' : 'Publish'">
                    <svg v-if="article.is_published" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"/></svg>
                    <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                  </button>
                  <!-- Edit -->
                  <button @click="openEdit(article)"
                    class="w-8 h-8 rounded-lg bg-neural-700 text-gray-300 hover:text-white hover:bg-neural-600 transition-colors flex items-center justify-center"
                    title="Edit article">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </button>
                  <!-- Delete -->
                  <button @click="handleDelete(article.id)"
                    class="w-8 h-8 rounded-lg bg-red-900/20 text-red-400 hover:bg-red-900/40 transition-colors flex items-center justify-center"
                    title="Delete article">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Empty state -->
      <div v-if="!filteredArticles.length" class="text-center py-12 text-gray-400">
        <p class="text-4xl mb-3">📰</p>
        <p class="text-sm">{{ searchQuery || filterCategory !== 'all' ? 'No articles match your filter.' : 'No articles yet.' }}</p>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-between mt-4">
      <p class="text-xs text-gray-500">Showing {{ (currentPage - 1) * perPage + 1 }}–{{ Math.min(currentPage * perPage, filteredArticles.length) }} of {{ filteredArticles.length }}</p>
      <div class="flex items-center gap-2">
        <button @click="currentPage = Math.max(1, currentPage - 1)" :disabled="currentPage === 1"
          class="px-3 py-1.5 text-xs rounded-lg bg-neural-700 text-gray-400 disabled:opacity-30 hover:text-white transition-colors">Prev</button>
        <template v-for="page in totalPages" :key="page">
          <button @click="currentPage = page"
            class="w-7 h-7 text-xs rounded-lg transition-colors flex items-center justify-center"
            :class="page === currentPage ? 'bg-cyber-purple/20 text-cyber-purple font-semibold' : 'text-gray-500 hover:text-white'">
            {{ page }}
          </button>
        </template>
        <button @click="currentPage = Math.min(totalPages, currentPage + 1)" :disabled="currentPage === totalPages"
          class="px-3 py-1.5 text-xs rounded-lg bg-neural-700 text-gray-400 disabled:opacity-30 hover:text-white transition-colors">Next</button>
      </div>
    </div>

    <!-- Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" @click.self="showModal = false">
        <div class="bg-neural-800 border border-neural-600 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6">
          <h3 class="text-lg font-bold text-white mb-6">{{ editing ? 'Edit' : 'Create' }} Article</h3>

          <form @submit.prevent="handleSave" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs text-gray-400 uppercase mb-1">Title</label>
                <input v-model="form.title" required class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
              </div>
              <div>
                <label class="block text-xs text-gray-400 uppercase mb-1">Slug (auto-generated)</label>
                <input v-model="form.slug" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" placeholder="auto-from-title" />
              </div>
            </div>

            <div>
              <label class="block text-xs text-gray-400 uppercase mb-1">Summary (shown on card)</label>
              <textarea v-model="form.summary" rows="2" required class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none resize-none"></textarea>
            </div>

            <!-- Rich Text Editor -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="block text-xs text-gray-400 uppercase">Content</label>
                <button type="button" @click="toggleHtmlSource"
                  class="text-[10px] px-2 py-0.5 rounded bg-neural-700 text-gray-400 hover:text-white transition-colors">
                  {{ showHtmlSource ? 'Visual Editor' : 'HTML Source' }}
                </button>
              </div>
              <!-- Toolbar -->
              <div v-if="!showHtmlSource" class="flex flex-wrap items-center gap-1 p-2 bg-neural-900 border border-neural-600 border-b-0 rounded-t-lg">
                <button type="button" @click="execCmd('formatBlock', 'h2')" class="px-2 py-1 text-xs rounded bg-neural-700 text-gray-300 hover:text-white hover:bg-neural-600" title="Heading">H2</button>
                <button type="button" @click="execCmd('formatBlock', 'p')" class="px-2 py-1 text-xs rounded bg-neural-700 text-gray-300 hover:text-white hover:bg-neural-600" title="Paragraph">P</button>
                <span class="w-px h-5 bg-neural-600 mx-1"></span>
                <button type="button" @click="execCmd('bold')" class="px-2 py-1 text-xs rounded bg-neural-700 text-gray-300 hover:text-white hover:bg-neural-600 font-bold" title="Bold">B</button>
                <button type="button" @click="execCmd('italic')" class="px-2 py-1 text-xs rounded bg-neural-700 text-gray-300 hover:text-white hover:bg-neural-600 italic" title="Italic">I</button>
                <button type="button" @click="execCmd('underline')" class="px-2 py-1 text-xs rounded bg-neural-700 text-gray-300 hover:text-white hover:bg-neural-600 underline" title="Underline">U</button>
                <span class="w-px h-5 bg-neural-600 mx-1"></span>
                <button type="button" @click="execCmd('insertUnorderedList')" class="px-2 py-1 text-xs rounded bg-neural-700 text-gray-300 hover:text-white hover:bg-neural-600" title="Bullet List">&#x2022; List</button>
                <button type="button" @click="execCmd('insertOrderedList')" class="px-2 py-1 text-xs rounded bg-neural-700 text-gray-300 hover:text-white hover:bg-neural-600" title="Numbered List">1. List</button>
                <span class="w-px h-5 bg-neural-600 mx-1"></span>
                <button type="button" @click="insertLink" class="px-2 py-1 text-xs rounded bg-neural-700 text-gray-300 hover:text-white hover:bg-neural-600" title="Insert Link">&#x1F517; Link</button>
                <button type="button" @click="execCmd('removeFormat')" class="px-2 py-1 text-xs rounded bg-neural-700 text-gray-300 hover:text-white hover:bg-neural-600" title="Clear Formatting">&#x2715; Clear</button>
              </div>
              <!-- Editable area -->
              <div v-if="!showHtmlSource"
                ref="editorRef"
                contenteditable="true"
                @input="syncEditorToForm"
                class="w-full min-h-[250px] max-h-[400px] overflow-y-auto px-4 py-3 bg-neural-700 border border-neural-600 rounded-b-lg text-white text-sm focus:border-cyber-purple focus:outline-none prose prose-invert prose-sm max-w-none
                  [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-3 [&_h2]:mb-1
                  [&_p]:my-1 [&_p]:text-gray-200
                  [&_a]:text-cyber-purple [&_a]:underline
                  [&_strong]:text-white
                  [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1
                  [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1
                  [&_li]:text-gray-200 [&_li]:my-0.5"
              ></div>
              <!-- HTML source fallback -->
              <textarea v-if="showHtmlSource" v-model="form.content" rows="12"
                class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none resize-y font-mono"></textarea>
            </div>

            <!-- Media: Image + Video with previews -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Image Upload -->
              <div @paste="handleImagePaste">
                <div class="flex items-center justify-between mb-1">
                  <label class="block text-xs text-gray-400 uppercase">Image</label>
                  <span v-if="uploading" class="text-[10px] text-cyber-purple animate-pulse">Uploading...</span>
                </div>

                <!-- Drop zone / Preview -->
                <div
                  @dragover.prevent="dragOver = true"
                  @dragleave="dragOver = false"
                  @drop.prevent="handleImageDrop"
                  class="relative rounded-lg border-2 border-dashed transition-colors overflow-hidden cursor-pointer"
                  :class="dragOver ? 'border-cyber-purple bg-cyber-purple/10' : form.image_url && !imgError ? 'border-neural-600' : 'border-neural-600 hover:border-gray-500'"
                  @click="!form.image_url && imageInputRef?.click()"
                >
                  <!-- Image preview -->
                  <div v-if="form.image_url && !imgError" class="relative group">
                    <img :src="form.image_url" :alt="form.title || 'Preview'" @error="imgError = true"
                      class="w-full h-44 object-cover" />
                    <!-- Overlay actions -->
                    <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button type="button" @click.stop="imageInputRef?.click()"
                        class="px-3 py-1.5 text-xs rounded-lg bg-white/20 text-white hover:bg-white/30 transition-colors backdrop-blur-sm">
                        Replace
                      </button>
                      <button type="button" @click.stop="form.image_url = ''"
                        class="px-3 py-1.5 text-xs rounded-lg bg-red-500/30 text-red-300 hover:bg-red-500/50 transition-colors backdrop-blur-sm">
                        Remove
                      </button>
                    </div>
                  </div>

                  <!-- Empty state / Drop zone -->
                  <div v-else class="flex flex-col items-center justify-center py-8 px-4">
                    <div v-if="uploading" class="flex flex-col items-center gap-2">
                      <svg class="w-8 h-8 text-cyber-purple animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      <p class="text-xs text-gray-400">Uploading image...</p>
                    </div>
                    <template v-else>
                      <svg class="w-10 h-10 text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                      </svg>
                      <p class="text-xs text-gray-400 text-center">
                        <span class="text-cyber-purple font-medium">Click to browse</span>, drag & drop, or paste an image
                      </p>
                      <p class="text-[10px] text-gray-600 mt-1">PNG, JPG, GIF, WebP up to 10MB</p>
                    </template>
                  </div>
                </div>

                <!-- URL input (collapsible) -->
                <div class="mt-2 flex items-center gap-2">
                  <input v-model="form.image_url" class="flex-1 px-3 py-1.5 bg-neural-700 border border-neural-600 rounded-lg text-white text-[11px] focus:border-cyber-purple focus:outline-none" placeholder="Or paste image URL..." />
                  <button v-if="form.image_url" type="button" @click="form.image_url = ''" class="text-gray-500 hover:text-red-400 transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>

                <!-- Hidden file input -->
                <input ref="imageInputRef" type="file" accept="image/*" class="hidden" @change="handleImageBrowse" />

                <!-- Error state -->
                <p v-if="uploadError" class="mt-1 text-xs text-red-400">{{ uploadError }}</p>
                <p v-else-if="form.image_url && imgError" class="mt-1 text-xs text-red-400">Failed to load image from URL</p>
              </div>

              <!-- Video -->
              <div>
                <label class="block text-xs text-gray-400 uppercase mb-1">Video URL (embed)</label>
                <input v-model="form.video_url" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" placeholder="https://youtube.com/embed/..." />
                <div v-if="form.video_url && !vidError" class="mt-2 rounded-lg overflow-hidden border border-neural-600 bg-neural-900">
                  <iframe :src="form.video_url" @error="vidError = true"
                    class="w-full h-44" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                </div>
                <div v-else-if="form.video_url && vidError" class="mt-2 rounded-lg border border-red-900/50 bg-red-900/10 p-3 text-center">
                  <p class="text-xs text-red-400">Failed to load video</p>
                </div>
              </div>
            </div>

            <!-- Link + Category + Sort + Published -->
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label class="block text-xs text-gray-400 uppercase mb-1">External Link</label>
                <input v-model="form.link_url" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" placeholder="https://..." />
              </div>
              <div>
                <label class="block text-xs text-gray-400 uppercase mb-1">Category</label>
                <select v-model="form.category" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none">
                  <option v-for="cat in NEWS_CATEGORIES" :key="cat.value" :value="cat.value">{{ cat.label }}</option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-gray-400 uppercase mb-1">Sort Order</label>
                <input v-model.number="form.sort_order" type="number" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
              </div>
              <div class="flex items-end">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input v-model="form.is_published" type="checkbox" class="w-4 h-4 rounded bg-neural-700 border-neural-600" />
                  <span class="text-sm text-gray-300">Published</span>
                </label>
              </div>
            </div>

            <div class="flex justify-end gap-3 pt-4 border-t border-neural-600">
              <button type="button" @click="showModal = false" class="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button type="submit" class="px-6 py-2 rounded-lg text-sm font-medium text-white"
                      style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
                {{ editing ? 'Update' : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Article Preview Modal -->
    <Teleport to="body">
      <Transition name="preview-fade">
        <div v-if="previewArticle" class="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-8" @click.self="previewArticle = null">
          <div class="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
          <div class="relative w-full max-w-3xl max-h-[85vh] rounded-2xl border border-neural-600 overflow-hidden flex flex-col"
               style="background: linear-gradient(135deg, rgba(18,18,31,0.98), rgba(10,10,18,0.99));">
            <!-- Header -->
            <div class="flex items-center justify-between px-6 py-4 border-b border-neural-700 flex-shrink-0">
              <div class="flex items-center gap-3 min-w-0">
                <span class="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-cyber-purple/20 text-cyber-purple">
                  {{ previewArticle.category }}
                </span>
                <span class="px-2 py-0.5 text-[10px] rounded-full font-semibold uppercase"
                      :class="previewArticle.is_published ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'">
                  {{ previewArticle.is_published ? 'Published' : 'Draft' }}
                </span>
                <span class="text-white/25 text-xs">{{ new Date(previewArticle.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}</span>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <button @click="openEdit(previewArticle!); previewArticle = null"
                  class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center transition-colors" title="Edit">
                  <svg class="w-4 h-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
                <button @click="previewArticle = null"
                  class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center transition-colors">
                  <svg class="w-4 h-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            </div>

            <!-- Scrollable body -->
            <div class="overflow-y-auto flex-1 p-6 sm:p-8">
              <!-- Title -->
              <h1 class="text-xl sm:text-2xl font-bold text-white mb-1">{{ previewArticle.title }}</h1>
              <p class="text-xs text-gray-500 font-mono mb-4">{{ previewArticle.slug }}</p>

              <!-- Summary -->
              <div class="mb-5 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <p class="text-[10px] text-gray-500 uppercase font-semibold mb-1">Summary</p>
                <p class="text-sm text-white/70">{{ previewArticle.summary }}</p>
              </div>

              <!-- Hero image -->
              <div v-if="previewArticle.image_url" class="mb-5 rounded-xl overflow-hidden">
                <img :src="previewArticle.image_url" :alt="previewArticle.title" class="w-full max-h-[300px] object-cover" />
              </div>

              <!-- Video -->
              <div v-if="previewArticle.video_url" class="mb-5 rounded-xl overflow-hidden aspect-video bg-black">
                <iframe :src="previewArticle.video_url" class="w-full h-full" frameborder="0" allowfullscreen></iframe>
              </div>

              <!-- Content -->
              <div class="preview-content text-sm text-white/70 leading-relaxed" v-html="previewArticle.content"></div>

              <!-- Meta info -->
              <div class="mt-6 pt-4 border-t border-neural-700 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <p class="text-[10px] text-gray-500 uppercase font-semibold">Sort Order</p>
                  <p class="text-sm text-white font-mono">{{ previewArticle.sort_order }}</p>
                </div>
                <div>
                  <p class="text-[10px] text-gray-500 uppercase font-semibold">Category</p>
                  <p class="text-sm text-white">{{ previewArticle.category }}</p>
                </div>
                <div v-if="previewArticle.link_url" class="col-span-2">
                  <p class="text-[10px] text-gray-500 uppercase font-semibold">Source Link</p>
                  <a :href="previewArticle.link_url" target="_blank" rel="noopener" class="text-sm text-blue-400 hover:text-blue-300 truncate block">
                    {{ previewArticle.link_url }}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.preview-fade-enter-active, .preview-fade-leave-active {
  transition: opacity 0.2s ease;
}
.preview-fade-enter-from, .preview-fade-leave-to {
  opacity: 0;
}
.preview-content :deep(h2) {
  font-size: 1rem;
  font-weight: 700;
  color: white;
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
}
.preview-content :deep(p) {
  margin-bottom: 0.75rem;
}
.preview-content :deep(a) {
  color: #a78bfa;
  text-decoration: underline;
}
.preview-content :deep(ul), .preview-content :deep(ol) {
  padding-left: 1.25rem;
  margin-bottom: 0.75rem;
}
.preview-content :deep(li) {
  margin-bottom: 0.25rem;
}
.preview-content :deep(strong) {
  color: white;
}
</style>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, watch } from 'vue'

const MCP_URL = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
const CONVERSATION_KEY = 'neuralyx_copilot_conv_id'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  jobs?: JobCard[]
  actions?: PendingAction[]
  isLoading?: boolean
  toolsUsed?: string[]
}

interface JobCard {
  id: string
  title: string
  company: string
  platform: string
  match_score: number | null
  status: string
  url: string
  posted_at: string | null
  easy_apply: boolean
  salary_min?: number | null
  salary_max?: number | null
  salary_currency?: string
}

interface PendingAction {
  type: 'apply' | 'search' | 'dismiss' | 'connect'
  label: string
  payload: Record<string, unknown>
  confirmed?: boolean
}

// ─── State ───────────────────────────────────────────────────────────────────

const messages = ref<ChatMessage[]>([])
const input = ref('')
const loading = ref(false)
const scrollEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)
const conversationId = ref(localStorage.getItem(CONVERSATION_KEY) || crypto.randomUUID())

interface PipelineStats {
  unapplied_high: number
  ghosted: number
  interviews: number
  new_today: number
}

const pipelineStats = ref<PipelineStats | null>(null)

const CHIPS = computed(() => {
  const s = pipelineStats.value
  if (!s) return [
    { label: 'Pipeline status', msg: 'Show me my pipeline status — how many applied, responses, interviews this week?' },
    { label: 'Top matches', msg: 'Show me the highest match score jobs I haven\'t applied to yet' },
    { label: 'New jobs today', msg: 'What new jobs were scraped today?' },
    { label: 'Response rate', msg: 'What is my application response rate by platform?' },
    { label: 'Run search', msg: 'Run a new job search across all platforms now' },
    { label: 'Skill gaps', msg: 'What skills am I most often missing in job requirements?' },
  ]

  const chips = []

  if (s.unapplied_high > 0)
    chips.push({ label: `Apply top ${Math.min(s.unapplied_high, 5)} matches`, msg: `Apply to the top ${Math.min(s.unapplied_high, 5)} highest match jobs I haven't applied to yet` })

  if (s.new_today > 0)
    chips.push({ label: `${s.new_today} new today`, msg: `Show me all ${s.new_today} jobs scraped today` })

  if (s.ghosted > 0)
    chips.push({ label: `${s.ghosted} ghosted`, msg: `Show me all applications with no response after 7+ days` })

  if (s.interviews > 0)
    chips.push({ label: `${s.interviews} interviews`, msg: 'Show my upcoming interviews and their details' })

  chips.push({ label: 'Pipeline status', msg: 'Show me my full pipeline status this week' })
  chips.push({ label: 'Response rate', msg: 'What is my application response rate by platform?' })
  chips.push({ label: 'Run search', msg: 'Run a new job search across all platforms now' })

  return chips.slice(0, 6)
})

// ─── Computed ─────────────────────────────────────────────────────────────────

const hasMessages = computed(() => messages.value.length > 0)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function genId() { return crypto.randomUUID() }

function scrollBottom() {
  nextTick(() => {
    if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
  })
}

function formatTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function formatSalary(job: JobCard) {
  if (!job.salary_min && !job.salary_max) return null
  const cur = job.salary_currency === 'PHP' ? '₱' : '$'
  if (job.salary_min && job.salary_max)
    return `${cur}${(job.salary_min / 1000).toFixed(0)}k–${(job.salary_max / 1000).toFixed(0)}k`
  if (job.salary_min) return `${cur}${(job.salary_min / 1000).toFixed(0)}k+`
  return null
}

function scoreColor(score: number | null) {
  if (score === null) return 'text-gray-500'
  if (score >= 80) return 'text-green-400'
  if (score >= 65) return 'text-yellow-400'
  return 'text-red-400'
}

function platformIcon(p: string) {
  const map: Record<string, string> = {
    linkedin: '🟦', indeed: '🔵', kalibrr: '🔷', jobslin: '🟣', onlinejobs: '🟠',
    remoteok: '🌍', himalayas: '⛰️', remotive: '🏠',
  }
  return map[p?.toLowerCase()] || '🔗'
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code class="bg-neural-700/80 text-cyber-cyan px-1 rounded text-[11px] font-mono">$1</code>')
    .replace(/^#{1,3} (.+)$/gm, '<p class="font-semibold text-white mt-2 mb-1">$1</p>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n{2,}/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br>')
}

// ─── Send Message ─────────────────────────────────────────────────────────────

async function send(text?: string) {
  const msg = (text || input.value).trim()
  if (!msg || loading.value) return
  input.value = ''

  // Add user message
  messages.value.push({
    id: genId(), role: 'user', content: msg, timestamp: new Date(),
  })

  // Add loading placeholder
  const loadingId = genId()
  messages.value.push({
    id: loadingId, role: 'assistant', content: '', timestamp: new Date(), isLoading: true,
  })
  loading.value = true
  scrollBottom()

  try {
    const history = messages.value
      .filter(m => !m.isLoading && m.role !== 'system')
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content }))

    const res = await fetch(`${MCP_URL}/api/chat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, conversation_id: conversationId.value, history }),
      signal: AbortSignal.timeout(60000),
    })

    if (!res.ok) throw new Error(`${res.status}`)
    const data = await res.json() as {
      reply: string
      jobs?: JobCard[]
      actions?: PendingAction[]
      tools_used?: string[]
    }

    // Replace loading placeholder
    const idx = messages.value.findIndex(m => m.id === loadingId)
    if (idx >= 0) {
      messages.value[idx] = {
        id: loadingId,
        role: 'assistant',
        content: data.reply || '',
        timestamp: new Date(),
        jobs: data.jobs?.length ? data.jobs : undefined,
        actions: data.actions?.length ? data.actions : undefined,
        toolsUsed: data.tools_used,
      }
    }
  } catch (e) {
    const idx = messages.value.findIndex(m => m.id === loadingId)
    if (idx >= 0) {
      messages.value[idx] = {
        id: loadingId, role: 'assistant',
        content: `Error: ${e instanceof Error ? e.message : 'Request failed'}. Is the MCP server running?`,
        timestamp: new Date(),
      }
    }
  } finally {
    loading.value = false
    scrollBottom()
    await nextTick()
    inputEl.value?.focus()
  }
}

// ─── Action Handlers ──────────────────────────────────────────────────────────

async function confirmAction(msgId: string, action: PendingAction) {
  action.confirmed = true
  const msg = messages.value.find(m => m.id === msgId)
  if (msg) msg.actions = msg.actions?.filter(a => a !== action)

  // Trigger as a new chat message so the AI handles it
  if (action.type === 'apply') {
    await send(`Apply to job ${action.payload.job_id} at ${action.payload.company}`)
  } else if (action.type === 'search') {
    await send(`Run job search now for platform: ${action.payload.platform || 'all'}`)
  } else if (action.type === 'dismiss') {
    await send(`Dismiss job ${action.payload.job_id}`)
  }
}

// ─── Clear Chat ───────────────────────────────────────────────────────────────

function clearChat() {
  messages.value = []
  conversationId.value = crypto.randomUUID()
  localStorage.setItem(CONVERSATION_KEY, conversationId.value)
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function fetchPipelineStats() {
  try {
    const res = await fetch(`${MCP_URL}/api/chat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: '__stats__',
        conversation_id: '__internal__',
        history: [],
        internal_stats: true,
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const d = await res.json() as { stats?: PipelineStats }
      if (d.stats) pipelineStats.value = d.stats
    }
  } catch { /* stats fetch failed silently */ }
}

onMounted(async () => {
  localStorage.setItem(CONVERSATION_KEY, conversationId.value)
  messages.value.push({
    id: genId(), role: 'assistant', timestamp: new Date(),
    content: 'NEURALYX Copilot online. Ask me about your job pipeline, search for jobs, trigger applications, or analyze your progress.',
  })
  // Load pipeline context for dynamic chips (non-blocking)
  fetchPipelineStats()
})

watch(messages, scrollBottom, { deep: true })
</script>

<template>
  <div class="flex flex-col h-full bg-neural-900/60 rounded-xl border border-neural-700/50 overflow-hidden">

    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-neural-700/50 bg-neural-800/40 shrink-0">
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full bg-cyber-purple animate-pulse" />
        <span class="text-sm font-semibold text-white">Job Copilot</span>
        <span class="text-[9px] text-gray-500 font-mono">RAG · Claude Sonnet</span>
      </div>
      <button @click="clearChat" class="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">
        Clear
      </button>
    </div>

    <!-- Messages -->
    <div ref="scrollEl" class="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin scrollbar-thumb-neural-700">

      <!-- Empty state -->
      <div v-if="!hasMessages" class="flex flex-col items-center justify-center h-full text-center py-8">
        <div class="w-12 h-12 rounded-full bg-cyber-purple/10 border border-cyber-purple/20 flex items-center justify-center mb-3">
          <svg class="w-6 h-6 text-cyber-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
        <p class="text-sm text-gray-400">Ask about your job pipeline</p>
        <p class="text-[10px] text-gray-600 mt-1">Search, apply, analyze, generate content</p>
      </div>

      <!-- Message list -->
      <template v-for="msg in messages" :key="msg.id">

        <!-- User bubble -->
        <div v-if="msg.role === 'user'" class="flex justify-end">
          <div class="max-w-[85%] px-3 py-2 bg-cyber-purple/20 border border-cyber-purple/30 rounded-xl rounded-tr-sm text-sm text-white">
            {{ msg.content }}
          </div>
        </div>

        <!-- AI bubble -->
        <div v-else class="flex flex-col gap-2">
          <div class="flex items-start gap-2">
            <div class="w-5 h-5 rounded-full bg-cyber-purple/20 border border-cyber-purple/30 flex items-center justify-center shrink-0 mt-0.5">
              <svg class="w-3 h-3 text-cyber-purple" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 7H7v6h6V7z"/>
                <path fill-rule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z" clip-rule="evenodd"/>
              </svg>
            </div>

            <!-- Loading dots -->
            <div v-if="msg.isLoading" class="flex items-center gap-1 px-3 py-2.5 bg-neural-800/60 border border-neural-700/30 rounded-xl rounded-tl-sm">
              <span v-for="i in 3" :key="i" class="w-1.5 h-1.5 rounded-full bg-cyber-purple animate-bounce"
                :style="{ animationDelay: `${(i - 1) * 150}ms` }" />
            </div>

            <!-- AI text reply -->
            <div v-else class="flex-1 min-w-0">
              <div class="px-3 py-2 bg-neural-800/60 border border-neural-700/30 rounded-xl rounded-tl-sm text-sm text-gray-200 leading-relaxed"
                v-html="renderMarkdown(msg.content)" />

              <!-- Tools used badge -->
              <div v-if="msg.toolsUsed?.length" class="flex flex-wrap gap-1 mt-1 px-1">
                <span v-for="t in msg.toolsUsed" :key="t"
                  class="text-[9px] text-gray-600 bg-neural-800/40 border border-neural-700/20 px-1.5 py-0.5 rounded">
                  {{ t }}
                </span>
              </div>
            </div>
          </div>

          <!-- Inline job cards -->
          <div v-if="msg.jobs?.length" class="ml-7 space-y-1.5">
            <div v-for="job in msg.jobs.slice(0, 8)" :key="job.id"
              class="flex items-center gap-3 px-3 py-2 bg-neural-800/40 border border-neural-700/30 rounded-lg hover:border-cyber-purple/20 transition-colors">

              <span class="text-base shrink-0">{{ platformIcon(job.platform) }}</span>
              <div class="flex-1 min-w-0">
                <p class="text-xs text-white font-medium truncate">{{ job.title }}</p>
                <p class="text-[10px] text-gray-500">{{ job.company }}
                  <span v-if="formatSalary(job)" class="text-green-400/70 ml-1">· {{ formatSalary(job) }}</span>
                </p>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <span v-if="job.match_score !== null" class="text-[11px] font-bold" :class="scoreColor(job.match_score)">
                  {{ job.match_score }}%
                </span>
                <span class="text-[9px] px-1.5 py-0.5 rounded"
                  :class="job.status === 'applied' ? 'bg-green-500/10 text-green-400' : 'bg-neural-700/50 text-gray-500'">
                  {{ job.status }}
                </span>
                <a v-if="job.url" :href="job.url" target="_blank"
                  class="text-[9px] text-cyber-cyan hover:underline">View</a>
              </div>
            </div>
            <p v-if="msg.jobs.length > 8" class="text-[10px] text-gray-600 px-1">
              +{{ msg.jobs.length - 8 }} more jobs
            </p>
          </div>

          <!-- Pending actions -->
          <div v-if="msg.actions?.length" class="ml-7 flex flex-wrap gap-2">
            <button v-for="action in msg.actions.filter(a => !a.confirmed)" :key="action.type + action.label"
              @click="confirmAction(msg.id, action)"
              class="px-3 py-1.5 bg-cyber-purple/15 border border-cyber-purple/30 text-cyber-purple text-[11px] font-medium rounded-lg hover:bg-cyber-purple/25 transition-colors">
              ✓ {{ action.label }}
            </button>
          </div>

          <!-- Timestamp -->
          <p class="ml-7 text-[9px] text-gray-700">{{ formatTime(msg.timestamp) }}</p>
        </div>

      </template>
    </div>

    <!-- Suggestion chips -->
    <div class="px-4 py-2 border-t border-neural-700/30 flex flex-wrap gap-1.5 shrink-0">
      <button v-for="chip in CHIPS" :key="chip.label"
        @click="send(chip.msg)"
        :disabled="loading"
        class="px-2.5 py-1 text-[10px] text-gray-400 bg-neural-800/50 border border-neural-700/40 rounded-full hover:border-cyber-purple/30 hover:text-gray-200 transition-colors disabled:opacity-40">
        {{ chip.label }}
      </button>
    </div>

    <!-- Input bar -->
    <div class="px-4 py-3 border-t border-neural-700/50 shrink-0">
      <div class="flex gap-2">
        <input
          ref="inputEl"
          v-model="input"
          type="text"
          placeholder="Ask about jobs, pipeline, analytics..."
          :disabled="loading"
          @keydown.enter.prevent="send()"
          class="flex-1 px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm placeholder-gray-600 focus:border-cyber-purple focus:outline-none disabled:opacity-50 transition-colors"
        />
        <button
          @click="send()"
          :disabled="loading || !input.trim()"
          class="px-3 py-2 bg-cyber-purple/20 border border-cyber-purple/40 text-cyber-purple rounded-lg hover:bg-cyber-purple/30 disabled:opacity-30 transition-colors"
        >
          <svg v-if="!loading" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
          <svg v-else class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        </button>
      </div>
    </div>

  </div>
</template>

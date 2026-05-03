<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'

const admin = useAdminStore()
const loading = ref(true)
const MCP_URL = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'

const stats = ref({ projects: 0, skills: 0, tools: 0, messages: 0, unread: 0, sections: 0 })

onMounted(async () => {
  if (!localStorage.getItem('neuralyx_openai_key') && import.meta.env.VITE_OPENAI_KEY) {
    localStorage.setItem('neuralyx_openai_key', import.meta.env.VITE_OPENAI_KEY)
    openaiKey.value = import.meta.env.VITE_OPENAI_KEY
  }
  try {
    await Promise.all([
      admin.fetchProjects(), admin.fetchSkills(), admin.fetchTools(),
      admin.fetchMessages(), admin.fetchSections(),
    ])
    stats.value = {
      projects: admin.projects.length, skills: admin.skills.length,
      tools: admin.tools.length, messages: admin.messages.length,
      unread: admin.messages.filter((m: any) => !m.is_read).length,
      sections: admin.sections.length,
    }
  } finally { loading.value = false }

  // Check MCP server
  try {
    const r = await fetch(`${MCP_URL}/api/phantom/health`, { signal: AbortSignal.timeout(3000) })
    mcpOnline.value = r.ok
  } catch { mcpOnline.value = false }

  // Check HeyGen voices
  try {
    const r = await fetch(`${MCP_URL}/api/heygen/voices`, { signal: AbortSignal.timeout(5000) })
    const d: any = await r.json()
    if (d.ok) {
      heygenClones.value = d.voices.filter((v: any) => v.type === 'clone')
      heygenConfigured.value = true
    }
  } catch { heygenConfigured.value = false }

  // Check local SadTalker (port 7860)
  try {
    const r = await fetch('http://localhost:7860/', { signal: AbortSignal.timeout(2000) })
    sadtalkerLocalOnline.value = r.ok
  } catch { sadtalkerLocalOnline.value = false }

  // Check VoxCPM (port 7861 via MCP proxy)
  try {
    const r = await fetch(`${MCP_URL}/api/tts/voxcpm/health`, { signal: AbortSignal.timeout(4000) })
    const d: any = await r.json()
    voxcpmOnline.value       = d.status !== 'offline'
    voxcpmModelLoaded.value  = d.model_loaded === true
    voxcpmModelLoading.value = d.status === 'loading'
  } catch { voxcpmOnline.value = false }

  // Check voice sample
  try {
    const r = await fetch(`${MCP_URL}/api/voice-sample`, { signal: AbortSignal.timeout(3000) })
    const d: any = await r.json()
    if (d.ok) { voiceSampleUploaded.value = true; voiceSampleKB.value = Math.round((d.size || 0) / 1024) }
  } catch { /* no sample */ }
})

const statCards = [
  { label: 'Projects',  key: 'projects', border: 'border-cyber-purple/30' },
  { label: 'Skills',    key: 'skills',   border: 'border-cyber-cyan/30'   },
  { label: 'Tools',     key: 'tools',    border: 'border-angelic-gold/30' },
  { label: 'Sections',  key: 'sections', border: 'border-green-500/30'    },
  { label: 'Messages',  key: 'messages', border: 'border-cyber-pink/30'   },
]

const totalContent = computed(() =>
  stats.value.projects + stats.value.skills + stats.value.tools + stats.value.sections
)

// ── Service health ──────────────────────────────────────────────────────────
const mcpOnline            = ref(false)
const heygenConfigured     = ref(false)
const heygenClones         = ref<any[]>([])
const sadtalkerLocalOnline = ref(false)
const voxcpmOnline         = ref(false)
const voxcpmModelLoaded    = ref(false)
const voxcpmModelLoading   = ref(false)
const voiceSampleUploaded  = ref(false)
const voiceSampleKB        = ref(0)

const sadtalkerDetail = computed(() => {
  if (sadtalkerLocalOnline.value) return '⚡ Local · localhost:7860 · no queue'
  return '☁️ HuggingFace space · free queue fallback'
})
const sadtalkerStatus = computed(() => sadtalkerLocalOnline.value ? 'active' : 'limited')

const voxcpmDetail = computed(() => {
  if (!voxcpmOnline.value) return '⬤ Offline · run: docker compose up voxcpm -d'
  if (voxcpmModelLoading.value) return '⏳ Loading CosyVoice2-0.5B model…'
  if (voxcpmModelLoaded.value) return `⚡ Local · localhost:7861 · model ready${voiceSampleUploaded.value ? ` · sample ${voiceSampleKB.value}KB` : ' · no voice sample yet'}`
  return '⚠ Container up · model error'
})
const voxcpmStatus = computed(() => {
  if (!voxcpmOnline.value) return 'offline'
  if (voxcpmModelLoading.value) return 'limited'
  if (voxcpmModelLoaded.value) return 'active'
  return 'limited'
})

const systemServices = computed(() => [
  { name: 'Vite 8 Dev Server',    type: 'Build',           status: 'active',                                  detail: 'Port 3000 · HMR enabled' },
  { name: 'MCP Server',           type: 'AI Integration',  status: mcpOnline.value ? 'active' : 'offline',   detail: 'Port 8080 · proxy + job queue' },
  { name: 'Supabase',             type: 'Backend',         status: 'limited',                                 detail: 'Free tier · 2/2 projects used' },
  { name: 'PostgreSQL 17',        type: 'Database',        status: 'configured',                              detail: 'Docker: neuralyx-postgres:5432' },
  { name: 'VoxCPM Voice Clone',   type: 'AI Voice Clone',  status: voxcpmStatus.value,                        detail: voxcpmDetail.value },
  { name: 'SadTalker',            type: 'AI Lip Sync',     status: sadtalkerStatus.value,                     detail: sadtalkerDetail.value },
  { name: 'HeyGen Clone API',     type: 'AI Voice (Alt)',  status: heygenConfigured.value ? 'active' : 'configured', detail: `v3 API · ${heygenClones.value.length} clone(s) proxied` },
  { name: 'OpenAI gpt-4o-mini',   type: 'AI Script',       status: 'active',                                  detail: 'Script agent + auto-classifier' },
  { name: 'Gemini 1.5 Flash',     type: 'AI Fallback',     status: 'active',                                  detail: 'Fallback when OpenAI quota hit' },
  { name: 'n8n Automation',       type: 'Workflows',       status: 'configured',                              detail: 'Port 5678 · job pipeline orchestrator' },
  { name: 'Tailwind CSS v4',      type: 'Styling',         status: 'active',                                  detail: '@tailwindcss/vite plugin' },
  { name: 'Vue Router 4',         type: 'Routing',         status: 'active',                                  detail: 'History mode + auth guards' },
])

function statusColor(s: string) {
  if (s === 'active')     return 'bg-green-500'
  if (s === 'configured') return 'bg-cyan-500'
  if (s === 'limited')    return 'bg-yellow-500'
  return 'bg-red-500'
}
function statusBadge(s: string) {
  if (s === 'active')     return 'bg-green-500/10 text-green-400'
  if (s === 'configured') return 'bg-cyan-500/10 text-cyan-400'
  if (s === 'limited')    return 'bg-yellow-500/10 text-yellow-400'
  return 'bg-red-500/10 text-red-400'
}

// ── Interview Video Pipeline ────────────────────────────────────────────────
const savedQuestion    = computed(() => { try { return JSON.parse(localStorage.getItem('neuralyx_interview_q') || '[]') } catch { return [] } })
const hasAvatar        = computed(() => !!localStorage.getItem('neuralyx_avatar_preview'))
const ttsSource        = computed(() => localStorage.getItem('nyx_tts_source') || 'mms')
const lipsyncModel     = computed(() => localStorage.getItem('nyx_lipsync_model') || 'sadtalker')
const sadtalkerBackend = computed(() => localStorage.getItem('nyx_sadtalker_backend') || 'auto')
const savedEmail       = computed(() => localStorage.getItem('nyx_email_to') || '')
const savedVoiceId     = computed(() => localStorage.getItem('neuralyx_heygen_voice') || '')

const sadtalkerBackendLabel = computed(() => {
  if (sadtalkerBackend.value === 'local') return sadtalkerLocalOnline.value ? '⚡ Local · online' : '🖥️ Local · offline'
  if (sadtalkerBackend.value === 'hf')   return '☁️ HF Space · queue'
  return sadtalkerLocalOnline.value ? '⚡ Auto → local' : '☁️ Auto → HF space'
})

const pipelineSteps = computed(() => [
  {
    icon: '📋', label: 'Question Bank',
    detail: `${savedQuestion.value.length} saved · auto-classify`,
    ok: savedQuestion.value.length > 0,
  },
  {
    icon: '🤖', label: 'AI Script',
    detail: 'OpenAI 4o-mini · Refine AI',
    ok: true,
  },
  {
    icon: '🧬', label: 'Voice / Audio',
    detail: ttsSource.value === 'heygen'
      ? `HeyGen Clone · ${savedVoiceId.value ? 'voice set' : 'no voice'}`
      : `VoxCPM Clone · ${voiceSampleUploaded.value ? `sample ${voiceSampleKB.value}KB ✓` : 'no sample yet'}`,
    ok: ttsSource.value === 'heygen' ? true : voiceSampleUploaded.value,
  },
  {
    icon: '🧑', label: 'Avatar',
    detail: hasAvatar.value ? 'Portrait saved ✓' : 'Not uploaded',
    ok: hasAvatar.value,
  },
  {
    icon: '🎬', label: 'Lip Sync',
    detail: lipsyncModel.value === 'sadtalker'
      ? `SadTalker · ${sadtalkerBackendLabel.value}`
      : 'OutofLipSync · HF space',
    ok: true,
  },
  {
    icon: '📧', label: 'Send Email',
    detail: savedEmail.value || 'Not configured',
    ok: savedEmail.value.trim().length > 3,
  },
])

const pipelineReady = computed(() => pipelineSteps.value.every(s => s.ok))

// ── Intro Video ────────────────────────────────────────────────────────────
const introVideoUrl  = ref(localStorage.getItem('neuralyx_intro_video') || '/assets/videos/Introduction_video.mp4')
const editingIntro   = ref(false)
const videoDragging  = ref(false)

function saveIntroVideo() { localStorage.setItem('neuralyx_intro_video', introVideoUrl.value); editingIntro.value = false }
function handleVideoDrop(e: DragEvent) {
  videoDragging.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f?.type.startsWith('video/')) { introVideoUrl.value = `/assets/videos/${f.name}`; saveIntroVideo() }
}
function handleVideoSelect(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) { introVideoUrl.value = `/assets/videos/${f.name}`; saveIntroVideo() }
}

// ── API Keys ───────────────────────────────────────────────────────────────
const openaiKey    = ref(localStorage.getItem('neuralyx_openai_key') || import.meta.env.VITE_OPENAI_KEY || '')
const hfToken      = ref(import.meta.env.VITE_HF_TOKEN || localStorage.getItem('neuralyx_hf_token') || '')
const geminiConfigured = ref(!!import.meta.env.VITE_GEMINI_KEY)
const showKeyInput = ref(false)
const keySaved     = ref(false)

function saveOpenAIKey() {
  localStorage.setItem('neuralyx_openai_key', openaiKey.value)
  showKeyInput.value = false; keySaved.value = true
  setTimeout(() => { keySaved.value = false }, 2000)
}
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold text-white mb-1">Dashboard Overview</h2>
    <p class="text-gray-400 text-sm mb-8">NEURALYX Admin · Content, System & AI Pipeline Management</p>

    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="w-8 h-8 border-2 border-cyber-purple border-t-transparent rounded-full animate-spin"></div>
    </div>

    <template v-else>
      <!-- Stat Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        <div v-for="card in statCards" :key="card.key"
          class="glass-dark rounded-xl p-5 border transition-all hover:scale-[1.02]" :class="card.border">
          <p class="text-3xl font-bold text-white">{{ stats[card.key as keyof typeof stats] }}</p>
          <p class="text-sm text-gray-400 mt-1">{{ card.label }}</p>
          <div v-if="card.key === 'messages' && stats.unread > 0" class="mt-2">
            <span class="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full">{{ stats.unread }} unread</span>
          </div>
        </div>
      </div>

      <!-- Top Row: Content Overview + System Status -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <!-- Content Overview -->
        <div class="glass-dark rounded-xl p-6">
          <h3 class="text-base font-semibold text-white mb-4">Content Overview</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-gray-400 text-sm">Total Managed Content</span>
              <span class="text-white font-bold text-lg">{{ totalContent }}</span>
            </div>
            <div class="w-full bg-neural-700 rounded-full h-1.5">
              <div class="h-1.5 rounded-full bg-gradient-to-r from-cyber-purple to-cyber-cyan w-full"></div>
            </div>
            <div class="grid grid-cols-2 gap-2 mt-3">
              <div class="bg-neural-700/50 rounded-lg p-3">
                <p class="text-[10px] text-gray-500 uppercase">Landing Sections</p>
                <p class="text-white font-semibold text-sm">11 Components</p>
              </div>
              <div class="bg-neural-700/50 rounded-lg p-3">
                <p class="text-[10px] text-gray-500 uppercase">Mobile Apps</p>
                <p class="text-white font-semibold text-sm">14 Projects</p>
              </div>
              <div class="bg-neural-700/50 rounded-lg p-3">
                <p class="text-[10px] text-gray-500 uppercase">Web Projects</p>
                <p class="text-white font-semibold text-sm">5 Projects</p>
              </div>
              <div class="bg-neural-700/50 rounded-lg p-3">
                <p class="text-[10px] text-gray-500 uppercase">Interview Q&A</p>
                <p class="text-white font-semibold text-sm">{{ savedQuestion.length + 6 }} questions</p>
              </div>
            </div>
          </div>
        </div>

        <!-- System Status -->
        <div class="glass-dark rounded-xl p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-base font-semibold text-white">System Status</h3>
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-1.5 text-[11px]">
                <span class="w-2 h-2 rounded-full" :class="mcpOnline ? 'bg-green-400 animate-pulse' : 'bg-red-400'"></span>
                <span :class="mcpOnline ? 'text-green-400' : 'text-red-400'">MCP {{ mcpOnline ? 'online' : 'offline' }}</span>
              </div>
              <RouterLink :to="{ name: 'admin-connections' }" class="text-[11px] text-cyber-cyan hover:text-white transition-colors">
                View All →
              </RouterLink>
            </div>
          </div>
          <div class="space-y-1.5">
            <div v-for="service in systemServices" :key="service.name"
              class="flex items-center justify-between py-1.5 border-b border-neural-700/50 last:border-0">
              <div class="flex items-center gap-2">
                <div class="w-1.5 h-1.5 rounded-full flex-shrink-0" :class="statusColor(service.status)"></div>
                <div>
                  <p class="text-xs text-white leading-tight">{{ service.name }}</p>
                  <p class="text-[10px] text-gray-600">{{ service.detail }}</p>
                </div>
              </div>
              <span class="text-[9px] px-2 py-0.5 rounded-full capitalize flex-shrink-0" :class="statusBadge(service.status)">
                {{ service.status }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Interview Video Pipeline Card -->
      <div class="glass-dark rounded-xl p-6 mb-6 border"
        :class="pipelineReady ? 'border-green-500/20 bg-green-500/[0.02]' : 'border-cyber-purple/20 bg-gradient-to-br from-cyber-purple/5 to-cyber-blue/5'">
        <div class="flex items-start justify-between mb-5">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xl">🎬</span>
              <h3 class="text-base font-semibold text-white">Interview Video Generator</h3>
              <span v-if="pipelineReady" class="text-[10px] px-2 py-0.5 bg-green-500/15 text-green-400 rounded-full border border-green-500/30">
                ⚡ Pipeline Ready
              </span>
              <span v-else class="text-[10px] px-2 py-0.5 bg-yellow-500/15 text-yellow-400 rounded-full border border-yellow-500/30">
                Setup Incomplete
              </span>
            </div>
            <p class="text-xs text-gray-400">Question → AI Script → Voice → Lip Sync → Email · one-click pipeline</p>
          </div>
          <RouterLink :to="{ name: 'admin-video-creation' }"
            class="flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-1.5"
            style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue))">
            Open Studio →
          </RouterLink>
        </div>

        <!-- Pipeline step checklist -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-5">
          <div v-for="step in pipelineSteps" :key="step.label"
            class="rounded-xl p-3 border text-center transition-all"
            :class="step.ok ? 'border-green-500/25 bg-green-500/8' : 'border-neural-600 bg-neural-700/30'">
            <div class="text-xl mb-1">{{ step.icon }}</div>
            <p class="text-[10px] font-semibold leading-tight" :class="step.ok ? 'text-green-400' : 'text-gray-400'">{{ step.label }}</p>
            <p class="text-[9px] text-gray-600 mt-0.5 leading-tight">{{ step.detail }}</p>
            <div class="mt-1.5 text-[10px]">
              <span v-if="step.ok" class="text-green-400">✓</span>
              <span v-else class="text-yellow-400">○</span>
            </div>
          </div>
        </div>

        <!-- Feature highlights -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="bg-neural-700/50 rounded-lg p-3">
            <p class="text-[10px] text-gray-500 uppercase mb-1">AI Script Agent</p>
            <p class="text-xs text-white font-medium">2-Stage Pipeline</p>
            <p class="text-[10px] text-gray-500 mt-0.5">Analyze → Draft · Refine with AI</p>
          </div>
          <div class="rounded-lg p-3 border transition-all"
            :class="voxcpmOnline && voxcpmModelLoaded
              ? 'bg-cyan-500/5 border-cyan-500/20'
              : voxcpmOnline
                ? 'bg-yellow-500/5 border-yellow-500/20'
                : 'bg-neural-700/50 border-transparent'">
            <p class="text-[10px] text-gray-500 uppercase mb-1">Voice Clone Engine</p>
            <p class="text-xs font-medium flex items-center gap-1.5"
              :class="voxcpmOnline && voxcpmModelLoaded ? 'text-cyan-400' : voxcpmOnline ? 'text-yellow-400' : 'text-gray-400'">
              <span class="w-1.5 h-1.5 rounded-full flex-shrink-0"
                :class="voxcpmOnline && voxcpmModelLoaded ? 'bg-cyan-400 animate-pulse' : voxcpmOnline ? 'bg-yellow-400 animate-pulse' : 'bg-gray-600'">
              </span>
              VoxCPM · CosyVoice2-0.5B
            </p>
            <p class="text-[10px] text-gray-500 mt-0.5">
              {{ voxcpmOnline && voxcpmModelLoaded
                  ? (voiceSampleUploaded ? `Your voice · sample ${voiceSampleKB}KB ready` : 'Model ready · upload voice sample')
                  : voxcpmOnline
                    ? 'Container up · model loading…'
                    : 'Offline · docker compose up voxcpm -d' }}
            </p>
          </div>
          <div class="bg-neural-700/50 rounded-lg p-3">
            <p class="text-[10px] text-gray-500 uppercase mb-1">Lip Sync · SadTalker</p>
            <p class="text-xs font-medium" :class="sadtalkerLocalOnline ? 'text-green-400' : 'text-yellow-400'">
              {{ sadtalkerLocalOnline ? '⚡ Local · no queue' : '☁️ HF Space · queue' }}
            </p>
            <p class="text-[10px] text-gray-500 mt-0.5">
              {{ sadtalkerLocalOnline ? 'localhost:7860 · AMD CPU mode' : 'Auto-fallback · server-side polling' }}
            </p>
          </div>
          <div class="bg-neural-700/50 rounded-lg p-3">
            <p class="text-[10px] text-gray-500 uppercase mb-1">Question Bank</p>
            <p class="text-xs text-white font-medium">{{ savedQuestion.length }} saved + 6 examples</p>
            <p class="text-[10px] text-gray-500 mt-0.5">Auto-classifier · floating panel</p>
          </div>
        </div>
      </div>

      <!-- AI Services Status Banner -->
      <div class="glass-dark rounded-xl p-4 mb-6 border"
        :class="sadtalkerLocalOnline && voxcpmOnline && voxcpmModelLoaded
          ? 'border-green-500/20 bg-green-500/[0.02]'
          : 'border-yellow-500/20 bg-yellow-500/[0.02]'">

        <!-- Header row -->
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="text-lg">🖥️</span>
            <p class="text-sm font-semibold text-white">Local AI Services · AMD Radeon 760M · CPU Mode</p>
          </div>
          <p class="text-[10px] text-cyber-cyan flex-shrink-0">GPU upgrade → uncomment Docker deploy blocks → instant acceleration</p>
        </div>

        <!-- Service rows -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <!-- VoxCPM -->
          <div class="flex items-center justify-between px-3 py-2 rounded-lg"
            :class="voxcpmOnline && voxcpmModelLoaded ? 'bg-cyan-500/10' : voxcpmOnline ? 'bg-yellow-500/8' : 'bg-neural-700/40'">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full flex-shrink-0"
                :class="voxcpmOnline && voxcpmModelLoaded ? 'bg-cyan-400 animate-pulse' : voxcpmOnline ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'">
              </span>
              <div>
                <p class="text-xs font-semibold"
                  :class="voxcpmOnline && voxcpmModelLoaded ? 'text-cyan-400' : voxcpmOnline ? 'text-yellow-400' : 'text-gray-500'">
                  🧬 VoxCPM Voice Clone · :7861
                </p>
                <p class="text-[10px] text-gray-500">
                  {{ voxcpmOnline && voxcpmModelLoaded
                      ? (voiceSampleUploaded ? `CosyVoice2 ready · voice sample ${voiceSampleKB}KB` : 'Model ready · upload voice sample in Step 3')
                      : voxcpmOnline ? 'Container up · loading CosyVoice2-0.5B (~1GB)…'
                      : 'Offline — run: docker compose up voxcpm -d' }}
                </p>
              </div>
            </div>
            <span class="text-[9px] px-1.5 py-0.5 rounded flex-shrink-0"
              :class="voxcpmOnline && voxcpmModelLoaded ? 'bg-cyan-500/20 text-cyan-300' : voxcpmOnline ? 'bg-yellow-500/20 text-yellow-300' : 'bg-red-500/10 text-red-400'">
              {{ voxcpmOnline && voxcpmModelLoaded ? 'ready' : voxcpmOnline ? 'loading' : 'offline' }}
            </span>
          </div>

          <!-- SadTalker -->
          <div class="flex items-center justify-between px-3 py-2 rounded-lg"
            :class="sadtalkerLocalOnline ? 'bg-green-500/10' : 'bg-neural-700/40'">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full flex-shrink-0"
                :class="sadtalkerLocalOnline ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'">
              </span>
              <div>
                <p class="text-xs font-semibold" :class="sadtalkerLocalOnline ? 'text-green-400' : 'text-yellow-400'">
                  🎬 SadTalker Lip Sync · :7860
                </p>
                <p class="text-[10px] text-gray-500">
                  {{ sadtalkerLocalOnline ? 'Local CPU mode · no queue' : 'Using HF Space fallback · may queue' }}
                </p>
              </div>
            </div>
            <span class="text-[9px] px-1.5 py-0.5 rounded flex-shrink-0"
              :class="sadtalkerLocalOnline ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'">
              {{ sadtalkerLocalOnline ? 'local' : 'hf fallback' }}
            </span>
          </div>
        </div>

        <!-- Quick commands -->
        <div class="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-gray-500">
          <code class="px-2 py-0.5 bg-neural-800 rounded font-mono">docker compose up voxcpm sadtalker -d</code>
          <span class="text-gray-600">start both local AI engines</span>
        </div>
      </div>

      <!-- Intro Video + Quick Actions row -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <!-- Intro Video -->
        <div class="glass-dark rounded-xl p-6">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-base font-semibold text-white">Introduction Video</h3>
            <button v-if="!editingIntro" @click="editingIntro = true"
              class="px-3 py-1.5 text-xs bg-neural-700 text-gray-300 rounded-lg hover:bg-neural-600 transition-colors">
              Edit
            </button>
          </div>
          <div class="rounded-xl overflow-hidden bg-black aspect-video mb-3">
            <video :src="introVideoUrl" class="w-full h-full object-cover" muted loop autoplay playsinline />
          </div>
          <div v-if="editingIntro" class="space-y-2">
            <div class="rounded-xl border-2 border-dashed transition-colors cursor-pointer p-4 text-center"
              :class="videoDragging ? 'border-cyber-purple bg-cyber-purple/5' : 'border-white/10 hover:border-white/20'"
              @dragover.prevent="videoDragging = true" @dragleave="videoDragging = false"
              @drop.prevent="handleVideoDrop" @click="($refs.videoInput as HTMLInputElement)?.click()">
              <p class="text-xs text-white/40">Drop video or click to browse</p>
            </div>
            <input ref="videoInput" type="file" accept="video/*" class="hidden" @change="handleVideoSelect" />
            <input v-model="introVideoUrl" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none" placeholder="/assets/videos/..." />
            <div class="flex gap-2">
              <button @click="saveIntroVideo" class="px-4 py-1.5 text-xs rounded-lg font-medium text-white" style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue))">Save</button>
              <button @click="editingIntro = false" class="px-4 py-1.5 text-xs text-gray-400 hover:text-white">Cancel</button>
            </div>
          </div>
          <div v-else class="flex items-center justify-between">
            <p class="text-xs text-gray-500 font-mono truncate flex-1 mr-2">{{ introVideoUrl }}</p>
            <span class="text-[10px] px-2 py-0.5 bg-green-500/10 text-green-400 rounded-full flex-shrink-0">Active</span>
          </div>
        </div>

        <!-- Quick Actions + API Keys -->
        <div class="glass-dark rounded-xl p-6 flex flex-col gap-4">
          <div>
            <h3 class="text-base font-semibold text-white mb-3">Quick Actions</h3>
            <div class="flex flex-wrap gap-2">
              <RouterLink :to="{ name: 'admin-video-creation' }"
                class="px-3 py-2 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5"
                style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue))">
                ⚡ Video Studio
              </RouterLink>
              <RouterLink :to="{ name: 'admin-projects' }" class="px-3 py-2 bg-neural-700 hover:bg-cyber-purple/20 hover:text-cyber-purple text-gray-300 rounded-lg text-xs transition-colors">
                Manage Projects
              </RouterLink>
              <RouterLink :to="{ name: 'admin-messages' }" class="px-3 py-2 bg-neural-700 hover:bg-cyber-purple/20 hover:text-cyber-purple text-gray-300 rounded-lg text-xs transition-colors">
                View Messages
                <span v-if="stats.unread > 0" class="ml-1 px-1.5 py-0.5 bg-red-500/30 text-red-400 rounded-full text-[9px]">{{ stats.unread }}</span>
              </RouterLink>
              <RouterLink :to="{ name: 'admin-sections' }" class="px-3 py-2 bg-neural-700 hover:bg-cyber-purple/20 hover:text-cyber-purple text-gray-300 rounded-lg text-xs transition-colors">
                Edit Sections
              </RouterLink>
              <RouterLink :to="{ name: 'admin-connections' }" class="px-3 py-2 bg-neural-700 hover:bg-cyan-500/20 hover:text-cyan-400 text-gray-300 rounded-lg text-xs transition-colors">
                Connections
              </RouterLink>
              <RouterLink :to="{ name: 'admin-git-nexus' }" class="px-3 py-2 bg-neural-700 hover:bg-angelic-gold/20 hover:text-angelic-gold text-gray-300 rounded-lg text-xs transition-colors">
                Git Nexus
              </RouterLink>
              <RouterLink :to="{ name: 'admin-jobs' }" class="px-3 py-2 bg-neural-700 hover:bg-green-500/20 hover:text-green-400 text-gray-300 rounded-lg text-xs transition-colors">
                Jobs Pipeline
              </RouterLink>
            </div>
          </div>

          <!-- API Keys status -->
          <div class="border-t border-neural-600 pt-4 space-y-2.5">
            <h4 class="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">API Keys</h4>

            <!-- OpenAI -->
            <div>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-xs text-gray-300">OpenAI</span>
                  <span class="text-[10px] px-1.5 py-0.5 rounded-full" :class="openaiKey ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'">
                    {{ openaiKey ? 'Connected' : 'Not set' }}
                  </span>
                </div>
                <button @click="showKeyInput = !showKeyInput" class="text-[11px] text-cyber-cyan hover:text-white transition-colors">
                  {{ showKeyInput ? 'Cancel' : (openaiKey ? 'Update' : 'Set Key') }}
                </button>
              </div>
              <div v-if="showKeyInput" class="flex gap-2 mt-1.5">
                <input v-model="openaiKey" type="password" placeholder="sk-proj-..."
                  class="flex-1 px-3 py-1.5 bg-neural-700 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none" />
                <button @click="saveOpenAIKey" class="px-3 py-1.5 text-xs rounded-lg font-medium text-white" style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue))">Save</button>
              </div>
              <p v-if="keySaved" class="text-[10px] text-green-400 mt-1">Saved ✓</p>
            </div>

            <!-- HuggingFace -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-300">HuggingFace</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded-full" :class="hfToken ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'">
                  {{ hfToken ? 'Connected · .env' : 'Not set' }}
                </span>
              </div>
              <span class="text-[10px] text-gray-600">MMS-TTS voice · SadTalker HF space</span>
            </div>

            <!-- HeyGen -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-300">HeyGen</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded-full" :class="heygenConfigured ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'">
                  {{ heygenConfigured ? `${heygenClones.length} clone(s) ready` : 'Checking…' }}
                </span>
              </div>
              <RouterLink :to="{ name: 'admin-video-creation' }" class="text-[11px] text-cyber-cyan hover:text-white transition-colors">
                Voice Studio →
              </RouterLink>
            </div>

            <!-- Gemini -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-300">Gemini 1.5 Flash</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded-full" :class="geminiConfigured ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-500'">
                  {{ geminiConfigured ? 'Connected · fallback' : 'Not set' }}
                </span>
              </div>
              <span class="text-[10px] text-gray-600">Script agent fallback</span>
            </div>
          </div>
        </div>
      </div>

    </template>
  </div>
</template>

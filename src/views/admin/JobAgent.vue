<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAdminStore } from '@/stores/admin'
import { generateCoverLetter } from '@/utils/jobClassifyAgent'
import { fillJobDetails, buildUpdatePayload } from '@/utils/jobDetailAgents'
import { scrapeAllPlaywrightPlatforms, PLAYWRIGHT_PLATFORMS } from '@/utils/jobPlaywrightScraper'

const admin = useAdminStore()

const agentRunning = ref(false)
const agentPaused = ref(false)
const showPauseConfirm = ref(false)
const agentStatus = ref('')
const agentProgress = ref(0)
const agentStep = ref('')

const searchQuery = ref('AI engineer, fullstack developer, automation engineer, ML developer')

// Predefined job role tags based on Gabriel's skills
const JOB_ROLE_TAGS = [
  'AI Engineer', 'AI Automation Engineer', 'Full Stack Developer', 'Vue.js Developer',
  'Python Developer', 'PHP Laravel Developer', 'ML Engineer', 'MLOps Engineer',
  'DevOps Engineer', 'AI Agent Developer', 'Automation Specialist', 'Systems Engineer',
  'Backend Developer', 'Frontend Developer', 'n8n Developer', 'LLM Engineer',
]
const activeRoleTags = ref<Set<string>>(new Set(['AI Engineer', 'Full Stack Developer', 'AI Automation Engineer', 'ML Engineer']))

function toggleRoleTag(tag: string) {
  if (activeRoleTags.value.has(tag)) activeRoleTags.value.delete(tag)
  else activeRoleTags.value.add(tag)
  // Update search query from active tags
  searchQuery.value = [...activeRoleTags.value].join(', ')
}
const searchLocation = ref('Philippines, Remote')
const minScore = ref(65)
const schedule = ref('24h')
const autoRunEnabled = ref(false)
const lastRun = ref<string | null>(null)
const nextRun = ref<string | null>(null)
let autoRunTimer: ReturnType<typeof setInterval> | null = null

const SCHEDULES = [
  { value: '1h', label: 'Every hour', ms: 3600000 },
  { value: '3h', label: 'Every 3 hours', ms: 10800000 },
  { value: '6h', label: 'Every 6 hours', ms: 21600000 },
  { value: '12h', label: 'Every 12 hours', ms: 43200000 },
  { value: '24h', label: 'Every 24 hours (recommended)', ms: 86400000 },
  { value: '3d', label: 'Every 3 days', ms: 259200000 },
  { value: '1w', label: 'Every week', ms: 604800000 },
]

function startAutoRun() {
  if (autoRunTimer) clearInterval(autoRunTimer)
  const sched = SCHEDULES.find(s => s.value === schedule.value)
  if (!sched || !autoRunEnabled.value) return
  const updateNext = () => { nextRun.value = new Date(Date.now() + sched.ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }
  updateNext()
  autoRunTimer = setInterval(() => {
    runAgent()
    lastRun.value = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    updateNext()
  }, sched.ms)
}

function toggleAutoRun() {
  autoRunEnabled.value = !autoRunEnabled.value
  if (autoRunEnabled.value) startAutoRun()
  else { if (autoRunTimer) clearInterval(autoRunTimer); autoRunTimer = null; nextRun.value = null }
}

onUnmounted(() => { if (autoRunTimer) clearInterval(autoRunTimer) })

const PLATFORMS = [
  // Active - Free APIs
  { id: 'himalayas', name: 'Himalayas', enabled: true, icon: '⛰️', group: 'api' },
  { id: 'remoteok', name: 'RemoteOK', enabled: true, icon: '🌍', group: 'api' },
  { id: 'remotive', name: 'Remotive', enabled: true, icon: '🏠', group: 'api' },
  { id: 'arbeitnow', name: 'Arbeitnow', enabled: true, icon: '🇪🇺', group: 'api' },
  { id: 'hackernews', name: 'HN/YC Jobs', enabled: true, icon: '🟧', group: 'api' },
  // JSearch API
  { id: 'indeed', name: 'Indeed', enabled: true, icon: '🔵', group: 'jsearch' },
  { id: 'linkedin', name: 'LinkedIn', enabled: true, icon: '🟦', group: 'jsearch' },
  { id: 'glassdoor', name: 'Glassdoor', enabled: true, icon: '🟢', group: 'jsearch' },
  { id: 'ziprecruiter', name: 'ZipRecruiter', enabled: true, icon: '✅', group: 'jsearch' },
  { id: 'google_jobs', name: 'Google Jobs', enabled: true, icon: '🔴', group: 'jsearch' },
  // Registered — Playwright Phase 2
  { id: 'indeed_ph', name: 'Indeed PH (Direct)', enabled: true, icon: '🔵', group: 'playwright' },
  { id: 'jobstreet', name: 'JobStreet PH', enabled: false, icon: '🟣', group: 'playwright' },
  { id: 'kalibrr', name: 'Kalibrr', enabled: false, icon: '🔷', group: 'playwright' },
  { id: 'onlinejobs', name: 'OnlineJobs.ph', enabled: false, icon: '🟠', group: 'playwright' },
  { id: 'bossjob', name: 'Bossjob', enabled: false, icon: '🟡', group: 'playwright' },
  { id: 'careerbuilder', name: 'CareerBuilder', enabled: false, icon: '🏗️', group: 'playwright' },
  { id: 'freelancer', name: 'Freelancer.com', enabled: false, icon: '🏷️', group: 'playwright' },
  { id: 'toptal', name: 'Toptal', enabled: false, icon: '💎', group: 'playwright' },
  { id: 'upwork', name: 'Upwork', enabled: false, icon: '🟩', group: 'playwright' },
]

const platformToggles = ref(Object.fromEntries(PLATFORMS.map(p => [p.id, p.enabled])))
const enabledCount = computed(() => Object.values(platformToggles.value).filter(Boolean).length)

let logRefreshTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  admin.fetchJobAgentLogs()
  // Auto-refresh logs every 10 seconds
  logRefreshTimer = setInterval(() => admin.fetchJobAgentLogs(), 10000)
})
onUnmounted(() => { if (logRefreshTimer) clearInterval(logRefreshTimer) })

const logs = computed(() =>
  [...admin.jobAgentLogs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
)
const groupedLogs = computed(() => {
  const groups = new Map<string, typeof logs.value>()
  for (const log of logs.value) {
    if (!groups.has(log.run_id)) groups.set(log.run_id, [])
    groups.get(log.run_id)!.push(log)
  }
  return [...groups.entries()].slice(0, 10)
})

function rd(job: Record<string, unknown>, key: string) { return ((job.raw_data as Record<string, unknown>)?.[key] as string) || '' }

async function runAgent() {
  agentRunning.value = true; agentProgress.value = 0
  agentStep.value = 'search'; agentStatus.value = ''
  const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'

  await admin.fetchJobProfile()
  const profile = admin.jobProfile[0] || null
  const enabledPlatforms = Object.entries(platformToggles.value).filter(([, v]) => v).map(([k]) => k)

  try {
    // Step 1: Search + Classify
    agentStep.value = 'search'; agentProgress.value = 10
    agentStatus.value = `Searching ${enabledPlatforms.length} platforms...`
    const res = await fetch(`${mcpUrl}/api/jobs/agent/run`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: searchQuery.value, location: searchLocation.value,
        platforms: enabledPlatforms, min_score: minScore.value,
        resume_text: profile?.resume_text || '',
        skills: profile?.skills || ['Vue.js', 'TypeScript', 'Python', 'PHP', 'Laravel', 'Docker', 'OpenAI', 'Supabase', 'n8n', 'LangChain', 'AI Automation', 'MCP', 'FastAPI', 'PostgreSQL'],
        preferred_job_types: profile?.preferred_job_types || ['remote', 'full-time'],
        preferred_locations: profile?.preferred_locations || ['Philippines', 'Remote'],
      }),
      signal: AbortSignal.timeout(300000),
    })
    agentProgress.value = 40

    if (!res.ok) { agentStatus.value = 'Search failed'; agentRunning.value = false; return }
    const data = await res.json()

    // Step 1b: Playwright scrape (account platforms)
    const playwrightEnabled = enabledPlatforms.filter(p => PLAYWRIGHT_PLATFORMS.includes(p))
    if (playwrightEnabled.length > 0) {
      agentStatus.value = `Scraping ${playwrightEnabled.length} account platforms...`
      agentProgress.value = 45
      try {
        const { jobs: pwJobs } = await scrapeAllPlaywrightPlatforms(
          playwrightEnabled, searchQuery.value,
          (msg) => { agentStatus.value = msg }
        )
        if (pwJobs.length > 0) data.jobs.push(...pwJobs)
        data.total = data.jobs.length
      } catch { /* playwright scrape failed, continue */ }
    }

    // Refresh logs after search
    admin.fetchJobAgentLogs()

    // Step 2: Save to DB
    agentStep.value = 'save'; agentProgress.value = 50
    agentStatus.value = `Saving ${data.total} jobs...`
    let saved = 0
    for (const job of data.jobs || []) {
      try { await admin.insertRow('job_listings', job as unknown as Record<string, unknown>); saved++ } catch { /* dup */ }
    }
    for (const log of data.logs || []) {
      try { await admin.insertRow('job_agent_logs', { ...log, run_id: data.run_id } as unknown as Record<string, unknown>) } catch { /* skip */ }
    }
    await admin.fetchJobListings()
    agentProgress.value = 60

    // Step 3: AI Fill only NEW unfilled (skip already scored)
    agentStep.value = 'fill'
    const unfilled = admin.jobListings.filter(j => j.match_score === null && j.status !== 'dismissed')
    if (unfilled.length > 0) {
      let done = 0
      for (let i = 0; i < unfilled.length; i += 25) {
        const batch = unfilled.slice(i, i + 25)
        done += batch.length
        agentStatus.value = `AI scoring ${done}/${unfilled.length}...`
        agentProgress.value = 60 + Math.round((done / unfilled.length) * 15)
        try {
          const { results } = await fillJobDetails(batch)
          for (const r of results) {
            try { await admin.updateRow('job_listings', r.id, buildUpdatePayload(r)) } catch { /* skip */ }
          }
        } catch { /* batch failed */ }
      }
      await admin.fetchJobListings()
    }

    // Step 4: Auto-dismiss irrelevant
    agentStep.value = 'cleanup'
    const irrelevant = admin.jobListings.filter(j => j.status === 'new' && j.match_score !== null && j.match_score < 40)
    if (irrelevant.length > 0) {
      agentStatus.value = `Dismissing ${irrelevant.length} irrelevant...`
      for (const j of irrelevant) {
        try { await admin.updateRow('job_listings', j.id, { status: 'dismissed' }) } catch { /* skip */ }
      }
      await admin.fetchJobListings()
    }
    agentProgress.value = 85

    // Step 5: Auto cover letters for top matches
    agentStep.value = 'cover'
    const topJobs = admin.jobListings.filter(j =>
      j.status === 'new' && j.match_score !== null && j.match_score >= 75 &&
      !((j.raw_data as Record<string, unknown>)?.cover_letter)
    )
    if (topJobs.length > 0) {
      agentStatus.value = `Generating ${Math.min(topJobs.length, 10)} cover letters...`
      for (const job of topJobs.slice(0, 10)) {
        try {
          const letter = await generateCoverLetter(
            { title: job.title, company: job.company, description: job.description },
            { resume_text: profile?.resume_text, skills: profile?.skills },
            rd(job as unknown as Record<string, unknown>, 'role_type'),
            rd(job as unknown as Record<string, unknown>, 'company_bucket'),
          )
          if (letter) await admin.updateRow('job_listings', job.id, { raw_data: { ...(job.raw_data as Record<string, unknown> || {}), cover_letter: letter } })
        } catch { /* skip */ }
      }
      await admin.fetchJobListings()
    }

    agentProgress.value = 100; agentStep.value = 'done'
    agentStatus.value = `${saved} new jobs, ${data.matched || 0} matched, ${irrelevant.length} dismissed, ${Math.min(topJobs.length, 10)} cover letters`
    lastRun.value = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  } catch (e) {
    agentStatus.value = `Error: ${e instanceof Error ? e.message : 'Pipeline failed'}`
    agentStep.value = 'error'
  } finally {
    agentRunning.value = false
    await Promise.all([admin.fetchJobAgentLogs(), admin.fetchJobListings()])
  }
}

function requestPause() { showPauseConfirm.value = true }
function confirmPause() { agentPaused.value = true; showPauseConfirm.value = false; agentStatus.value = 'Agent paused by user' }
function resumeAgent() { agentPaused.value = false; agentStatus.value = 'Agent resumed' }

async function quickPull(group: 'api' | 'jsearch' | 'all') {
  const selected = group === 'all'
    ? PLATFORMS.filter(p => p.group !== 'playwright').map(p => p.id)
    : PLATFORMS.filter(p => p.group === group).map(p => p.id)
  // Temporarily override toggles
  const prev = { ...platformToggles.value }
  for (const key of Object.keys(platformToggles.value)) platformToggles.value[key] = selected.includes(key)
  await runAgent()
  platformToggles.value = prev // Restore
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
function stepIcon(step: string) {
  const m: Record<string, string> = { search: '🔍', classify_match: '🎯', save: '💾', fill: '🤖', cleanup: '🧹', cover: '✉️', done: '✅', error: '❌' }
  return m[step] || '⚙️'
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold text-white">AI Agent Control</h2>
      <div class="text-xs text-gray-500">Pipeline: Search → Score → Fill → Cleanup → Cover Letters</div>
    </div>

    <!-- Progress Bar (visible when running) -->
    <div v-if="agentRunning" class="mb-5 glass-dark rounded-xl p-4 border border-cyber-purple/30">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 animate-spin text-cyber-purple" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          <span class="text-sm text-white font-medium">{{ agentStatus }}</span>
        </div>
        <span class="text-xs font-bold text-cyber-purple">{{ agentProgress }}%</span>
      </div>
      <div class="h-2 bg-neural-700 rounded-full overflow-hidden">
        <div class="h-full bg-gradient-to-r from-cyber-purple to-cyber-cyan rounded-full transition-all duration-500" :style="{ width: agentProgress + '%' }" />
      </div>
      <div class="flex gap-4 mt-2">
        <span v-for="s in ['search', 'save', 'fill', 'cleanup', 'cover']" :key="s"
          class="text-[10px] flex items-center gap-1"
          :class="agentStep === s ? 'text-cyber-purple font-medium' : agentStep === 'done' || ['search','save','fill','cleanup','cover'].indexOf(s) < ['search','save','fill','cleanup','cover'].indexOf(agentStep) ? 'text-green-400' : 'text-gray-600'">
          {{ stepIcon(s) }} {{ s === 'classify_match' ? 'Match' : s.charAt(0).toUpperCase() + s.slice(1) }}
        </span>
      </div>
    </div>

    <!-- Status (after run) -->
    <div v-if="!agentRunning && agentStatus" class="mb-5 px-4 py-3 rounded-lg text-sm"
      :class="agentStep === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'">
      {{ stepIcon(agentStep) }} {{ agentStatus }}
    </div>

    <!-- Schedule Config -->
    <div class="glass-dark rounded-xl p-4 border border-neural-700/50 mb-5">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Auto-Run Schedule</h3>
        <button @click="toggleAutoRun"
          class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
          :class="autoRunEnabled ? 'bg-green-500/20 text-green-400' : 'bg-neural-700 text-gray-400 hover:text-white'">
          <span class="w-2 h-2 rounded-full" :class="autoRunEnabled ? 'bg-green-400 animate-pulse' : 'bg-gray-600'" />
          {{ autoRunEnabled ? 'Running' : 'Disabled' }}
        </button>
      </div>
      <div class="grid grid-cols-3 gap-3">
        <div>
          <label class="block text-[10px] text-gray-500 mb-1">Interval</label>
          <select v-model="schedule" @change="() => { if (autoRunEnabled) startAutoRun() }" class="w-full px-2.5 py-1.5 bg-neural-800 border border-neural-600 rounded-lg text-white text-[11px] focus:border-cyber-purple focus:outline-none">
            <option v-for="s in SCHEDULES" :key="s.value" :value="s.value">{{ s.label }}</option>
          </select>
        </div>
        <div>
          <label class="block text-[10px] text-gray-500 mb-1">Last Run</label>
          <p class="text-xs text-white py-1.5">{{ lastRun || 'Never' }}</p>
        </div>
        <div>
          <label class="block text-[10px] text-gray-500 mb-1">Next Run</label>
          <p class="text-xs py-1.5" :class="autoRunEnabled ? 'text-green-400' : 'text-gray-600'">{{ nextRun || 'Not scheduled' }}</p>
        </div>
      </div>
    </div>

    <!-- Search Config + Run -->
    <div class="glass-dark rounded-xl p-4 border border-neural-700/50 mb-6">
      <!-- Role Tags -->
      <div class="mb-3">
        <label class="block text-[10px] text-gray-500 uppercase tracking-wider mb-2">Target Roles (click to toggle)</label>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="tag in JOB_ROLE_TAGS" :key="tag" @click="toggleRoleTag(tag)"
            class="px-2.5 py-1 rounded-full text-[10px] font-medium transition-all"
            :class="activeRoleTags.has(tag) ? 'bg-cyber-purple/20 text-cyber-purple border border-cyber-purple/30' : 'bg-neural-700/50 text-gray-500 border border-neural-700 hover:text-gray-300'">
            {{ tag }}
          </button>
        </div>
      </div>
      <div class="flex gap-3 items-end mb-3">
        <div class="flex-1">
          <label class="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Search Query (auto-built from tags above)</label>
          <input v-model="searchQuery" placeholder="AI Engineer, Vue Developer..."
            class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
        </div>
        <div class="w-40">
          <label class="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Location</label>
          <input v-model="searchLocation" placeholder="Philippines, Remote..."
            class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
        </div>
        <div class="w-28">
          <label class="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Min {{ minScore }}%</label>
          <input v-model.number="minScore" type="range" min="40" max="100" step="5" class="w-full" />
        </div>
      </div>
      <div class="flex gap-2">
        <button @click="runAgent" :disabled="agentRunning"
          class="px-5 py-2 bg-gradient-to-r from-green-600 to-emerald-500 text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
          <svg v-if="!agentRunning" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <svg v-else class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          {{ agentRunning ? 'Running...' : 'Run Full Pipeline' }}
        </button>
        <button v-if="agentRunning && !agentPaused" @click="requestPause" class="px-4 py-2 bg-yellow-500/15 text-yellow-400 rounded-lg text-xs font-medium hover:bg-yellow-500/25 flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
          Pause
        </button>
        <button v-if="agentPaused" @click="resumeAgent" class="px-4 py-2 bg-green-500/15 text-green-400 rounded-lg text-xs font-medium hover:bg-green-500/25 flex items-center gap-1.5 animate-pulse">
          <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          Resume
        </button>
        <button @click="quickPull('api')" :disabled="agentRunning" class="px-3 py-2 bg-cyan-500/15 text-cyan-400 rounded-lg text-xs font-medium hover:bg-cyan-500/25 disabled:opacity-50">
          Pull Free APIs Only
        </button>
        <button @click="quickPull('jsearch')" :disabled="agentRunning" class="px-3 py-2 bg-blue-500/15 text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-500/25 disabled:opacity-50">
          Pull JSearch Only
        </button>
        <button @click="quickPull('all')" :disabled="agentRunning" class="px-3 py-2 bg-purple-500/15 text-purple-400 rounded-lg text-xs font-medium hover:bg-purple-500/25 disabled:opacity-50">
          Pull All + AI Fill
        </button>
      </div>
    </div>

    <div class="grid lg:grid-cols-3 gap-6">
      <!-- Platform Toggles -->
      <div class="glass-dark rounded-xl p-5 border border-neural-700/50">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-semibold text-white">Platform Sources</h3>
          <span class="text-[10px] text-gray-500">{{ enabledCount }}/{{ PLATFORMS.length }} active</span>
        </div>
        <div class="space-y-1">
          <template v-for="group in ['api', 'jsearch', 'playwright']" :key="group">
            <p class="text-[9px] text-gray-600 uppercase tracking-wider mt-3 mb-1 first:mt-0">{{ group === 'api' ? 'Free APIs' : group === 'jsearch' ? 'JSearch Proxy' : 'Playwright Scraper' }}</p>
            <label v-for="p in PLATFORMS.filter(x => x.group === group)" :key="p.id"
              class="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-neural-700/30 transition-colors cursor-pointer">
              <div class="flex items-center gap-2">
                <span class="text-sm">{{ p.icon }}</span>
                <span class="text-xs text-white">{{ p.name }}</span>
              </div>
              <div class="relative">
                <input type="checkbox" v-model="platformToggles[p.id]" class="sr-only peer" />
                <div class="w-8 h-4.5 bg-neural-700 rounded-full peer-checked:bg-cyber-purple transition-colors" style="height:18px"></div>
                <div class="absolute left-0.5 top-0.5 w-3.5 h-3.5 bg-gray-400 rounded-full peer-checked:translate-x-3.5 peer-checked:bg-white transition-transform" style="width:14px;height:14px"></div>
              </div>
            </label>
          </template>
        </div>
      </div>

      <!-- Pipeline + History -->
      <div class="lg:col-span-2 glass-dark rounded-xl p-5 border border-neural-700/50">
        <h3 class="text-sm font-semibold text-white mb-4">Pipeline Steps</h3>
        <div class="grid grid-cols-5 gap-2 mb-6">
          <div v-for="s in [{i:'🔍',n:'Search',d:'10 platforms'},{i:'🤖',n:'AI Score',d:'Match vs skills'},{i:'🧹',n:'Cleanup',d:'Dismiss <40%'},{i:'✉️',n:'Cover Letter',d:'Top matches'},{i:'💾',n:'Save',d:'To database'}]" :key="s.n"
            class="text-center p-2.5 rounded-lg bg-neural-800/50 border border-neural-700/30">
            <div class="text-xl mb-1">{{ s.i }}</div>
            <p class="text-[10px] text-white font-medium">{{ s.n }}</p>
            <p class="text-[8px] text-gray-500">{{ s.d }}</p>
          </div>
        </div>

        <h4 class="text-xs text-gray-400 uppercase tracking-wider mb-3">Run History</h4>
        <div v-if="groupedLogs.length === 0" class="text-center py-8 text-gray-500 text-sm">
          No agent runs yet. Click "Run Full Pipeline" to start.
        </div>
        <div v-else class="space-y-3 max-h-[400px] overflow-y-auto">
          <div v-for="[runId, runLogs] in groupedLogs" :key="runId" class="bg-neural-800/40 rounded-lg border border-neural-700/30 overflow-hidden">
            <div class="px-4 py-2 bg-neural-700/30 flex items-center justify-between">
              <span class="text-xs text-gray-400 font-mono">Run: {{ runId.slice(0, 8) }}</span>
              <span class="text-[10px] text-gray-500">{{ timeAgo(runLogs[0].created_at) }}</span>
            </div>
            <div class="divide-y divide-neural-700/20">
              <div v-for="log in runLogs" :key="log.id" class="px-4 py-1.5 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span>{{ stepIcon(log.step) }}</span>
                  <span class="text-xs text-white capitalize">{{ log.step.replace('_', ' ') }}</span>
                  <span class="w-1.5 h-1.5 rounded-full" :class="log.status === 'completed' ? 'bg-green-400' : log.status === 'running' ? 'bg-blue-400 animate-pulse' : 'bg-red-400'" />
                </div>
                <div class="flex gap-3 text-[10px] text-gray-500">
                  <span v-if="log.jobs_found">{{ log.jobs_found }} found</span>
                  <span v-if="log.jobs_matched">{{ log.jobs_matched }} matched</span>
                  <span class="text-gray-600 max-w-[200px] truncate">{{ log.message }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Pause Confirmation Modal -->
    <Teleport to="body">
      <div v-if="showPauseConfirm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="showPauseConfirm = false">
        <div class="glass-dark rounded-xl w-full max-w-sm border border-yellow-500/30 p-6">
          <div class="text-center mb-4">
            <div class="text-3xl mb-2">&#9208;</div>
            <h3 class="text-lg font-bold text-white">Pause AI Agent?</h3>
            <p class="text-sm text-gray-400 mt-2">The agent will stop after completing the current step. No new applications will be sent until resumed.</p>
          </div>
          <div class="space-y-2 mb-4 text-xs text-gray-500">
            <p>&#9679; Jobs already in queue will not be applied</p>
            <p>&#9679; Current running task will finish</p>
            <p>&#9679; Auto-schedule will be suspended</p>
          </div>
          <div class="flex gap-3">
            <button @click="confirmPause" class="flex-1 px-4 py-2.5 bg-yellow-500/20 text-yellow-400 rounded-lg text-sm font-medium hover:bg-yellow-500/30">Pause Agent</button>
            <button @click="showPauseConfirm = false" class="flex-1 px-4 py-2.5 bg-neural-700 text-gray-300 rounded-lg text-sm hover:bg-neural-600">Cancel</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

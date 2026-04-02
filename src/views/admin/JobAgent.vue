<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'

const admin = useAdminStore()

const agentRunning = ref(false)
const agentStatus = ref('')

const PLATFORMS = [
  { id: 'indeed', name: 'Indeed', enabled: true, icon: '🔵' },
  { id: 'linkedin', name: 'LinkedIn', enabled: true, icon: '🟦' },
  { id: 'glassdoor', name: 'Glassdoor', enabled: true, icon: '🟢' },
  { id: 'ziprecruiter', name: 'ZipRecruiter', enabled: true, icon: '🟩' },
  { id: 'google', name: 'Google Jobs', enabled: true, icon: '🔴' },
  { id: 'jobstreet', name: 'JobStreet', enabled: false, icon: '🟣' },
  { id: 'onlinejobs', name: 'OnlineJobs.ph', enabled: false, icon: '🟠' },
  { id: 'bossjob', name: 'Bossjob', enabled: false, icon: '🟡' },
  { id: 'kalibrr', name: 'Kalibrr', enabled: false, icon: '🔷' },
  { id: 'bestjobs', name: 'BestJobs.eu', enabled: false, icon: '🩷' },
  { id: 'facebook', name: 'Facebook Jobs', enabled: false, icon: '🔵' },
]

const platformToggles = ref(
  Object.fromEntries(PLATFORMS.map(p => [p.id, p.enabled]))
)

onMounted(() => admin.fetchJobAgentLogs())

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

async function runAgent() {
  agentRunning.value = true
  agentStatus.value = 'Starting agent pipeline...'
  const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
  try {
    const res = await fetch(`${mcpUrl}/api/jobs/agent/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platforms: Object.entries(platformToggles.value).filter(([, v]) => v).map(([k]) => k),
      }),
    })
    if (res.ok) {
      agentStatus.value = 'Agent completed successfully.'
    } else {
      agentStatus.value = 'Agent run failed. Check MCP server logs.'
    }
  } catch {
    agentStatus.value = 'Could not reach agent API. Ensure MCP server is running.'
  } finally {
    agentRunning.value = false
    await admin.fetchJobAgentLogs()
    await admin.fetchJobListings()
  }
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
  if (step === 'search') return '🔍'
  if (step === 'match') return '🎯'
  if (step === 'apply') return '📨'
  if (step === 'monitor') return '📡'
  return '⚙️'
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold text-white">AI Agent Control</h2>
      <button @click="runAgent" :disabled="agentRunning"
        class="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-500 text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
        <svg v-if="!agentRunning" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <svg v-else class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
        {{ agentRunning ? 'Running...' : 'Run Agent Now' }}
      </button>
    </div>

    <!-- Agent Status -->
    <div v-if="agentStatus" class="mb-6 px-4 py-3 rounded-lg text-sm" :class="agentRunning ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : agentStatus.includes('fail') || agentStatus.includes('Could not') ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'">
      {{ agentStatus }}
    </div>

    <div class="grid lg:grid-cols-3 gap-6">
      <!-- Platform Toggles -->
      <div class="glass-dark rounded-xl p-5 border border-neural-700/50">
        <h3 class="text-sm font-semibold text-white mb-4">Platform Sources</h3>
        <div class="space-y-2">
          <label v-for="p in PLATFORMS" :key="p.id" class="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-neural-700/30 transition-colors cursor-pointer">
            <div class="flex items-center gap-2.5">
              <span>{{ p.icon }}</span>
              <span class="text-sm text-white">{{ p.name }}</span>
            </div>
            <div class="relative">
              <input type="checkbox" v-model="platformToggles[p.id]" class="sr-only peer" />
              <div class="w-9 h-5 bg-neural-700 rounded-full peer-checked:bg-cyber-purple transition-colors"></div>
              <div class="absolute left-0.5 top-0.5 w-4 h-4 bg-gray-400 rounded-full peer-checked:translate-x-4 peer-checked:bg-white transition-transform"></div>
            </div>
          </label>
        </div>
        <p class="text-[10px] text-gray-600 mt-3">Platforms with API access are enabled by default. Others require Playwright (Phase 2).</p>
      </div>

      <!-- Agent Pipeline Steps -->
      <div class="lg:col-span-2 glass-dark rounded-xl p-5 border border-neural-700/50">
        <h3 class="text-sm font-semibold text-white mb-4">Pipeline Steps</h3>
        <div class="grid grid-cols-4 gap-3 mb-6">
          <div class="text-center p-3 rounded-lg bg-neural-800/50 border border-neural-700/30">
            <div class="text-2xl mb-1">🔍</div>
            <p class="text-xs text-white font-medium">Search</p>
            <p class="text-[10px] text-gray-500">Multi-platform query</p>
          </div>
          <div class="text-center p-3 rounded-lg bg-neural-800/50 border border-neural-700/30">
            <div class="text-2xl mb-1">🎯</div>
            <p class="text-xs text-white font-medium">Match</p>
            <p class="text-[10px] text-gray-500">AI score vs profile</p>
          </div>
          <div class="text-center p-3 rounded-lg bg-neural-800/50 border border-neural-700/30">
            <div class="text-2xl mb-1">📨</div>
            <p class="text-xs text-white font-medium">Apply</p>
            <p class="text-[10px] text-gray-500">Auto-submit apps</p>
          </div>
          <div class="text-center p-3 rounded-lg bg-neural-800/50 border border-neural-700/30">
            <div class="text-2xl mb-1">📡</div>
            <p class="text-xs text-white font-medium">Monitor</p>
            <p class="text-[10px] text-gray-500">Track responses</p>
          </div>
        </div>

        <!-- Agent Run Logs -->
        <h4 class="text-xs text-gray-400 uppercase tracking-wider mb-3">Run History</h4>
        <div v-if="groupedLogs.length === 0" class="text-center py-8 text-gray-500 text-sm">
          No agent runs yet. Click "Run Agent Now" to start.
        </div>
        <div v-else class="space-y-3">
          <div v-for="[runId, runLogs] in groupedLogs" :key="runId" class="bg-neural-800/40 rounded-lg border border-neural-700/30 overflow-hidden">
            <div class="px-4 py-2.5 bg-neural-700/30 flex items-center justify-between">
              <span class="text-xs text-gray-400 font-mono">Run: {{ runId.slice(0, 8) }}</span>
              <span class="text-[10px] text-gray-500">{{ timeAgo(runLogs[0].created_at) }}</span>
            </div>
            <div class="divide-y divide-neural-700/20">
              <div v-for="log in runLogs" :key="log.id" class="px-4 py-2 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span>{{ stepIcon(log.step) }}</span>
                  <span class="text-xs text-white capitalize">{{ log.step }}</span>
                  <span class="w-1.5 h-1.5 rounded-full" :class="log.status === 'completed' ? 'bg-green-400' : log.status === 'running' ? 'bg-blue-400 animate-pulse' : 'bg-red-400'" />
                </div>
                <div class="flex gap-3 text-[10px] text-gray-500">
                  <span v-if="log.jobs_found">{{ log.jobs_found }} found</span>
                  <span v-if="log.jobs_matched">{{ log.jobs_matched }} matched</span>
                  <span v-if="log.jobs_applied">{{ log.jobs_applied }} applied</span>
                  <span v-if="log.message" class="text-gray-600 max-w-[150px] truncate">{{ log.message }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

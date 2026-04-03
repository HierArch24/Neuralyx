<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'

const admin = useAdminStore()

interface SessionReport {
  id: string; version: string; date: string; title: string; summary: string
  agents_used: string[]; jobs_found: number; jobs_scored: number; jobs_matched: number
  apis_called: string[]; duration_mins: number; actions: string[]
  status: 'completed' | 'running' | 'failed'; period: string
}

const reports = ref<SessionReport[]>([])
const showDetail = ref(false)
const detailReport = ref<SessionReport | null>(null)
const phantomStatus = ref<'online' | 'offline' | 'checking'>('checking')
const phantomHealth = ref<Record<string, unknown> | null>(null)

// Chat
const chatMessages = ref<{ role: 'user' | 'phantom'; text: string; time: string }[]>([])
const chatInput = ref('')
const chatSending = ref(false)

// Report generation
const generating = ref(false)
const genPeriod = ref('24h')

const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'

onMounted(async () => {
  try {
    const res = await fetch(`${mcpUrl}/api/phantom/health`, { signal: AbortSignal.timeout(5000) })
    if (res.ok) { const d = await res.json(); if (d.status === 'ok') { phantomHealth.value = d; phantomStatus.value = 'online' } else phantomStatus.value = 'offline' }
    else phantomStatus.value = 'offline'
  } catch { phantomStatus.value = 'offline' }

  admin.fetchJobAgentLogs()
  admin.fetchJobListings()
  admin.fetchJobApplications()
  buildReports()
})

function buildReports() {
  const runs = new Map<string, any[]>()
  for (const log of admin.jobAgentLogs) {
    if (!runs.has(log.run_id)) runs.set(log.run_id, [])
    runs.get(log.run_id)!.push(log)
  }
  const built: SessionReport[] = []
  let v = 1
  for (const [runId, logs] of runs) {
    const first = logs[0] as any
    built.push({
      id: runId, version: `v${v++}.0`, date: first.created_at,
      title: `Agent Run ${runId.slice(0, 8)}`,
      summary: logs.map((l: any) => l.message).filter(Boolean).join('. '),
      agents_used: [...new Set(logs.map((l: any) => l.step))] as string[],
      jobs_found: logs.reduce((s: number, l: any) => s + l.jobs_found, 0),
      jobs_scored: logs.reduce((s: number, l: any) => s + l.jobs_matched, 0),
      jobs_matched: logs.reduce((s: number, l: any) => s + l.jobs_matched, 0),
      apis_called: ['JSearch', 'Himalayas', 'RemoteOK', 'Arbeitnow', 'HN', 'LinkedIn'],
      duration_mins: 0,
      actions: logs.map((l: any) => `${l.step}: ${l.message || l.status}`),
      status: logs.every((l: any) => l.status === 'completed') ? 'completed' as const : 'failed' as const,
      period: 'run',
    })
  }
  // Daily summary
  const today = new Date().toISOString().split('T')[0]
  built.unshift({
    id: `daily-${today}`, version: `v${v}.0`, date: new Date().toISOString(),
    title: `Daily Report — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
    summary: `${admin.jobListings.length} total jobs. ${admin.jobListings.filter(j => j.match_score !== null).length} scored. ${admin.jobApplications.length} applications.`,
    agents_used: ['Scout', 'Classifier', 'Matcher', 'Research', 'Writer', 'Nurture'],
    jobs_found: admin.jobListings.length, jobs_scored: admin.jobListings.filter(j => j.match_score !== null).length,
    jobs_matched: admin.jobListings.filter(j => (j.match_score || 0) >= 60).length,
    apis_called: ['JSearch', 'Himalayas', 'RemoteOK', 'Remotive', 'Arbeitnow', 'HN', 'LinkedIn', 'FAISS', 'GPT/Gemini'],
    duration_mins: 0, actions: [`Jobs: ${admin.jobListings.length}`, `Scored: ${admin.jobListings.filter(j => j.match_score !== null).length}`, `Apps: ${admin.jobApplications.length}`],
    status: 'completed', period: '24h',
  })
  reports.value = built.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

async function sendChat() {
  if (!chatInput.value.trim() || chatSending.value) return
  const msg = chatInput.value.trim()
  chatMessages.value.push({ role: 'user', text: msg, time: new Date().toLocaleTimeString() })
  chatInput.value = ''
  chatSending.value = true
  try {
    const res = await fetch(`${mcpUrl}/api/phantom/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg }), signal: AbortSignal.timeout(60000),
    })
    if (res.ok) {
      const d = await res.json()
      chatMessages.value.push({ role: 'phantom', text: d.response || d.message || JSON.stringify(d), time: new Date().toLocaleTimeString() })
    } else {
      chatMessages.value.push({ role: 'phantom', text: 'Phantom is not responding. Make sure it is running (port 3100).', time: new Date().toLocaleTimeString() })
    }
  } catch {
    chatMessages.value.push({ role: 'phantom', text: 'Could not reach Phantom. Check if containers are running.', time: new Date().toLocaleTimeString() })
  }
  chatSending.value = false
}

async function generateReport() {
  generating.value = true
  await sendChatInternal(`Generate a ${genPeriod.value === '24h' ? 'daily' : genPeriod.value === '1w' ? 'weekly' : 'monthly'} session report. Include: jobs found, jobs scored, applications tracked, AI agents used, API calls made, key metrics. Format as a structured report.`)
  generating.value = false
  buildReports()
}

async function sendChatInternal(msg: string) {
  try {
    const res = await fetch(`${mcpUrl}/api/phantom/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg }), signal: AbortSignal.timeout(60000),
    })
    if (res.ok) return await res.json()
  } catch { /* phantom offline */ }
  return null
}

function deleteReport(r: SessionReport) {
  if (confirm(`Delete report ${r.version}?`)) {
    reports.value = reports.value.filter(rep => rep.id !== r.id)
  }
}

function viewReport(r: SessionReport) { detailReport.value = r; showDetail.value = true }

function downloadWord(r: SessionReport) {
  const content = `NEURALYX PHANTOM SESSION REPORT\n${'='.repeat(40)}\n\nVersion: ${r.version}\nDate: ${new Date(r.date).toLocaleDateString()}\nPeriod: ${r.period}\nTitle: ${r.title}\n\nSUMMARY\n${r.summary}\n\nMETRICS\nJobs Found: ${r.jobs_found}\nJobs Scored: ${r.jobs_scored}\nJobs Matched: ${r.jobs_matched}\n\nAGENTS: ${r.agents_used.join(', ')}\nAPIs: ${r.apis_called.join(', ')}\n\nACTIONS\n${r.actions.join('\n')}\n\nGenerated by NEURALYX Phantom`
  const blob = new Blob([content], { type: 'application/msword' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
  a.download = `phantom-${r.version}-${r.id.slice(0, 8)}.doc`; a.click()
}

function timeAgo(d: string) {
  const hrs = Math.floor((Date.now() - new Date(d).getTime()) / 3600000)
  if (hrs < 1) return 'Just now'
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-white">Phantom Report</h2>
        <p class="text-sm text-gray-400 mt-1">AI co-worker — session tracking, analytics, and communication</p>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" :class="phantomStatus === 'online' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'">
          <span class="w-2 h-2 rounded-full" :class="phantomStatus === 'online' ? 'bg-green-400 animate-pulse' : 'bg-red-400'" />
          <span class="text-xs font-medium">{{ phantomStatus === 'online' ? 'Online' : 'Offline' }}</span>
          <span v-if="phantomHealth" class="text-[9px] text-gray-500 ml-1">v{{ (phantomHealth as any).version }}</span>
        </div>
      </div>
    </div>

    <!-- Phantom Offline -->
    <div v-if="phantomStatus === 'offline'" class="glass-dark rounded-xl p-4 border border-red-500/20 mb-6">
      <h3 class="text-xs text-red-400 font-semibold uppercase mb-2">Phantom Not Running</h3>
      <p class="text-xs text-gray-400 mb-2">Start: <code class="bg-neural-800 px-2 py-0.5 rounded text-[10px]">cd phantom && docker compose up -d</code></p>
    </div>

    <div class="grid lg:grid-cols-3 gap-5">
      <!-- Left: Chat with Phantom -->
      <div class="lg:col-span-1 glass-dark rounded-xl border border-neural-700/50 flex flex-col" style="height: 500px">
        <div class="px-4 py-3 border-b border-neural-700/50 flex items-center gap-2">
          <span>👻</span>
          <h3 class="text-sm font-semibold text-white">Chat with Phantom</h3>
        </div>
        <div class="flex-1 overflow-y-auto p-3 space-y-2">
          <div v-if="chatMessages.length === 0" class="text-center py-8 text-gray-600 text-xs">
            Send a message to your AI co-worker
          </div>
          <div v-for="(msg, idx) in chatMessages" :key="idx"
            class="flex" :class="msg.role === 'user' ? 'justify-end' : 'justify-start'">
            <div class="max-w-[85%] px-3 py-2 rounded-lg text-xs leading-relaxed"
              :class="msg.role === 'user' ? 'bg-cyber-purple/20 text-white' : 'bg-neural-700/50 text-gray-300'">
              <p class="whitespace-pre-wrap">{{ msg.text }}</p>
              <p class="text-[8px] mt-1" :class="msg.role === 'user' ? 'text-cyber-purple/50' : 'text-gray-600'">{{ msg.time }}</p>
            </div>
          </div>
          <div v-if="chatSending" class="flex justify-start">
            <div class="px-3 py-2 rounded-lg bg-neural-700/50 text-gray-400 text-xs flex items-center gap-2">
              <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              Thinking...
            </div>
          </div>
        </div>
        <div class="p-3 border-t border-neural-700/50">
          <form @submit.prevent="sendChat" class="flex gap-2">
            <input v-model="chatInput" placeholder="Message Phantom..." :disabled="phantomStatus !== 'online'"
              class="flex-1 px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-xs placeholder-gray-500 focus:border-cyber-purple focus:outline-none" />
            <button type="submit" :disabled="!chatInput.trim() || chatSending || phantomStatus !== 'online'"
              class="px-3 py-2 bg-cyber-purple text-white rounded-lg text-xs hover:bg-cyber-purple/80 disabled:opacity-30">Send</button>
          </form>
        </div>
      </div>

      <!-- Right: Reports -->
      <div class="lg:col-span-2 space-y-5">
        <!-- Generate Report -->
        <div class="glass-dark rounded-xl p-4 border border-neural-700/50 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <select v-model="genPeriod" class="px-3 py-1.5 bg-neural-800 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none">
              <option value="24h">Daily Report</option>
              <option value="1w">Weekly Report</option>
              <option value="1m">Monthly Report</option>
            </select>
            <button @click="generateReport" :disabled="generating || phantomStatus !== 'online'"
              class="px-4 py-1.5 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5">
              <svg v-if="!generating" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              <svg v-else class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              {{ generating ? 'Generating...' : 'Generate Report' }}
            </button>
          </div>
          <button @click="buildReports" class="p-1.5 rounded-lg hover:bg-neural-600 text-gray-500 hover:text-white transition-colors" title="Refresh">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
        </div>

        <!-- Reports Table -->
        <div v-if="reports.length === 0" class="text-center py-12 glass-dark rounded-xl border border-neural-700/50">
          <div class="text-3xl mb-2">👻</div>
          <p class="text-gray-500 text-sm">No reports yet. Generate one or run the AI agent.</p>
        </div>

        <div v-else class="glass-dark rounded-xl overflow-hidden border border-neural-700/50">
          <table class="w-full text-sm">
            <thead class="bg-neural-700/40">
              <tr>
                <th class="text-left px-4 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Version</th>
                <th class="text-left px-4 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Report</th>
                <th class="text-center px-4 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Period</th>
                <th class="text-center px-4 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Found</th>
                <th class="text-center px-4 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Matched</th>
                <th class="text-left px-4 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Date</th>
                <th class="text-right px-4 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in reports" :key="r.id" class="border-t border-neural-700/30 hover:bg-neural-700/20 transition-colors cursor-pointer" @click="viewReport(r)">
                <td class="px-4 py-2.5"><span class="px-2 py-0.5 rounded bg-cyber-purple/20 text-cyber-purple text-[10px] font-mono font-bold">{{ r.version }}</span></td>
                <td class="px-4 py-2.5">
                  <p class="text-xs text-white font-medium">{{ r.title }}</p>
                  <p class="text-[10px] text-gray-500 truncate max-w-[200px]">{{ r.summary }}</p>
                </td>
                <td class="px-4 py-2.5 text-center"><span class="px-2 py-0.5 rounded text-[10px] bg-neural-700/50 text-gray-300">{{ r.period }}</span></td>
                <td class="px-4 py-2.5 text-center text-xs text-white">{{ r.jobs_found }}</td>
                <td class="px-4 py-2.5 text-center text-xs text-green-400">{{ r.jobs_matched }}</td>
                <td class="px-4 py-2.5 text-[10px] text-gray-500">{{ timeAgo(r.date) }}</td>
                <td class="px-4 py-2.5 text-right" @click.stop>
                  <div class="flex items-center justify-end gap-0.5">
                    <button @click="viewReport(r)" class="p-1 rounded hover:bg-neural-600 text-gray-500 hover:text-white" title="View">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    </button>
                    <button @click="downloadWord(r)" class="p-1 rounded hover:bg-neural-600 text-gray-500 hover:text-blue-400" title="Download">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /></svg>
                    </button>
                    <button @click="deleteReport(r)" class="p-1 rounded hover:bg-red-900/30 text-gray-500 hover:text-red-400" title="Delete">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Detail Modal -->
    <Teleport to="body">
      <div v-if="showDetail && detailReport" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="showDetail = false">
        <div class="glass-dark rounded-xl w-full max-w-2xl border border-neural-600 max-h-[85vh] flex flex-col">
          <div class="px-6 py-4 border-b border-neural-700 shrink-0 flex items-center justify-between">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="px-2 py-0.5 rounded bg-cyber-purple/20 text-cyber-purple text-xs font-mono font-bold">{{ detailReport.version }}</span>
                <span class="px-2 py-0.5 rounded text-[10px] bg-neural-700/50 text-gray-300">{{ detailReport.period }}</span>
              </div>
              <h3 class="text-lg font-bold text-white">{{ detailReport.title }}</h3>
            </div>
            <div class="flex gap-1">
              <button @click="downloadWord(detailReport)" class="p-2 rounded-lg hover:bg-neural-600 text-gray-400 hover:text-blue-400"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /></svg></button>
              <button @click="showDetail = false" class="p-2 rounded-lg hover:bg-neural-600 text-gray-400 hover:text-white"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
          </div>
          <div class="flex-1 overflow-y-auto p-6 space-y-4">
            <p class="text-sm text-gray-300">{{ detailReport.summary }}</p>
            <div class="grid grid-cols-3 gap-3">
              <div class="bg-neural-800/50 rounded-lg p-3 text-center border border-neural-700/30"><p class="text-2xl font-bold text-white">{{ detailReport.jobs_found }}</p><p class="text-[9px] text-gray-500">Found</p></div>
              <div class="bg-neural-800/50 rounded-lg p-3 text-center border border-neural-700/30"><p class="text-2xl font-bold text-yellow-400">{{ detailReport.jobs_scored }}</p><p class="text-[9px] text-gray-500">Scored</p></div>
              <div class="bg-neural-800/50 rounded-lg p-3 text-center border border-neural-700/30"><p class="text-2xl font-bold text-green-400">{{ detailReport.jobs_matched }}</p><p class="text-[9px] text-gray-500">Matched</p></div>
            </div>
            <div><h4 class="text-xs text-gray-400 uppercase mb-2">Agents</h4><div class="flex flex-wrap gap-1.5"><span v-for="a in detailReport.agents_used" :key="a" class="px-2 py-0.5 rounded-full text-xs bg-cyber-purple/15 text-cyber-purple capitalize">{{ a }}</span></div></div>
            <div><h4 class="text-xs text-gray-400 uppercase mb-2">APIs</h4><div class="flex flex-wrap gap-1.5"><span v-for="a in detailReport.apis_called" :key="a" class="px-2 py-0.5 rounded-full text-xs bg-cyan-500/15 text-cyan-400">{{ a }}</span></div></div>
            <div><h4 class="text-xs text-gray-400 uppercase mb-2">Log</h4><div class="space-y-1"><p v-for="(a, i) in detailReport.actions" :key="i" class="text-xs text-gray-400">{{ i + 1 }}. {{ a }}</p></div></div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

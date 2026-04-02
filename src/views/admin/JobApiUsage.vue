<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'

const admin = useAdminStore()
const aiHealth = ref<Record<string, unknown> | null>(null)
const loading = ref(true)

onMounted(async () => {
  admin.fetchJobListings()
  admin.fetchJobAgentLogs()
  // Check AI service health
  try {
    const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
    const res = await fetch(`${mcpUrl}/health`, { signal: AbortSignal.timeout(5000) })
    if (res.ok) aiHealth.value = { mcp: 'online' }
  } catch { aiHealth.value = { mcp: 'offline' } }
  try {
    const res = await fetch('http://localhost:8090/health', { signal: AbortSignal.timeout(5000) })
    if (res.ok) { const d = await res.json(); Object.assign(aiHealth.value || {}, d) }
  } catch { /* AI service offline */ }
  loading.value = false
})

// API usage estimation from job data
const apiCalls = computed(() => {
  const jobs = admin.jobListings.length
  const scored = admin.jobListings.filter(j => j.match_score !== null).length
  const agentRuns = admin.jobAgentLogs.length
  return [
    { api: 'JSearch (RapidAPI)', purpose: 'Job search — Indeed, LinkedIn, Glassdoor, ZipRecruiter, Google', calls: Math.ceil(jobs * 0.15), limit: '500K/month', status: 'active', color: 'text-blue-400' },
    { api: 'Himalayas', purpose: 'Remote job search (free, no auth)', calls: Math.ceil(jobs * 0.25), limit: 'Unlimited', status: 'active', color: 'text-amber-400' },
    { api: 'RemoteOK', purpose: 'Remote job search (free, no auth)', calls: Math.ceil(jobs * 0.25), limit: 'Unlimited', status: 'active', color: 'text-teal-400' },
    { api: 'Remotive', purpose: 'Remote job search (free, no auth)', calls: Math.ceil(jobs * 0.05), limit: '4 req/day', status: 'active', color: 'text-indigo-400' },
    { api: 'Arbeitnow', purpose: 'EU job search (free, no auth)', calls: Math.ceil(jobs * 0.2), limit: 'Unlimited', status: 'active', color: 'text-pink-400' },
    { api: 'Hacker News Firebase', purpose: 'YC/Startup jobs (free, no auth)', calls: Math.ceil(jobs * 0.1), limit: 'Unlimited', status: 'active', color: 'text-orange-400' },
    { api: 'LinkedIn Public API', purpose: 'Job search (no login, limited)', calls: Math.ceil(jobs * 0.05), limit: 'Rate limited', status: 'active', color: 'text-sky-400' },
    { api: 'OpenAI GPT', purpose: 'Classify, match, cover letters', calls: scored * 3, limit: 'Pay per use', status: admin.jobListings.some(j => j.match_score) ? 'active' : 'idle', color: 'text-green-400' },
    { api: 'Google Gemini', purpose: 'Fallback for classify, match, cover letters', calls: 0, limit: 'Free tier', status: 'standby', color: 'text-cyan-400' },
    { api: 'FAISS (local)', purpose: 'Semantic vector matching', calls: scored, limit: 'Unlimited (local)', status: (aiHealth.value as any)?.faiss ? 'active' : 'offline', color: 'text-yellow-400' },
    { api: 'SearXNG (local)', purpose: 'Company research via web search', calls: agentRuns, limit: 'Unlimited (self-hosted)', status: 'active', color: 'text-purple-400' },
    { api: 'Sentence Transformers', purpose: 'Text embedding (all-MiniLM-L6-v2)', calls: scored + jobs, limit: 'Unlimited (local)', status: (aiHealth.value as any)?.sentence_transformers ? 'active' : 'offline', color: 'text-violet-400' },
    { api: 'SearXNG MCP', purpose: 'Search engine queries for Research Agent', calls: agentRuns * 3, limit: 'Unlimited', status: 'configured', color: 'text-fuchsia-400' },
    { api: 'NotebookLM', purpose: 'Deep company research synthesis', calls: 0, limit: 'Free (Google)', status: (aiHealth.value as any)?.notebooklm ? 'active' : 'needs_login', color: 'text-emerald-400' },
    { api: 'AgentScope', purpose: 'Parallel agent orchestration', calls: agentRuns, limit: 'Unlimited (local)', status: (aiHealth.value as any)?.agentscope ? 'active' : 'offline', color: 'text-lime-400' },
  ]
})

const totalCalls = computed(() => apiCalls.value.reduce((s, a) => s + a.calls, 0))
const activeApis = computed(() => apiCalls.value.filter(a => a.status === 'active').length)

function statusBadge(s: string) {
  if (s === 'active') return 'bg-green-500/15 text-green-400'
  if (s === 'standby') return 'bg-yellow-500/15 text-yellow-400'
  if (s === 'configured') return 'bg-cyan-500/15 text-cyan-400'
  if (s === 'idle') return 'bg-gray-500/15 text-gray-400'
  if (s === 'needs_login') return 'bg-orange-500/15 text-orange-400'
  return 'bg-red-500/15 text-red-400'
}
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold text-white mb-2">API Usage</h2>
    <p class="text-sm text-gray-400 mb-6">Track all API calls across the job application pipeline</p>

    <!-- Summary -->
    <div class="grid grid-cols-4 gap-3 mb-6">
      <div class="glass-dark rounded-lg p-3 border border-neural-700/50 text-center">
        <p class="text-[9px] text-gray-500 uppercase">Total APIs</p>
        <p class="text-xl font-bold text-white">{{ apiCalls.length }}</p>
      </div>
      <div class="glass-dark rounded-lg p-3 border border-neural-700/50 text-center">
        <p class="text-[9px] text-gray-500 uppercase">Active</p>
        <p class="text-xl font-bold text-green-400">{{ activeApis }}</p>
      </div>
      <div class="glass-dark rounded-lg p-3 border border-neural-700/50 text-center">
        <p class="text-[9px] text-gray-500 uppercase">Est. Calls</p>
        <p class="text-xl font-bold text-cyan-400">{{ totalCalls }}</p>
      </div>
      <div class="glass-dark rounded-lg p-3 border border-neural-700/50 text-center">
        <p class="text-[9px] text-gray-500 uppercase">FAISS Index</p>
        <p class="text-xl font-bold text-yellow-400">{{ (aiHealth as any)?.jobs_indexed || 0 }}</p>
      </div>
    </div>

    <!-- AI Service Health -->
    <div class="glass-dark rounded-xl p-4 border border-neural-700/50 mb-6">
      <h3 class="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Service Health</h3>
      <div class="flex flex-wrap gap-3">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full" :class="(aiHealth as any)?.mcp === 'online' ? 'bg-green-400' : 'bg-red-400'" />
          <span class="text-xs text-gray-300">MCP Server (8080)</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full" :class="(aiHealth as any)?.status === 'ok' ? 'bg-green-400' : 'bg-red-400'" />
          <span class="text-xs text-gray-300">AI Service (8090)</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full" :class="(aiHealth as any)?.faiss ? 'bg-green-400' : 'bg-red-400'" />
          <span class="text-xs text-gray-300">FAISS</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full" :class="(aiHealth as any)?.sentence_transformers ? 'bg-green-400' : 'bg-red-400'" />
          <span class="text-xs text-gray-300">Embeddings</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full" :class="(aiHealth as any)?.agentscope ? 'bg-green-400' : 'bg-red-400'" />
          <span class="text-xs text-gray-300">AgentScope</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full" :class="(aiHealth as any)?.resume_indexed ? 'bg-green-400' : 'bg-yellow-400'" />
          <span class="text-xs text-gray-300">Resume Indexed</span>
        </div>
      </div>
    </div>

    <!-- API Table -->
    <div class="glass-dark rounded-xl overflow-hidden border border-neural-700/50">
      <table class="w-full text-sm">
        <thead class="bg-neural-700/40">
          <tr>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase">API / Service</th>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase">Purpose</th>
            <th class="text-center px-4 py-3 text-gray-500 font-medium text-[10px] uppercase">Est. Calls</th>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase">Limit</th>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="api in apiCalls" :key="api.api" class="border-t border-neural-700/30 hover:bg-neural-700/20 transition-colors">
            <td class="px-4 py-3">
              <span class="text-xs font-medium" :class="api.color">{{ api.api }}</span>
            </td>
            <td class="px-4 py-3 text-[10px] text-gray-400 max-w-[250px]">{{ api.purpose }}</td>
            <td class="px-4 py-3 text-center text-xs text-white font-medium">{{ api.calls }}</td>
            <td class="px-4 py-3 text-[10px] text-gray-500">{{ api.limit }}</td>
            <td class="px-4 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-medium capitalize" :class="statusBadge(api.status)">{{ api.status.replace('_', ' ') }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Cost Breakdown -->
    <div class="glass-dark rounded-xl p-4 border border-neural-700/50 mt-6">
      <h3 class="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Monthly Cost Estimate</h3>
      <div class="grid grid-cols-3 gap-4">
        <div class="text-center">
          <p class="text-2xl font-bold text-green-400">$0</p>
          <p class="text-[10px] text-gray-500">Free APIs (Himalayas, RemoteOK, Arbeitnow, HN, SearXNG, FAISS)</p>
        </div>
        <div class="text-center">
          <p class="text-2xl font-bold text-yellow-400">~$0.05</p>
          <p class="text-[10px] text-gray-500">OpenAI Embeddings (text-embedding-3-small)</p>
        </div>
        <div class="text-center">
          <p class="text-2xl font-bold text-cyan-400">$0</p>
          <p class="text-[10px] text-gray-500">JSearch Free Tier (500K req/month)</p>
        </div>
      </div>
    </div>
  </div>
</template>

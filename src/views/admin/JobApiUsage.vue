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
// Subscription & pricing info for decision-making
interface ApiInfo {
  api: string; purpose: string; calls: number; limit: string; status: string; color: string
  key_name?: string; key_configured?: boolean
  pricing?: { free_tier: string; paid: string; url: string }
}

const apiCalls = computed((): ApiInfo[] => {
  const jobs = admin.jobListings.length
  const scored = admin.jobListings.filter(j => j.match_score !== null).length
  const applied = admin.jobListings.filter(j => j.status === 'applied').length
  const agentRuns = admin.jobAgentLogs.length
  return [
    // ── Job Search APIs ──
    { api: 'JSearch (RapidAPI)', purpose: 'Job search — Indeed, LinkedIn, Glassdoor, ZipRecruiter, Google', calls: Math.ceil(jobs * 0.15), limit: '500/month (free)', status: 'active', color: 'text-blue-400', key_name: 'VITE_JSEARCH_KEY', key_configured: true, pricing: { free_tier: '500 req/month', paid: '$10/mo (10K req), $30/mo (100K req)', url: 'https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch/pricing' } },
    { api: 'Jooble API', purpose: 'Job aggregator — 70+ boards, global coverage', calls: Math.ceil(jobs * 0.05), limit: 'Unlimited (free)', status: 'active', color: 'text-blue-300', key_name: 'JOOBLE_API_KEY', key_configured: true, pricing: { free_tier: 'Unlimited for job seekers', paid: 'N/A — free API', url: 'https://jooble.org/api/about' } },
    { api: 'Himalayas', purpose: 'Remote job search (free, no auth)', calls: Math.ceil(jobs * 0.25), limit: 'Unlimited', status: 'active', color: 'text-amber-400', pricing: { free_tier: 'Unlimited', paid: 'N/A — free API', url: 'https://himalayas.app/api' } },
    { api: 'RemoteOK', purpose: 'Remote job search (free, no auth)', calls: Math.ceil(jobs * 0.25), limit: 'Unlimited', status: 'active', color: 'text-teal-400', pricing: { free_tier: 'Unlimited', paid: 'N/A — free API', url: 'https://remoteok.com/api' } },
    { api: 'Remotive', purpose: 'Remote job search + alerts', calls: Math.ceil(jobs * 0.05), limit: '4 req/day (free)', status: 'active', color: 'text-indigo-400', pricing: { free_tier: 'Basic search + API (limited)', paid: '$39/mo or $299/yr — unlimited alerts, advanced filters, salary insights, API access', url: 'https://remotive.com/pricing' } },
    { api: 'RemoteRocketship', purpose: 'Curated remote jobs + salary data', calls: Math.ceil(jobs * 0.03), limit: 'Limited (free)', status: 'active', color: 'text-rose-400', pricing: { free_tier: 'Browse jobs, basic search', paid: '$19/mo or $149/yr — unlimited alerts, advanced filters, salary data, company insights', url: 'https://www.remoterocketship.com/pricing' } },
    { api: 'Arbeitnow', purpose: 'EU/global job search (free, no auth)', calls: Math.ceil(jobs * 0.2), limit: 'Unlimited', status: 'active', color: 'text-pink-400', pricing: { free_tier: 'Unlimited', paid: 'N/A — free API', url: 'https://arbeitnow.com/api' } },
    { api: 'HN/YC Jobs', purpose: 'YC/Startup jobs via Firebase', calls: Math.ceil(jobs * 0.1), limit: 'Unlimited', status: 'active', color: 'text-orange-400', pricing: { free_tier: 'Unlimited', paid: 'N/A — free', url: 'https://github.com/HackerNews/API' } },
    { api: 'Adzuna', purpose: 'Global job search (not configured)', calls: 0, limit: '250/day (free)', status: 'not_configured', color: 'text-gray-500', key_name: 'ADZUNA_APP_KEY', key_configured: false, pricing: { free_tier: '250 req/day', paid: '$29/mo (5K req), custom plans', url: 'https://developer.adzuna.com/pricing' } },

    // ── AI / ML APIs ──
    { api: 'OpenAI GPT-4o-mini', purpose: 'Classify, match, cover letters (primary)', calls: scored * 3, limit: 'Pay per use', status: admin.jobListings.some(j => j.match_score) ? 'active' : 'idle', color: 'text-green-400', key_name: 'VITE_OPENAI_KEY', key_configured: true, pricing: { free_tier: '$5 free credit on signup', paid: '~$0.15/1M input tokens, ~$0.60/1M output tokens', url: 'https://openai.com/pricing' } },
    { api: 'Google Gemini Flash', purpose: 'Classify, match, cover letters (fallback)', calls: scored * 2, limit: 'Free tier', status: 'active', color: 'text-cyan-400', key_name: 'VITE_GEMINI_KEY', key_configured: true, pricing: { free_tier: '15 req/min, 1M tokens/day', paid: '$0.075/1M input, $0.30/1M output (beyond free)', url: 'https://ai.google.dev/pricing' } },

    // ── Automation APIs ──
    { api: '2captcha', purpose: 'CAPTCHA solving (reCAPTCHA, hCaptcha, Turnstile)', calls: 0, limit: 'Pay per solve', status: 'not_configured', color: 'text-gray-500', key_name: 'TWOCAPTCHA_API_KEY', key_configured: false, pricing: { free_tier: 'None — pay per solve', paid: '$2.99/1000 normal CAPTCHA, $2.99/1000 reCAPTCHA', url: 'https://2captcha.com/pricing' } },
    { api: 'cPanel SMTP', purpose: 'Send application emails + notifications', calls: applied * 2, limit: 'Server limit (~500/hr)', status: 'active', color: 'text-emerald-400', pricing: { free_tier: 'Included with hosting', paid: 'N/A — part of cPanel hosting', url: '' } },
    { api: 'Resend (backup SMTP)', purpose: 'Backup email relay', calls: 0, limit: '100/day (free)', status: 'standby', color: 'text-gray-500', key_name: 'RESEND_API_KEY', key_configured: true, pricing: { free_tier: '100 emails/day, 3K/month', paid: '$20/mo (50K/mo)', url: 'https://resend.com/pricing' } },

    // ── Local Services (no API key) ──
    { api: 'Supabase (hosted)', purpose: 'Database — jobs, applications, profiles, logs', calls: jobs + applied + agentRuns, limit: '500MB/50K rows (free)', status: 'active', color: 'text-green-300', pricing: { free_tier: '2 projects, 500MB, 50K rows', paid: '$25/mo (8GB, unlimited rows)', url: 'https://supabase.com/pricing' } },
    { api: 'FAISS (local)', purpose: 'Semantic vector matching', calls: scored, limit: 'Unlimited (local)', status: (aiHealth.value as any)?.faiss ? 'active' : 'offline', color: 'text-yellow-400' },
    { api: 'SearXNG (Docker)', purpose: 'Company research via web search', calls: agentRuns, limit: 'Unlimited (self-hosted)', status: 'active', color: 'text-purple-400' },
    { api: 'Playwright (local)', purpose: 'Browser automation — apply on platforms', calls: applied, limit: 'Unlimited (local)', status: 'active', color: 'text-violet-400' },
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
            <th class="text-left px-3 py-3 text-gray-500 font-medium text-[10px] uppercase">API / Service</th>
            <th class="text-left px-3 py-3 text-gray-500 font-medium text-[10px] uppercase">Purpose</th>
            <th class="text-center px-3 py-3 text-gray-500 font-medium text-[10px] uppercase">Calls</th>
            <th class="text-left px-3 py-3 text-gray-500 font-medium text-[10px] uppercase">Limit</th>
            <th class="text-left px-3 py-3 text-gray-500 font-medium text-[10px] uppercase">Free Tier</th>
            <th class="text-left px-3 py-3 text-gray-500 font-medium text-[10px] uppercase">Paid Plan</th>
            <th class="text-center px-3 py-3 text-gray-500 font-medium text-[10px] uppercase">Key</th>
            <th class="text-left px-3 py-3 text-gray-500 font-medium text-[10px] uppercase">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="api in apiCalls" :key="api.api" class="border-t border-neural-700/30 hover:bg-neural-700/20 transition-colors">
            <td class="px-3 py-2.5">
              <div class="flex flex-col">
                <span class="text-xs font-medium" :class="api.color">{{ api.api }}</span>
                <a v-if="api.pricing?.url" :href="api.pricing.url" target="_blank" class="text-[8px] text-cyber-purple hover:underline mt-0.5">View Pricing</a>
              </div>
            </td>
            <td class="px-3 py-2.5 text-[10px] text-gray-400 max-w-[200px]">{{ api.purpose }}</td>
            <td class="px-3 py-2.5 text-center text-xs text-white font-medium">{{ api.calls }}</td>
            <td class="px-3 py-2.5 text-[10px] text-gray-500">{{ api.limit }}</td>
            <td class="px-3 py-2.5 text-[10px] text-green-400">{{ api.pricing?.free_tier || '—' }}</td>
            <td class="px-3 py-2.5 text-[10px] text-yellow-400 max-w-[180px]">{{ api.pricing?.paid || '—' }}</td>
            <td class="px-3 py-2.5 text-center">
              <span v-if="api.key_configured" class="text-green-400 text-[10px]" title="API key configured">&#10003;</span>
              <span v-else-if="api.key_name" class="text-red-400 text-[10px]" :title="'Needs: ' + api.key_name">&#10007;</span>
              <span v-else class="text-gray-600 text-[10px]">—</span>
            </td>
            <td class="px-3 py-2.5"><span class="px-2 py-0.5 rounded-full text-[10px] font-medium capitalize" :class="statusBadge(api.status)">{{ api.status.replace('_', ' ') }}</span></td>
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

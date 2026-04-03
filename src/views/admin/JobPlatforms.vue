<script setup lang="ts">
import { ref, computed } from 'vue'

interface Platform {
  id: string; name: string; url: string; icon: string
  type: 'job_board' | 'freelance' | 'aggregator' | 'company_direct'
  registered: boolean; email_verified: boolean; profile_complete: boolean
  gmail_connected: boolean; resume_uploaded: boolean; skills_added: boolean
  login_url: string; profile_url: string
  agent_type: string; agent_status: 'active' | 'idle' | 'not_configured'
  api_method: string; last_synced: string | null; jobs_pulled: number
  notes: string
}

const platforms = ref<Platform[]>([
  // Active APIs
  { id: 'indeed', name: 'Indeed PH', url: 'https://ph.indeed.com', icon: '🔵', type: 'job_board', registered: true, email_verified: true, profile_complete: false, gmail_connected: true, resume_uploaded: false, skills_added: false, login_url: 'https://secure.indeed.com/auth', profile_url: 'https://ph.indeed.com/my/profile', agent_type: 'Scout Scraper', agent_status: 'active', api_method: 'JSearch API', last_synced: new Date().toISOString(), jobs_pulled: 25, notes: 'Synced with Glassdoor' },
  { id: 'linkedin', name: 'LinkedIn', url: 'https://linkedin.com', icon: '🟦', type: 'job_board', registered: true, email_verified: true, profile_complete: true, gmail_connected: true, resume_uploaded: true, skills_added: true, login_url: 'https://linkedin.com/login', profile_url: 'https://linkedin.com/in/me', agent_type: 'Scout + Monitor', agent_status: 'active', api_method: 'JSearch + Public API', last_synced: new Date().toISOString(), jobs_pulled: 18, notes: 'Freelancer linked. Career building connected.' },
  { id: 'glassdoor', name: 'Glassdoor', url: 'https://glassdoor.com', icon: '🟢', type: 'job_board', registered: true, email_verified: true, profile_complete: false, gmail_connected: true, resume_uploaded: false, skills_added: false, login_url: 'https://glassdoor.com/member/home', profile_url: 'https://glassdoor.com/member/profile', agent_type: 'Scout Scraper', agent_status: 'active', api_method: 'JSearch API', last_synced: new Date().toISOString(), jobs_pulled: 15, notes: 'Synced with Indeed' },
  { id: 'ziprecruiter', name: 'ZipRecruiter', url: 'https://ziprecruiter.com', icon: '✅', type: 'job_board', registered: true, email_verified: true, profile_complete: false, gmail_connected: true, resume_uploaded: false, skills_added: false, login_url: 'https://ziprecruiter.com/login', profile_url: 'https://ziprecruiter.com/profile', agent_type: 'Scout Scraper', agent_status: 'active', api_method: 'JSearch API', last_synced: new Date().toISOString(), jobs_pulled: 2, notes: '' },
  { id: 'google', name: 'Google Jobs', url: 'https://google.com/search?q=jobs', icon: '🔴', type: 'aggregator', registered: false, email_verified: false, profile_complete: false, gmail_connected: false, resume_uploaded: false, skills_added: false, login_url: '', profile_url: '', agent_type: 'Scout Scraper', agent_status: 'active', api_method: 'JSearch API', last_synced: new Date().toISOString(), jobs_pulled: 10, notes: 'No account needed — aggregator' },
  { id: 'jobstreet', name: 'JobStreet PH', url: 'https://ph.jobstreet.com', icon: '🟣', type: 'job_board', registered: true, email_verified: true, profile_complete: false, gmail_connected: true, resume_uploaded: false, skills_added: false, login_url: 'https://ph.jobstreet.com/login', profile_url: 'https://ph.jobstreet.com/profile', agent_type: 'Playwright Scraper', agent_status: 'idle', api_method: 'Playwright (pending)', last_synced: null, jobs_pulled: 0, notes: 'Needs Playwright wiring' },
  { id: 'kalibrr', name: 'Kalibrr', url: 'https://kalibrr.com', icon: '🔷', type: 'job_board', registered: true, email_verified: true, profile_complete: false, gmail_connected: true, resume_uploaded: false, skills_added: false, login_url: 'https://kalibrr.com/login', profile_url: 'https://kalibrr.com/home/profile', agent_type: 'Playwright Scraper', agent_status: 'idle', api_method: 'Playwright (pending)', last_synced: null, jobs_pulled: 0, notes: 'Has skills assessment' },
  { id: 'onlinejobs', name: 'OnlineJobs.ph', url: 'https://onlinejobs.ph', icon: '🟠', type: 'job_board', registered: true, email_verified: true, profile_complete: false, gmail_connected: true, resume_uploaded: false, skills_added: false, login_url: 'https://onlinejobs.ph/jobseekers/login', profile_url: 'https://onlinejobs.ph/jobseekers/profile', agent_type: 'Playwright Scraper', agent_status: 'idle', api_method: 'Playwright (pending)', last_synced: null, jobs_pulled: 0, notes: 'Remote/VA focused' },
  { id: 'bossjob', name: 'Bossjob', url: 'https://bossjob.ph', icon: '🟡', type: 'job_board', registered: true, email_verified: true, profile_complete: false, gmail_connected: true, resume_uploaded: false, skills_added: false, login_url: 'https://bossjob.ph/login', profile_url: 'https://bossjob.ph/my/profile', agent_type: 'Playwright Scraper', agent_status: 'idle', api_method: 'Playwright (pending)', last_synced: null, jobs_pulled: 0, notes: 'Chat-first, AI matching' },
  { id: 'freelancer', name: 'Freelancer.com', url: 'https://freelancer.com', icon: '🏷️', type: 'freelance', registered: true, email_verified: true, profile_complete: false, gmail_connected: false, resume_uploaded: false, skills_added: false, login_url: 'https://freelancer.com/login', profile_url: 'https://freelancer.com/u/', agent_type: 'Project Monitor', agent_status: 'idle', api_method: 'Limited API', last_synced: null, jobs_pulled: 0, notes: 'Linked with LinkedIn' },
  // Free aggregators
  { id: 'himalayas', name: 'Himalayas', url: 'https://himalayas.app', icon: '⛰️', type: 'aggregator', registered: false, email_verified: false, profile_complete: false, gmail_connected: false, resume_uploaded: false, skills_added: false, login_url: '', profile_url: '', agent_type: 'Scout API', agent_status: 'active', api_method: 'Free REST API', last_synced: new Date().toISOString(), jobs_pulled: 158, notes: 'No account needed' },
  { id: 'remoteok', name: 'RemoteOK', url: 'https://remoteok.com', icon: '🌍', type: 'aggregator', registered: false, email_verified: false, profile_complete: false, gmail_connected: false, resume_uploaded: false, skills_added: false, login_url: '', profile_url: '', agent_type: 'Scout API', agent_status: 'active', api_method: 'Free REST API', last_synced: new Date().toISOString(), jobs_pulled: 50, notes: 'No account needed' },
  { id: 'remotive', name: 'Remotive', url: 'https://remotive.com', icon: '🏠', type: 'aggregator', registered: false, email_verified: false, profile_complete: false, gmail_connected: false, resume_uploaded: false, skills_added: false, login_url: '', profile_url: '', agent_type: 'Scout API', agent_status: 'active', api_method: 'Free REST API', last_synced: new Date().toISOString(), jobs_pulled: 2, notes: '4 req/day limit' },
  { id: 'arbeitnow', name: 'Arbeitnow', url: 'https://arbeitnow.com', icon: '🇪🇺', type: 'aggregator', registered: false, email_verified: false, profile_complete: false, gmail_connected: false, resume_uploaded: false, skills_added: false, login_url: '', profile_url: '', agent_type: 'Scout API', agent_status: 'active', api_method: 'Free REST API', last_synced: new Date().toISOString(), jobs_pulled: 70, notes: 'EU focused' },
  { id: 'hackernews', name: 'HN/YC Jobs', url: 'https://news.ycombinator.com', icon: '🟧', type: 'aggregator', registered: false, email_verified: false, profile_complete: false, gmail_connected: false, resume_uploaded: false, skills_added: false, login_url: '', profile_url: '', agent_type: 'Scout API', agent_status: 'active', api_method: 'Firebase API', last_synced: new Date().toISOString(), jobs_pulled: 21, notes: 'Startup/YC focused' },
  { id: 'remotehunter', name: 'RemoteHunter', url: 'https://remotehunter.com', icon: '🎯', type: 'aggregator', registered: false, email_verified: false, profile_complete: false, gmail_connected: false, resume_uploaded: false, skills_added: false, login_url: 'https://remotehunter.com/register', profile_url: '', agent_type: 'Not Assigned', agent_status: 'not_configured', api_method: 'TBD', last_synced: null, jobs_pulled: 0, notes: 'Not registered' },
  { id: 'upwork', name: 'Upwork', url: 'https://upwork.com', icon: '🟩', type: 'freelance', registered: false, email_verified: false, profile_complete: false, gmail_connected: false, resume_uploaded: false, skills_added: false, login_url: 'https://upwork.com/signup', profile_url: '', agent_type: 'Project Monitor', agent_status: 'not_configured', api_method: 'Restricted API', last_synced: null, jobs_pulled: 0, notes: 'Not registered' },
  { id: 'facebook', name: 'Facebook Jobs', url: 'https://facebook.com/jobs', icon: '📘', type: 'job_board', registered: false, email_verified: false, profile_complete: false, gmail_connected: false, resume_uploaded: false, skills_added: false, login_url: '', profile_url: '', agent_type: 'Playwright Scraper', agent_status: 'not_configured', api_method: 'Playwright (pending)', last_synced: null, jobs_pulled: 0, notes: 'US only, relaunched Oct 2025' },
])

const searchQuery = ref('')
const filterType = ref('')
const filterStatus = ref('')
const showDetail = ref(false)
const detailPlatform = ref<Platform | null>(null)

const filtered = computed(() => {
  let p = [...platforms.value]
  if (searchQuery.value) { const q = searchQuery.value.toLowerCase(); p = p.filter(x => x.name.toLowerCase().includes(q) || x.agent_type.toLowerCase().includes(q)) }
  if (filterType.value) p = p.filter(x => x.type === filterType.value)
  if (filterStatus.value === 'registered') p = p.filter(x => x.registered)
  else if (filterStatus.value === 'active') p = p.filter(x => x.agent_status === 'active')
  else if (filterStatus.value === 'incomplete') p = p.filter(x => x.registered && !x.profile_complete)
  return p
})

const stats = computed(() => ({
  total: platforms.value.length,
  registered: platforms.value.filter(p => p.registered).length,
  active: platforms.value.filter(p => p.agent_status === 'active').length,
  complete: platforms.value.filter(p => p.profile_complete).length,
  pulled: platforms.value.reduce((s, p) => s + p.jobs_pulled, 0),
}))

function profileScore(p: Platform): number {
  let s = 0
  if (p.registered) s += 20; if (p.email_verified) s += 15; if (p.gmail_connected) s += 10
  if (p.resume_uploaded) s += 20; if (p.skills_added) s += 15; if (p.profile_complete) s += 20
  return s
}
function scoreColor(s: number) { return s >= 80 ? 'text-green-400' : s >= 50 ? 'text-yellow-400' : s >= 20 ? 'text-orange-400' : 'text-red-400' }
function scoreBg(s: number) { return s >= 80 ? 'bg-green-500' : s >= 50 ? 'bg-yellow-500' : s >= 20 ? 'bg-orange-500' : 'bg-gray-700' }
function agentColor(s: string) { return s === 'active' ? 'bg-green-500/15 text-green-400' : s === 'idle' ? 'bg-yellow-500/15 text-yellow-400' : 'bg-gray-500/15 text-gray-500' }
function typeBg(t: string) { return t === 'job_board' ? 'bg-blue-500/15 text-blue-400' : t === 'freelance' ? 'bg-purple-500/15 text-purple-400' : t === 'aggregator' ? 'bg-cyan-500/15 text-cyan-400' : 'bg-gray-500/15 text-gray-400' }
function viewDetail(p: Platform) { detailPlatform.value = p; showDetail.value = true }
function timeAgo(d: string | null) { if (!d) return '—'; const h = Math.floor((Date.now() - new Date(d).getTime()) / 3600000); return h < 1 ? 'Just now' : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago` }
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-5">
      <div>
        <h2 class="text-2xl font-bold text-white">Platforms</h2>
        <p class="text-sm text-gray-400 mt-1">{{ stats.total }} platforms · {{ stats.registered }} registered · {{ stats.active }} agents active · {{ stats.pulled }} jobs pulled</p>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex gap-3 mb-4 items-center">
      <div class="flex-1 relative">
        <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input v-model="searchQuery" placeholder="Search platforms or agents..." class="w-full pl-10 pr-4 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm placeholder-gray-500 focus:border-cyber-purple focus:outline-none" />
      </div>
      <select v-model="filterType" class="px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none">
        <option value="">All Types</option>
        <option value="job_board">Job Boards</option>
        <option value="freelance">Freelance</option>
        <option value="aggregator">Aggregators</option>
      </select>
      <select v-model="filterStatus" class="px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none">
        <option value="">All Status</option>
        <option value="registered">Registered</option>
        <option value="active">Agent Active</option>
        <option value="incomplete">Incomplete Profile</option>
      </select>
    </div>

    <!-- Management Table -->
    <div class="glass-dark rounded-xl overflow-hidden border border-neural-700/50">
      <table class="w-full text-sm">
        <thead class="bg-neural-700/40">
          <tr>
            <th class="text-left px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase w-8">#</th>
            <th class="text-left px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Platform</th>
            <th class="text-left px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Type</th>
            <th class="text-left px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase">AI Agent</th>
            <th class="text-left px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase">API Method</th>
            <th class="text-center px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Profile</th>
            <th class="text-left px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Status</th>
            <th class="text-center px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Jobs</th>
            <th class="text-left px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Synced</th>
            <th class="text-right px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(p, idx) in filtered" :key="p.id" class="border-t border-neural-700/30 hover:bg-neural-700/20 transition-colors cursor-pointer" @click="viewDetail(p)">
            <td class="px-3 py-2.5 text-gray-600 text-[10px]">{{ idx + 1 }}</td>
            <td class="px-3 py-2.5">
              <div class="flex items-center gap-2">
                <span class="text-lg">{{ p.icon }}</span>
                <div>
                  <p class="text-xs text-white font-medium">{{ p.name }}</p>
                  <p class="text-[9px] text-gray-600 truncate max-w-[120px]">{{ p.url }}</p>
                </div>
              </div>
            </td>
            <td class="px-3 py-2.5"><span class="px-1.5 py-0.5 rounded text-[9px] font-medium capitalize" :class="typeBg(p.type)">{{ p.type.replace('_', ' ') }}</span></td>
            <td class="px-3 py-2.5">
              <div class="flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full" :class="p.agent_status === 'active' ? 'bg-green-400 animate-pulse' : p.agent_status === 'idle' ? 'bg-yellow-400' : 'bg-gray-600'" />
                <span class="text-[10px] text-gray-300">{{ p.agent_type }}</span>
              </div>
            </td>
            <td class="px-3 py-2.5 text-[10px] text-gray-500">{{ p.api_method }}</td>
            <td class="px-3 py-2.5 text-center">
              <div class="flex items-center justify-center gap-1">
                <span class="text-xs font-bold" :class="scoreColor(profileScore(p))">{{ profileScore(p) }}%</span>
                <div class="w-10 h-1 bg-neural-700 rounded-full overflow-hidden">
                  <div class="h-full rounded-full" :class="scoreBg(profileScore(p))" :style="{ width: profileScore(p) + '%' }" />
                </div>
              </div>
            </td>
            <td class="px-3 py-2.5">
              <div class="flex gap-1">
                <span class="w-3 h-3 rounded-full border flex items-center justify-center text-[7px]" :class="p.registered ? 'border-green-500 bg-green-500 text-white' : 'border-gray-600'" :title="'Registered'">{{ p.registered ? '✓' : '' }}</span>
                <span class="w-3 h-3 rounded-full border flex items-center justify-center text-[7px]" :class="p.email_verified ? 'border-green-500 bg-green-500 text-white' : 'border-gray-600'" :title="'Email Verified'">{{ p.email_verified ? '✓' : '' }}</span>
                <span class="w-3 h-3 rounded-full border flex items-center justify-center text-[7px]" :class="p.gmail_connected ? 'border-cyan-500 bg-cyan-500 text-white' : 'border-gray-600'" :title="'Gmail'">{{ p.gmail_connected ? '✓' : '' }}</span>
                <span class="w-3 h-3 rounded-full border flex items-center justify-center text-[7px]" :class="p.resume_uploaded ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-600'" :title="'Resume'">{{ p.resume_uploaded ? '✓' : '' }}</span>
              </div>
            </td>
            <td class="px-3 py-2.5 text-center text-xs text-white">{{ p.jobs_pulled }}</td>
            <td class="px-3 py-2.5 text-[10px] text-gray-500">{{ timeAgo(p.last_synced) }}</td>
            <td class="px-3 py-2.5 text-right" @click.stop>
              <div class="flex items-center justify-end gap-0.5">
                <a v-if="p.login_url" :href="p.login_url" target="_blank" class="p-1 rounded hover:bg-neural-600 text-gray-500 hover:text-white transition-colors" title="Login">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
                </a>
                <a v-if="p.profile_url" :href="p.profile_url" target="_blank" class="p-1 rounded hover:bg-neural-600 text-gray-500 hover:text-cyber-cyan transition-colors" title="Profile">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </a>
                <a :href="p.url" target="_blank" class="p-1 rounded hover:bg-neural-600 text-gray-500 hover:text-white transition-colors" title="Open site">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Legend -->
    <div class="flex gap-4 mt-3 text-[9px] text-gray-600">
      <span>Status dots: <span class="text-green-400">✓ Registered</span> · <span class="text-green-400">✓ Verified</span> · <span class="text-cyan-400">✓ Gmail</span> · <span class="text-blue-400">✓ Resume</span></span>
    </div>

    <!-- Detail Modal -->
    <Teleport to="body">
      <div v-if="showDetail && detailPlatform" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="showDetail = false">
        <div class="glass-dark rounded-xl w-full max-w-lg border border-neural-600 max-h-[85vh] flex flex-col">
          <div class="px-6 py-4 border-b border-neural-700 shrink-0 flex items-center gap-3">
            <span class="text-3xl">{{ detailPlatform.icon }}</span>
            <div class="flex-1">
              <h3 class="text-lg font-bold text-white">{{ detailPlatform.name }}</h3>
              <p class="text-xs text-gray-400">{{ detailPlatform.url }}</p>
            </div>
            <span class="text-2xl font-bold" :class="scoreColor(profileScore(detailPlatform))">{{ profileScore(detailPlatform) }}%</span>
            <button @click="showDetail = false" class="p-2 rounded-lg hover:bg-neural-600 text-gray-400 hover:text-white"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
          <div class="flex-1 overflow-y-auto p-6 space-y-4">
            <!-- Agent -->
            <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-[9px] text-gray-500 uppercase">AI Agent</p>
                  <p class="text-sm text-white font-medium">{{ detailPlatform.agent_type }}</p>
                </div>
                <div class="text-right">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-medium capitalize" :class="agentColor(detailPlatform.agent_status)">{{ detailPlatform.agent_status.replace('_', ' ') }}</span>
                  <p class="text-[9px] text-gray-600 mt-0.5">{{ detailPlatform.api_method }}</p>
                </div>
              </div>
            </div>
            <!-- Checklist -->
            <div class="space-y-1.5">
              <h4 class="text-[9px] text-gray-500 uppercase tracking-wider">Profile Optimization</h4>
              <div v-for="item in [
                { label: 'Account Registered', done: detailPlatform.registered, icon: '📝' },
                { label: 'Email Verified', done: detailPlatform.email_verified, icon: '✉️' },
                { label: 'Gmail Connected', done: detailPlatform.gmail_connected, icon: '📧' },
                { label: 'Resume Uploaded', done: detailPlatform.resume_uploaded, icon: '📄' },
                { label: 'Skills Added', done: detailPlatform.skills_added, icon: '⚡' },
                { label: 'Profile Complete', done: detailPlatform.profile_complete, icon: '✅' },
              ]" :key="item.label" class="flex items-center gap-2 px-3 py-1.5 rounded-lg" :class="item.done ? 'bg-green-500/10' : 'bg-neural-800/30'">
                <span>{{ item.icon }}</span>
                <span class="w-4 h-4 rounded-full border flex items-center justify-center text-[8px]" :class="item.done ? 'border-green-500 bg-green-500 text-white' : 'border-gray-600'">{{ item.done ? '✓' : '' }}</span>
                <span class="text-xs" :class="item.done ? 'text-white' : 'text-gray-500'">{{ item.label }}</span>
              </div>
            </div>
            <!-- Stats -->
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-neural-800/50 rounded-lg p-3 text-center border border-neural-700/30"><p class="text-lg font-bold text-blue-400">{{ detailPlatform.jobs_pulled }}</p><p class="text-[9px] text-gray-500">Jobs Pulled</p></div>
              <div class="bg-neural-800/50 rounded-lg p-3 text-center border border-neural-700/30"><p class="text-xs text-gray-400">{{ timeAgo(detailPlatform.last_synced) }}</p><p class="text-[9px] text-gray-500">Last Synced</p></div>
            </div>
            <p v-if="detailPlatform.notes" class="text-[10px] text-gray-500 italic">{{ detailPlatform.notes }}</p>
            <!-- Actions -->
            <div class="flex gap-2 pt-3 border-t border-neural-700">
              <a v-if="detailPlatform.login_url" :href="detailPlatform.login_url" target="_blank" class="px-4 py-2 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-xs font-medium hover:opacity-90">Login</a>
              <a v-if="detailPlatform.profile_url" :href="detailPlatform.profile_url" target="_blank" class="px-4 py-2 bg-neural-700 text-gray-300 rounded-lg text-xs hover:bg-neural-600">Edit Profile</a>
              <a :href="detailPlatform.url" target="_blank" class="px-4 py-2 bg-neural-700 text-gray-300 rounded-lg text-xs hover:bg-neural-600">Visit Site</a>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

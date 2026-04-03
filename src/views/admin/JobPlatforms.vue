<script setup lang="ts">
import { ref, computed } from 'vue'

interface Platform {
  id: string; name: string; url: string; icon: string
  type: 'job_board' | 'freelance' | 'aggregator' | 'company_direct' | 'agency'
  registered: boolean; email_verified: boolean; profile_complete: boolean
  gmail_connected: boolean; resume_uploaded: boolean; skills_added: boolean
  login_url: string; profile_url: string
  agent_type: 'scraper' | 'monitor' | 'applier' | 'profile_optimizer' | 'none'
  agent_status: 'active' | 'idle' | 'not_configured'
  last_synced: string | null; jobs_pulled: number; applications_sent: number
  notes: string
}

const platforms = ref<Platform[]>([
  // Registered & Active
  { id: 'indeed', name: 'Indeed PH', url: 'https://ph.indeed.com', icon: '🔵',
    type: 'job_board', registered: true, email_verified: true, profile_complete: false,
    gmail_connected: true, resume_uploaded: false, skills_added: false,
    login_url: 'https://secure.indeed.com/auth', profile_url: 'https://ph.indeed.com/my/profile',
    agent_type: 'scraper', agent_status: 'active', last_synced: new Date().toISOString(), jobs_pulled: 25, applications_sent: 0,
    notes: 'Synced with Glassdoor. JSearch API pulling jobs.' },
  { id: 'linkedin', name: 'LinkedIn', url: 'https://linkedin.com', icon: '🟦',
    type: 'job_board', registered: true, email_verified: true, profile_complete: true,
    gmail_connected: true, resume_uploaded: true, skills_added: true,
    login_url: 'https://linkedin.com/login', profile_url: 'https://linkedin.com/in/me',
    agent_type: 'monitor', agent_status: 'active', last_synced: new Date().toISOString(), jobs_pulled: 18, applications_sent: 0,
    notes: 'Freelancer.com linked. Career building connected.' },
  { id: 'glassdoor', name: 'Glassdoor', url: 'https://glassdoor.com', icon: '🟢',
    type: 'job_board', registered: true, email_verified: true, profile_complete: false,
    gmail_connected: true, resume_uploaded: false, skills_added: false,
    login_url: 'https://glassdoor.com/member/home', profile_url: 'https://glassdoor.com/member/profile',
    agent_type: 'scraper', agent_status: 'active', last_synced: new Date().toISOString(), jobs_pulled: 15, applications_sent: 0,
    notes: 'Synced with Indeed account.' },
  { id: 'jobstreet', name: 'JobStreet PH', url: 'https://ph.jobstreet.com', icon: '🟣',
    type: 'job_board', registered: true, email_verified: true, profile_complete: false,
    gmail_connected: true, resume_uploaded: false, skills_added: false,
    login_url: 'https://ph.jobstreet.com/login', profile_url: 'https://ph.jobstreet.com/profile',
    agent_type: 'scraper', agent_status: 'idle', last_synced: null, jobs_pulled: 0, applications_sent: 0,
    notes: 'Existing account. Needs Playwright for scraping.' },
  { id: 'kalibrr', name: 'Kalibrr', url: 'https://kalibrr.com', icon: '🔷',
    type: 'job_board', registered: true, email_verified: true, profile_complete: false,
    gmail_connected: true, resume_uploaded: false, skills_added: false,
    login_url: 'https://kalibrr.com/login', profile_url: 'https://kalibrr.com/home/profile',
    agent_type: 'scraper', agent_status: 'idle', last_synced: null, jobs_pulled: 0, applications_sent: 0,
    notes: 'Registered. Has skills assessment feature.' },
  { id: 'onlinejobs', name: 'OnlineJobs.ph', url: 'https://onlinejobs.ph', icon: '🟠',
    type: 'job_board', registered: true, email_verified: true, profile_complete: false,
    gmail_connected: true, resume_uploaded: false, skills_added: false,
    login_url: 'https://onlinejobs.ph/jobseekers/login', profile_url: 'https://onlinejobs.ph/jobseekers/profile',
    agent_type: 'scraper', agent_status: 'idle', last_synced: null, jobs_pulled: 0, applications_sent: 0,
    notes: 'Registered. Remote/VA focused platform.' },
  { id: 'bossjob', name: 'Bossjob', url: 'https://bossjob.ph', icon: '🟡',
    type: 'job_board', registered: true, email_verified: true, profile_complete: false,
    gmail_connected: true, resume_uploaded: false, skills_added: false,
    login_url: 'https://bossjob.ph/login', profile_url: 'https://bossjob.ph/my/profile',
    agent_type: 'scraper', agent_status: 'idle', last_synced: null, jobs_pulled: 0, applications_sent: 0,
    notes: 'Chat-first platform. AI matching built-in.' },
  { id: 'ziprecruiter', name: 'ZipRecruiter', url: 'https://ziprecruiter.com', icon: '✅',
    type: 'job_board', registered: true, email_verified: true, profile_complete: false,
    gmail_connected: true, resume_uploaded: false, skills_added: false,
    login_url: 'https://ziprecruiter.com/login', profile_url: 'https://ziprecruiter.com/profile',
    agent_type: 'scraper', agent_status: 'active', last_synced: new Date().toISOString(), jobs_pulled: 2, applications_sent: 0,
    notes: 'Via JSearch API.' },
  { id: 'freelancer', name: 'Freelancer.com', url: 'https://freelancer.com', icon: '🏷️',
    type: 'freelance', registered: true, email_verified: true, profile_complete: false,
    gmail_connected: false, resume_uploaded: false, skills_added: false,
    login_url: 'https://freelancer.com/login', profile_url: 'https://freelancer.com/u/',
    agent_type: 'monitor', agent_status: 'idle', last_synced: null, jobs_pulled: 0, applications_sent: 0,
    notes: 'Linked with LinkedIn account.' },
  // Free APIs (no account needed)
  { id: 'himalayas', name: 'Himalayas', url: 'https://himalayas.app', icon: '⛰️',
    type: 'aggregator', registered: false, email_verified: false, profile_complete: false,
    gmail_connected: false, resume_uploaded: false, skills_added: false,
    login_url: '', profile_url: '',
    agent_type: 'scraper', agent_status: 'active', last_synced: new Date().toISOString(), jobs_pulled: 158, applications_sent: 0,
    notes: 'Free API. No account needed.' },
  { id: 'remoteok', name: 'RemoteOK', url: 'https://remoteok.com', icon: '🌍',
    type: 'aggregator', registered: false, email_verified: false, profile_complete: false,
    gmail_connected: false, resume_uploaded: false, skills_added: false,
    login_url: '', profile_url: '',
    agent_type: 'scraper', agent_status: 'active', last_synced: new Date().toISOString(), jobs_pulled: 50, applications_sent: 0,
    notes: 'Free API. No account needed.' },
  { id: 'remotive', name: 'Remotive', url: 'https://remotive.com', icon: '🏠',
    type: 'aggregator', registered: false, email_verified: false, profile_complete: false,
    gmail_connected: false, resume_uploaded: false, skills_added: false,
    login_url: '', profile_url: '',
    agent_type: 'scraper', agent_status: 'active', last_synced: new Date().toISOString(), jobs_pulled: 2, applications_sent: 0,
    notes: 'Free API. 4 req/day limit.' },
  { id: 'remotehunter', name: 'RemoteHunter', url: 'https://remotehunter.com', icon: '🎯',
    type: 'aggregator', registered: false, email_verified: false, profile_complete: false,
    gmail_connected: false, resume_uploaded: false, skills_added: false,
    login_url: 'https://remotehunter.com/register', profile_url: '',
    agent_type: 'none', agent_status: 'not_configured', last_synced: null, jobs_pulled: 0, applications_sent: 0,
    notes: 'Not registered yet.' },
])

const filterType = ref('')
const searchQuery = ref('')

const filtered = computed(() => {
  let p = [...platforms.value]
  if (filterType.value) p = p.filter(x => x.type === filterType.value)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    p = p.filter(x => x.name.toLowerCase().includes(q))
  }
  return p
})

const stats = computed(() => ({
  total: platforms.value.length,
  registered: platforms.value.filter(p => p.registered).length,
  verified: platforms.value.filter(p => p.email_verified).length,
  profileComplete: platforms.value.filter(p => p.profile_complete).length,
  agentsActive: platforms.value.filter(p => p.agent_status === 'active').length,
  totalPulled: platforms.value.reduce((s, p) => s + p.jobs_pulled, 0),
}))

function profileScore(p: Platform): number {
  let score = 0
  if (p.registered) score += 20
  if (p.email_verified) score += 15
  if (p.gmail_connected) score += 10
  if (p.resume_uploaded) score += 20
  if (p.skills_added) score += 15
  if (p.profile_complete) score += 20
  return score
}

function profileColor(score: number) {
  if (score >= 80) return 'text-green-400'
  if (score >= 50) return 'text-yellow-400'
  if (score >= 20) return 'text-orange-400'
  return 'text-red-400'
}

function typeLabel(t: string) {
  const map: Record<string, string> = { job_board: 'Job Board', freelance: 'Freelance', aggregator: 'Aggregator', company_direct: 'Direct', agency: 'Agency' }
  return map[t] || t
}

function typeBg(t: string) {
  const map: Record<string, string> = { job_board: 'bg-blue-500/15 text-blue-400', freelance: 'bg-purple-500/15 text-purple-400', aggregator: 'bg-cyan-500/15 text-cyan-400', company_direct: 'bg-green-500/15 text-green-400', agency: 'bg-orange-500/15 text-orange-400' }
  return map[t] || 'bg-gray-500/15 text-gray-400'
}

// Detail
const showDetail = ref(false)
const detailPlatform = ref<Platform | null>(null)
function viewDetail(p: Platform) { detailPlatform.value = p; showDetail.value = true }
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-white">Platforms</h2>
        <p class="text-sm text-gray-400 mt-1">Registered accounts, profile optimization, and AI agent monitoring</p>
      </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-3 lg:grid-cols-6 gap-2 mb-5">
      <div class="glass-dark rounded-lg p-3 text-center border border-neural-700/50"><p class="text-[9px] text-gray-500 uppercase">Platforms</p><p class="text-xl font-bold text-white">{{ stats.total }}</p></div>
      <div class="glass-dark rounded-lg p-3 text-center border border-neural-700/50"><p class="text-[9px] text-gray-500 uppercase">Registered</p><p class="text-xl font-bold text-green-400">{{ stats.registered }}</p></div>
      <div class="glass-dark rounded-lg p-3 text-center border border-neural-700/50"><p class="text-[9px] text-gray-500 uppercase">Verified</p><p class="text-xl font-bold text-cyan-400">{{ stats.verified }}</p></div>
      <div class="glass-dark rounded-lg p-3 text-center border border-neural-700/50"><p class="text-[9px] text-gray-500 uppercase">Profile Done</p><p class="text-xl font-bold text-yellow-400">{{ stats.profileComplete }}</p></div>
      <div class="glass-dark rounded-lg p-3 text-center border border-neural-700/50"><p class="text-[9px] text-gray-500 uppercase">AI Active</p><p class="text-xl font-bold text-purple-400">{{ stats.agentsActive }}</p></div>
      <div class="glass-dark rounded-lg p-3 text-center border border-neural-700/50"><p class="text-[9px] text-gray-500 uppercase">Jobs Pulled</p><p class="text-xl font-bold text-blue-400">{{ stats.totalPulled }}</p></div>
    </div>

    <!-- Filters -->
    <div class="flex gap-3 mb-4 items-center">
      <div class="flex-1 relative">
        <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input v-model="searchQuery" placeholder="Search platforms..." class="w-full pl-10 pr-4 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm placeholder-gray-500 focus:border-cyber-purple focus:outline-none" />
      </div>
      <select v-model="filterType" class="px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none">
        <option value="">All Types</option>
        <option value="job_board">Job Boards</option>
        <option value="freelance">Freelance</option>
        <option value="aggregator">Aggregators</option>
      </select>
    </div>

    <!-- Platform Cards -->
    <div class="grid lg:grid-cols-2 gap-3">
      <div v-for="p in filtered" :key="p.id"
        class="glass-dark rounded-xl border border-neural-700/50 hover:border-neural-600 transition-colors cursor-pointer overflow-hidden"
        @click="viewDetail(p)">
        <div class="flex items-center justify-between px-4 py-3">
          <div class="flex items-center gap-3 min-w-0">
            <span class="text-2xl shrink-0">{{ p.icon }}</span>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-sm text-white font-medium">{{ p.name }}</p>
                <span class="px-1.5 py-0.5 rounded text-[8px] font-medium" :class="typeBg(p.type)">{{ typeLabel(p.type) }}</span>
              </div>
              <p class="text-[10px] text-gray-500 truncate">{{ p.url }}</p>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="text-sm font-bold" :class="profileColor(profileScore(p))">{{ profileScore(p) }}%</span>
            <span class="w-2 h-2 rounded-full" :class="p.agent_status === 'active' ? 'bg-green-400 animate-pulse' : p.agent_status === 'idle' ? 'bg-yellow-400' : 'bg-gray-600'" />
          </div>
        </div>
        <!-- Status bar -->
        <div class="px-4 pb-3 flex gap-3 text-[9px]">
          <span :class="p.registered ? 'text-green-400' : 'text-gray-600'">{{ p.registered ? '✓' : '○' }} Registered</span>
          <span :class="p.email_verified ? 'text-green-400' : 'text-gray-600'">{{ p.email_verified ? '✓' : '○' }} Verified</span>
          <span :class="p.gmail_connected ? 'text-green-400' : 'text-gray-600'">{{ p.gmail_connected ? '✓' : '○' }} Gmail</span>
          <span :class="p.resume_uploaded ? 'text-green-400' : 'text-gray-600'">{{ p.resume_uploaded ? '✓' : '○' }} Resume</span>
          <span :class="p.skills_added ? 'text-green-400' : 'text-gray-600'">{{ p.skills_added ? '✓' : '○' }} Skills</span>
          <span :class="p.profile_complete ? 'text-green-400' : 'text-gray-600'">{{ p.profile_complete ? '✓' : '○' }} Complete</span>
        </div>
        <!-- Progress bar -->
        <div class="h-1" :class="profileScore(p) >= 80 ? 'bg-green-500' : profileScore(p) >= 50 ? 'bg-yellow-500' : profileScore(p) >= 20 ? 'bg-orange-500' : 'bg-gray-700'" :style="{ width: profileScore(p) + '%' }" />
      </div>
    </div>

    <!-- Detail Modal -->
    <Teleport to="body">
      <div v-if="showDetail && detailPlatform" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="showDetail = false">
        <div class="glass-dark rounded-xl w-full max-w-lg border border-neural-600 max-h-[85vh] flex flex-col">
          <div class="px-6 py-4 border-b border-neural-700 shrink-0">
            <div class="flex items-center gap-3">
              <span class="text-3xl">{{ detailPlatform.icon }}</span>
              <div>
                <h3 class="text-lg font-bold text-white">{{ detailPlatform.name }}</h3>
                <p class="text-xs text-gray-400">{{ detailPlatform.url }}</p>
              </div>
              <span class="ml-auto text-2xl font-bold" :class="profileColor(profileScore(detailPlatform))">{{ profileScore(detailPlatform) }}%</span>
            </div>
          </div>
          <div class="flex-1 overflow-y-auto p-6 space-y-4">
            <!-- Profile Checklist -->
            <div class="space-y-2">
              <h4 class="text-xs text-gray-400 uppercase tracking-wider">Profile Optimization</h4>
              <div v-for="item in [
                { label: 'Account Registered', done: detailPlatform.registered },
                { label: 'Email Verified', done: detailPlatform.email_verified },
                { label: 'Gmail Connected', done: detailPlatform.gmail_connected },
                { label: 'Resume Uploaded', done: detailPlatform.resume_uploaded },
                { label: 'Skills Added', done: detailPlatform.skills_added },
                { label: 'Profile Complete', done: detailPlatform.profile_complete },
              ]" :key="item.label" class="flex items-center gap-3 px-3 py-2 rounded-lg" :class="item.done ? 'bg-green-500/10' : 'bg-neural-800/50'">
                <span class="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px]" :class="item.done ? 'border-green-500 bg-green-500 text-white' : 'border-gray-600 text-gray-600'">{{ item.done ? '✓' : '' }}</span>
                <span class="text-xs" :class="item.done ? 'text-white' : 'text-gray-500'">{{ item.label }}</span>
              </div>
            </div>

            <!-- AI Agent -->
            <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
              <h4 class="text-xs text-gray-400 uppercase tracking-wider mb-2">AI Agent</h4>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full" :class="detailPlatform.agent_status === 'active' ? 'bg-green-400 animate-pulse' : 'bg-gray-600'" />
                  <span class="text-xs text-white capitalize">{{ detailPlatform.agent_type.replace('_', ' ') }}</span>
                </div>
                <span class="text-[10px] capitalize" :class="detailPlatform.agent_status === 'active' ? 'text-green-400' : 'text-gray-500'">{{ detailPlatform.agent_status.replace('_', ' ') }}</span>
              </div>
            </div>

            <!-- Stats -->
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30 text-center">
                <p class="text-lg font-bold text-blue-400">{{ detailPlatform.jobs_pulled }}</p>
                <p class="text-[9px] text-gray-500">Jobs Pulled</p>
              </div>
              <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30 text-center">
                <p class="text-lg font-bold text-green-400">{{ detailPlatform.applications_sent }}</p>
                <p class="text-[9px] text-gray-500">Applications</p>
              </div>
            </div>

            <p v-if="detailPlatform.notes" class="text-[10px] text-gray-500">{{ detailPlatform.notes }}</p>

            <!-- Actions -->
            <div class="flex gap-2 pt-3 border-t border-neural-700">
              <a v-if="detailPlatform.login_url" :href="detailPlatform.login_url" target="_blank" class="px-4 py-2 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-xs font-medium hover:opacity-90">Login</a>
              <a v-if="detailPlatform.profile_url" :href="detailPlatform.profile_url" target="_blank" class="px-4 py-2 bg-neural-700 text-gray-300 rounded-lg text-xs hover:bg-neural-600">Edit Profile</a>
            </div>
          </div>
          <div class="px-6 py-3 border-t border-neural-700 shrink-0">
            <button @click="showDetail = false" class="w-full py-2 bg-neural-700 text-gray-300 rounded-lg text-sm hover:bg-neural-600">Close</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

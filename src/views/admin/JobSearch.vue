<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useAdminStore } from '@/stores/admin'
import type { JobListing } from '@/types/database'
import { searchJobs } from '@/utils/jobSearchAgent'
import { classifyJob, matchJob, generateCoverLetter } from '@/utils/jobClassifyAgent'

const admin = useAdminStore()

// Search
const searchQuery = ref('')
const searchLocation = ref('')
const searching = ref(false)
const searchStatus = ref('')
const searchError = ref('')

// Filters
const filterPlatform = ref('')
const filterStatus = ref('')
const filterType = ref('')
const filterWFH = ref(true) // DEFAULT: WFH only
const filterLocation = ref('')
const sortBy = ref('created_at')
const currentPage = ref(1)
const perPage = 20

// Detail modal
const showDetail = ref(false)
const detailJob = ref<JobListing | null>(null)
const detailTab = ref<'overview' | 'description' | 'match' | 'coverletter' | 'apply'>('overview')
const coverLetter = ref('')
const generatingCover = ref(false)
const researching = ref(false)
const companyResearch = ref<Record<string, unknown> | null>(null)
const draftEmail = ref('')

// Bulk
const selectedIds = ref<Set<string>>(new Set())
const selectAll = ref(false)
const scoring = ref(false)
const scoreProgress = ref('')

// Platform config with logos
const PLATFORMS: Record<string, { label: string; color: string; bg: string }> = {
  indeed: { label: 'Indeed', color: 'text-blue-400', bg: 'bg-blue-500/15' },
  linkedin: { label: 'LinkedIn', color: 'text-sky-400', bg: 'bg-sky-500/15' },
  glassdoor: { label: 'Glassdoor', color: 'text-green-400', bg: 'bg-green-500/15' },
  ziprecruiter: { label: 'ZipRecruiter', color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  google: { label: 'Google Jobs', color: 'text-red-300', bg: 'bg-red-500/15' },
  remoteok: { label: 'RemoteOK', color: 'text-teal-400', bg: 'bg-teal-500/15' },
  remotive: { label: 'Remotive', color: 'text-indigo-400', bg: 'bg-indigo-500/15' },
  himalayas: { label: 'Himalayas', color: 'text-amber-400', bg: 'bg-amber-500/15' },
  hackernews: { label: 'HN/YC', color: 'text-orange-400', bg: 'bg-orange-500/15' },
  arbeitnow: { label: 'Arbeitnow', color: 'text-pink-400', bg: 'bg-pink-500/15' },
  adzuna: { label: 'Adzuna', color: 'text-yellow-400', bg: 'bg-yellow-500/15' },
  jsearch: { label: 'JSearch', color: 'text-blue-300', bg: 'bg-blue-500/15' },
}

onMounted(() => { admin.fetchJobListings(); admin.fetchJobProfile() })

// Platform stats
const platformStats = computed(() => {
  const counts: Record<string, number> = {}
  for (const j of admin.jobListings) counts[j.platform] = (counts[j.platform] || 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
})

// Filter + paginate
const filteredJobs = computed(() => {
  let jobs = [...admin.jobListings]
  if (searchQuery.value && !searching.value) {
    const q = searchQuery.value.toLowerCase()
    jobs = jobs.filter(j => j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q) || (j.description?.toLowerCase().includes(q)))
  }
  if (filterPlatform.value) jobs = jobs.filter(j => j.platform === filterPlatform.value)
  if (filterStatus.value) jobs = jobs.filter(j => j.status === filterStatus.value)
  if (filterType.value) jobs = jobs.filter(j => j.job_type === filterType.value)
  if (filterLocation.value) jobs = jobs.filter(j => j.location?.toLowerCase().includes(filterLocation.value.toLowerCase()))
  if (filterWFH.value) {
    jobs = jobs.filter(j => {
      const text = `${j.location || ''} ${j.job_type || ''} ${j.title || ''} ${j.description || ''}`.toLowerCase()
      return text.includes('remote') || text.includes('work from home') || text.includes('wfh') || text.includes('anywhere') || text.includes('hybrid')
    })
  }
  // Sort
  if (sortBy.value === 'match_score') jobs.sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
  else if (sortBy.value === 'salary') jobs.sort((a, b) => (b.salary_max || b.salary_min || 0) - (a.salary_max || a.salary_min || 0))
  else jobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return jobs
})

const totalPages = computed(() => Math.ceil(filteredJobs.value.length / perPage))
const paginatedJobs = computed(() => filteredJobs.value.slice((currentPage.value - 1) * perPage, currentPage.value * perPage))

// Reset page on filter change
watch([filterPlatform, filterStatus, filterType, filterWFH, filterLocation, sortBy], () => { currentPage.value = 1 })

// ─── Actions ───
async function doSearch() {
  if (!searchQuery.value.trim()) return
  searching.value = true; searchError.value = ''; searchStatus.value = ''
  try {
    const { jobs, errors } = await searchJobs(
      { query: searchQuery.value, location: searchLocation.value },
      (msg) => { searchStatus.value = msg },
    )
    if (errors.length > 0 && jobs.length === 0) { searchError.value = errors.join('\n') }
    else {
      searchStatus.value = `Saving ${jobs.length} jobs...`
      let saved = 0
      for (const job of jobs) {
        try { await admin.insertRow('job_listings', job as unknown as Record<string, unknown>); saved++ } catch { /* dup */ }
      }
      await admin.fetchJobListings()
      searchStatus.value = saved > 0 ? `${saved} new jobs saved` : `${jobs.length} found (all already in DB)`
      setTimeout(() => { searchStatus.value = '' }, 3000)
    }
  } catch (e) { searchError.value = e instanceof Error ? e.message : 'Search failed' }
  finally { searching.value = false }
}

async function scoreSelected() {
  scoring.value = true
  const profile = admin.jobProfile[0] || null
  const toScore = filteredJobs.value.filter(j => selectedIds.value.has(j.id) && j.match_score === null)
  let done = 0
  for (const job of toScore) {
    scoreProgress.value = `${++done}/${toScore.length}`
    try {
      const cl = await classifyJob(job.title, job.company, job.description || undefined)
      const mt = await matchJob({ title: job.title, company: job.company, description: job.description, requirements: job.requirements }, { resume_text: profile?.resume_text, skills: profile?.skills })
      await admin.updateRow('job_listings', job.id, { match_score: mt.match_score, raw_data: { ...(job.raw_data as Record<string, unknown> || {}), role_type: cl.role_type, company_bucket: cl.company_bucket, skill_matches: mt.skill_matches, skill_gaps: mt.skill_gaps, recommendation: mt.recommendation } })
    } catch { /* skip */ }
  }
  await admin.fetchJobListings()
  scoring.value = false; scoreProgress.value = ''; selectedIds.value.clear(); selectAll.value = false
}

async function bulkDismiss() {
  for (const id of selectedIds.value) await admin.updateRow('job_listings', id, { status: 'dismissed' })
  selectedIds.value.clear(); selectAll.value = false; await admin.fetchJobListings()
}

async function deleteJob(job: JobListing) {
  if (confirm(`Remove "${job.title}"?`)) { await admin.deleteRow('job_listings', job.id); await admin.fetchJobListings() }
}

function toggleSelect(id: string) { selectedIds.value.has(id) ? selectedIds.value.delete(id) : selectedIds.value.add(id) }
function toggleSelectAll() {
  if (selectAll.value) { selectedIds.value.clear(); selectAll.value = false }
  else { paginatedJobs.value.forEach(j => selectedIds.value.add(j.id)); selectAll.value = true }
}

// ─── Detail Modal ───
// Apply method detection
function applyMethod(job: JobListing): { method: string; color: string; icon: string; needsRegistration: boolean } {
  const url = (job.url || '').toLowerCase()
  const plat = job.platform.toLowerCase()
  if (url.includes('linkedin.com')) return { method: 'LinkedIn Apply', color: 'text-sky-400', icon: '🟦', needsRegistration: true }
  if (url.includes('indeed.com') || plat === 'indeed') return { method: 'Indeed Apply', color: 'text-blue-400', icon: '🔵', needsRegistration: true }
  if (url.includes('glassdoor.com')) return { method: 'Glassdoor Apply', color: 'text-green-400', icon: '🟢', needsRegistration: true }
  if (url.includes('ziprecruiter.com')) return { method: 'ZipRecruiter Apply', color: 'text-emerald-400', icon: '🟩', needsRegistration: true }
  if (plat === 'hackernews') return { method: 'Email / HN Post', color: 'text-orange-400', icon: '📧', needsRegistration: false }
  if (url.includes('mailto:')) return { method: 'Direct Email', color: 'text-cyan-400', icon: '📧', needsRegistration: false }
  if (url.includes('careers') || url.includes('jobs') || url.includes('apply')) return { method: 'Company Career Page', color: 'text-purple-400', icon: '🏢', needsRegistration: false }
  return { method: 'External Site', color: 'text-gray-400', icon: '🌐', needsRegistration: false }
}

// Research company
async function researchCompany(job: JobListing) {
  researching.value = true; companyResearch.value = null
  const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
  try {
    const res = await fetch(`${mcpUrl}/api/jobs/research`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: job.company, title: job.title }),
      signal: AbortSignal.timeout(30000),
    })
    if (res.ok) companyResearch.value = await res.json()
  } catch { /* research unavailable */ }
  researching.value = false
}

// Draft application email
async function draftApplicationEmail(job: JobListing) {
  if (coverLetter.value) {
    draftEmail.value = `Subject: Application for ${job.title} — Gabriel Alvin Aquino\n\nDear ${job.company} Hiring Team,\n\n${coverLetter.value}\n\nBest regards,\nGabriel Alvin Aquino\nAI Systems Engineer\nhttps://neuralyx.ai.dev-environment.site`
  }
}

function viewDetail(job: JobListing) {
  detailJob.value = job; detailTab.value = 'overview'; coverLetter.value = ''; companyResearch.value = null; draftEmail.value = ''
  showDetail.value = true
  autoGenCoverLetter(job)
  researchCompany(job) // Auto-research in background
}

async function autoGenCoverLetter(job: JobListing) {
  generatingCover.value = true
  const profile = admin.jobProfile[0] || null
  try {
    coverLetter.value = await generateCoverLetter(
      { title: job.title, company: job.company, description: job.description },
      { resume_text: profile?.resume_text, skills: profile?.skills },
      rd(job, 'role_type'), rd(job, 'company_bucket'),
    )
  } catch { coverLetter.value = '' }
  generatingCover.value = false
}

function copyText(text: string) { globalThis.navigator.clipboard.writeText(text) }

// ─── Helpers ───
function p(platform: string) { return PLATFORMS[platform] || { label: platform, color: 'text-gray-400', bg: 'bg-gray-500/15' } }
function rd(job: JobListing, key: string) { return ((job.raw_data as Record<string, unknown>)?.[key] as string) || '' }

function formatSalary(j: JobListing) {
  if (!j.salary_min && !j.salary_max) return '—'
  const f = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n)
  if (j.salary_min && j.salary_max) return `${j.salary_currency} ${f(j.salary_min)}-${f(j.salary_max)}`
  return `${j.salary_currency} ${f(j.salary_min || j.salary_max || 0)}+`
}

function timeAgo(d: string | null) {
  if (!d) return '—'
  const diff = Date.now() - new Date(d).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function matchColor(score: number | null) {
  if (!score) return 'text-gray-600'
  if (score >= 80) return 'text-green-400'
  if (score >= 60) return 'text-yellow-400'
  if (score >= 40) return 'text-orange-400'
  return 'text-red-400'
}
</script>

<template>
  <div>
    <!-- Search Bar -->
    <div class="glass-dark rounded-xl p-4 border border-neural-700/50 mb-5">
      <form @submit.prevent="doSearch" class="flex gap-3">
        <div class="flex-1 relative">
          <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input v-model="searchQuery" placeholder="AI Engineer, Vue Developer, Python..."
            class="w-full pl-10 pr-4 py-2.5 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm placeholder-gray-500 focus:border-cyber-purple focus:outline-none" />
        </div>
        <input v-model="searchLocation" placeholder="Philippines, Remote..." class="w-40 px-3 py-2.5 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm placeholder-gray-500 focus:border-cyber-purple focus:outline-none" />
        <button type="submit" :disabled="searching || !searchQuery.trim()"
          class="px-5 py-2.5 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40 flex items-center gap-2 shrink-0">
          <svg v-if="!searching" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <svg v-else class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          {{ searching ? 'Searching...' : 'Pull Jobs' }}
        </button>
      </form>
      <p v-if="searchStatus" class="text-xs text-cyan-400 mt-2">{{ searchStatus }}</p>
      <p v-if="searchError" class="text-xs text-red-400 mt-2">{{ searchError }}</p>
    </div>

    <!-- Platform Pills -->
    <div class="flex flex-wrap gap-1.5 mb-4">
      <button @click="filterPlatform = ''" class="px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors"
        :class="filterPlatform === '' ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-neural-700/50 text-gray-500 hover:text-gray-300'">
        All ({{ admin.jobListings.length }})
      </button>
      <button v-for="[plat, count] in platformStats" :key="plat" @click="filterPlatform = filterPlatform === plat ? '' : plat"
        class="px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors capitalize flex items-center gap-1"
        :class="filterPlatform === plat ? p(plat).bg + ' ' + p(plat).color : 'bg-neural-700/50 text-gray-500 hover:text-gray-300'">
        {{ p(plat).label }} ({{ count }})
      </button>
    </div>

    <!-- Filters Row -->
    <div class="flex flex-wrap gap-2 mb-4 items-center">
      <select v-model="filterStatus" class="px-2.5 py-1.5 bg-neural-800 border border-neural-600 rounded-lg text-white text-[11px] focus:border-cyber-purple focus:outline-none">
        <option value="">All Status</option>
        <option value="new">New</option><option value="saved">Saved</option><option value="applied">Applied</option><option value="dismissed">Dismissed</option>
      </select>
      <select v-model="sortBy" class="px-2.5 py-1.5 bg-neural-800 border border-neural-600 rounded-lg text-white text-[11px] focus:border-cyber-purple focus:outline-none">
        <option value="created_at">Newest</option><option value="match_score">Best Match</option><option value="salary">Highest Salary</option>
      </select>
      <label class="flex items-center gap-1.5 cursor-pointer px-2.5 py-1.5 rounded-lg transition-colors" :class="filterWFH ? 'bg-green-500/15 text-green-400' : 'bg-neural-700/50 text-gray-500'">
        <input type="checkbox" v-model="filterWFH" class="rounded border-neural-600 bg-neural-800 text-green-500 focus:ring-green-500 w-3 h-3" />
        <span class="text-[11px] font-medium">WFH Only</span>
      </label>
      <div class="ml-auto flex items-center gap-2 text-[10px] text-gray-500">
        <span>{{ filteredJobs.length }} jobs</span>
        <span v-if="totalPages > 1">· Page {{ currentPage }}/{{ totalPages }}</span>
      </div>
    </div>

    <!-- Bulk Actions -->
    <div v-if="selectedIds.size > 0" class="flex items-center gap-3 mb-3 px-3 py-2 bg-cyber-purple/10 border border-cyber-purple/20 rounded-lg">
      <span class="text-xs text-cyber-purple font-medium">{{ selectedIds.size }} selected</span>
      <button @click="scoreSelected" :disabled="scoring" class="px-2.5 py-1 bg-yellow-500/20 text-yellow-400 rounded text-[10px] font-medium hover:bg-yellow-500/30 disabled:opacity-50">{{ scoring ? `Scoring ${scoreProgress}` : '🎯 AI Score' }}</button>
      <button @click="bulkDismiss" class="px-2.5 py-1 bg-red-500/20 text-red-400 rounded text-[10px] font-medium hover:bg-red-500/30">Dismiss</button>
      <button @click="selectedIds.clear(); selectAll = false" class="text-[10px] text-gray-500 hover:text-white ml-auto">Clear</button>
    </div>

    <!-- Empty -->
    <div v-if="filteredJobs.length === 0" class="text-center py-16 glass-dark rounded-xl border border-neural-700/50">
      <div class="text-4xl mb-3">💼</div>
      <h3 class="text-lg font-semibold text-white mb-2">{{ admin.jobListings.length === 0 ? 'No jobs yet' : 'No matches' }}</h3>
      <p class="text-gray-500 text-sm">{{ admin.jobListings.length === 0 ? 'Search above to pull jobs from 8+ platforms.' : 'Try adjusting your filters.' }}</p>
    </div>

    <!-- Jobs Table -->
    <div v-else class="glass-dark rounded-xl overflow-hidden border border-neural-700/50">
      <table class="w-full text-sm">
        <thead class="bg-neural-700/40">
          <tr>
            <th class="px-2 py-2.5 w-8"><input type="checkbox" :checked="selectAll" @change="toggleSelectAll" class="rounded border-neural-600 bg-neural-800 text-cyber-purple focus:ring-cyber-purple w-3 h-3" /></th>
            <th class="text-left px-2 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Job</th>
            <th class="text-left px-2 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Where</th>
            <th class="text-left px-2 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Salary</th>
            <th class="text-left px-2 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Source</th>
            <th class="text-center px-2 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Match</th>
            <th class="text-left px-2 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Posted</th>
            <th class="text-right px-2 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="job in paginatedJobs" :key="job.id"
            class="border-t border-neural-700/30 hover:bg-neural-700/20 transition-colors cursor-pointer"
            :class="selectedIds.has(job.id) ? 'bg-cyber-purple/5' : ''"
            @click="viewDetail(job)">
            <td class="px-2 py-2" @click.stop><input type="checkbox" :checked="selectedIds.has(job.id)" @change="toggleSelect(job.id)" class="rounded border-neural-600 bg-neural-800 text-cyber-purple focus:ring-cyber-purple w-3 h-3" /></td>
            <td class="px-2 py-2">
              <p class="text-white font-medium text-xs truncate max-w-[240px]">{{ job.title }}</p>
              <p class="text-[10px] text-gray-500">{{ job.company }}</p>
            </td>
            <td class="px-2 py-2 text-[10px] text-gray-400 max-w-[100px] truncate">{{ job.location || 'Remote' }}</td>
            <td class="px-2 py-2 text-[10px] whitespace-nowrap" :class="job.salary_min ? 'text-green-400' : 'text-gray-600'">{{ formatSalary(job) }}</td>
            <td class="px-2 py-2"><span class="px-1.5 py-0.5 rounded text-[9px] font-medium capitalize" :class="p(job.platform).bg + ' ' + p(job.platform).color">{{ p(job.platform).label }}</span></td>
            <td class="px-2 py-2 text-center"><span class="text-xs font-bold" :class="matchColor(job.match_score)">{{ job.match_score ? job.match_score + '%' : '—' }}</span></td>
            <td class="px-2 py-2 text-[10px] text-gray-500">{{ timeAgo(job.posted_at || job.created_at) }}</td>
            <td class="px-2 py-2 text-right" @click.stop>
              <div class="flex items-center justify-end gap-0.5">
                <a v-if="job.url" :href="job.url" target="_blank" class="p-1 rounded hover:bg-neural-600 text-gray-500 hover:text-cyber-cyan transition-colors" title="Open">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
                <button @click="deleteJob(job)" class="p-1 rounded hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors" title="Remove">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-between mt-4">
      <p class="text-[10px] text-gray-500">{{ (currentPage - 1) * perPage + 1 }}-{{ Math.min(currentPage * perPage, filteredJobs.length) }} of {{ filteredJobs.length }}</p>
      <div class="flex items-center gap-1">
        <button @click="currentPage--" :disabled="currentPage === 1" class="px-2.5 py-1 rounded text-xs bg-neural-700 text-gray-400 hover:text-white disabled:opacity-30">&larr;</button>
        <template v-for="pg in totalPages" :key="pg">
          <button v-if="pg === 1 || pg === totalPages || Math.abs(pg - currentPage) <= 1" @click="currentPage = pg"
            class="w-7 h-7 rounded text-[10px] font-medium" :class="pg === currentPage ? 'bg-cyber-purple/20 text-cyber-purple' : 'text-gray-500 hover:text-white'">{{ pg }}</button>
          <span v-else-if="pg === currentPage - 2 || pg === currentPage + 2" class="text-gray-600 text-[10px]">...</span>
        </template>
        <button @click="currentPage++" :disabled="currentPage === totalPages" class="px-2.5 py-1 rounded text-xs bg-neural-700 text-gray-400 hover:text-white disabled:opacity-30">&rarr;</button>
      </div>
    </div>

    <!-- ═══ Detail Modal ═══ -->
    <Teleport to="body">
      <div v-if="showDetail && detailJob" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="showDetail = false">
        <div class="glass-dark rounded-xl w-full max-w-3xl border border-neural-600 max-h-[90vh] flex flex-col">
          <!-- Header -->
          <div class="px-6 py-4 border-b border-neural-700 shrink-0">
            <div class="flex items-center justify-between">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="px-2 py-0.5 rounded text-[10px] font-medium capitalize" :class="p(detailJob.platform).bg + ' ' + p(detailJob.platform).color">{{ p(detailJob.platform).label }}</span>
                  <span v-if="detailJob.match_score" class="px-2 py-0.5 rounded-full text-xs font-bold" :class="detailJob.match_score >= 75 ? 'bg-green-500/20 text-green-400' : detailJob.match_score >= 50 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-500/20 text-gray-400'">{{ detailJob.match_score }}% match</span>
                  <span v-if="detailJob.job_type" class="px-2 py-0.5 rounded text-[10px] bg-neural-700/50 text-gray-300 capitalize">{{ detailJob.job_type }}</span>
                </div>
                <h3 class="text-lg font-bold text-white">{{ detailJob.title }}</h3>
                <p class="text-sm text-gray-400">{{ detailJob.company }} · {{ detailJob.location || 'Remote' }} · {{ timeAgo(detailJob.posted_at || detailJob.created_at) }}</p>
              </div>
              <button @click="showDetail = false" class="p-2 rounded-lg hover:bg-neural-600 text-gray-400 hover:text-white shrink-0 ml-3"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div class="flex gap-1 mt-3">
              <button v-for="tab in [{key:'overview',label:'Overview'},{key:'description',label:'Job Details'},{key:'match',label:'Match Analysis'},{key:'coverletter',label:'Cover Letter'},{key:'apply',label:'How to Apply'}]" :key="tab.key"
                @click="detailTab = tab.key as any"
                class="px-3 py-1.5 rounded-t-lg text-xs font-medium transition-colors"
                :class="detailTab === tab.key ? 'bg-neural-800 text-white border-t border-x border-neural-600' : 'text-gray-500 hover:text-gray-300'">
                {{ tab.label }}
              </button>
            </div>
          </div>

          <!-- Tab Content -->
          <div class="flex-1 overflow-y-auto p-6">
            <!-- Overview -->
            <div v-if="detailTab === 'overview'" class="space-y-4">
              <div class="grid grid-cols-2 gap-3">
                <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30"><p class="text-[10px] text-gray-500 uppercase mb-1">Salary</p><p class="text-sm font-medium" :class="detailJob.salary_min ? 'text-green-400' : 'text-gray-500'">{{ formatSalary(detailJob) }}</p></div>
                <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30"><p class="text-[10px] text-gray-500 uppercase mb-1">Type</p><p class="text-sm font-medium text-white capitalize">{{ detailJob.job_type || '—' }}</p></div>
                <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30"><p class="text-[10px] text-gray-500 uppercase mb-1">Role</p><p class="text-sm font-medium text-violet-400 capitalize">{{ rd(detailJob, 'role_type')?.replace('_', ' ') || 'Not classified' }}</p></div>
                <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30"><p class="text-[10px] text-gray-500 uppercase mb-1">Company Type</p><p class="text-sm font-medium text-cyan-400 capitalize">{{ rd(detailJob, 'company_bucket')?.replace('_', ' ') || 'Not classified' }}</p></div>
                <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30"><p class="text-[10px] text-gray-500 uppercase mb-1">Posted</p><p class="text-sm font-medium text-white">{{ detailJob.posted_at ? new Date(detailJob.posted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—' }}</p></div>
                <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30"><p class="text-[10px] text-gray-500 uppercase mb-1">Source</p><p class="text-sm font-medium capitalize" :class="p(detailJob.platform).color">{{ p(detailJob.platform).label }}</p></div>
              </div>
              <!-- Apply Method Banner -->
              <div class="p-3 rounded-lg border" :class="applyMethod(detailJob).needsRegistration ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-green-500/10 border-green-500/20'">
                <div class="flex items-center gap-2">
                  <span>{{ applyMethod(detailJob).icon }}</span>
                  <span class="text-sm font-medium" :class="applyMethod(detailJob).color">{{ applyMethod(detailJob).method }}</span>
                  <span v-if="applyMethod(detailJob).needsRegistration" class="px-2 py-0.5 rounded text-[10px] bg-yellow-500/20 text-yellow-400">Account Required</span>
                  <span v-else class="px-2 py-0.5 rounded text-[10px] bg-green-500/20 text-green-400">Direct Apply</span>
                </div>
                <p class="text-[10px] text-gray-500 mt-1">{{ applyMethod(detailJob).needsRegistration ? 'You need to register/login on this platform before applying' : 'You can apply directly on the company website or via email' }}</p>
              </div>
              <!-- Company Research (auto-loaded) -->
              <div v-if="companyResearch && (companyResearch as any).ai_summary" class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                <p class="text-[10px] text-gray-500 uppercase mb-1">Company Intel</p>
                <p class="text-xs text-gray-300">{{ (companyResearch as any).ai_summary?.summary || 'Researching...' }}</p>
                <div v-if="(companyResearch as any).ai_summary?.tech_stack?.length" class="flex flex-wrap gap-1 mt-2">
                  <span v-for="t in (companyResearch as any).ai_summary.tech_stack" :key="t" class="px-1.5 py-0.5 rounded text-[9px] bg-neural-700/50 text-gray-400">{{ t }}</span>
                </div>
              </div>
              <div v-else-if="researching" class="text-[10px] text-gray-500 flex items-center gap-1.5">
                <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                Researching company...
              </div>
              <div class="flex gap-3 pt-3 border-t border-neural-700">
                <a v-if="detailJob.url" :href="detailJob.url" target="_blank" class="px-4 py-2 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-sm font-medium hover:opacity-90 flex items-center gap-1.5">
                  View on {{ p(detailJob.platform).label }} <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
                <button @click="detailTab = 'apply'" class="px-4 py-2 bg-neural-700 text-gray-300 rounded-lg text-sm hover:bg-neural-600">How to Apply</button>
              </div>
            </div>

            <!-- Job Details -->
            <div v-if="detailTab === 'description'" class="space-y-4">
              <div v-if="detailJob.description" class="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap max-h-[50vh] overflow-y-auto">{{ detailJob.description }}</div>
              <div v-else class="text-center py-8 text-gray-500 text-sm">No description pulled. <a v-if="detailJob.url" :href="detailJob.url" target="_blank" class="text-cyber-cyan hover:underline">View on {{ p(detailJob.platform).label }}</a></div>
              <div v-if="detailJob.requirements" class="pt-4 border-t border-neural-700">
                <h4 class="text-sm font-semibold text-white mb-2">Requirements</h4>
                <div class="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">{{ detailJob.requirements }}</div>
              </div>
            </div>

            <!-- Match Analysis -->
            <div v-if="detailTab === 'match'" class="space-y-4">
              <div v-if="detailJob.match_score" class="text-center py-4">
                <div class="text-5xl font-bold mb-1" :class="matchColor(detailJob.match_score)">{{ detailJob.match_score }}%</div>
                <p class="text-sm text-gray-400 capitalize">{{ rd(detailJob, 'recommendation')?.replace('_', ' ') || 'Match Score' }}</p>
              </div>
              <div v-else class="text-center py-6">
                <p class="text-gray-500 text-sm mb-3">Not scored yet — AI is analyzing...</p>
              </div>
              <div v-if="(detailJob.raw_data as any)?.skill_matches?.length" class="bg-neural-800/50 rounded-lg p-4 border border-green-500/20">
                <h4 class="text-xs text-green-400 font-semibold mb-2 uppercase">What You Can Provide</h4>
                <div class="flex flex-wrap gap-1.5">
                  <span v-for="s in (detailJob.raw_data as any).skill_matches" :key="s" class="px-2.5 py-1 rounded-full text-xs bg-green-500/10 text-green-400 border border-green-500/20">{{ s }}</span>
                </div>
              </div>
              <div v-if="(detailJob.raw_data as any)?.skill_gaps?.length" class="bg-neural-800/50 rounded-lg p-4 border border-red-500/20">
                <h4 class="text-xs text-red-400 font-semibold mb-2 uppercase">Skills to Develop</h4>
                <div class="flex flex-wrap gap-1.5">
                  <span v-for="s in (detailJob.raw_data as any).skill_gaps" :key="s" class="px-2.5 py-1 rounded-full text-xs bg-red-500/10 text-red-400 border border-red-500/20">{{ s }}</span>
                </div>
              </div>
            </div>

            <!-- Cover Letter -->
            <div v-if="detailTab === 'coverletter'">
              <div v-if="generatingCover" class="text-center py-8">
                <svg class="w-6 h-6 animate-spin mx-auto mb-3 text-cyber-purple" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                <p class="text-sm text-gray-400">Generating tailored cover letter...</p>
              </div>
              <div v-else-if="coverLetter">
                <div class="flex items-center justify-between mb-3">
                  <h4 class="text-sm font-semibold text-white">Tailored Cover Letter</h4>
                  <div class="flex gap-2">
                    <button @click="copyText(coverLetter)" class="px-3 py-1 bg-neural-700 text-gray-300 rounded text-[10px] hover:bg-neural-600">Copy</button>
                    <button @click="coverLetter = ''; autoGenCoverLetter(detailJob!)" class="px-3 py-1 bg-neural-700 text-gray-300 rounded text-[10px] hover:bg-neural-600">Regenerate</button>
                  </div>
                </div>
                <div class="bg-neural-800/50 rounded-lg p-5 border border-neural-700/30 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{{ coverLetter }}</div>
              </div>
              <div v-else class="text-center py-8 text-gray-500 text-sm">Cover letter generation requires AI (GPT/Gemini). Check your API keys.</div>
            </div>

            <!-- How to Apply Tab -->
            <div v-if="detailTab === 'apply'" class="space-y-4">
              <div class="p-4 rounded-lg border" :class="applyMethod(detailJob).needsRegistration ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-green-500/10 border-green-500/20'">
                <div class="flex items-center gap-3 mb-2">
                  <span class="text-2xl">{{ applyMethod(detailJob).icon }}</span>
                  <div>
                    <p class="text-sm font-medium" :class="applyMethod(detailJob).color">{{ applyMethod(detailJob).method }}</p>
                    <p class="text-[10px] text-gray-500">{{ applyMethod(detailJob).needsRegistration ? 'Platform account required — register first' : 'No registration needed — apply directly' }}</p>
                  </div>
                </div>
              </div>
              <!-- Steps -->
              <div class="bg-neural-800/50 rounded-lg p-4 border border-neural-700/30">
                <h4 class="text-xs text-white font-semibold mb-3 uppercase tracking-wider">Steps to Apply</h4>
                <div class="space-y-2.5">
                  <div class="flex items-start gap-3"><span class="w-5 h-5 rounded-full bg-cyber-purple/20 text-cyber-purple text-[10px] font-bold flex items-center justify-center shrink-0">1</span><p class="text-xs text-gray-300">Review match analysis + job details</p></div>
                  <div class="flex items-start gap-3"><span class="w-5 h-5 rounded-full bg-cyber-purple/20 text-cyber-purple text-[10px] font-bold flex items-center justify-center shrink-0">2</span><p class="text-xs text-gray-300">{{ applyMethod(detailJob).needsRegistration ? 'Login/register at ' + applyMethod(detailJob).method.split(' ')[0] : 'Copy your tailored cover letter from the Cover Letter tab' }}</p></div>
                  <div class="flex items-start gap-3"><span class="w-5 h-5 rounded-full bg-cyber-purple/20 text-cyber-purple text-[10px] font-bold flex items-center justify-center shrink-0">3</span><p class="text-xs text-gray-300">{{ applyMethod(detailJob).needsRegistration ? 'Apply through the platform' : 'Apply on company site or send email with cover letter' }}</p></div>
                  <div class="flex items-start gap-3"><span class="w-5 h-5 rounded-full bg-green-500/20 text-green-400 text-[10px] font-bold flex items-center justify-center shrink-0">4</span><p class="text-xs text-gray-300">Update status in Applications tracker</p></div>
                </div>
              </div>
              <!-- Company Research -->
              <div v-if="companyResearch && (companyResearch as any).ai_summary" class="bg-neural-800/50 rounded-lg p-4 border border-neural-700/30">
                <h4 class="text-xs text-white font-semibold mb-2 uppercase tracking-wider">Company Research</h4>
                <p class="text-xs text-gray-300 mb-2">{{ (companyResearch as any).ai_summary?.summary }}</p>
                <div v-if="(companyResearch as any).ai_summary?.tech_stack?.length" class="flex flex-wrap gap-1 mb-2">
                  <span v-for="t in (companyResearch as any).ai_summary.tech_stack" :key="t" class="px-1.5 py-0.5 rounded text-[9px] bg-neural-700/50 text-gray-400">{{ t }}</span>
                </div>
                <p v-if="(companyResearch as any).ai_summary?.glassdoor_sentiment" class="text-[10px]">
                  Glassdoor: <span :class="(companyResearch as any).ai_summary.glassdoor_sentiment === 'positive' ? 'text-green-400' : 'text-yellow-400'">{{ (companyResearch as any).ai_summary.glassdoor_sentiment }}</span>
                </p>
              </div>
              <div v-else-if="researching" class="text-[10px] text-gray-500 flex items-center gap-1.5"><svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Researching {{ detailJob.company }}...</div>
              <!-- Draft Email -->
              <div class="bg-neural-800/50 rounded-lg p-4 border border-neural-700/30">
                <div class="flex items-center justify-between mb-2">
                  <h4 class="text-xs text-white font-semibold uppercase tracking-wider">Application Email</h4>
                  <button v-if="!draftEmail && coverLetter" @click="draftApplicationEmail(detailJob)" class="px-3 py-1 bg-neural-700 text-gray-300 rounded text-[10px] hover:bg-neural-600">Generate</button>
                  <button v-if="draftEmail" @click="copyText(draftEmail)" class="px-3 py-1 bg-green-500/20 text-green-400 rounded text-[10px] hover:bg-green-500/30">Copy Email</button>
                </div>
                <div v-if="draftEmail" class="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap bg-neural-900 rounded p-3 max-h-[200px] overflow-y-auto font-mono">{{ draftEmail }}</div>
                <p v-else class="text-[10px] text-gray-500">{{ generatingCover ? 'Generating cover letter...' : coverLetter ? 'Click Generate to create application email' : 'Waiting for cover letter...' }}</p>
              </div>
              <!-- Action Buttons -->
              <div class="flex gap-3 pt-3 border-t border-neural-700">
                <a v-if="detailJob.url" :href="detailJob.url" target="_blank" class="px-4 py-2 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-sm font-medium hover:opacity-90 flex items-center gap-1.5">
                  Open Application Page <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              </div>
            </div>

          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'
import type { JobListing } from '@/types/database'
import { searchJobs } from '@/utils/jobSearchAgent'

const admin = useAdminStore()

// Search
const searchQuery = ref('')
const searchLocation = ref('')
const searchType = ref('')
const searchPlatform = ref('')
const searching = ref(false)
const searchError = ref('')
const searchStatus = ref('')

// Filters for cached results
const filterStatus = ref('')
const sortBy = ref('created_at')

// Detail modal
const showDetail = ref(false)
const detailJob = ref<JobListing | null>(null)

const PLATFORMS = [
  { id: 'linkedin', label: 'LinkedIn', icon: '🟦' },
  { id: 'indeed', label: 'Indeed', icon: '🔵' },
  { id: 'glassdoor', label: 'Glassdoor', icon: '🟢' },
  { id: 'remoteok', label: 'RemoteOK', icon: '🌍' },
  { id: 'remotive', label: 'Remotive', icon: '🏠' },
  { id: 'himalayas', label: 'Himalayas', icon: '⛰️' },
  { id: 'hackernews', label: 'HN/YC Jobs', icon: '🟧' },
  { id: 'arbeitnow', label: 'Arbeitnow', icon: '🇪🇺' },
  { id: 'ziprecruiter', label: 'ZipRecruiter', icon: '🟩' },
  { id: 'google', label: 'Google Jobs', icon: '🔴' },
  { id: 'adzuna', label: 'Adzuna', icon: '🔶' },
  { id: 'jobstreet', label: 'JobStreet', icon: '🟣' },
]
const JOB_TYPES = ['full-time', 'part-time', 'contract', 'remote', 'hybrid', 'internship']

onMounted(() => admin.fetchJobListings())

const displayJobs = computed(() => {
  let jobs = [...admin.jobListings]
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    jobs = jobs.filter(j => j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q) || (j.description?.toLowerCase().includes(q)))
  }
  if (searchPlatform.value) jobs = jobs.filter(j => j.platform === searchPlatform.value)
  if (searchType.value) jobs = jobs.filter(j => j.job_type === searchType.value)
  if (searchLocation.value) {
    const l = searchLocation.value.toLowerCase()
    jobs = jobs.filter(j => j.location?.toLowerCase().includes(l))
  }
  if (filterStatus.value) jobs = jobs.filter(j => j.status === filterStatus.value)
  // Sort
  if (sortBy.value === 'match_score') jobs.sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
  else if (sortBy.value === 'salary') jobs.sort((a, b) => (b.salary_max || b.salary_min || 0) - (a.salary_max || a.salary_min || 0))
  else jobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return jobs
})

async function doSearch() {
  if (!searchQuery.value.trim()) return
  searching.value = true
  searchError.value = ''
  searchStatus.value = ''

  try {
    const { jobs, errors } = await searchJobs(
      { query: searchQuery.value, location: searchLocation.value, job_type: searchType.value, platform: searchPlatform.value },
      (msg) => { searchStatus.value = msg },
    )

    if (errors.length > 0 && jobs.length === 0) {
      searchError.value = errors.join('\n')
    } else {
      // Save results to Supabase
      searchStatus.value = `Saving ${jobs.length} jobs to database...`
      let saved = 0
      for (const job of jobs) {
        try {
          await admin.insertRow('job_listings', job as unknown as Record<string, unknown>)
          saved++
        } catch { /* duplicate or error */ }
      }
      await admin.fetchJobListings()
      searchStatus.value = saved > 0 ? `Saved ${saved} new jobs` : `Found ${jobs.length} jobs (all already in database)`
      setTimeout(() => { searchStatus.value = '' }, 3000)
    }
  } catch (e) {
    searchError.value = e instanceof Error ? e.message : 'Search failed'
  } finally {
    searching.value = false
  }
}

async function saveJob(job: JobListing) {
  await admin.updateRow('job_listings', job.id, { status: 'saved' })
  await admin.fetchJobListings()
}

async function dismissJob(job: JobListing) {
  await admin.updateRow('job_listings', job.id, { status: 'dismissed' })
  await admin.fetchJobListings()
}

async function applyToJob(job: JobListing) {
  await admin.insertRow('job_applications', {
    job_listing_id: job.id, platform: job.platform,
    channel: 'direct', status: 'applied', applied_via: 'manual',
  })
  await admin.updateRow('job_listings', job.id, { status: 'applied' })
  await Promise.all([admin.fetchJobListings(), admin.fetchJobApplications()])
}

async function deleteJob(job: JobListing) {
  if (confirm(`Remove "${job.title}" from ${job.company}?`)) {
    await admin.deleteRow('job_listings', job.id)
    await admin.fetchJobListings()
  }
}

function viewDetail(job: JobListing) { detailJob.value = job; showDetail.value = true }

function platformColor(p: string) {
  const c: Record<string, string> = {
    indeed: 'bg-blue-500/15 text-blue-400', linkedin: 'bg-sky-500/15 text-sky-400',
    glassdoor: 'bg-green-500/15 text-green-400', ziprecruiter: 'bg-emerald-500/15 text-emerald-400',
    google: 'bg-red-500/15 text-red-300', jobstreet: 'bg-purple-500/15 text-purple-400',
    onlinejobs: 'bg-orange-500/15 text-orange-400', bossjob: 'bg-yellow-500/15 text-yellow-400',
    kalibrr: 'bg-cyan-500/15 text-cyan-400', bestjobs: 'bg-pink-500/15 text-pink-400',
    facebook: 'bg-indigo-500/15 text-indigo-400',
  }
  return c[p] || 'bg-gray-500/15 text-gray-400'
}

function formatSalary(j: JobListing) {
  if (!j.salary_min && !j.salary_max) return '—'
  const f = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n)
  if (j.salary_min && j.salary_max) return `${j.salary_currency} ${f(j.salary_min)}-${f(j.salary_max)}`
  return `${j.salary_currency} ${f(j.salary_min || j.salary_max || 0)}+`
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold text-white mb-6">Job Search</h2>

    <!-- Search Form -->
    <div class="glass-dark rounded-xl p-5 border border-neural-700/50 mb-6">
      <form @submit.prevent="doSearch" class="space-y-3">
        <div class="flex flex-wrap gap-3">
          <div class="flex-1 min-w-[200px] relative">
            <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input v-model="searchQuery" placeholder="AI Engineer, Vue Developer, DevOps..."
              class="w-full pl-10 pr-4 py-2.5 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm placeholder-gray-500 focus:border-cyber-purple focus:outline-none" />
          </div>
          <div class="w-44">
            <input v-model="searchLocation" placeholder="Location..." class="w-full px-3 py-2.5 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm placeholder-gray-500 focus:border-cyber-purple focus:outline-none" />
          </div>
          <button type="submit" :disabled="searching || !searchQuery.trim()"
            class="px-6 py-2.5 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40 flex items-center gap-2 shrink-0">
            <svg v-if="!searching" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <svg v-else class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            {{ searching ? 'Searching...' : 'Search' }}
          </button>
        </div>
        <!-- Platform Pills -->
        <div class="flex flex-wrap gap-1.5">
          <button type="button" @click="searchPlatform = searchPlatform === '' ? '' : ''"
            class="px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors"
            :class="searchPlatform === '' ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-neural-700/50 text-gray-500 hover:text-gray-300'">All</button>
          <button v-for="p in PLATFORMS" :key="p.id" type="button" @click="searchPlatform = searchPlatform === p.id ? '' : p.id"
            class="px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors flex items-center gap-1"
            :class="searchPlatform === p.id ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-neural-700/50 text-gray-500 hover:text-gray-300'">
            <span>{{ p.icon }}</span>{{ p.label }}
          </button>
        </div>
        <!-- Filters row -->
        <div class="flex gap-3">
          <select v-model="searchType" class="px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none">
            <option value="">All Types</option>
            <option v-for="t in JOB_TYPES" :key="t" :value="t">{{ t }}</option>
          </select>
          <select v-model="filterStatus" class="px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none">
            <option value="">All Status</option>
            <option value="new">New</option>
            <option value="saved">Saved</option>
            <option value="applied">Applied</option>
            <option value="dismissed">Dismissed</option>
          </select>
          <select v-model="sortBy" class="px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none">
            <option value="created_at">Newest</option>
            <option value="match_score">Best Match</option>
            <option value="salary">Highest Salary</option>
          </select>
          <span class="flex items-center text-[10px] text-gray-500 ml-auto">{{ displayJobs.length }} results</span>
        </div>
      </form>
      <p v-if="searchStatus" class="text-xs text-blue-400 mt-2">{{ searchStatus }}</p>
      <p v-if="searchError" class="text-xs text-red-400 mt-2">{{ searchError }}</p>
    </div>

    <!-- Results -->
    <div v-if="displayJobs.length === 0" class="text-center py-16 glass-dark rounded-xl border border-neural-700/50">
      <div class="text-4xl mb-3">🔍</div>
      <h3 class="text-lg font-semibold text-white mb-2">No jobs found</h3>
      <p class="text-gray-500 text-sm">Search for jobs above or run the AI agent to discover opportunities.</p>
    </div>

    <div v-else class="glass-dark rounded-xl overflow-hidden border border-neural-700/50">
      <table class="w-full text-sm">
        <thead class="bg-neural-700/40">
          <tr>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider w-8">#</th>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Job</th>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Location</th>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Salary</th>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Platform</th>
            <th class="text-center px-4 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Match</th>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Type</th>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Posted</th>
            <th class="text-right px-4 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(job, idx) in displayJobs" :key="job.id" class="border-t border-neural-700/30 hover:bg-neural-700/20 transition-colors">
            <td class="px-4 py-3 text-gray-600 text-xs">{{ idx + 1 }}</td>
            <td class="px-4 py-3">
              <button @click="viewDetail(job)" class="text-left group">
                <p class="text-white font-medium text-xs truncate max-w-[240px] group-hover:text-cyber-cyan transition-colors">{{ job.title }}</p>
                <p class="text-[10px] text-gray-500">{{ job.company }}</p>
              </button>
            </td>
            <td class="px-4 py-3 text-gray-400 text-xs max-w-[120px] truncate">{{ job.location || '—' }}</td>
            <td class="px-4 py-3 text-xs whitespace-nowrap" :class="job.salary_min ? 'text-green-400' : 'text-gray-600'">{{ formatSalary(job) }}</td>
            <td class="px-4 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-medium capitalize" :class="platformColor(job.platform)">{{ job.platform }}</span></td>
            <td class="px-4 py-3 text-center">
              <span v-if="job.match_score" class="text-xs font-bold" :class="job.match_score >= 75 ? 'text-green-400' : job.match_score >= 50 ? 'text-yellow-400' : 'text-gray-500'">{{ job.match_score }}%</span>
              <span v-else class="text-[10px] text-gray-600">—</span>
            </td>
            <td class="px-4 py-3 text-gray-500 text-[10px] capitalize">{{ job.job_type || '—' }}</td>
            <td class="px-4 py-3 text-gray-500 text-[10px]">{{ job.posted_at ? timeAgo(job.posted_at) : timeAgo(job.created_at) }}</td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-0.5">
                <button @click="viewDetail(job)" class="p-1.5 rounded-lg hover:bg-neural-600 text-gray-500 hover:text-white transition-colors" title="Details">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                </button>
                <button v-if="job.status === 'new'" @click="saveJob(job)" class="p-1.5 rounded-lg hover:bg-yellow-900/30 text-gray-500 hover:text-yellow-400 transition-colors" title="Save">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                </button>
                <button v-if="!['applied','dismissed'].includes(job.status)" @click="applyToJob(job)" class="p-1.5 rounded-lg hover:bg-green-900/30 text-gray-500 hover:text-green-400 transition-colors" title="Apply">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                </button>
                <button v-if="job.status === 'new'" @click="dismissJob(job)" class="p-1.5 rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors" title="Dismiss">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <button @click="deleteJob(job)" class="p-1.5 rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors" title="Delete">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
                <a v-if="job.url" :href="job.url" target="_blank" class="p-1.5 rounded-lg hover:bg-neural-600 text-gray-500 hover:text-cyber-cyan transition-colors" title="Open">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Detail Modal -->
    <Teleport to="body">
      <div v-if="showDetail && detailJob" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="showDetail = false">
        <div class="glass-dark rounded-xl w-full max-w-2xl border border-neural-600 max-h-[85vh] flex flex-col">
          <div class="flex items-center justify-between px-6 py-4 border-b border-neural-700 shrink-0">
            <div class="min-w-0">
              <h3 class="text-lg font-bold text-white truncate">{{ detailJob.title }}</h3>
              <p class="text-sm text-gray-400">{{ detailJob.company }} · {{ detailJob.location || 'Remote' }}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span v-if="detailJob.match_score" class="px-2 py-1 rounded-full text-xs font-bold" :class="detailJob.match_score >= 75 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'">{{ detailJob.match_score }}%</span>
              <button @click="showDetail = false" class="p-2 rounded-lg hover:bg-neural-600 text-gray-400 hover:text-white">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
          <div class="flex-1 overflow-y-auto p-6 space-y-4">
            <div class="flex flex-wrap gap-2">
              <span class="px-2 py-1 rounded-full text-xs capitalize" :class="platformColor(detailJob.platform)">{{ detailJob.platform }}</span>
              <span v-if="detailJob.job_type" class="px-2 py-1 rounded-full text-xs bg-neural-700/50 text-gray-300 capitalize">{{ detailJob.job_type }}</span>
              <span v-if="detailJob.salary_min || detailJob.salary_max" class="px-2 py-1 rounded-full text-xs bg-green-500/15 text-green-400">{{ formatSalary(detailJob) }}</span>
            </div>
            <div v-if="detailJob.description" class="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{{ detailJob.description }}</div>
            <div v-if="detailJob.requirements" class="mt-4">
              <h4 class="text-sm font-semibold text-white mb-2">Requirements</h4>
              <div class="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">{{ detailJob.requirements }}</div>
            </div>
            <div class="flex gap-3 pt-4 border-t border-neural-700">
              <button v-if="!['applied','dismissed'].includes(detailJob.status)" @click="applyToJob(detailJob); showDetail = false"
                class="px-4 py-2 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-sm font-medium hover:opacity-90">Mark Applied</button>
              <a v-if="detailJob.url" :href="detailJob.url" target="_blank" class="px-4 py-2 bg-neural-700 text-gray-300 rounded-lg text-sm hover:bg-neural-600">Open Original &rarr;</a>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

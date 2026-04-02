<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'
import type { JobListing } from '@/types/database'
import { classifyJob, matchJob } from '@/utils/jobClassifyAgent'

const admin = useAdminStore()

// Filters
const search = ref('')
const filterPlatform = ref('')
const filterStatus = ref('')
const filterType = ref('')
const sortBy = ref('created_at')

// Detail modal
const showDetail = ref(false)
const detailJob = ref<JobListing | null>(null)

// Bulk
const selectedIds = ref<Set<string>>(new Set())
const selectAll = ref(false)
const scoring = ref(false)
const scoreProgress = ref('')

onMounted(() => { admin.fetchJobListings(); admin.fetchJobProfile() })

// Platform stats
const platformStats = computed(() => {
  const counts: Record<string, number> = {}
  for (const j of admin.jobListings) {
    counts[j.platform] = (counts[j.platform] || 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
})

const filteredJobs = computed(() => {
  let jobs = [...admin.jobListings]
  if (search.value) {
    const q = search.value.toLowerCase()
    jobs = jobs.filter(j => j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q) || (j.location?.toLowerCase().includes(q)) || (j.description?.toLowerCase().includes(q)))
  }
  if (filterPlatform.value) jobs = jobs.filter(j => j.platform === filterPlatform.value)
  if (filterStatus.value) jobs = jobs.filter(j => j.status === filterStatus.value)
  if (filterType.value) jobs = jobs.filter(j => j.job_type === filterType.value)
  // Sort
  if (sortBy.value === 'match_score') jobs.sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
  else if (sortBy.value === 'salary') jobs.sort((a, b) => (b.salary_max || b.salary_min || 0) - (a.salary_max || a.salary_min || 0))
  else if (sortBy.value === 'title') jobs.sort((a, b) => a.title.localeCompare(b.title))
  else jobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return jobs
})

function toggleSelect(id: string) {
  if (selectedIds.value.has(id)) selectedIds.value.delete(id)
  else selectedIds.value.add(id)
}

function toggleSelectAll() {
  if (selectAll.value) { selectedIds.value.clear(); selectAll.value = false }
  else { filteredJobs.value.forEach(j => selectedIds.value.add(j.id)); selectAll.value = true }
}

async function bulkDismiss() {
  for (const id of selectedIds.value) {
    await admin.updateRow('job_listings', id, { status: 'dismissed' })
  }
  selectedIds.value.clear(); selectAll.value = false
  await admin.fetchJobListings()
}

async function bulkDelete() {
  if (!confirm(`Delete ${selectedIds.value.size} jobs?`)) return
  for (const id of selectedIds.value) {
    await admin.deleteRow('job_listings', id)
  }
  selectedIds.value.clear(); selectAll.value = false
  await admin.fetchJobListings()
}

async function bulkScore() {
  scoring.value = true
  const profile = admin.jobProfile[0] || null
  const toScore = filteredJobs.value.filter(j => selectedIds.value.has(j.id) && j.match_score === null)
  let done = 0
  for (const job of toScore) {
    scoreProgress.value = `Scoring ${++done}/${toScore.length}...`
    try {
      const cl = await classifyJob(job.title, job.company, job.description || undefined)
      const mt = await matchJob(
        { title: job.title, company: job.company, description: job.description, requirements: job.requirements },
        { resume_text: profile?.resume_text, skills: profile?.skills, preferred_job_types: profile?.preferred_job_types, preferred_locations: profile?.preferred_locations },
      )
      await admin.updateRow('job_listings', job.id, {
        match_score: mt.match_score,
        raw_data: { ...(job.raw_data as Record<string, unknown> || {}), role_type: cl.role_type, company_bucket: cl.company_bucket, skill_matches: mt.skill_matches, skill_gaps: mt.skill_gaps },
      })
    } catch { /* skip */ }
  }
  await admin.fetchJobListings()
  scoring.value = false; scoreProgress.value = ''
  selectedIds.value.clear(); selectAll.value = false
}

async function applyToJob(job: JobListing) {
  await admin.insertRow('job_applications', {
    job_listing_id: job.id, platform: job.platform, channel: 'direct', status: 'applied', applied_via: 'manual',
  })
  await admin.updateRow('job_listings', job.id, { status: 'applied' })
  await Promise.all([admin.fetchJobListings(), admin.fetchJobApplications()])
}

async function deleteJob(job: JobListing) {
  if (confirm(`Remove "${job.title}"?`)) {
    await admin.deleteRow('job_listings', job.id)
    await admin.fetchJobListings()
  }
}

function viewDetail(job: JobListing) { detailJob.value = job; showDetail.value = true }

function platformColor(p: string) {
  const c: Record<string, string> = {
    indeed: 'bg-blue-500/15 text-blue-400', linkedin: 'bg-sky-500/15 text-sky-400',
    glassdoor: 'bg-green-500/15 text-green-400', ziprecruiter: 'bg-emerald-500/15 text-emerald-400',
    google: 'bg-red-500/15 text-red-300', remoteok: 'bg-teal-500/15 text-teal-400',
    remotive: 'bg-indigo-500/15 text-indigo-400', himalayas: 'bg-amber-500/15 text-amber-400',
    hackernews: 'bg-orange-500/15 text-orange-400', arbeitnow: 'bg-pink-500/15 text-pink-400',
    adzuna: 'bg-yellow-500/15 text-yellow-400',
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

function roleType(j: JobListing) {
  return (j.raw_data as Record<string, unknown>)?.role_type as string || ''
}

function companyBucket(j: JobListing) {
  return (j.raw_data as Record<string, unknown>)?.company_bucket as string || ''
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-white">Job Posts</h2>
        <p class="text-sm text-gray-400 mt-1">{{ admin.jobListings.length }} jobs pulled from {{ platformStats.length }} platforms</p>
      </div>
      <RouterLink :to="{ name: 'admin-jobs-search' }" class="px-4 py-2 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-sm font-medium hover:opacity-90 flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        Search More Jobs
      </RouterLink>
    </div>

    <!-- Platform Stats Pills -->
    <div class="flex flex-wrap gap-2 mb-4">
      <button @click="filterPlatform = ''" class="px-3 py-1.5 rounded-full text-[10px] font-medium transition-colors"
        :class="filterPlatform === '' ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-neural-700/50 text-gray-500 hover:text-gray-300'">
        All ({{ admin.jobListings.length }})
      </button>
      <button v-for="[platform, count] in platformStats" :key="platform"
        @click="filterPlatform = filterPlatform === platform ? '' : platform"
        class="px-3 py-1.5 rounded-full text-[10px] font-medium transition-colors capitalize"
        :class="filterPlatform === platform ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-neural-700/50 text-gray-500 hover:text-gray-300'">
        {{ platform }} ({{ count }})
      </button>
    </div>

    <!-- Filters + Sort -->
    <div class="flex gap-3 mb-4">
      <div class="flex-1 relative">
        <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input v-model="search" placeholder="Filter by title, company, location..."
          class="w-full pl-10 pr-4 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm placeholder-gray-500 focus:border-cyber-purple focus:outline-none" />
      </div>
      <select v-model="filterStatus" class="px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none">
        <option value="">All Status</option>
        <option value="new">New</option>
        <option value="saved">Saved</option>
        <option value="applied">Applied</option>
        <option value="dismissed">Dismissed</option>
      </select>
      <select v-model="filterType" class="px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none">
        <option value="">All Types</option>
        <option value="full-time">Full-time</option>
        <option value="remote">Remote</option>
        <option value="contract">Contract</option>
        <option value="part-time">Part-time</option>
      </select>
      <select v-model="sortBy" class="px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none">
        <option value="created_at">Newest</option>
        <option value="match_score">Best Match</option>
        <option value="salary">Highest Salary</option>
        <option value="title">A-Z</option>
      </select>
    </div>

    <!-- Bulk Actions Bar -->
    <div v-if="selectedIds.size > 0" class="flex items-center gap-3 mb-4 px-4 py-2.5 bg-cyber-purple/10 border border-cyber-purple/20 rounded-lg">
      <span class="text-xs text-cyber-purple font-medium">{{ selectedIds.size }} selected</span>
      <button @click="bulkScore" :disabled="scoring" class="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded text-[10px] font-medium hover:bg-yellow-500/30 disabled:opacity-50">
        {{ scoring ? scoreProgress : '🎯 Score Selected' }}
      </button>
      <button @click="bulkDismiss" class="px-3 py-1 bg-red-500/20 text-red-400 rounded text-[10px] font-medium hover:bg-red-500/30">Dismiss Selected</button>
      <button @click="bulkDelete" class="px-3 py-1 bg-red-500/20 text-red-400 rounded text-[10px] font-medium hover:bg-red-500/30">Delete Selected</button>
      <button @click="selectedIds.clear(); selectAll = false" class="text-[10px] text-gray-500 hover:text-white ml-auto">Clear</button>
    </div>

    <!-- Empty -->
    <div v-if="filteredJobs.length === 0" class="text-center py-16 glass-dark rounded-xl border border-neural-700/50">
      <div class="text-4xl mb-3">📌</div>
      <h3 class="text-lg font-semibold text-white mb-2">No job posts yet</h3>
      <p class="text-gray-500 text-sm mb-5">Pull jobs from the Search page or run the AI Agent.</p>
      <RouterLink :to="{ name: 'admin-jobs-search' }" class="px-5 py-2 bg-cyber-purple hover:bg-cyber-purple/80 text-white rounded-lg text-sm font-medium">Search Jobs</RouterLink>
    </div>

    <!-- Table -->
    <div v-else class="glass-dark rounded-xl overflow-hidden border border-neural-700/50">
      <table class="w-full text-sm">
        <thead class="bg-neural-700/40">
          <tr>
            <th class="px-3 py-3 w-8"><input type="checkbox" :checked="selectAll" @change="toggleSelectAll" class="rounded border-neural-600 bg-neural-800 text-cyber-purple focus:ring-cyber-purple w-3.5 h-3.5" /></th>
            <th class="text-left px-3 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider w-8">#</th>
            <th class="text-left px-3 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Job</th>
            <th class="text-left px-3 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Location</th>
            <th class="text-left px-3 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Salary</th>
            <th class="text-left px-3 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Platform</th>
            <th class="text-left px-3 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Type</th>
            <th class="text-center px-3 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Match</th>
            <th class="text-left px-3 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Role</th>
            <th class="text-left px-3 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Status</th>
            <th class="text-left px-3 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Pulled</th>
            <th class="text-right px-3 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(job, idx) in filteredJobs" :key="job.id"
            class="border-t border-neural-700/30 hover:bg-neural-700/20 transition-colors"
            :class="selectedIds.has(job.id) ? 'bg-cyber-purple/5' : ''">
            <td class="px-3 py-2.5"><input type="checkbox" :checked="selectedIds.has(job.id)" @change="toggleSelect(job.id)" class="rounded border-neural-600 bg-neural-800 text-cyber-purple focus:ring-cyber-purple w-3.5 h-3.5" /></td>
            <td class="px-3 py-2.5 text-gray-600 text-[10px]">{{ idx + 1 }}</td>
            <td class="px-3 py-2.5">
              <button @click="viewDetail(job)" class="text-left group">
                <p class="text-white font-medium text-xs truncate max-w-[220px] group-hover:text-cyber-cyan transition-colors">{{ job.title }}</p>
                <p class="text-[10px] text-gray-500">{{ job.company }}</p>
              </button>
            </td>
            <td class="px-3 py-2.5 text-gray-400 text-[10px] max-w-[100px] truncate">{{ job.location || '—' }}</td>
            <td class="px-3 py-2.5 text-[10px] whitespace-nowrap" :class="job.salary_min ? 'text-green-400' : 'text-gray-600'">{{ formatSalary(job) }}</td>
            <td class="px-3 py-2.5"><span class="px-2 py-0.5 rounded-full text-[10px] font-medium capitalize" :class="platformColor(job.platform)">{{ job.platform }}</span></td>
            <td class="px-3 py-2.5 text-[10px] text-gray-500 capitalize">{{ job.job_type || '—' }}</td>
            <td class="px-3 py-2.5 text-center">
              <span v-if="job.match_score" class="text-xs font-bold" :class="job.match_score >= 75 ? 'text-green-400' : job.match_score >= 50 ? 'text-yellow-400' : 'text-gray-500'">{{ job.match_score }}%</span>
              <span v-else class="text-[10px] text-gray-600">—</span>
            </td>
            <td class="px-3 py-2.5">
              <span v-if="roleType(job)" class="text-[10px] text-gray-500 capitalize">{{ roleType(job).replace('_', ' ') }}</span>
              <span v-else class="text-[10px] text-gray-700">—</span>
            </td>
            <td class="px-3 py-2.5">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-medium capitalize"
                :class="job.status === 'new' ? 'bg-gray-500/15 text-gray-400' : job.status === 'saved' ? 'bg-yellow-500/15 text-yellow-400' : job.status === 'applied' ? 'bg-blue-500/15 text-blue-400' : 'bg-red-500/15 text-red-400'">
                {{ job.status }}
              </span>
            </td>
            <td class="px-3 py-2.5 text-[10px] text-gray-500">{{ timeAgo(job.created_at) }}</td>
            <td class="px-3 py-2.5 text-right">
              <div class="flex items-center justify-end gap-0.5">
                <button @click="viewDetail(job)" class="p-1 rounded hover:bg-neural-600 text-gray-500 hover:text-white transition-colors" title="Details">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                </button>
                <button v-if="!['applied','dismissed'].includes(job.status)" @click="applyToJob(job)" class="p-1 rounded hover:bg-green-900/30 text-gray-500 hover:text-green-400 transition-colors" title="Apply">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                </button>
                <button @click="deleteJob(job)" class="p-1 rounded hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors" title="Delete">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
                <a v-if="job.url" :href="job.url" target="_blank" class="p-1 rounded hover:bg-neural-600 text-gray-500 hover:text-cyber-cyan transition-colors" title="Open">
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
              <span class="px-2 py-1 rounded-full text-xs capitalize" :class="platformColor(detailJob.platform)">{{ detailJob.platform }}</span>
              <button @click="showDetail = false" class="p-2 rounded-lg hover:bg-neural-600 text-gray-400 hover:text-white"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
          </div>
          <div class="flex-1 overflow-y-auto p-6 space-y-4">
            <!-- Meta -->
            <div class="flex flex-wrap gap-2">
              <span v-if="detailJob.job_type" class="px-2 py-1 rounded-full text-xs bg-neural-700/50 text-gray-300 capitalize">{{ detailJob.job_type }}</span>
              <span v-if="detailJob.salary_min || detailJob.salary_max" class="px-2 py-1 rounded-full text-xs bg-green-500/15 text-green-400">{{ formatSalary(detailJob) }}</span>
              <span v-if="roleType(detailJob)" class="px-2 py-1 rounded-full text-xs bg-violet-500/15 text-violet-400 capitalize">{{ roleType(detailJob).replace('_', ' ') }}</span>
              <span v-if="companyBucket(detailJob)" class="px-2 py-1 rounded-full text-xs bg-cyan-500/15 text-cyan-400 capitalize">{{ companyBucket(detailJob).replace('_', ' ') }}</span>
            </div>
            <!-- Skill matches -->
            <div v-if="(detailJob.raw_data as any)?.skill_matches?.length" class="flex flex-wrap gap-1.5">
              <span class="text-[10px] text-gray-500 mr-1">Matched:</span>
              <span v-for="s in (detailJob.raw_data as any).skill_matches" :key="s" class="px-2 py-0.5 rounded-full text-[10px] bg-green-500/10 text-green-400">{{ s }}</span>
            </div>
            <div v-if="(detailJob.raw_data as any)?.skill_gaps?.length" class="flex flex-wrap gap-1.5">
              <span class="text-[10px] text-gray-500 mr-1">Gaps:</span>
              <span v-for="s in (detailJob.raw_data as any).skill_gaps" :key="s" class="px-2 py-0.5 rounded-full text-[10px] bg-red-500/10 text-red-400">{{ s }}</span>
            </div>
            <!-- Description -->
            <div v-if="detailJob.description" class="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{{ detailJob.description }}</div>
            <!-- Requirements -->
            <div v-if="detailJob.requirements" class="mt-4">
              <h4 class="text-sm font-semibold text-white mb-2">Requirements</h4>
              <div class="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">{{ detailJob.requirements }}</div>
            </div>
            <!-- Actions -->
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

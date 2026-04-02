<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'
import { useRouter } from 'vue-router'

const admin = useAdminStore()
const router = useRouter()

onMounted(() => {
  admin.fetchJobListings()
  admin.fetchJobApplications()
  admin.fetchJobAgentLogs()
})

// ─── Pipeline Nodes ───
const NODES = [
  { key: 'new', label: 'Discovered', icon: '🔍', statuses: ['new', 'saved'], color: 'bg-gray-500', gradient: 'from-gray-500 to-gray-600' },
  { key: 'applied', label: 'Applied', icon: '📨', statuses: ['applying', 'applied', 'apply_failed'], color: 'bg-blue-500', gradient: 'from-blue-500 to-blue-600' },
  { key: 'screening', label: 'Screening', icon: '📞', statuses: ['under_review', 'screened_out', 'phone_screen', 'endorsed'], color: 'bg-cyan-500', gradient: 'from-cyan-500 to-cyan-600' },
  { key: 'assessment', label: 'Assessment', icon: '💻', statuses: ['technical_test', 'test_submitted', 'test_passed', 'test_failed'], color: 'bg-yellow-500', gradient: 'from-yellow-500 to-yellow-600' },
  { key: 'interview', label: 'Interview', icon: '🎙️', statuses: ['interview_scheduled', 'interview_round_1', 'interview_round_2', 'interview_round_3', 'interview_passed', 'interview_failed'], color: 'bg-purple-500', gradient: 'from-purple-500 to-purple-600' },
  { key: 'offer', label: 'Offer', icon: '💰', statuses: ['offer_received', 'negotiating', 'offer_accepted', 'offer_declined'], color: 'bg-green-500', gradient: 'from-green-500 to-green-600' },
  { key: 'onboarding', label: 'Onboarding', icon: '🚀', statuses: ['pending_start', 'documents_submitted', 'onboarded'], color: 'bg-emerald-500', gradient: 'from-emerald-500 to-emerald-600' },
]

function nodeCount(node: typeof NODES[0]) {
  if (node.key === 'new') return admin.jobListings.filter(j => node.statuses.includes(j.status)).length
  return admin.jobApplications.filter(a => node.statuses.includes(a.status)).length
}

// ─── Analytics ───
const totalJobs = computed(() => admin.jobListings.length)
const wfhJobs = computed(() => admin.jobListings.filter(j => {
  const t = `${j.location || ''} ${j.job_type || ''} ${j.description || ''}`.toLowerCase()
  return t.includes('remote') || t.includes('wfh') || t.includes('work from home')
}).length)
const scoredJobs = computed(() => admin.jobListings.filter(j => j.match_score !== null).length)
const avgScore = computed(() => {
  const scored = admin.jobListings.filter(j => j.match_score !== null)
  if (!scored.length) return 0
  return Math.round(scored.reduce((s, j) => s + (j.match_score || 0), 0) / scored.length)
})
const totalApplied = computed(() => admin.jobApplications.length)
const activeInterviews = computed(() => admin.jobApplications.filter(a => a.status.startsWith('interview')).length)
const offers = computed(() => admin.jobApplications.filter(a => a.status.startsWith('offer')).length)
const responseRate = computed(() => {
  if (!totalApplied.value) return 0
  return Math.round(admin.jobApplications.filter(a => !['applied', 'applying'].includes(a.status)).length / totalApplied.value * 100)
})

// Platform breakdown
const platformBreakdown = computed(() => {
  const counts: Record<string, number> = {}
  for (const j of admin.jobListings) counts[j.platform] = (counts[j.platform] || 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
})

// Match distribution
const matchDistribution = computed(() => {
  const dist = { high: 0, good: 0, moderate: 0, low: 0, unscored: 0 }
  for (const j of admin.jobListings) {
    if (j.match_score === null) dist.unscored++
    else if (j.match_score >= 80) dist.high++
    else if (j.match_score >= 60) dist.good++
    else if (j.match_score >= 40) dist.moderate++
    else dist.low++
  }
  return dist
})

// Recent agent logs
const recentLogs = computed(() =>
  [...admin.jobAgentLogs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5)
)

// Recent applications
const recentApps = computed(() =>
  [...admin.jobApplications].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5)
)

function getJob(id: string) { return admin.jobListings.find(j => j.id === id) }
function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}
</script>

<template>
  <div>
    <!-- Stats Row -->
    <div class="grid grid-cols-4 lg:grid-cols-8 gap-2 mb-5">
      <div class="glass-dark rounded-lg p-3 border border-neural-700/50 text-center">
        <p class="text-[9px] text-gray-500 uppercase">Total Jobs</p>
        <p class="text-xl font-bold text-white">{{ totalJobs }}</p>
      </div>
      <div class="glass-dark rounded-lg p-3 border border-neural-700/50 text-center">
        <p class="text-[9px] text-gray-500 uppercase">WFH</p>
        <p class="text-xl font-bold text-green-400">{{ wfhJobs }}</p>
      </div>
      <div class="glass-dark rounded-lg p-3 border border-neural-700/50 text-center">
        <p class="text-[9px] text-gray-500 uppercase">Scored</p>
        <p class="text-xl font-bold text-yellow-400">{{ scoredJobs }}</p>
      </div>
      <div class="glass-dark rounded-lg p-3 border border-neural-700/50 text-center">
        <p class="text-[9px] text-gray-500 uppercase">Avg Match</p>
        <p class="text-xl font-bold" :class="avgScore >= 70 ? 'text-green-400' : avgScore >= 50 ? 'text-yellow-400' : 'text-gray-400'">{{ avgScore }}%</p>
      </div>
      <div class="glass-dark rounded-lg p-3 border border-neural-700/50 text-center">
        <p class="text-[9px] text-gray-500 uppercase">Applied</p>
        <p class="text-xl font-bold text-blue-400">{{ totalApplied }}</p>
      </div>
      <div class="glass-dark rounded-lg p-3 border border-neural-700/50 text-center">
        <p class="text-[9px] text-gray-500 uppercase">Interviews</p>
        <p class="text-xl font-bold text-purple-400">{{ activeInterviews }}</p>
      </div>
      <div class="glass-dark rounded-lg p-3 border border-neural-700/50 text-center">
        <p class="text-[9px] text-gray-500 uppercase">Offers</p>
        <p class="text-xl font-bold text-green-400">{{ offers }}</p>
      </div>
      <div class="glass-dark rounded-lg p-3 border border-neural-700/50 text-center">
        <p class="text-[9px] text-gray-500 uppercase">Response</p>
        <p class="text-xl font-bold text-cyan-400">{{ responseRate }}%</p>
      </div>
    </div>

    <!-- Pipeline Nodes -->
    <div class="glass-dark rounded-xl p-4 border border-neural-700/50 mb-5">
      <h3 class="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Application Pipeline</h3>
      <div class="flex items-center gap-0 overflow-x-auto pb-1">
        <template v-for="(node, idx) in NODES" :key="node.key">
          <div class="flex flex-col items-center min-w-[80px] px-2 shrink-0">
            <div class="w-10 h-10 rounded-full flex items-center justify-center text-base bg-gradient-to-br mb-1"
              :class="[node.gradient, nodeCount(node) > 0 ? 'opacity-100 shadow-lg' : 'opacity-25']">{{ node.icon }}</div>
            <span v-if="nodeCount(node) > 0" class="text-xs font-bold text-white">{{ nodeCount(node) }}</span>
            <span v-else class="text-xs text-gray-600">0</span>
            <span class="text-[9px] text-gray-500 mt-0.5">{{ node.label }}</span>
          </div>
          <div v-if="idx < NODES.length - 1" class="w-4 h-[2px] shrink-0 -mx-0.5" :class="nodeCount(NODES[idx + 1]) > 0 ? node.color : 'bg-neural-700/40'" />
        </template>
      </div>
    </div>

    <!-- Analytics Row -->
    <div class="grid lg:grid-cols-3 gap-4 mb-5">
      <!-- Platform Breakdown -->
      <div class="glass-dark rounded-xl p-4 border border-neural-700/50">
        <h3 class="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Sources</h3>
        <div class="space-y-2">
          <div v-for="[plat, count] in platformBreakdown" :key="plat" class="flex items-center justify-between">
            <span class="text-xs text-gray-300 capitalize">{{ plat }}</span>
            <div class="flex items-center gap-2">
              <div class="w-24 h-1.5 bg-neural-700 rounded-full overflow-hidden">
                <div class="h-full bg-cyber-purple rounded-full" :style="{ width: `${(count / totalJobs) * 100}%` }" />
              </div>
              <span class="text-[10px] text-gray-500 w-8 text-right">{{ count }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Match Distribution -->
      <div class="glass-dark rounded-xl p-4 border border-neural-700/50">
        <h3 class="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Match Quality</h3>
        <div class="space-y-2">
          <div class="flex items-center justify-between"><span class="text-xs text-green-400">80%+ Strong</span><span class="text-xs font-bold text-green-400">{{ matchDistribution.high }}</span></div>
          <div class="flex items-center justify-between"><span class="text-xs text-yellow-400">60-79% Good</span><span class="text-xs font-bold text-yellow-400">{{ matchDistribution.good }}</span></div>
          <div class="flex items-center justify-between"><span class="text-xs text-orange-400">40-59% Moderate</span><span class="text-xs font-bold text-orange-400">{{ matchDistribution.moderate }}</span></div>
          <div class="flex items-center justify-between"><span class="text-xs text-red-400">&lt;40% Low</span><span class="text-xs font-bold text-red-400">{{ matchDistribution.low }}</span></div>
          <div class="flex items-center justify-between"><span class="text-xs text-gray-500">Unscored</span><span class="text-xs font-bold text-gray-500">{{ matchDistribution.unscored }}</span></div>
        </div>
        <div class="flex gap-0.5 mt-3 h-2 rounded-full overflow-hidden">
          <div class="bg-green-500" :style="{ flex: matchDistribution.high || 0.1 }" />
          <div class="bg-yellow-500" :style="{ flex: matchDistribution.good || 0.1 }" />
          <div class="bg-orange-500" :style="{ flex: matchDistribution.moderate || 0.1 }" />
          <div class="bg-red-500" :style="{ flex: matchDistribution.low || 0.1 }" />
          <div class="bg-gray-700" :style="{ flex: matchDistribution.unscored || 0.1 }" />
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="glass-dark rounded-xl p-4 border border-neural-700/50">
        <h3 class="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Quick Actions</h3>
        <div class="space-y-2">
          <button @click="router.push({ name: 'admin-jobs-search' })" class="w-full px-3 py-2 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-xs font-medium hover:opacity-90 flex items-center gap-2">
            <span>🔍</span> Search & Browse Jobs
          </button>
          <button @click="router.push({ name: 'admin-jobs-agent' })" class="w-full px-3 py-2 bg-neural-700 text-gray-300 rounded-lg text-xs hover:bg-neural-600 flex items-center gap-2">
            <span>🤖</span> Run AI Agent Pipeline
          </button>
          <button @click="router.push({ name: 'admin-jobs-applications' })" class="w-full px-3 py-2 bg-neural-700 text-gray-300 rounded-lg text-xs hover:bg-neural-600 flex items-center gap-2">
            <span>📋</span> Track Applications
          </button>
          <button @click="router.push({ name: 'admin-jobs-profile' })" class="w-full px-3 py-2 bg-neural-700 text-gray-300 rounded-lg text-xs hover:bg-neural-600 flex items-center gap-2">
            <span>👤</span> Edit Profile & Skills
          </button>
        </div>
      </div>
    </div>

    <!-- Bottom Row: Recent Activity -->
    <div class="grid lg:grid-cols-2 gap-4">
      <!-- Recent Applications -->
      <div class="glass-dark rounded-xl border border-neural-700/50">
        <div class="flex items-center justify-between px-4 py-3 border-b border-neural-700/50">
          <h3 class="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Recent Applications</h3>
          <RouterLink :to="{ name: 'admin-jobs-applications' }" class="text-[10px] text-cyber-purple hover:text-cyber-cyan">View All</RouterLink>
        </div>
        <div v-if="recentApps.length === 0" class="p-6 text-center text-gray-600 text-xs">No applications yet</div>
        <div v-else class="divide-y divide-neural-700/30">
          <div v-for="app in recentApps" :key="app.id" class="px-4 py-2.5 flex items-center justify-between">
            <div class="min-w-0">
              <p class="text-xs text-white truncate">{{ getJob(app.job_listing_id)?.title || '—' }}</p>
              <p class="text-[10px] text-gray-500">{{ getJob(app.job_listing_id)?.company || '' }} · {{ app.platform }}</p>
            </div>
            <div class="text-right shrink-0 ml-2">
              <span class="text-[10px] font-medium capitalize text-gray-400">{{ app.status.replace(/_/g, ' ') }}</span>
              <p class="text-[9px] text-gray-600">{{ timeAgo(app.created_at) }} ago</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Agent Activity -->
      <div class="glass-dark rounded-xl border border-neural-700/50">
        <div class="flex items-center justify-between px-4 py-3 border-b border-neural-700/50">
          <h3 class="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Agent Activity</h3>
          <RouterLink :to="{ name: 'admin-jobs-agent' }" class="text-[10px] text-cyber-purple hover:text-cyber-cyan">View All</RouterLink>
        </div>
        <div v-if="recentLogs.length === 0" class="p-6 text-center text-gray-600 text-xs">No agent runs yet</div>
        <div v-else class="divide-y divide-neural-700/30">
          <div v-for="log in recentLogs" :key="log.id" class="px-4 py-2.5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="w-1.5 h-1.5 rounded-full" :class="log.status === 'completed' ? 'bg-green-400' : log.status === 'running' ? 'bg-blue-400 animate-pulse' : 'bg-red-400'" />
                <span class="text-xs text-white capitalize">{{ log.step }}</span>
              </div>
              <span class="text-[9px] text-gray-600">{{ timeAgo(log.created_at) }} ago</span>
            </div>
            <div class="flex gap-3 mt-0.5 text-[9px] text-gray-600">
              <span v-if="log.jobs_found">Found: {{ log.jobs_found }}</span>
              <span v-if="log.jobs_matched">Matched: {{ log.jobs_matched }}</span>
              <span v-if="log.message" class="truncate max-w-[200px]">{{ log.message }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

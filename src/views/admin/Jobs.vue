<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAdminStore } from '@/stores/admin'
import { useRouter } from 'vue-router'
// Types used inline via tableData computed

const admin = useAdminStore()
const router = useRouter()
const selectedNode = ref<string | null>(null)

onMounted(() => {
  admin.fetchJobListings()
  admin.fetchJobApplications()
  admin.fetchJobAgentLogs()
})

// ─── Pipeline Nodes ───
const PIPELINE_NODES = [
  { key: 'discovery', label: 'Discovery', icon: '🔍', statuses: ['new', 'saved', 'dismissed'], color: 'from-gray-500 to-gray-600', ring: 'ring-gray-500', bg: 'bg-gray-500' },
  { key: 'applied', label: 'Applied', icon: '📨', statuses: ['applying', 'applied', 'apply_failed'], color: 'from-blue-500 to-blue-600', ring: 'ring-blue-500', bg: 'bg-blue-500' },
  { key: 'screening', label: 'Screening', icon: '📞', statuses: ['under_review', 'screened_out', 'phone_screen', 'endorsed'], color: 'from-cyan-500 to-cyan-600', ring: 'ring-cyan-500', bg: 'bg-cyan-500' },
  { key: 'assessment', label: 'Assessment', icon: '💻', statuses: ['technical_test', 'test_submitted', 'test_passed', 'test_failed'], color: 'from-yellow-500 to-yellow-600', ring: 'ring-yellow-500', bg: 'bg-yellow-500' },
  { key: 'client_match', label: 'Client Match', icon: '🤝', statuses: ['profile_sent', 'client_reviewing', 'client_approved', 'client_rejected'], color: 'from-violet-500 to-violet-600', ring: 'ring-violet-500', bg: 'bg-violet-500' },
  { key: 'interview', label: 'Interview', icon: '🎙️', statuses: ['interview_scheduled', 'interview_round_1', 'interview_round_2', 'interview_round_3', 'interview_passed', 'interview_failed'], color: 'from-purple-500 to-purple-600', ring: 'ring-purple-500', bg: 'bg-purple-500' },
  { key: 'offer', label: 'Offer', icon: '💰', statuses: ['offer_received', 'negotiating', 'offer_accepted', 'offer_declined'], color: 'from-green-500 to-green-600', ring: 'ring-green-500', bg: 'bg-green-500' },
  { key: 'onboarding', label: 'Onboarding', icon: '🚀', statuses: ['pending_start', 'documents_submitted', 'onboarded'], color: 'from-emerald-500 to-emerald-600', ring: 'ring-emerald-500', bg: 'bg-emerald-500' },
  { key: 'closed', label: 'Closed', icon: '📁', statuses: ['withdrawn', 'ghosted', 'position_filled'], color: 'from-red-500 to-red-600', ring: 'ring-red-500', bg: 'bg-red-500' },
]

// Count per pipeline node
function nodeCount(node: typeof PIPELINE_NODES[0]) {
  if (node.key === 'discovery') return admin.jobListings.filter(j => node.statuses.includes(j.status)).length
  return admin.jobApplications.filter(a => node.statuses.includes(a.status)).length
}

// ─── Table Data ───
const tableData = computed(() => {
  // Merge listings + applications into unified view
  const rows: {
    id: string; title: string; company: string; platform: string; location: string;
    status: string; channel: string; match_score: number | null; applied_at: string | null;
    url: string; type: 'listing' | 'application'; appId?: string; listingId: string;
  }[] = []

  // Applications (have a listing behind them)
  for (const app of admin.jobApplications) {
    const job = admin.jobListings.find(j => j.id === app.job_listing_id)
    if (!job) continue
    rows.push({
      id: app.id, title: job.title, company: job.company, platform: app.platform,
      location: job.location || '—', status: app.status, channel: app.channel,
      match_score: job.match_score, applied_at: app.created_at, url: job.url,
      type: 'application', appId: app.id, listingId: job.id,
    })
  }

  // Listings without applications (discovery stage)
  const appliedListingIds = new Set(admin.jobApplications.map(a => a.job_listing_id))
  for (const job of admin.jobListings) {
    if (appliedListingIds.has(job.id)) continue
    rows.push({
      id: job.id, title: job.title, company: job.company, platform: job.platform,
      location: job.location || '—', status: job.status, channel: '—',
      match_score: job.match_score, applied_at: null, url: job.url,
      type: 'listing', listingId: job.id,
    })
  }

  // Filter by selected node
  if (selectedNode.value) {
    const node = PIPELINE_NODES.find(n => n.key === selectedNode.value)
    if (node) return rows.filter(r => node.statuses.includes(r.status))
  }

  return rows.sort((a, b) => {
    const da = a.applied_at || '1970'
    const db = b.applied_at || '1970'
    return new Date(db).getTime() - new Date(da).getTime()
  })
})

// ─── Stats ───
const totalJobs = computed(() => admin.jobListings.length)
const totalApplied = computed(() => admin.jobApplications.length)
const activeInterviews = computed(() => admin.jobApplications.filter(a => a.status.startsWith('interview')).length)
const offers = computed(() => admin.jobApplications.filter(a => a.status.startsWith('offer')).length)

// ─── Helpers ───
function statusColor(s: string) {
  for (const node of PIPELINE_NODES) {
    if (node.statuses.includes(s)) return node.bg
  }
  return 'bg-gray-500'
}

function statusTextColor(s: string) {
  for (const node of PIPELINE_NODES) {
    if (node.statuses.includes(s)) return node.bg.replace('bg-', 'text-')
  }
  return 'text-gray-400'
}

function platformBadge(p: string) {
  const map: Record<string, string> = {
    indeed: 'bg-blue-500/15 text-blue-400', linkedin: 'bg-sky-500/15 text-sky-400',
    glassdoor: 'bg-green-500/15 text-green-400', ziprecruiter: 'bg-emerald-500/15 text-emerald-400',
    google: 'bg-red-500/15 text-red-300', jobstreet: 'bg-purple-500/15 text-purple-400',
    onlinejobs: 'bg-orange-500/15 text-orange-400', bossjob: 'bg-yellow-500/15 text-yellow-400',
    kalibrr: 'bg-cyan-500/15 text-cyan-400', bestjobs: 'bg-pink-500/15 text-pink-400',
    facebook: 'bg-indigo-500/15 text-indigo-400',
  }
  return map[p] || 'bg-gray-500/15 text-gray-400'
}

function channelBadge(c: string) {
  if (c === 'agency') return 'bg-violet-500/15 text-violet-400'
  if (c === 'freelance') return 'bg-amber-500/15 text-amber-400'
  if (c === 'direct') return 'bg-blue-500/15 text-blue-400'
  return ''
}

function timeAgo(d: string | null) {
  if (!d) return '—'
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d`
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function selectNode(key: string) {
  selectedNode.value = selectedNode.value === key ? null : key
}

// Quick actions
async function quickApply(row: typeof tableData.value[0]) {
  await admin.insertRow('job_applications', {
    job_listing_id: row.listingId, platform: row.platform,
    channel: 'direct', status: 'applied', applied_via: 'manual',
  })
  await admin.updateRow('job_listings', row.listingId, { status: 'applied' })
  await Promise.all([admin.fetchJobListings(), admin.fetchJobApplications()])
}

async function quickDismiss(row: typeof tableData.value[0]) {
  await admin.updateRow('job_listings', row.listingId, { status: 'dismissed' })
  await admin.fetchJobListings()
}

// Status update modal
const showStatusModal = ref(false)
const statusModalApp = ref<typeof tableData.value[0] | null>(null)
const statusModalValue = ref('')

function openStatusModal(row: typeof tableData.value[0]) {
  statusModalApp.value = row
  statusModalValue.value = row.status
  showStatusModal.value = true
}

async function saveStatus() {
  if (!statusModalApp.value) return
  if (statusModalApp.value.type === 'application' && statusModalApp.value.appId) {
    await admin.updateRow('job_applications', statusModalApp.value.appId, { status: statusModalValue.value })
  } else {
    await admin.updateRow('job_listings', statusModalApp.value.listingId, { status: statusModalValue.value })
  }
  showStatusModal.value = false
  await Promise.all([admin.fetchJobListings(), admin.fetchJobApplications()])
}

</script>

<template>
  <div>
    <!-- Quick Stats -->
    <div class="grid grid-cols-4 gap-3 mb-6">
      <div class="glass-dark rounded-xl p-4 border border-neural-700/50">
        <p class="text-[10px] text-gray-500 uppercase tracking-wider">Discovered</p>
        <p class="text-2xl font-bold text-white mt-1">{{ totalJobs }}</p>
      </div>
      <div class="glass-dark rounded-xl p-4 border border-neural-700/50">
        <p class="text-[10px] text-gray-500 uppercase tracking-wider">Applied</p>
        <p class="text-2xl font-bold text-blue-400 mt-1">{{ totalApplied }}</p>
      </div>
      <div class="glass-dark rounded-xl p-4 border border-neural-700/50">
        <p class="text-[10px] text-gray-500 uppercase tracking-wider">Interviews</p>
        <p class="text-2xl font-bold text-purple-400 mt-1">{{ activeInterviews }}</p>
      </div>
      <div class="glass-dark rounded-xl p-4 border border-neural-700/50">
        <p class="text-[10px] text-gray-500 uppercase tracking-wider">Offers</p>
        <p class="text-2xl font-bold text-green-400 mt-1">{{ offers }}</p>
      </div>
    </div>

    <!-- Horizontal Pipeline Nodes -->
    <div class="glass-dark rounded-xl p-5 border border-neural-700/50 mb-6">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-xs text-gray-400 uppercase tracking-wider font-medium">Application Pipeline</h3>
        <button v-if="selectedNode" @click="selectedNode = null" class="text-[10px] text-gray-500 hover:text-white transition-colors">Clear filter</button>
      </div>
      <div class="flex items-center gap-0 overflow-x-auto pb-2">
        <template v-for="(node, idx) in PIPELINE_NODES" :key="node.key">
          <!-- Node -->
          <button
            @click="selectNode(node.key)"
            class="flex flex-col items-center min-w-[90px] px-3 py-3 rounded-xl transition-all duration-200 shrink-0 group"
            :class="selectedNode === node.key ? 'bg-neural-700/60 ring-1 ' + node.ring + '/40' : 'hover:bg-neural-700/30'"
          >
            <div class="relative">
              <div class="w-11 h-11 rounded-full flex items-center justify-center text-lg bg-gradient-to-br transition-all duration-200"
                :class="[node.color, nodeCount(node) > 0 ? 'opacity-100 shadow-lg' : 'opacity-30']"
                :style="nodeCount(node) > 0 ? `box-shadow: 0 0 20px ${node.bg.replace('bg-', '').replace('-500', '')}20` : ''">
                {{ node.icon }}
              </div>
              <!-- Count badge -->
              <span v-if="nodeCount(node) > 0"
                class="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
                :class="node.bg">
                {{ nodeCount(node) }}
              </span>
            </div>
            <span class="text-[10px] mt-2 font-medium transition-colors" :class="selectedNode === node.key ? 'text-white' : 'text-gray-500 group-hover:text-gray-300'">{{ node.label }}</span>
          </button>
          <!-- Connector line -->
          <div v-if="idx < PIPELINE_NODES.length - 1" class="w-6 h-[2px] shrink-0 -mx-1"
            :class="nodeCount(PIPELINE_NODES[idx + 1]) > 0 ? 'bg-gradient-to-r ' + node.color.replace('from-', 'from-').replace('to-', 'to-') : 'bg-neural-700/40'" />
        </template>
      </div>
    </div>

    <!-- Header + Actions -->
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm font-semibold text-white">
        {{ selectedNode ? PIPELINE_NODES.find(n => n.key === selectedNode)?.label + ' Stage' : 'All Jobs' }}
        <span class="text-gray-500 font-normal ml-1">({{ tableData.length }})</span>
      </h3>
      <div class="flex gap-2">
        <button @click="router.push({ name: 'admin-jobs-search' })" class="px-3 py-1.5 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-xs font-medium hover:opacity-90 flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          Find Jobs
        </button>
        <button @click="router.push({ name: 'admin-jobs-agent' })" class="px-3 py-1.5 bg-neural-700 text-gray-300 rounded-lg text-xs hover:bg-neural-600 flex items-center gap-1.5">
          <span>🤖</span> Run Agent
        </button>
      </div>
    </div>

    <!-- Management Table -->
    <div v-if="tableData.length === 0" class="text-center py-16 glass-dark rounded-xl border border-neural-700/50">
      <div class="text-4xl mb-3">💼</div>
      <h3 class="text-lg font-semibold text-white mb-2">No jobs in pipeline</h3>
      <p class="text-gray-500 text-sm mb-5">Start by searching for jobs or running the AI agent.</p>
      <button @click="router.push({ name: 'admin-jobs-search' })" class="px-5 py-2 bg-cyber-purple hover:bg-cyber-purple/80 text-white rounded-lg text-sm font-medium">Search Jobs</button>
    </div>

    <div v-else class="glass-dark rounded-xl overflow-hidden border border-neural-700/50">
      <table class="w-full text-sm">
        <thead class="bg-neural-700/40">
          <tr>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider w-8">#</th>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Job</th>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Platform</th>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Channel</th>
            <th class="text-center px-4 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Match</th>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Status</th>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Applied</th>
            <th class="text-right px-4 py-3 text-gray-500 font-medium text-[10px] uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in tableData" :key="row.id"
            class="border-t border-neural-700/30 hover:bg-neural-700/20 transition-colors">
            <td class="px-4 py-3 text-gray-600 text-xs">{{ idx + 1 }}</td>
            <td class="px-4 py-3">
              <p class="text-white font-medium text-xs truncate max-w-[220px]">{{ row.title }}</p>
              <p class="text-[10px] text-gray-500 truncate max-w-[220px]">{{ row.company }} · {{ row.location }}</p>
            </td>
            <td class="px-4 py-3">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-medium capitalize" :class="platformBadge(row.platform)">{{ row.platform }}</span>
            </td>
            <td class="px-4 py-3">
              <span v-if="row.channel !== '—'" class="px-2 py-0.5 rounded-full text-[10px] font-medium capitalize" :class="channelBadge(row.channel)">{{ row.channel }}</span>
              <span v-else class="text-gray-600 text-[10px]">—</span>
            </td>
            <td class="px-4 py-3 text-center">
              <span v-if="row.match_score" class="text-xs font-bold" :class="row.match_score >= 75 ? 'text-green-400' : row.match_score >= 50 ? 'text-yellow-400' : 'text-gray-500'">{{ row.match_score }}%</span>
              <span v-else class="text-[10px] text-gray-600">—</span>
            </td>
            <td class="px-4 py-3">
              <button @click="openStatusModal(row)" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium capitalize cursor-pointer hover:opacity-80 transition-opacity"
                :class="statusColor(row.status) + '/15 ' + statusTextColor(row.status)">
                <span class="w-1.5 h-1.5 rounded-full" :class="statusColor(row.status)"></span>
                {{ row.status.replace(/_/g, ' ') }}
              </button>
            </td>
            <td class="px-4 py-3 text-[10px] text-gray-500">{{ timeAgo(row.applied_at) }}</td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-0.5">
                <!-- Quick apply (discovery only) -->
                <button v-if="row.type === 'listing' && row.status === 'new'" @click="quickApply(row)"
                  class="p-1.5 rounded-lg hover:bg-green-900/30 text-gray-500 hover:text-green-400 transition-colors" title="Mark Applied">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                </button>
                <!-- Dismiss (discovery only) -->
                <button v-if="row.type === 'listing' && row.status === 'new'" @click="quickDismiss(row)"
                  class="p-1.5 rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors" title="Dismiss">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <!-- Open link -->
                <a v-if="row.url" :href="row.url" target="_blank"
                  class="p-1.5 rounded-lg hover:bg-neural-600 text-gray-500 hover:text-cyber-cyan transition-colors" title="Open">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Status Update Modal -->
    <Teleport to="body">
      <div v-if="showStatusModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="showStatusModal = false">
        <div class="glass-dark rounded-xl p-6 w-full max-w-sm border border-neural-600">
          <h3 class="text-sm font-bold text-white mb-1">Update Status</h3>
          <p class="text-xs text-gray-500 mb-4">{{ statusModalApp?.title }}</p>
          <select v-model="statusModalValue" class="w-full px-3 py-2.5 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none mb-4">
            <optgroup v-for="node in PIPELINE_NODES" :key="node.key" :label="node.icon + ' ' + node.label">
              <option v-for="s in node.statuses" :key="s" :value="s">{{ s.replace(/_/g, ' ') }}</option>
            </optgroup>
          </select>
          <div class="flex justify-end gap-2">
            <button @click="showStatusModal = false" class="px-4 py-2 bg-neural-700 text-gray-300 rounded-lg text-xs">Cancel</button>
            <button @click="saveStatus" class="px-4 py-2 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-xs font-medium hover:opacity-90">Update</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

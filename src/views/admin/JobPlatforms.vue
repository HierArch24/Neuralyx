<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'

const admin = useAdminStore()

interface Platform {
  id: string; name: string; jobs: number
  type: 'job_board' | 'freelance' | 'aggregator' | 'company' | 'agency' | 'unknown'
  registered: boolean; profile_complete: boolean
  agent: string; agent_status: 'active' | 'idle' | 'none'
  url: string
}

// Known platforms with details
const KNOWN: Record<string, { name: string; type: Platform['type']; url: string; registered: boolean; profile_complete: boolean; agent: string; agent_status: Platform['agent_status'] }> = {
  indeed: { name: 'Indeed', type: 'job_board', url: 'https://ph.indeed.com', registered: true, profile_complete: false, agent: 'Scout Scraper', agent_status: 'active' },
  linkedin: { name: 'LinkedIn', type: 'job_board', url: 'https://linkedin.com', registered: true, profile_complete: true, agent: 'Scout + Monitor', agent_status: 'active' },
  glassdoor: { name: 'Glassdoor', type: 'job_board', url: 'https://glassdoor.com', registered: true, profile_complete: false, agent: 'Scout Scraper', agent_status: 'active' },
  ziprecruiter: { name: 'ZipRecruiter', type: 'job_board', url: 'https://ziprecruiter.com', registered: true, profile_complete: false, agent: 'Scout Scraper', agent_status: 'active' },
  jobstreet: { name: 'JobStreet PH', type: 'job_board', url: 'https://ph.jobstreet.com', registered: true, profile_complete: false, agent: 'Playwright Scraper', agent_status: 'idle' },
  // Registered
  himalayas: { name: 'Himalayas', type: 'aggregator', url: 'https://himalayas.app', registered: false, profile_complete: false, agent: 'Scout API', agent_status: 'active' },
  remoteok: { name: 'RemoteOK', type: 'aggregator', url: 'https://remoteok.com', registered: false, profile_complete: false, agent: 'Scout API', agent_status: 'active' },
  remotive: { name: 'Remotive', type: 'aggregator', url: 'https://remotive.com', registered: false, profile_complete: false, agent: 'Scout API', agent_status: 'active' },
  arbeitnow: { name: 'Arbeitnow', type: 'aggregator', url: 'https://arbeitnow.com', registered: false, profile_complete: false, agent: 'Scout API', agent_status: 'active' },
  hackernews: { name: 'HN / YC Jobs', type: 'aggregator', url: 'https://news.ycombinator.com', registered: false, profile_complete: false, agent: 'Scout API', agent_status: 'active' },
  // Third party boards
  jobleads: { name: 'JobLeads', type: 'aggregator', url: 'https://jobleads.com', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active' },
  bebee: { name: 'BeBee', type: 'aggregator', url: 'https://bebee.com', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active' },
  jobgether: { name: 'Jobgether', type: 'aggregator', url: 'https://jobgether.com', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active' },
  jobrapido: { name: 'Jobrapido', type: 'aggregator', url: 'https://jobrapido.com', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active' },
  dailyremote: { name: 'DailyRemote', type: 'aggregator', url: 'https://dailyremote.com', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active' },
  weworkremotely: { name: 'We Work Remotely', type: 'job_board', url: 'https://weworkremotely.com', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active' },
  dice: { name: 'Dice', type: 'job_board', url: 'https://dice.com', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active' },
  monster: { name: 'Monster', type: 'job_board', url: 'https://monster.com', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active' },
  simplyhired: { name: 'SimplyHired', type: 'aggregator', url: 'https://simplyhired.com', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active' },
  upwork: { name: 'Upwork', type: 'freelance', url: 'https://upwork.com', registered: false, profile_complete: false, agent: 'Project Monitor', agent_status: 'none' },
  jooble: { name: 'Jooble', type: 'aggregator', url: 'https://jooble.org', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active' },
  teal: { name: 'Teal', type: 'job_board', url: 'https://tealhq.com', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active' },
  grabjobs: { name: 'GrabJobs', type: 'job_board', url: 'https://grabjobs.co', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active' },
  // Freelance
  freelancer: { name: 'Freelancer.com', type: 'freelance', url: 'https://freelancer.com', registered: true, profile_complete: false, agent: 'Project Monitor', agent_status: 'idle' },
  careerbuilder: { name: 'CareerBuilder', type: 'job_board', url: 'https://careerbuilder.com', registered: true, profile_complete: false, agent: 'Playwright Scraper', agent_status: 'idle' },
  toptal: { name: 'Toptal', type: 'freelance', url: 'https://toptal.com', registered: false, profile_complete: false, agent: 'Not Assigned', agent_status: 'none' },
  remotehunter: { name: 'RemoteHunter', type: 'aggregator', url: 'https://remotehunter.com', registered: false, profile_complete: false, agent: 'Not Assigned', agent_status: 'none' },
  'remote.co': { name: 'Remote.co', type: 'aggregator', url: 'https://remote.co', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active' },
  learn4good: { name: 'Learn4Good', type: 'aggregator', url: 'https://learn4good.com', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active' },
  remoterocketship: { name: 'RemoteRocketship', type: 'aggregator', url: 'https://remoterocketship.com', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active' },
}

const platforms = ref<Platform[]>([])
const viewMode = ref<'table' | 'cards'>('table')
const searchQuery = ref('')
const filterType = ref('')
const filterStatus = ref('')
const currentPage = ref(1)
const perPage = 20
const showDetail = ref(false)
const detailPlatform = ref<Platform | null>(null)

onMounted(async () => {
  await admin.fetchJobListings()
  buildPlatforms()
})

function buildPlatforms() {
  const counts: Record<string, number> = {}
  for (const j of admin.jobListings) counts[j.platform] = (counts[j.platform] || 0) + 1

  const built: Platform[] = []
  for (const [id, jobs] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    const known = KNOWN[id]
    const isCompany = !known && (id.includes('careers') || id.includes('career') || id.includes('login') || id.includes('signin'))
    built.push({
      id, jobs,
      name: known?.name || id.charAt(0).toUpperCase() + id.slice(1).replace(/careers?|login|signin/gi, ' Careers').trim(),
      type: known?.type || (isCompany ? 'company' : 'unknown'),
      registered: known?.registered || false,
      profile_complete: known?.profile_complete || false,
      agent: known?.agent || (jobs > 0 ? 'JSearch Proxy' : 'None'),
      agent_status: known?.agent_status || (jobs > 0 ? 'active' : 'none'),
      url: known?.url || `https://${id.replace(/[^a-z0-9]/g, '')}.com`,
    })
  }
  platforms.value = built
}

const filtered = computed(() => {
  let p = [...platforms.value]
  if (searchQuery.value) { const q = searchQuery.value.toLowerCase(); p = p.filter(x => x.name.toLowerCase().includes(q) || x.id.toLowerCase().includes(q) || x.agent.toLowerCase().includes(q)) }
  if (filterType.value) p = p.filter(x => x.type === filterType.value)
  if (filterStatus.value === 'registered') p = p.filter(x => x.registered)
  if (filterStatus.value === 'active') p = p.filter(x => x.agent_status === 'active')
  if (filterStatus.value === 'company') p = p.filter(x => x.type === 'company')
  return p
})

const totalPages = computed(() => Math.ceil(filtered.value.length / perPage))
const paginated = computed(() => filtered.value.slice((currentPage.value - 1) * perPage, currentPage.value * perPage))

const stats = computed(() => ({
  total: platforms.value.length,
  registered: platforms.value.filter(p => p.registered).length,
  active: platforms.value.filter(p => p.agent_status === 'active').length,
  companies: platforms.value.filter(p => p.type === 'company').length,
  boards: platforms.value.filter(p => p.type === 'job_board').length,
  totalJobs: platforms.value.reduce((s, p) => s + p.jobs, 0),
}))

function profileScore(p: Platform): number {
  let s = 0
  if (p.registered) s += 20; if (p.type !== 'aggregator' && p.profile_complete) s += 30
  if (p.registered && p.type !== 'aggregator') s += 10 // email assumed verified
  if (p.jobs > 0) s += 20; if (p.agent_status === 'active') s += 20
  return Math.min(s, 100)
}
function scoreColor(s: number) { return s >= 80 ? 'text-green-400' : s >= 50 ? 'text-yellow-400' : s >= 20 ? 'text-orange-400' : 'text-red-400' }
function scoreBg(s: number) { return s >= 80 ? 'bg-green-500' : s >= 50 ? 'bg-yellow-500' : s >= 20 ? 'bg-orange-500' : 'bg-gray-700' }

function typeBg(t: string) {
  const m: Record<string, string> = { job_board: 'bg-blue-500/15 text-blue-400', freelance: 'bg-purple-500/15 text-purple-400', aggregator: 'bg-cyan-500/15 text-cyan-400', company: 'bg-green-500/15 text-green-400', agency: 'bg-orange-500/15 text-orange-400', unknown: 'bg-gray-500/15 text-gray-400' }
  return m[t] || m.unknown
}
function agentDot(s: string) { return s === 'active' ? 'bg-green-400 animate-pulse' : s === 'idle' ? 'bg-yellow-400' : 'bg-gray-600' }
function viewDetail(p: Platform) { detailPlatform.value = p; showDetail.value = true }
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-5">
      <div>
        <h2 class="text-2xl font-bold text-white">Platforms</h2>
        <p class="text-sm text-gray-400 mt-1">{{ stats.total }} sources · {{ stats.boards }} job boards · {{ stats.companies }} company sites · {{ stats.active }} agents active · {{ stats.totalJobs }} jobs</p>
      </div>
      <div class="flex gap-2">
        <button @click="viewMode = 'table'" class="px-3 py-1.5 rounded-lg text-xs" :class="viewMode === 'table' ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-neural-700 text-gray-400'">Table</button>
        <button @click="viewMode = 'cards'" class="px-3 py-1.5 rounded-lg text-xs" :class="viewMode === 'cards' ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-neural-700 text-gray-400'">Cards</button>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex gap-3 mb-4 items-center">
      <div class="flex-1 relative">
        <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input v-model="searchQuery" @input="currentPage = 1" placeholder="Search platforms, agents..." class="w-full pl-10 pr-4 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm placeholder-gray-500 focus:border-cyber-purple focus:outline-none" />
      </div>
      <select v-model="filterType" @change="currentPage = 1" class="px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none">
        <option value="">All Types</option>
        <option value="job_board">Job Boards ({{ stats.boards }})</option>
        <option value="aggregator">Aggregators</option>
        <option value="company">Company Sites ({{ stats.companies }})</option>
        <option value="freelance">Freelance</option>
      </select>
      <select v-model="filterStatus" @change="currentPage = 1" class="px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none">
        <option value="">All</option>
        <option value="registered">Registered</option>
        <option value="active">Agent Active</option>
        <option value="company">Company Sites</option>
      </select>
      <span class="text-[10px] text-gray-500 shrink-0">{{ filtered.length }} · Pg {{ currentPage }}/{{ totalPages }}</span>
    </div>

    <!-- TABLE VIEW -->
    <div v-if="viewMode === 'table'" class="glass-dark rounded-xl overflow-hidden border border-neural-700/50">
      <table class="w-full text-sm">
        <thead class="bg-neural-700/40">
          <tr>
            <th class="text-left px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase w-8">#</th>
            <th class="text-left px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Platform</th>
            <th class="text-left px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Type</th>
            <th class="text-left px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase">AI Sub-Agent</th>
            <th class="text-center px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Score</th>
            <th class="text-center px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Registered</th>
            <th class="text-center px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Jobs</th>
            <th class="text-right px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(p, idx) in paginated" :key="p.id" class="border-t border-neural-700/30 hover:bg-neural-700/20 transition-colors cursor-pointer" @click="viewDetail(p)">
            <td class="px-3 py-2 text-gray-600 text-[10px]">{{ (currentPage - 1) * perPage + idx + 1 }}</td>
            <td class="px-3 py-2">
              <p class="text-xs text-white font-medium">{{ p.name }}</p>
              <p class="text-[9px] text-gray-600">{{ p.id }}</p>
            </td>
            <td class="px-3 py-2"><span class="px-1.5 py-0.5 rounded text-[9px] font-medium capitalize" :class="typeBg(p.type)">{{ p.type.replace('_', ' ') }}</span></td>
            <td class="px-3 py-2">
              <div class="flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full" :class="agentDot(p.agent_status)" />
                <span class="text-[10px] text-gray-300">{{ p.agent }}</span>
              </div>
            </td>
            <td class="px-3 py-2 text-center">
              <div class="flex items-center justify-center gap-1">
                <span class="text-[10px] font-bold" :class="scoreColor(profileScore(p))">{{ profileScore(p) }}%</span>
                <div class="w-8 h-1 bg-neural-700 rounded-full overflow-hidden"><div class="h-full rounded-full" :class="scoreBg(profileScore(p))" :style="{ width: profileScore(p) + '%' }" /></div>
              </div>
            </td>
            <td class="px-3 py-2 text-center">
              <span v-if="p.registered" class="text-green-400 text-xs">✓</span>
              <span v-else class="text-gray-600 text-xs">—</span>
            </td>
            <td class="px-3 py-2 text-center text-xs text-white">{{ p.jobs }}</td>
            <td class="px-3 py-2 text-right">
              <a :href="p.url" target="_blank" class="p-1 rounded hover:bg-neural-600 text-gray-500 hover:text-cyber-cyan transition-colors inline-block" title="Visit">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- CARD VIEW -->
    <div v-else class="grid grid-cols-2 lg:grid-cols-4 gap-2">
      <div v-for="p in paginated" :key="p.id"
        class="glass-dark rounded-lg p-3 border border-neural-700/50 hover:border-neural-600 transition-colors cursor-pointer"
        @click="viewDetail(p)">
        <div class="flex items-center justify-between mb-2">
          <p class="text-xs text-white font-medium truncate">{{ p.name }}</p>
          <span class="w-1.5 h-1.5 rounded-full" :class="agentDot(p.agent_status)" />
        </div>
        <div class="flex items-center justify-between">
          <span class="px-1.5 py-0.5 rounded text-[8px] font-medium capitalize" :class="typeBg(p.type)">{{ p.type.replace('_', ' ') }}</span>
          <span class="text-[10px] text-white font-bold">{{ p.jobs }}</span>
        </div>
        <p class="text-[9px] text-gray-600 mt-1">{{ p.agent }}</p>
        <div class="flex gap-1 mt-1">
          <span v-if="p.registered" class="text-[8px] text-green-400">✓ Registered</span>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-between mt-4">
      <p class="text-[10px] text-gray-500">{{ (currentPage - 1) * perPage + 1 }}-{{ Math.min(currentPage * perPage, filtered.length) }} of {{ filtered.length }}</p>
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
    <!-- Detail Modal -->
    <Teleport to="body">
      <div v-if="showDetail && detailPlatform" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="showDetail = false">
        <div class="glass-dark rounded-xl w-full max-w-lg border border-neural-600 max-h-[85vh] flex flex-col">
          <div class="px-6 py-4 border-b border-neural-700 shrink-0 flex items-center justify-between">
            <div>
              <h3 class="text-lg font-bold text-white">{{ detailPlatform.name }}</h3>
              <a :href="detailPlatform.url" target="_blank" class="text-xs text-cyber-cyan hover:underline">{{ detailPlatform.url }}</a>
            </div>
            <div class="flex items-center gap-3">
              <div class="text-center">
                <span class="text-2xl font-bold" :class="scoreColor(profileScore(detailPlatform))">{{ profileScore(detailPlatform) }}%</span>
                <div class="w-16 h-1.5 bg-neural-700 rounded-full overflow-hidden mt-1"><div class="h-full rounded-full" :class="scoreBg(profileScore(detailPlatform))" :style="{ width: profileScore(detailPlatform) + '%' }" /></div>
              </div>
              <button @click="showDetail = false" class="p-2 rounded-lg hover:bg-neural-600 text-gray-400 hover:text-white"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
          </div>
          <div class="flex-1 overflow-y-auto p-6 space-y-4">
            <!-- Type + Agent -->
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                <p class="text-[9px] text-gray-500 uppercase">Platform Type</p>
                <span class="px-2 py-0.5 rounded text-xs font-medium capitalize" :class="typeBg(detailPlatform.type)">{{ detailPlatform.type.replace('_', ' ') }}</span>
              </div>
              <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                <p class="text-[9px] text-gray-500 uppercase">AI Sub-Agent</p>
                <div class="flex items-center gap-1.5 mt-1">
                  <span class="w-2 h-2 rounded-full" :class="agentDot(detailPlatform.agent_status)" />
                  <span class="text-xs text-white">{{ detailPlatform.agent }}</span>
                </div>
              </div>
            </div>
            <!-- Status Checklist -->
            <div class="bg-neural-800/50 rounded-lg p-4 border border-neural-700/30">
              <h4 class="text-[9px] text-gray-500 uppercase tracking-wider mb-3">Profile Status</h4>
              <div class="space-y-2">
                <div class="flex items-center gap-3">
                  <span class="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px]" :class="detailPlatform.registered ? 'border-green-500 bg-green-500 text-white' : 'border-gray-600'">{{ detailPlatform.registered ? '✓' : '' }}</span>
                  <span class="text-xs" :class="detailPlatform.registered ? 'text-white' : 'text-gray-500'">Account Registered</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px]" :class="detailPlatform.registered ? 'border-green-500 bg-green-500 text-white' : 'border-gray-600'">{{ detailPlatform.registered ? '✓' : '' }}</span>
                  <span class="text-xs" :class="detailPlatform.registered ? 'text-white' : 'text-gray-500'">Email Verified (gabrielalvin.jobs@gmail.com)</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px]" :class="detailPlatform.jobs > 0 ? 'border-green-500 bg-green-500 text-white' : 'border-gray-600'">{{ detailPlatform.jobs > 0 ? '✓' : '' }}</span>
                  <span class="text-xs" :class="detailPlatform.jobs > 0 ? 'text-white' : 'text-gray-500'">Jobs Pulling ({{ detailPlatform.jobs }} found)</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px]" :class="detailPlatform.agent_status === 'active' ? 'border-green-500 bg-green-500 text-white' : 'border-gray-600'">{{ detailPlatform.agent_status === 'active' ? '✓' : '' }}</span>
                  <span class="text-xs" :class="detailPlatform.agent_status === 'active' ? 'text-white' : 'text-gray-500'">AI Agent Active</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px]" :class="detailPlatform.profile_complete ? 'border-green-500 bg-green-500 text-white' : 'border-gray-600'">{{ detailPlatform.profile_complete ? '✓' : '' }}</span>
                  <span class="text-xs" :class="detailPlatform.profile_complete ? 'text-white' : 'text-gray-500'">Profile Complete (resume + skills)</span>
                </div>
              </div>
            </div>
            <!-- Stats -->
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-neural-800/50 rounded-lg p-3 text-center border border-neural-700/30">
                <p class="text-lg font-bold text-blue-400">{{ detailPlatform.jobs }}</p>
                <p class="text-[9px] text-gray-500">Jobs Pulled</p>
              </div>
              <div class="bg-neural-800/50 rounded-lg p-3 text-center border border-neural-700/30">
                <p class="text-xs text-gray-400 capitalize">{{ detailPlatform.agent_status }}</p>
                <p class="text-[9px] text-gray-500">Agent Status</p>
              </div>
            </div>
            <!-- Actions -->
            <div class="flex gap-2 pt-3 border-t border-neural-700">
              <a :href="detailPlatform.url" target="_blank" class="px-4 py-2 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-xs font-medium hover:opacity-90">Visit Platform</a>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

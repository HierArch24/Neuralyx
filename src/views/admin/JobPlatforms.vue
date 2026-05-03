<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useAdminStore } from '@/stores/admin'

const admin = useAdminStore()

interface Subscription {
  required: boolean
  plan: 'free' | 'freemium' | 'paid'
  monthly?: string
  annually?: string
  details?: string
  pricing_url?: string
}

interface Platform {
  id: string; name: string; jobs: number
  type: 'job_board' | 'freelance' | 'aggregator' | 'company' | 'agency' | 'unknown'
  registered: boolean; profile_complete: boolean
  agent: string; agent_status: 'active' | 'idle' | 'none'
  url: string
  login_type: 'google' | 'email' | 'github' | 'none'
  login_status: 'logged_in' | 'logged_out' | 'n/a'
  subscription: Subscription
}

// Known platforms with details
const SUB_FREE: Subscription = { required: false, plan: 'free' }
const SUB_FREEMIUM = (m: string, a: string, details: string, url: string): Subscription => ({ required: true, plan: 'freemium', monthly: m, annually: a, details, pricing_url: url })
const SUB_PAID = (m: string, a: string, details: string, url: string): Subscription => ({ required: true, plan: 'paid', monthly: m, annually: a, details, pricing_url: url })

type KnownPlatform = { name: string; type: Platform['type']; url: string; registered: boolean; profile_complete: boolean; agent: string; agent_status: Platform['agent_status']; login_type: Platform['login_type']; login_status: Platform['login_status']; subscription: Subscription }
const KNOWN: Record<string, KnownPlatform> = {
  // ── Active API platforms (pulling jobs now) ──────────────────────────
  himalayas: { name: 'Himalayas', type: 'aggregator', url: 'https://himalayas.app', registered: false, profile_complete: false, agent: 'Scout API', agent_status: 'active', login_type: 'none', login_status: 'n/a', subscription: SUB_FREE },
  remoteok: { name: 'RemoteOK', type: 'aggregator', url: 'https://remoteok.com', registered: false, profile_complete: false, agent: 'Scout API', agent_status: 'active', login_type: 'none', login_status: 'n/a', subscription: SUB_FREE },
  remotive: { name: 'Remotive', type: 'aggregator', url: 'https://remotive.com', registered: false, profile_complete: false, agent: 'Scout API', agent_status: 'active', login_type: 'none', login_status: 'n/a', subscription: SUB_FREEMIUM('$39', '$299/yr', 'Free: basic search + API (limited). Pro: unlimited alerts, advanced filters, salary insights, company profiles, priority support, API access.', 'https://remotive.com/pricing') },
  arbeitnow: { name: 'Arbeitnow', type: 'aggregator', url: 'https://arbeitnow.com', registered: false, profile_complete: false, agent: 'Scout API', agent_status: 'active', login_type: 'none', login_status: 'n/a', subscription: SUB_FREE },
  hackernews: { name: 'HN / YC Jobs', type: 'aggregator', url: 'https://news.ycombinator.com', registered: false, profile_complete: false, agent: 'Scout API', agent_status: 'active', login_type: 'none', login_status: 'n/a', subscription: SUB_FREE },
  // ── Active API + Account platforms (pulling via JSearch) ─────────────
  indeed: { name: 'Indeed', type: 'job_board', url: 'https://ph.indeed.com', registered: true, profile_complete: false, agent: 'Scout Scraper', agent_status: 'active', login_type: 'google', login_status: 'logged_in', subscription: SUB_FREEMIUM('$5', '$45/yr', 'Free job search & apply. Indeed Resume: highlighted to employers. Sponsored jobs get priority.', 'https://ph.indeed.com/career-advice/finding-a-job/indeed-premium') },
  linkedin: { name: 'LinkedIn', type: 'job_board', url: 'https://linkedin.com', registered: true, profile_complete: false, agent: 'Scout + Monitor', agent_status: 'active', login_type: 'google', login_status: 'logged_out', subscription: SUB_FREEMIUM('$29.99', '$239.88/yr', 'Free: search & apply. Premium Career: InMail, who viewed profile, salary insights, AI resume review, top applicant badge.', 'https://www.linkedin.com/premium/products/') },
  glassdoor: { name: 'Glassdoor', type: 'job_board', url: 'https://glassdoor.com', registered: true, profile_complete: false, agent: 'Scout Scraper', agent_status: 'active', login_type: 'google', login_status: 'logged_out', subscription: SUB_FREE },
  ziprecruiter: { name: 'ZipRecruiter', type: 'job_board', url: 'https://ziprecruiter.com', registered: true, profile_complete: false, agent: 'Scout Scraper', agent_status: 'active', login_type: 'email', login_status: 'logged_in', subscription: SUB_FREE },
  google_jobs: { name: 'Google Jobs', type: 'aggregator', url: 'https://www.google.com/search?q=jobs', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active', login_type: 'none', login_status: 'n/a', subscription: SUB_FREE },
  // ── Account platforms (Playwright Phase 2 — toggled OFF) ─────────────
  jobstreet: { name: 'JobStreet PH', type: 'job_board', url: 'https://ph.jobstreet.com', registered: true, profile_complete: false, agent: 'Playwright Scraper', agent_status: 'active', login_type: 'google', login_status: 'logged_out', subscription: SUB_FREE },
  kalibrr: { name: 'Kalibrr', type: 'job_board', url: 'https://kalibrr.com', registered: true, profile_complete: false, agent: 'Playwright Scraper', agent_status: 'active', login_type: 'email', login_status: 'logged_out', subscription: SUB_FREE },
  onlinejobs: { name: 'OnlineJobs.ph', type: 'job_board', url: 'https://onlinejobs.ph', registered: true, profile_complete: false, agent: 'Playwright Scraper', agent_status: 'active', login_type: 'email', login_status: 'logged_out', subscription: SUB_FREE },
  bossjob: { name: 'Bossjob', type: 'job_board', url: 'https://bossjob.ph', registered: true, profile_complete: false, agent: 'Playwright Scraper', agent_status: 'active', login_type: 'email', login_status: 'logged_out', subscription: SUB_FREE },
  careerbuilder: { name: 'CareerBuilder', type: 'job_board', url: 'https://careerbuilder.com', registered: true, profile_complete: false, agent: 'Playwright Scraper', agent_status: 'active', login_type: 'email', login_status: 'logged_out', subscription: SUB_FREE },
  // ── Freelance platforms ──────────────────────────────────────────────
  freelancer: { name: 'Freelancer.com', type: 'freelance', url: 'https://freelancer.com', registered: true, profile_complete: false, agent: 'Project Monitor', agent_status: 'active', login_type: 'email', login_status: 'logged_out', subscription: SUB_FREEMIUM('$4.95', '$49.95/yr', 'Free: bid on projects (limited bids/month). Plus: 50 bids/mo, priority support. Professional: 100 bids/mo, highlighted profile.', 'https://www.freelancer.com/membership') },
  toptal: { name: 'Toptal', type: 'freelance', url: 'https://toptal.com', registered: true, profile_complete: false, agent: 'Playwright Scraper', agent_status: 'active', login_type: 'email', login_status: 'logged_out', subscription: { required: false, plan: 'free', details: 'Free for talent. Screening process required. No subscription — Toptal takes commission from client billing.' } },
  careerdotio: { name: 'Career.io', type: 'job_board', url: 'https://career.io', registered: true, profile_complete: false, agent: 'Not Assigned', agent_status: 'none', login_type: 'email', login_status: 'logged_out', subscription: SUB_PAID('$5.95', '$44.95/yr', 'Resume builder, cover letter generator, job tracker, interview prep. 7-day trial available.', 'https://career.io/pricing') },
  upwork: { name: 'Upwork', type: 'freelance', url: 'https://upwork.com', registered: false, profile_complete: false, agent: 'Project Monitor', agent_status: 'none', login_type: 'none', login_status: 'n/a', subscription: SUB_FREEMIUM('$14.99', '$', 'Free: 10 Connects/month. Freelancer Plus: 80 Connects/mo, profile visibility boost, custom profile URL.', 'https://www.upwork.com/freelancer-plus') },
  // ── JSearch proxy boards (no account) ────────────────────────────────
  jobleads: { name: 'JobLeads', type: 'aggregator', url: 'https://jobleads.com', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active', login_type: 'none', login_status: 'n/a', subscription: SUB_PAID('$9.95', '$59.95/yr', 'Premium job recommendations, direct employer contacts, salary insights.', 'https://www.jobleads.com/premium') },
  bebee: { name: 'BeBee', type: 'aggregator', url: 'https://bebee.com', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active', login_type: 'none', login_status: 'n/a', subscription: SUB_FREE },
  jobgether: { name: 'Jobgether', type: 'aggregator', url: 'https://jobgether.com', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active', login_type: 'none', login_status: 'n/a', subscription: SUB_FREE },
  jobrapido: { name: 'Jobrapido', type: 'aggregator', url: 'https://jobrapido.com', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active', login_type: 'none', login_status: 'n/a', subscription: SUB_FREE },
  dailyremote: { name: 'DailyRemote', type: 'aggregator', url: 'https://dailyremote.com', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active', login_type: 'none', login_status: 'n/a', subscription: SUB_FREE },
  weworkremotely: { name: 'We Work Remotely', type: 'job_board', url: 'https://weworkremotely.com', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active', login_type: 'none', login_status: 'n/a', subscription: SUB_FREE },
  monster: { name: 'Monster', type: 'job_board', url: 'https://monster.com', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active', login_type: 'none', login_status: 'n/a', subscription: SUB_FREE },
  simplyhired: { name: 'SimplyHired', type: 'aggregator', url: 'https://simplyhired.com', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active', login_type: 'none', login_status: 'n/a', subscription: SUB_FREE },
  jooble: { name: 'Jooble', type: 'aggregator', url: 'https://jooble.org', registered: true, profile_complete: true, agent: 'Scout API + JSearch Proxy', agent_status: 'active', login_type: 'email', login_status: 'logged_in', subscription: { required: false, plan: 'free', details: 'Free for job seekers. Aggregates 70+ job boards. Resume upload, email alerts, saved searches.' } },
  teal: { name: 'Teal', type: 'job_board', url: 'https://tealhq.com', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active', login_type: 'none', login_status: 'n/a', subscription: SUB_FREEMIUM('$9', '$72/yr', 'Free: job tracker, resume builder. Pro+: AI resume tailoring, unlimited tracking, cover letters.', 'https://www.tealhq.com/pricing') },
  grabjobs: { name: 'GrabJobs', type: 'job_board', url: 'https://grabjobs.co', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active', login_type: 'none', login_status: 'n/a', subscription: SUB_FREE },
  'remote.co': { name: 'Remote.co', type: 'aggregator', url: 'https://remote.co', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active', login_type: 'none', login_status: 'n/a', subscription: SUB_FREE },
  learn4good: { name: 'Learn4Good', type: 'aggregator', url: 'https://learn4good.com', registered: false, profile_complete: false, agent: 'JSearch Proxy', agent_status: 'active', login_type: 'none', login_status: 'n/a', subscription: SUB_FREE },
  remoterocketship: { name: 'RemoteRocketship', type: 'aggregator', url: 'https://remoterocketship.com', registered: true, profile_complete: true, agent: 'Scout API + JSearch Proxy', agent_status: 'active', login_type: 'email', login_status: 'logged_in', subscription: SUB_FREEMIUM('$19', '$149/yr', 'Free: browse jobs, basic search. Pro: unlimited alerts, advanced filters, salary data, company insights, apply tracker.', 'https://www.remoterocketship.com/pricing') },
  remotehunter: { name: 'RemoteHunter', type: 'aggregator', url: 'https://remotehunter.com', registered: false, profile_complete: false, agent: 'Not Assigned', agent_status: 'none', login_type: 'none', login_status: 'n/a', subscription: SUB_FREE },
  metacareers: { name: 'Meta Careers', type: 'company', url: 'https://www.metacareers.com', registered: false, profile_complete: false, agent: 'Playwright Scraper', agent_status: 'idle', login_type: 'none', login_status: 'n/a', subscription: SUB_FREE },
  jobslin: { name: 'Jobslin PH', type: 'job_board', url: 'https://ph.jobslin.com', registered: false, profile_complete: false, agent: 'Playwright Scraper', agent_status: 'idle', login_type: 'email', login_status: 'n/a', subscription: SUB_FREE },
}

const platforms = ref<Platform[]>([])
const viewMode = ref<'table' | 'cards'>('table')
const searchQuery = ref('')
const filterType = ref('')
const filterStatus = ref('')
const filterLogin = ref('')
const filterSub = ref('')
const currentPage = ref(1)
const perPage = 20
const showDetail = ref(false)
const detailPlatform = ref<Platform | null>(null)
const showSubDetail = ref(false)
const subDetailPlatform = ref<Platform | null>(null)
const loginCheckLoading = ref(false)
const loginCheckResult = ref<Record<string, boolean> | null>(null)

let refreshTimer: ReturnType<typeof setInterval> | null = null

async function checkLiveLoginStatus() {
  loginCheckLoading.value = true
  try {
    // Try the local apply server first (port 8081)
    const res = await fetch('http://localhost:8081/login-check', { signal: AbortSignal.timeout(120000) })
    if (res.ok) {
      const data = await res.json()
      loginCheckResult.value = data.status || {}
      // Update platform login statuses with live data
      for (const p of platforms.value) {
        if (loginCheckResult.value && p.id in loginCheckResult.value) {
          p.login_status = loginCheckResult.value[p.id] ? 'logged_in' : 'logged_out'
        }
      }
    }
  } catch {
    // Fallback: read from screenshots/login-status.json via MCP
    try {
      const res = await fetch(`${import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'}/api/fetch-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://localhost:8081/login-check' }),
        signal: AbortSignal.timeout(120000),
      })
      if (res.ok) {
        const data = await res.json()
        loginCheckResult.value = data.status || {}
      }
    } catch { /* apply server not running */ }
  } finally {
    loginCheckLoading.value = false
  }
}

onMounted(async () => {
  await admin.fetchJobListings()
  buildPlatforms()
  // Auto-refresh every 30 seconds to pick up new jobs
  refreshTimer = setInterval(async () => {
    await admin.fetchJobListings()
    buildPlatforms()
  }, 30000)
})

onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer) })

// Also rebuild when job listings change
watch(() => admin.jobListings.length, () => buildPlatforms())

function buildPlatforms() {
  const counts: Record<string, number> = {}
  for (const j of admin.jobListings) counts[j.platform] = (counts[j.platform] || 0) + 1

  const seen = new Set<string>()
  const built: Platform[] = []

  // First add platforms from job listings (sorted by job count)
  for (const [id, jobs] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    seen.add(id)
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
      login_type: known?.login_type || 'none',
      login_status: known?.login_status || 'n/a',
      subscription: known?.subscription || SUB_FREE,
    })
  }

  // Then add all KNOWN platforms that weren't in job listings
  for (const [id, known] of Object.entries(KNOWN)) {
    if (seen.has(id)) continue
    built.push({
      id, jobs: 0,
      name: known.name, type: known.type, registered: known.registered,
      profile_complete: known.profile_complete, agent: known.agent,
      agent_status: known.agent_status, url: known.url,
      login_type: known.login_type, login_status: known.login_status,
      subscription: known.subscription,
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
  if (filterStatus.value === 'logged_in') p = p.filter(x => x.login_status === 'logged_in')
  if (filterStatus.value === 'idle') p = p.filter(x => x.agent_status === 'idle')
  if (filterStatus.value === 'company') p = p.filter(x => x.type === 'company')
  if (filterLogin.value) p = p.filter(x => x.login_type === filterLogin.value)
  if (filterSub.value === 'free') p = p.filter(x => x.subscription.plan === 'free')
  if (filterSub.value === 'paid') p = p.filter(x => x.subscription.plan !== 'free')
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
  // Aggregators / API-only platforms: scored by agent + jobs
  if (p.type === 'aggregator' || p.login_type === 'none') {
    let s = 0
    if (p.agent_status === 'active') s += 50
    if (p.jobs > 0) s += 50
    return Math.min(s, 100)
  }
  // Registered platforms: scored by full onboarding
  let s = 0
  if (p.registered) s += 20
  if (p.profile_complete) s += 20
  if (p.login_status === 'logged_in') s += 20
  s += 10 // credentials configured (login_type is google/email/github here)
  if (p.agent_status === 'active') s += 15
  if (p.jobs > 0) s += 15
  return Math.min(s, 100)
}
function scoreColor(s: number) { return s >= 80 ? 'text-green-400' : s >= 50 ? 'text-yellow-400' : s >= 20 ? 'text-orange-400' : 'text-red-400' }
function scoreBg(s: number) { return s >= 80 ? 'bg-green-500' : s >= 50 ? 'bg-yellow-500' : s >= 20 ? 'bg-orange-500' : 'bg-gray-700' }

function typeBg(t: string) {
  const m: Record<string, string> = { job_board: 'bg-blue-500/15 text-blue-400', freelance: 'bg-purple-500/15 text-purple-400', aggregator: 'bg-cyan-500/15 text-cyan-400', company: 'bg-green-500/15 text-green-400', agency: 'bg-orange-500/15 text-orange-400', unknown: 'bg-gray-500/15 text-gray-400' }
  return m[t] || m.unknown
}
function agentDot(s: string) { return s === 'active' ? 'bg-green-400 animate-pulse' : s === 'idle' ? 'bg-yellow-400' : 'bg-gray-600' }
function loginTypeBg(t: string) {
  const m: Record<string, string> = { google: 'bg-red-500/15 text-red-400', email: 'bg-amber-500/15 text-amber-400', github: 'bg-gray-500/15 text-gray-300', none: 'bg-neural-700/50 text-gray-600' }
  return m[t] || m.none
}
function subPlanBg(plan: string) {
  return plan === 'free' ? 'bg-green-500/15 text-green-400' : plan === 'freemium' ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'
}
function viewDetail(p: Platform) { detailPlatform.value = p; showDetail.value = true }
function viewSub(p: Platform, e: Event) { e.stopPropagation(); subDetailPlatform.value = p; showSubDetail.value = true }
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
    <div class="flex gap-2 mb-4 items-center flex-wrap">
      <div class="flex-1 min-w-[180px] relative">
        <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input v-model="searchQuery" @input="currentPage = 1" placeholder="Search platforms, agents..." class="w-full pl-10 pr-4 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm placeholder-gray-500 focus:border-cyber-purple focus:outline-none" />
      </div>
      <select v-model="filterType" @change="currentPage = 1" class="px-2.5 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-[10px] focus:border-cyber-purple focus:outline-none">
        <option value="">All Types</option>
        <option value="job_board">Job Boards</option>
        <option value="aggregator">Aggregators</option>
        <option value="freelance">Freelance</option>
        <option value="company">Company Sites</option>
      </select>
      <select v-model="filterStatus" @change="currentPage = 1" class="px-2.5 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-[10px] focus:border-cyber-purple focus:outline-none">
        <option value="">All Status</option>
        <option value="registered">Registered</option>
        <option value="logged_in">Logged In</option>
        <option value="active">Agent Active</option>
        <option value="idle">Agent Idle</option>
      </select>
      <select v-model="filterLogin" @change="currentPage = 1" class="px-2.5 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-[10px] focus:border-cyber-purple focus:outline-none">
        <option value="">All Login</option>
        <option value="google">Google OAuth</option>
        <option value="email">Email/Password</option>
        <option value="github">GitHub</option>
        <option value="none">No Login</option>
      </select>
      <select v-model="filterSub" @change="currentPage = 1" class="px-2.5 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-[10px] focus:border-cyber-purple focus:outline-none">
        <option value="">All Plans</option>
        <option value="free">Free Only</option>
        <option value="paid">Paid / Freemium</option>
      </select>
      <span class="text-[10px] text-gray-500 shrink-0">{{ filtered.length }} · Pg {{ currentPage }}/{{ totalPages }}</span>
      <button
        @click="checkLiveLoginStatus"
        :disabled="loginCheckLoading"
        class="px-3 py-2 bg-cyber-purple/20 border border-cyber-purple/40 rounded-lg text-[10px] font-medium text-cyber-purple hover:bg-cyber-purple/30 transition-all disabled:opacity-50 shrink-0"
      >
        {{ loginCheckLoading ? 'Checking logins...' : 'Check Login Status' }}
      </button>
    </div>

    <!-- TABLE VIEW -->
    <div v-if="viewMode === 'table'" class="glass-dark rounded-xl overflow-hidden border border-neural-700/50">
      <table class="w-full text-sm">
        <thead class="bg-neural-700/40">
          <tr>
            <th class="text-left px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase w-8">#</th>
            <th class="text-left px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Platform</th>
            <th class="text-left px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Type</th>
            <th class="text-left px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Login</th>
            <th class="text-center px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Status</th>
            <th class="text-left px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase">AI Sub-Agent</th>
            <th class="text-left px-3 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Subscription</th>
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
              <span class="px-1.5 py-0.5 rounded text-[9px] font-medium capitalize" :class="loginTypeBg(p.login_type)">{{ p.login_type === 'none' ? '—' : p.login_type }}</span>
            </td>
            <td class="px-3 py-2 text-center">
              <span v-if="p.login_status === 'logged_in'" class="text-green-400 text-[10px] font-medium">● Active</span>
              <span v-else-if="p.login_status === 'logged_out'" class="text-red-400 text-[10px] font-medium">● Offline</span>
              <span v-else class="text-gray-600 text-[10px]">—</span>
            </td>
            <td class="px-3 py-2">
              <div class="flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full" :class="agentDot(p.agent_status)" />
                <span class="text-[10px] text-gray-300">{{ p.agent }}</span>
              </div>
            </td>
            <td class="px-3 py-2">
              <div class="flex flex-col gap-0.5">
                <div class="flex items-center gap-1.5">
                  <span class="px-1.5 py-0.5 rounded text-[9px] font-medium capitalize" :class="subPlanBg(p.subscription.plan)">{{ p.subscription.plan }}</span>
                  <span v-if="p.subscription.monthly" class="text-[9px] text-green-400 font-medium">{{ p.subscription.monthly }}/mo</span>
                  <button v-if="p.subscription.plan !== 'free'" @click="viewSub(p, $event)" class="px-1.5 py-0.5 rounded text-[8px] bg-neural-600 text-gray-300 hover:text-white hover:bg-neural-500 transition-colors" title="View pricing details">Details</button>
                </div>
                <span v-if="p.subscription.details" class="text-[8px] text-gray-500 truncate max-w-[200px]" :title="p.subscription.details">{{ p.subscription.details.slice(0, 50) }}{{ p.subscription.details.length > 50 ? '...' : '' }}</span>
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
        <div class="flex gap-1 mt-1 items-center">
          <span v-if="p.registered" class="text-[8px] text-green-400">✓ Registered</span>
          <span v-if="p.login_status === 'logged_in'" class="text-[8px] text-green-400 ml-1">● Online</span>
          <span v-if="p.login_type !== 'none'" class="text-[8px] ml-auto capitalize" :class="loginTypeBg(p.login_type)">{{ p.login_type }}</span>
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
            <!-- Type + Agent + Login -->
            <div class="grid grid-cols-3 gap-3">
              <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                <p class="text-[9px] text-gray-500 uppercase">Platform Type</p>
                <span class="px-2 py-0.5 rounded text-xs font-medium capitalize" :class="typeBg(detailPlatform.type)">{{ detailPlatform.type.replace('_', ' ') }}</span>
              </div>
              <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                <p class="text-[9px] text-gray-500 uppercase">Login Method</p>
                <div class="flex items-center gap-1.5 mt-1">
                  <span class="px-2 py-0.5 rounded text-xs font-medium capitalize" :class="loginTypeBg(detailPlatform.login_type)">{{ detailPlatform.login_type === 'none' ? 'No Login' : detailPlatform.login_type === 'google' ? 'Google OAuth' : detailPlatform.login_type === 'github' ? 'GitHub OAuth' : 'Email / Password' }}</span>
                </div>
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
                  <span class="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px]" :class="detailPlatform.login_status === 'logged_in' ? 'border-green-500 bg-green-500 text-white' : 'border-gray-600'">{{ detailPlatform.login_status === 'logged_in' ? '✓' : '' }}</span>
                  <span class="text-xs" :class="detailPlatform.login_status === 'logged_in' ? 'text-white' : 'text-gray-500'">Logged In ({{ detailPlatform.login_type === 'google' ? 'Google OAuth' : detailPlatform.login_type === 'github' ? 'GitHub' : detailPlatform.login_type === 'email' ? 'Email/Password' : 'N/A' }})</span>
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
              <button v-if="detailPlatform.subscription.plan !== 'free'" @click="subDetailPlatform = detailPlatform; showSubDetail = true" class="px-4 py-2 bg-neural-700 text-amber-400 rounded-lg text-xs font-medium hover:bg-neural-600">View Pricing</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Subscription Detail Modal -->
    <Teleport to="body">
      <div v-if="showSubDetail && subDetailPlatform" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" @click.self="showSubDetail = false">
        <div class="glass-dark rounded-xl w-full max-w-md border border-neural-600">
          <div class="px-6 py-4 border-b border-neural-700 flex items-center justify-between">
            <div>
              <h3 class="text-lg font-bold text-white">{{ subDetailPlatform.name }}</h3>
              <p class="text-xs text-gray-400">Subscription Details</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded text-xs font-medium capitalize" :class="subPlanBg(subDetailPlatform.subscription.plan)">{{ subDetailPlatform.subscription.plan }}</span>
              <button @click="showSubDetail = false" class="p-2 rounded-lg hover:bg-neural-600 text-gray-400 hover:text-white">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
          <div class="p-6 space-y-4">
            <!-- Pricing Cards -->
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-neural-800/50 rounded-lg p-4 border border-neural-700/30 text-center">
                <p class="text-[9px] text-gray-500 uppercase tracking-wider">Monthly</p>
                <p class="text-xl font-bold text-white mt-1">{{ subDetailPlatform.subscription.monthly || '—' }}</p>
                <p class="text-[9px] text-gray-500 mt-1">per month</p>
              </div>
              <div class="bg-neural-800/50 rounded-lg p-4 border border-cyber-purple/30 text-center">
                <p class="text-[9px] text-cyber-purple uppercase tracking-wider">Annual</p>
                <p class="text-xl font-bold text-white mt-1">{{ subDetailPlatform.subscription.annually || '—' }}</p>
                <p class="text-[9px] text-gray-500 mt-1">per year</p>
              </div>
            </div>
            <!-- Details -->
            <div class="bg-neural-800/50 rounded-lg p-4 border border-neural-700/30">
              <h4 class="text-[9px] text-gray-500 uppercase tracking-wider mb-2">What's Included</h4>
              <p class="text-xs text-gray-300 leading-relaxed">{{ subDetailPlatform.subscription.details }}</p>
            </div>
            <!-- Actions -->
            <div class="flex gap-2 pt-2">
              <a v-if="subDetailPlatform.subscription.pricing_url" :href="subDetailPlatform.subscription.pricing_url" target="_blank" class="flex-1 px-4 py-2.5 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-xs font-medium text-center hover:opacity-90">
                View Pricing Page
              </a>
              <a :href="subDetailPlatform.url" target="_blank" class="px-4 py-2.5 bg-neural-700 text-gray-300 rounded-lg text-xs font-medium hover:bg-neural-600 text-center">
                Visit Platform
              </a>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

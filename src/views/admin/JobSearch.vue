<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useAdminStore } from '@/stores/admin'
import type { JobListing } from '@/types/database'
import { searchJobs } from '@/utils/jobSearchAgent'
import { classifyJob, matchJob, generateCoverLetter } from '@/utils/jobClassifyAgent'
import { getPlatform, countryFlag, fillJobDetails, buildUpdatePayload } from '@/utils/jobDetailAgents'
import { scrapeAllPlaywrightPlatforms } from '@/utils/jobPlaywrightScraper'
import { getAppTypeBadge, batchAutoApply } from '@/utils/jobAutoApplyAgent'

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
const detailTab = ref<'overview' | 'description' | 'match' | 'coverletter' | 'apply' | 'requirements'>('overview')
const coverLetter = ref('')
const generatingCover = ref(false)
const researching = ref(false)
const companyResearch = ref<Record<string, unknown> | null>(null)
const draftEmail = ref('')
const applyStrategy = ref<{ strategy_type: string; primary: { channel: string; tone: string; action: string; target?: string }; secondary: { channel: string; tone: string; action: string; target?: string; delay_hours: number }[]; variation_required: boolean; safety_notes: string[] } | null>(null)

// Filters extra
const filterCountry = ref('')

// Bulk
const selectedIds = ref<Set<string>>(new Set())
const selectAll = ref(false)
const scoring = ref(false)
const scoreProgress = ref('')
const filling = ref(false)
const fillProgress = ref('')
const updating = ref(false)
const updateProgress = ref('')
const updatePercent = ref(0)
const fillPercent = ref(0)

// Irrelevant job title keywords — auto-delete on cleanup
function isIrrelevantJob(title: string): boolean {
  const t = title.toLowerCase()
  const bad = ['construction', 'data qa', 'audio evaluator', 'linguist', 'translator', 'transcription', 'talent acquisition', 'recruiter', 'business development manager', 'bdm', 'regional controller', 'growth marketer', 'digital marketing m', 'marketing manager', 'content writer', 'social media manager', 'seo specialist', 'graphic design', 'nurse', 'nursing', 'teacher', 'teaching', 'accountant', 'bookkeeper', 'receptionist', 'customer service', 'call center', 'call centre', 'cashier', 'driver', 'cook', 'chef', 'waiter', 'waitress', 'barista', 'janitor', 'security guard', 'beauty', 'salon', 'massage', 'elearning', 'e-learning', 'proposals and contract', 'financial controller', 'fp&a', 'payroll', 'localization', 'proofreader', 'spanish', 'french', 'german', 'japanese', 'korean', 'mandarin', 'portuguese', 'arabic', 'italian', 'dutch', 'russian', 'turkish', 'polish', 'thai', 'vietnamese', 'hebrew', 'hindi', 'bengali', 'malay', 'indonesian', 'associate director proposals', 'engagement manager', 'luxury brand evaluator', 'delivery driver', 'sales associate', 'sales manager', 'sales representative', 'live selling', 'credit and collection', 'import department', 'telesales', 'project sales', 'licensed pharmacist', 'pr account', 'tax preparer', 'risk analyst', 'customer support rep', 'virtual assistant', 'admin assistant', 'executive assistant', 'personal assistant', 'data entry']
  return bad.some(kw => t.includes(kw))
}

// Use getPlatform from jobDetailAgents.ts (replaces inline PLATFORMS)

let jobRefreshTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await admin.fetchJobListings()
  admin.fetchJobProfile()
  await cleanupIrrelevantJobs()
  // Auto-refresh every 15 seconds to pick up new jobs in real-time
  jobRefreshTimer = setInterval(async () => {
    await admin.fetchJobListings()
  }, 15000)
})

onUnmounted(() => { if (jobRefreshTimer) clearInterval(jobRefreshTimer) })

// Deep clean: delete ALL jobs that don't match our domain
function isRelevantJob(title: string): boolean {
  const t = title.toLowerCase()
  const good = ['engineer', 'developer', 'dev ', 'software', 'fullstack', 'full-stack', 'full stack', 'frontend', 'front-end', 'backend', 'back-end', 'python', 'javascript', 'typescript', 'vue', 'react', 'node', 'php', 'laravel', 'devops', 'mlops', 'ai ', 'artificial intelligence', 'machine learning', 'ml ', 'automation', 'data engineer', 'data scientist', 'cloud', 'aws', 'docker', 'kubernetes', 'api', 'integration', 'architect', 'tech lead', 'technical lead', 'cto', 'blockchain', 'web3', 'chatbot', 'llm', 'nlp', 'scraping', 'crawler', 'sre', 'platform engineer', 'infrastructure', 'programmer', 'coding', 'rust', 'golang', 'systems engineer']
  return good.some(kw => t.includes(kw))
}

async function cleanupIrrelevantJobs() {
  // Delete jobs that are explicitly irrelevant OR not in our domain
  const toDelete = admin.jobListings.filter(j => isIrrelevantJob(j.title) || !isRelevantJob(j.title))
  if (toDelete.length === 0) return
  for (const j of toDelete) {
    try { await admin.deleteRow('job_listings', j.id) } catch { /* skip */ }
  }
  if (toDelete.length > 0) await admin.fetchJobListings()
}

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
  if (filterCountry.value) {
    const c = filterCountry.value.toLowerCase()
    jobs = jobs.filter(j => {
      const loc = (j.location || '').toLowerCase()
      const country = ((j.raw_data as Record<string, unknown>)?.country as string || '').toLowerCase()
      return loc.includes(c) || country.includes(c)
    })
  }
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

// Country options from data
const countryOptions = computed(() => {
  const countries = new Map<string, number>()
  for (const j of admin.jobListings) {
    const c = ((j.raw_data as Record<string, unknown>)?.country as string) || ''
    const loc = (j.location || '').toLowerCase()
    let key = c || (loc.includes('philippines') || loc.includes('manila') ? 'PH' : loc.includes('remote') ? 'Remote' : loc.includes('united states') || loc.includes(', us') ? 'US' : '')
    if (key) countries.set(key, (countries.get(key) || 0) + 1)
  }
  return [...countries.entries()].sort((a, b) => b[1] - a[1])
})

// Reset page on filter change
watch([filterPlatform, filterStatus, filterType, filterWFH, filterLocation, filterCountry, sortBy], () => { currentPage.value = 1 })

// Fill only NEW unfilled jobs (skip already scored)
async function fillAllJobs() {
  await admin.fetchJobListings() // Refresh first
  const unfilled = admin.jobListings.filter(j => j.match_score === null && j.status !== 'dismissed')
  if (!unfilled.length) { fillProgress.value = 'All jobs already scored'; setTimeout(() => { fillProgress.value = '' }, 2000); return }
  filling.value = true; fillPercent.value = 0
  const task = addTask('fill', `AI Scoring ${unfilled.length} new jobs`)
  let processed = 0; let scored = 0
  for (let i = 0; i < unfilled.length; i += 25) {
    const batch = unfilled.slice(i, i + 25)
    try {
      const { results } = await fillJobDetails(batch)
      for (const r of results) {
        try { await admin.updateRow('job_listings', r.id, buildUpdatePayload(r)); scored++ } catch { /* skip */ }
      }
    } catch { /* batch failed */ }
    processed += batch.length
    fillPercent.value = Math.round((processed / unfilled.length) * 100)
    fillProgress.value = `${processed}/${unfilled.length}`
    updateTask(task, fillPercent.value, `Scored ${scored} of ${processed} processed`)
  }
  await admin.fetchJobListings()
  fillPercent.value = 100; fillProgress.value = `Done!`
  finishTask(task, `${scored}/${unfilled.length} jobs scored`)
  setTimeout(() => { filling.value = false; fillProgress.value = ''; fillPercent.value = 0 }, 3000)
}

// Update Jobs: pull AI/automation/dev jobs from active platforms + auto score + auto cover letters
async function updateJobs() {
  updating.value = true; updatePercent.value = 0; updateProgress.value = 'Searching...'
  const task = addTask('update', 'Pull & Score Jobs')
  const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
  const profile = admin.jobProfile[0] || null
  try {
    // Step 1: Search
    updateTask(task, 10, 'Searching 10 platforms...')
    updatePercent.value = 10
    const res = await fetch(`${mcpUrl}/api/jobs/agent/run`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: searchQuery.value || 'AI engineer automation developer',
        location: searchLocation.value || 'Philippines, Remote',
        platforms: ['himalayas', 'remoteok', 'remotive', 'arbeitnow', 'hackernews', 'indeed', 'linkedin', 'glassdoor', 'ziprecruiter', 'google_jobs'],
        min_score: 65,
        resume_text: profile?.resume_text || '',
        skills: profile?.skills || ['Vue.js', 'TypeScript', 'Python', 'PHP', 'Laravel', 'Docker', 'OpenAI', 'Supabase', 'n8n', 'LangChain', 'AI Automation', 'MCP', 'FastAPI', 'PostgreSQL'],
        preferred_job_types: profile?.preferred_job_types || ['remote', 'full-time'],
        preferred_locations: profile?.preferred_locations || ['Philippines', 'Remote'],
      }),
      signal: AbortSignal.timeout(120000),
    })
    updatePercent.value = 35
    if (!res.ok) { finishTask(task, 'Pipeline error', true); updating.value = false; return }
    const data = await res.json()

    // Step 1b: Playwright scrape account platforms
    updateTask(task, 40, 'Scraping account platforms...')
    try {
      const { jobs: pwJobs } = await scrapeAllPlaywrightPlatforms(
        ['indeed_ph', 'jobstreet', 'kalibrr', 'onlinejobs', 'bossjob', 'freelancer'],
        searchQuery.value || 'AI engineer automation',
        (msg: string) => updateTask(task, 45, msg),
      )
      if (pwJobs.length > 0) data.jobs.push(...pwJobs)
      data.total = data.jobs.length
    } catch { /* playwright failed, continue */ }

    // Step 2: Save
    updateTask(task, 50, `Saving ${data.total} jobs...`)
    updateProgress.value = `Saving ${data.total}...`
    let saved = 0
    for (const job of (data.jobs || [])) {
      try { await admin.insertRow('job_listings', job as unknown as Record<string, unknown>); saved++ } catch { /* dup */ }
    }
    updatePercent.value = 60
    await admin.fetchJobListings()

    // Step 3: AI Fill only NEW unfilled jobs (skip already scored)
    const unfilled = admin.jobListings.filter(j => j.match_score === null && j.status !== 'dismissed')
    if (unfilled.length > 0) {
      let done = 0
      for (let i = 0; i < unfilled.length; i += 25) {
        const batch = unfilled.slice(i, i + 25)
        done += batch.length
        updateTask(task, 60 + Math.round((done / unfilled.length) * 20), `AI scoring ${done}/${unfilled.length}`)
        updateProgress.value = `Scoring ${done}/${unfilled.length}`
        try {
          const { results } = await fillJobDetails(batch)
          for (const r of results) {
            try { await admin.updateRow('job_listings', r.id, buildUpdatePayload(r)) } catch { /* skip */ }
          }
        } catch { /* batch failed */ }
      }
      await admin.fetchJobListings()
    }

    // Step 4: Delete irrelevant jobs (by title + low score)
    const titleIrrelevant = admin.jobListings.filter(j => isIrrelevantJob(j.title))
    const scoreIrrelevant = admin.jobListings.filter(j => j.status === 'new' && j.match_score !== null && j.match_score < 40 && !titleIrrelevant.includes(j))
    const allIrrelevant = [...titleIrrelevant, ...scoreIrrelevant]
    if (allIrrelevant.length > 0) {
      updateTask(task, 85, `Removing ${allIrrelevant.length} irrelevant jobs...`)
      for (const j of allIrrelevant) {
        try { await admin.deleteRow('job_listings', j.id) } catch { /* skip */ }
      }
      await admin.fetchJobListings()
    }

    // Step 5: Auto cover letters for top matches
    const topJobs = admin.jobListings.filter(j => j.status === 'new' && j.match_score !== null && j.match_score >= 75 && !((j.raw_data as Record<string, unknown>)?.cover_letter))
    if (topJobs.length > 0) {
      updateTask(task, 90, `Generating ${topJobs.length} cover letters...`)
      for (const job of topJobs.slice(0, 10)) {
        try {
          const letter = await generateCoverLetter(
            { title: job.title, company: job.company, description: job.description },
            { resume_text: profile?.resume_text, skills: profile?.skills },
            rd(job, 'role_type'), rd(job, 'company_bucket'),
          )
          if (letter) await admin.updateRow('job_listings', job.id, { raw_data: { ...(job.raw_data as Record<string, unknown> || {}), cover_letter: letter } })
        } catch { /* skip */ }
      }
      await admin.fetchJobListings()
    }

    updatePercent.value = 100
    updateProgress.value = `${saved} new`
    finishTask(task, `${saved} new jobs, ${data.matched || 0} matched, ${allIrrelevant.length} removed, ${Math.min(topJobs.length, 10)} cover letters`)
  } catch (e) {
    finishTask(task, e instanceof Error ? e.message : 'Failed', true)
  }
  setTimeout(() => { updating.value = false; updateProgress.value = ''; updatePercent.value = 0 }, 4000)
}

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

async function loadStrategy(job: JobListing) {
  const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
  try {
    const res = await fetch(`${mcpUrl}/api/jobs/strategy`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job: { ...job, raw_data: job.raw_data } }),
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) applyStrategy.value = await res.json()
  } catch { /* strategy unavailable */ }
}

function viewDetail(job: JobListing) {
  detailJob.value = job; detailTab.value = 'overview'; coverLetter.value = ''; companyResearch.value = null; draftEmail.value = ''; applyStrategy.value = null
  showDetail.value = true
  autoGenCoverLetter(job)
  researchCompany(job)
  loadStrategy(job) // Auto-load strategy
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
function p(platform: string) { return getPlatform(platform) }
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
function appBadge(type: string) { return getAppTypeBadge(type || 'unknown') }
function filterLayerStyle(layer: string): string {
  const m: Record<string, string> = { resume_screen: 'bg-blue-500/10 text-blue-400 border-blue-500/20', form_questions: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', video_intro: 'bg-pink-500/10 text-pink-400 border-pink-500/20', technical_test: 'bg-red-500/10 text-red-400 border-red-500/20', personality_test: 'bg-purple-500/10 text-purple-400 border-purple-500/20', trial_task: 'bg-orange-500/10 text-orange-400 border-orange-500/20', portfolio_review: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20', interview: 'bg-green-500/10 text-green-400 border-green-500/20' }
  return m[layer] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'
}
// ─── Requirements Library ───
const REQUIREMENTS_LIBRARY = [
  // Documents
  { id: 'resume', name: 'Resume (Latest)', category: 'document', file: '/assets/documents/resume.pdf', icon: '📄', description: 'FIX Resume March 2026 Update', selectable: false },
  { id: 'disc', name: 'DISC & Motivators Assessment', category: 'assessment', file: '/assets/documents/requirements/disc_assessment.pdf', icon: '🧠', description: 'DISC personality profile — Aquino Gabriel Alvin', selectable: false },
  { id: 'personality', name: 'TypeFinder Personality Test', category: 'assessment', file: '/assets/documents/requirements/personality_test.jpeg', icon: '🧩', description: 'TypeFinder personality test result', selectable: false },
  { id: 'intro_video', name: 'Introduction Video', category: 'document', file: '', icon: '🎥', description: 'Pre-recorded video introduction — auto-submitted when required', selectable: false },
  // Government IDs (for outsourcing agencies)
  { id: 'nbi', name: 'NBI Clearance', category: 'government', file: '', icon: '🔰', description: 'NBI clearance document — upload when available', selectable: false },
  { id: 'bir', name: 'BIR (Tax ID)', category: 'government', file: '/assets/documents/requirements/bir.png', icon: '🏛️', description: 'Bureau of Internal Revenue registration', selectable: false },
  { id: 'diploma', name: 'Diploma', category: 'government', file: '/assets/documents/requirements/diploma.jpg', icon: '🎓', description: 'BS IT — University of the Cordilleras', selectable: false },
  { id: 'pagibig', name: 'Pag-IBIG', category: 'government', file: '/assets/documents/requirements/pagibig.png', icon: '🏠', description: 'Pag-IBIG Fund membership', selectable: false },
  { id: 'philhealth', name: 'PhilHealth', category: 'government', file: '/assets/documents/requirements/philhealth.png', icon: '🏥', description: 'PhilHealth membership', selectable: false },
  { id: 'sss', name: 'SSS', category: 'government', file: '/assets/documents/requirements/sss.png', icon: '🛡️', description: 'Social Security System membership', selectable: false },
  // Links
  { id: 'portfolio', name: 'Portfolio Website', category: 'link', file: 'https://neuralyx.ai.dev-environment.site', icon: '🌐', description: 'NEURALYX — AI Systems Engineering Portfolio', selectable: false },
  { id: 'linkedin', name: 'LinkedIn Profile', category: 'link', file: 'https://linkedin.com/in/gabriel-alvin-aquino-56a1a0258', icon: '🟦', description: 'Gabriel Alvin Aquino — AI Automation Engineer', selectable: false },
  { id: 'github', name: 'GitHub Profile', category: 'link', file: 'https://github.com/HierArch24', icon: '⚫', description: 'HierArch24 — Open source projects', selectable: false },
  // Certificates
  { id: 'cert_aws', name: 'AWS Certifications', category: 'certificate', file: '/assets/images/certificates/', icon: '☁️', description: 'AWS DataSync Primer, AWS Fundamentals', selectable: false },
  { id: 'cert_ml', name: 'ML/AI Certifications', category: 'certificate', file: '/assets/images/certificates/', icon: '🤖', description: 'Neural Networks, Deep Learning Keras, Machine Learning Expert', selectable: false },
  // Templates
  { id: 'cover_formal', name: 'Cover Letter (Formal/ATS)', category: 'template', file: '', icon: '✉️', description: 'AI-generated formal cover letter — auto-filled per job', selectable: false },
  { id: 'cover_email', name: 'Cover Letter (Email)', category: 'template', file: '', icon: '📧', description: 'AI-generated conversational email — auto-filled per job', selectable: false },
  // Info
  { id: 'salary', name: 'Salary Expectations', category: 'info', file: '', icon: '💰', description: 'PHP 80,000-150,000/mo or USD 1,500-3,000/mo (remote)', selectable: false },
  { id: 'auth_ph', name: 'Work Authorization (PH)', category: 'info', file: '', icon: '🇵🇭', description: 'Philippine citizen — no visa sponsorship needed', selectable: false },
  { id: 'availability', name: 'Availability', category: 'info', file: '', icon: '📅', description: 'Available immediately — can start within 1 week', selectable: false },
]

// Character References (selectable — choose which to include per application)
const CHARACTER_REFERENCES = [
  { id: 'ref1', name: 'Joy Nicole Canutab', position: 'Instructor, Dept. of Criminology', company: 'University of Cordilleras', email: 'jccanutab@uc-bcf.edu.ph', phone: '+639934372943', selected: ref(true) },
  { id: 'ref2', name: 'Lito Lozada', position: 'Full Stack Developer', company: 'Speech Improvement Center', email: 'lito_lozada@cesstowebsolutions.com', phone: '09679206396', selected: ref(true) },
  { id: 'ref3', name: 'Tony Ajhar', position: 'Lead Marketing', company: 'Access Insurance Underwriter, LLC', email: 'tony@accessvirtualstaffing.com', phone: '+1 (928) 916-7754', selected: ref(true) },
  { id: 'ref4', name: 'David Rush', position: 'Chief Operating Officer', company: 'Access Insurance Underwriter, LLC', email: 'david@themorningrush.org', phone: '+1 (203) 246-8732', selected: ref(false) },
  { id: 'ref5', name: 'Phil Wardell', position: 'Chief Executive Officer', company: 'Access Insurance Underwriter, LLC', email: '', phone: '', linkedin: 'linkedin.com/in/phil-wardell-310565a', selected: ref(false) },
  { id: 'ref6', name: 'Princess Sta. Ana', position: 'Marketing & Communications Director', company: 'Access Insurance Underwriter, LLC', email: 'cess.staana1619@gmail.com', phone: '+63 954 379 3909', linkedin: 'linkedin.com/in/princess-sta-ana-355644318', selected: ref(false) },
  { id: 'ref7', name: 'Grace Z', position: 'Virtual Assistant', company: 'Gcorp', email: 'grace@gcorpindustries.ca', phone: '09613893472', selected: ref(false) },
  { id: 'ref8', name: 'Mikel Resaba', position: 'Content and SEO Manager', company: 'Liviti', email: 'mikel.resaba@liviti.com.au', phone: '', selected: ref(false) },
]

const KNOCKOUT_ANSWERS = [
  { q: 'Will you require visa sponsorship now or in the future?', a: 'No — Philippine citizen, no sponsorship needed for PH/remote roles', auto: true },
  { q: 'Are you legally authorized to work in the Philippines?', a: 'Yes — Philippine citizen', auto: true },
  { q: 'Are you legally authorized to work in the US?', a: 'No — open to remote roles only. Will need sponsorship for US onsite.', auto: false },
  { q: 'What is your desired salary?', a: 'PHP 80,000-150,000/month or USD 1,500-3,000/month for remote', auto: true },
  { q: 'How many years of experience do you have?', a: '8+ years in software engineering, AI automation, and web development', auto: true },
  { q: 'Are you willing to relocate?', a: 'Open to remote and hybrid in Philippines. Open to relocation for the right opportunity.', auto: true },
  { q: 'What is your earliest start date?', a: 'Available immediately — can start within 1 week', auto: true },
  { q: 'Do you have a bachelor\'s degree?', a: 'Yes — BS Information Technology, University of the Cordilleras', auto: true },
  { q: 'Have you previously worked for this company?', a: 'No', auto: true },
  { q: 'Are you willing to undergo a background check?', a: 'Yes', auto: true },
  { q: 'Do you have experience with [specific tool/language]?', a: 'AI will match against skills: Vue, TypeScript, Python, PHP, Laravel, Docker, OpenAI, n8n, LangChain, FastAPI, PostgreSQL', auto: true },
  { q: 'Why are you interested in this role?', a: 'AI generates personalized answer based on job description + company research', auto: true },
  { q: 'Do you have a valid government ID?', a: 'Yes — Philippine government IDs available', auto: true },
]

const HUMAN_TRIGGERS = [
  { icon: '🎤', label: 'Interview Scheduled', reason: 'You need to attend' },
  { icon: '💻', label: 'Technical Test', reason: 'Coding assessment requires manual completion' },
  { icon: '🎥', label: 'Video Introduction', reason: 'Record a Loom/video response' },
  { icon: '💰', label: 'Salary Negotiation', reason: 'Offer received — you decide' },
  { icon: '🔐', label: 'Identity Verification', reason: 'Upload government ID' },
  { icon: '🧠', label: 'Personality Assessment', reason: 'DISC/MBTI — use library document' },
  { icon: '🤖', label: 'CAPTCHA Detected', reason: 'Agent cannot solve — manual click needed' },
  { icon: '✅', label: 'Offer Decision', reason: 'Accept, decline, or counter-offer' },
]

function reqCatStyle(cat: string): string {
  const m: Record<string, string> = { document: 'bg-blue-500/15 text-blue-400', assessment: 'bg-purple-500/15 text-purple-400', link: 'bg-cyan-500/15 text-cyan-400', certificate: 'bg-yellow-500/15 text-yellow-400', template: 'bg-green-500/15 text-green-400', info: 'bg-gray-500/15 text-gray-400', government: 'bg-red-500/15 text-red-400' }
  return m[cat] || m.info
}
function sanitizeHtml(html: string): string {
  // Allow safe HTML tags, strip dangerous ones (script, iframe, etc.)
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
}
function filterLayerLabel(layer: string): string {
  const m: Record<string, string> = { resume_screen: '📄 Resume Screen', form_questions: '📝 Form Questions', video_intro: '🎥 Video Intro', technical_test: '💻 Technical Test', personality_test: '🧠 Personality Test', trial_task: '🔧 Trial Task', portfolio_review: '📂 Portfolio Review', interview: '🎤 Interview' }
  return m[layer] || layer
}

function getApplyChannels(job: JobListing) {
  const raw = (job.raw_data as Record<string, unknown>) || {}
  const channels: { channel: string; label: string; icon: string; status: string; detail: string; target?: string }[] = []

  // AI-extracted channels
  const aiChannels = (raw.apply_channels as { channel: string; status: string; detail: string; target?: string }[]) || []
  if (aiChannels.length > 0) {
    for (const ch of aiChannels) {
      const icons: Record<string, string> = { job_board: '📋', email: '📧', company_portal: '🏢', form: '📝' }
      const labels: Record<string, string> = { job_board: `${p(job.platform).label} Apply`, email: 'Direct Email', company_portal: 'Company Portal', form: 'Application Form' }
      channels.push({ channel: ch.channel, label: labels[ch.channel] || ch.channel, icon: icons[ch.channel] || '📌', status: job.status === 'applied' && ch.channel === 'job_board' ? 'done' : ch.status, detail: ch.detail, target: ch.target || undefined })
    }
  } else {
    // Fallback: build channels from raw_data fields
    channels.push({ channel: 'job_board', label: `${p(job.platform).label} Apply`, icon: '📋', status: job.status === 'applied' ? 'done' : 'pending', detail: `Apply via ${p(job.platform).label}`, target: job.url })

    const email = (raw.recruiter_email as string) || (raw.inferred_company_email as string)
    if (email) {
      channels.push({ channel: 'email', label: 'Direct Email', icon: '📧', status: 'pending', detail: `Send resume + cover letter`, target: email })
    } else {
      channels.push({ channel: 'email', label: 'Direct Email', icon: '📧', status: 'research_needed', detail: `Find recruiter/HR email for ${job.company}` })
    }

    if (raw.company_careers_url) {
      channels.push({ channel: 'company_portal', label: 'Company Portal', icon: '🏢', status: 'pending', detail: raw.requires_registration ? 'Register + apply' : 'Apply on company site', target: raw.company_careers_url as string })
    }

    if (raw.external_form_url) {
      const isGoogleForm = (raw.external_form_url as string).includes('google.com/forms')
      channels.push({ channel: 'form', label: isGoogleForm ? 'Google Form' : 'Application Form', icon: '📝', status: 'pending', detail: 'Fill and submit form', target: raw.external_form_url as string })
    }
  }

  return channels
}

// ─── Auto Apply ───
const autoApplying = ref(false)

async function autoApplySelected() {
  const jobs = filteredJobs.value.filter(j => selectedIds.value.has(j.id) && j.status === 'new')
  if (!jobs.length) return
  autoApplying.value = true
  const task = addTask('auto-apply', `Auto-applying to ${jobs.length} jobs`)
  const profile = admin.jobProfile[0] || null
  try {
    const { results, applied, needs_browser } = await batchAutoApply(jobs, profile as unknown as Record<string, unknown> || undefined)
    for (const r of results) {
      if (r.status === 'applied') {
        try {
          await admin.insertRow('job_applications', { job_listing_id: r.job_id, platform: r.method, channel: 'direct', status: 'applied', applied_via: 'auto_agent', auto_applied: true, notes: r.detail })
          await admin.updateRow('job_listings', r.job_id, { status: 'applied' })
        } catch { /* skip */ }
      }
    }
    await Promise.all([admin.fetchJobListings(), admin.fetchJobApplications()])
    finishTask(task, `${applied} applied, ${needs_browser} need browser`)
  } catch (e) { finishTask(task, e instanceof Error ? e.message : 'Failed', true) }
  autoApplying.value = false; selectedIds.value.clear(); selectAll.value = false
}

async function autoApplyTop() {
  const profile = admin.jobProfile[0] || null
  const minScore = profile?.auto_apply_min_score || 75
  const jobs = admin.jobListings.filter(j => j.status === 'new' && j.match_score !== null && j.match_score >= minScore)
  if (!jobs.length) return
  autoApplying.value = true
  const task = addTask('auto-apply-top', `Auto-applying to ${jobs.length} top matches (${minScore}%+)`)
  try {
    const { results, applied, needs_browser } = await batchAutoApply(jobs, profile as unknown as Record<string, unknown> || undefined)
    for (const r of results) {
      if (r.status === 'applied') {
        try {
          await admin.insertRow('job_applications', { job_listing_id: r.job_id, platform: r.method, channel: 'direct', status: 'applied', applied_via: 'auto_agent', auto_applied: true, notes: r.detail })
          await admin.updateRow('job_listings', r.job_id, { status: 'applied' })
        } catch { /* skip */ }
      }
    }
    await Promise.all([admin.fetchJobListings(), admin.fetchJobApplications()])
    finishTask(task, `${applied} applied, ${needs_browser} need browser`)
  } catch (e) { finishTask(task, e instanceof Error ? e.message : 'Failed', true) }
  autoApplying.value = false
}

// ─── Task Progress Panel ───
interface Task { id: string; label: string; status: 'running' | 'done' | 'error'; progress: number; detail: string }
const activeTasks = ref<Task[]>([])
const showTaskPanel = ref(false)

function addTask(id: string, label: string): Task {
  // Remove any existing task with same id
  activeTasks.value = activeTasks.value.filter(x => x.id !== id)
  const t: Task = { id, label, status: 'running', progress: 0, detail: 'Starting...' }
  activeTasks.value = [...activeTasks.value, t]
  showTaskPanel.value = true
  return t
}
function updateTask(t: Task, progress: number, detail: string) {
  t.progress = progress; t.detail = detail
  // Force reactivity by replacing array
  activeTasks.value = [...activeTasks.value]
}
function finishTask(t: Task, detail: string, error = false) {
  t.status = error ? 'error' : 'done'; t.progress = 100; t.detail = detail
  activeTasks.value = [...activeTasks.value]
  setTimeout(() => { activeTasks.value = activeTasks.value.filter(x => x.id !== t.id); if (!activeTasks.value.length) showTaskPanel.value = false }, 5000)
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
      <select v-model="filterCountry" class="px-2.5 py-1.5 bg-neural-800 border border-neural-600 rounded-lg text-white text-[11px] focus:border-cyber-purple focus:outline-none">
        <option value="">All Countries</option>
        <option v-for="[code, count] in countryOptions" :key="code" :value="code">{{ countryFlag(code) }} {{ code }} ({{ count }})</option>
      </select>
      <label class="flex items-center gap-1.5 cursor-pointer px-2.5 py-1.5 rounded-lg transition-colors" :class="filterWFH ? 'bg-green-500/15 text-green-400' : 'bg-neural-700/50 text-gray-500'">
        <input type="checkbox" v-model="filterWFH" class="rounded border-neural-600 bg-neural-800 text-green-500 focus:ring-green-500 w-3 h-3" />
        <span class="text-[11px] font-medium">WFH</span>
      </label>
      <button @click="updateJobs" :disabled="updating || filling" class="px-2.5 py-1.5 bg-cyber-purple/15 text-cyber-purple rounded-lg text-[11px] font-medium hover:bg-cyber-purple/25 disabled:opacity-50 flex items-center gap-1 shrink-0 relative overflow-hidden min-w-[120px]">
        <div v-if="updating" class="absolute inset-0 bg-cyber-purple/20 transition-all duration-300" :style="{ width: updatePercent + '%' }" />
        <span class="relative flex items-center gap-1">
          <svg v-if="!updating" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          <svg v-else class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          {{ updating ? updateProgress : 'Pull & Score Jobs' }}
        </span>
      </button>
      <button @click="fillAllJobs" :disabled="filling || updating" class="px-2.5 py-1.5 bg-yellow-500/15 text-yellow-400 rounded-lg text-[11px] font-medium hover:bg-yellow-500/25 disabled:opacity-50 flex items-center gap-1 shrink-0 relative overflow-hidden min-w-[110px]">
        <div v-if="filling" class="absolute inset-0 bg-yellow-500/20 transition-all duration-300" :style="{ width: fillPercent + '%' }" />
        <span class="relative">{{ filling ? `🤖 ${fillProgress}` : '🤖 AI Fill All' }}</span>
      </button>
      <button @click="autoApplyTop" :disabled="autoApplying || updating || filling" class="px-2.5 py-1.5 bg-green-500/15 text-green-400 rounded-lg text-[11px] font-medium hover:bg-green-500/25 disabled:opacity-50 flex items-center gap-1 shrink-0">
        🚀 Auto Apply 75%+
      </button>
      <div class="ml-auto flex items-center gap-2 text-[10px] text-gray-500">
        <span>{{ filteredJobs.length }} jobs</span>
        <span v-if="totalPages > 1">· Page {{ currentPage }}/{{ totalPages }}</span>
      </div>
    </div>

    <!-- Bulk Actions -->
    <div v-if="selectedIds.size > 0" class="flex items-center gap-3 mb-3 px-3 py-2 bg-cyber-purple/10 border border-cyber-purple/20 rounded-lg">
      <span class="text-xs text-cyber-purple font-medium">{{ selectedIds.size }} selected</span>
      <button @click="scoreSelected" :disabled="scoring" class="px-2.5 py-1 bg-yellow-500/20 text-yellow-400 rounded text-[10px] font-medium hover:bg-yellow-500/30 disabled:opacity-50">{{ scoring ? `Scoring ${scoreProgress}` : '🎯 AI Score' }}</button>
      <button @click="autoApplySelected" :disabled="autoApplying" class="px-2.5 py-1 bg-green-500/20 text-green-400 rounded text-[10px] font-medium hover:bg-green-500/30 disabled:opacity-50">{{ autoApplying ? 'Applying...' : '🚀 Auto Apply' }}</button>
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
            <th class="text-left px-2 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Type</th>
            <th class="text-center px-2 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Match</th>
            <th class="text-left px-2 py-2.5 text-gray-500 font-medium text-[10px] uppercase">Apply</th>
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
            <td class="px-2 py-2"><span class="px-1.5 py-0.5 rounded text-[9px] font-medium capitalize" :class="p(job.platform).bg + ' ' + p(job.platform).color">{{ p(job.platform).emoji }} {{ p(job.platform).label }}</span></td>
            <td class="px-2 py-2">
              <span v-if="rd(job, 'company_bucket')" class="text-[9px] text-gray-500 capitalize">{{ rd(job, 'company_bucket').replace('_',' ') }}</span>
              <span v-else class="text-[9px] text-gray-700">—</span>
            </td>
            <td class="px-2 py-2 text-center"><span class="text-xs font-bold" :class="matchColor(job.match_score)">{{ job.match_score ? job.match_score + '%' : '—' }}</span></td>
            <td class="px-2 py-2"><span class="px-1.5 py-0.5 rounded text-[9px] font-medium" :class="appBadge(rd(job, 'application_type')).bg + ' ' + appBadge(rd(job, 'application_type')).color">{{ appBadge(rd(job, 'application_type')).label }}</span></td>
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
        <div class="glass-dark rounded-xl w-full max-w-5xl border border-neural-600 max-h-[92vh] flex flex-col">
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
              <button v-for="tab in [{key:'overview',label:'Overview'},{key:'description',label:'Job Details'},{key:'match',label:'Match Analysis'},{key:'coverletter',label:'Cover Letter'},{key:'apply',label:'How to Apply'},{key:'requirements',label:'Requirements'}]" :key="tab.key"
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
              <!-- Quick Info Bar -->
              <div class="grid grid-cols-4 gap-2">
                <div class="bg-neural-800/50 rounded-lg p-2.5 border border-neural-700/30 text-center">
                  <p class="text-[9px] text-gray-500 uppercase">Seniority</p>
                  <p class="text-xs font-medium text-white capitalize">{{ rd(detailJob, 'seniority') || '—' }}</p>
                </div>
                <div class="bg-neural-800/50 rounded-lg p-2.5 border border-neural-700/30 text-center">
                  <p class="text-[9px] text-gray-500 uppercase">Work Setup</p>
                  <p class="text-xs font-medium text-white capitalize">{{ rd(detailJob, 'work_arrangement') || '—' }}</p>
                </div>
                <div class="bg-neural-800/50 rounded-lg p-2.5 border border-neural-700/30 text-center">
                  <p class="text-[9px] text-gray-500 uppercase">Country</p>
                  <p class="text-xs font-medium text-white">{{ rd(detailJob, 'country') || detailJob.location || '—' }}</p>
                </div>
                <div class="bg-neural-800/50 rounded-lg p-2.5 border border-neural-700/30 text-center">
                  <p class="text-[9px] text-gray-500 uppercase">Est. Salary</p>
                  <p class="text-xs font-medium text-green-400">{{ rd(detailJob, 'salary_estimate') || formatSalary(detailJob) }}</p>
                </div>
              </div>
              <!-- Tech Stack (from AI analysis) -->
              <div v-if="(detailJob.raw_data as any)?.skill_matches?.length || (detailJob.raw_data as any)?.skill_gaps?.length" class="bg-neural-800/50 rounded-lg p-4 border border-neural-700/30">
                <h4 class="text-xs text-white font-semibold uppercase tracking-wider mb-3">Required Tech Stack</h4>
                <div class="flex flex-wrap gap-1.5">
                  <span v-for="s in (detailJob.raw_data as any)?.skill_matches || []" :key="'m'+s" class="px-2.5 py-1 rounded-full text-[11px] bg-green-500/10 text-green-400 border border-green-500/20">{{ s }}</span>
                  <span v-for="s in (detailJob.raw_data as any)?.skill_gaps || []" :key="'g'+s" class="px-2.5 py-1 rounded-full text-[11px] bg-red-500/10 text-red-400 border border-red-500/20">{{ s }}</span>
                </div>
                <div class="flex gap-4 mt-2 text-[10px]">
                  <span class="text-green-400">&#9679; Skills you have</span>
                  <span class="text-red-400">&#9679; Skills to learn</span>
                </div>
              </div>
              <!-- Role & Company Classification -->
              <div v-if="rd(detailJob, 'role_type') || rd(detailJob, 'company_bucket')" class="grid grid-cols-3 gap-2">
                <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                  <p class="text-[9px] text-gray-500 uppercase mb-1">Role Type</p>
                  <p class="text-xs font-medium text-violet-400 capitalize">{{ rd(detailJob, 'role_type')?.replace('_', ' ') }}</p>
                </div>
                <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                  <p class="text-[9px] text-gray-500 uppercase mb-1">Company Type</p>
                  <p class="text-xs font-medium text-cyan-400 capitalize">{{ rd(detailJob, 'company_bucket')?.replace('_', ' ') }}</p>
                </div>
                <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                  <p class="text-[9px] text-gray-500 uppercase mb-1">Industry</p>
                  <p class="text-xs font-medium text-amber-400 capitalize">{{ rd(detailJob, 'company_type_detail')?.replace('_', ' ') || '—' }}</p>
                </div>
              </div>
              <!-- Requirements -->
              <div v-if="detailJob.requirements" class="bg-neural-800/50 rounded-lg p-4 border border-neural-700/30">
                <h4 class="text-xs text-white font-semibold uppercase tracking-wider mb-2">Requirements</h4>
                <div class="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{{ detailJob.requirements }}</div>
              </div>
              <!-- Full Description -->
              <div class="bg-neural-800/50 rounded-lg border border-neural-700/30">
                <div class="px-4 py-2.5 border-b border-neural-700/30 flex items-center justify-between">
                  <h4 class="text-xs text-white font-semibold uppercase tracking-wider">Full Job Description</h4>
                  <a v-if="detailJob.url" :href="detailJob.url" target="_blank" class="text-[10px] text-cyber-cyan hover:underline flex items-center gap-1">
                    View original <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </a>
                </div>
                <div v-if="detailJob.description" class="p-4 text-sm text-gray-300 leading-relaxed max-h-[40vh] overflow-y-auto job-desc" v-html="sanitizeHtml(detailJob.description)"></div>
                <div v-else-if="(detailJob.raw_data as any)?.generated_description" class="p-4">
                  <div class="flex items-center gap-1.5 mb-2"><span class="text-[10px] text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded">AI Generated</span></div>
                  <div class="text-sm text-gray-300 leading-relaxed max-h-[40vh] overflow-y-auto">{{ (detailJob.raw_data as any).generated_description }}</div>
                </div>
                <div v-else class="p-4 text-center text-gray-500 text-sm">No description available. <a v-if="detailJob.url" :href="detailJob.url" target="_blank" class="text-cyber-cyan hover:underline">View on {{ p(detailJob.platform).label }}</a></div>
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

            <!-- Application Channels Tab -->
            <div v-if="detailTab === 'apply'" class="space-y-4">
              <!-- Multi-Channel Application Overview -->
              <div class="bg-neural-800/50 rounded-lg p-4 border border-neural-700/30">
                <h4 class="text-[9px] text-gray-500 uppercase tracking-wider mb-3">Application Channels</h4>
                <div class="space-y-2">
                  <div v-for="(ch, idx) in getApplyChannels(detailJob)" :key="idx"
                    class="flex items-center gap-3 p-3 rounded-lg border transition-colors"
                    :class="ch.status === 'done' ? 'border-green-500/30 bg-green-500/5' : ch.status === 'research_needed' ? 'border-orange-500/20 bg-orange-500/5' : 'border-neural-700/30'">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm"
                      :class="ch.status === 'done' ? 'bg-green-500/20 text-green-400' : ch.status === 'research_needed' ? 'bg-orange-500/20 text-orange-400' : 'bg-neural-700 text-gray-400'">
                      {{ ch.icon }}
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <p class="text-xs font-medium text-white">{{ ch.label }}</p>
                        <span class="px-1.5 py-0.5 rounded text-[8px] font-medium"
                          :class="ch.status === 'done' ? 'bg-green-500/15 text-green-400' : ch.status === 'research_needed' ? 'bg-orange-500/15 text-orange-400' : ch.status === 'sent' ? 'bg-cyan-500/15 text-cyan-400' : 'bg-yellow-500/15 text-yellow-400'">
                          {{ ch.status === 'done' ? 'Submitted' : ch.status === 'research_needed' ? 'Research Needed' : ch.status === 'sent' ? 'Sent' : 'Pending' }}
                        </span>
                      </div>
                      <p class="text-[10px] text-gray-500 mt-0.5 truncate">{{ ch.detail }}</p>
                      <p v-if="ch.target" class="text-[9px] text-gray-600 mt-0.5 truncate">{{ ch.target }}</p>
                    </div>
                    <a v-if="ch.target && ch.target.startsWith('http')" :href="ch.target" target="_blank" class="px-3 py-1.5 bg-neural-700 text-gray-300 rounded text-[10px] hover:bg-neural-600 shrink-0">Open</a>
                    <button v-else-if="ch.channel === 'email' && ch.target" @click="draftApplicationEmail(detailJob)" class="px-3 py-1.5 bg-cyan-500/15 text-cyan-400 rounded text-[10px] hover:bg-cyan-500/25 shrink-0">Draft</button>
                    <a v-else-if="ch.channel === 'job_board'" :href="detailJob.url" target="_blank" class="px-3 py-1.5 bg-neural-700 text-gray-300 rounded text-[10px] hover:bg-neural-600 shrink-0">Apply</a>
                    <span v-else-if="ch.status === 'research_needed'" class="px-3 py-1.5 bg-orange-500/10 text-orange-400 rounded text-[10px] shrink-0">Find Contact</span>
                  </div>
                </div>
              </div>

              <!-- Application Pipeline -->
              <div class="bg-neural-800/50 rounded-lg p-4 border border-neural-700/30">
                <h4 class="text-[9px] text-gray-500 uppercase tracking-wider mb-3">Application Pipeline</h4>
                <div class="flex gap-1">
                  <div v-for="(stage, idx) in [
                    { label: 'Found', icon: '🔍', done: true },
                    { label: 'Scored', icon: '🎯', done: detailJob.match_score !== null },
                    { label: 'Applied', icon: '📨', done: detailJob.status === 'applied' },
                    { label: 'Follow-up', icon: '📬', done: false },
                    { label: 'Response', icon: '💬', done: false },
                    { label: 'Interview', icon: '🎤', done: false },
                    { label: 'Offer', icon: '🎉', done: false },
                  ]" :key="stage.label" class="flex-1 text-center">
                    <div class="w-full h-1.5 rounded-full mb-1.5" :class="stage.done ? 'bg-green-500' : idx <= 2 ? 'bg-neural-600' : 'bg-neural-700'"></div>
                    <span class="text-[10px]">{{ stage.icon }}</span>
                    <p class="text-[8px] mt-0.5" :class="stage.done ? 'text-green-400' : 'text-gray-600'">{{ stage.label }}</p>
                  </div>
                </div>
              </div>

              <!-- Expected Filtering Layers -->
              <div v-if="((detailJob.raw_data as any)?.expected_filtering_layers || []).length > 0" class="bg-neural-800/50 rounded-lg p-4 border border-neural-700/30">
                <h4 class="text-[9px] text-gray-500 uppercase tracking-wider mb-3">Expected Screening Steps</h4>
                <div class="flex flex-wrap gap-1.5">
                  <span v-for="layer in ((detailJob.raw_data as any)?.expected_filtering_layers || [])" :key="layer"
                    class="px-2 py-1 rounded-full text-[10px] font-medium border" :class="filterLayerStyle(layer)">
                    {{ filterLayerLabel(layer) }}
                  </span>
                </div>
                <p v-if="(detailJob.raw_data as any)?.ats_system && (detailJob.raw_data as any)?.ats_system !== 'unknown' && (detailJob.raw_data as any)?.ats_system !== 'none'" class="text-[10px] text-gray-500 mt-2">
                  ATS: <span class="text-white capitalize">{{ (detailJob.raw_data as any).ats_system }}</span>
                </p>
              </div>

              <!-- AI Strategy Plan -->
              <div v-if="applyStrategy" class="bg-neural-800/50 rounded-lg p-4 border border-cyber-purple/20">
                <div class="flex items-center justify-between mb-3">
                  <h4 class="text-[9px] text-gray-500 uppercase tracking-wider">AI Strategy</h4>
                  <span class="px-2 py-0.5 rounded text-[9px] font-medium capitalize"
                    :class="applyStrategy.strategy_type === 'parallel' ? 'bg-red-500/15 text-red-400' : applyStrategy.strategy_type === 'dual' ? 'bg-amber-500/15 text-amber-400' : applyStrategy.strategy_type === 'opportunistic' ? 'bg-purple-500/15 text-purple-400' : 'bg-green-500/15 text-green-400'">
                    {{ applyStrategy.strategy_type }}
                  </span>
                </div>
                <div class="space-y-2">
                  <div class="flex items-center gap-2 p-2 rounded bg-neural-900/50">
                    <span class="text-[10px] font-bold text-cyber-purple">PRIMARY</span>
                    <span class="text-[10px] text-white capitalize">{{ applyStrategy.primary.channel.replace('_', ' ') }}</span>
                    <span class="px-1.5 py-0.5 rounded text-[8px] bg-neural-700 text-gray-400 capitalize">{{ applyStrategy.primary.tone }}</span>
                  </div>
                  <div v-for="(sec, i) in applyStrategy.secondary" :key="i" class="flex items-center gap-2 p-2 rounded bg-neural-900/50">
                    <span class="text-[10px] font-bold text-amber-400">+{{ i + 1 }}</span>
                    <span class="text-[10px] text-white capitalize">{{ sec.channel.replace('_', ' ') }}</span>
                    <span class="px-1.5 py-0.5 rounded text-[8px] bg-neural-700 text-gray-400 capitalize">{{ sec.tone }}</span>
                    <span class="text-[9px] text-gray-600 ml-auto">after {{ sec.delay_hours }}h</span>
                  </div>
                </div>
                <div v-if="applyStrategy.safety_notes.length" class="mt-2 space-y-1">
                  <p v-for="note in applyStrategy.safety_notes" :key="note" class="text-[9px] text-gray-500 flex items-center gap-1">
                    <span class="text-[8px]">&#9679;</span> {{ note }}
                  </p>
                </div>
              </div>
              <div v-else-if="detailJob.status === 'new'" class="flex items-center justify-center py-3">
                <button @click="loadStrategy(detailJob)" class="px-4 py-2 bg-cyber-purple/15 text-cyber-purple rounded-lg text-xs font-medium hover:bg-cyber-purple/25 flex items-center gap-1.5">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                  Generate AI Strategy
                </button>
              </div>

              <!-- Next Actions -->
              <div class="bg-neural-800/50 rounded-lg p-4 border border-neural-700/30">
                <h4 class="text-[9px] text-gray-500 uppercase tracking-wider mb-3">Next Actions</h4>
                <div class="space-y-2">
                  <div v-if="detailJob.status === 'new'" class="flex items-center gap-2 text-xs text-yellow-400">
                    <span>&#9888;</span> Apply to this job through available channels above
                  </div>
                  <div v-if="detailJob.status === 'applied'" class="flex items-center gap-2 text-xs text-cyan-400">
                    <span>&#128340;</span> Send follow-up email in 3-5 business days if no response
                  </div>
                  <div v-if="!coverLetter && detailJob.status === 'new'" class="flex items-center gap-2 text-xs text-gray-400">
                    <span>&#9999;</span> Cover letter is being generated — check Cover Letter tab
                  </div>
                  <div v-if="coverLetter" class="flex items-center gap-2 text-xs text-green-400">
                    <span>&#10003;</span> Cover letter ready — use it in your applications
                  </div>
                </div>
              </div>

              <!-- Company Research -->
              <div v-if="companyResearch && (companyResearch as any).ai_summary" class="bg-neural-800/50 rounded-lg p-4 border border-neural-700/30">
                <h4 class="text-[9px] text-gray-500 uppercase tracking-wider mb-2">Company Intel</h4>
                <p class="text-xs text-gray-300 mb-2">{{ (companyResearch as any).ai_summary?.summary }}</p>
                <div v-if="(companyResearch as any).ai_summary?.tech_stack?.length" class="flex flex-wrap gap-1 mb-2">
                  <span v-for="t in (companyResearch as any).ai_summary.tech_stack" :key="t" class="px-1.5 py-0.5 rounded text-[9px] bg-neural-700/50 text-gray-400">{{ t }}</span>
                </div>
              </div>
              <div v-else-if="researching" class="text-[10px] text-gray-500 flex items-center gap-1.5">
                <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Researching {{ detailJob.company }}...
              </div>

              <!-- Draft Email Section -->
              <div v-if="draftEmail" class="bg-neural-800/50 rounded-lg p-4 border border-neural-700/30">
                <div class="flex items-center justify-between mb-2">
                  <h4 class="text-[9px] text-gray-500 uppercase tracking-wider">Draft Email</h4>
                  <button @click="copyText(draftEmail)" class="px-3 py-1 bg-green-500/20 text-green-400 rounded text-[10px] hover:bg-green-500/30">Copy</button>
                </div>
                <div class="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap bg-neural-900 rounded p-3 max-h-[150px] overflow-y-auto font-mono">{{ draftEmail }}</div>
              </div>

              <!-- Quick Actions -->
              <div class="flex gap-2 pt-3 border-t border-neural-700">
                <a v-if="detailJob.url" :href="detailJob.url" target="_blank" class="px-4 py-2 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-xs font-medium hover:opacity-90 flex items-center gap-1.5">
                  Apply on {{ p(detailJob.platform).label }} <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
                <button v-if="!draftEmail && coverLetter" @click="draftApplicationEmail(detailJob)" class="px-4 py-2 bg-cyan-500/15 text-cyan-400 rounded-lg text-xs font-medium hover:bg-cyan-500/25">Draft Email</button>
                <button v-if="rd(detailJob, 'company_careers_url')" @click="() => {}" class="px-4 py-2 bg-purple-500/15 text-purple-400 rounded-lg text-xs font-medium hover:bg-purple-500/25">Apply on Portal</button>
              </div>
            </div>

            <!-- Requirements Library Tab -->
            <div v-if="detailTab === 'requirements'" class="space-y-4">
              <div class="bg-neural-800/50 rounded-lg p-4 border border-neural-700/30">
                <h4 class="text-[9px] text-gray-500 uppercase tracking-wider mb-3">Documents & Assets Library</h4>
                <p class="text-[10px] text-gray-500 mb-3">Select items the AI agent uses when applying to this job. All selected items are auto-attached or referenced during application.</p>
                <div class="space-y-1.5">
                  <div v-for="req in REQUIREMENTS_LIBRARY" :key="req.id"
                    class="flex items-center gap-3 p-2.5 rounded-lg border border-neural-700/30 hover:bg-neural-700/20 transition-colors">
                    <span class="text-lg shrink-0">{{ req.icon }}</span>
                    <div class="flex-1 min-w-0">
                      <p class="text-xs text-white font-medium">{{ req.name }}</p>
                      <p class="text-[9px] text-gray-500 truncate">{{ req.description }}</p>
                    </div>
                    <span class="px-1.5 py-0.5 rounded text-[8px] font-medium capitalize" :class="reqCatStyle(req.category)">
                      {{ req.category }}
                    </span>
                    <a v-if="req.file && req.file.startsWith('http')" :href="req.file" target="_blank" class="px-2 py-1 bg-neural-700 text-gray-300 rounded text-[9px] hover:bg-neural-600 shrink-0">Open</a>
                    <a v-else-if="req.file && req.file.startsWith('/')" :href="req.file" target="_blank" class="px-2 py-1 bg-neural-700 text-gray-300 rounded text-[9px] hover:bg-neural-600 shrink-0">View</a>
                    <button v-if="req.file" @click="copyText(req.file)" class="px-2 py-1 bg-neural-700 text-gray-300 rounded text-[9px] hover:bg-neural-600 shrink-0">Copy</button>
                  </div>
                </div>
              </div>

              <!-- AI-Detected Requirements for This Job -->
              <div class="bg-neural-800/50 rounded-lg p-4 border border-amber-500/20">
                <h4 class="text-[9px] text-amber-400 uppercase tracking-wider mb-3">AI-Detected Requirements for This Job</h4>
                <div v-if="((detailJob.raw_data as any)?.expected_filtering_layers || []).length > 0" class="space-y-2">
                  <div v-for="layer in ((detailJob.raw_data as any)?.expected_filtering_layers || [])" :key="layer"
                    class="flex items-center gap-3 p-2.5 rounded-lg bg-neural-900/50">
                    <span class="text-sm">{{ filterLayerLabel(layer).split(' ')[0] }}</span>
                    <div class="flex-1">
                      <p class="text-xs text-white">{{ filterLayerLabel(layer).slice(2) }}</p>
                      <p class="text-[9px] text-gray-500">
                        {{ layer === 'resume_screen' ? 'Resume will be auto-submitted' :
                           layer === 'technical_test' ? 'Coding assessment may be required — agent will flag for manual completion' :
                           layer === 'video_intro' ? 'Video introduction needed — prepare Loom recording' :
                           layer === 'personality_test' ? 'DISC/MBTI assessment available in library above' :
                           layer === 'portfolio_review' ? 'Portfolio link auto-included: neuralyx.ai.dev-environment.site' :
                           layer === 'interview' ? 'Agent will monitor for scheduling requests' :
                           'Agent will handle automatically' }}
                      </p>
                    </div>
                    <span class="px-1.5 py-0.5 rounded text-[8px]"
                      :class="['resume_screen', 'portfolio_review'].includes(layer) ? 'bg-green-500/15 text-green-400' : ['technical_test', 'video_intro'].includes(layer) ? 'bg-yellow-500/15 text-yellow-400' : 'bg-gray-500/15 text-gray-400'">
                      {{ ['resume_screen', 'portfolio_review'].includes(layer) ? 'Auto' : ['technical_test', 'video_intro'].includes(layer) ? 'Manual' : 'Ready' }}
                    </span>
                  </div>
                </div>
                <div v-else class="text-center py-4">
                  <p class="text-xs text-gray-500">No specific requirements detected. AI Fill will analyze when scoring.</p>
                </div>
              </div>

              <!-- Quick Answers (Auto-Fill Profile) -->
              <div class="bg-neural-800/50 rounded-lg p-4 border border-neural-700/30">
                <h4 class="text-[9px] text-gray-500 uppercase tracking-wider mb-3">Auto-Fill Profile</h4>
                <div class="grid grid-cols-3 gap-2">
                  <div class="bg-neural-900/50 rounded p-2"><p class="text-[8px] text-gray-600">Full Name</p><p class="text-[10px] text-white">Gabriel Alvin Aquino</p></div>
                  <div class="bg-neural-900/50 rounded p-2"><p class="text-[8px] text-gray-600">Email</p><p class="text-[10px] text-white">gabrielalvin.jobs@gmail.com</p></div>
                  <div class="bg-neural-900/50 rounded p-2"><p class="text-[8px] text-gray-600">Phone</p><p class="text-[10px] text-white">0951 540 8978</p></div>
                  <div class="bg-neural-900/50 rounded p-2"><p class="text-[8px] text-gray-600">Location</p><p class="text-[10px] text-white">Angeles, Central Luzon, PH</p></div>
                  <div class="bg-neural-900/50 rounded p-2"><p class="text-[8px] text-gray-600">Experience</p><p class="text-[10px] text-white">8+ years</p></div>
                  <div class="bg-neural-900/50 rounded p-2"><p class="text-[8px] text-gray-600">Education</p><p class="text-[10px] text-white">BS IT — Univ. of Cordilleras</p></div>
                </div>
              </div>

              <!-- Knock-Out Questions Database -->
              <div class="bg-neural-800/50 rounded-lg p-4 border border-neural-700/30">
                <h4 class="text-[9px] text-gray-500 uppercase tracking-wider mb-3">Knock-Out Question Answers</h4>
                <p class="text-[9px] text-gray-600 mb-2">Pre-loaded answers the AI agent uses when forms ask these questions:</p>
                <div class="space-y-1.5">
                  <div v-for="qa in KNOCKOUT_ANSWERS" :key="qa.q" class="flex items-start gap-2 p-2 rounded bg-neural-900/50">
                    <span class="text-[10px] shrink-0 mt-0.5" :class="qa.auto ? 'text-green-400' : 'text-yellow-400'">{{ qa.auto ? '&#10003;' : '&#9888;' }}</span>
                    <div class="flex-1 min-w-0">
                      <p class="text-[10px] text-gray-400">{{ qa.q }}</p>
                      <p class="text-[10px] text-white font-medium">{{ qa.a }}</p>
                    </div>
                    <span class="px-1 py-0.5 rounded text-[7px] shrink-0" :class="qa.auto ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'">{{ qa.auto ? 'Auto' : 'Review' }}</span>
                  </div>
                </div>
              </div>

              <!-- Character References (Selectable) -->
              <div class="bg-neural-800/50 rounded-lg p-4 border border-neural-700/30">
                <h4 class="text-[9px] text-gray-500 uppercase tracking-wider mb-3">Character References (Select for this application)</h4>
                <div class="space-y-1.5">
                  <label v-for="r in CHARACTER_REFERENCES" :key="r.id" class="flex items-center gap-3 p-2 rounded-lg hover:bg-neural-700/20 transition-colors cursor-pointer" :class="r.selected.value ? 'bg-green-500/5 border border-green-500/20' : 'border border-transparent'">
                    <input type="checkbox" v-model="r.selected.value" class="rounded border-neural-600 bg-neural-800 text-green-500 focus:ring-green-500 w-3.5 h-3.5" />
                    <div class="flex-1 min-w-0">
                      <p class="text-[10px] text-white font-medium">{{ r.name }}</p>
                      <p class="text-[9px] text-gray-500">{{ r.position }} — {{ r.company }}</p>
                    </div>
                    <div class="text-right shrink-0">
                      <p v-if="r.email" class="text-[8px] text-gray-600">{{ r.email }}</p>
                      <p v-if="r.phone" class="text-[8px] text-gray-600">{{ r.phone }}</p>
                    </div>
                  </label>
                </div>
                <p class="text-[9px] text-gray-600 mt-2">{{ CHARACTER_REFERENCES.filter(r => r.selected.value).length }} of {{ CHARACTER_REFERENCES.length }} selected — AI agent will use selected references when forms require them</p>
              </div>

              <!-- Human Intervention Triggers -->
              <div class="bg-neural-800/50 rounded-lg p-4 border border-red-500/20">
                <h4 class="text-[9px] text-red-400 uppercase tracking-wider mb-3">Human Intervention Required</h4>
                <p class="text-[9px] text-gray-600 mb-2">The AI agent will pause and notify you for these:</p>
                <div class="grid grid-cols-2 gap-1.5">
                  <div v-for="trigger in HUMAN_TRIGGERS" :key="trigger.label" class="flex items-center gap-2 p-2 rounded bg-neural-900/50">
                    <span class="text-sm">{{ trigger.icon }}</span>
                    <div>
                      <p class="text-[10px] text-white">{{ trigger.label }}</p>
                      <p class="text-[8px] text-gray-600">{{ trigger.reason }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </Teleport>

    <!-- Floating Progress Panel -->
    <Teleport to="body">
      <Transition name="slide">
        <div v-if="showTaskPanel && activeTasks.length" class="fixed bottom-4 right-4 z-[70] w-80 space-y-2">
          <div v-for="task in activeTasks" :key="task.id"
            class="glass-dark rounded-lg border border-neural-600 overflow-hidden shadow-lg shadow-black/30">
            <div class="px-3 py-2.5 flex items-center gap-2">
              <div v-if="task.status === 'running'" class="w-4 h-4 shrink-0">
                <svg class="w-4 h-4 animate-spin text-cyber-purple" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              </div>
              <span v-else-if="task.status === 'done'" class="text-green-400 text-sm shrink-0">&#10003;</span>
              <span v-else class="text-red-400 text-sm shrink-0">&#10007;</span>
              <div class="flex-1 min-w-0">
                <p class="text-[11px] font-medium text-white truncate">{{ task.label }}</p>
                <p class="text-[9px] text-gray-400 truncate">{{ task.detail }}</p>
              </div>
              <span class="text-[10px] font-bold shrink-0" :class="task.status === 'done' ? 'text-green-400' : task.status === 'error' ? 'text-red-400' : 'text-cyber-purple'">{{ task.progress }}%</span>
            </div>
            <div class="h-1 bg-neural-700">
              <div class="h-full transition-all duration-500 ease-out rounded-full"
                :class="task.status === 'done' ? 'bg-green-500' : task.status === 'error' ? 'bg-red-500' : 'bg-gradient-to-r from-cyber-purple to-cyber-cyan'"
                :style="{ width: task.progress + '%' }" />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
:deep(.job-desc) h1, :deep(.job-desc) h2, :deep(.job-desc) h3, :deep(.job-desc) h4 { color: white; font-weight: 600; margin: 0.75em 0 0.25em; font-size: 0.95em; }
:deep(.job-desc) p { margin: 0.5em 0; }
:deep(.job-desc) ul, :deep(.job-desc) ol { padding-left: 1.5em; margin: 0.5em 0; }
:deep(.job-desc) li { margin: 0.25em 0; }
:deep(.job-desc) a { color: #22d3ee; text-decoration: underline; }
:deep(.job-desc) strong, :deep(.job-desc) b { color: white; }
</style>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

interface SessionLog {
  id: string
  session_date: string
  category: string
  title: string
  description: string
  details: Record<string, unknown>
  tags: string[]
  status: string
  created_at: string
}

const logs = ref<SessionLog[]>([])
const loading = ref(true)
const filterCategory = ref('')
const searchQuery = ref('')
const showAdd = ref(false)
void 0 // showDetail and detailLog removed — version modal handles all

const newLog = ref({
  category: 'development',
  title: '',
  description: '',
  tags: '',
  status: 'completed',
})

const CATEGORIES = [
  { value: 'development', label: 'Development', icon: '💻', color: 'text-blue-400' },
  { value: 'feature', label: 'New Feature', icon: '✨', color: 'text-green-400' },
  { value: 'bugfix', label: 'Bug Fix', icon: '🐛', color: 'text-red-400' },
  { value: 'deployment', label: 'Deployment', icon: '🚀', color: 'text-purple-400' },
  { value: 'architecture', label: 'Architecture', icon: '🏗️', color: 'text-amber-400' },
  { value: 'pipeline', label: 'Pipeline', icon: '⚙️', color: 'text-cyan-400' },
  { value: 'integration', label: 'Integration', icon: '🔗', color: 'text-indigo-400' },
  { value: 'documentation', label: 'Documentation', icon: '📄', color: 'text-gray-400' },
  { value: 'apply_session', label: 'Apply Session', icon: '📨', color: 'text-emerald-400' },
  { value: 'debug', label: 'Debug Session', icon: '🔍', color: 'text-orange-400' },
]

const expandedVersions = ref<Set<string>>(new Set())
const currentPage = ref(1)
const perPage = 5
const logPage = ref(1)
const logsPerPage = 15
void 0 // detailLogTab removed

// toggleVersion kept for future accordion mode
void expandedVersions

const filtered = computed(() => {
  let result = [...logs.value]
  if (filterCategory.value) result = result.filter(l => l.category === filterCategory.value)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(l => l.title.toLowerCase().includes(q) || l.description?.toLowerCase().includes(q) || l.tags?.some(t => t.toLowerCase().includes(q)))
  }
  return result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
})

// Group logs by version (date-based sessions)
const versionGroups = computed(() => {
  const groups: { version: string; date: string; label: string; logs: SessionLog[]; stats: Record<string, number> }[] = []
  const byDate: Record<string, SessionLog[]> = {}

  for (const l of filtered.value) {
    const d = l.session_date || l.created_at.split('T')[0]
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(l)
  }

  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))
  let patchNum = dates.length

  for (const date of dates) {
    const entries = byDate[date]
    const stats: Record<string, number> = {}
    for (const e of entries) stats[e.category] = (stats[e.category] || 0) + 1

    groups.push({
      version: `v2.${patchNum}.0`,
      date,
      label: new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      logs: entries.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
      stats,
    })
    patchNum--
  }

  // Auto-expand the latest version
  if (groups.length > 0 && expandedVersions.value.size === 0) {
    expandedVersions.value.add(groups[0].version)
  }

  return groups
})

// Version pagination
const versionPage = ref(1)
const versionsPerPage = 5
const totalVersionPages = computed(() => Math.max(1, Math.ceil(versionGroups.value.length / versionsPerPage)))
const paginatedVersions = computed(() => versionGroups.value.slice((versionPage.value - 1) * versionsPerPage, versionPage.value * versionsPerPage))

// Version detail modal
const showVersionDetail = ref(false)
const selectedVersion = ref<typeof versionGroups.value[0] | null>(null)

function openVersionDetail(group: typeof versionGroups.value[0]) {
  selectedVersion.value = group
  showVersionDetail.value = true
}

function downloadVersionPdf(group: typeof versionGroups.value[0]) {
  const win = window.open('', '_blank')
  if (!win) return
  const style = 'body{font-family:system-ui;max-width:900px;margin:0 auto;padding:40px;color:#1a1a2e}h1{color:#6366f1;border-bottom:3px solid #6366f1;padding-bottom:10px}h2{color:#4338ca;margin-top:30px}h3{color:#7c3aed;margin-top:20px}.entry{border:1px solid #e2e8f0;border-radius:12px;margin:16px 0;overflow:hidden}.entry-head{background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e2e8f0}.entry-body{padding:16px;font-size:13px;line-height:1.7;white-space:pre-wrap}.tag{display:inline-block;background:#f1f5f9;padding:2px 8px;border-radius:12px;font-size:11px;margin:2px}.cat{font-size:11px;font-weight:600}'
  let html = '<h1>' + group.version + ' — ' + group.label + '</h1>'
  html += '<p>' + group.logs.length + ' changes</p>'
  html += '<h2>Change Log</h2>'
  for (let i = 0; i < group.logs.length; i++) {
    const l = group.logs[i]
    const cat = getCat(l.category)
    html += '<div class="entry">'
    html += '<div class="entry-head"><strong>' + (i + 1) + '. ' + l.title + '</strong><br><span class="cat">' + cat.icon + ' ' + cat.label + '</span>'
    if (l.tags?.length) html += ' · ' + l.tags.map(t => '<span class="tag">' + t + '</span>').join(' ')
    html += '</div>'
    if (l.description) html += '<div class="entry-body">' + l.description.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>'
    html += '</div>'
  }
  win.document.write('<html><head><title>NEURALYX ' + group.version + '</title><style>' + style + '</style></head><body>' + html + '</body></html>')
  win.document.close()
  setTimeout(() => win.print(), 500)
}

void currentPage; void perPage

void logPage; void logsPerPage // kept for future table view

function downloadReportPdf() {
  const win = window.open('', '_blank')
  if (!win) return
  const style = 'body{font-family:system-ui;max-width:800px;margin:0 auto;padding:40px;color:#1a1a2e}h1{color:#6366f1}h2{color:#4338ca;border-bottom:2px solid #e2e8f0;padding-bottom:8px}h3{color:#7c3aed}pre{background:#f1f5f9;padding:16px;border-radius:8px;font-size:13px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #e2e8f0;padding:8px 12px;text-align:left;font-size:13px}th{background:#f8fafc;font-weight:600}'
  const body = reportResult.value.replace(/\n/g, '<br>')
  win.document.write('<html><head><title>NEURALYX Session Report</title><style>' + style + '</style></head><body>' + body + '</body></html>')
  win.document.close()
  setTimeout(() => win.print(), 500)
}

function getCat(cat: string) { return CATEGORIES.find(c => c.value === cat) || CATEGORIES[0] }

async function fetchLogs() {
  loading.value = true
  const saved = localStorage.getItem('neuralyx_session_logs')
  if (saved) {
    try { logs.value = JSON.parse(saved) } catch { logs.value = [] }
  }
  // Auto-seed if empty
  if (logs.value.length === 0) {
    logs.value = getSessionSeed()
    saveLogs()
  } else {
    // Migration: append any seed entries not yet in localStorage (new sessions)
    const existing = new Set(logs.value.map((l: SessionLog) => l.id))
    const missing = getSessionSeed().filter(s => !existing.has(s.id))
    if (missing.length > 0) {
      logs.value = [...logs.value, ...missing]
      saveLogs()
    }
  }
  loading.value = false
}

function getSessionSeed(): SessionLog[] {
  return [
    {id:'sl-001',session_date:'2026-04-06',category:'integration',title:'Gmail/SMTP Configuration',description:'Configured Resend SMTP (free 100/day), then switched to cPanel SMTP (portfolio@neuralyx.ai.dev-environment.site).\n\nChanges:\n- docker-compose.yml: SMTP_HOST=dev-environment.site, SMTP_PORT=465\n- mcp-server/src/api.ts: Added Reply-To header, BCC to Gmail on all outbound\n- Resume auto-attached from /app/uploads/resume.pdf\n\nFlow: Application email FROM gabrielalvin.jobs@gmail.com (via cPanel relay) → TO recruiter → BCC Gmail → ONE notification email with full details',tags:['smtp','email','cpanel','resend'],status:'completed',created_at:'2026-04-06T14:00:00Z',details:{}},
    {id:'sl-002',session_date:'2026-04-06',category:'feature',title:'Cover Letter Engine — Problem-Solution Framework',description:'Built cover letter generator based on 80+ hiring studies.\n\nFramework:\n¶1 — Company BUSINESS PAIN POINT (from JD)\n¶2 — YOUR approach + tools + proof (NEURALYX 48 services, LIVITI 95%)\n¶3 — RESULTS + ROI for the business\n¶4 — 30-60 day contribution plan\n\nDomains referenced: Business Automation, Marketing Automation, AI & ML, DevOps/MLOps, AI Chatbots, Systems Integration, Data & Analytics\n\nFiles: mcp-server/src/api.ts (handleCoverLetterInternal)',tags:['cover-letter','ai','gemini','framework'],status:'completed',created_at:'2026-04-06T15:00:00Z',details:{}},
    {id:'sl-003',session_date:'2026-04-06',category:'feature',title:'Notification Email System',description:'Built HTML notification emails with 5 sections:\n1. Overview (salary, type, role, company, posted date)\n2. Job Details (full description)\n3. Match Analysis (score bar, skills matched/gaps)\n4. Cover Letter Sent (full text)\n5. How to Apply (method, channels, URLs)\n\nLight/dark blended design. NEURALYX logo as CID inline attachment.\nONE notification per application (fixed double-send bug).\n\nFiles: mcp-server/src/api.ts (sendApplyNotification)',tags:['notification','email','template','logo'],status:'completed',created_at:'2026-04-06T16:00:00Z',details:{}},
    {id:'sl-004',session_date:'2026-04-06',category:'apply_session',title:'First 10 Email Applications Sent',description:'Sent 10 email applications to recruiters:\n1. AllBoard Solutions (Joborix)\n2. InspectMind AI YC W24 (YCombinator)\n3. Parallel Distribution (JobLeads)\n4. Accenture Philippines\n5. KPMG Philippines - AI Engineer\n6. Zipdev - Tech Lead (RemoteOK)\n7. ZIRKEL8 TIECORP (Arbeitnow)\n8. KPMG Philippines - ServiceNow\n9. Nomitri (Arbeitnow)\n10. Get Mika GmbH (Arbeitnow)\n\nAll with Problem-Solution cover letters. BCC to Gmail.',tags:['apply','email','batch-10'],status:'completed',created_at:'2026-04-06T17:00:00Z',details:{}},
    {id:'sl-005',session_date:'2026-04-07',category:'architecture',title:'Playwright CDP Browser Automation Engine',description:'Built universal apply engine using Playwright CDP to existing Edge Profile 7.\n\nKey insight: connectOverCDP() attaches to running browser — no new window, no session wipes, no profile locking.\n\nFiles created:\n- scripts/apply-all-platforms.ts — Universal apply (all platforms)\n- scripts/platform-configs.ts — Selectors for 12+ platforms\n- scripts/answer-engine.ts — Form question answering\n- scripts/applicant-profile.ts — Shared profile constants\n- scripts/apply-server.ts — Local HTTP server (port 8081)\n- scripts/login-platforms.ts — CDP-aware login helper\n\nEdge Profile 7 on CDP port 9222.',tags:['playwright','cdp','edge','browser','architecture'],status:'completed',created_at:'2026-04-07T01:00:00Z',details:{}},
    {id:'sl-006',session_date:'2026-04-07',category:'apply_session',title:'OnlineJobs.ph Browser Apply — 7 Confirmed',description:'Applied to 7 jobs on OnlineJobs.ph via Playwright CDP:\n1. Senior SE AI Automation & Web Integration @ OpenClaw\n2. AI Automation Engineer\n3. Senior AI Automation Engineer - OpenClaw Expert\n4. AI Automation Engineer / Senior Programmer (Python, APIs)\n5. Backend Software Engineer (AI Systems & Automation)\n6. Solutions Engineer - AI & Website Automation (failed - no button)\n7. Fullstack Developer NodeJS/TypeScript/Tailwind/Vue\n\nScreenshot confirmed: "Awesome, you have successfully sent the email for your job application!"',tags:['apply','browser','onlinejobs','confirmed','screenshot'],status:'completed',created_at:'2026-04-07T02:00:00Z',details:{}},
    {id:'sl-007',session_date:'2026-04-07',category:'architecture',title:'Multi-Channel Orchestrator Engine',description:'Built orchestrator.ts — multi-channel application execution.\n\nFlow:\n1. buildApplicationStrategy() → {primary, secondary[], delays}\n2. executeMultiChannelStrategy() → creates channel_executions rows\n3. Primary fires immediately (browser or email)\n4. Secondaries scheduled with delay_hours\n5. processScheduledChannels() polls every 60s\n6. handleChannelFallback() promotes next secondary on failure\n\nSmart Rules:\n- Match 80%+ → PARALLEL all channels\n- Match <50% → single channel only\n- Company portal available → prioritize it\n- Email found → add as secondary (4h delay)\n\nNew table: channel_executions (Supabase)\nNew endpoint: POST /api/jobs/multi-orchestrate',tags:['orchestrator','multi-channel','strategy','architecture'],status:'completed',created_at:'2026-04-07T05:00:00Z',details:{}},
    {id:'sl-008',session_date:'2026-04-07',category:'architecture',title:'Vector DB + RAG + ML Analytics Layer',description:'Phase 4+5 of the intelligence upgrade.\n\nVector DB:\n- job_embeddings table with pgvector extension\n- Semantic chunking: responsibilities, requirements, skills, benefits\n- AI service endpoints: /semantic/chunk-job, /rag/cover-letter\n\nML Analytics:\n- channel_performance table\n- aggregateChannelPerformance() — nightly aggregation\n- predictChannelSuccess() — heuristic-based (upgrades to ML after 50+ data points)\n- Nightly analytics runs after daily pipeline\n\nFiles: mcp-server/src/analytics.ts, ai-service/main.py',tags:['vector','rag','pgvector','ml','analytics','architecture'],status:'completed',created_at:'2026-04-07T06:00:00Z',details:{}},
    {id:'sl-009',session_date:'2026-04-07',category:'feature',title:'Gemini Vision CAPTCHA Solver (FREE)',description:'Built gemini-captcha-solver.ts using Gemini 2.5 Flash Vision.\n\nHow it works:\n1. Detect CAPTCHA type (reCAPTCHA, hCaptcha, Turnstile, text, slide)\n2. Screenshot the challenge\n3. Send to Gemini Vision for analysis\n4. Parse AI response into tile coordinates or text\n5. Click correct tiles / type text\n6. Verify and retry (up to 3 attempts)\n\nZero cost — uses existing Gemini API key.\nWired into apply-all-platforms.ts via captcha-solver.ts re-export.\n\nAlso installed: ai-captcha-bypass (Python fallback), NopeCHA (100 free/day option)',tags:['captcha','gemini','vision','free','playwright'],status:'completed',created_at:'2026-04-07T08:00:00Z',details:{}},
    {id:'sl-010',session_date:'2026-04-07',category:'feature',title:'URL Paste Auto-Apply (6-Step Pipeline)',description:'Added "Quick Apply from URL" in Job Applications page.\n\n6-Step Pipeline:\n1. Dedup Check — URL match + title/company match\n2. Research — Fetch page, extract JD\n3. AI Score — Gemini classifies, scores 0-100%\n4. Cover Letter — Problem-Solution framework from JD\n5. Channel Detection — Detect all apply methods\n6. Apply — Fire all available channels\n\nDuplicate handling:\n- If found → "Re-Apply Anyway" + "View Existing" buttons\n- Fixed false positive bug (was matching ANY applied job)\n\nAuto-opens detail modal after completion.',tags:['url-paste','pipeline','dedup','6-step'],status:'completed',created_at:'2026-04-07T10:00:00Z',details:{}},
    {id:'sl-011',session_date:'2026-04-07',category:'feature',title:'Application Detail — 6-Tab Floating Window',description:'Enlarged floating window (max-w-4xl) with 6 tabs:\n1. Pipeline — 10-stage progress + channel executions\n2. Overview — Salary, Type, Role, Company, Location, Seniority\n3. Job Details — Full JD (HTML rendered)\n4. Match Analysis — Score bar, skills matched (green), gaps (amber)\n5. Cover Letter — Full text sent to employer\n6. How to Apply — Channel executions + available channels + links\n\nPer-channel badges: 🖱️ job_board ✅ | 📧 email ✅ | 👤 recruiter ⏳\nClickable rows open detail.\nAI Check Status button (4-step: rescore, cover letter, channels, nurture).',tags:['ui','tabs','floating-window','6-tab'],status:'completed',created_at:'2026-04-07T11:00:00Z',details:{}},
    {id:'sl-012',session_date:'2026-04-07',category:'feature',title:'Auto-Apply Toggle + 8 Character References',description:'Job Agent tab additions:\n\nAuto-Apply Toggle:\n- Big ON/OFF button (green/red)\n- When OFF, Step 6 skips and shows "X jobs ready"\n- When ON, fires multi-channel orchestrator\n\nCharacter References (8 contacts):\n1. Joy Nicole Canutab — Instructor, Univ of Cordilleras\n2. Lito Lozada — Full Stack Dev, Cessto Web Solutions\n3. Tony Ajhar — Lead Marketing, Access Insurance\n4. David Rush — COO, Access Insurance\n5. Phil Wardell — CEO, Access Insurance\n6. Princess Sta. Ana — Marketing Director, Access Insurance\n7. Grace Z. — VA, Gcorp Industries\n8. Mikel Resaba — Content & SEO Manager, Liviti\n\n4 selected as defaults. Click to toggle. Saved to localStorage.',tags:['ui','auto-apply','references','character'],status:'completed',created_at:'2026-04-07T12:00:00Z',details:{}},
    {id:'sl-013',session_date:'2026-04-07',category:'feature',title:'News Tools — Caveman Compress + Anton Agent',description:'Added to News & Articles management:\n\n🦴 Caveman Compress:\n- Bulk compress article summaries (~65% token reduction)\n- Removes filler, keeps technical terms\n- Regen Thumbnails button\n\n🧠 Anton Agent:\n- Discover Trending Topics — AI scans for latest tech/AI news\n- Content Gaps — Analyzes existing articles by category, suggests fill articles\n- Click "Generate" on any suggestion → auto-creates article\n\nAlso installed caveman skill: npx skills add JuliusBrussee/caveman',tags:['news','caveman','anton','content','skill'],status:'completed',created_at:'2026-04-07T13:00:00Z',details:{}},
    {id:'sl-014',session_date:'2026-04-07',category:'apply_session',title:'Batch 20 + Fresh 10 = 30 Applications',description:'Round 2 applications:\n\nBatch 20 (existing DB jobs):\n- 20/20 email applied\n- Platforms: Upwork, YC startups (SigNoz, Lago, Hive, Ashby, Bild AI, GoGoGrandparent), ServiceNow, Superbench, Mindrift, Yondu, Delta Exchange, Byrd, LumiMeds, Pavago, Resume Database\n\nFresh 10 (JSearch new):\n- Pulled 10 new jobs (Indeed, Dice, Jobgether, Novaedge)\n- 9/10 applied, 1 failed (cover letter gen error)\n\nAll with Problem-Solution cover letters via Gemini.\nResume attached. BCC to Gmail.',tags:['apply','email','batch-30','jsearch'],status:'completed',created_at:'2026-04-07T14:00:00Z',details:{}},
    {id:'sl-015',session_date:'2026-04-07',category:'debug',title:'Indeed Apply — CAPTCHA + React Form Issues',description:'Attempted 5 Indeed browser applies. Results:\n- 3 blocked by CAPTCHA (reCAPTCHA v2)\n- 2 failed: React controlled components reject programmatic input\n\nRoot causes:\n1. Indeed uses React controlled components — native value setter + dispatchEvent fills DOM but React state doesnt update\n2. Continue button in CSS overlay (visibility:hidden) — force:true doesnt work\n3. Phone field defaults to US +1 instead of PH +63\n\nSolution built:\n- Gemini Vision CAPTCHA solver (gemini-captcha-solver.ts)\n- Dialog-aware selectors needed: [role="dialog"] button\n- Let Indeed auto-fill from saved profile (dont inject values)',tags:['indeed','captcha','debug','react','playwright'],status:'completed',created_at:'2026-04-07T16:00:00Z',details:{}},
    {id:'sl-016',session_date:'2026-04-07',category:'integration',title:'Career-Ops Repo Analysis for ATS Integration',description:'Analyzed santifer/career-ops for reusable components.\n\nADOPTING:\n✅ Greenhouse direct API: boards-api.greenhouse.io/v1/boards/{slug}/jobs\n✅ ATS URL pattern detection: Greenhouse, Lever, Ashby, Workday, BambooHR\n✅ Portal YAML config pattern for company tracking\n✅ Liveness error signal patterns\n\nNOT ADOPTING:\n❌ Resume/CV generation (we use fixed resume)\n❌ Terminal dashboard (our Vue dashboard is richer)\n❌ Single-channel apply (we have multi-channel)\n❌ Human-in-loop only (we have auto-apply)\n❌ Batch shell scripts (we have Docker + API)',tags:['career-ops','ats','greenhouse','lever','analysis'],status:'completed',created_at:'2026-04-07T17:00:00Z',details:{}},
    {id:'sl-017',session_date:'2026-04-07',category:'documentation',title:'Session Logs Page + Full Architecture Documentation',description:'Created /admin/jobs/session-logs page.\n\nFeatures:\n- Table management with 10 categories\n- Tags, search, filter by category\n- Detail modal with full description\n- Export as Markdown or JSON\n- Auto-seed with 17 development history entries\n- localStorage persistence\n\nAlso created:\n- Full 10-step pipeline architecture diagram\n- Career-ops comparison checklist\n- Complete application flow documentation\n\nRoute: admin-jobs-session-logs\nSidebar: Added below Jobs Pipeline\nSub-nav: Added as tab inside Jobs Pipeline',tags:['session-logs','documentation','admin','architecture'],status:'completed',created_at:'2026-04-07T18:00:00Z',details:{}},

    // ── 2026-04-18 Session ─────────────────────────────────────────────────
    {id:'sl-018',session_date:'2026-04-18',category:'architecture',title:'VoxCPM — CosyVoice2 → Coqui XTTS-v2 Migration',description:'CosyVoice2-0.5B abandoned due to unresolvable dependency chain (~15 PyPI conflicts: raw_audio_augmentation not on PyPI, aoti_torch_abi_version ABI mismatch, NoExtraItems typing_extensions, numpy 2.x broke torch C API, whisper/inflect/hyperpyyaml missing).\n\nMigrated to Coqui TTS XTTS-v2 — single pip install, zero-shot voice cloning, same quality:\n\ndocker/Dockerfile.voxcpm:\n- FROM python:3.10-slim\n- torch==2.4.1 + torchaudio==2.4.1 (CPU wheel)\n- TTS==0.22.0 (Coqui — all deps bundled)\n- transformers>=4.33.0,<4.40.0 (pin: BeamSearchScorer removed in 4.40+)\n\ndocker/voxcpm/server.py:\n- COQUI_TOS_AGREED=1 env to bypass interactive TOS prompt\n- TTS("tts_models/multilingual/multi-dataset/xtts_v2").tts_to_file()\n- Background thread model loading, /health returns status:loading during download\n- Model cached to D:/TECK TOOLS/models/voxcpm (1.87GB, first run only)\n\nBoth VoxCPM and SadTalker remain DISABLED pending NVIDIA GPU upgrade.',tags:['voxcpm','xtts-v2','coqui','docker','tts','gpu-pending'],status:'completed',created_at:'2026-04-18T06:00:00Z',details:{}},

    {id:'sl-019',session_date:'2026-04-18',category:'bugfix',title:'HeyGen "Use as Sample" — Stack Overflow Fix + Server-Side Download',description:'BUG: Maximum call stack size exceeded when clicking "Use as Sample" on HeyGen voice clones.\n\nRoot cause: btoa(String.fromCharCode(...new Uint8Array(ab))) spread operator blows stack on audio files >1MB.\n\nTwo fixes applied:\n\n1. uploadVoiceSample() — chunked btoa conversion:\n   for (let i = 0; i < bytes.length; i += 8192)\n     binary += String.fromCharCode(...bytes.subarray(i, Math.min(i+8192, bytes.length)))\n\n2. useHeygenCloneAsSample() — eliminated btoa entirely:\n   - New MCP endpoint: POST /api/heygen/use-as-sample {voice_id, preview_url}\n   - Server downloads audio, caches as heygen_voice_{id}.{ext}, copies to _voice_sample.{ext}\n   - Browser never touches the audio bytes\n\nFiles: mcp-server/src/api.ts (handleHeyGenUseAsSample route), VideoCreation.vue',tags:['bugfix','heygen','btoa','stack-overflow','audio','mcp'],status:'completed',created_at:'2026-04-18T07:00:00Z',details:{}},

    {id:'sl-020',session_date:'2026-04-18',category:'feature',title:'VideoCreation — Script Pop-Out: Float Overlay + Browser Window',description:'Added two script editor pop-out modes to Step 2 (AI Answer) of VideoCreation wizard:\n\n"Float" button (purple) — in-page draggable overlay:\n- <Teleport to="body"> with fixed positioning\n- Drag handle on title bar (mousedown/mousemove/mouseup)\n- Live v-model binding to script ref\n- Refine panel embedded inside\n- Returns to inline on close\n\n"New Window" button (cyan) — real browser popup:\n- window.open() with 620×700 dimensions\n- Full HTML/CSS/JS written via document.write()\n- BroadcastChannel("neuralyx-script-sync") bidirectional sync\n- Popup edits → postMessage type:script-update → main updates\n- Main script changes → watch(script) → postMessage type:script-push\n- Refine note from popup → type:refine-request → triggers refineScript()\n- Popup shows word count, duration, ⚠ Too long warning\n\nFixed TS6133: merged _scriptChannel/_scriptWin into _scriptRefs object.',tags:['feature','script','popout','broadcast-channel','draggable','teleport'],status:'completed',created_at:'2026-04-18T08:00:00Z',details:{}},

    {id:'sl-021',session_date:'2026-04-18',category:'bugfix',title:'Question Bank — Preloaded Questions Navigation Fix',description:'BUG: Clicking a preloaded question (no saved answer) silently loaded the question text but left the old script visible at Step 2 — user had to manually clear and navigate back.\n\nFix in loadSaved():\n  if (item.answer) {\n    generatedAnswer.value = item.answer\n    script.value = item.answer\n    currentStep.value = 2           // jump to answer step\n  } else {\n    generatedAnswer.value = ""\n    script.value = ""\n    genError.value = ""\n    agentThinking.value = ""\n    currentStep.value = 1           // navigate to question step\n  }\n\nPreloaded questions (id starts with "pre-") have empty answer field, so they now correctly navigate to Step 1 with a clean slate.',tags:['bugfix','question-bank','navigation','preloaded','videocreation'],status:'completed',created_at:'2026-04-18T09:00:00Z',details:{}},

    {id:'sl-022',session_date:'2026-04-18',category:'feature',title:'VideoCreation — Session Logs Tab + CCTV Service Monitor',description:'Two new features added to VideoCreation admin page:\n\nSESSION LOGS TAB:\n- Right sidebar converted to tabbed panel: Pipeline | Session Logs\n- Version badge (v0.9.2) in page header\n- Persistent disabled-feature banners: VoxCPM ⚡ GPU Pending, SadTalker ⚡ GPU Pending\n- Auto-log watcher for genLog, ttsLog, videoLog, emailLog + all error refs\n- Logs colored by level: info/success/warn/error/disabled\n- Timestamps, tag labels, scrollable list (max 300 entries)\n- Clear button\n\nCCTV SERVICE MONITOR:\n- 📹 CCTV button in header with live status dots\n- Bottom slide-up panel (Teleport) showing 6 service cards:\n  MCP Server :8080 | n8n :5678 | Searxng :8888 | Browserless :3333 | VoxCPM :7861 (disabled) | SadTalker :7860 (disabled)\n- Each card: status dot, port, status badge, last check time\n- ↻ Check button per service\n- ⧉ Pop button → opens dedicated browser window for that service\n  - Popup: live 5s health polling, activity log, BroadcastChannel sync\n  - Disabled services show GPU upgrade pending screen instead of polling\n- Refresh All button checks all active services\n- GPU pending note at bottom\n\nAnimation: cctv-slide (translateY from bottom)',tags:['feature','cctv','monitor','session-logs','sidebar','tabs','popout','gpu-pending'],status:'completed',created_at:'2026-04-18T12:00:00Z',details:{}}
  ]
}

function saveLogs() {
  localStorage.setItem('neuralyx_session_logs', JSON.stringify(logs.value))
}

async function addLog() {
  if (!newLog.value.title) return
  const log: SessionLog = {
    id: crypto.randomUUID(),
    session_date: new Date().toISOString().split('T')[0],
    category: newLog.value.category,
    title: newLog.value.title,
    description: newLog.value.description,
    details: {},
    tags: newLog.value.tags.split(',').map(t => t.trim()).filter(Boolean),
    status: newLog.value.status,
    created_at: new Date().toISOString(),
  }
  logs.value.unshift(log)
  saveLogs()
  newLog.value = { category: 'development', title: '', description: '', tags: '', status: 'completed' }
  showAdd.value = false
}

const deleteLog = (id: string) => {
  if (!confirm('Delete this log entry?')) return
  logs.value = logs.value.filter(l => l.id !== id)
  saveLogs()
}
void deleteLog // used in template

function exportAsJSON() {
  const blob = new Blob([JSON.stringify(logs.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `neuralyx-session-logs-${new Date().toISOString().split('T')[0]}.json`
  a.click(); URL.revokeObjectURL(url)
}

const reportGenerating = ref(false)
const reportResult = ref('')
const showReport = ref(false)

async function generateSessionReport() {
  reportGenerating.value = true
  reportResult.value = ''

  const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'

  // Gather all data for the AI agent
  const allLogs = logs.value
  const byCategory: Record<string, number> = {}
  const byDate: Record<string, SessionLog[]> = {}
  for (const l of allLogs) {
    byCategory[l.category] = (byCategory[l.category] || 0) + 1
    const d = l.session_date || l.created_at.split('T')[0]
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(l)
  }

  const logSummaries = allLogs.map(l =>
    `[${l.session_date}] [${l.category}] ${l.title}: ${(l.description || '').slice(0, 200)}`
  ).join('\n')

  try {
    const res = await fetch(`${mcpUrl}/api/jobs/cover-letter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'session_report',
        company: 'NEURALYX',
        description: `Generate a STRUCTURED SESSION REPORT in this exact format:

# NEURALYX Development Session Report
## Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
## Version: 2.0.0

### EXECUTIVE SUMMARY
(2-3 sentences summarizing what was accomplished)

### PATCH LOG — NEW FEATURES
(List each new feature with bullet points)

### PATCH LOG — INTEGRATIONS
(List integrations: SMTP, APIs, platforms connected)

### PATCH LOG — ARCHITECTURE CHANGES
(Database tables, new services, infrastructure)

### PATCH LOG — BUG FIXES
(Issues found and resolved)

### APPLICATION PIPELINE STATUS
(Total applications, by method, by platform)

### SYSTEM COMPARISON — BEFORE vs AFTER
| Component | Before | After |
(Table comparing old state vs new state)

### KNOWN ISSUES & NEXT SESSION PRIORITIES
(What still needs fixing)

### FILES MODIFIED
(List of key files changed)

### METRICS
- Total Session Logs: ${allLogs.length}
- Categories: ${JSON.stringify(byCategory)}
- Sessions: ${Object.keys(byDate).length} days

Here are ALL the session log entries to analyze:

${logSummaries}

Generate the report NOW. Use the EXACT format above. Be specific — reference real file names, real numbers, real features. This is a professional development audit.`,
      }),
      signal: AbortSignal.timeout(60000),
    })

    if (res.ok) {
      const data = await res.json()
      reportResult.value = data.cover_letter || 'Report generation failed'
    } else {
      reportResult.value = 'AI service error — could not generate report'
    }
  } catch (e) {
    reportResult.value = `Error: ${e}`
  }

  reportGenerating.value = false
  showReport.value = true

  // Auto-save as a new log entry
  const reportLog: SessionLog = {
    id: crypto.randomUUID(),
    session_date: new Date().toISOString().split('T')[0],
    category: 'documentation',
    title: `Session Report — ${new Date().toLocaleDateString()}`,
    description: reportResult.value,
    details: { auto_generated: true, logs_analyzed: allLogs.length },
    tags: ['report', 'auto-generated', 'patch-log'],
    status: 'completed',
    created_at: new Date().toISOString(),
  }
  logs.value.unshift(reportLog)
  saveLogs()
}

function downloadReport() {
  const blob = new Blob([reportResult.value], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `neuralyx-session-report-${new Date().toISOString().split('T')[0]}.md`
  a.click(); URL.revokeObjectURL(url)
}

function exportAsMarkdown() {
  let md = `# NEURALYX Session Logs\n\nGenerated: ${new Date().toLocaleString()}\n\n`
  const grouped: Record<string, SessionLog[]> = {}
  for (const l of logs.value) {
    const date = l.session_date || l.created_at.split('T')[0]
    if (!grouped[date]) grouped[date] = []
    grouped[date].push(l)
  }
  for (const [date, entries] of Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]))) {
    md += `## ${date}\n\n`
    for (const e of entries) {
      const cat = getCat(e.category)
      md += `### ${cat.icon} ${e.title}\n`
      md += `**Category:** ${cat.label} | **Status:** ${e.status}\n`
      if (e.tags?.length) md += `**Tags:** ${e.tags.join(', ')}\n`
      md += `\n${e.description || ''}\n\n---\n\n`
    }
  }
  const blob = new Blob([md], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `neuralyx-session-logs-${new Date().toISOString().split('T')[0]}.md`
  a.click(); URL.revokeObjectURL(url)
}

onMounted(fetchLogs)
</script>

<template>
  <div>
    <!-- Header -->
    <div class="flex items-center justify-between mb-5">
      <div>
        <h2 class="text-xl font-bold text-white">Session Logs</h2>
        <p class="text-xs text-gray-500">Development history, architecture docs, pipeline reports</p>
      </div>
      <div class="flex gap-2">
        <button @click="generateSessionReport" :disabled="reportGenerating"
          class="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-red-500 text-white text-xs font-medium rounded-lg disabled:opacity-50 flex items-center gap-1.5">
          <svg v-if="reportGenerating" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          {{ reportGenerating ? 'Generating...' : '🧠 Generate Report' }}
        </button>
        <button @click="exportAsMarkdown" class="px-3 py-1.5 bg-neural-700 text-gray-300 text-xs rounded-lg hover:bg-neural-600">Export MD</button>
        <button @click="exportAsJSON" class="px-3 py-1.5 bg-neural-700 text-gray-300 text-xs rounded-lg hover:bg-neural-600">Export JSON</button>
        <button @click="showAdd = !showAdd" class="px-4 py-1.5 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white text-xs font-medium rounded-lg">
          {{ showAdd ? 'Cancel' : '+ New Log' }}
        </button>
      </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-5 gap-3 mb-5">
      <div v-for="cat in CATEGORIES.slice(0, 5)" :key="cat.value" class="glass-dark rounded-xl p-3 border border-neural-700/50 text-center">
        <p class="text-2xl">{{ cat.icon }}</p>
        <p class="text-lg font-bold text-white">{{ logs.filter(l => l.category === cat.value).length }}</p>
        <p class="text-[9px] text-gray-500">{{ cat.label }}</p>
      </div>
    </div>

    <!-- Add Form -->
    <div v-if="showAdd" class="mb-5 p-4 glass-dark rounded-xl border border-cyber-purple/20">
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label class="block text-[10px] text-gray-500 uppercase mb-1">Title *</label>
          <input v-model="newLog.title" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" placeholder="What was done..." />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] text-gray-500 uppercase mb-1">Category</label>
            <select v-model="newLog.category" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none">
              <option v-for="c in CATEGORIES" :key="c.value" :value="c.value">{{ c.icon }} {{ c.label }}</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] text-gray-500 uppercase mb-1">Tags (comma)</label>
            <input v-model="newLog.tags" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" placeholder="smtp, indeed, fix" />
          </div>
        </div>
      </div>
      <div class="mb-3">
        <label class="block text-[10px] text-gray-500 uppercase mb-1">Description (Markdown supported)</label>
        <textarea v-model="newLog.description" rows="4" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none font-mono" placeholder="Detailed description of what was done, changes made, files modified..." />
      </div>
      <button @click="addLog" :disabled="!newLog.title" class="px-5 py-2 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white text-sm font-medium rounded-lg disabled:opacity-40">Save Log Entry</button>
    </div>

    <!-- Filters -->
    <div class="flex items-center gap-3 mb-4">
      <input v-model="searchQuery" placeholder="Search logs..." class="flex-1 px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
      <select v-model="filterCategory" class="px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none">
        <option value="">All Categories</option>
        <option v-for="c in CATEGORIES" :key="c.value" :value="c.value">{{ c.icon }} {{ c.label }}</option>
      </select>
      <span class="text-[10px] text-gray-500">{{ filtered.length }} entries</span>
    </div>

    <!-- Version Cards -->
    <div v-if="versionGroups.length === 0" class="text-center py-16 glass-dark rounded-xl border border-neural-700/50">
      <p class="text-4xl mb-3">📋</p>
      <p class="text-lg font-semibold text-white mb-2">No session logs yet</p>
      <p class="text-gray-500 text-sm">Click "+ New Log" to record development activity</p>
    </div>

    <div v-else class="space-y-3">
      <div v-for="group in paginatedVersions" :key="group.version"
        class="glass-dark rounded-xl border border-neural-700/50 overflow-hidden hover:border-neural-600 transition-colors">
        <div class="flex items-center justify-between px-5 py-4">
          <div class="flex items-center gap-4">
            <span class="px-3 py-1.5 rounded-lg text-sm font-bold text-white" style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">{{ group.version }}</span>
            <div>
              <p class="text-sm font-semibold text-white">{{ group.label }}</p>
              <p class="text-[10px] text-gray-500">{{ group.logs.length }} changes · {{ Object.keys(group.stats).map(k => getCat(k).icon + ' ' + group.stats[k]).join('  ') }}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <div class="flex gap-1">
              <span v-for="(count, cat) in group.stats" :key="cat"
                class="px-2 py-0.5 rounded-full text-[9px] font-medium bg-neural-700/50" :class="getCat(String(cat)).color">
                {{ getCat(String(cat)).icon }} {{ count }}
              </span>
            </div>
            <button @click="openVersionDetail(group)"
              class="px-4 py-2 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white text-xs font-medium rounded-lg hover:opacity-90">
              View Details
            </button>
          </div>
        </div>
        <!-- Preview: first 3 titles -->
        <div class="px-5 pb-3 flex flex-wrap gap-2">
          <span v-for="log in group.logs.slice(0, 4)" :key="log.id" class="text-[9px] text-gray-500 bg-neural-800/50 px-2 py-0.5 rounded">{{ log.title.slice(0, 35) }}{{ log.title.length > 35 ? '...' : '' }}</span>
          <span v-if="group.logs.length > 4" class="text-[9px] text-gray-600">+{{ group.logs.length - 4 }} more</span>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalVersionPages > 1" class="flex items-center justify-between mt-4">
        <p class="text-[10px] text-gray-500">Page {{ versionPage }} of {{ totalVersionPages }}</p>
        <div class="flex items-center gap-1">
          <button @click="versionPage--" :disabled="versionPage === 1" class="px-2.5 py-1 rounded text-xs bg-neural-700 text-gray-400 hover:text-white disabled:opacity-30">&larr;</button>
          <button v-for="pg in Math.min(totalVersionPages, 7)" :key="pg" @click="versionPage = pg"
            class="w-7 h-7 rounded text-[10px] font-medium" :class="pg === versionPage ? 'bg-cyber-purple/20 text-cyber-purple' : 'text-gray-500 hover:text-white'">{{ pg }}</button>
          <button @click="versionPage++" :disabled="versionPage === totalVersionPages" class="px-2.5 py-1 rounded text-xs bg-neural-700 text-gray-400 hover:text-white disabled:opacity-30">&rarr;</button>
        </div>
      </div>
    </div>

    <!-- ═══ VERSION DETAIL MODAL (Large, Tabbed, with PDF) ═══ -->
    <Teleport to="body">
      <div v-if="showVersionDetail && selectedVersion" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" @click.self="showVersionDetail = false">
        <div class="glass-dark rounded-xl w-full max-w-5xl border border-cyber-purple/30 max-h-[92vh] flex flex-col">
          <!-- Header -->
          <div class="px-6 py-4 border-b border-neural-700 shrink-0">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-4">
                <span class="px-4 py-2 rounded-xl text-lg font-bold text-white" style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">{{ selectedVersion.version }}</span>
                <div>
                  <h3 class="text-lg font-bold text-white">{{ selectedVersion.label }}</h3>
                  <p class="text-xs text-gray-500">{{ selectedVersion.logs.length }} changes</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button @click="downloadVersionPdf(selectedVersion)" class="px-3 py-1.5 bg-red-500/15 text-red-400 text-xs rounded-lg hover:bg-red-500/25 border border-red-500/30">Download PDF</button>
                <button @click="showVersionDetail = false" class="p-2 text-gray-400 hover:text-white">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
            <!-- Stats bar -->
            <div class="flex gap-3">
              <span v-for="(count, cat) in selectedVersion.stats" :key="cat"
                class="px-3 py-1 rounded-lg text-[10px] font-medium bg-neural-700/50" :class="getCat(String(cat)).color">
                {{ getCat(String(cat)).icon }} {{ getCat(String(cat)).label }}: {{ count }}
              </span>
            </div>
          </div>
          <!-- All entries -->
          <div class="flex-1 overflow-y-auto p-6 space-y-4">
            <div v-for="(log, idx) in selectedVersion.logs" :key="log.id"
              class="border border-neural-700/30 rounded-xl overflow-hidden">
              <!-- Entry header -->
              <div class="flex items-center gap-3 px-4 py-3 bg-neural-800/30">
                <span class="w-7 h-7 rounded-lg flex items-center justify-center text-sm bg-neural-700/50">{{ getCat(log.category).icon }}</span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-white font-semibold">{{ idx + 1 }}. {{ log.title }}</p>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span class="text-[9px]" :class="getCat(log.category).color">{{ getCat(log.category).label }}</span>
                    <span class="text-[9px] px-1.5 py-0.5 rounded" :class="log.status === 'completed' ? 'bg-green-500/15 text-green-400' : 'bg-blue-500/15 text-blue-400'">{{ log.status }}</span>
                    <span v-if="log.tags?.length" class="text-[8px] text-gray-600">{{ log.tags.join(', ') }}</span>
                  </div>
                </div>
              </div>
              <!-- Entry body (full description) -->
              <div v-if="log.description" class="px-4 py-3 text-[11px] text-gray-400 leading-relaxed whitespace-pre-wrap bg-neural-900/20">{{ log.description }}</div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Generated Report Modal -->
    <Teleport to="body">
      <div v-if="showReport && reportResult" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" @click.self="showReport = false">
        <div class="glass-dark rounded-xl w-full max-w-4xl border border-amber-500/30 max-h-[90vh] flex flex-col">
          <div class="px-6 py-4 border-b border-neural-700 shrink-0 flex items-center justify-between">
            <div>
              <h3 class="text-lg font-bold text-white">🧠 AI Session Report</h3>
              <p class="text-xs text-gray-500">Auto-generated from {{ logs.length }} session log entries</p>
            </div>
            <div class="flex gap-2">
              <button @click="downloadReport" class="px-3 py-1.5 bg-amber-500/15 text-amber-400 text-xs rounded-lg hover:bg-amber-500/25 border border-amber-500/30">Download .md</button>
              <button @click="downloadReportPdf" class="px-3 py-1.5 bg-red-500/15 text-red-400 text-xs rounded-lg hover:bg-red-500/25 border border-red-500/30">Download PDF</button>
              <button @click="showReport = false" class="p-2 text-gray-400 hover:text-white">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
          <div class="flex-1 overflow-y-auto p-6">
            <div class="bg-neural-800/50 rounded-lg p-5 border border-neural-700/30 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap font-mono">{{ reportResult }}</div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Old detail modal removed — version detail modal handles everything -->
  </div>
</template>

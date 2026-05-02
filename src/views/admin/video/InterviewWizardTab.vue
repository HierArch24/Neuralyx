<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

// ─── API Keys ──────────────────────────────────────────────────────────────
const MCP_URL    = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
const openaiKey  = ref(import.meta.env.VITE_OPENAI_KEY || localStorage.getItem('neuralyx_openai_key') || '')
const geminiKey  = ref(import.meta.env.VITE_GEMINI_KEY || '')

// ─── Wizard Step ───────────────────────────────────────────────────────────
const currentStep = ref(1)
const TOTAL_STEPS = 6

const steps = [
  { num: 1, icon: '📋', label: 'Question'  },
  { num: 2, icon: '🤖', label: 'AI Answer' },
  { num: 3, icon: '🎙️', label: 'Audio'     },
  { num: 4, icon: '🧑', label: 'Avatar'    },
  { num: 5, icon: '🎬', label: 'Video'     },
  { num: 6, icon: '📧', label: 'Send'      },
]

function goStep(n: number) {
  if (n >= 1 && n <= TOTAL_STEPS) currentStep.value = n
}
function next() { if (currentStep.value < TOTAL_STEPS) currentStep.value++ }
function back() { if (currentStep.value > 1) currentStep.value-- }

// ─── STEP 1: Interview Question ────────────────────────────────────────────
const question   = ref('')
const category   = ref(localStorage.getItem('nyx_category') || 'behavioral')
const tone       = ref(localStorage.getItem('nyx_tone') || 'professional')
const jobTitle   = ref('')
const company    = ref('')

// ── Auto-classifier agent ──────────────────────────────────────────────────
const classifying    = ref(false)
const classifyResult = ref('')  // brief label shown in UI
let classifyTimer: ReturnType<typeof setTimeout> | null = null

const CLASSIFIER_PROMPT = `You are an interview question classifier. Given an interview question, return a JSON object with:
- "category": one of exactly these values: behavioral | technical | situational | motivation | strength | general
- "tone": one of: professional | confident | conversational | concise
- "jobTitle": extracted job title if mentioned, else null
- "company": extracted company name if mentioned, else null
- "label": 3-5 word description of what the question is asking

Rules:
- behavioral: "tell me about a time", past experience stories (STAR format)
- technical: tools, technologies, code, architecture, systems, how something works
- situational: "what would you do if", hypothetical scenarios
- motivation: "why do you want", "why this company", career goals, passion
- strength: strengths, weaknesses, fit, personality, values
- general: "tell me about yourself", introductions, background, anything else

Respond ONLY with valid JSON. No explanation.`

async function classifyQuestion(q: string) {
  if (q.trim().length < 15) return
  classifying.value = true
  classifyResult.value = ''
  try {
    const key = openaiKey.value || geminiKey.value
    if (!key) return

    if (openaiKey.value) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method:  'POST',
        headers: { Authorization: `Bearer ${openaiKey.value}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: CLASSIFIER_PROMPT },
            { role: 'user',   content: q.trim() },
          ],
          max_tokens: 120,
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
      })
      if (!res.ok) return
      const data: any = await res.json()
      const parsed = JSON.parse(data.choices[0].message.content)
      applyClassification(parsed)
    } else if (geminiKey.value) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey.value}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${CLASSIFIER_PROMPT}\n\nQuestion: ${q.trim()}` }] }],
            generationConfig: { maxOutputTokens: 120, temperature: 0 },
          }),
        }
      )
      if (!res.ok) return
      const data: any = await res.json()
      const raw  = data.candidates[0].content.parts[0].text
      const json = raw.match(/\{[\s\S]*\}/)
      if (json) applyClassification(JSON.parse(json[0]))
    }
  } catch { /* silent fail — user can still pick manually */ }
  finally { classifying.value = false }
}

function applyClassification(result: any) {
  if (result.category && ['behavioral','technical','situational','motivation','strength','general'].includes(result.category)) {
    category.value = result.category
  }
  if (result.tone && ['professional','confident','conversational','concise'].includes(result.tone)) {
    tone.value = result.tone
  }
  if (result.jobTitle && !jobTitle.value) jobTitle.value = result.jobTitle
  if (result.company  && !company.value)  company.value  = result.company
  classifyResult.value = result.label || result.category || ''
}

// Debounced watcher — triggers 800ms after user stops typing
watch(question, (val) => {
  if (classifyTimer) clearTimeout(classifyTimer)
  if (val.trim().length < 15) { classifyResult.value = ''; return }
  classifyTimer = setTimeout(() => classifyQuestion(val), 800)
})

// ─── Auto-save to Question Bank (debounced 2s after typing stops) ─────────
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
const autoSaveStatus = ref<'' | 'saving' | 'saved'>('')
watch(question, (val) => {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveStatus.value = ''
  const txt = val.trim()
  if (txt.length < 20) return
  autoSaveTimer = setTimeout(() => {
    // Dedupe — skip if identical question text already exists
    const existing = savedQuestions.value.find(q => q.question.trim().toLowerCase() === txt.toLowerCase())
    if (existing) { autoSaveStatus.value = 'saved'; return }
    autoSaveStatus.value = 'saving'
    const entry = { id: Date.now().toString(36), question: txt, category: category.value, answer: '' }
    savedQuestions.value.unshift(entry)
    if (savedQuestions.value.length > 50) savedQuestions.value = savedQuestions.value.slice(0, 50)
    localStorage.setItem('neuralyx_interview_q', JSON.stringify(savedQuestions.value))
    autoSaveStatus.value = 'saved'
  }, 2000)
})

// ─── Audio Recording + Transcription ──────────────────────────────────────
const recording = ref(false)
const recordingTime = ref(0)
const transcribing = ref(false)
const transcribeError = ref('')
const extractedQuestions = ref<string[]>([])
const audioSource = ref<'mic' | 'system'>('mic')  // mic = microphone only, system = screen share with audio
const transcribeModel = ref<'gpt-4o-mini-transcribe' | 'gpt-4o-transcribe' | 'whisper-1' | 'local-faster-whisper'>(
  (localStorage.getItem('neuralyx_transcribe_model') as any) || 'gpt-4o-mini-transcribe'
)
const whisperLocalUrl = ref<string>(localStorage.getItem('neuralyx_whisper_local_url') || 'http://localhost:7870')
const audioLevel = ref(0)  // 0-100 mic input level for visual feedback
watch(transcribeModel, v => localStorage.setItem('neuralyx_transcribe_model', v))
let mediaRecorder: MediaRecorder | null = null
let recordedChunks: Blob[] = []
let recTimer: ReturnType<typeof setInterval> | null = null
let audioCtx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let levelRAF: number | null = null

// Pick best supported codec — opus-in-webm is ideal for whisper/gpt-4o
function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/mpeg',
  ]
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
  }
  return ''
}

function startLevelMeter(stream: MediaStream) {
  try {
    audioCtx = new AudioContext()
    const src = audioCtx.createMediaStreamSource(stream)
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 512
    src.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    const tick = () => {
      if (!analyser) return
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v }
      audioLevel.value = Math.min(100, Math.round(Math.sqrt(sum / data.length) * 280))
      levelRAF = requestAnimationFrame(tick)
    }
    tick()
  } catch { /* level meter optional */ }
}

function stopLevelMeter() {
  if (levelRAF) { cancelAnimationFrame(levelRAF); levelRAF = null }
  if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null }
  analyser = null
  audioLevel.value = 0
}

async function startRecording() {
  transcribeError.value = ''
  extractedQuestions.value = []
  try {
    let stream: MediaStream
    if (audioSource.value === 'system') {
      // Screen-share with audio — captures system/tab audio (e.g. Zoom/Meet interviewer)
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      const audioTracks = stream.getAudioTracks()
      if (!audioTracks.length) {
        stream.getTracks().forEach(t => t.stop())
        throw new Error('No system audio — tick "Share tab audio" in the picker')
      }
      stream.getVideoTracks().forEach(t => t.stop())
      stream = new MediaStream(audioTracks)
    } else {
      // Enhanced mic constraints — echo cancel, noise suppression, auto gain
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        } as MediaTrackConstraints
      })
    }
    startLevelMeter(stream)
    recordedChunks = []
    const mime = pickMimeType()
    const opts: MediaRecorderOptions = mime
      ? { mimeType: mime, audioBitsPerSecond: 128000 }
      : { audioBitsPerSecond: 128000 }
    mediaRecorder = new MediaRecorder(stream, opts)
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data) }
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      stopLevelMeter()
      const type = mediaRecorder?.mimeType || mime || 'audio/webm'
      const blob = new Blob(recordedChunks, { type })
      await transcribeAudio(blob)
    }
    mediaRecorder.start(1000)  // timeslice = 1s → safer for mid-recording flush
    recording.value = true
    recordingTime.value = 0
    recTimer = setInterval(() => { recordingTime.value++ }, 1000)
  } catch (e: any) {
    transcribeError.value = e.message || 'Recording access denied'
  }
}

function stopRecording() {
  if (mediaRecorder && recording.value) {
    mediaRecorder.stop()
    recording.value = false
    if (recTimer) { clearInterval(recTimer); recTimer = null }
  }
}

async function callTranscribe(blob: Blob, model: string, filename: string): Promise<string> {
  const contextPrompt = 'Interview questions for a software engineer. Topics include AI, automation, Python, Vue.js, Docker, LangChain, n8n, Supabase, full stack, NEURALYX.'
  // ─── Local faster-whisper (offline, no API key) ───
  if (model === 'local-faster-whisper') {
    const fd = new FormData()
    fd.append('file', blob, filename)
    fd.append('language', 'en')
    fd.append('prompt', contextPrompt)
    fd.append('vad', 'true')
    const res = await fetch(`${whisperLocalUrl.value.replace(/\/$/, '')}/transcribe`, {
      method: 'POST',
      body: fd,
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`local-whisper ${res.status}: ${err.slice(0, 200)}`)
    }
    const data: any = await res.json()
    return (data.text || '').trim()
  }
  // ─── OpenAI cloud ───
  if (!openaiKey.value) throw new Error('OpenAI API key missing — set it or switch to local-faster-whisper')
  const fd = new FormData()
  fd.append('file', blob, filename)
  fd.append('model', model)
  fd.append('language', 'en')
  fd.append('response_format', 'json')
  fd.append('prompt', contextPrompt)
  if (model === 'whisper-1') fd.append('temperature', '0')
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey.value}` },
    body: fd,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`${model} ${res.status}: ${err.slice(0, 200)}`)
  }
  const data: any = await res.json()
  return (data.text || '').trim()
}

async function transcribeAudio(blob: Blob) {
  if (transcribeModel.value !== 'local-faster-whisper' && !openaiKey.value) {
    transcribeError.value = 'OpenAI API key required — or switch to local-faster-whisper'; return
  }
  if (blob.size < 1000) { transcribeError.value = `Recording too short/empty (${blob.size} bytes) — speak louder or longer`; return }
  transcribing.value = true
  try {
    const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mpeg') ? 'mp3' : 'webm'
    const filename = `recording.${ext}`
    let text = ''
    let lastErr: Error | null = null
    // Try selected model first, then cascade to fallbacks
    const modelChain = [transcribeModel.value, 'whisper-1'].filter((v, i, a) => a.indexOf(v) === i)
    for (const m of modelChain) {
      try {
        text = await callTranscribe(blob, m, filename)
        if (text) { addLog('success', 'Record', `Transcribed via ${m} (${text.length} chars)`); break }
      } catch (e: any) {
        lastErr = e
        addLog('warn', 'Record', `${m} failed: ${e.message.slice(0, 100)} — trying next…`)
      }
    }
    if (!text) {
      transcribeError.value = lastErr ? lastErr.message : 'No speech detected — check mic level and try again'
      return
    }
    // Split into questions — sentences ending with ? or multiple sentences
    const parts = text.split(/(?<=[?.!])\s+/).map((s: string) => s.trim()).filter((s: string) => s.length > 10)
    extractedQuestions.value = parts.length > 0 ? parts : [text]
    addLog('success', 'Record', `Transcribed ${text.length} chars → ${extractedQuestions.value.length} question(s)`)
  } catch (e: any) {
    transcribeError.value = e.message || 'Transcription failed'
  } finally {
    transcribing.value = false
  }
}

function useTranscribedQuestion(q: string) {
  question.value = q
  extractedQuestions.value = []
}

// ─── Gabriel AI Chatbot — continuous interview Q&A ────────────────────────
const chatOpen = ref(false)
const chatExpanded = ref(false)  // full-screen floating window

// ─── Draggable floating window state ──────────────────────────────────────
const chatDragPos = ref({ x: 8, y: 8 })  // percentage-based default position
const chatDragSize = ref({ w: 84, h: 84 })  // percentage-based default size (wider for more content)
let chatDragging = false
let chatDragOffset = { x: 0, y: 0 }

function startChatDrag(e: MouseEvent | TouchEvent) {
  if (!chatExpanded.value) return
  const target = e.target as HTMLElement
  if (target.closest('button') || target.tagName === 'BUTTON') return
  const el = target.closest('[data-chat-drag-handle]')
  if (!el) return
  e.preventDefault()
  chatDragging = true
  const rect = target.closest('[data-chat-draggable]')?.getBoundingClientRect()
  if (!rect) return
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
  chatDragOffset.x = clientX - rect.left
  chatDragOffset.y = clientY - rect.top
}

function onChatDrag(e: MouseEvent | TouchEvent) {
  if (!chatDragging) return
  e.preventDefault()
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
  const vw = window.innerWidth
  const vh = window.innerHeight
  const minW = 320, minH = 400
  const panelW = Math.max(minW, vw * chatDragSize.value.w / 100)
  const panelH = Math.max(minH, vh * chatDragSize.value.h / 100)
  let newX = clientX - chatDragOffset.x
  let newY = clientY - chatDragOffset.y
  // Clamp to viewport
  newX = Math.max(0, Math.min(newX, vw - panelW))
  newY = Math.max(0, Math.min(newY, vh - panelH))
  chatDragPos.value = { x: (newX / vw) * 100, y: (newY / vh) * 100 }
}

function stopChatDrag() {
  chatDragging = false
}

function resetChatPosition() {
  chatDragPos.value = { x: 8, y: 8 }
  chatDragSize.value = { w: 84, h: 84 }
}
const chatInput = ref('')
const chatSending = ref(false)
interface ChatMsg { role: 'user' | 'assistant'; content: string; ts: number }
const chatMessages = ref<ChatMsg[]>(
  JSON.parse(localStorage.getItem('neuralyx_gabe_chat') || '[]')
)

// Core identity — always included
const GABRIEL_IDENTITY = `You are Gabriel Alvin Aquino — AI Systems Engineer & Automation Developer with 8+ years experience.

BACKGROUND:
- Portfolio: https://neuralyx.ai.dev-environment.site
- Based in Philippines, work remote, target PHP 80k-150k/mo

CORE STACK: Python, TypeScript, Vue.js 3, Node.js, Docker, OpenAI, LangChain, n8n, Supabase, PostgreSQL, FastAPI, MCP, PHP/Laravel

ANSWER STYLE:
- First person, conversational but professional
- Lead with concrete example/metric, then explain the approach
- Keep answers 3-5 sentences unless technical depth required
- If asked something you don't know, say so — don't fabricate

You are now being interviewed. Answer each question as Gabriel would — honest, technical, example-driven.`

// Default proof points — only used when NO reference is selected
const DEFAULT_PROOF_POINTS = `

DEFAULT EXAMPLES (use when answering questions that need specifics):
- Built NEURALYX: MCP-driven job pipeline with 4 AI sub-agents (classify, cover letter, recruiter research, post-apply research)
- Automated multi-platform apply flows (Indeed, LinkedIn, Kalibrr) with captcha solvers (2captcha + Gemini Vision)
- Edge CDP Relay architecture — bridges Docker to real browser profile for human-like automation
- n8n workflows orchestrating end-to-end pipelines
- pgvector + Supabase for semantic job matching
- Wooder Group Pty Ltd — Full Stack / AI / DevOps`

const GABRIEL_PERSONA = GABRIEL_IDENTITY  // kept for any lingering refs

// ─── Reference Source Library — user selects which projects/companies Gabriel AI draws from ──
interface RefAsset { id: string; kind: 'link' | 'image'; label: string; url: string; keywords: string[] }
interface RefSource { id: string; name: string; role: string; period: string; description: string; tech: string[]; assets: RefAsset[] }

const DEFAULT_REF_SOURCES: RefSource[] = [
  { id: 'neuralyx', name: 'NEURALYX', role: 'Founder / AI Systems Engineer', period: '2024–present',
    description: 'Personal AI automation platform. Built MCP server, end-to-end job pipeline with 4 AI sub-agents (classify, cover letter, recruiter research, post-apply), multi-platform apply automation (Indeed, LinkedIn, Kalibrr) with 2captcha + Gemini Vision captcha solvers, Playwright CDP Edge Relay bridging Docker to real browser profile, n8n orchestration, pgvector semantic matching, Vue 3 admin dashboard.',
    tech: ['Python','TypeScript','Vue 3','Node.js','Docker','OpenAI','LangChain','n8n','Supabase','pgvector','MCP','Playwright','FastAPI'], assets: [] },
  { id: 'wooder', name: 'Wooder Group Pty Ltd', role: 'Full Stack Developer / AI Engineer / DevOps Architect', period: '2022–2024',
    description: 'Full stack + AI + DevOps at Australian dev firm. Built multi-tenant SaaS platforms, CI/CD pipelines, infra-as-code, integrated AI features (OpenAI, classification). Lead on platform reliability and architecture.',
    tech: ['PHP','Laravel','Vue','AWS','Docker','PostgreSQL','CI/CD'], assets: [] },
  { id: 'billsense', name: 'Billsense', role: 'Developer', period: '—',
    description: 'Billing / invoicing system project. (Refine this description with specifics.)',
    tech: [], assets: [] },
  { id: 'billing-excis', name: 'Billing System (Excis)', role: 'Full Stack Developer', period: 'current',
    description: 'Enterprise billing system at Excis. Invoice generation, client management, reporting, integrations. (Refine with specifics.)',
    tech: [], assets: [] },
  { id: 'gcorpclean', name: 'GcorpClean', role: '—', period: '—',
    description: 'Project at GcorpClean. (Refine with specifics.)',
    tech: [], assets: [] },
  { id: 'revaya', name: 'Revaya', role: '—', period: '—',
    description: 'Project at Revaya. (Refine with specifics.)',
    tech: [], assets: [] },
  { id: 'access-insurance', name: 'Access Insurance', role: '—', period: '—',
    description: 'Insurance platform project at Access Insurance. (Refine with specifics.)',
    tech: [], assets: [] },
]

const refSources = ref<RefSource[]>(
  (() => {
    try {
      const saved = JSON.parse(localStorage.getItem('neuralyx_ref_sources') || 'null')
      if (Array.isArray(saved) && saved.length) {
        return saved.map((r: any) => ({ ...r, assets: Array.isArray(r.assets) ? r.assets : [] }))
      }
      return DEFAULT_REF_SOURCES
    } catch { return DEFAULT_REF_SOURCES }
  })()
)
watch(refSources, v => localStorage.setItem('neuralyx_ref_sources', JSON.stringify(v)), { deep: true })

const activeRefIds = ref<string[]>(
  JSON.parse(localStorage.getItem('neuralyx_active_refs') || '[]')
)
watch(activeRefIds, v => localStorage.setItem('neuralyx_active_refs', JSON.stringify(v)))

function toggleRef(id: string) {
  const i = activeRefIds.value.indexOf(id)
  if (i >= 0) activeRefIds.value.splice(i, 1)
  else activeRefIds.value.push(id)
}

function buildRefContext(): string {
  if (!activeRefIds.value.length) return DEFAULT_PROOF_POINTS
  const selected = refSources.value.filter(r => activeRefIds.value.includes(r.id))
  if (!selected.length) return DEFAULT_PROOF_POINTS
  const blocks = selected.map(r => {
    const assetLines = (r.assets || []).map(a =>
      `  • [ASSET:${a.id}] ${a.kind}: "${a.label}" — keywords: ${a.keywords.join(', ') || a.label}`
    ).join('\n')
    return `### ${r.name}\n- Role: ${r.role}\n- Period: ${r.period}\n- Tech: ${r.tech.join(', ') || '—'}\n- Details: ${r.description}${assetLines ? `\n- Available assets (use [ASSET:id] markers inline when relevant):\n${assetLines}` : ''}`
  }).join('\n\n')
  const names = selected.map(r => r.name).join(', ')
  const multi = selected.length > 1
  const hasAssets = selected.some(r => (r.assets || []).length > 0)
  return `

════════════════════════════════════════
🔒 HARD CONSTRAINT — READ THIS FIRST 🔒
════════════════════════════════════════
The user has SPECIFICALLY selected these ${selected.length} project(s) as the ONLY source of examples: ${names}.

STRICT RULES:
1. EVERY concrete example, metric, project name, system, and outcome in your answer MUST come from the project(s) listed below.
2. DO NOT mention NEURALYX, Wooder Group, Billsense, Billing System, GcorpClean, Revaya, Access Insurance, or any other project UNLESS it appears in the selected list below.
3. If the selected project(s) do not have a concrete example for the question, say so honestly — DO NOT invent or import examples from other projects.
4. If a selected project's description is sparse, work WITHIN that sparseness — generalize from role/tech, or state "I'd need to refine that description to give a specific answer."
${multi ? `5. MULTI-PROJECT MODE: The user picked ${selected.length} projects. You MUST draw from ALL of them in a single cohesive answer. Pattern:
   - Opening line sets the theme (no project name yet).
   - Then give one example per selected project, naming each project explicitly (e.g. "At ${selected[0].name}, I did X. Over at ${selected[1].name}, I took a different angle — Y.").
   - Close with a short synthesis tying the examples together.
   - Each project gets roughly equal weight — do NOT let one project dominate.
   - If only one of the selected projects has a relevant example, acknowledge the other briefly ("${selected[1]?.name || ''} was more about [its focus], so this particular question pulls mostly from ${selected[0].name}").` : `5. Opening the answer by naming the selected project is preferred.`}
${hasAssets ? `${multi ? '6' : '6'}. When your answer references a specific system, tool, or screen that has an available asset below, embed the marker [ASSET:id] inline (UI renders the link/screenshot). Use at most 3 markers per answer. Prefer assets from the project currently being discussed in that sentence.` : ''}

SELECTED PROJECT(S):

${blocks}

════════════════════════════════════════
End of hard constraint. Now answer using ONLY the above, ${multi ? `weaving ALL ${selected.length} selected projects into the reply.` : 'staying strictly within the single selected project.'}
`
}

// Extract [ASSET:id] markers + resolve to asset records
function extractAssets(text: string): { clean: string; assets: RefAsset[] } {
  const ids = new Set<string>()
  const re = /\[ASSET:([a-zA-Z0-9_-]+)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) ids.add(m[1])
  const clean = text.replace(re, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  const all: RefAsset[] = refSources.value.flatMap(r => r.assets || [])
  const assets = Array.from(ids).map(id => all.find(a => a.id === id)).filter(Boolean) as RefAsset[]
  // Keyword-fallback: if no markers emitted but assets exist in selected refs, match by keyword occurrence
  if (!assets.length && activeRefIds.value.length) {
    const selectedAssets: RefAsset[] = refSources.value
      .filter(r => activeRefIds.value.includes(r.id))
      .flatMap(r => r.assets || [])
    const lower = text.toLowerCase()
    const hits: RefAsset[] = []
    for (const a of selectedAssets) {
      const kws = [a.label, ...a.keywords].filter(Boolean).map(k => k.toLowerCase())
      if (kws.some(k => k && lower.includes(k))) hits.push(a)
      if (hits.length >= 3) break
    }
    return { clean, assets: hits }
  }
  return { clean, assets: assets.slice(0, 3) }
}

function hostOf(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

function addAssetRow(kind: 'link' | 'image' = 'link') {
  if (!editingRef.value) return
  const id = `${editingRef.value.id}-${Date.now().toString(36)}`
  editingRef.value.assets = [...(editingRef.value.assets || []), { id, kind, label: '', url: '', keywords: [] }]
}
function removeAssetRow(id: string) {
  if (!editingRef.value) return
  editingRef.value.assets = (editingRef.value.assets || []).filter(a => a.id !== id)
}

// Reference editor UI state
const refEditorOpen = ref(false)
const editingRef = ref<RefSource | null>(null)
function openRefEditor(r: RefSource) { editingRef.value = { ...r, tech: [...r.tech], assets: (r.assets || []).map(a => ({ ...a, keywords: [...a.keywords] })) }; refEditorOpen.value = true }
function saveRefEdit() {
  if (!editingRef.value) return
  const idx = refSources.value.findIndex(r => r.id === editingRef.value!.id)
  if (idx >= 0) refSources.value[idx] = { ...editingRef.value }
  refEditorOpen.value = false
  editingRef.value = null
}
function cancelRefEdit() { refEditorOpen.value = false; editingRef.value = null }

// Chat voice recording
const chatRecording = ref(false)
const chatRecTime = ref(0)
const chatTranscribing = ref(false)
let chatMediaRecorder: MediaRecorder | null = null
let chatRecChunks: Blob[] = []
let chatRecTimer: ReturnType<typeof setInterval> | null = null

async function startChatRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true, noiseSuppression: true, autoGainControl: true,
        sampleRate: 48000, channelCount: 1,
      } as MediaTrackConstraints
    })
    startLevelMeter(stream)
    chatRecChunks = []
    const mime = pickMimeType()
    const opts: MediaRecorderOptions = mime
      ? { mimeType: mime, audioBitsPerSecond: 128000 }
      : { audioBitsPerSecond: 128000 }
    chatMediaRecorder = new MediaRecorder(stream, opts)
    chatMediaRecorder.ondataavailable = e => { if (e.data.size > 0) chatRecChunks.push(e.data) }
    chatMediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      stopLevelMeter()
      const type = chatMediaRecorder?.mimeType || mime || 'audio/webm'
      const blob = new Blob(chatRecChunks, { type })
      await transcribeAndSendChat(blob)
    }
    chatMediaRecorder.start(1000)
    chatRecording.value = true
    chatRecTime.value = 0
    chatRecTimer = setInterval(() => { chatRecTime.value++ }, 1000)
  } catch (e: any) {
    stopLevelMeter()
    chatMessages.value.push({ role: 'assistant', content: `⚠ Mic error: ${e.message}`, ts: Date.now() })
  }
}

function stopChatRecording() {
  if (chatMediaRecorder && chatRecording.value) {
    chatMediaRecorder.stop()
    chatRecording.value = false
    if (chatRecTimer) { clearInterval(chatRecTimer); chatRecTimer = null }
  }
}

async function transcribeAndSendChat(blob: Blob) {
  if (transcribeModel.value !== 'local-faster-whisper' && !openaiKey.value) {
    chatMessages.value.push({ role: 'assistant', content: '⚠ OpenAI API key required — or switch to local-faster-whisper', ts: Date.now() }); return
  }
  if (blob.size < 1000) { chatMessages.value.push({ role: 'assistant', content: `⚠ Recording too short (${blob.size}B) — hold the mic button longer`, ts: Date.now() }); return }
  chatTranscribing.value = true
  try {
    const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mpeg') ? 'mp3' : 'webm'
    const filename = `chat-rec.${ext}`
    let text = ''
    let lastErr: Error | null = null
    const modelChain = [transcribeModel.value, 'whisper-1'].filter((v, i, a) => a.indexOf(v) === i)
    for (const m of modelChain) {
      try {
        text = await callTranscribe(blob, m, filename)
        if (text) break
      } catch (e: any) { lastErr = e }
    }
    if (!text) {
      chatMessages.value.push({ role: 'assistant', content: `⚠ Transcription failed: ${lastErr?.message || 'no speech detected'} — try again`, ts: Date.now() })
      return
    }
    chatInput.value = text
    chatTranscribing.value = false
    await sendChatMessage()
  } catch (e: any) {
    chatMessages.value.push({ role: 'assistant', content: `⚠ Transcription failed: ${e.message}`, ts: Date.now() })
  } finally {
    chatTranscribing.value = false
  }
}

async function sendChatMessage() {
  const msg = chatInput.value.trim()
  if (!msg || chatSending.value) return
  if (!openaiKey.value) { transcribeError.value = 'OpenAI API key required for chatbot'; return }
  chatMessages.value.push({ role: 'user', content: msg, ts: Date.now() })
  chatInput.value = ''
  chatSending.value = true
  try {
    const history = chatMessages.value.slice(-12).map(m => ({ role: m.role, content: m.content }))
    const systemContent = GABRIEL_PERSONA + buildRefContext()
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey.value}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemContent }, ...history],
        temperature: 0.7,
        max_tokens: 500,
      }),
    })
    if (!res.ok) throw new Error(`Chat ${res.status}`)
    const data: any = await res.json()
    const reply = data.choices[0].message.content.trim()
    chatMessages.value.push({ role: 'assistant', content: reply, ts: Date.now() })
    if (chatMessages.value.length > 50) chatMessages.value = chatMessages.value.slice(-50)
    localStorage.setItem('neuralyx_gabe_chat', JSON.stringify(chatMessages.value))
  } catch (e: any) {
    chatMessages.value.push({ role: 'assistant', content: `⚠ Error: ${e.message}`, ts: Date.now() })
  } finally {
    chatSending.value = false
  }
}

function clearChat() {
  if (chatMessages.value.length === 0) return
  const confirmed = confirm('Clear all Gabriel AI chat messages? This cannot be undone.')
  if (!confirmed) return
  chatMessages.value = []
  localStorage.removeItem('neuralyx_gabe_chat')
  // Also clear across all windows
  chatBc?.postMessage({ type: 'chat:clear' })
}

function useChatAsQuestion(content: string) {
  question.value = content
  chatOpen.value = false
}

// ─── Cross-window chat sync (main ↔ popout) ───────────────────────────────
let chatBc: BroadcastChannel | null = null
if (typeof BroadcastChannel !== 'undefined') {
  chatBc = new BroadcastChannel('neuralyx_gabe_chat')
  chatBc.onmessage = (ev) => {
    if (ev.data?.type === 'chat:sync' && Array.isArray(ev.data.messages)) {
      chatMessages.value = ev.data.messages
    } else if (ev.data?.type === 'chat:clear') {
      chatMessages.value = []
      localStorage.removeItem('neuralyx_gabe_chat')
    }
  }
}
watch(chatMessages, (val) => {
  chatBc?.postMessage({ type: 'chat:sync', messages: val })
}, { deep: true })
window.addEventListener('storage', (ev) => {
  if (ev.key === 'neuralyx_gabe_chat' && ev.newValue) {
    try { chatMessages.value = JSON.parse(ev.newValue) } catch { /* ignore */ }
  }
})

function popOutChat() {
  const w = 900, h = 760
  const left = Math.max(0, (window.screen.width - w) / 2)
  const top = Math.max(0, (window.screen.height - h) / 2)
  window.open('/interview-chat', 'gabriel_chat_popout',
    `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes,menubar=no,toolbar=no,location=no,status=no`)
}

function formatRecTime(s: number) {
  const m = Math.floor(s / 60), sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

const categories = [
  { value: 'behavioral',   label: '🧠 Behavioral',    hint: 'Tell me about a time...'     },
  { value: 'technical',    label: '⚙️ Technical',      hint: 'How would you approach...'  },
  { value: 'situational',  label: '🎯 Situational',   hint: 'What would you do if...'    },
  { value: 'motivation',   label: '💡 Motivation',    hint: 'Why do you want...'         },
  { value: 'strength',     label: '💪 Strength/Fit',  hint: 'What are your strengths...' },
  { value: 'general',      label: '💬 General',       hint: 'Tell me about yourself...'  },
]

// ── Pre-loaded example questions ───────────────────────────────────────────
const PRELOADED_QUESTIONS = [
  {
    id: 'pre-1',
    category: 'technical',
    question: 'Show us your terminal. Demonstrate how many Claude agents you typically run at once. Walk us through your AI-assisted workflow (Claude Code, Cursor, etc.). Share a recent project you\'ve shipped.',
    answer: '',
  },
  {
    id: 'pre-2',
    category: 'general',
    question: 'Tell me about yourself and why you\'re interested in this role.',
    answer: '',
  },
  {
    id: 'pre-3',
    category: 'behavioral',
    question: 'Tell me about a time you had to solve a complex technical problem under a tight deadline. What was your approach and what was the outcome?',
    answer: '',
  },
  {
    id: 'pre-4',
    category: 'motivation',
    question: 'Why do you want to work here specifically, and what excites you most about this opportunity?',
    answer: '',
  },
  {
    id: 'pre-5',
    category: 'situational',
    question: 'If you were given a new data pipeline that was failing in production with no documentation, how would you debug and stabilize it?',
    answer: '',
  },
  {
    id: 'pre-6',
    category: 'strength',
    question: 'What is your greatest technical strength and how have you applied it to deliver real business value?',
    answer: '',
  },
]

const savedQuestions = ref<{ id: string; question: string; category: string; answer: string }[]>(
  JSON.parse(localStorage.getItem('neuralyx_interview_q') || '[]')
)

// Merge preloaded at the end (only ones not already saved)
const allQuestions = computed(() => {
  const savedIds = new Set(savedQuestions.value.map(q => q.id))
  const preloads = PRELOADED_QUESTIONS.filter(p => !savedIds.has(p.id))
  return [...savedQuestions.value, ...preloads]
})

function saveQuestion(ans: string) {
  const entry = { id: Date.now().toString(36), question: question.value, category: category.value, answer: ans }
  savedQuestions.value.unshift(entry)
  if (savedQuestions.value.length > 20) savedQuestions.value = savedQuestions.value.slice(0, 20)
  localStorage.setItem('neuralyx_interview_q', JSON.stringify(savedQuestions.value))
}

function loadSaved(item: { id: string; question: string; category: string; answer: string }) {
  question.value  = item.question
  category.value  = item.category
  if (item.answer) {
    generatedAnswer.value = item.answer
    script.value          = item.answer
    currentStep.value     = 2
  } else {
    // No saved answer — clear old script and go to question step
    generatedAnswer.value = ''
    script.value          = ''
    genError.value        = ''
    agentThinking.value   = ''
    currentStep.value     = 1
  }
}

// ─── STEP 2: Specialized Video Script Agent ────────────────────────────────
const generatedAnswer = ref('')
const script          = ref('')
const generating      = ref(false)
const genError        = ref('')
const genLog          = ref('')
const agentThinking   = ref('')   // shows the agent's reasoning step

// ── Deep specialized prompt for each question type ─────────────────────────
function buildVideoScriptAgentPrompt(): string {
  const roleCtx = jobTitle.value ? `Position: ${jobTitle.value}` : ''
  const compCtx = company.value  ? `Company: ${company.value}`   : ''
  const ctx     = [roleCtx, compCtx].filter(Boolean).join(' | ')

  const categoryInstructions: Record<string, string> = {
    behavioral: `Use the STAR framework spoken naturally — do NOT say "Situation:", "Task:" etc.
Open with the specific situation immediately. Describe what YOU did (not the team).
End with the measurable result and what you learned. Make it feel like a story, not a report.`,

    technical: `This is a DEMO/SHOWCASE question. Structure:
1. Open with a bold statement of your stack or capability (10 seconds)
2. Walk through your actual workflow concretely — tools, commands, flow (30 seconds)
3. Anchor with a REAL shipped project — name it, describe the impact (20 seconds)
4. Close with what makes your approach unique (10 seconds)
Be SPECIFIC: name actual tools (Claude Code, n8n, Supabase, etc.), real numbers, real outcomes.
Avoid vague claims. Employers asking this want to see you think in systems.`,

    situational: `This is a problem-solving question. Structure:
1. Briefly restate what's at stake (5 seconds — shows you understood)
2. State your immediate triage steps — be decisive, not hedging
3. Describe your investigation methodology
4. Explain how you'd communicate status to stakeholders
5. Close with what success looks like
Sound decisive and experienced, not theoretical.`,

    motivation: `This question tests cultural and mission alignment. Structure:
1. Open with a genuine, specific hook about what drew you to this (not generic)
2. Connect your background/skills to what this company/role specifically does
3. Express where you want to grow — make it align with what they offer
4. Close with energy and forward momentum
AVOID: "I've always been passionate about...", generic statements, flattery.
DO: reference something specific about the company, the team, the problem they solve.`,

    strength: `Answer your top 1-2 strengths only — don't list many. Structure:
1. Name the strength directly and confidently
2. Give one specific story/example that proves it (30 seconds)
3. Quantify the impact where possible
4. Show self-awareness: acknowledge how you continue to develop it
Sound confident, not arrogant. Ground every claim in evidence.`,

    general: `"Tell me about yourself" is your OPENING PITCH. Structure:
1. Start with your current role/identity (10 seconds)
2. Your most relevant experience arc — connect the dots (25 seconds)
3. A key achievement that proves you deliver (15 seconds)
4. Why you're here NOW, excited about THIS opportunity (15 seconds)
Think: Present → Past → Future. Keep it conversational, not a CV recitation.`,
  }

  const videoFormatRules = `
VIDEO FORMAT RULES (non-negotiable):
- Target length: 150-200 words — ideal for 60-90 second delivery
- NO bullet points, NO headers, NO numbered lists — this is spoken aloud
- Use natural spoken transitions: "So what I did was...", "The thing that really drove that was...", "And what I found..."
- Short sentences. Pause points natural. Rhythm matters.
- First person throughout — own every statement
- End with ONE clear closing line that invites continuation or expresses enthusiasm
- DO NOT use filler openers: "Great question", "Absolutely", "Sure", "Of course"
- Start strong immediately — the first 5 words must hook attention`

  return `You are a specialized Video Interview Script Agent. Your ONLY job is to craft spoken video interview scripts that sound natural, confident, and compelling on camera.

${ctx ? `Context: ${ctx}` : ''}
Question Type: ${category.value.toUpperCase()}
Tone: ${tone.value}

CATEGORY-SPECIFIC STRATEGY:
${categoryInstructions[category.value] || categoryInstructions.general}

${videoFormatRules}

You think in two stages — you will be asked to show your reasoning first, then produce the final script.`
}

async function callAI(systemMsg: string, userMsg: string, maxTokens = 600): Promise<string> {
  if (openaiKey.value) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: { Authorization: `Bearer ${openaiKey.value}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:       'gpt-4o-mini',
        messages:    [{ role: 'system', content: systemMsg }, { role: 'user', content: userMsg }],
        max_tokens:  maxTokens,
        temperature: 0.75,
      }),
    })
    if (!res.ok) {
      const e: any = await res.json().catch(() => ({}))
      throw new Error(e?.error?.message || `OpenAI HTTP ${res.status}`)
    }
    const data: any = await res.json()
    return data.choices[0].message.content.trim()
  }

  if (geminiKey.value) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey.value}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemMsg}\n\n${userMsg}` }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.75 },
        }),
      }
    )
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`)
    const data: any = await res.json()
    return data.candidates[0].content.parts[0].text.trim()
  }

  throw new Error('No AI key found. Add VITE_OPENAI_KEY or VITE_GEMINI_KEY to .env')
}

async function generateAnswer() {
  if (!question.value.trim()) return
  generating.value  = true
  genError.value    = ''
  genLog.value      = ''
  agentThinking.value = ''

  try {
    const agentPrompt = buildVideoScriptAgentPrompt()

    // ── Stage 1: Agent identifies the question intent & strategy ──────────
    genLog.value = '🔍 Agent analyzing question type and intent…'
    const thinkingPrompt = `Analyze this interview question and produce a brief strategy plan (3-4 sentences max):
- What is the employer REALLY testing with this question?
- What is the single most important thing to demonstrate in the answer?
- What specific structure will make this answer land on video?

Question: "${question.value}"`

    const thinking = await callAI(agentPrompt, thinkingPrompt, 200)
    agentThinking.value = thinking
    genLog.value = '✍️ Drafting video script…'

    // ── Stage 2: Agent generates the final video-optimized script ─────────
    const scriptPrompt = `Based on your strategy analysis, write the final video interview script.

Question: "${question.value}"

Your analysis: ${thinking}

Now write the complete spoken script. Start immediately with the answer — no preamble.`

    const finalScript = await callAI(agentPrompt, scriptPrompt, 500)
    generatedAnswer.value = finalScript
    script.value          = finalScript
    saveQuestion(finalScript)
    genLog.value = '✓ Video script ready'

  } catch (e: any) {
    genError.value = e.message
    genLog.value   = ''
  } finally {
    generating.value = false
  }
}

const wordCount    = computed(() => script.value.trim().split(/\s+/).filter(Boolean).length)
const estDuration  = computed(() => Math.round(wordCount.value / 2.5)) // ~150wpm

// ── Script pop-out window ──────────────────────────────────────────────────
const scriptPopout  = ref(false)
const popoutX       = ref(80)
const popoutY       = ref(80)
let   _dragging     = false
let   _ox = 0, _oy = 0
const _scriptRefs = { channel: null as BroadcastChannel | null, win: null as Window | null }

function openScriptBrowserWindow() {
  const ch = new BroadcastChannel('neuralyx-script-sync')
  _scriptRefs.channel = ch

  // Send script updates from main → popup
  ch.onmessage = (e) => {
    if (e.data.type === 'script-update') script.value = e.data.script
    if (e.data.type === 'ready') ch.postMessage({ type: 'init', script: script.value, wc: wordCount.value, dur: estDuration.value })
  }

  const win = window.open('', 'neuralyx-script', 'width=620,height=700,menubar=no,toolbar=no,location=no,status=no')
  if (!win) return
  _scriptRefs.win = win

  win.document.write(`<!DOCTYPE html><html>
<head>
  <meta charset="utf-8">
  <title>Script Editor — NEURALYX</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0a0c12;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;flex-direction:column;height:100vh}
    .bar{background:rgba(139,92,246,.12);border-bottom:1px solid rgba(139,92,246,.3);padding:10px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
    .bar-title{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600}
    .dot{width:10px;height:10px;border-radius:50%;background:#8b5cf6}
    .meta{font-size:11px;color:#6b7280}
    .good{color:#34d399}.warn{color:#fbbf24}
    .body{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
    textarea{width:100%;flex:1;background:#111827;border:1px solid #374151;border-radius:12px;color:#f9fafb;font-size:14px;line-height:1.7;padding:14px;resize:none;outline:none;min-height:320px}
    textarea:focus{border-color:#8b5cf6}
    .hint{font-size:10px;color:#4b5563}
    .refine-box{background:#111827;border:1px solid #374151;border-radius:12px;overflow:hidden}
    .refine-header{padding:8px 14px;border-bottom:1px solid #374151;font-size:11px;font-weight:600;color:#f9fafb;background:rgba(255,255,255,.03)}
    .refine-body{padding:12px;display:flex;flex-direction:column;gap:8px}
    .refine-body textarea{min-height:56px;font-size:12px}
    button.apply{background:linear-gradient(135deg,rgba(245,158,11,.6),rgba(245,158,11,.3));border:1px solid rgba(245,158,11,.4);color:#fff;font-size:12px;font-weight:600;padding:8px;border-radius:8px;cursor:pointer;width:100%}
    button.apply:hover{opacity:.85}
    button.apply:disabled{opacity:.4;cursor:not-allowed}
  </style>
</head>
<body>
  <div class="bar">
    <div class="bar-title"><div class="dot"></div>Script Editor</div>
    <div class="meta" id="meta">Loading…</div>
  </div>
  <div class="body">
    <textarea id="ta" placeholder="Script loading…"></textarea>
    <p class="hint">Edit freely — syncs back to main window automatically</p>
    <div class="refine-box">
      <div class="refine-header">✏️ Refine note (sent to main window)</div>
      <div class="refine-body">
        <textarea id="refine" placeholder="Tell the agent what to fix…"></textarea>
        <button class="apply" id="applyBtn">✨ Send Refinement to Main Window</button>
      </div>
    </div>
  </div>
  <script>
    const ch = new BroadcastChannel('neuralyx-script-sync')
    const ta = document.getElementById('ta')
    const meta = document.getElementById('meta')
    const refineEl = document.getElementById('refine')
    const applyBtn = document.getElementById('applyBtn')

    ch.onmessage = (e) => {
      if (e.data.type === 'init' || e.data.type === 'script-push') {
        if (ta !== document.activeElement) ta.value = e.data.script
        const wc = e.data.wc; const dur = e.data.dur
        meta.innerHTML = wc + ' words · ~' + dur + 's · <span class="' + (dur > 90 ? 'warn' : 'good') + '">' + (dur > 90 ? '⚠ Too long' : '✓ Good') + '</span>'
      }
    }

    ta.addEventListener('input', () => {
      ch.postMessage({ type: 'script-update', script: ta.value })
    })

    applyBtn.addEventListener('click', () => {
      if (!refineEl.value.trim()) return
      ch.postMessage({ type: 'refine-request', note: refineEl.value })
      refineEl.value = ''
      applyBtn.textContent = '✓ Sent!'
      setTimeout(() => applyBtn.textContent = '✨ Send Refinement to Main Window', 1500)
    })

    ch.postMessage({ type: 'ready' })
    window.addEventListener('beforeunload', () => ch.close())
  <\/script>
</body></html>`)
  win.document.close()

  // Push script updates from main to popup when script changes
  watch(script, (val) => {
    ch.postMessage({ type: 'script-push', script: val, wc: wordCount.value, dur: estDuration.value })
  })

  // Handle refine requests from popup
  ch.addEventListener('message', (e: MessageEvent) => {
    if (e.data.type === 'refine-request') {
      refineNote.value = e.data.note
      refineScript()
    }
  })
}

function startDrag(e: MouseEvent) {
  _dragging = true
  _ox = e.clientX - popoutX.value
  _oy = e.clientY - popoutY.value
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', stopDrag)
}
function onDrag(e: MouseEvent) {
  if (!_dragging) return
  popoutX.value = e.clientX - _ox
  popoutY.value = e.clientY - _oy
}
function stopDrag() {
  _dragging = false
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', stopDrag)
}

// ── Refine / Correct script ────────────────────────────────────────────────
const refineNote    = ref('')
const refining      = ref(false)
const refineError   = ref('')
const refineLog     = ref('')

async function refineScript() {
  if (!script.value.trim() || !refineNote.value.trim()) return
  refining.value  = true
  refineError.value = ''
  refineLog.value = '🔧 Agent applying corrections…'

  try {
    const agentPrompt = buildVideoScriptAgentPrompt()

    const refinePrompt = `You are refining an existing video interview script based on the user's correction instructions.

Original script:
"""
${script.value}
"""

User's correction instructions:
"""
${refineNote.value}
"""

Instructions:
- Apply ONLY the corrections the user asked for
- Keep everything else the same unless it needs to change as a result
- Maintain the same spoken/video format (no bullet points, natural flow, same approximate length)
- Output ONLY the revised script — no preamble, no explanation

Write the corrected script now:`

    const revised = await callAI(agentPrompt, refinePrompt, 600)
    script.value   = revised
    refineLog.value = '✓ Script refined'
    refineNote.value = ''
    saveQuestion(revised)
  } catch (e: any) {
    refineError.value = e.message
    refineLog.value   = ''
  } finally {
    refining.value = false
  }
}

// ─── STEP 3: TTS Audio ─────────────────────────────────────────────────────
const ttsSource    = ref<'voxcpm' | 'heygen'>((localStorage.getItem('nyx_tts_source') as any) || 'voxcpm')
const audioBlob    = ref<Blob | null>(null)
const audioUrl     = ref('')
const ttsRunning   = ref(false)
const ttsError     = ref('')
const ttsLog       = ref('')

// ── VoxCPM voice sample management ───────────────────────────────────────
const voiceSampleUploaded = ref(false)
const voiceSampleSize     = ref(0)
const voiceSampleUploading = ref(false)
const voxcpmStatus        = ref<'unknown' | 'loading' | 'ok' | 'offline'>('unknown')
const voxcpmError         = ref('')

async function checkVoxCPMHealth() {
  try {
    const r = await fetch(`${MCP_URL}/api/tts/voxcpm/health`)
    const d: any = await r.json()
    if (d.status === 'ok') voxcpmStatus.value = 'ok'
    else if (d.status === 'loading') voxcpmStatus.value = 'loading'
    else { voxcpmStatus.value = 'offline'; voxcpmError.value = d.error || '' }
  } catch {
    voxcpmStatus.value = 'offline'
  }
}

async function checkVoiceSample() {
  try {
    const r = await fetch(`${MCP_URL}/api/voice-sample`)
    const d: any = await r.json()
    if (d.ok) { voiceSampleUploaded.value = true; voiceSampleSize.value = d.size }
    else voiceSampleUploaded.value = false
  } catch { voiceSampleUploaded.value = false }
}

async function uploadVoiceSample(file: File) {
  voiceSampleUploading.value = true
  ttsError.value = ''
  try {
    const ab = await file.arrayBuffer()
    const bytes = new Uint8Array(ab)
    let binary = ''
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 8192, bytes.length)))
    const b64 = btoa(binary)
    const ext = file.name.split('.').pop() || 'wav'
    const r = await fetch(`${MCP_URL}/api/voice-sample`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioB64: b64, format: ext }),
    })
    const d: any = await r.json()
    if (d.ok) { voiceSampleUploaded.value = true; voiceSampleSize.value = d.size }
    else throw new Error(d.error || 'Upload failed')
  } catch (e: any) {
    ttsError.value = `Voice sample upload: ${e.message}`
  } finally {
    voiceSampleUploading.value = false
  }
}

function onVoiceSamplePick(evt: Event) {
  const file = (evt.target as HTMLInputElement).files?.[0]
  if (file) uploadVoiceSample(file)
}

// Load HeyGen clone preview as VoxCPM voice reference
// Server downloads + caches the audio — no btoa in browser
const heygenSampleLoading = ref('')
async function useHeygenCloneAsSample(v: { voice_id: string; name: string; preview_audio_url?: string; preview_audio?: string }) {
  heygenSampleLoading.value = v.voice_id
  ttsError.value = ''
  try {
    const r = await fetch(`${MCP_URL}/api/heygen/use-as-sample`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice_id: v.voice_id, preview_url: v.preview_audio_url || v.preview_audio }),
    })
    const d: any = await r.json()
    if (d.ok) {
      voiceSampleUploaded.value = true
      voiceSampleSize.value = d.size
      ttsLog.value = `Voice sample set from HeyGen clone "${v.name}" ✓`
    } else throw new Error(d.error || 'Save failed')
  } catch (e: any) {
    ttsError.value = `HeyGen sample load: ${e.message}`
  } finally {
    heygenSampleLoading.value = ''
  }
}

// Check VoxCPM health + voice sample on mount
onMounted(() => {
  checkVoxCPMHealth()
  checkVoiceSample()
  if (ttsSource.value === 'voxcpm') fetchHeyGenVoices()
  // Session log: system init + disabled feature notices (addLog declared below — hoisted ok)
  setTimeout(() => {
    addLog('info',     'System',    `NEURALYX Video Creation v${APP_VERSION} initialized`)
    addLog('disabled', 'VoxCPM',    'XTTS-v2 voice clone — disabled · pending external GPU integration')
    addLog('disabled', 'SadTalker', 'Lip sync engine — disabled · pending external GPU integration')
  }, 0)
  // Global drag listeners for floating chat window
  window.addEventListener('mousemove', onChatDrag)
  window.addEventListener('mouseup', stopChatDrag)
  window.addEventListener('touchmove', onChatDrag, { passive: false })
  window.addEventListener('touchend', stopChatDrag)
})

// Cleanup drag listeners
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onChatDrag)
  window.removeEventListener('mouseup', stopChatDrag)
  window.removeEventListener('touchmove', onChatDrag)
  window.removeEventListener('touchend', stopChatDrag)
})

async function generateVoxCPM() {
  if (!script.value.trim()) return
  ttsRunning.value = true
  ttsError.value   = ''
  ttsLog.value     = 'Sending to VoxCPM voice clone…'
  audioBlob.value  = null
  audioUrl.value   = ''

  try {
    const res = await fetch(`${MCP_URL}/api/tts/voxcpm`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text: script.value.trim() }),
    })

    if (res.status === 503) {
      const d: any = await res.json().catch(() => ({}))
      const wait = (d.retryAfter || 10) * 1000
      ttsLog.value = `VoxCPM model loading… retrying in ${d.retryAfter || 10}s`
      await new Promise(r => setTimeout(r, wait))
      ttsRunning.value = false
      return generateVoxCPM()
    }

    if (!res.ok) {
      const e: any = await res.json().catch(() => ({}))
      throw new Error(e?.error || `HTTP ${res.status}`)
    }

    const blob      = await res.blob()
    audioBlob.value = blob
    audioUrl.value  = URL.createObjectURL(blob)
    ttsLog.value    = 'Voice clone audio ready ✓'
  } catch (e: any) {
    ttsError.value = e.message
    ttsLog.value   = ''
  } finally {
    ttsRunning.value = false
  }
}

// ── HeyGen Voice Clone TTS — proxied via MCP server ───────────────────────
const heygenVoices     = ref<{ voice_id: string; name: string; type: string; gender: string; language: string; preview_audio_url?: string; preview_audio?: string }[]>([])
const heygenVoiceId    = ref(localStorage.getItem('neuralyx_heygen_voice') || '')
const heygenFetching   = ref(false)
const heygenFetchError = ref('')
const heygenSpeed      = ref(Number(localStorage.getItem('nyx_heygen_speed') || 1.0))
const heygenEmotion    = ref(localStorage.getItem('nyx_heygen_emotion') || 'Friendly')
const heygenReady      = ref(false)   // true once voices loaded ok

watch(heygenVoiceId, (v) => localStorage.setItem('neuralyx_heygen_voice', v))

// Auto-load when switching tabs
watch(ttsSource, (src) => {
  if (src === 'heygen' && heygenVoices.value.length === 0) fetchHeyGenVoices()
  if (src === 'voxcpm') { checkVoxCPMHealth(); checkVoiceSample(); if (!heygenReady.value) fetchHeyGenVoices() }
})

async function fetchHeyGenVoices() {
  heygenFetching.value   = true
  heygenFetchError.value = ''
  heygenReady.value      = false
  try {
    const res = await fetch(`${MCP_URL}/api/heygen/voices`)
    const data: any = await res.json()
    if (!data.ok) throw new Error(data.error || 'Failed to load voices')
    heygenVoices.value = data.voices
    heygenReady.value  = true
    if (!heygenVoiceId.value && data.voices.length) {
      const clone = data.voices.find((v: any) => v.type === 'clone')
      heygenVoiceId.value = (clone ?? data.voices[0]).voice_id
    }
  } catch (e: any) {
    heygenFetchError.value = e.message
  } finally {
    heygenFetching.value = false
  }
}

const heygenPreviewing   = ref('')      // voice_id currently previewing
const heygenPreviewUrl   = ref('')      // object URL for preview audio
const heygenDownloading  = ref('')      // voice_id being downloaded
let   heygenPreviewAudio: HTMLAudioElement | null = null

function previewHeyGenVoice(v: any) {
  const url: string = v.preview_audio_url || v.preview_audio || ''
  if (!url) return

  if (heygenPreviewing.value === v.voice_id) {
    // stop
    heygenPreviewAudio?.pause()
    heygenPreviewing.value = ''
    heygenPreviewUrl.value = ''
    return
  }

  heygenPreviewing.value = v.voice_id
  // proxy through MCP server to avoid CORS
  const proxyUrl = `${MCP_URL}/api/heygen/preview?url=${encodeURIComponent(url)}`
  heygenPreviewUrl.value = proxyUrl
}

async function usePreviewAsAudio(v: any) {
  const url: string = v.preview_audio_url || v.preview_audio || ''
  if (!url) return
  heygenDownloading.value = v.voice_id
  ttsError.value = ''
  ttsLog.value   = 'Downloading voice preview…'
  try {
    const proxyUrl = `${MCP_URL}/api/heygen/preview?url=${encodeURIComponent(url)}`
    const res = await fetch(proxyUrl)
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
    const blob      = await res.blob()
    audioBlob.value = blob
    audioUrl.value  = URL.createObjectURL(blob)
    ttsLog.value    = `Preview audio loaded ✓ (${v.name})`
    heygenVoiceId.value = v.voice_id
  } catch (e: any) {
    ttsError.value = e.message
    ttsLog.value   = ''
  } finally {
    heygenDownloading.value = ''
  }
}

async function generateHeyGenAudio() {
  if (!script.value.trim() || !heygenVoiceId.value) return
  ttsRunning.value = true
  ttsError.value   = ''
  ttsLog.value     = 'Sending to HeyGen via server…'
  audioBlob.value  = null
  audioUrl.value   = ''

  try {
    const synthRes = await fetch(`${MCP_URL}/api/heygen/synthesize`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voice_id: heygenVoiceId.value,
        text:     script.value.trim(),
        speed:    heygenSpeed.value,
        emotion:  heygenEmotion.value,
      }),
    })
    const result: any = await synthRes.json()
    if (!result.ok) throw new Error(result.error || `Server error ${synthRes.status}`)

    ttsLog.value    = 'Downloading audio from HeyGen…'
    const dlRes     = await fetch(result.audio_url)
    if (!dlRes.ok) throw new Error(`Download failed: HTTP ${dlRes.status}`)
    const blob      = await dlRes.blob()
    audioBlob.value = blob
    audioUrl.value  = URL.createObjectURL(blob)
    ttsLog.value    = 'HeyGen voice clone ready ✓'
  } catch (e: any) {
    ttsError.value = e.message
    ttsLog.value   = ''
  } finally {
    ttsRunning.value = false
  }
}

// ─── STEP 4: Avatar Setup ──────────────────────────────────────────────────
const avatarFile     = ref<File | null>(null)
const avatarPreview  = ref(localStorage.getItem('neuralyx_avatar_preview') || '')
const avatarDragging = ref(false)
const lipsyncModel   = ref('sadtalker')
// sadtalker backend: 'local' = localhost:7860, 'hf' = HuggingFace space (auto = server decides)
const sadtalkerBackend = ref<'auto' | 'local' | 'hf'>(
  (localStorage.getItem('nyx_sadtalker_backend') as 'auto' | 'local' | 'hf') || 'auto'
)
watch(sadtalkerBackend, v => localStorage.setItem('nyx_sadtalker_backend', v))

const lipsyncSettings = ref({
  preprocess: localStorage.getItem('nyx_lipsync_preprocess') || 'crop',
  enhancer:   localStorage.getItem('nyx_lipsync_enhancer')   || 'gfpgan',
  size:       Number(localStorage.getItem('nyx_lipsync_size') || 256),
  stillMode:  localStorage.getItem('nyx_lipsync_still') === 'true',
})

function clearAvatar() {
  avatarFile.value = null
  avatarPreview.value = ''
  localStorage.removeItem('neuralyx_avatar_preview')
}
function handleAvatarDrop(e: DragEvent) {
  avatarDragging.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f?.type.startsWith('image/')) loadAvatar(f)
}
function handleAvatarSelect(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) loadAvatar(f)
}
function loadAvatar(f: File) {
  avatarFile.value = f
  const r = new FileReader()
  r.onload = (e) => {
    avatarPreview.value = e.target?.result as string
    localStorage.setItem('neuralyx_avatar_preview', avatarPreview.value)
  }
  r.readAsDataURL(f)
}

// ─── STEP 5: Generate Video ────────────────────────────────────────────────
const videoRunning = ref(false)
const videoUrl     = ref('')
const videoBlob    = ref<Blob | null>(null)
const videoError   = ref('')
const videoLog     = ref('')

// const SADTALKER_BASE = 'https://kevinwang676-sadtalker.hf.space' // server-side only

function fileToBase64(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload  = () => res((r.result as string).split(',')[1])
    r.onerror = rej
    r.readAsDataURL(f)
  })
}
function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload  = () => res((r.result as string).split(',')[1])
    r.onerror = rej
    r.readAsDataURL(b)
  })
}

async function generateVideo() {
  if (!audioBlob.value || !(avatarFile.value || avatarPreview.value)) return
  videoRunning.value = true
  videoError.value   = ''
  videoLog.value     = 'Preparing…'
  videoUrl.value     = ''
  videoBlob.value    = null

  try {
    await runSadTalker()
  } catch (e: any) {
    videoError.value = e.message
    videoLog.value   = ''
  } finally {
    videoRunning.value = false
  }
}

async function getAvatarBase64(): Promise<{ b64: string; mime: string }> {
  if (avatarFile.value) {
    const b64 = await fileToBase64(avatarFile.value)
    return { b64, mime: avatarFile.value.type || 'image/jpeg' }
  }
  // fallback: decode from localStorage preview data URL
  const dataUrl = avatarPreview.value
  const [header, b64] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg'
  return { b64, mime }
}

async function runSadTalker() {
  videoLog.value = 'Encoding inputs…'
  const { b64: imgB64, mime: imgMime } = await getAvatarBase64()
  const audioB64 = await blobToBase64(audioBlob.value!)

  // Submit job to MCP server (server handles WebSocket to HF space)
  videoLog.value = 'Submitting to SadTalker via server…'
  const submitRes = await fetch(`${MCP_URL}/api/sadtalker/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageB64: imgB64,
      imageMime: imgMime,
      audioB64,
      preprocess: lipsyncSettings.value.preprocess,
      stillMode: lipsyncSettings.value.stillMode,
      enhancer: lipsyncSettings.value.enhancer,
      size: lipsyncSettings.value.size,
      backend: sadtalkerBackend.value,   // 'auto' | 'local' | 'hf'
    }),
  })
  const { ok, jobId, error: submitErr } = await submitRes.json() as any
  if (!ok) throw new Error(submitErr || 'Failed to submit SadTalker job')

  // Poll for status every 2s
  return new Promise<void>((resolve, reject) => {
    const poll = async () => {
      try {
        const r = await fetch(`${MCP_URL}/api/sadtalker/status?jobId=${jobId}`)
        const d = await r.json() as any
        videoLog.value = d.log || '…'

        if (d.status === 'done') {
          // Convert base64 video to blob
          const bytes = atob(d.videoBase64)
          const arr = new Uint8Array(bytes.length)
          for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
          const blob = new Blob([arr], { type: d.videoMime || 'video/mp4' })
          videoBlob.value = blob
          videoUrl.value  = URL.createObjectURL(blob)
          videoLog.value  = 'Video ready ✓'
          resolve()
        } else if (d.status === 'error') {
          reject(new Error(d.error || 'SadTalker failed'))
        } else {
          setTimeout(poll, 2000)
        }
      } catch (e: any) {
        reject(new Error(`Poll failed: ${e.message}`))
      }
    }
    setTimeout(poll, 2000)
  })
}

function downloadVideo() {
  if (!videoBlob.value) return
  const a = document.createElement('a')
  a.href = videoUrl.value
  a.download = `interview-answer-${Date.now()}.mp4`
  a.click()
}

// ─── STEP 6: Send Email ────────────────────────────────────────────────────
const emailTo          = ref(localStorage.getItem('nyx_email_to') || '')
const emailRecipient   = ref(localStorage.getItem('nyx_email_recipient') || '')
const emailCustomNote  = ref('')
const emailSending     = ref(false)
const emailSent        = ref(false)
const emailError       = ref('')
const emailLog         = ref('')

async function sendInterviewEmail() {
  if (!emailTo.value) return
  emailSending.value = true
  emailSent.value    = false
  emailError.value   = ''
  emailLog.value     = 'Preparing email…'

  try {
    // Convert video blob to base64 if small enough (< 20MB)
    let videoBase64: string | undefined
    let videoSizeBytes = 0
    if (videoBlob.value) {
      videoSizeBytes = videoBlob.value.size
      if (videoSizeBytes < 20 * 1024 * 1024) {
        emailLog.value = 'Encoding video attachment…'
        videoBase64 = await blobToBase64(videoBlob.value)
      }
    }

    emailLog.value = 'Sending via SMTP…'

    const res = await fetch(`${MCP_URL}/api/video/send-interview-email`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to:            emailTo.value,
        recipientName: emailRecipient.value || undefined,
        jobTitle:      jobTitle.value || undefined,
        company:       company.value  || undefined,
        question:      question.value,
        script:        script.value,
        videoBase64,
        videoSizeBytes,
        customNote:    emailCustomNote.value || undefined,
      }),
    })

    const data: any = await res.json()
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)

    emailSent.value = true
    emailLog.value  = `Sent ✓ ${data.attached ? '(video attached)' : '(text + script only — video too large to attach)'}`
  } catch (e: any) {
    emailError.value = e.message
    emailLog.value   = ''
  } finally {
    emailSending.value = false
  }
}

// ─── Settings Persistence ──────────────────────────────────────────────────
watch(ttsSource,   v => localStorage.setItem('nyx_tts_source', v))
watch(lipsyncModel, v => localStorage.setItem('nyx_lipsync_model', v))
watch(lipsyncSettings, v => {
  localStorage.setItem('nyx_lipsync_preprocess', v.preprocess)
  localStorage.setItem('nyx_lipsync_enhancer', v.enhancer)
  localStorage.setItem('nyx_lipsync_size', String(v.size))
  localStorage.setItem('nyx_lipsync_still', String(v.stillMode))
}, { deep: true })
watch(emailTo,        v => localStorage.setItem('nyx_email_to', v))
watch(emailRecipient, v => localStorage.setItem('nyx_email_recipient', v))
watch(heygenSpeed,   v => localStorage.setItem('nyx_heygen_speed', String(v)))
watch(heygenEmotion, v => localStorage.setItem('nyx_heygen_emotion', v))
watch(tone,     v => localStorage.setItem('nyx_tone', v))
watch(category, v => localStorage.setItem('nyx_category', v))

// ─── One-Click Full Pipeline ───────────────────────────────────────────────
// ─── Agent Pipeline ────────────────────────────────────────────────────────
interface AgentStep {
  id: string; icon: string; label: string
  status: 'idle' | 'running' | 'done' | 'failed' | 'skipped'
  log: string; decision: string; startedAt: number; duration: number; attempts: number
}
interface GenRecord {
  id: string; createdAt: number; completedAt?: number
  status: 'running' | 'done' | 'failed'
  settings: {
    question: string; category: string; tone: string
    jobTitle: string; company: string; wordCount: number
    audioSource: string; voiceId: string; language: string
    lipsyncModel: string; sadtalkerBackend: string
    emailTo: string; emailRecipient: string
  }
  steps: Pick<AgentStep, 'id' | 'status' | 'log' | 'decision' | 'duration' | 'attempts'>[]
  error?: string; totalDuration?: number
}

const agentSteps = ref<AgentStep[]>([
  { id: 'script', icon: '🤖', label: 'AI Script',      status: 'idle', log: '', decision: '', startedAt: 0, duration: 0, attempts: 0 },
  { id: 'audio',  icon: '🎙️', label: 'Voice Audio',    status: 'idle', log: '', decision: '', startedAt: 0, duration: 0, attempts: 0 },
  { id: 'video',  icon: '🎬', label: 'Lip Sync Video', status: 'idle', log: '', decision: '', startedAt: 0, duration: 0, attempts: 0 },
  { id: 'email',  icon: '📧', label: 'Send Email',     status: 'idle', log: '', decision: '', startedAt: 0, duration: 0, attempts: 0 },
])
const agentRunning  = ref(false)
const agentError    = ref('')
const agentDone     = ref(false)
const agentTotal    = ref(0)
const showAgentLog  = ref(false)
const pipelineConfirm = ref(false)

// keep legacy refs for compat with confirmation modal
const pipelineRunning = agentRunning
const pipelineLog     = ref('')
const pipelineError   = agentError

// ─── Generation History ────────────────────────────────────────────────────
const genHistory   = ref<GenRecord[]>((() => { try { return JSON.parse(localStorage.getItem('nyx_gen_history') || '[]') } catch { return [] } })())
const showHistory  = ref(false)

function saveHistory() {
  localStorage.setItem('nyx_gen_history', JSON.stringify(genHistory.value.slice(0, 30)))
}

function stepSet(id: string, patch: Partial<AgentStep>) {
  const s = agentSteps.value.find(s => s.id === id)!
  Object.assign(s, patch)
}

function stepStart(id: string, log: string, decision = '') {
  stepSet(id, { status: 'running', log, decision, startedAt: Date.now(), duration: 0 })
}

function stepDone2(id: string, log: string, decision = '') {
  const s = agentSteps.value.find(s => s.id === id)!
  s.status = 'done'; s.log = log; s.decision = decision || s.decision
  s.duration = Date.now() - s.startedAt
}

function stepFail(id: string, log: string) {
  const s = agentSteps.value.find(s => s.id === id)!
  s.status = 'failed'; s.log = log; s.duration = Date.now() - s.startedAt
}

function stepSkip(id: string, reason: string) {
  stepSet(id, { status: 'skipped', log: reason, decision: 'Already complete — skipped' })
}

async function runAgentPipeline() {
  if (!canRunPipeline.value) return
  agentRunning.value = true
  agentError.value   = ''
  agentDone.value    = false
  agentTotal.value   = 0
  showAgentLog.value = true
  const runStart     = Date.now()

  // Reset step states
  agentSteps.value.forEach(s => Object.assign(s, { status: 'idle', log: '', decision: '', startedAt: 0, duration: 0, attempts: 0 }))

  // Snapshot settings for history record
  const record: GenRecord = {
    id: Date.now().toString(36),
    createdAt: Date.now(),
    status: 'running',
    settings: {
      question:        question.value.trim().slice(0, 120),
      category:        category.value,
      tone:            tone.value,
      jobTitle:        jobTitle.value,
      company:         company.value,
      wordCount:       wordCount.value,
      audioSource:     ttsSource.value,
      voiceId:         heygenVoiceId.value,
      language:        '',
      lipsyncModel:    lipsyncModel.value,
      sadtalkerBackend: sadtalkerBackend.value,
      emailTo:         emailTo.value,
      emailRecipient:  emailRecipient.value,
    },
    steps: [],
  }
  genHistory.value.unshift(record)
  saveHistory()

  try {
    // ── STEP 1: AI Script ─────────────────────────────────────────────────
    if (script.value.trim().length > 20) {
      stepSkip('script', `${wordCount.value} words already generated`)
    } else {
      stepStart('script', 'Calling OpenAI gpt-4o-mini…', 'OpenAI primary → Gemini fallback')
      agentSteps.value.find(s => s.id === 'script')!.attempts = 1
      await generateAnswer()
      if (!script.value.trim()) {
        // Retry with explicit Gemini flag
        agentSteps.value.find(s => s.id === 'script')!.attempts = 2
        stepStart('script', 'OpenAI failed — retrying with Gemini…', 'Gemini fallback on retry')
        await generateAnswer()
      }
      if (!script.value.trim()) { stepFail('script', 'Both OpenAI and Gemini failed'); throw new Error('Script generation failed') }
      stepDone2('script', `${wordCount.value} words · ~${estDuration.value}s`, 'OpenAI success')
    }
    record.settings.wordCount = wordCount.value

    // ── STEP 2: Audio ─────────────────────────────────────────────────────
    if (audioBlob.value) {
      stepSkip('audio', 'Audio already ready')
    } else {
      const audioStep = agentSteps.value.find(s => s.id === 'audio')!
      let audioResolved = false

      if (ttsSource.value === 'voxcpm') {
        // Path A: VoxCPM local voice clone (primary)
        audioStep.decision = 'VoxCPM selected → local CosyVoice2 voice clone'
        audioStep.attempts = 1
        stepStart('audio', 'VoxCPM: synthesizing with your voice clone…')
        await generateVoxCPM()
        if (audioBlob.value) {
          audioResolved = true
          record.settings.audioSource = 'voxcpm'
          stepDone2('audio', 'VoxCPM voice clone audio ready ✓', 'VoxCPM synthesis succeeded')
        } else if (ttsError.value?.includes('model_loading')) {
          // Retry after model warm-up
          audioStep.attempts = 2
          stepSet('audio', { log: 'VoxCPM model loading — retrying…' })
          await new Promise(r => setTimeout(r, 15000))
          await generateVoxCPM()
          if (audioBlob.value) {
            audioResolved = true
            record.settings.audioSource = 'voxcpm'
            stepDone2('audio', 'VoxCPM ready after warm-up ✓', 'Retry succeeded after model load')
          }
        }
      } else if (ttsSource.value === 'heygen' && heygenVoiceId.value) {
        // Path B: HeyGen
        audioStep.decision = 'HeyGen Clone selected → try synthesis → preview fallback'
        stepStart('audio', 'Loading HeyGen voices…')
        if (!heygenReady.value) await fetchHeyGenVoices()

        if (heygenReady.value) {
          audioStep.attempts = 1
          stepSet('audio', { log: 'Attempting HeyGen voice synthesis…' })
          await generateHeyGenAudio()

          if (audioBlob.value) {
            audioResolved = true
            record.settings.audioSource = 'heygen-synthesis'
            stepDone2('audio', 'HeyGen synthesis complete ✓', 'HeyGen synthesis succeeded')
          } else {
            audioStep.attempts = 2
            stepSet('audio', { log: 'Synthesis failed — trying preview audio…' })
            const voice = heygenVoices.value.find((v: any) => v.voice_id === heygenVoiceId.value)
            if (voice?.preview_audio_url || voice?.preview_audio) {
              await usePreviewAsAudio(voice)
              if (audioBlob.value) {
                audioResolved = true
                record.settings.audioSource = 'heygen-preview'
                stepDone2('audio', 'HeyGen preview audio loaded ✓', 'Synthesis failed → used preview (free)')
              }
            }
          }
        }

        if (!audioResolved) {
          stepFail('audio', 'HeyGen synthesis and preview both failed — check API key or voice config')
          throw new Error('HeyGen audio generation failed')
        }
      } else {
        stepFail('audio', 'No audio source selected — choose VoxCPM or HeyGen in Step 3')
        throw new Error('No audio source configured')
      }

      if (!audioResolved) {
        stepFail('audio', `All audio paths failed — ${ttsError.value || 'unknown error'}`)
        throw new Error('Audio generation failed after all fallbacks')
      }
    }

    // ── STEP 3: Video ─────────────────────────────────────────────────────
    if (videoUrl.value) {
      stepSkip('video', 'Video already generated')
    } else {
      if (!(avatarFile.value || avatarPreview.value)) {
        stepFail('video', 'No avatar — upload portrait photo in Step 4')
        throw new Error('Upload an avatar portrait in Step 4 first')
      }
      const videoStep = agentSteps.value.find(s => s.id === 'video')!
      const backendLabel = sadtalkerBackend.value === 'local' ? 'Local (localhost:7860)' : sadtalkerBackend.value === 'hf' ? 'HF Space' : 'Auto (local → HF fallback)'
      videoStep.decision = `SadTalker · backend: ${backendLabel} · server-side job queue`
      videoStep.attempts = 1
      stepStart('video', 'Submitting lip sync job…')

      // Mirror videoLog into agent step log
      const logMirror = setInterval(() => {
        if (videoLog.value && videoStep.status === 'running') videoStep.log = videoLog.value
      }, 500)

      try {
        await generateVideo()
      } finally {
        clearInterval(logMirror)
      }

      if (!videoUrl.value) {
        // Retry once
        videoStep.attempts = 2
        stepStart('video', 'First attempt failed — retrying…')
        videoError.value = ''
        const logMirror2 = setInterval(() => {
          if (videoLog.value && videoStep.status === 'running') videoStep.log = videoLog.value
        }, 500)
        try { await generateVideo() } finally { clearInterval(logMirror2) }
      }

      if (!videoUrl.value) {
        stepFail('video', videoError.value || 'SadTalker returned no video')
        throw new Error(`Video generation failed: ${videoError.value || 'unknown'}`)
      }
      stepDone2('video', 'Lip sync video ready ✓')
    }

    // ── STEP 4: Email ─────────────────────────────────────────────────────
    const emailStep = agentSteps.value.find(s => s.id === 'email')!
    emailStep.decision = 'SMTP via MCP server · video attached if ≤20MB'
    emailStep.attempts = 1
    stepStart('email', `Sending to ${emailTo.value}…`)
    await sendInterviewEmail()
    stepDone2('email', `Sent to ${emailTo.value} ✓`)

    agentDone.value = true
    agentTotal.value = Date.now() - runStart
    record.status = 'done'
    record.completedAt = Date.now()
    record.totalDuration = agentTotal.value

  } catch (e: any) {
    agentError.value = e.message
    record.status = 'failed'
    record.error = e.message
    record.completedAt = Date.now()
    record.totalDuration = Date.now() - runStart
  } finally {
    agentRunning.value = false
    record.steps = agentSteps.value.map(s => ({
      id: s.id, status: s.status, log: s.log, decision: s.decision, duration: s.duration, attempts: s.attempts,
    }))
    genHistory.value[0] = record
    saveHistory()
  }
}

const canRunPipeline = computed(() =>
  question.value.trim().length > 10 && emailTo.value.trim().length > 3
)

const confirmSummary = computed(() => [
  {
    icon: '📋',
    label: 'Question',
    value: question.value.trim().slice(0, 80) + (question.value.length > 80 ? '…' : ''),
    sub: `${category.value} · ${tone.value}`,
    ok: question.value.trim().length > 10,
  },
  {
    icon: '🤖',
    label: 'AI Script',
    value: script.value ? `${wordCount.value} words · ~${estDuration.value}s` : 'Will be generated now',
    sub: script.value ? 'Ready ✓' : 'Uses OpenAI gpt-4o-mini',
    ok: true,
  },
  {
    icon: '🎙️',
    label: 'Audio',
    value: audioBlob.value
      ? 'Audio ready ✓'
      : ttsSource.value === 'heygen'
        ? `HeyGen · ${heygenVoices.value.find(v => v.voice_id === heygenVoiceId.value)?.name || heygenVoiceId.value} · ${heygenEmotion.value} · ${heygenSpeed.value}×`
        : `VoxCPM Clone · ${voiceSampleUploaded.value ? `sample ${voiceSampleSize.value}B` : 'no sample'}`,
    sub: audioBlob.value ? 'Reusing existing audio' : 'Will generate now',
    ok: true,
  },
  {
    icon: '🧑',
    label: 'Avatar',
    value: avatarPreview.value ? 'Portrait loaded ✓' : 'No avatar — upload in Step 4',
    sub: avatarFile.value?.name || 'Saved from localStorage',
    ok: !!(avatarFile.value || avatarPreview.value),
  },
  {
    icon: '🎬',
    label: 'Lip Sync',
    value: videoUrl.value
      ? 'Video ready ✓'
      : `SadTalker · ${lipsyncSettings.value.preprocess} · ${lipsyncSettings.value.enhancer || 'no enhancer'} · ${lipsyncSettings.value.size}px`,
    sub: videoUrl.value ? 'Reusing existing video' : 'Will generate now (~2 min)',
    ok: !!(avatarFile.value || avatarPreview.value),
  },
  {
    icon: '📧',
    label: 'Send To',
    value: emailTo.value || '— not set —',
    sub: emailRecipient.value ? `Attn: ${emailRecipient.value}` : 'No recipient name set',
    ok: emailTo.value.trim().length > 3,
  },
])

// ─── Question Bank floating panel ─────────────────────────────────────────
const questionBankOpen  = ref(false)
const bankSearch        = ref('')

const filteredBank = computed(() => {
  const q = bankSearch.value.trim().toLowerCase()
  return allQuestions.value.filter(item =>
    !q || item.question.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
  )
})

function loadFromBank(item: { id: string; question: string; category: string; answer: string }) {
  loadSaved(item)
  questionBankOpen.value = false
}

function deleteFromBank(id: string) {
  if (id.startsWith('pre-')) return  // can't delete preloaded
  savedQuestions.value = savedQuestions.value.filter(q => q.id !== id)
  localStorage.setItem('neuralyx_interview_q', JSON.stringify(savedQuestions.value))
}

const CATEGORY_COLORS: Record<string, string> = {
  behavioral:  'bg-blue-500/20 text-blue-400 border-blue-500/30',
  technical:   'bg-cyan-500/20 text-cyber-cyan border-cyan-500/30',
  situational: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  motivation:  'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  strength:    'bg-green-500/20 text-green-400 border-green-500/30',
  general:     'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

// ─── Step validation ───────────────────────────────────────────────────────
const canNext = computed(() => {
  if (currentStep.value === 1) return question.value.trim().length > 10
  if (currentStep.value === 2) return script.value.trim().length > 20
  if (currentStep.value === 3) return !!audioBlob.value
  if (currentStep.value === 4) return !!(avatarFile.value || avatarPreview.value)
  if (currentStep.value === 5) return !!videoUrl.value
  return false
})

const stepDone = (n: number) => {
  if (n === 1) return question.value.trim().length > 10
  if (n === 2) return script.value.trim().length > 20
  if (n === 3) return !!audioBlob.value
  if (n === 4) return !!(avatarFile.value || avatarPreview.value)
  if (n === 5) return !!videoUrl.value
  if (n === 6) return emailSent.value
  return false
}

// ─── App Version + Session Logs ───────────────────────────────────────────
const APP_VERSION = '0.9.2'

interface SessionLog { id: string; ts: number; level: 'info'|'success'|'warn'|'error'|'disabled'; tag: string; message: string }
const sessionLogs = ref<SessionLog[]>([])
const sidebarTab  = ref<'pipeline'|'logs'>('pipeline')

function addLog(level: SessionLog['level'], tag: string, message: string) {
  sessionLogs.value.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    ts: Date.now(), level, tag, message,
  })
  if (sessionLogs.value.length > 300) sessionLogs.value = sessionLogs.value.slice(0, 300)
}

watch(genLog,    val => { if (val) addLog(val.startsWith('✓') ? 'success' : 'info',    'Script', val) })
watch(ttsLog,    val => { if (val) addLog(val.includes('✓')  ? 'success' : 'info',    'Audio',  val) })
watch(videoLog,  val => { if (val) addLog('info',  'Video',  val) })
watch(emailLog,  val => { if (val) addLog(val.includes('✓')  ? 'success' : 'info',    'Email',  val) })
watch(genError,  val => { if (val) addLog('error', 'Script', val) })
watch(ttsError,  val => { if (val) addLog('error', 'Audio',  val) })
watch(videoError,val => { if (val) addLog('error', 'Video',  val) })
watch(emailError,val => { if (val) addLog('error', 'Email',  val) })
watch(refineLog, val => { if (val) addLog(val.startsWith('✓') ? 'success' : 'info',    'Refine', val) })

// ─── CCTV Monitor ─────────────────────────────────────────────────────────
const cctvOpen = ref(false)
watch(cctvOpen, open => { if (open) checkAllCCTV() })

interface CCTVService {
  id: string; name: string; icon: string; port: number; healthUrl: string
  status: 'ok'|'loading'|'offline'|'checking'|'disabled'
  lastCheck: number; statusDetail: string
  disabled: boolean; disabledReason: string
}

const cctvServices = ref<CCTVService[]>([
  { id: 'mcp',         name: 'MCP Server',     icon: '⚙️', port: 8080, healthUrl: `${MCP_URL}/health`,                     status: 'checking', lastCheck: 0, statusDetail: '', disabled: false, disabledReason: '' },
  { id: 'n8n',         name: 'n8n Automation', icon: '🔄', port: 5678, healthUrl: 'http://localhost:5678/healthz',          status: 'checking', lastCheck: 0, statusDetail: '', disabled: false, disabledReason: '' },
  { id: 'searxng',     name: 'Searxng Search', icon: '🔍', port: 8888, healthUrl: 'http://localhost:8888/',                  status: 'checking', lastCheck: 0, statusDetail: '', disabled: false, disabledReason: '' },
  { id: 'browserless', name: 'Browserless',    icon: '🌐', port: 3333, healthUrl: 'http://localhost:3333/',                  status: 'checking', lastCheck: 0, statusDetail: '', disabled: false, disabledReason: '' },
  { id: 'voxcpm',      name: 'VoxCPM Voice',   icon: '🧬', port: 7861, healthUrl: `${MCP_URL}/api/tts/voxcpm/health`,      status: 'disabled', lastCheck: 0, statusDetail: 'Pending GPU upgrade', disabled: true, disabledReason: 'Enabled after NVIDIA GPU integration' },
  { id: 'sadtalker',   name: 'SadTalker',      icon: '🎭', port: 7860, healthUrl: '',                                       status: 'disabled', lastCheck: 0, statusDetail: 'Pending GPU upgrade', disabled: true, disabledReason: 'Enabled after NVIDIA GPU integration' },
])

async function checkCCTVService(svc: CCTVService) {
  if (svc.disabled || !svc.healthUrl) return
  svc.status = 'checking'
  try {
    const r = await fetch(svc.healthUrl, { signal: AbortSignal.timeout(3000) })
    let detail = ''
    try {
      const j = await r.clone().json()
      detail = j.status || j.engine || j.message || ''
    } catch { /* non-JSON body */ }
    svc.status      = r.ok ? 'ok' : 'offline'
    svc.statusDetail = detail || (r.ok ? 'OK' : `HTTP ${r.status}`)
  } catch (e: any) {
    svc.status       = 'offline'
    svc.statusDetail = e.name === 'TimeoutError' ? 'Timeout' : 'Unreachable'
  }
  svc.lastCheck = Date.now()
  const ch = _cctvChannels[svc.id]
  if (ch) ch.postMessage({ type: 'status-update', status: svc.status, detail: svc.statusDetail, ts: svc.lastCheck })
}

function checkAllCCTV() { cctvServices.value.forEach(s => checkCCTVService(s)) }

const _cctvWins:     Record<string, Window | null>          = {}
const _cctvChannels: Record<string, BroadcastChannel | null> = {}

// eslint-disable-next-line @typescript-eslint/no-use-before-define
function openCCTVWindow(svc: CCTVService) {
  _cctvWins[svc.id]?.close()
  const ch = new BroadcastChannel(`neuralyx-cctv-${svc.id}`)
  _cctvChannels[svc.id] = ch

  const win = window.open('', `cctv-${svc.id}`, 'width=460,height=440,menubar=no,toolbar=no,location=no,status=no')
  if (!win) return
  _cctvWins[svc.id] = win

  win.document.write(`<!DOCTYPE html><html>
<head>
  <meta charset="utf-8">
  <title>${svc.icon} ${svc.name} — NEURALYX Monitor</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0a0c12;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;flex-direction:column;height:100vh}
    .bar{background:rgba(8,145,178,.08);border-bottom:1px solid rgba(8,145,178,.2);padding:10px 14px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
    .title{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:#fff}
    .dot{width:10px;height:10px;border-radius:50%;transition:background .3s}
    .s-ok{background:#34d399;box-shadow:0 0 6px #34d39966}
    .s-offline{background:#f87171}
    .s-checking{background:#fbbf24;animation:pulse 1.2s infinite}
    .s-disabled{background:#374151}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    .chip{font-size:10px;padding:3px 10px;border-radius:10px;font-weight:600}
    .c-ok{background:rgba(52,211,153,.1);color:#34d399;border:1px solid rgba(52,211,153,.25)}
    .c-offline{background:rgba(248,113,113,.1);color:#f87171;border:1px solid rgba(248,113,113,.25)}
    .c-checking{background:rgba(251,191,36,.1);color:#fbbf24;border:1px solid rgba(251,191,36,.25)}
    .c-disabled{background:rgba(107,114,128,.1);color:#6b7280;border:1px solid rgba(107,114,128,.25)}
    .body{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px}
    .row{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#111827;border-radius:8px;border:1px solid #1f2937}
    .lbl{color:#6b7280;font-size:11px}
    .val{font-family:monospace;font-size:12px;color:#f9fafb}
    .log-box{background:#111827;border:1px solid #1f2937;border-radius:8px;flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:120px}
    .log-head{padding:7px 12px;border-bottom:1px solid #1f2937;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:flex;justify-content:space-between}
    .log-body{flex:1;overflow-y:auto;padding:8px 12px;font-family:monospace;font-size:10px;line-height:1.7;color:#9ca3af}
    .disabled-center{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:24px}
    .gpu-badge{background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);color:#fbbf24;padding:6px 18px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.04em}
    .footer{padding:7px 14px;border-top:1px solid #1f2937;font-size:10px;color:#374151;display:flex;justify-content:space-between;flex-shrink:0}
  </style>
</head>
<body>
<div class="bar">
  <div class="title">
    <div class="dot ${svc.disabled ? 's-disabled' : 's-checking'}" id="dot"></div>
    <span>${svc.icon} ${svc.name}</span>
  </div>
  <span class="chip ${svc.disabled ? 'c-disabled' : 'c-checking'}" id="chip">${svc.disabled ? 'DISABLED' : 'Checking…'}</span>
</div>
<div class="body">
${svc.disabled ? `
  <div class="disabled-center">
    <div style="font-size:42px">${svc.icon}</div>
    <div class="gpu-badge">⚡ Pending GPU Upgrade</div>
    <p style="font-size:11px;color:#9ca3af;line-height:1.7;max-width:260px">${svc.disabledReason}.<br><br>Will be enabled once an external NVIDIA GPU is integrated into the system.</p>
    <p style="font-size:10px;color:#374151;margin-top:4px">Port :${svc.port}</p>
  </div>
` : `
  <div class="row"><span class="lbl">Service</span><span class="val">${svc.name}</span></div>
  <div class="row"><span class="lbl">Port</span><span class="val">:${svc.port}</span></div>
  <div class="row"><span class="lbl">Status</span><span class="val" id="statusTxt">Checking…</span></div>
  <div class="row"><span class="lbl">Last Check</span><span class="val" id="lastChk">—</span></div>
  <div class="row"><span class="lbl">Detail</span><span class="val" id="detailTxt">—</span></div>
  <div class="log-box">
    <div class="log-head"><span>Activity Log</span><span id="logCnt">0 entries</span></div>
    <div class="log-body" id="logBody"></div>
  </div>
`}
</div>
<div class="footer">
  <span>NEURALYX CCTV · v${APP_VERSION}</span>
  <span id="timer">${svc.disabled ? 'No polling' : 'Polling every 5s'}</span>
</div>
<script>
  const ch = new BroadcastChannel('neuralyx-cctv-${svc.id}')
  const dot = document.getElementById('dot')
  const chip = document.getElementById('chip')
  const statusTxt = document.getElementById('statusTxt')
  const lastChk = document.getElementById('lastChk')
  const detailTxt = document.getElementById('detailTxt')
  const logBody = document.getElementById('logBody')
  const logCnt = document.getElementById('logCnt')
  let logLines = []
  let countdown = 5

  function cls(s){ return s==='ok'?'s-ok':s==='offline'?'s-offline':s==='disabled'?'s-disabled':'s-checking' }
  function cchip(s){ return s==='ok'?'c-ok':s==='offline'?'c-offline':s==='disabled'?'c-disabled':'c-checking' }

  function applyStatus(s, detail, ts) {
    if(dot) dot.className = 'dot ' + cls(s)
    if(chip){ chip.className = 'chip ' + cchip(s); chip.textContent = s.toUpperCase() }
    if(statusTxt) statusTxt.textContent = s.toUpperCase()
    if(lastChk) lastChk.textContent = ts ? new Date(ts).toLocaleTimeString() : '—'
    if(detailTxt) detailTxt.textContent = detail || '—'
    const t = new Date().toLocaleTimeString()
    const color = s==='ok' ? '#34d399' : s==='offline' ? '#f87171' : '#6b7280'
    logLines.unshift('<span style="color:'+color+'">['+t+'] '+s+' · '+(detail||'checked')+'</span>')
    if(logLines.length > 60) logLines = logLines.slice(0, 60)
    if(logBody){ logBody.innerHTML = logLines.join('<br>'); if(logCnt) logCnt.textContent = logLines.length + ' entries' }
  }

  ch.onmessage = (e) => { if(e.data.type === 'status-update') applyStatus(e.data.status, e.data.detail, e.data.ts) }

  ${!svc.disabled && svc.healthUrl ? `
  async function poll() {
    try {
      const r = await fetch('${svc.healthUrl}', { signal: AbortSignal.timeout(3000) })
      let detail = ''; try{ const j = await r.clone().json(); detail = j.status || j.engine || '' } catch{}
      applyStatus(r.ok ? 'ok' : 'offline', detail || (r.ok ? 'OK' : 'HTTP ' + r.status), Date.now())
    } catch(e) {
      applyStatus('offline', e.name === 'TimeoutError' ? 'Timeout' : 'Unreachable', Date.now())
    }
  }
  poll()
  const pollInterval = setInterval(poll, 5000)
  setInterval(() => {
    countdown--; if(countdown <= 0) countdown = 5
    const t = document.getElementById('timer'); if(t) t.textContent = 'Refreshing in ' + countdown + 's'
  }, 1000)
  ` : ''}

  ch.postMessage({ type: 'ready' })
  window.addEventListener('beforeunload', () => { ch.close() })
<\/script>
</body></html>`)
  win.document.close()

  // Push any immediate status to popup once ready
  ch.onmessage = (e: MessageEvent) => {
    if (e.data.type === 'ready') {
      const s = cctvServices.value.find(x => x.id === svc.id)
      if (s && s.lastCheck > 0) ch.postMessage({ type: 'status-update', status: s.status, detail: s.statusDetail, ts: s.lastCheck })
    }
  }
}
</script>

<template>
  <div class="max-w-5xl mx-auto">
    <!-- Header -->
    <div class="mb-6 flex items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-2xl font-bold text-white">Interview Video Generator</h2>
          <span class="text-[9px] px-2 py-0.5 rounded-full bg-neural-700 text-gray-500 border border-neural-600 font-mono">v{{ APP_VERSION }}</span>
        </div>
        <p class="text-xs text-gray-400 mt-1">Paste employer question → AI answer → voice → lip sync → ready-to-send video</p>
      </div>
      <button @click="cctvOpen = true"
        class="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neural-600 hover:border-cyber-cyan/50 hover:bg-cyber-cyan/5 transition-all group">
        <span class="text-sm">📹</span>
        <span class="text-[11px] font-medium text-gray-400 group-hover:text-cyber-cyan transition-colors">CCTV</span>
        <span class="flex items-center gap-0.5 ml-0.5">
          <span v-for="s in cctvServices.slice(0,4)" :key="s.id"
            class="w-1.5 h-1.5 rounded-full"
            :class="s.status==='ok'?'bg-green-400':s.status==='disabled'?'bg-gray-600':s.status==='checking'?'bg-yellow-400 animate-pulse':'bg-red-400'">
          </span>
        </span>
      </button>
    </div>

    <!-- One-Click Pipeline Bar -->
    <div class="mb-4 rounded-xl border overflow-hidden transition-all"
      :class="pipelineRunning ? 'border-cyber-purple/50 bg-cyber-purple/5' : 'border-neural-600 bg-neural-800/60'">
      <div class="flex items-center gap-4 px-5 py-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-0.5">
            <span class="text-sm font-bold text-white">⚡ One-Click Pipeline</span>
            <span class="text-[9px] px-2 py-0.5 rounded-full bg-cyber-purple/20 text-cyber-purple border border-cyber-purple/30">
              Script → Audio → Video → Email
            </span>
          </div>
          <p class="text-[11px] text-gray-500">
            <span v-if="pipelineRunning" class="text-cyber-cyan animate-pulse">{{ pipelineLog }}</span>
            <span v-else-if="pipelineLog" class="text-green-400">{{ pipelineLog }}</span>
            <span v-else-if="pipelineError" class="text-red-400">{{ pipelineError }}</span>
            <span v-else>Set recipient email + paste question → runs everything automatically</span>
          </p>
        </div>

        <!-- Recipient email inline -->
        <div class="flex-shrink-0 w-52">
          <input v-model="emailTo" type="email" placeholder="Recipient email *"
            class="w-full px-3 py-1.5 bg-neural-700 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none placeholder-gray-600" />
        </div>

        <button @click="pipelineConfirm = true"
          :disabled="pipelineRunning || !canRunPipeline"
          class="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all"
          :style="pipelineRunning
            ? 'background: linear-gradient(135deg, #7c3aed80, #0891b280)'
            : 'background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue))'">
          <svg v-if="pipelineRunning" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <span v-if="pipelineRunning">Running…</span>
          <span v-else>⚡ Review & Run</span>
        </button>
      </div>

      <!-- Agent step monitor -->
      <div v-if="agentRunning || agentDone || agentError" class="border-t border-neural-700/60">
        <!-- Step row -->
        <div class="grid grid-cols-4 gap-0">
          <div v-for="step in agentSteps" :key="step.id"
            class="px-4 py-2.5 border-r border-neural-700/40 last:border-0">
            <div class="flex items-center gap-1.5 mb-0.5">
              <span class="text-sm">{{ step.icon }}</span>
              <span class="text-[10px] font-semibold"
                :class="{
                  'text-gray-600': step.status === 'idle',
                  'text-cyber-cyan animate-pulse': step.status === 'running',
                  'text-green-400': step.status === 'done' || step.status === 'skipped',
                  'text-red-400': step.status === 'failed',
                }">{{ step.label }}</span>
              <span v-if="step.status === 'skipped'" class="text-[9px] text-gray-600 ml-auto">skip</span>
              <span v-if="step.attempts > 1" class="text-[9px] text-yellow-500 ml-auto">×{{ step.attempts }}</span>
              <span v-if="step.duration > 0" class="text-[9px] text-gray-600 ml-auto">{{ (step.duration/1000).toFixed(1) }}s</span>
            </div>
            <p class="text-[9px] text-gray-500 leading-tight truncate">{{ step.log || '…' }}</p>
            <p v-if="step.decision" class="text-[9px] text-cyber-cyan/60 leading-tight mt-0.5 truncate">→ {{ step.decision }}</p>
          </div>
        </div>
        <!-- Summary bar -->
        <div class="px-5 py-2 border-t border-neural-700/40 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span v-if="agentDone" class="text-[11px] text-green-400 font-medium">✓ Pipeline complete · {{ (agentTotal/1000).toFixed(0) }}s total</span>
            <span v-else-if="agentError" class="text-[11px] text-red-400">✗ {{ agentError }}</span>
            <span v-else class="text-[11px] text-cyber-cyan animate-pulse">Agent running…</span>
          </div>
          <div class="flex items-center gap-2">
            <button @click="showHistory = !showHistory" class="text-[10px] text-gray-500 hover:text-white transition-colors">
              History ({{ genHistory.length }}) {{ showHistory ? '▲' : '▼' }}
            </button>
            <button @click="showAgentLog = !showAgentLog" class="text-[10px] text-gray-500 hover:text-white transition-colors">
              {{ showAgentLog ? 'Hide log' : 'Show log' }}
            </button>
          </div>
        </div>
      </div>

      <!-- History footer toggle -->
      <div v-else class="border-t border-neural-700/40 px-5 py-1.5 flex items-center justify-between">
        <span class="text-[10px] text-gray-600">{{ genHistory.length }} generation{{ genHistory.length !== 1 ? 's' : '' }} recorded</span>
        <button @click="showHistory = !showHistory" class="text-[10px] text-gray-500 hover:text-cyber-cyan transition-colors">
          View History {{ showHistory ? '▲' : '▼' }}
        </button>
      </div>
    </div>

    <!-- Generation History Panel -->
    <Transition name="modal-fade">
      <div v-if="showHistory && genHistory.length" class="mb-4 glass-dark rounded-xl border border-neural-600 overflow-hidden">
        <div class="px-5 py-3 border-b border-neural-700 flex items-center justify-between">
          <h4 class="text-sm font-semibold text-white">Generation History</h4>
          <button @click="genHistory = []; saveHistory()" class="text-[10px] text-red-400 hover:text-red-300">Clear all</button>
        </div>
        <div class="max-h-72 overflow-y-auto">
          <div v-for="rec in genHistory" :key="rec.id"
            class="px-5 py-3 border-b border-neural-700/40 last:border-0 hover:bg-neural-700/20 transition-colors">
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-[10px] font-semibold"
                    :class="rec.status === 'done' ? 'text-green-400' : rec.status === 'failed' ? 'text-red-400' : 'text-yellow-400'">
                    {{ rec.status === 'done' ? '✓' : rec.status === 'failed' ? '✗' : '⟳' }}
                    {{ rec.status.toUpperCase() }}
                  </span>
                  <span class="text-[10px] text-gray-500">{{ new Date(rec.createdAt).toLocaleString() }}</span>
                  <span v-if="rec.totalDuration" class="text-[10px] text-gray-600">· {{ (rec.totalDuration/1000).toFixed(0) }}s</span>
                </div>
                <p class="text-xs text-white truncate">{{ rec.settings.question }}</p>
                <div class="flex flex-wrap gap-1.5 mt-1.5">
                  <span class="text-[9px] px-1.5 py-0.5 bg-neural-700 rounded text-gray-400">{{ rec.settings.category }}</span>
                  <span class="text-[9px] px-1.5 py-0.5 bg-neural-700 rounded text-gray-400">{{ rec.settings.audioSource }}</span>
                  <span class="text-[9px] px-1.5 py-0.5 bg-neural-700 rounded text-gray-400">{{ rec.settings.lipsyncModel }} · {{ rec.settings.sadtalkerBackend }}</span>
                  <span class="text-[9px] px-1.5 py-0.5 bg-neural-700 rounded text-gray-400">{{ rec.settings.wordCount }}w</span>
                  <span class="text-[9px] px-1.5 py-0.5 bg-neural-700 rounded text-gray-400">→ {{ rec.settings.emailTo }}</span>
                </div>
                <p v-if="rec.error" class="text-[10px] text-red-400 mt-1">{{ rec.error }}</p>
              </div>
              <div class="flex-shrink-0 flex flex-col items-end gap-1">
                <div v-for="step in rec.steps" :key="step.id" class="flex items-center gap-1">
                  <span class="text-[9px]"
                    :class="step.status === 'done' ? 'text-green-400' : step.status === 'skipped' ? 'text-gray-500' : step.status === 'failed' ? 'text-red-400' : 'text-gray-600'">
                    {{ step.id }} {{ step.status === 'done' ? '✓' : step.status === 'skipped' ? '↷' : step.status === 'failed' ? '✗' : '?' }}
                    <span v-if="step.attempts > 1" class="text-yellow-500">(×{{ step.attempts }})</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Step Indicators -->
    <div class="glass-dark rounded-xl p-4 mb-6 border border-neural-600">
      <div class="flex items-center">
        <template v-for="(step, i) in steps" :key="step.num">
          <button @click="goStep(step.num)"
            class="flex flex-col items-center gap-1 group flex-1"
            :disabled="step.num > currentStep && !stepDone(step.num - 1)">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold transition-all"
              :class="[
                currentStep === step.num ? 'text-white shadow-lg' : '',
                stepDone(step.num) && currentStep !== step.num ? 'bg-green-500/20 text-green-400' : '',
                currentStep === step.num ? '' : (!stepDone(step.num) ? 'bg-neural-700 text-gray-500' : ''),
              ]"
              :style="currentStep === step.num ? 'background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue))' : ''">
              <span v-if="stepDone(step.num) && currentStep !== step.num">✓</span>
              <span v-else>{{ step.icon }}</span>
            </div>
            <span class="text-[10px] font-medium transition-colors"
              :class="currentStep === step.num ? 'text-white' : (stepDone(step.num) ? 'text-green-400' : 'text-gray-500')">
              {{ step.label }}
            </span>
          </button>
          <div v-if="i < steps.length - 1"
            class="flex-1 h-px mx-1 mb-4 transition-colors"
            :class="stepDone(step.num) ? 'bg-green-500/40' : 'bg-neural-600'"></div>
        </template>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

      <!-- Main Step Content -->
      <div class="lg:col-span-2">

        <!-- ── STEP 1: Interview Question ── -->
        <div v-show="currentStep === 1" class="glass-dark rounded-xl p-6 border border-neural-600">
          <h3 class="text-base font-semibold text-white mb-5 flex items-center gap-2">
            <span class="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
              style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue))">📋</span>
            Paste the Interview Question
          </h3>

          <!-- Context (optional) -->
          <div class="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label class="block text-[10px] text-gray-500 uppercase mb-1">Job Title (optional)</label>
              <input v-model="jobTitle" placeholder="e.g. Data Engineer"
                class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none placeholder-gray-600" />
            </div>
            <div>
              <label class="block text-[10px] text-gray-500 uppercase mb-1">Company (optional)</label>
              <input v-model="company" placeholder="e.g. Google"
                class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none placeholder-gray-600" />
            </div>
          </div>

          <!-- Category -->
          <div class="mb-4">
            <div class="flex items-center justify-between mb-2">
              <label class="text-[10px] text-gray-500 uppercase">Question Category</label>
              <span class="text-[10px] text-gray-600">Auto-detected · click to override</span>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <button v-for="cat in categories" :key="cat.value"
                @click="category = cat.value"
                class="px-3 py-2 rounded-lg text-xs font-medium transition-all border text-left relative"
                :class="category === cat.value
                  ? 'border-cyber-purple text-white'
                  : 'border-neural-600 text-gray-400 hover:border-neural-500'"
                :style="category === cat.value ? 'background: rgba(124,58,237,0.15)' : ''">
                {{ cat.label }}
                <span class="block text-[9px] font-normal opacity-60 mt-0.5 truncate">{{ cat.hint }}</span>
                <span v-if="category === cat.value && classifyResult"
                  class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-cyber-cyan"
                  title="Auto-detected"></span>
              </button>
            </div>
          </div>

          <!-- Tone -->
          <div class="mb-4">
            <label class="block text-[10px] text-gray-500 uppercase mb-2">Answer Tone</label>
            <div class="flex gap-2">
              <button v-for="t in ['professional', 'confident', 'conversational', 'concise']" :key="t"
                @click="tone = t"
                class="px-3 py-1.5 rounded-lg text-xs capitalize transition-all border"
                :class="tone === t ? 'border-cyber-cyan text-cyber-cyan' : 'border-neural-600 text-gray-400 hover:border-neural-500'">
                {{ t }}
              </button>
            </div>
          </div>

          <!-- Question Input -->
          <div class="mb-4">
            <div class="flex items-center justify-between mb-2">
              <label class="text-[10px] text-gray-500 uppercase">Employer Question</label>
              <div class="flex items-center gap-2 h-5">
                <div v-if="classifying" class="flex items-center gap-1.5 text-[10px] text-cyber-cyan animate-pulse">
                  <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Classifying…
                </div>
                <div v-else-if="classifyResult"
                  class="flex items-center gap-1.5 text-[10px] px-2.5 py-0.5 rounded-full bg-cyber-purple/20 text-cyber-purple border border-cyber-purple/30">
                  <span class="w-1.5 h-1.5 rounded-full bg-cyber-purple"></span>
                  Auto-detected: {{ classifyResult }}
                </div>
              </div>
            </div>
            <textarea v-model="question" rows="4"
              placeholder="Paste the employer's interview question here…&#10;&#10;Category, tone, and context will be auto-detected instantly."
              class="w-full px-4 py-3 bg-neural-700 border border-neural-600 rounded-xl text-white text-sm focus:border-cyber-purple focus:outline-none resize-none placeholder-gray-600 leading-relaxed transition-colors"
              :class="classifyResult ? 'border-cyber-purple/40' : ''" />
            <div class="flex items-center justify-between mt-1">
              <p class="text-[10px] text-gray-600">AI classifier detects category, tone, job title & company automatically after you paste</p>
              <span v-if="autoSaveStatus === 'saving'" class="text-[10px] text-gray-500 flex items-center gap-1">
                <span class="w-1 h-1 rounded-full bg-yellow-500 animate-pulse"></span> Saving to bank…
              </span>
              <span v-else-if="autoSaveStatus === 'saved'" class="text-[10px] text-green-400 flex items-center gap-1">
                <span class="w-1 h-1 rounded-full bg-green-400"></span> Saved to Question Bank
              </span>
            </div>
          </div>

          <!-- Audio Recorder + Transcription -->
          <div class="mb-3 p-3 rounded-xl border border-neural-600 bg-neural-700/40">
            <div class="flex items-center justify-between mb-2">
              <label class="text-[10px] text-gray-500 uppercase flex items-center gap-1.5">
                <span>🎙️</span> Record Audio Question
              </label>
              <span v-if="recording" class="text-[10px] text-red-400 font-mono flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                REC {{ formatRecTime(recordingTime) }}
              </span>
              <span v-else-if="transcribing" class="text-[10px] text-cyber-cyan flex items-center gap-1.5">
                <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Transcribing via {{ transcribeModel }}…
              </span>
            </div>
            <!-- Audio source toggle -->
            <div class="flex gap-1 mb-2 p-0.5 bg-neural-800 rounded-lg border border-neural-600">
              <button @click="audioSource = 'mic'" :disabled="recording"
                class="flex-1 px-2 py-1 text-[10px] rounded transition-all"
                :class="audioSource === 'mic' ? 'bg-cyber-purple/30 text-white' : 'text-gray-500 hover:text-white'">
                🎤 My Microphone
              </button>
              <button @click="audioSource = 'system'" :disabled="recording"
                class="flex-1 px-2 py-1 text-[10px] rounded transition-all"
                :class="audioSource === 'system' ? 'bg-cyber-purple/30 text-white' : 'text-gray-500 hover:text-white'"
                title="Captures browser tab / system audio — tick 'Share tab audio' in the picker">
                🔊 System Audio (Tab/Zoom)
              </button>
            </div>
            <!-- Transcription model selector -->
            <div class="mb-2">
              <label class="text-[9px] text-gray-500 uppercase block mb-1">Transcription Model</label>
              <select v-model="transcribeModel" :disabled="recording || transcribing"
                class="w-full px-2 py-1.5 text-[11px] rounded-lg bg-neural-800 border border-neural-600 text-white focus:border-cyber-cyan focus:outline-none disabled:opacity-40">
                <option value="gpt-4o-mini-transcribe">gpt-4o-mini-transcribe — fast + accurate (cloud)</option>
                <option value="gpt-4o-transcribe">gpt-4o-transcribe — best quality (cloud)</option>
                <option value="whisper-1">whisper-1 — legacy (cloud)</option>
                <option value="local-faster-whisper">local-faster-whisper — offline, free (neuralyx-whisper)</option>
              </select>
            </div>
            <!-- Live audio level meter (visible only while recording) -->
            <div v-if="recording" class="mb-2">
              <div class="flex items-center justify-between mb-0.5">
                <span class="text-[9px] text-gray-500 uppercase">Mic Level</span>
                <span class="text-[9px] font-mono" :class="audioLevel < 8 ? 'text-red-400' : audioLevel < 20 ? 'text-yellow-400' : 'text-cyber-cyan'">
                  {{ audioLevel }}{{ audioLevel < 8 ? ' — too quiet' : '' }}
                </span>
              </div>
              <div class="w-full h-1.5 rounded-full bg-neural-800 overflow-hidden">
                <div class="h-full transition-all duration-75"
                  :style="{ width: audioLevel + '%' }"
                  :class="audioLevel < 8 ? 'bg-red-500/70' : audioLevel < 20 ? 'bg-yellow-400/80' : 'bg-cyber-cyan'"></div>
              </div>
            </div>
            <div class="flex gap-2">
              <button v-if="!recording" @click="startRecording" :disabled="transcribing"
                class="flex-1 px-3 py-2 rounded-lg text-xs font-medium border border-neural-600 hover:border-cyber-cyan text-gray-300 hover:text-cyber-cyan transition-all flex items-center justify-center gap-2 disabled:opacity-40">
                <span class="text-base">⏺</span> Start Recording
              </button>
              <button v-else @click="stopRecording"
                class="flex-1 px-3 py-2 rounded-lg text-xs font-semibold bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30 transition-all flex items-center justify-center gap-2">
                <span class="text-base">⏹</span> Stop & Transcribe
              </button>
            </div>
            <p v-if="transcribeError" class="text-[10px] text-red-400 mt-1.5">{{ transcribeError }}</p>
            <div v-if="extractedQuestions.length" class="mt-2 space-y-1.5">
              <p class="text-[10px] text-gray-500 uppercase">Detected {{ extractedQuestions.length }} question{{ extractedQuestions.length > 1 ? 's' : '' }} — click to load:</p>
              <button v-for="(q, i) in extractedQuestions" :key="i" @click="useTranscribedQuestion(q)"
                class="w-full text-left px-3 py-2 rounded-lg bg-neural-800 border border-neural-600 hover:border-cyber-purple/50 text-xs text-white hover:bg-cyber-purple/5 transition-all">
                <span class="text-cyber-cyan mr-1.5">{{ i + 1 }}.</span>{{ q }}
              </button>
            </div>
          </div>

          <!-- Gabriel AI Chat toggle -->
          <button @click="chatOpen = !chatOpen"
            class="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-neural-600 hover:border-cyber-cyan/50 hover:bg-cyber-cyan/5 transition-all group mb-3">
            <div class="flex items-center gap-2">
              <span class="text-base">🤖</span>
              <div class="text-left">
                <p class="text-sm font-medium text-white group-hover:text-cyber-cyan transition-colors">Chat with Gabriel AI</p>
                <p class="text-[10px] text-gray-500">Practice interview — AI replies as Gabriel Alvin Aquino</p>
              </div>
            </div>
            <svg class="w-4 h-4 text-gray-500 transition-transform" :class="chatOpen ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </button>

          <!-- Gabriel AI Chat panel — inline OR floating window -->
          <!-- Backdrop when expanded -->
          <div v-if="chatOpen && chatExpanded"
            class="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] transition-opacity"
            @click.self="chatExpanded = false"></div>
          <div v-if="chatOpen"
            :data-chat-draggable="true"
            :class="chatExpanded
              ? 'fixed z-50 rounded-2xl border border-cyber-cyan/50 bg-neural-800 overflow-hidden shadow-2xl shadow-cyber-cyan/20 flex flex-col transition-shadow'
              : 'mb-3 rounded-xl border border-cyber-cyan/30 bg-neural-800 overflow-hidden'"
            :style="chatExpanded ? {
              left: chatDragPos.x + '%',
              top: chatDragPos.y + '%',
              width: chatDragSize.w + '%',
              height: chatDragSize.h + '%',
              maxWidth: 'none',
              maxHeight: 'none',
            } : undefined">
            <div class="flex items-center justify-between px-3 py-2 border-b border-neural-600 bg-neural-900 flex-shrink-0 select-none"
              :class="chatExpanded ? 'px-5 py-3 cursor-grab active:cursor-grabbing' : ''"
              data-chat-drag-handle
              @mousedown="startChatDrag($event)"
              @touchstart="startChatDrag($event)">
              <div class="flex items-center gap-2">
                <div class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                <p class="font-medium text-white" :class="chatExpanded ? 'text-sm' : 'text-xs'">
                  Gabriel AI — Interview Practice
                </p>
                <span v-if="chatExpanded" class="text-[10px] text-gray-500 ml-2">{{ chatMessages.length }} messages</span>
              </div>
              <div class="flex items-center gap-2">
                <!-- Pop out to separate browser window -->
                <button @click="popOutChat"
                  class="text-gray-400 hover:text-cyber-purple transition-colors"
                  title="Pop out to separate browser window">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                  </svg>
                </button>
                <!-- Toggle expanded / minimized -->
                <button @click="chatExpanded = !chatExpanded"
                  class="text-gray-400 hover:text-cyber-cyan transition-colors"
                  :title="chatExpanded ? 'Minimize to inline' : 'Expand to floating window'">
                  <svg v-if="!chatExpanded" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
                  </svg>
                  <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V4M9 9H4m5 0L4 4m11 5V4m0 5h5m-5 0l5-5M9 15v5m0-5H4m5 0l-5 5m11-5v5m0-5h5m-5 0l5 5"/>
                  </svg>
                </button>
                <!-- Reset position (only when expanded) -->
                <button v-if="chatExpanded" @click="resetChatPosition"
                  class="text-gray-400 hover:text-cyber-cyan transition-colors"
                  title="Reset window position">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                  </svg>
                </button>
                <!-- Clear all chat messages -->
                <button @click="clearChat"
                  class="text-[10px] text-gray-500 hover:text-red-400 transition-colors flex items-center gap-1"
                  :title="chatMessages.length ? 'Clear all chat messages' : 'No messages to clear'">
                  <svg v-if="chatMessages.length" class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                  {{ chatMessages.length ? `Clear (${chatMessages.length})` : 'Clear' }}
                </button>
                <!-- Close -->
                <button v-if="chatExpanded" @click="chatExpanded = false; chatOpen = false"
                  class="text-gray-400 hover:text-red-400 transition-colors" title="Close">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="overflow-y-auto p-3 space-y-2 custom-scrollbar"
              :class="chatExpanded ? 'flex-1 px-6 py-5 space-y-3' : 'max-h-64'">
              <p v-if="!chatMessages.length" class="text-gray-500 text-center py-4"
                :class="chatExpanded ? 'text-sm py-12' : 'text-[11px]'">
                Ask anything — "Tell me about yourself", "Why should we hire you?", "Walk me through NEURALYX"…
              </p>
              <div v-for="(m, i) in chatMessages" :key="i"
                :class="m.role === 'user' ? 'flex justify-end' : 'flex justify-start'">
                <div class="rounded-lg leading-relaxed"
                  :class="[
                    chatExpanded ? 'max-w-[75%] px-4 py-3 text-sm' : 'max-w-[80%] px-3 py-2 text-xs',
                    m.role === 'user'
                      ? 'bg-cyber-purple/30 text-white border border-cyber-purple/40'
                      : 'bg-neural-700 text-gray-200 border border-neural-600'
                  ]">
                  <template v-if="m.role === 'assistant'">
                    <p class="whitespace-pre-wrap">{{ extractAssets(m.content).clean }}</p>
                    <div v-if="extractAssets(m.content).assets.length" class="mt-2 flex flex-wrap gap-2">
                      <template v-for="a in extractAssets(m.content).assets" :key="a.id">
                        <a v-if="a.kind === 'image'" :href="a.url" target="_blank" rel="noopener"
                          class="block rounded border border-cyber-cyan/40 overflow-hidden hover:border-cyber-cyan transition-colors"
                          :class="chatExpanded ? 'w-32 h-20' : 'w-24 h-16'">
                          <img :src="a.url" :alt="a.label" class="w-full h-full object-cover" loading="lazy" />
                        </a>
                        <a v-else :href="a.url" target="_blank" rel="noopener"
                          class="inline-flex items-center gap-1 px-2 py-1 rounded border border-cyber-purple/40 bg-cyber-purple/10 text-cyber-purple hover:bg-cyber-purple/20 transition-colors"
                          :class="chatExpanded ? 'text-xs' : 'text-[10px]'">
                          🔗 {{ a.label || hostOf(a.url) }}
                        </a>
                      </template>
                    </div>
                  </template>
                  <p v-else class="whitespace-pre-wrap">{{ m.content }}</p>
                  <button v-if="m.role === 'assistant'" @click="useChatAsQuestion(chatMessages[i-1]?.content || '')"
                    class="mt-1.5 text-cyber-cyan hover:underline"
                    :class="chatExpanded ? 'text-xs' : 'text-[10px]'">
                    ← Use this question in Step 1
                  </button>
                </div>
              </div>
              <div v-if="chatSending" class="flex justify-start">
                <div class="px-3 py-2 rounded-lg bg-neural-700 border border-neural-600 text-xs text-gray-400 flex items-center gap-1.5">
                  <span class="w-1 h-1 rounded-full bg-cyber-cyan animate-pulse"></span>
                  <span class="w-1 h-1 rounded-full bg-cyber-cyan animate-pulse" style="animation-delay: 0.15s"></span>
                  <span class="w-1 h-1 rounded-full bg-cyber-cyan animate-pulse" style="animation-delay: 0.3s"></span>
                </div>
              </div>
            </div>
            <div class="border-t border-neural-600 space-y-1.5 flex-shrink-0"
              :class="chatExpanded ? 'p-4' : 'p-2'">
              <!-- Reference Source chip selector -->
              <div>
                <div class="flex items-center justify-between mb-1">
                  <span class="text-[9px] text-gray-500 uppercase">Answer from
                    <span v-if="activeRefIds.length" class="text-cyber-cyan">({{ activeRefIds.length }} selected)</span>
                    <span v-else class="text-gray-600">(all — no filter)</span>
                  </span>
                  <div class="flex items-center gap-2">
                    <button v-if="activeRefIds.length" @click="activeRefIds = []"
                      class="text-[9px] text-gray-500 hover:text-white">Clear</button>
                  </div>
                </div>
                <div class="flex flex-wrap gap-1">
                  <button v-for="r in refSources" :key="r.id"
                    @click="toggleRef(r.id)"
                    :title="r.description"
                    class="px-2 py-0.5 rounded text-[10px] border transition-all"
                    :class="activeRefIds.includes(r.id)
                      ? 'bg-cyber-cyan/20 border-cyber-cyan/60 text-cyber-cyan'
                      : 'bg-neural-800 border-neural-600 text-gray-400 hover:text-white hover:border-neural-500'">
                    {{ r.name }}
                    <span @click.stop="openRefEditor(r)" class="ml-1 text-gray-500 hover:text-cyber-cyan cursor-pointer" title="Edit description">✎</span>
                  </button>
                </div>
              </div>
              <!-- Transcription model selector -->
              <div class="flex items-center gap-1.5">
                <label class="text-[9px] text-gray-500 uppercase whitespace-nowrap">Transcribe</label>
                <select v-model="transcribeModel" :disabled="chatRecording || chatTranscribing"
                  class="flex-1 px-1.5 py-0.5 text-[10px] rounded bg-neural-900 border border-neural-600 text-white focus:border-cyber-cyan focus:outline-none disabled:opacity-40">
                  <option value="gpt-4o-mini-transcribe">gpt-4o-mini-transcribe — fast (cloud)</option>
                  <option value="gpt-4o-transcribe">gpt-4o-transcribe — best (cloud)</option>
                  <option value="whisper-1">whisper-1 — legacy (cloud)</option>
                  <option value="local-faster-whisper">local-faster-whisper — offline, free</option>
                </select>
              </div>
              <div v-if="chatRecording || chatTranscribing" class="px-2 py-1 rounded bg-red-500/10 border border-red-500/30 space-y-1">
                <div class="flex items-center justify-between">
                  <span v-if="chatRecording" class="text-[10px] text-red-400 font-mono flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                    Recording {{ formatRecTime(chatRecTime) }}
                  </span>
                  <span v-else class="text-[10px] text-cyber-cyan flex items-center gap-1.5">
                    <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Transcribing via {{ transcribeModel }}…
                  </span>
                  <button v-if="chatRecording" @click="stopChatRecording"
                    class="text-[10px] text-red-400 hover:text-red-300 font-semibold">⏹ Stop</button>
                </div>
                <div v-if="chatRecording">
                  <div class="flex items-center justify-between mb-0.5">
                    <span class="text-[8px] text-gray-500 uppercase">Mic</span>
                    <span class="text-[8px] font-mono" :class="audioLevel < 8 ? 'text-red-400' : audioLevel < 20 ? 'text-yellow-400' : 'text-cyber-cyan'">{{ audioLevel }}{{ audioLevel < 8 ? ' — too quiet' : '' }}</span>
                  </div>
                  <div class="w-full h-1 rounded-full bg-neural-900 overflow-hidden">
                    <div class="h-full transition-all duration-75"
                      :style="{ width: audioLevel + '%' }"
                      :class="audioLevel < 8 ? 'bg-red-500/70' : audioLevel < 20 ? 'bg-yellow-400/80' : 'bg-cyber-cyan'"></div>
                  </div>
                </div>
              </div>
              <div class="flex gap-2">
                <button v-if="!chatRecording && !chatTranscribing" @click="startChatRecording" :disabled="chatSending"
                  class="px-3 py-2 rounded-lg text-xs font-medium bg-neural-700 border border-neural-600 text-gray-300 hover:border-red-500/50 hover:text-red-400 disabled:opacity-40 transition-all"
                  title="Record voice question — will transcribe and auto-send">
                  🎤
                </button>
                <input v-model="chatInput" @keydown.enter="sendChatMessage"
                  :disabled="chatSending || chatRecording || chatTranscribing"
                  placeholder="Ask an interview question or tap 🎤…"
                  class="flex-1 px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-cyan focus:outline-none placeholder-gray-600 disabled:opacity-60" />
                <button @click="sendChatMessage" :disabled="!chatInput.trim() || chatSending || chatRecording"
                  class="px-4 py-2 rounded-lg text-xs font-medium bg-cyber-cyan/20 border border-cyber-cyan/40 text-cyber-cyan hover:bg-cyber-cyan/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                  Send
                </button>
              </div>
              <p class="text-[9px] text-gray-600">🎤 record → {{ transcribeModel }} → auto-send → Gabriel replies → record again</p>
            </div>
          </div>

          <!-- Reference Editor Modal -->
          <div v-if="refEditorOpen && editingRef" class="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" @click.self="cancelRefEdit">
            <div class="w-full max-w-xl bg-neural-800 border border-cyber-cyan/40 rounded-xl overflow-hidden shadow-2xl">
              <div class="px-5 py-3 border-b border-neural-700 flex items-center justify-between">
                <h3 class="text-sm font-semibold text-white">Edit Reference: {{ editingRef.name }}</h3>
                <button @click="cancelRefEdit" class="text-gray-400 hover:text-white">✕</button>
              </div>
              <div class="p-5 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div>
                  <label class="block text-[10px] text-gray-500 uppercase mb-1">Display Name</label>
                  <input v-model="editingRef.name" class="w-full px-3 py-2 bg-neural-900 border border-neural-600 rounded text-sm text-white focus:border-cyber-cyan focus:outline-none" />
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-[10px] text-gray-500 uppercase mb-1">Role</label>
                    <input v-model="editingRef.role" class="w-full px-3 py-2 bg-neural-900 border border-neural-600 rounded text-sm text-white focus:border-cyber-cyan focus:outline-none" />
                  </div>
                  <div>
                    <label class="block text-[10px] text-gray-500 uppercase mb-1">Period</label>
                    <input v-model="editingRef.period" class="w-full px-3 py-2 bg-neural-900 border border-neural-600 rounded text-sm text-white focus:border-cyber-cyan focus:outline-none" placeholder="e.g. 2022–2024" />
                  </div>
                </div>
                <div>
                  <label class="block text-[10px] text-gray-500 uppercase mb-1">Tech Stack (comma-separated)</label>
                  <input :value="editingRef.tech.join(', ')"
                    @input="(e: any) => editingRef!.tech = e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean)"
                    class="w-full px-3 py-2 bg-neural-900 border border-neural-600 rounded text-sm text-white focus:border-cyber-cyan focus:outline-none"
                    placeholder="Python, Vue, Docker…" />
                </div>
                <div>
                  <label class="block text-[10px] text-gray-500 uppercase mb-1">Description / What you did</label>
                  <textarea v-model="editingRef.description" rows="7"
                    class="w-full px-3 py-2 bg-neural-900 border border-neural-600 rounded text-sm text-white focus:border-cyber-cyan focus:outline-none resize-y"
                    placeholder="Specific achievements, systems built, metrics, outcomes — Gabriel AI will reference this verbatim when answering."></textarea>
                  <p class="text-[10px] text-gray-500 mt-1">Be specific with metrics and tech — the AI cites from this when you pick the chip.</p>
                </div>

                <!-- Assets (links + screenshots) -->
                <div class="pt-3 border-t border-neural-700">
                  <div class="flex items-center justify-between mb-2">
                    <label class="block text-[10px] text-gray-500 uppercase">Assets (links + screenshots)</label>
                    <div class="flex gap-1">
                      <button @click="addAssetRow('link')" type="button"
                        class="px-2 py-1 rounded bg-cyber-purple/20 border border-cyber-purple/40 text-cyber-purple text-[10px] hover:bg-cyber-purple/30">+ Link</button>
                      <button @click="addAssetRow('image')" type="button"
                        class="px-2 py-1 rounded bg-cyber-cyan/20 border border-cyber-cyan/40 text-cyber-cyan text-[10px] hover:bg-cyber-cyan/30">+ Screenshot</button>
                    </div>
                  </div>
                  <p class="text-[10px] text-gray-500 mb-2">AI emits <code class="text-cyber-cyan">[ASSET:id]</code> markers inline when the answer mentions the asset. Keywords (comma-separated) trigger fallback matching.</p>
                  <div v-if="!editingRef.assets?.length" class="text-[10px] text-gray-600 italic py-3 text-center border border-dashed border-neural-600 rounded">
                    No assets yet. Add a link (e.g. https://n8n.io) or screenshot URL so the AI can surface them.
                  </div>
                  <div v-for="a in editingRef.assets" :key="a.id"
                    class="p-2 mb-2 rounded border border-neural-600 bg-neural-900/50">
                    <div class="flex items-center gap-2 mb-1.5">
                      <select v-model="a.kind" class="px-2 py-1 bg-neural-800 border border-neural-600 rounded text-[11px] text-white">
                        <option value="link">🔗 Link</option>
                        <option value="image">🖼 Image</option>
                      </select>
                      <input v-model="a.label" placeholder="Label (e.g. n8n workflow)"
                        class="flex-1 px-2 py-1 bg-neural-800 border border-neural-600 rounded text-[11px] text-white focus:border-cyber-cyan focus:outline-none" />
                      <button @click="removeAssetRow(a.id)" type="button" class="text-red-400 hover:text-red-300 text-sm px-1">✕</button>
                    </div>
                    <input v-model="a.url" :placeholder="a.kind === 'image' ? 'https://… image URL (png/jpg)' : 'https://…'"
                      class="w-full mb-1.5 px-2 py-1 bg-neural-800 border border-neural-600 rounded text-[11px] text-white focus:border-cyber-cyan focus:outline-none" />
                    <input :value="a.keywords.join(', ')"
                      @input="(e: any) => a.keywords = e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean)"
                      placeholder="Keywords: n8n, workflow, automation"
                      class="w-full px-2 py-1 bg-neural-800 border border-neural-600 rounded text-[10px] text-gray-300 focus:border-cyber-cyan focus:outline-none" />
                    <div v-if="a.kind === 'image' && a.url" class="mt-1.5">
                      <img :src="a.url" class="max-h-24 rounded border border-neural-700" @error="($event.target as HTMLImageElement).style.display='none'" />
                    </div>
                  </div>
                </div>
              </div>
              <div class="px-5 py-3 border-t border-neural-700 bg-neural-900 flex items-center justify-end gap-2">
                <button @click="cancelRefEdit" class="px-3 py-1.5 text-xs text-gray-400 hover:text-white">Cancel</button>
                <button @click="saveRefEdit" class="px-4 py-1.5 rounded bg-cyber-cyan/20 border border-cyber-cyan/40 text-cyber-cyan text-xs font-semibold hover:bg-cyber-cyan/30">Save</button>
              </div>
            </div>
          </div>

          <!-- Question Bank trigger -->
          <button @click="questionBankOpen = true"
            class="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-neural-600 hover:border-cyber-purple/50 hover:bg-cyber-purple/5 transition-all group">
            <div class="flex items-center gap-2">
              <span class="text-base">📚</span>
              <div class="text-left">
                <p class="text-sm font-medium text-white group-hover:text-cyber-purple transition-colors">Question Bank</p>
                <p class="text-[10px] text-gray-500">{{ allQuestions.length }} questions saved · {{ PRELOADED_QUESTIONS.length }} examples</p>
              </div>
            </div>
            <svg class="w-4 h-4 text-gray-500 group-hover:text-cyber-purple transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        </div>

        <!-- ── STEP 2: AI Answer ── -->
        <div v-show="currentStep === 2" class="glass-dark rounded-xl p-6 border border-neural-600">
          <h3 class="text-base font-semibold text-white mb-2 flex items-center gap-2">
            <span class="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
              style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue))">🤖</span>
            AI-Generated Answer
          </h3>
          <p class="text-xs text-gray-400 mb-5">Review and edit before recording. This becomes your video script.</p>

          <!-- Question recap -->
          <div class="p-3 rounded-lg bg-neural-700/50 border border-neural-600 mb-4">
            <p class="text-[10px] text-gray-500 uppercase mb-1">Your Question</p>
            <p class="text-sm text-white">{{ question }}</p>
          </div>

          <!-- Agent status -->
          <div class="flex items-center justify-between gap-3 mb-4">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-[10px] text-gray-500 uppercase">Video Script Agent</span>
                <span class="text-[9px] px-2 py-0.5 rounded-full bg-cyber-purple/20 text-cyber-purple border border-cyber-purple/30">
                  2-stage · specialized
                </span>
              </div>
              <p class="text-[11px] text-gray-400">Analyzes question intent → builds video-optimized spoken script</p>
            </div>
            <button @click="generateAnswer" :disabled="generating"
              class="flex-shrink-0 px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-2"
              style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue))">
              <svg v-if="generating" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              {{ generating ? 'Running…' : (generatedAnswer ? '🔄 Regenerate' : '✨ Run Agent') }}
            </button>
          </div>

          <!-- Agent thinking display -->
          <div v-if="generating || agentThinking" class="mb-4">
            <div class="rounded-xl border overflow-hidden transition-all"
              :class="generating ? 'border-cyber-purple/40 bg-cyber-purple/5' : 'border-neural-600 bg-neural-700/30'">
              <div class="flex items-center gap-2 px-4 py-2 border-b"
                :class="generating ? 'border-cyber-purple/20' : 'border-neural-600'">
                <svg v-if="generating" class="w-3 h-3 animate-spin text-cyber-purple" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <span v-else class="w-3 h-3 rounded-full bg-green-400 flex-shrink-0"></span>
                <span class="text-[10px] font-semibold"
                  :class="generating ? 'text-cyber-purple' : 'text-green-400'">
                  {{ generating ? genLog : 'Agent Analysis Complete' }}
                </span>
              </div>
              <div v-if="agentThinking" class="px-4 py-3">
                <p class="text-[10px] text-gray-500 uppercase mb-1">Agent Reasoning</p>
                <p class="text-xs text-gray-300 leading-relaxed italic">{{ agentThinking }}</p>
              </div>
            </div>
          </div>

          <div v-if="genError" class="p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
            <p class="text-xs text-red-400 font-mono">{{ genError }}</p>
          </div>

          <!-- Editable script -->
          <div v-if="script">
            <div class="flex items-center justify-between mb-2">
              <label class="text-[10px] text-gray-500 uppercase">Your Script (editable)</label>
              <div class="flex items-center gap-3 text-[10px] text-gray-500">
                <span>{{ wordCount }} words</span>
                <span>~{{ estDuration }}s video</span>
                <span :class="estDuration > 90 ? 'text-yellow-400' : 'text-green-400'">
                  {{ estDuration > 90 ? '⚠ Too long' : '✓ Good length' }}
                </span>
                <button @click="scriptPopout = !scriptPopout"
                  class="flex items-center gap-1 px-2 py-0.5 rounded border border-cyber-purple/40 text-cyber-purple hover:bg-cyber-purple/10 transition-colors text-[10px]">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-4 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                  </svg>
                  {{ scriptPopout ? 'Dock' : 'Float' }}
                </button>
                <button @click="openScriptBrowserWindow"
                  class="flex items-center gap-1 px-2 py-0.5 rounded border border-cyber-cyan/40 text-cyber-cyan hover:bg-cyber-cyan/10 transition-colors text-[10px]">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                  </svg>
                  New Window
                </button>
              </div>
            </div>
            <textarea v-if="!scriptPopout" v-model="script" rows="8"
              class="w-full px-4 py-3 bg-neural-700 border border-neural-600 rounded-xl text-white text-sm focus:border-cyber-purple focus:outline-none resize-none leading-relaxed" />
            <div v-else class="px-4 py-6 rounded-xl border border-neural-600 bg-neural-700/30 text-center text-[11px] text-gray-500">
              Script is open in floating window ↗
            </div>
            <p class="text-[10px] text-gray-500 mt-1">Edit freely — this exact text will be spoken in your video</p>

            <!-- ── Refine Panel ── -->
            <div class="mt-4 rounded-xl border border-neural-600 overflow-hidden">
              <div class="flex items-center gap-2 px-4 py-2.5 bg-neural-700/40 border-b border-neural-600">
                <span class="text-sm">✏️</span>
                <span class="text-[11px] font-semibold text-white">Refine with AI</span>
                <span class="text-[9px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/25">correction agent</span>
              </div>
              <div class="p-4 space-y-3">
                <p class="text-[10px] text-gray-500 leading-relaxed">
                  Tell the agent what to fix, remove, or change — it will rewrite only those parts.
                </p>

                <!-- Example chips -->
                <div class="flex flex-wrap gap-1.5">
                  <button v-for="hint in [
                    'Remove the part about Claude Code',
                    'Make it shorter, max 120 words',
                    'Sound more confident, less humble',
                    'Remove all metrics/numbers',
                    'Rewrite the opening line',
                    'Make the closing stronger',
                  ]" :key="hint"
                    @click="refineNote = hint"
                    class="px-2.5 py-1 rounded-full text-[10px] border border-neural-500 text-gray-400 hover:border-cyber-purple/50 hover:text-cyber-purple hover:bg-cyber-purple/5 transition-all">
                    {{ hint }}
                  </button>
                </div>

                <textarea v-model="refineNote" rows="2"
                  placeholder="e.g. Remove the part about n8n — I don't use that here. Also make the opening line stronger."
                  class="w-full px-3 py-2.5 bg-neural-900 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none resize-none placeholder-gray-600 leading-relaxed" />

                <div class="flex items-center gap-3">
                  <button @click="refineScript"
                    :disabled="refining || !refineNote.trim()"
                    class="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-40 transition-all"
                    style="background: linear-gradient(135deg, #f59e0b, #d97706)">
                    <svg v-if="refining" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    {{ refining ? 'Refining…' : '✏️ Apply Correction' }}
                  </button>
                  <span v-if="refineLog" class="text-[11px]"
                    :class="refineLog.startsWith('✓') ? 'text-green-400' : 'text-cyber-cyan'">
                    {{ refineLog }}
                  </span>
                  <span v-if="refineError" class="text-[11px] text-red-400 font-mono truncate">{{ refineError }}</span>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="aspect-video rounded-xl bg-neural-700/30 border border-dashed border-white/10 flex flex-col items-center justify-center">
            <span class="text-3xl mb-2">🤖</span>
            <p class="text-xs text-gray-500">Click Generate Answer above</p>
          </div>
        </div>

        <!-- ── STEP 3: TTS Audio ── -->
        <div v-show="currentStep === 3" class="glass-dark rounded-xl p-6 border border-neural-600">
          <h3 class="text-base font-semibold text-white mb-2 flex items-center gap-2">
            <span class="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
              style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue))">🎙️</span>
            Generate Voice Audio
          </h3>
          <p class="text-xs text-gray-400 mb-4">Voice clone with VoxCPM (local, your voice) · or HeyGen API clone.</p>

          <!-- Script preview -->
          <div class="p-4 rounded-xl bg-neural-700/50 border border-neural-600 mb-5 max-h-28 overflow-y-auto">
            <p class="text-xs text-gray-300 leading-relaxed">{{ script }}</p>
          </div>

          <!-- Source toggle -->
          <div class="grid grid-cols-2 gap-3 mb-5">
            <button @click="ttsSource = 'voxcpm'"
              class="p-4 rounded-xl border-2 text-left transition-all"
              :class="ttsSource === 'voxcpm' ? 'border-cyber-cyan bg-cyan-500/10' : 'border-neural-600 hover:border-neural-500'">
              <p class="text-sm font-semibold text-white flex items-center gap-1.5">
                <span class="text-base">🧬</span> VoxCPM Clone
                <span v-if="voxcpmStatus === 'ok'" class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse ml-auto"></span>
                <span v-else-if="voxcpmStatus === 'loading'" class="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse ml-auto"></span>
                <span v-else-if="voxcpmStatus === 'offline'" class="w-1.5 h-1.5 rounded-full bg-red-400 ml-auto"></span>
              </p>
              <p class="text-[11px] text-gray-400 mt-1">Local · CosyVoice2-0.5B · your voice</p>
            </button>
            <button @click="ttsSource = 'heygen'"
              class="p-4 rounded-xl border-2 text-left transition-all"
              :class="ttsSource === 'heygen' ? 'border-[#4ade80] bg-green-500/10' : 'border-neural-600 hover:border-neural-500'">
              <p class="text-sm font-semibold text-white flex items-center gap-1.5">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" style="color:#4ade80"><circle cx="12" cy="12" r="10"/></svg>
                HeyGen Clone
              </p>
              <p class="text-[11px] text-gray-400 mt-1">API · studio quality · requires key</p>
            </button>
          </div>

          <!-- ── VoxCPM options ── -->
          <div v-if="ttsSource === 'voxcpm'" class="space-y-4">
            <!-- Status row -->
            <div class="flex items-center justify-between px-4 py-3 rounded-xl bg-neural-700/40 border border-neural-600">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full"
                  :class="voxcpmStatus === 'ok' ? 'bg-green-400 animate-pulse' : voxcpmStatus === 'loading' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'">
                </span>
                <span class="text-xs text-white font-medium">VoxCPM · localhost:7861</span>
                <span v-if="voxcpmStatus === 'ok'" class="text-[10px] text-green-400">Model ready</span>
                <span v-else-if="voxcpmStatus === 'loading'" class="text-[10px] text-yellow-400">Loading model…</span>
                <span v-else-if="voxcpmStatus === 'offline'" class="text-[10px] text-red-400">Offline</span>
                <span v-else class="text-[10px] text-gray-500">Checking…</span>
              </div>
              <button @click="checkVoxCPMHealth"
                class="px-3 py-1 rounded-lg text-[11px] font-medium text-white"
                style="background: linear-gradient(135deg, var(--color-cyber-cyan), var(--color-cyber-purple))">
                ↻ Check
              </button>
            </div>

            <!-- Voice sample upload -->
            <div class="p-4 rounded-xl border space-y-3"
              :class="voiceSampleUploaded ? 'bg-green-500/5 border-green-500/30' : 'bg-neural-700/30 border-neural-600'">
              <!-- Header -->
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-xs font-semibold text-white flex items-center gap-2">
                    🎤 Voice Reference Sample
                    <span v-if="voiceSampleUploaded" class="text-[10px] text-green-400 font-normal">
                      ✓ Active · {{ Math.round(voiceSampleSize / 1024) }}KB
                    </span>
                    <span v-else class="text-[10px] text-yellow-400 font-normal">Required</span>
                  </p>
                  <p class="text-[10px] text-gray-500 mt-0.5">3–30 sec of your voice · WAV / MP3 / WebM</p>
                </div>
                <label class="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white cursor-pointer flex-shrink-0"
                  :class="voiceSampleUploading ? 'opacity-50 pointer-events-none' : ''"
                  style="background: linear-gradient(135deg, var(--color-cyber-cyan), var(--color-cyber-purple))">
                  <input type="file" accept="audio/*" class="hidden" @change="onVoiceSamplePick" />
                  {{ voiceSampleUploading ? '↑ Uploading…' : (voiceSampleUploaded ? '↑ Replace file' : '↑ Upload file') }}
                </label>
              </div>

              <!-- HeyGen clones as source -->
              <div class="pt-2 border-t border-neural-600/50">
                <div class="flex items-center justify-between mb-2">
                  <p class="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Or load from HeyGen clone</p>
                  <button v-if="!heygenReady" @click="fetchHeyGenVoices" :disabled="heygenFetching"
                    class="text-[10px] text-cyber-cyan hover:text-white transition-colors disabled:opacity-40">
                    {{ heygenFetching ? 'Loading…' : 'Load clones →' }}
                  </button>
                </div>

                <!-- Clones list -->
                <div v-if="heygenVoices.filter(v => v.type === 'clone').length" class="space-y-1.5">
                  <div v-for="v in heygenVoices.filter(v => v.type === 'clone')" :key="v.voice_id"
                    class="flex items-center justify-between px-3 py-2 rounded-lg bg-neural-700/60 border border-neural-600 hover:border-cyber-cyan/40 transition-all">
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="text-sm flex-shrink-0">🎤</span>
                      <div class="min-w-0">
                        <p class="text-xs text-white truncate">{{ v.name }}</p>
                        <p class="text-[10px] text-gray-500">{{ v.language }} · {{ v.gender }}</p>
                      </div>
                    </div>
                    <button
                      @click="useHeygenCloneAsSample(v)"
                      :disabled="heygenSampleLoading === v.voice_id || !(v.preview_audio_url || v.preview_audio)"
                      class="flex-shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-medium text-white disabled:opacity-40 transition-all"
                      style="background: linear-gradient(135deg, var(--color-cyber-cyan), var(--color-cyber-purple))">
                      {{ heygenSampleLoading === v.voice_id ? '↓ Loading…' : '↓ Use as Sample' }}
                    </button>
                  </div>
                </div>
                <p v-else-if="heygenReady && !heygenVoices.filter(v => v.type === 'clone').length"
                  class="text-[10px] text-gray-500">No clones found in your HeyGen account.</p>
                <p v-else-if="!heygenReady && !heygenFetching"
                  class="text-[10px] text-gray-600">Click "Load clones" to pull your HeyGen voice clones.</p>
              </div>
            </div>

            <!-- Offline notice -->
            <div v-if="voxcpmStatus === 'offline'" class="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
              <p class="text-xs text-yellow-300 font-medium">VoxCPM container offline</p>
              <p class="text-[10px] text-yellow-400/80 mt-1">Run: <code class="font-mono">docker compose up voxcpm -d</code></p>
              <p class="text-[10px] text-yellow-400/60 mt-0.5">First start downloads ~1GB model — takes a few minutes.</p>
            </div>

            <!-- Generate button -->
            <button @click="generateVoxCPM"
              :disabled="ttsRunning || !voiceSampleUploaded || voxcpmStatus === 'offline'"
              class="w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-2"
              style="background: linear-gradient(135deg, var(--color-cyber-cyan), var(--color-cyber-purple))">
              <svg v-if="ttsRunning" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              {{ ttsRunning ? 'Cloning voice…' : (audioUrl ? '↻ Regenerate Clone' : '🧬 Generate with My Voice') }}
            </button>
          </div>

          <!-- ── HeyGen Clone options ── -->
          <div v-if="ttsSource === 'heygen'" class="space-y-4">
            <!-- Server status row -->
            <div class="flex items-center justify-between px-4 py-3 rounded-xl bg-neural-700/40 border border-neural-600">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full" :class="heygenReady ? 'bg-green-400 animate-pulse' : (heygenFetchError ? 'bg-red-400' : 'bg-yellow-400')"></span>
                <span class="text-xs text-white font-medium">HeyGen · server-configured</span>
                <span v-if="heygenReady" class="text-[10px] text-green-400">
                  {{ heygenVoices.filter(v => v.type === 'clone').length }} clone(s) · {{ heygenVoices.length }} voices
                </span>
                <span v-else-if="heygenFetching" class="text-[10px] text-yellow-400 animate-pulse">Loading voices…</span>
                <span v-else-if="heygenFetchError" class="text-[10px] text-red-400 truncate max-w-[180px]">{{ heygenFetchError }}</span>
                <span v-else class="text-[10px] text-gray-500">API key set in .env</span>
              </div>
              <button @click="fetchHeyGenVoices" :disabled="heygenFetching"
                class="px-3 py-1 rounded-lg text-[11px] font-medium text-white disabled:opacity-40 flex items-center gap-1"
                style="background: linear-gradient(135deg, #22c55e, #16a34a)">
                <svg v-if="heygenFetching" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                {{ heygenFetching ? 'Loading…' : (heygenVoices.length ? '↻ Refresh' : 'Load Voices') }}
              </button>
            </div>

            <!-- Voice cards — clones first -->
            <div v-if="heygenVoices.length">
              <label class="block text-[10px] text-gray-500 uppercase mb-2">
                Select Voice · {{ heygenVoices.filter(v => v.type === 'clone').length }} clone(s)
              </label>

              <!-- Clone cards -->
              <div v-if="heygenVoices.some(v => v.type === 'clone')" class="mb-3 space-y-2">
                <p class="text-[10px] text-green-400 font-medium uppercase tracking-wide">Your Clones</p>
                <div v-for="v in heygenVoices.filter(v => v.type === 'clone')" :key="v.voice_id"
                  class="rounded-xl border-2 p-3 cursor-pointer transition-all"
                  :class="heygenVoiceId === v.voice_id
                    ? 'border-green-400 bg-green-500/10'
                    : 'border-neural-600 hover:border-green-400/40'"
                  @click="heygenVoiceId = v.voice_id">
                  <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="text-base flex-shrink-0">🎤</span>
                      <div class="min-w-0">
                        <p class="text-sm font-semibold text-white truncate">{{ v.name }}</p>
                        <p class="text-[10px] text-gray-500">{{ v.language }} · {{ v.gender }}</p>
                      </div>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                      <!-- Preview button -->
                      <button v-if="v.preview_audio_url || v.preview_audio"
                        @click.stop="previewHeyGenVoice(v)"
                        class="px-2.5 py-1 rounded-lg text-[10px] font-medium border border-neural-500 text-gray-300 hover:border-green-400 hover:text-green-400 transition-all">
                        {{ heygenPreviewing === v.voice_id ? '⏸ Stop' : '▶ Preview' }}
                      </button>
                      <!-- Use preview as audio -->
                      <button v-if="v.preview_audio_url || v.preview_audio"
                        @click.stop="usePreviewAsAudio(v)"
                        :disabled="heygenDownloading === v.voice_id"
                        class="px-2.5 py-1 rounded-lg text-[10px] font-medium text-white disabled:opacity-40 transition-all"
                        style="background: linear-gradient(135deg, #22c55e, #16a34a)">
                        {{ heygenDownloading === v.voice_id ? '↓…' : '↓ Use Audio' }}
                      </button>
                    </div>
                  </div>
                  <!-- Inline audio preview player (shown when previewing) -->
                  <div v-if="heygenPreviewing === v.voice_id && heygenPreviewUrl" class="mt-2">
                    <audio :src="heygenPreviewUrl" autoplay controls class="w-full h-8" style="height:32px" />
                  </div>
                </div>
              </div>

              <!-- Library dropdown (collapsed) -->
              <details class="group">
                <summary class="text-[10px] text-gray-500 uppercase cursor-pointer hover:text-gray-300 transition-colors select-none list-none flex items-center gap-1">
                  <svg class="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                  </svg>
                  HeyGen Library ({{ heygenVoices.filter(v => v.type !== 'clone').length }} voices)
                </summary>
                <div class="mt-2">
                  <select v-model="heygenVoiceId"
                    class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-green-400 focus:outline-none">
                    <option v-for="v in heygenVoices.filter(v => v.type !== 'clone')" :key="v.voice_id" :value="v.voice_id">
                      {{ v.gender === 'male' ? '👨' : '👩' }} {{ v.name }}{{ v.language ? ` (${v.language})` : '' }}
                    </option>
                  </select>
                </div>
              </details>
            </div>

            <!-- Speed + Emotion -->
            <div v-if="heygenVoices.length" class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[10px] text-gray-500 uppercase mb-1">Speed · {{ heygenSpeed }}×</label>
                <input v-model.number="heygenSpeed" type="range" min="0.5" max="1.5" step="0.05"
                  class="w-full accent-green-400" />
              </div>
              <div>
                <label class="block text-[10px] text-gray-500 uppercase mb-1">Emotion</label>
                <select v-model="heygenEmotion"
                  class="w-full px-2 py-1.5 bg-neural-700 border border-neural-600 rounded-lg text-white text-xs focus:border-green-400 focus:outline-none">
                  <option>Friendly</option>
                  <option>Serious</option>
                  <option>Excited</option>
                  <option>Soothing</option>
                  <option>Broadcaster</option>
                </select>
              </div>
            </div>

            <!-- Generate button -->
            <button @click="generateHeyGenAudio"
              :disabled="ttsRunning || !heygenVoiceId || !heygenReady"
              class="w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-2"
              style="background: linear-gradient(135deg, #22c55e, #16a34a)">
              <svg v-if="ttsRunning" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              {{ ttsRunning ? 'Generating…' : (audioUrl ? '↻ Regenerate Clone Audio' : '🎤 Generate with Voice Clone') }}
            </button>

            <p v-if="!heygenReady && !heygenFetching && !heygenFetchError" class="text-[11px] text-gray-500 text-center">
              Click "Load Voices" to pull your clones from HeyGen
            </p>
          </div>

          <!-- Shared status + audio output -->
          <div class="mt-4 space-y-3">
            <p v-if="ttsLog" class="text-xs"
              :class="ttsLog.includes('✓') ? 'text-green-400' : 'text-cyber-cyan'">{{ ttsLog }}</p>
            <div v-if="ttsError" class="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p class="text-xs text-red-400 font-mono">{{ ttsError }}</p>
            </div>

            <div v-if="audioUrl" class="p-4 rounded-xl bg-neural-700/50 border border-green-500/20">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs text-green-400 flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                  Audio ready · {{ ttsSource === 'heygen' ? 'HeyGen Clone' : 'VoxCPM Clone' }}
                </span>
                <span class="text-[10px] text-gray-500">~{{ estDuration }}s</span>
              </div>
              <audio :src="audioUrl" controls class="w-full" />
            </div>
            <div v-else class="p-8 rounded-xl bg-neural-700/30 border border-dashed border-white/10 flex flex-col items-center">
              <span class="text-3xl mb-2">🎙️</span>
              <p class="text-xs text-gray-500">Audio preview appears here</p>
            </div>
          </div>
        </div>

        <!-- ── STEP 4: Avatar ── -->
        <div v-show="currentStep === 4" class="glass-dark rounded-xl p-6 border border-neural-600">
          <h3 class="text-base font-semibold text-white mb-2 flex items-center gap-2">
            <span class="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
              style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue))">🧑</span>
            Avatar Setup
          </h3>
          <p class="text-xs text-gray-400 mb-5">Upload your portrait and choose lip sync model.</p>

          <!-- Avatar upload -->
          <div class="mb-5">
            <label class="block text-[10px] text-gray-500 uppercase mb-2">Portrait Photo</label>
            <div class="flex items-start gap-4">
              <div v-if="!avatarPreview"
                class="w-36 aspect-square rounded-xl border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center flex-shrink-0"
                :class="avatarDragging ? 'border-cyber-purple bg-cyber-purple/5' : 'border-white/10 hover:border-white/20'"
                @dragover.prevent="avatarDragging = true" @dragleave="avatarDragging = false"
                @drop.prevent="handleAvatarDrop" @click="($refs.avatarInput as HTMLInputElement)?.click()">
                <span class="text-3xl mb-1">🧑</span>
                <p class="text-[10px] text-white/30 text-center px-2">Drop or click</p>
              </div>
              <div v-else class="relative group flex-shrink-0">
                <img :src="avatarPreview" class="w-36 aspect-square object-cover rounded-xl border border-white/10" />
                <button @click="clearAvatar()"
                  class="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">&times;</button>
                <button @click="($refs.avatarInput as HTMLInputElement)?.click()"
                  class="absolute bottom-1 right-1 px-2 py-0.5 rounded text-[10px] bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity">Change</button>
              </div>
              <div class="flex-1">
                <p class="text-xs text-gray-300 font-medium mb-1">Tips for best results</p>
                <ul class="text-[11px] text-gray-500 space-y-1">
                  <li>• Front-facing, eyes visible</li>
                  <li>• Even, natural lighting</li>
                  <li>• Face centered in frame</li>
                  <li>• Plain or blurred background</li>
                  <li>• <span class="text-green-400">Portrait saved</span> — reused next time</li>
                </ul>
              </div>
            </div>
            <input ref="avatarInput" type="file" accept="image/*" class="hidden" @change="handleAvatarSelect" />
          </div>

          <!-- SadTalker backend selector -->
          <div class="mb-5">
            <label class="block text-[10px] text-gray-500 uppercase mb-2">SadTalker Backend</label>
            <div class="grid grid-cols-3 gap-2">
              <button @click="sadtalkerBackend = 'auto'"
                class="py-2.5 px-3 rounded-lg border-2 text-left transition-all"
                :class="sadtalkerBackend === 'auto' ? 'border-cyber-cyan bg-cyber-cyan/10' : 'border-neural-600 hover:border-neural-500'">
                <p class="text-xs font-semibold text-white">⚡ Auto</p>
                <p class="text-[10px] text-gray-400 mt-0.5">Local if running, HF fallback</p>
              </button>
              <button @click="sadtalkerBackend = 'local'"
                class="py-2.5 px-3 rounded-lg border-2 text-left transition-all"
                :class="sadtalkerBackend === 'local' ? 'border-green-500 bg-green-500/10' : 'border-neural-600 hover:border-neural-500'">
                <p class="text-xs font-semibold text-white">🖥️ Local</p>
                <p class="text-[10px] text-gray-400 mt-0.5">localhost:7860 · no queue</p>
              </button>
              <button @click="sadtalkerBackend = 'hf'"
                class="py-2.5 px-3 rounded-lg border-2 text-left transition-all"
                :class="sadtalkerBackend === 'hf' ? 'border-angelic-gold bg-angelic-gold/10' : 'border-neural-600 hover:border-neural-500'">
                <p class="text-xs font-semibold text-white">☁️ HF Space</p>
                <p class="text-[10px] text-gray-400 mt-0.5">kevinwang676 · free queue</p>
              </button>
            </div>
            <p v-if="sadtalkerBackend === 'local'" class="text-[10px] text-yellow-400 mt-1.5">
              ⚠ Run <code class="bg-neural-700 px-1 rounded">sadtalker/start-cpu.bat</code> first (or start Docker sadtalker service)
            </p>
            <p v-if="sadtalkerBackend === 'hf'" class="text-[10px] text-gray-500 mt-1.5">
              Public HuggingFace space — free but may have queue wait
            </p>
          </div>

          <!-- SadTalker settings -->
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="block text-[10px] text-gray-500 uppercase mb-1">Preprocess</label>
              <select v-model="lipsyncSettings.preprocess"
                class="w-full px-2 py-1.5 bg-neural-700 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none">
                <option value="crop">Crop</option>
                <option value="resize">Resize</option>
                <option value="full">Full</option>
              </select>
            </div>
            <div>
              <label class="block text-[10px] text-gray-500 uppercase mb-1">Enhancer</label>
              <select v-model="lipsyncSettings.enhancer"
                class="w-full px-2 py-1.5 bg-neural-700 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none">
                <option value="gfpgan">GFPGAN</option>
                <option value="RestoreFormer">RestoreFormer</option>
                <option value="">None</option>
              </select>
            </div>
            <div>
              <label class="block text-[10px] text-gray-500 uppercase mb-1">Resolution</label>
              <select v-model.number="lipsyncSettings.size"
                class="w-full px-2 py-1.5 bg-neural-700 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none">
                <option :value="256">256px</option>
                <option :value="512">512px</option>
              </select>
            </div>
          </div>
        </div>

        <!-- ── STEP 5: Generate Video ── -->
        <div v-show="currentStep === 5" class="glass-dark rounded-xl p-6 border border-neural-600">
          <h3 class="text-base font-semibold text-white mb-2 flex items-center gap-2">
            <span class="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
              style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue))">🎬</span>
            Generate Interview Video
          </h3>
          <p class="text-xs text-gray-400 mb-5">Everything is ready. Generate your video interview response.</p>

          <!-- Summary -->
          <div class="grid grid-cols-2 gap-3 mb-5">
            <div class="p-3 rounded-lg bg-neural-700/50 border border-neural-600">
              <p class="text-[10px] text-gray-500 uppercase mb-1">Question</p>
              <p class="text-xs text-white truncate">{{ question }}</p>
            </div>
            <div class="p-3 rounded-lg bg-neural-700/50 border border-neural-600">
              <p class="text-[10px] text-gray-500 uppercase mb-1">Script</p>
              <p class="text-xs text-white">{{ wordCount }} words · ~{{ estDuration }}s</p>
            </div>
            <div class="p-3 rounded-lg bg-neural-700/50 border border-neural-600">
              <p class="text-[10px] text-gray-500 uppercase mb-1">Audio</p>
              <p class="text-xs" :class="audioUrl ? 'text-green-400' : 'text-red-400'">
                {{ audioUrl ? '✓ Ready' : '✗ Missing' }}
              </p>
            </div>
            <div class="p-3 rounded-lg bg-neural-700/50 border border-neural-600">
              <p class="text-[10px] text-gray-500 uppercase mb-1">Model</p>
              <p class="text-xs text-white capitalize">🎭 SadTalker</p>
            </div>
          </div>

          <button @click="generateVideo"
            :disabled="videoRunning || !audioUrl || !(avatarFile || avatarPreview)"
            class="w-full py-4 rounded-xl text-base font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3 mb-4"
            style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue))">
            <svg v-if="videoRunning" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {{ videoRunning ? videoLog || 'Generating…' : (videoUrl ? '🔄 Regenerate Video' : '🎬 Generate Video') }}
          </button>

          <div v-if="videoError" class="p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
            <p class="text-xs text-red-400 font-mono">{{ videoError }}</p>
          </div>

          <div v-if="videoUrl" class="space-y-3">
            <div class="rounded-xl overflow-hidden bg-black border border-white/5">
              <video :src="videoUrl" class="w-full max-h-64" controls autoplay loop playsinline />
            </div>
            <button @click="downloadVideo"
              class="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
              style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue))">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Download Interview Video
            </button>
          </div>
        </div>

        <!-- ── STEP 6: Send Email ── -->
        <div v-show="currentStep === 6" class="glass-dark rounded-xl p-6 border border-neural-600">
          <h3 class="text-base font-semibold text-white mb-2 flex items-center gap-2">
            <span class="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
              style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue))">📧</span>
            Send Interview Response
          </h3>
          <p class="text-xs text-gray-400 mb-5">Send your video response directly to the employer. Video attached if under 20MB.</p>

          <!-- Preview of what will be sent -->
          <div class="rounded-xl border border-neural-600 overflow-hidden mb-5">
            <!-- Email header preview -->
            <div class="p-4 border-b border-neural-600 bg-neural-700/30">
              <p class="text-[10px] text-gray-500 uppercase mb-2">Email Preview</p>
              <div class="space-y-1 text-xs">
                <div class="flex gap-2">
                  <span class="text-gray-500 w-12">From</span>
                  <span class="text-white">Gabriel Alvin Aquino &lt;gabrielalvin.jobs@gmail.com&gt;</span>
                </div>
                <div class="flex gap-2">
                  <span class="text-gray-500 w-12">Subject</span>
                  <span class="text-white">
                    Video Interview Response{{ jobTitle ? ` — ${jobTitle}` : '' }}{{ company ? ` at ${company}` : '' }} | Gabriel Alvin Aquino
                  </span>
                </div>
              </div>
            </div>

            <!-- Email body preview -->
            <div class="p-4 bg-white/[0.02] text-xs text-gray-300 leading-relaxed space-y-3">
              <p>Dear {{ emailRecipient || 'Hiring Manager' }},</p>
              <p>Thank you for your interest in my application{{ jobTitle ? ` for the ${jobTitle} position` : '' }}{{ company ? ` at ${company}` : '' }}.</p>
              <div class="p-3 bg-neural-700/50 rounded-lg border-l-2 border-cyber-purple">
                <p class="text-[10px] text-gray-500 uppercase mb-1">Your Question</p>
                <p class="italic text-gray-300">"{{ question }}"</p>
              </div>
              <div class="p-3 bg-cyber-purple/5 border border-cyber-purple/20 rounded-lg">
                <p class="text-[10px] text-cyber-purple font-semibold mb-1">🎬 {{ videoUrl ? 'Video Response' + (videoBlob && videoBlob.size < 20*1024*1024 ? ' (Attached)' : ' (Available on Request)') : 'Video Response Ready' }}</p>
                <p class="text-gray-400 line-clamp-3">{{ script }}</p>
              </div>
              <p v-if="emailCustomNote" class="text-gray-300 italic">{{ emailCustomNote }}</p>
              <p>I would welcome the chance to discuss further. Please reach me at gabrielalvin.jobs@gmail.com</p>
              <hr class="border-neural-600" />
              <p class="text-gray-400">
                <strong class="text-white">Gabriel Alvin Aquino</strong><br>
                gabrielalvin.jobs@gmail.com<br>
                neuralyx.ai.dev-environment.site
              </p>
            </div>
          </div>

          <!-- Recipient fields -->
          <div class="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label class="block text-[10px] text-gray-500 uppercase mb-1">Recipient Email *</label>
              <input v-model="emailTo" type="email" placeholder="hr@company.com"
                class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none placeholder-gray-600" />
            </div>
            <div>
              <label class="block text-[10px] text-gray-500 uppercase mb-1">Recipient Name (optional)</label>
              <input v-model="emailRecipient" placeholder="Hiring Manager"
                class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none placeholder-gray-600" />
            </div>
          </div>

          <!-- Custom note -->
          <div class="mb-5">
            <label class="block text-[10px] text-gray-500 uppercase mb-1">Additional Note (optional)</label>
            <textarea v-model="emailCustomNote" rows="2" placeholder="Add any extra context, availability, or follow-up note…"
              class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none resize-none placeholder-gray-600" />
          </div>

          <!-- Video size warning -->
          <div v-if="videoBlob && videoBlob.size >= 20*1024*1024"
            class="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-4">
            <span class="text-yellow-400 mt-0.5">⚠</span>
            <div>
              <p class="text-xs text-yellow-400 font-medium">Video too large to attach ({{ (videoBlob.size/1024/1024).toFixed(1) }}MB)</p>
              <p class="text-[11px] text-yellow-400/70 mt-0.5">Email will be sent with your script text only. Share the video separately via Google Drive or WeTransfer.</p>
            </div>
          </div>
          <div v-else-if="videoBlob"
            class="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20 mb-4">
            <span class="text-green-400">✓</span>
            <p class="text-xs text-green-400">Video ({{ (videoBlob.size/1024/1024).toFixed(1) }}MB) will be attached to the email</p>
          </div>

          <!-- Send button -->
          <button @click="sendInterviewEmail"
            :disabled="!emailTo || emailSending || emailSent"
            class="w-full py-3.5 rounded-xl text-base font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue))">
            <svg v-if="emailSending" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span v-if="emailSent">✓ Email Sent Successfully</span>
            <span v-else-if="emailSending">{{ emailLog || 'Sending…' }}</span>
            <span v-else>📧 Send Interview Response</span>
          </button>

          <p v-if="emailLog && !emailSending" class="text-xs text-center mt-2"
            :class="emailSent ? 'text-green-400' : 'text-cyber-cyan'">{{ emailLog }}</p>

          <div v-if="emailError" class="p-3 rounded-lg bg-red-500/10 border border-red-500/20 mt-3">
            <p class="text-xs text-red-400 font-mono">{{ emailError }}</p>
            <p class="text-[10px] text-gray-500 mt-1">Make sure the MCP server is running: <code class="text-cyan-400">docker compose up -d</code></p>
          </div>

          <!-- Re-send / New -->
          <div v-if="emailSent" class="flex gap-3 mt-4">
            <button @click="emailSent = false; emailTo = ''; emailLog = ''"
              class="flex-1 py-2 rounded-lg text-sm bg-neural-700 text-gray-300 hover:bg-neural-600">
              Send to Another Recipient
            </button>
          </div>
        </div>

        <!-- Nav buttons -->
        <div class="flex items-center justify-between mt-4">
          <button @click="back" :disabled="currentStep === 1"
            class="px-6 py-2.5 rounded-lg text-sm font-medium bg-neural-700 text-gray-300 hover:bg-neural-600 disabled:opacity-30 transition-colors">
            ← Back
          </button>
          <span class="text-xs text-gray-500">Step {{ currentStep }} of {{ TOTAL_STEPS }}</span>
          <button v-if="currentStep < TOTAL_STEPS" @click="next" :disabled="!canNext"
            class="px-6 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-30 transition-all"
            style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue))">
            Next →
          </button>
          <div v-else class="w-24"></div>
        </div>
      </div>

      <!-- Right Sidebar: Live Preview -->
      <div class="space-y-4">

        <!-- Generated video (shown when ready — replaces avatar preview) -->
        <div v-if="videoUrl" class="glass-dark rounded-xl p-4 border border-green-500/30 bg-green-500/5">
          <div class="flex items-center gap-2 mb-3">
            <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
            <p class="text-[10px] text-green-400 uppercase font-semibold tracking-wide">Video Ready</p>
            <button @click="downloadVideo"
              class="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 hover:bg-green-500/30 transition-colors">
              Download ↓
            </button>
          </div>
          <div class="rounded-xl overflow-hidden bg-black">
            <video :src="videoUrl" class="w-full" controls autoplay loop playsinline />
          </div>
        </div>

        <!-- Avatar preview (hidden once video is generated) -->
        <div v-else class="glass-dark rounded-xl p-4 border border-neural-600">
          <p class="text-[10px] text-gray-500 uppercase mb-3">Avatar Preview</p>
          <div v-if="avatarPreview" class="rounded-xl overflow-hidden aspect-square bg-black">
            <img :src="avatarPreview" class="w-full h-full object-cover" />
          </div>
          <div v-else class="rounded-xl aspect-square bg-neural-700/30 border border-dashed border-white/10 flex flex-col items-center justify-center">
            <span class="text-3xl mb-1">🧑</span>
            <p class="text-[10px] text-gray-600">Upload in Step 4</p>
          </div>
        </div>

        <!-- Audio preview -->
        <div v-if="audioUrl" class="glass-dark rounded-xl p-4 border border-green-500/20">
          <p class="text-[10px] text-green-400 uppercase mb-2 flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>Audio Ready
          </p>
          <audio :src="audioUrl" controls class="w-full" />
        </div>

        <!-- Script word count card -->
        <div v-if="script" class="glass-dark rounded-xl p-4 border border-neural-600">
          <p class="text-[10px] text-gray-500 uppercase mb-3">Script Stats</p>
          <div class="space-y-2">
            <div class="flex justify-between text-xs">
              <span class="text-gray-400">Words</span>
              <span class="text-white font-mono">{{ wordCount }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-gray-400">Est. Duration</span>
              <span class="font-mono" :class="estDuration > 90 ? 'text-yellow-400' : 'text-green-400'">~{{ estDuration }}s</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-gray-400">Tone</span>
              <span class="text-white capitalize">{{ tone }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-gray-400">Category</span>
              <span class="text-white capitalize">{{ category }}</span>
            </div>
          </div>
          <div class="mt-3 w-full bg-neural-700 rounded-full h-1.5">
            <div class="h-1.5 rounded-full transition-all"
              :class="estDuration > 90 ? 'bg-yellow-400' : 'bg-green-400'"
              :style="{ width: Math.min(100, (estDuration / 90) * 100) + '%' }"></div>
          </div>
          <p class="text-[10px] text-gray-600 mt-1">Ideal: under 90s for video interviews</p>
        </div>

        <!-- Pipeline / Session Logs tabs -->
        <div class="glass-dark rounded-xl border border-neural-600 overflow-hidden">
          <!-- Tab bar -->
          <div class="flex border-b border-neural-600">
            <button @click="sidebarTab = 'pipeline'"
              class="flex-1 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide transition-colors"
              :class="sidebarTab === 'pipeline' ? 'text-white bg-neural-700/60 border-b-2 border-cyber-purple' : 'text-gray-500 hover:text-gray-300'">
              Pipeline
            </button>
            <button @click="sidebarTab = 'logs'"
              class="flex-1 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide transition-colors flex items-center justify-center gap-1"
              :class="sidebarTab === 'logs' ? 'text-white bg-neural-700/60 border-b-2 border-cyber-cyan' : 'text-gray-500 hover:text-gray-300'">
              Session Logs
              <span class="text-[9px] rounded-full px-1.5 py-0.5"
                :class="sidebarTab === 'logs' ? 'bg-cyber-cyan/20 text-cyber-cyan' : 'bg-neural-700 text-gray-600'">
                {{ sessionLogs.length }}
              </span>
            </button>
          </div>

          <!-- Pipeline tab -->
          <div v-if="sidebarTab === 'pipeline'" class="p-4 space-y-2">
            <div v-for="step in steps" :key="step.num" class="flex items-center gap-2">
              <div class="w-5 h-5 rounded flex items-center justify-center text-[10px] flex-shrink-0"
                :class="stepDone(step.num) ? 'bg-green-500/20 text-green-400' : (currentStep === step.num ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-neural-700 text-gray-600')">
                {{ stepDone(step.num) ? '✓' : step.num }}
              </div>
              <span class="text-xs"
                :class="stepDone(step.num) ? 'text-green-400' : (currentStep === step.num ? 'text-white' : 'text-gray-600')">
                {{ step.label }}
              </span>
            </div>
          </div>

          <!-- Session Logs tab -->
          <div v-else class="flex flex-col" style="height:280px">
            <!-- Version + disabled features banner -->
            <div class="px-3 py-2 border-b border-neural-600 bg-neural-700/30 flex-shrink-0">
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-[10px] text-gray-500 font-mono">v{{ APP_VERSION }}</span>
                <button @click="sessionLogs = []" class="text-[9px] text-gray-600 hover:text-red-400 transition-colors">Clear</button>
              </div>
              <div class="space-y-1">
                <div class="flex items-center gap-1.5 px-2 py-1 rounded bg-yellow-500/10 border border-yellow-500/20">
                  <span class="w-1.5 h-1.5 rounded-full bg-yellow-500 flex-shrink-0"></span>
                  <span class="text-[9px] text-yellow-400 font-medium">VoxCPM</span>
                  <span class="text-[9px] text-yellow-400/60">Disabled · GPU required</span>
                </div>
                <div class="flex items-center gap-1.5 px-2 py-1 rounded bg-yellow-500/10 border border-yellow-500/20">
                  <span class="w-1.5 h-1.5 rounded-full bg-yellow-500 flex-shrink-0"></span>
                  <span class="text-[9px] text-yellow-400 font-medium">SadTalker</span>
                  <span class="text-[9px] text-yellow-400/60">Disabled · GPU required</span>
                </div>
              </div>
            </div>
            <!-- Log list -->
            <div class="flex-1 overflow-y-auto p-2 space-y-1">
              <div v-if="!sessionLogs.length" class="text-center py-6 text-[10px] text-gray-600">No activity yet</div>
              <div v-for="log in sessionLogs" :key="log.id"
                class="flex items-start gap-1.5 px-2 py-1 rounded-lg"
                :class="{
                  'bg-green-500/5'  : log.level === 'success',
                  'bg-red-500/5'    : log.level === 'error',
                  'bg-yellow-500/5' : log.level === 'disabled' || log.level === 'warn',
                  'bg-neural-700/20': log.level === 'info',
                }">
                <span class="flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1"
                  :class="{
                    'bg-green-400'  : log.level === 'success',
                    'bg-red-400'    : log.level === 'error',
                    'bg-yellow-400' : log.level === 'disabled' || log.level === 'warn',
                    'bg-gray-500'   : log.level === 'info',
                  }"></span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1">
                    <span class="text-[9px] font-semibold flex-shrink-0"
                      :class="{
                        'text-green-400'  : log.level === 'success',
                        'text-red-400'    : log.level === 'error',
                        'text-yellow-400' : log.level === 'disabled' || log.level === 'warn',
                        'text-gray-500'   : log.level === 'info',
                      }">{{ log.tag }}</span>
                    <span class="text-[8px] text-gray-600 flex-shrink-0">{{ new Date(log.ts).toLocaleTimeString() }}</span>
                  </div>
                  <p class="text-[9px] text-gray-400 leading-snug">{{ log.message }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Video output if done -->
        <div v-if="videoUrl" class="glass-dark rounded-xl p-4 border border-cyber-purple/30 bg-cyber-purple/5">
          <p class="text-[10px] text-cyber-purple uppercase mb-2 font-semibold">✓ Video Complete</p>
          <video :src="videoUrl" class="w-full rounded-lg" controls loop playsinline />
          <button @click="downloadVideo"
            class="mt-2 w-full py-2 rounded-lg text-xs font-medium text-white flex items-center justify-center gap-1"
            style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue))">
            ↓ Download MP4
          </button>
          <button v-if="currentStep < 6" @click="goStep(6)"
            class="mt-2 w-full py-2 rounded-lg text-xs font-medium bg-neural-700 text-gray-300 hover:bg-neural-600 flex items-center justify-center gap-1">
            📧 Send via Email →
          </button>
        </div>

        <!-- Email sent confirmation -->
        <div v-if="emailSent" class="glass-dark rounded-xl p-4 border border-green-500/30 bg-green-500/5">
          <p class="text-xs text-green-400 font-semibold">📧 Email Sent</p>
          <p class="text-[11px] text-gray-400 mt-1">Response delivered to {{ emailTo }}</p>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Pipeline Confirmation Modal ── -->
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="pipelineConfirm" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="pipelineConfirm = false" />

        <!-- Modal -->
        <div class="relative w-full max-w-lg bg-neural-800 border border-neural-600 rounded-2xl shadow-2xl overflow-hidden">
          <!-- Header -->
          <div class="px-6 py-4 border-b border-neural-600"
            style="background: linear-gradient(135deg, rgba(124,58,237,0.15), rgba(8,145,178,0.1))">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-base font-bold text-white">⚡ Confirm Pipeline Settings</h3>
                <p class="text-[11px] text-gray-400 mt-0.5">Review what will be used before running</p>
              </div>
              <button @click="pipelineConfirm = false"
                class="w-8 h-8 rounded-lg bg-neural-700 hover:bg-neural-600 text-gray-400 hover:text-white flex items-center justify-center transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Settings summary -->
          <div class="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
            <div v-for="row in confirmSummary" :key="row.label"
              class="flex items-start gap-3 p-3 rounded-xl border transition-colors"
              :class="row.ok ? 'border-neural-600 bg-neural-700/30' : 'border-red-500/30 bg-red-500/5'">
              <span class="text-lg flex-shrink-0 mt-0.5">{{ row.icon }}</span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{{ row.label }}</span>
                  <span v-if="!row.ok" class="text-[9px] text-red-400 font-medium">⚠ Required</span>
                </div>
                <p class="text-sm text-white font-medium mt-0.5 leading-snug">{{ row.value }}</p>
                <p class="text-[11px] text-gray-500 mt-0.5">{{ row.sub }}</p>
              </div>
              <span class="flex-shrink-0 text-sm mt-1">
                {{ row.ok ? '✓' : '✗' }}
              </span>
            </div>

            <!-- Warning if avatar missing -->
            <div v-if="!avatarPreview && !avatarFile"
              class="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <span class="text-yellow-400">⚠</span>
              <p class="text-xs text-yellow-400">Go to Step 4 and upload your portrait photo before running.</p>
            </div>
          </div>

          <!-- Footer actions -->
          <div class="px-6 py-4 border-t border-neural-600 flex items-center justify-between gap-3">
            <div class="flex-1">
              <p class="text-[10px] text-gray-500">Settings auto-save as you change them</p>
              <p class="text-[10px] text-gray-600 mt-0.5">Steps with ✓ will be skipped (already done)</p>
            </div>
            <div class="flex gap-2">
              <button @click="pipelineConfirm = false"
                class="px-4 py-2 rounded-lg text-sm bg-neural-700 text-gray-300 hover:bg-neural-600 transition-colors">
                Cancel
              </button>
              <button
                @click="pipelineConfirm = false; runAgentPipeline()"
                :disabled="!confirmSummary.every(r => r.ok)"
                class="px-5 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40 flex items-center gap-2 transition-all"
                style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue))">
                ⚡ Confirm & Run
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Question Bank Floating Panel ── -->
  <Teleport to="body">
    <Transition name="bank-slide">
      <div v-if="questionBankOpen"
        class="fixed inset-y-0 right-0 w-[420px] max-w-full bg-neural-800 border-l border-neural-600 z-50 flex flex-col shadow-2xl">

        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-neural-600 flex-shrink-0">
          <div>
            <h3 class="text-sm font-semibold text-white flex items-center gap-2">
              📚 Question Bank
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-cyber-purple/20 text-cyber-purple border border-cyber-purple/30">
                {{ allQuestions.length }} total
              </span>
            </h3>
            <p class="text-[10px] text-gray-500 mt-0.5">Click any question to load it into Step 1</p>
          </div>
          <button @click="questionBankOpen = false"
            class="w-8 h-8 rounded-lg bg-neural-700 hover:bg-neural-600 text-gray-400 hover:text-white flex items-center justify-center transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Search -->
        <div class="px-4 py-3 border-b border-neural-600 flex-shrink-0">
          <div class="relative">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
            </svg>
            <input v-model="bankSearch" placeholder="Search questions or category…"
              class="w-full pl-9 pr-4 py-2 bg-neural-900 border border-neural-600 rounded-lg text-white text-xs placeholder-gray-500 focus:border-cyber-purple focus:outline-none" />
          </div>
        </div>

        <!-- Category tabs -->
        <div class="flex gap-1.5 px-4 py-2.5 border-b border-neural-600 flex-shrink-0 overflow-x-auto">
          <button @click="bankSearch = ''"
            class="px-3 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-all border"
            :class="!bankSearch ? 'bg-cyber-purple/20 text-cyber-purple border-cyber-purple/30' : 'border-neural-600 text-gray-400 hover:border-neural-500'">
            All
          </button>
          <button v-for="cat in categories" :key="cat.value"
            @click="bankSearch = cat.value"
            class="px-3 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-all border"
            :class="bankSearch === cat.value ? 'bg-cyber-purple/20 text-cyber-purple border-cyber-purple/30' : 'border-neural-600 text-gray-400 hover:border-neural-500'">
            {{ cat.label.split(' ').slice(1).join(' ') || cat.label }}
          </button>
        </div>

        <!-- Question list -->
        <div class="flex-1 overflow-y-auto p-4 space-y-2">
          <div v-if="filteredBank.length === 0" class="text-center py-12">
            <span class="text-3xl">🔍</span>
            <p class="text-xs text-gray-500 mt-2">No questions match "{{ bankSearch }}"</p>
          </div>

          <div v-for="item in filteredBank" :key="item.id"
            class="group relative rounded-xl border transition-all cursor-pointer"
            :class="item.id.startsWith('pre-')
              ? 'border-neural-600/60 bg-neural-700/20 hover:border-cyber-purple/50 hover:bg-cyber-purple/5'
              : 'border-neural-600 bg-neural-700/40 hover:border-cyber-purple/50 hover:bg-cyber-purple/5'"
            @click="loadFromBank(item)">

            <div class="p-3.5">
              <div class="flex items-start gap-2 mb-2">
                <span class="text-[9px] px-2 py-0.5 rounded-full border font-medium capitalize flex-shrink-0 mt-0.5"
                  :class="CATEGORY_COLORS[item.category] || CATEGORY_COLORS.general">
                  {{ item.category }}
                </span>
                <span v-if="item.id.startsWith('pre-')"
                  class="text-[9px] px-1.5 py-0.5 rounded border border-neural-500 text-gray-500 flex-shrink-0">
                  example
                </span>
                <div class="flex-1" />
                <!-- Delete (saved only) -->
                <button v-if="!item.id.startsWith('pre-')"
                  @click.stop="deleteFromBank(item.id)"
                  class="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-all flex-shrink-0">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>

              <p class="text-xs text-white leading-relaxed line-clamp-3">{{ item.question }}</p>

              <div v-if="item.answer" class="mt-2 pt-2 border-t border-white/5">
                <p class="text-[10px] text-gray-500 line-clamp-2">{{ item.answer }}</p>
              </div>
            </div>

            <!-- Load indicator on hover -->
            <div class="absolute inset-x-0 bottom-0 h-0.5 rounded-b-xl opacity-0 group-hover:opacity-100 transition-opacity"
              style="background: linear-gradient(90deg, var(--color-cyber-purple), var(--color-cyber-blue))"></div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-4 py-3 border-t border-neural-600 flex-shrink-0">
          <p class="text-[10px] text-gray-600 text-center">
            {{ savedQuestions.length }} saved · {{ PRELOADED_QUESTIONS.length }} examples · answers auto-save after generation
          </p>
        </div>
      </div>
    </Transition>

    <!-- Overlay -->
    <div v-if="questionBankOpen"
      class="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
      @click="questionBankOpen = false" />
  </Teleport>

  <!-- ── Floating Script Window ──────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="scriptPopout" class="fixed z-[9999] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
      :style="{ left: popoutX + 'px', top: popoutY + 'px', width: '520px', maxHeight: '80vh' }"
      style="background: #0f1117; border: 1px solid rgba(139,92,246,0.35);">

      <!-- Title bar — drag handle -->
      <div class="flex items-center justify-between px-4 py-2.5 border-b border-neural-600 cursor-move select-none flex-shrink-0"
        style="background: rgba(139,92,246,0.08);"
        @mousedown="startDrag">
        <div class="flex items-center gap-2">
          <svg class="w-3.5 h-3.5 text-cyber-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <span class="text-[11px] font-semibold text-white">Script Editor</span>
          <span class="text-[9px] text-gray-500">{{ wordCount }} words · ~{{ estDuration }}s</span>
        </div>
        <div class="flex items-center gap-2">
          <span :class="estDuration > 90 ? 'text-yellow-400' : 'text-green-400'" class="text-[9px]">
            {{ estDuration > 90 ? '⚠ Too long' : '✓ Good length' }}
          </span>
          <button @click="scriptPopout = false"
            class="w-5 h-5 rounded-full bg-neural-600 hover:bg-red-500/40 text-gray-400 hover:text-white flex items-center justify-center transition-colors text-xs">
            ✕
          </button>
        </div>
      </div>

      <!-- Script textarea -->
      <div class="flex-1 overflow-y-auto p-4 space-y-3">
        <textarea v-model="script" rows="12"
          class="w-full px-4 py-3 bg-neural-700 border border-neural-600 rounded-xl text-white text-sm focus:border-cyber-purple focus:outline-none resize-none leading-relaxed"
          placeholder="Your script will appear here…" />
        <p class="text-[10px] text-gray-500">Edit freely — this exact text will be spoken in your video</p>

        <!-- Refine inside popout -->
        <div class="rounded-xl border border-neural-600 overflow-hidden">
          <div class="flex items-center gap-2 px-3 py-2 bg-neural-700/40 border-b border-neural-600">
            <span class="text-sm">✏️</span>
            <span class="text-[11px] font-semibold text-white">Refine with AI</span>
          </div>
          <div class="p-3 space-y-2">
            <textarea v-model="refineNote" rows="2" placeholder="Tell the agent what to fix…"
              class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none resize-none" />
            <button @click="refineScript" :disabled="refining || !refineNote.trim()"
              class="w-full py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-40 transition-opacity"
              style="background: linear-gradient(135deg, #f59e0b88, #f59e0b44); border: 1px solid rgba(245,158,11,0.3);">
              {{ refining ? 'Refining…' : '✨ Apply Refinement' }}
            </button>
            <p v-if="refineError" class="text-[10px] text-red-400">{{ refineError }}</p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ── CCTV Monitor Panel ── -->
  <Teleport to="body">
    <Transition name="cctv-slide">
      <div v-if="cctvOpen"
        class="fixed inset-x-0 bottom-0 z-50 bg-neural-800 border-t border-neural-600 shadow-2xl"
        style="max-height: 56vh;">

        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-3 border-b border-neural-600 flex-shrink-0"
          style="background: rgba(8,145,178,.06)">
          <div class="flex items-center gap-3">
            <span class="text-base">📹</span>
            <div>
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                CCTV Service Monitor
                <span class="text-[9px] px-2 py-0.5 rounded-full bg-neural-700 text-gray-500 font-mono border border-neural-600">v{{ APP_VERSION }}</span>
              </h3>
              <p class="text-[10px] text-gray-500">{{ cctvServices.filter(s=>s.status==='ok').length }} online · {{ cctvServices.filter(s=>s.disabled).length }} disabled (GPU pending) · {{ cctvServices.filter(s=>s.status==='offline').length }} offline</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button @click="checkAllCCTV"
              class="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white flex items-center gap-1.5 transition-all"
              style="background: linear-gradient(135deg, var(--color-cyber-cyan), var(--color-cyber-purple))">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              Refresh All
            </button>
            <button @click="cctvOpen = false"
              class="w-8 h-8 rounded-lg bg-neural-700 hover:bg-neural-600 text-gray-400 hover:text-white flex items-center justify-center transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Service grid -->
        <div class="overflow-y-auto" style="max-height: calc(56vh - 64px)">
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-0 divide-x divide-neural-700">
            <div v-for="svc in cctvServices" :key="svc.id"
              class="p-4 hover:bg-neural-700/20 transition-colors"
              :class="svc.disabled ? 'opacity-70' : ''">

              <!-- Status dot + name -->
              <div class="flex items-center gap-2 mb-2">
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  :class="{
                    'bg-green-400 animate-pulse shadow-sm': svc.status === 'ok',
                    'bg-red-400'    : svc.status === 'offline',
                    'bg-yellow-400 animate-pulse': svc.status === 'checking',
                    'bg-gray-600'   : svc.status === 'disabled',
                  }"></span>
                <span class="text-xs font-semibold text-white truncate">{{ svc.name }}</span>
              </div>

              <!-- Icon + port -->
              <div class="flex items-center gap-1.5 mb-2">
                <span class="text-xl">{{ svc.icon }}</span>
                <span class="text-[10px] text-gray-500 font-mono">:{{ svc.port }}</span>
              </div>

              <!-- Status badge -->
              <div class="mb-3">
                <span class="text-[9px] px-2 py-0.5 rounded-full font-semibold border"
                  :class="{
                    'bg-green-500/10 text-green-400 border-green-500/25'  : svc.status === 'ok',
                    'bg-red-500/10 text-red-400 border-red-500/25'        : svc.status === 'offline',
                    'bg-yellow-500/10 text-yellow-400 border-yellow-500/25': svc.status === 'checking',
                    'bg-gray-500/10 text-gray-500 border-gray-500/25'     : svc.status === 'disabled',
                  }">
                  {{ svc.status === 'disabled' ? '⚡ GPU Pending' : svc.status.toUpperCase() }}
                </span>
                <p class="text-[9px] text-gray-600 mt-1 truncate">{{ svc.statusDetail || (svc.status === 'checking' ? 'Checking…' : '—') }}</p>
                <p v-if="svc.lastCheck > 0" class="text-[8px] text-gray-700 mt-0.5">{{ new Date(svc.lastCheck).toLocaleTimeString() }}</p>
              </div>

              <!-- Actions -->
              <div class="flex gap-1.5">
                <button v-if="!svc.disabled"
                  @click="checkCCTVService(svc)"
                  class="flex-1 py-1 rounded text-[9px] font-medium bg-neural-700 text-gray-400 hover:bg-neural-600 hover:text-white transition-colors">
                  ↻
                </button>
                <button @click="openCCTVWindow(svc)"
                  class="flex-1 py-1 rounded text-[9px] font-medium border transition-all"
                  :class="svc.disabled
                    ? 'border-gray-700 text-gray-600 hover:border-gray-600 hover:text-gray-500'
                    : 'border-cyber-cyan/30 text-cyber-cyan hover:bg-cyber-cyan/10'">
                  ⧉ Pop
                </button>
              </div>
            </div>
          </div>

          <!-- GPU pending note -->
          <div class="px-5 py-2.5 border-t border-neural-700 flex items-center gap-2">
            <span class="text-yellow-400 text-xs">⚡</span>
            <p class="text-[10px] text-gray-600">
              <span class="text-yellow-400/70 font-medium">VoxCPM</span> and <span class="text-yellow-400/70 font-medium">SadTalker</span> are disabled — will activate after external NVIDIA GPU integration. All other services should be running via <code class="text-gray-500 font-mono">docker compose up -d</code>.
            </p>
          </div>
        </div>
      </div>
    </Transition>

    <!-- CCTV backdrop -->
    <div v-if="cctvOpen"
      class="fixed inset-0 bg-black/30 z-40"
      @click="cctvOpen = false" />
  </Teleport>

</template>

<style scoped>
.bank-slide-enter-active, .bank-slide-leave-active { transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1); }
.bank-slide-enter-from, .bank-slide-leave-to { transform: translateX(100%); }
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity 0.2s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
.modal-fade-enter-active .relative, .modal-fade-leave-active .relative { transition: transform 0.2s ease; }
.modal-fade-enter-from .relative, .modal-fade-leave-to .relative { transform: scale(0.95) translateY(8px); }
.cctv-slide-enter-active, .cctv-slide-leave-active { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.cctv-slide-enter-from, .cctv-slide-leave-to { transform: translateY(100%); }
</style>

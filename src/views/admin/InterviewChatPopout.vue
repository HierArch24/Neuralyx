<script setup lang="ts">
import { ref, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'

const openaiKey = ref(import.meta.env.VITE_OPENAI_KEY || localStorage.getItem('neuralyx_openai_key') || '')

interface ChatMsg { role: 'user' | 'assistant'; content: string; ts: number }
const chatMessages = ref<ChatMsg[]>(JSON.parse(localStorage.getItem('neuralyx_gabe_chat') || '[]'))
const chatInput = ref('')
const chatSending = ref(false)
const chatScrollEl = ref<HTMLElement | null>(null)

const chatRecording = ref(false)
const chatRecTime = ref(0)
const chatTranscribing = ref(false)
const transcribeModel = ref<'gpt-4o-mini-transcribe' | 'gpt-4o-transcribe' | 'whisper-1' | 'local-faster-whisper'>(
  (localStorage.getItem('neuralyx_transcribe_model') as any) || 'gpt-4o-mini-transcribe'
)
const whisperLocalUrl = ref<string>(localStorage.getItem('neuralyx_whisper_local_url') || 'http://localhost:7870')
const whisperHfUrl = (import.meta.env.VITE_WHISPER_HF_URL as string | undefined) || 'https://developer26-neuralyx-whisper.hf.space'
const audioLevel = ref(0)
watch(transcribeModel, v => localStorage.setItem('neuralyx_transcribe_model', v))
let chatMediaRecorder: MediaRecorder | null = null
let chatRecChunks: Blob[] = []
let chatRecTimer: ReturnType<typeof setInterval> | null = null
let audioCtx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let levelRaf: number | null = null

function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/mpeg',
  ]
  for (const m of candidates) { if (MediaRecorder.isTypeSupported(m)) return m }
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
      levelRaf = requestAnimationFrame(tick)
    }
    tick()
  } catch { /* ignore */ }
}

function stopLevelMeter() {
  if (levelRaf) { cancelAnimationFrame(levelRaf); levelRaf = null }
  analyser = null
  if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null }
  audioLevel.value = 0
}

const DEFAULT_PROOF_POINTS = `

DEFAULT EXAMPLES (use when answering questions that need specifics):
- Built NEURALYX: MCP-driven job pipeline with 4 AI sub-agents (classify, cover letter, recruiter research, post-apply research)
- Automated multi-platform apply flows (Indeed, LinkedIn, Kalibrr) with captcha solvers (2captcha + Gemini Vision)
- Edge CDP Relay architecture — bridges Docker to real browser profile for human-like automation
- n8n workflows orchestrating end-to-end pipelines
- pgvector + Supabase for semantic job matching
- Wooder Group Pty Ltd — Full Stack / AI / DevOps`

const GABRIEL_PERSONA = `You are Gabriel Alvin Aquino — AI Systems Engineer & Automation Developer with 8+ years experience.

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

// ─── Reference Source Library ─────────────────────────────────────────────
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
    description: 'Billing / invoicing system project. (Refine with specifics.)', tech: [], assets: [] },
  { id: 'billing-excis', name: 'Billing System (Excis)', role: 'Full Stack Developer', period: 'current',
    description: 'Enterprise billing system at Excis. Invoice generation, client management, reporting, integrations. (Refine with specifics.)', tech: [], assets: [] },
  { id: 'gcorpclean', name: 'GcorpClean', role: '—', period: '—',
    description: 'Project at GcorpClean. (Refine with specifics.)', tech: [], assets: [] },
  { id: 'revaya', name: 'Revaya', role: '—', period: '—',
    description: 'Project at Revaya. (Refine with specifics.)', tech: [], assets: [] },
  { id: 'access-insurance', name: 'Access Insurance', role: '—', period: '—',
    description: 'Insurance platform project at Access Insurance. (Refine with specifics.)', tech: [], assets: [] },
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
${hasAssets ? `6. When your answer references a specific system, tool, or screen that has an available asset below, embed the marker [ASSET:id] inline (UI renders the link/screenshot). Use at most 3 markers per answer. Prefer assets from the project currently being discussed in that sentence.` : ''}

SELECTED PROJECT(S):

${blocks}

════════════════════════════════════════
End of hard constraint. Now answer using ONLY the above, ${multi ? `weaving ALL ${selected.length} selected projects into the reply.` : 'staying strictly within the single selected project.'}
`
}

function extractAssets(text: string): { clean: string; assets: RefAsset[] } {
  const ids = new Set<string>()
  const re = /\[ASSET:([a-zA-Z0-9_-]+)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) ids.add(m[1])
  const clean = text.replace(re, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  const all: RefAsset[] = refSources.value.flatMap(r => r.assets || [])
  const assets = Array.from(ids).map(id => all.find(a => a.id === id)).filter(Boolean) as RefAsset[]
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

// ─── Cross-window sync via BroadcastChannel + localStorage fallback ───
let bc: BroadcastChannel | null = null
if (typeof BroadcastChannel !== 'undefined') {
  bc = new BroadcastChannel('neuralyx_gabe_chat')
  bc.onmessage = (ev) => {
    if (ev.data?.type === 'chat:sync' && Array.isArray(ev.data.messages)) {
      chatMessages.value = ev.data.messages
      scrollToBottom()
    } else if (ev.data?.type === 'chat:clear') {
      chatMessages.value = []
      localStorage.removeItem('neuralyx_gabe_chat')
    }
  }
}

function syncOut() {
  localStorage.setItem('neuralyx_gabe_chat', JSON.stringify(chatMessages.value))
  bc?.postMessage({ type: 'chat:sync', messages: chatMessages.value })
}

function onStorage(ev: StorageEvent) {
  if (ev.key === 'neuralyx_gabe_chat' && ev.newValue) {
    try {
      chatMessages.value = JSON.parse(ev.newValue)
      scrollToBottom()
    } catch { /* ignore */ }
  }
}

onMounted(() => {
  window.addEventListener('storage', onStorage)
  scrollToBottom()
})
onBeforeUnmount(() => {
  window.removeEventListener('storage', onStorage)
  bc?.close()
  if (chatRecTimer) clearInterval(chatRecTimer)
})

function scrollToBottom() {
  nextTick(() => {
    if (chatScrollEl.value) chatScrollEl.value.scrollTop = chatScrollEl.value.scrollHeight
  })
}
watch(chatMessages, scrollToBottom, { deep: true })

async function sendChatMessage() {
  const msg = chatInput.value.trim()
  if (!msg || chatSending.value) return
  if (!openaiKey.value) {
    chatMessages.value.push({ role: 'assistant', content: '⚠ OpenAI API key not found. Set it in the main app first.', ts: Date.now() })
    syncOut()
    return
  }
  chatMessages.value.push({ role: 'user', content: msg, ts: Date.now() })
  chatInput.value = ''
  chatSending.value = true
  syncOut()
  try {
    const history = chatMessages.value.slice(-12).map(m => ({ role: m.role, content: m.content }))
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey.value}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: GABRIEL_PERSONA + buildRefContext() }, ...history],
        temperature: 0.7,
        max_tokens: 500,
      }),
    })
    if (!res.ok) throw new Error(`Chat ${res.status}`)
    const data: any = await res.json()
    const reply = data.choices[0].message.content.trim()
    chatMessages.value.push({ role: 'assistant', content: reply, ts: Date.now() })
    if (chatMessages.value.length > 50) chatMessages.value = chatMessages.value.slice(-50)
    syncOut()
  } catch (e: any) {
    chatMessages.value.push({ role: 'assistant', content: `⚠ Error: ${e.message}`, ts: Date.now() })
    syncOut()
  } finally {
    chatSending.value = false
  }
}

async function startChatRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 1,
      } as any,
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
    syncOut()
  }
}

function stopChatRecording() {
  if (chatMediaRecorder && chatRecording.value) {
    chatMediaRecorder.stop()
    chatRecording.value = false
    if (chatRecTimer) { clearInterval(chatRecTimer); chatRecTimer = null }
  }
}

async function callTranscribe(blob: Blob, model: string, filename: string): Promise<string> {
  const contextPrompt = 'Interview questions for a software engineer. Topics: AI, automation, Python, Vue.js, Docker, LangChain, n8n, Supabase, full stack, NEURALYX.'
  if (model === 'local-faster-whisper') {
    const fd = new FormData()
    fd.append('file', blob, filename)
    fd.append('language', 'en')
    fd.append('prompt', contextPrompt)
    fd.append('vad', 'true')
    // Local Whisper → HF Space fallback
    let res: Response | null = null
    let lastErr = ''
    for (const base of [whisperLocalUrl.value, whisperHfUrl]) {
      try {
        const r = await fetch(`${base.replace(/\/$/, '')}/transcribe`, { method: 'POST', body: fd })
        if (r.ok) {
          console.info(`[InterviewChatPopout] whisper hit ${base === whisperLocalUrl.value ? 'local' : 'HF'}`)
          res = r
          break
        }
        lastErr = `${base} → HTTP ${r.status}`
      } catch (e) {
        lastErr = `${base} → ${e instanceof Error ? e.message : String(e)}`
      }
    }
    if (!res) throw new Error(`local-whisper unreachable, HF fallback failed: ${lastErr}`)
    const data: any = await res.json()
    return (data.text || '').trim()
  }
  if (!openaiKey.value) throw new Error('OpenAI API key missing — or switch to local-faster-whisper')
  const fd = new FormData()
  fd.append('file', blob, filename)
  fd.append('model', model)
  fd.append('language', 'en')
  fd.append('response_format', 'json')
  fd.append('prompt', contextPrompt)
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey.value}` },
    body: fd,
  })
  if (!res.ok) {
    const errTxt = await res.text().catch(() => '')
    throw new Error(`${model} ${res.status}: ${errTxt.slice(0, 120)}`)
  }
  const data: any = await res.json()
  return (data.text || '').trim()
}

async function transcribeAndSendChat(blob: Blob) {
  if (transcribeModel.value !== 'local-faster-whisper' && !openaiKey.value) return
  if (blob.size < 1000) {
    chatMessages.value.push({ role: 'assistant', content: `⚠ Recording too short/empty (${blob.size} bytes) — speak louder or longer`, ts: Date.now() })
    syncOut()
    return
  }
  chatTranscribing.value = true
  try {
    const mimeStr = blob.type || ''
    const ext = mimeStr.includes('mp4') ? 'mp4' : mimeStr.includes('ogg') ? 'ogg' : mimeStr.includes('mpeg') ? 'mp3' : 'webm'
    const filename = `chat-rec.${ext}`
    const modelChain = [transcribeModel.value, 'whisper-1'].filter((v, i, a) => a.indexOf(v) === i)
    let text = ''
    let lastErr: any = null
    for (const m of modelChain) {
      try {
        text = await callTranscribe(blob, m, filename)
        if (text) break
      } catch (e) { lastErr = e }
    }
    if (!text) {
      chatMessages.value.push({ role: 'assistant', content: lastErr ? `⚠ ${lastErr.message}` : '⚠ No speech detected', ts: Date.now() })
      syncOut()
      return
    }
    chatInput.value = text
    chatTranscribing.value = false
    await sendChatMessage()
  } catch (e: any) {
    chatMessages.value.push({ role: 'assistant', content: `⚠ Transcription failed: ${e.message}`, ts: Date.now() })
    syncOut()
  } finally {
    chatTranscribing.value = false
  }
}

function clearChat() {
  if (chatMessages.value.length === 0) return
  if (!confirm('Clear all chat messages? This cannot be undone.')) return
  chatMessages.value = []
  localStorage.removeItem('neuralyx_gabe_chat')
  bc?.postMessage({ type: 'chat:clear' })
  syncOut()
}

function formatRecTime(s: number) {
  const m = Math.floor(s / 60), sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function closeWindow() { window.close() }
</script>

<template>
  <div class="fixed inset-0 bg-neural-900 flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between px-5 py-3 border-b border-neural-700 bg-neural-800">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center text-base"
          style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue))">🤖</div>
        <div>
          <p class="text-sm font-semibold text-white">Gabriel AI — Interview Practice</p>
          <p class="text-[10px] text-gray-500">{{ chatMessages.length }} messages · syncing live with main app</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
        <button @click="clearChat" class="text-xs text-gray-400 hover:text-red-400">Clear</button>
        <button @click="closeWindow" class="text-xs text-gray-400 hover:text-white">Close</button>
      </div>
    </div>

    <!-- Messages -->
    <div ref="chatScrollEl" class="flex-1 overflow-y-auto px-6 py-5 space-y-3 custom-scrollbar">
      <p v-if="!chatMessages.length" class="text-sm text-gray-500 text-center py-16">
        Ask anything — "Tell me about yourself", "Why should we hire you?", "Walk me through NEURALYX"…
      </p>
      <div v-for="(m, i) in chatMessages" :key="i"
        :class="m.role === 'user' ? 'flex justify-end' : 'flex justify-start'">
        <div class="max-w-[75%] px-4 py-3 rounded-lg text-sm leading-relaxed"
          :class="m.role === 'user'
            ? 'bg-cyber-purple/30 text-white border border-cyber-purple/40'
            : 'bg-neural-700 text-gray-200 border border-neural-600'">
          <template v-if="m.role === 'assistant'">
            <p class="whitespace-pre-wrap">{{ extractAssets(m.content).clean }}</p>
            <div v-if="extractAssets(m.content).assets.length" class="mt-2.5 flex flex-wrap gap-2">
              <template v-for="a in extractAssets(m.content).assets" :key="a.id">
                <a v-if="a.kind === 'image'" :href="a.url" target="_blank" rel="noopener"
                  class="block w-36 h-24 rounded border border-cyber-cyan/40 overflow-hidden hover:border-cyber-cyan transition-colors">
                  <img :src="a.url" :alt="a.label" class="w-full h-full object-cover" loading="lazy" />
                </a>
                <a v-else :href="a.url" target="_blank" rel="noopener"
                  class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-cyber-purple/40 bg-cyber-purple/10 text-cyber-purple hover:bg-cyber-purple/20 transition-colors text-xs">
                  🔗 {{ a.label || hostOf(a.url) }}
                </a>
              </template>
            </div>
          </template>
          <p v-else class="whitespace-pre-wrap">{{ m.content }}</p>
        </div>
      </div>
      <div v-if="chatSending" class="flex justify-start">
        <div class="px-4 py-3 rounded-lg bg-neural-700 border border-neural-600 text-xs text-gray-400 flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-cyber-cyan animate-pulse"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-cyber-cyan animate-pulse" style="animation-delay: 0.15s"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-cyber-cyan animate-pulse" style="animation-delay: 0.3s"></span>
        </div>
      </div>
    </div>

    <!-- Input -->
    <div class="p-4 border-t border-neural-700 bg-neural-800 space-y-2">
      <!-- Reference Source chip selector -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <span class="text-[10px] text-gray-500 uppercase">Answer from
            <span v-if="activeRefIds.length" class="text-cyber-cyan">({{ activeRefIds.length }} selected)</span>
            <span v-else class="text-gray-600">(all — no filter)</span>
          </span>
          <button v-if="activeRefIds.length" @click="activeRefIds = []"
            class="text-[10px] text-gray-500 hover:text-white">Clear</button>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="r in refSources" :key="r.id"
            @click="toggleRef(r.id)"
            :title="r.description"
            class="px-2.5 py-1 rounded text-[11px] border transition-all"
            :class="activeRefIds.includes(r.id)
              ? 'bg-cyber-cyan/20 border-cyber-cyan/60 text-cyber-cyan'
              : 'bg-neural-900 border-neural-600 text-gray-400 hover:text-white hover:border-neural-500'">
            {{ r.name }}
            <span @click.stop="openRefEditor(r)" class="ml-1 text-gray-500 hover:text-cyber-cyan cursor-pointer" title="Edit">✎</span>
          </button>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <label class="text-[10px] text-gray-500 uppercase whitespace-nowrap">Transcribe model</label>
        <select v-model="transcribeModel" :disabled="chatRecording || chatTranscribing"
          class="flex-1 px-2 py-1 text-[11px] rounded bg-neural-900 border border-neural-600 text-white focus:border-cyber-cyan focus:outline-none disabled:opacity-40">
          <option value="gpt-4o-mini-transcribe">gpt-4o-mini-transcribe — fast (cloud)</option>
          <option value="gpt-4o-transcribe">gpt-4o-transcribe — best quality (cloud)</option>
          <option value="whisper-1">whisper-1 — legacy (cloud)</option>
          <option value="local-faster-whisper">local-faster-whisper — offline, free</option>
        </select>
      </div>
      <div v-if="chatRecording || chatTranscribing" class="px-3 py-2 rounded bg-red-500/10 border border-red-500/30 space-y-1.5">
        <div class="flex items-center justify-between">
          <span v-if="chatRecording" class="text-xs text-red-400 font-mono flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            Recording {{ formatRecTime(chatRecTime) }}
          </span>
          <span v-else class="text-xs text-cyber-cyan flex items-center gap-2">
            <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Transcribing via {{ transcribeModel }}…
          </span>
          <button v-if="chatRecording" @click="stopChatRecording"
            class="text-xs text-red-400 hover:text-red-300 font-semibold">⏹ Stop</button>
        </div>
        <div v-if="chatRecording">
          <div class="flex items-center justify-between mb-0.5">
            <span class="text-[9px] text-gray-500 uppercase">Mic Level</span>
            <span class="text-[9px] font-mono" :class="audioLevel < 8 ? 'text-red-400' : audioLevel < 20 ? 'text-yellow-400' : 'text-cyber-cyan'">
              {{ audioLevel }}{{ audioLevel < 8 ? ' — too quiet' : '' }}
            </span>
          </div>
          <div class="w-full h-1.5 rounded-full bg-neural-900 overflow-hidden">
            <div class="h-full transition-all duration-75"
              :style="{ width: audioLevel + '%' }"
              :class="audioLevel < 8 ? 'bg-red-500/70' : audioLevel < 20 ? 'bg-yellow-400/80' : 'bg-cyber-cyan'"></div>
          </div>
        </div>
      </div>
      <div class="flex gap-2">
        <button v-if="!chatRecording && !chatTranscribing" @click="startChatRecording" :disabled="chatSending"
          class="px-4 py-3 rounded-lg text-sm font-medium bg-neural-700 border border-neural-600 text-gray-300 hover:border-red-500/50 hover:text-red-400 disabled:opacity-40 transition-all"
          title="Record voice question — will transcribe and auto-send">
          🎤
        </button>
        <input v-model="chatInput" @keydown.enter="sendChatMessage"
          :disabled="chatSending || chatRecording || chatTranscribing"
          placeholder="Ask an interview question or tap 🎤…"
          class="flex-1 px-4 py-3 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-cyan focus:outline-none placeholder-gray-600 disabled:opacity-60" />
        <button @click="sendChatMessage" :disabled="!chatInput.trim() || chatSending || chatRecording"
          class="px-6 py-3 rounded-lg text-sm font-medium bg-cyber-cyan/20 border border-cyber-cyan/40 text-cyber-cyan hover:bg-cyber-cyan/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
          Send
        </button>
      </div>
      <p class="text-[10px] text-gray-600 text-center">🎤 record → {{ transcribeModel }} → auto-send → Gabriel replies → record again</p>
    </div>

    <!-- Reference Editor Modal -->
    <div v-if="refEditorOpen && editingRef" class="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" @click.self="cancelRefEdit">
      <div class="w-full max-w-xl bg-neural-800 border border-cyber-cyan/40 rounded-xl overflow-hidden shadow-2xl">
        <div class="px-5 py-3 border-b border-neural-700 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-white">Edit Reference: {{ editingRef.name }}</h3>
          <button @click="cancelRefEdit" class="text-gray-400 hover:text-white">✕</button>
        </div>
        <div class="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
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
              placeholder="Specific achievements, systems built, metrics, outcomes — Gabriel AI cites this verbatim."></textarea>
            <p class="text-[10px] text-gray-500 mt-1">Be specific — the AI draws concrete examples from this when the chip is active.</p>
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
  </div>
</template>

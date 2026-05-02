<script setup lang="ts">
/**
 * Record Tab — browser-native webcam recording with virtual background
 * and (optional) eye-gaze correction.
 *
 * Phase 2 skeleton: device picker + preview canvas + controls. The ML
 * compositor and MediaRecorder wiring lives in the useRecorderPipeline
 * composable (Phase 3) and sibling segmenter/gaze composables (Phase 4/5).
 */
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { useRecorderPipeline, type BgConfig, type GazeMode } from '@/composables/useRecorderPipeline'
import { useGazeCorrector } from '@/composables/useGazeCorrector'
import { useTeleprompter } from '@/composables/useTeleprompter'
import { GAZE_MODELS, getModel, type GazeModel } from '@/composables/gazeModelCatalog'

const videoEl = ref<HTMLVideoElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)

const background = ref<BgConfig>({ type: 'none' })
// `selectedGazeId` is the catalog row the user picked; pipeline-level
// `gazeMode` is derived from it (catalog rows that aren't browser-runnable
// map to 'off' until their server backend is up).
const selectedGazeId = ref<string>('auto')
// Auto-polish OFF by default — user explicitly picks the backend + clicks Polish.
// Persisted across sessions in localStorage so user can flip it on if they want.
const AUTO_POLISH_KEY = 'neuralyx_auto_polish_on_stop'
const autoPolishUserPref = ref<boolean>(localStorage.getItem(AUTO_POLISH_KEY) === '1')
watch(autoPolishUserPref, (v) => { localStorage.setItem(AUTO_POLISH_KEY, v ? '1' : '0') })

// ─── Big AI Eye Contact ON/OFF toggle (NVIDIA-Maxine-style) ────────────────
// Persisted across sessions. When OFF, both live correction and post-record
// polish are bypassed entirely (raw recording only).
const EYE_CONTACT_KEY = 'neuralyx_eye_contact_on'
const eyeContactOn = ref<boolean>(localStorage.getItem(EYE_CONTACT_KEY) !== '0')
watch(eyeContactOn, (v) => { localStorage.setItem(EYE_CONTACT_KEY, v ? '1' : '0') })

// effectiveAutoPolish drives the actual auto-polish trigger.
// Auto-fires when:
//   (a) user has the explicit autoPolish toggle on, OR
//   (b) user picked a server-side model (wangwilly/sted/maxine) — polish IS the model
const autoPolish = computed<boolean>(() =>
  eyeContactOn.value && (autoPolishUserPref.value || isServerModel.value)
)

// Polish backend — auto-derived from the main model picker (selectedGazeId).
// User picks ONE model in the dashboard; polish automatically uses the right backend.
// Browser-side models fall through to wangwilly as a sane default for the polish step.
type PolishBackend = 'wangwilly' | 'sted_onnx' | 'maxine' | 'maxine_local'

// Map main model id → polish backend slug. Live (browser) models map to wangwilly
// as the default polish target (record raw via browser, polish on server).
function mapModelToPolish(modelId: string): PolishBackend {
  switch (modelId) {
    case 'wangwilly': return 'wangwilly'
    case 'sted': return 'sted_onnx'
    case 'nvidia_maxine_cloud': return 'maxine'
    case 'nvidia_maxine_local': return 'maxine_local'
    default: return 'wangwilly'  // 'auto', 'off', 'custom', 'landmark', 'onnx', 'self_trained' — server polish defaults to wangwilly
  }
}
const polishBackend = computed<PolishBackend>(() => mapModelToPolish(selectedGazeId.value))

// True when the selected model is server-side (and would benefit from polish).
const isServerModel = computed(() => {
  return ['wangwilly', 'sted', 'nvidia_maxine_cloud', 'nvidia_maxine_local'].includes(selectedGazeId.value)
})

// Live availability of each polish backend (probed on mount via /api/gaze/status)
interface SidecarStatus {
  maxine_cloud: { available: boolean }
  maxine_local: { available: boolean; url?: string | null }
  primary?: { loaded: boolean }
  sted?: { loaded: boolean }
}
const backendAvailability = ref({ wangwilly: true, sted_onnx: false, maxine: false, maxine_local: false })
async function probeBackendAvailability() {
  try {
    const r = await fetch(`${MCP_URL}/api/gaze/status`, { signal: AbortSignal.timeout(8000) })
    const data = await r.json() as SidecarStatus
    backendAvailability.value = {
      wangwilly: !!(data.primary?.loaded),
      sted_onnx: !!data.sted?.loaded,
      maxine: !!data.maxine_cloud?.available,
      maxine_local: !!data.maxine_local?.available,
    }
    // If user previously picked a server model that's now unavailable, drop to 'auto'
    if (isServerModel.value && !backendAvailability.value[polishBackend.value]) {
      selectedGazeId.value = 'auto'
    }
  } catch {
    // Sidecar unreachable — leave defaults
  }
}
const gazeMode = computed<GazeMode>(() => {
  if (!eyeContactOn.value) return 'off'  // master toggle wins
  const m = getModel(selectedGazeId.value)
  if (!m) return 'off'
  if (selectedGazeId.value === 'auto') return 'auto'
  if (m.pipelineMode === 'chihfanhsu') return 'off'  // legacy hook
  return m.pipelineMode as GazeMode
})
// Mutation helper since gazeMode is computed but the dropdown still needs
// a writable target — bind the dropdown to selectedGazeId directly.
const gazeStrength = ref(0.85)
const modelsDashboardOpen = ref(false)
const dashboardSelected = ref<GazeModel | null>(null)
function chooseFromDashboard(m: GazeModel) {
  if (m.status === 'ready') { selectedGazeId.value = m.id; modelsDashboardOpen.value = false }
  else { dashboardSelected.value = m }
}
function inspectInDashboard(m: GazeModel) { dashboardSelected.value = m }
// Legacy boolean kept so existing UI bindings still resolve; mirrored from gazeMode.
const gazeCorrection = ref(false)
watch(gazeMode, (m) => { gazeCorrection.value = m !== 'off' }, { immediate: true })
// ONNX path probe — separately reports availability (model presence + WebGL EP)
const gaze = useGazeCorrector()
const onnxAvailable = gaze.available
const bgImagePreview = ref<string | null>(null)
const bgColor = ref('#0a1628')

const pipeline = useRecorderPipeline({
  videoEl, canvasEl, background, gazeCorrection,
  gazeMode, gazeStrength,
})

// Forward convenience refs
const state = pipeline.state
const durationMs = pipeline.durationMs
const error = pipeline.error
const segmenterError = pipeline.segmenterError
const gazeError = pipeline.gazeError
const gazeReady = pipeline.gazeReady
const gazeFaceDetected = pipeline.gazeFaceDetected
const devices = pipeline.devices
const selectedCamera = pipeline.selectedCamera
const selectedMic = pipeline.selectedMic

// Save-record flag (mirrors what was previously a literal in saveRecording)
const gazeActiveAtSave = computed(() => gazeMode.value !== 'off' && (gazeMode.value === 'landmark' ? gazeReady.value : onnxAvailable.value))

// Compare view — show raw camera beside the corrected canvas
const compareMode = ref<'off' | 'split'>('off')
const previewVideoEl = ref<HTMLVideoElement | null>(null)

// Mirror the source stream into the visible "before" video whenever split mode turns on
watch([compareMode, () => state.value], () => {
  const v = previewVideoEl.value
  const srcVideo = videoEl.value
  if (!v) return
  if (compareMode.value === 'split' && srcVideo?.srcObject) {
    if (v.srcObject !== srcVideo.srcObject) v.srcObject = srcVideo.srcObject
    void v.play().catch(() => undefined)
  } else if (v.srcObject) {
    v.srcObject = null
  }
})

// Optional: capture raw camera as a second blob so the post-record preview can
// show real before/after of the same take.
const recordRaw = ref(false)
let rawRecorder: MediaRecorder | null = null
let rawChunks: Blob[] = []
const rawBlob = ref<Blob | null>(null)
const rawUrl = ref<string | null>(null)

function startRawCapture() {
  const src = videoEl.value?.srcObject as MediaStream | null
  if (!src || !recordRaw.value) return
  rawChunks = []
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus' : 'video/webm'
  rawRecorder = new MediaRecorder(src, { mimeType: mime, videoBitsPerSecond: 2_500_000 })
  rawRecorder.ondataavailable = (e) => { if (e.data?.size) rawChunks.push(e.data) }
  rawRecorder.start(1000)
}

async function stopRawCapture() {
  if (!rawRecorder) return
  await new Promise<void>((resolve) => {
    rawRecorder!.onstop = () => {
      const blob = new Blob(rawChunks, { type: rawRecorder!.mimeType || 'video/webm' })
      if (rawUrl.value) URL.revokeObjectURL(rawUrl.value)
      rawBlob.value = blob
      rawUrl.value = URL.createObjectURL(blob)
      resolve()
    }
    try { rawRecorder!.stop() } catch { resolve() }
  })
  rawRecorder = null
}

const recordedBlob = ref<Blob | null>(null)
const recordedUrl = ref<string | null>(null)
const title = ref('')
const saving = ref(false)
const saveError = ref<string | null>(null)
const saved = ref(false)

function setBgType(t: BgConfig['type']) {
  if (t === 'color') background.value = { type: 'color', color: bgColor.value }
  else if (t === 'image') {
    if (bgImagePreview.value) background.value = { type: 'image', url: bgImagePreview.value }
    bgPickerOpen.value = true
  }
  else if (t === 'blur') background.value = { type: 'blur', radiusPx: 14 }
  else background.value = { type: 'none' }
}

function onBgColorChange(e: Event) {
  const c = (e.target as HTMLInputElement).value
  bgColor.value = c
  if (background.value.type === 'color') background.value = { type: 'color', color: c }
}

// Background image library — persisted across sessions via localStorage so
// previously uploaded backgrounds are reusable. Stored as data URLs (small
// ones; larger files use blob URLs for the current session only).
const BG_LIB_KEY = 'neuralyx_bg_library'
const bgPickerOpen = ref(false)
const bgLibrary = ref<string[]>(JSON.parse(localStorage.getItem(BG_LIB_KEY) || '[]'))
function persistBgLib() {
  try { localStorage.setItem(BG_LIB_KEY, JSON.stringify(bgLibrary.value)) } catch { /* quota exceeded */ }
}

async function onBgImage(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  // Read as data URL so we can store in the library
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(f)
  })
  // Skip duplicates
  if (!bgLibrary.value.includes(dataUrl)) {
    bgLibrary.value = [dataUrl, ...bgLibrary.value].slice(0, 24)  // cap to 24 to avoid quota issues
    persistBgLib()
  }
  selectBgFromLibrary(dataUrl)
}

function selectBgFromLibrary(url: string) {
  bgImagePreview.value = url
  background.value = { type: 'image', url }
  bgPickerOpen.value = false
}

function removeFromBgLibrary(url: string) {
  bgLibrary.value = bgLibrary.value.filter((u) => u !== url)
  persistBgLib()
  if (bgImagePreview.value === url) {
    bgImagePreview.value = null
    if (background.value.type === 'image') background.value = { type: 'none' }
  }
}

// ─── Voice-to-text for the Ask Gabriel field ──────────────────────────────
// Captures mic audio, transcribes via local Whisper (preferred) or falls back
// to OpenAI's transcription endpoint if no local whisper is reachable.
const askVoiceRecording = ref(false)
const askVoiceTranscribing = ref(false)
const askVoiceError = ref<string | null>(null)
let askVoiceMR: MediaRecorder | null = null
let askVoiceStream: MediaStream | null = null
let askVoiceChunks: Blob[] = []
const WHISPER_LOCAL_URL = (import.meta.env.VITE_WHISPER_LOCAL_URL as string | undefined) || 'http://localhost:7870'

async function toggleAskVoice() {
  if (askVoiceRecording.value) { stopAskVoice(); return }
  askVoiceError.value = null
  try {
    askVoiceStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    askVoiceChunks = []
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
    askVoiceMR = new MediaRecorder(askVoiceStream, { mimeType: mime })
    askVoiceMR.ondataavailable = (e) => { if (e.data?.size) askVoiceChunks.push(e.data) }
    askVoiceMR.onstop = () => transcribeAskVoice(new Blob(askVoiceChunks, { type: mime }))
    askVoiceMR.start()
    askVoiceRecording.value = true
  } catch (e) {
    askVoiceError.value = e instanceof Error ? e.message : String(e)
  }
}

function stopAskVoice() {
  if (askVoiceMR && askVoiceMR.state !== 'inactive') askVoiceMR.stop()
  if (askVoiceStream) { for (const t of askVoiceStream.getTracks()) t.stop(); askVoiceStream = null }
  askVoiceRecording.value = false
}

async function transcribeAskVoice(blob: Blob) {
  askVoiceTranscribing.value = true
  askVoiceError.value = null
  try {
    const fd = new FormData()
    fd.append('audio', blob, 'question.webm')
    let text = ''
    try {
      // Local Whisper first
      const res = await fetch(`${WHISPER_LOCAL_URL.replace(/\/$/, '')}/transcribe`, { method: 'POST', body: fd, signal: AbortSignal.timeout(30000) })
      if (res.ok) { text = ((await res.json()) as { text?: string }).text || '' }
    } catch { /* fall through to OpenAI */ }
    if (!text) {
      const openaiKey = (import.meta.env.VITE_OPENAI_KEY as string | undefined) || localStorage.getItem('neuralyx_openai_key') || ''
      if (!openaiKey) throw new Error('Local Whisper unreachable and no OpenAI key set.')
      const fd2 = new FormData()
      fd2.append('file', blob, 'question.webm'); fd2.append('model', 'whisper-1')
      const r2 = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: fd2,
      })
      if (!r2.ok) throw new Error(`OpenAI ${r2.status}`)
      text = ((await r2.json()) as { text?: string }).text || ''
    }
    quickQ.value = (quickQ.value ? quickQ.value + ' ' : '') + text.trim()
  } catch (e) {
    askVoiceError.value = e instanceof Error ? e.message : String(e)
  } finally {
    askVoiceTranscribing.value = false
  }
}

async function startPreview() {
  saveError.value = null
  await pipeline.start()
}

async function startRecording() {
  startRawCapture()
  pipeline.startRecording()
}

async function stopAndGetBlob() {
  const [blob] = await Promise.all([pipeline.stop(), stopRawCapture()])
  recordedBlob.value = blob
  if (recordedUrl.value) URL.revokeObjectURL(recordedUrl.value)
  recordedUrl.value = URL.createObjectURL(blob)
  // Auto-polish: kick off the server-side ONNX pass without making the user click
  if (autoPolish.value) {
    void applyGazePolish()
  }
}

function discard() {
  recordedBlob.value = null
  if (recordedUrl.value) { URL.revokeObjectURL(recordedUrl.value); recordedUrl.value = null }
  rawBlob.value = null
  if (rawUrl.value) { URL.revokeObjectURL(rawUrl.value); rawUrl.value = null }
  polishedBlob.value = null
  if (polishedUrl.value) { URL.revokeObjectURL(polishedUrl.value); polishedUrl.value = null }
  polishError.value = null
  polishStats.value = null
  title.value = ''
  saved.value = false
  saveError.value = null
}

// ─── Post-record polish (server-side ONNX pass over the recorded WebM) ───
const polishing = ref(false)
const polishError = ref<string | null>(null)
const polishStats = ref<string | null>(null)
const polishedBlob = ref<Blob | null>(null)
const polishedUrl = ref<string | null>(null)

// Pipeline display state — multi-stage progress so the user sees it's
// actually working (the request is one POST so we time-estimate per stage).
type PolishStage = 'idle' | 'upload' | 'process' | 'encode' | 'done' | 'error'
const polishStage = ref<PolishStage>('idle')
const polishProgressPct = ref(0)
const polishElapsedMs = ref(0)
const polishEtaMs = ref(0)
const polishSectionEl = ref<HTMLElement | null>(null)
let polishTimer: ReturnType<typeof setInterval> | null = null

// Parsed stats from the X-Gaze-Stats response header so we can show
// clean numbers ("94% of frames corrected") instead of raw JSON.
interface PolishStatsParsed {
  model: string
  frames: number
  framesWarped: number
  framesSkipped: number
  warpedPct: number
  elapsedS: number
  throughputFps: number
}
const polishStatsParsed = ref<PolishStatsParsed | null>(null)
function parsePolishStats(raw: string): PolishStatsParsed | null {
  if (!raw) return null
  // Sidecar emits Python-dict-repr style (single quotes); coerce to JSON.
  const json = raw.replace(/'/g, '"')
  try {
    const o = JSON.parse(json) as Record<string, unknown>
    return {
      model: String(o.model ?? 'unknown'),
      frames: Number(o.frames ?? 0),
      framesWarped: Number(o.frames_warped ?? 0),
      framesSkipped: Number(o.frames_skipped ?? 0),
      warpedPct: Number(o.warped_pct ?? 0),
      elapsedS: Number(o.elapsed_s ?? 0),
      throughputFps: Number(o.throughput_fps ?? 0),
    }
  } catch { return null }
}

function estimatePolishMs(): number {
  // Empirical: ~50 ms per frame on CPU single-thread; default 30 fps
  const seconds = (durationMs.value || 5000) / 1000
  return Math.max(3000, Math.round(seconds * 30 * 50))
}

async function applyGazePolish() {
  if (!recordedBlob.value || polishing.value) return
  polishing.value = true
  polishError.value = null
  polishStats.value = null
  polishStatsParsed.value = null
  if (polishedUrl.value) { URL.revokeObjectURL(polishedUrl.value); polishedUrl.value = null }
  polishedBlob.value = null

  // Scroll the polish card into view so user immediately sees the pipeline working
  await nextTick()
  polishSectionEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })

  const eta = estimatePolishMs()
  polishEtaMs.value = eta
  polishElapsedMs.value = 0
  polishStage.value = 'upload'
  polishProgressPct.value = 0

  const startedAt = performance.now()
  if (polishTimer) clearInterval(polishTimer)
  polishTimer = setInterval(() => {
    polishElapsedMs.value = performance.now() - startedAt
    const ratio = Math.min(0.97, polishElapsedMs.value / eta)
    polishProgressPct.value = Math.round(ratio * 100)
    // Move through stages by elapsed%: upload <8 %, process 8-92 %, encode 92-99 %
    if (ratio < 0.08) polishStage.value = 'upload'
    else if (ratio < 0.92) polishStage.value = 'process'
    else polishStage.value = 'encode'
  }, 200)

  try {
    const fd = new FormData()
    fd.append('video', recordedBlob.value, 'take.webm')
    fd.append('backend', polishBackend.value)
    const res = await fetch(`${MCP_URL}/api/gaze/process-video?backend=${encodeURIComponent(polishBackend.value)}`, { method: 'POST', body: fd })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string }
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    const buf = await res.blob()
    polishedBlob.value = buf
    polishedUrl.value = URL.createObjectURL(buf)
    polishStats.value = res.headers.get('X-Gaze-Stats') || ''
    polishStatsParsed.value = parsePolishStats(polishStats.value)
    polishStage.value = 'done'
    polishProgressPct.value = 100
  } catch (e) {
    polishError.value = e instanceof Error ? e.message : String(e)
    polishStage.value = 'error'
  } finally {
    if (polishTimer) { clearInterval(polishTimer); polishTimer = null }
    polishing.value = false
  }
}

function fmtMs(ms: number) {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

function useTransformedTake() {
  if (!polishedBlob.value) return
  // Replace the working take with the polished output for Save / Attach-to-Email
  recordedBlob.value = polishedBlob.value
  if (recordedUrl.value) URL.revokeObjectURL(recordedUrl.value)
  recordedUrl.value = polishedUrl.value
  polishedUrl.value = null
  polishedBlob.value = null
}

const MCP_URL = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'

async function saveRecording() {
  if (!recordedBlob.value) return
  saving.value = true
  saveError.value = null
  try {
    const fd = new FormData()
    fd.append('video', recordedBlob.value, `${title.value || 'recording'}.webm`)
    fd.append('title', title.value || new Date().toISOString())
    fd.append('duration_ms', String(durationMs.value))
    fd.append('size_bytes', String(recordedBlob.value.size))
    fd.append('mime_type', recordedBlob.value.type || 'video/webm')
    fd.append('background_type', background.value.type)
    fd.append('gaze_correction_enabled', String(gazeActiveAtSave.value))
    fd.append('gaze_mode', gazeMode.value)
    const res = await fetch(`${MCP_URL}/api/recordings/upload`, { method: 'POST', body: fd })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || `HTTP ${res.status}`)
    }
    saved.value = true
    showSavedToast.value = true
    await loadLibrary()
    // Auto-fade the toast after 6s; user can also click it
    setTimeout(() => { showSavedToast.value = false }, 6000)
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}

// Floating-toast + library-modal state
const showSavedToast = ref(false)
const libraryModalOpen = ref(false)
function openLibraryModal() {
  showSavedToast.value = false
  libraryModalOpen.value = true
  loadLibrary()
}
function closeLibraryModal() { libraryModalOpen.value = false }
function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

// ─── Teleprompter ─────────────────────────────────────────────────────────
const teleprompter = useTeleprompter()
const promptInner = ref<HTMLDivElement | null>(null)
const promptSourceMsg = ref<string | null>(null)

interface ChatMsg { role: 'user' | 'assistant'; content: string; ts: number }

function readGabrielChatHistory(): ChatMsg[] {
  try { return JSON.parse(localStorage.getItem('neuralyx_gabe_chat') || '[]') } catch { return [] }
}

function pullLatestAnswerFromChat() {
  const history = readGabrielChatHistory()
  const lastAssistant = [...history].reverse().find((m) => m.role === 'assistant')
  if (!lastAssistant) {
    promptSourceMsg.value = 'No Gabriel-AI answer yet. Open the Tools panel → Chat with Gabriel AI, ask something, then come back.'
    return
  }
  teleprompter.script.value = lastAssistant.content
  teleprompter.reset()
  teleprompter.enabled.value = true
  promptSourceMsg.value = `Loaded answer from ${new Date(lastAssistant.ts).toLocaleTimeString()} into the script.`
}

// Live sync: when the popout chat receives a new assistant reply, surface a
// small button to pull it into the teleprompter without re-opening the chat.
let chatBC: BroadcastChannel | null = null
const newAnswerAvailable = ref(false)
onMounted(() => {
  try {
    chatBC = new BroadcastChannel('neuralyx_gabe_chat')
    chatBC.onmessage = (ev) => {
      if (ev.data?.type === 'chat:sync' && Array.isArray(ev.data.messages)) {
        const last = ev.data.messages[ev.data.messages.length - 1]
        if (last?.role === 'assistant') newAnswerAvailable.value = true
      }
    }
  } catch { /* BroadcastChannel unsupported — silent */ }
})
onBeforeUnmount(() => { chatBC?.close() })

// Quick "Ask Gabriel" inline — uses the same OpenAI path as InterviewChatPopout
// so we don't need a new endpoint. Stores the new exchange into the same
// localStorage key so the popout picks it up too.
const quickQ = ref('')
const quickAsking = ref(false)
const quickError = ref<string | null>(null)
async function askGabrielFromTeleprompter() {
  const q = quickQ.value.trim()
  if (!q || quickAsking.value) return
  const openaiKey = (import.meta.env.VITE_OPENAI_KEY as string | undefined)
    || localStorage.getItem('neuralyx_openai_key') || ''
  if (!openaiKey) {
    quickError.value = 'OpenAI key missing. Set it in the main app first.'
    return
  }
  quickAsking.value = true
  quickError.value = null
  try {
    const history = readGabrielChatHistory().slice(-12)
    const next = [...history, { role: 'user' as const, content: q, ts: Date.now() }]
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are Gabriel Alvin Aquino, an AI Systems Engineer. Answer interview questions in first person, concise, conversational, ready to be read aloud as a teleprompter script (~150 words).' },
          ...next.map((m) => ({ role: m.role, content: m.content })),
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as { choices: { message: { content: string } }[] }
    const reply = data.choices[0].message.content.trim()
    const updated = [...next, { role: 'assistant' as const, content: reply, ts: Date.now() }]
    localStorage.setItem('neuralyx_gabe_chat', JSON.stringify(updated.slice(-50)))
    try { chatBC?.postMessage({ type: 'chat:sync', messages: updated }) } catch { /* noop */ }
    teleprompter.script.value = reply
    teleprompter.reset()
    teleprompter.enabled.value = true
    quickQ.value = ''
    promptSourceMsg.value = 'Loaded fresh Gabriel-AI answer into the script.'
    newAnswerAvailable.value = false
  } catch (e) {
    quickError.value = e instanceof Error ? e.message : String(e)
  } finally {
    quickAsking.value = false
  }
}

watch(() => teleprompter.script.value, async () => {
  await nextTick()
  if (promptInner.value) teleprompter.setTotalPx(promptInner.value.scrollHeight)
})

// Drive the teleprompter scroll from rAF — independent of the canvas pump
let promptRAF = 0
function promptLoop(now: number) {
  teleprompter.tick(now)
  promptRAF = requestAnimationFrame(promptLoop)
}
onMounted(() => { promptRAF = requestAnimationFrame(promptLoop) })

// ─── Tools panel (Audio Question + Chat with Gabriel AI while recording) ───
const toolsPanelOpen = ref(false)
const toolsTab = ref<'question' | 'chat'>('question')

// Audio-question recorder — separate MediaRecorder, distinct from the video pipeline
// so it doesn't fight for the camera. Uses mic only; the user can capture an
// interviewer's question (e.g. "tell me about yourself") to listen back / transcribe.
let qMediaRecorder: MediaRecorder | null = null
let qStream: MediaStream | null = null
let qChunks: Blob[] = []
const qRecording = ref(false)
const qBlobUrl = ref<string | null>(null)
const qDurationMs = ref(0)
let qTimer: ReturnType<typeof setInterval> | null = null
let qStartedAt = 0
const qError = ref<string | null>(null)

async function startQuestionRecord() {
  qError.value = null
  if (qBlobUrl.value) { URL.revokeObjectURL(qBlobUrl.value); qBlobUrl.value = null }
  try {
    qStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    })
    qChunks = []
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
    qMediaRecorder = new MediaRecorder(qStream, { mimeType: mime })
    qMediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) qChunks.push(e.data) }
    qMediaRecorder.onstop = () => {
      const blob = new Blob(qChunks, { type: mime })
      if (qBlobUrl.value) URL.revokeObjectURL(qBlobUrl.value)
      qBlobUrl.value = URL.createObjectURL(blob)
      if (qStream) { for (const t of qStream.getTracks()) t.stop(); qStream = null }
    }
    qMediaRecorder.start()
    qRecording.value = true
    qStartedAt = performance.now()
    qDurationMs.value = 0
    qTimer = setInterval(() => { qDurationMs.value = performance.now() - qStartedAt }, 200)
  } catch (e) {
    qError.value = e instanceof Error ? e.message : String(e)
  }
}

function stopQuestionRecord() {
  if (qTimer) { clearInterval(qTimer); qTimer = null }
  if (qMediaRecorder && qMediaRecorder.state !== 'inactive') qMediaRecorder.stop()
  qRecording.value = false
}

function clearQuestion() {
  if (qBlobUrl.value) { URL.revokeObjectURL(qBlobUrl.value); qBlobUrl.value = null }
  qDurationMs.value = 0
}

// Chat with Gabriel — opens the existing /interview-chat route in a popout
// window so the user can chat in parallel without leaving the Record tab.
function openGabrielChat() {
  const w = 540, h = 720
  const left = Math.max(0, window.screenX + window.outerWidth - w - 40)
  const top  = Math.max(0, window.screenY + 80)
  window.open('/interview-chat', 'gabriel-chat', `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`)
}

// ─── Library ───────────────────────────────────────────────────────────────
interface LibraryRow {
  id: string
  title: string
  duration_ms: number
  size_bytes: number
  mime_type: string
  storage_path: string
  thumbnail_path: string | null
  signed_url?: string
  thumbnail_url?: string
  created_at: string
  background_type: string
  gaze_correction_enabled: boolean
}
const library = ref<LibraryRow[]>([])
const libraryLoading = ref(false)
const libraryError = ref<string | null>(null)

async function loadLibrary() {
  libraryLoading.value = true
  libraryError.value = null
  try {
    const res = await fetch(`${MCP_URL}/api/recordings`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    library.value = Array.isArray(data?.recordings) ? data.recordings : []
  } catch (e) {
    libraryError.value = e instanceof Error ? e.message : String(e)
  } finally {
    libraryLoading.value = false
  }
}

async function deleteRecording(id: string) {
  if (!confirm('Delete this recording? This cannot be undone.')) return
  try {
    const res = await fetch(`${MCP_URL}/api/recordings/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    await loadLibrary()
  } catch (e) {
    libraryError.value = e instanceof Error ? e.message : String(e)
  }
}

// Attach-to-email modal
const emailModal = ref<{ open: boolean, recordingId: string | null }>({ open: false, recordingId: null })
const emailForm = ref({ to: '', recipientName: '', jobTitle: '', company: '', question: '', script: '' })
const emailSending = ref(false)
const emailResult = ref<string | null>(null)

function openEmailModal(id: string) {
  emailModal.value = { open: true, recordingId: id }
  emailResult.value = null
}
function closeEmailModal() { emailModal.value = { open: false, recordingId: null } }

async function sendEmail() {
  if (!emailModal.value.recordingId) return
  emailSending.value = true
  emailResult.value = null
  try {
    const res = await fetch(`${MCP_URL}/api/recordings/${emailModal.value.recordingId}/attach-to-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailForm.value),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
    emailResult.value = `✓ Sent — ${data?.messageId || 'ok'}`
    setTimeout(closeEmailModal, 1500)
  } catch (e) {
    emailResult.value = `✗ ${e instanceof Error ? e.message : String(e)}`
  } finally {
    emailSending.value = false
  }
}

// Chromium-only feature detection for the recording pipeline
const chromiumSupported = computed(() => typeof (HTMLVideoElement.prototype as any).requestVideoFrameCallback === 'function')

function fmtDuration(ms: number) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${m}:${String(ss).padStart(2, '0')}`
}
function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

onMounted(() => {
  loadLibrary()
  // Probe ONNX model so the gaze toggle reflects real availability
  void gaze.init()
  // Probe sidecar polish backends — surfaces availability badges
  void probeBackendAvailability()
})
onBeforeUnmount(() => {
  if (recordedUrl.value) URL.revokeObjectURL(recordedUrl.value)
  if (rawUrl.value) URL.revokeObjectURL(rawUrl.value)
  if (bgImagePreview.value) URL.revokeObjectURL(bgImagePreview.value)
  if (qBlobUrl.value) URL.revokeObjectURL(qBlobUrl.value)
  if (qStream) { for (const t of qStream.getTracks()) t.stop(); qStream = null }
  if (qTimer) { clearInterval(qTimer); qTimer = null }
  if (rawRecorder && rawRecorder.state !== 'inactive') { try { rawRecorder.stop() } catch {/* ignore */} }
  if (promptRAF) cancelAnimationFrame(promptRAF)
  pipeline.stop().catch(() => null)
})
</script>

<template>
  <div>
    <!-- Browser-support banner -->
    <div v-if="!chromiumSupported"
      class="mb-4 p-4 rounded-xl border border-yellow-500/40 bg-yellow-500/10 text-yellow-200 text-sm">
      ⚠ The Record tab needs Chromium or Edge (uses <code class="font-mono text-xs">requestVideoFrameCallback</code>).
      Firefox/Safari aren't supported in this build.
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <!-- LEFT — stage + controls -->
      <div class="lg:col-span-2 space-y-4">
        <!-- Big AI Eye Contact ON/OFF toggle (NVIDIA-Maxine-style) -->
        <div class="rounded-xl border p-4 transition-colors"
          :class="eyeContactOn ? 'border-green-500/50 bg-green-500/10' : 'border-neural-700 bg-neural-800/60'">
          <div class="flex items-center gap-4">
            <div class="text-3xl">🎯</div>
            <div class="flex-1 min-w-0">
              <div class="text-base font-bold text-white">AI Eye Contact</div>
              <div class="text-[11px] text-gray-300 mt-0.5">
                <span v-if="eyeContactOn">Live preview: Custom warp · Polish on stop: WangWilly model (server)</span>
                <span v-else>Recording raw — no gaze redirection applied</span>
              </div>
            </div>
            <button @click="eyeContactOn = !eyeContactOn"
              class="relative w-20 h-9 rounded-full transition-colors flex-shrink-0"
              :class="eyeContactOn ? 'bg-green-500' : 'bg-neural-700 border border-neural-600'">
              <span class="absolute top-1 transition-all w-7 h-7 rounded-full bg-white shadow"
                :class="eyeContactOn ? 'left-12' : 'left-1'"></span>
              <span class="absolute inset-0 flex items-center justify-start pl-3 text-[10px] font-bold text-white"
                :class="eyeContactOn ? 'opacity-100' : 'opacity-0'">ON</span>
              <span class="absolute inset-0 flex items-center justify-end pr-3 text-[10px] font-bold text-gray-400"
                :class="eyeContactOn ? 'opacity-0' : 'opacity-100'">OFF</span>
            </button>
          </div>
        </div>

        <!-- Preview stage — single canvas, OR side-by-side Before / After -->
        <div :class="compareMode === 'split' ? 'grid grid-cols-2 gap-2' : ''">
          <!-- BEFORE (raw camera) — only rendered in split mode -->
          <div v-if="compareMode === 'split'"
            class="relative rounded-xl border border-neural-700 bg-black overflow-hidden aspect-video">
            <video ref="previewVideoEl" class="w-full h-full object-cover" autoplay muted playsinline></video>
            <div class="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] font-bold text-white tracking-wider">BEFORE · raw</div>
          </div>

          <!-- AFTER (composited canvas — what we record) -->
          <div class="relative rounded-xl border border-neural-700 bg-black overflow-hidden aspect-video">
            <video ref="videoEl" class="hidden" autoplay muted playsinline></video>
            <canvas ref="canvasEl" class="w-full h-full"></canvas>

            <!-- Teleprompter overlay — sits OVER the canvas (not painted into it),
                 positioned just under the camera lens line so user looks at lens
                 while reading. Floating words don't end up in the saved video. -->
            <div v-if="teleprompter.enabled.value"
              class="absolute inset-x-0 top-0 max-h-[55%] overflow-hidden pointer-events-none"
              style="background: linear-gradient(180deg, rgba(0,0,0,0.7), rgba(0,0,0,0.0));">
              <div class="px-6 pt-4 pb-8" :style="{ transform: `translateY(${-teleprompter.offsetPx.value}px)` }">
                <div ref="promptInner"
                  :style="{ fontSize: teleprompter.fontPx.value + 'px', lineHeight: 1.35, transform: teleprompter.mirror.value ? 'scaleX(-1)' : 'none' }"
                  class="font-semibold text-white whitespace-pre-wrap drop-shadow-lg">
                  {{ teleprompter.script.value || 'Paste your script in the Teleprompter panel below…' }}
                </div>
              </div>
              <!-- progress bar -->
              <div class="absolute bottom-0 inset-x-0 h-1 bg-black/40">
                <div class="h-full bg-cyber-cyan transition-[width] duration-100"
                  :style="{ width: `${Math.round(teleprompter.progress.value * 100)}%` }"></div>
              </div>
            </div>
            <div v-if="compareMode === 'split'"
              class="absolute top-2 left-2 px-2 py-0.5 rounded bg-cyber-cyan/90 text-[10px] font-bold text-black tracking-wider">AFTER · {{ gazeMode === 'off' ? 'no gaze' : gazeMode }}</div>

            <!-- idle overlay -->
            <div v-if="state === 'idle'" class="absolute inset-0 flex flex-col items-center justify-center text-gray-500 text-sm">
              <div class="text-5xl mb-3">📷</div>
              <div>Click <span class="text-white font-semibold">Start Camera</span> to preview</div>
            </div>
            <!-- error overlay -->
            <div v-if="error" class="absolute inset-0 flex items-center justify-center bg-black/80 text-red-300 text-sm p-6 text-center">
              {{ error }}
            </div>
            <!-- live indicator -->
            <div v-if="state === 'recording'" class="absolute top-3 right-3 flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/90 text-white text-xs font-bold">
              <span class="w-2 h-2 rounded-full bg-white animate-pulse"></span>
              REC
              <span class="font-mono ml-1">{{ fmtDuration(durationMs) }}</span>
            </div>
          </div>
        </div>

        <!-- Compare toggle + raw-recording opt-in -->
        <div class="flex flex-wrap items-center gap-3 text-xs">
          <button @click="compareMode = compareMode === 'split' ? 'off' : 'split'"
            class="px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5"
            :class="compareMode === 'split'
              ? 'bg-cyber-cyan/20 border-cyber-cyan text-white'
              : 'bg-neural-700 border-neural-600 text-gray-300 hover:text-white'">
            <span>⇆</span>
            {{ compareMode === 'split' ? 'Hide before/after' : 'Show before/after' }}
          </button>
          <label class="flex items-center gap-1.5 cursor-pointer text-gray-400 hover:text-white">
            <input type="checkbox" v-model="recordRaw" :disabled="state === 'recording'" class="accent-cyber-cyan" />
            Also record original (saves a second blob for side-by-side review)
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer text-gray-400 hover:text-white">
            <input type="checkbox" v-model="autoPolishUserPref" :disabled="state === 'recording' || !eyeContactOn" class="accent-cyber-purple" />
            ✨ Auto-polish on stop (server-side WangWilly pass)
          </label>
        </div>

        <!-- Segmenter status banner — surfaces silent failures of the background pipeline -->
        <div v-if="segmenterError"
          class="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-2.5 text-[11px] text-yellow-200">
          ⚠ {{ segmenterError }} — recording still works, just without virtual background.
        </div>

        <!-- Transport -->
        <div class="flex items-center gap-3 flex-wrap">
          <button v-if="state === 'idle' || state === 'stopped'"
            @click="startPreview"
            :disabled="!chromiumSupported"
            class="px-5 py-2.5 rounded-lg bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white text-sm font-bold hover:opacity-90 disabled:opacity-40 flex items-center gap-2">
            <span>🎥</span> Start Camera
          </button>
          <button v-if="state === 'preview'"
            @click="startRecording"
            class="px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold flex items-center gap-2">
            <span>⏺</span> Record
          </button>
          <button v-if="state === 'recording'"
            @click="stopAndGetBlob"
            class="px-5 py-2.5 rounded-lg bg-neural-700 border border-neural-600 text-white text-sm font-bold hover:bg-neural-600 flex items-center gap-2">
            <span>⏹</span> Stop
          </button>
          <button v-if="state !== 'idle'"
            @click="pipeline.stop().then(() => { recordedBlob = null })"
            class="px-4 py-2.5 rounded-lg border border-neural-600 text-gray-400 text-sm hover:text-white hover:border-neural-500">
            Reset
          </button>
        </div>

        <!-- Post-record preview -->
        <div v-if="recordedBlob && recordedUrl" class="rounded-xl border border-cyber-cyan/40 bg-cyber-cyan/5 p-4 space-y-3">
          <div class="text-sm font-semibold text-white">
            Recording ready — {{ fmtDuration(durationMs) }} · {{ fmtSize(recordedBlob.size) }}
            <span v-if="rawBlob" class="text-[11px] text-gray-400 font-normal ml-2">+ original ({{ fmtSize(rawBlob.size) }})</span>
          </div>
          <div :class="rawUrl ? 'grid grid-cols-1 md:grid-cols-2 gap-2' : ''">
            <div v-if="rawUrl" class="space-y-1">
              <div class="text-[10px] font-bold tracking-wider text-gray-400">BEFORE — raw camera</div>
              <video :src="rawUrl" controls class="w-full rounded-lg bg-black"></video>
            </div>
            <div class="space-y-1">
              <div class="text-[10px] font-bold tracking-wider text-cyber-cyan">AFTER — saved take</div>
              <video :src="recordedUrl" controls class="w-full rounded-lg bg-black"></video>
            </div>
          </div>
          <!-- Post-process polish — backend auto-derived from your model pick at top of page -->
          <div ref="polishSectionEl" class="rounded-lg border border-neural-700 bg-neural-900/50 p-3 space-y-3">
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="text-xs font-bold text-white flex items-center gap-1.5 flex-wrap">
                  <span>✨ Polish with</span>
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-bold"
                    :class="polishBackend === 'wangwilly' ? 'bg-cyber-cyan/15 text-cyber-cyan border border-cyber-cyan/40' : ''">
                    <template v-if="polishBackend === 'wangwilly'">🏠 WangWilly</template>
                    <template v-else-if="polishBackend === 'sted_onnx'">🧠 STED-Gaze</template>
                    <template v-else-if="polishBackend === 'maxine'">☁️ Maxine cloud</template>
                    <template v-else-if="polishBackend === 'maxine_local'">⚡ Maxine local</template>
                  </span>
                </div>
                <div class="text-[10px] text-gray-400">
                  <template v-if="isServerModel">Driven by your model pick — change at top of page to switch backends.</template>
                  <template v-else>Live model recorded raw; polish runs WangWilly by default. Change model at top to use STED / Maxine.</template>
                </div>
                <div v-if="!backendAvailability[polishBackend]" class="text-[10px] text-yellow-300 mt-1">
                  ⚠ {{ polishBackend }} not loaded by sidecar — see /api/gaze/status
                </div>
              </div>
              <button @click="applyGazePolish" :disabled="polishing || !backendAvailability[polishBackend]"
                class="shrink-0 px-3 py-1.5 rounded bg-cyber-purple hover:bg-cyber-purple/80 text-white text-xs font-bold disabled:opacity-50">
                {{ polishing ? 'Processing…' : polishStage === 'done' ? '↻ Re-polish' : '✨ Polish' }}
              </button>
            </div>
            </div>

            <!-- Pipeline stage display -->
            <div v-if="polishStage !== 'idle'" class="space-y-2">
              <div class="grid grid-cols-4 gap-1.5 text-[10px]">
                <div v-for="(s, idx) in [
                  { id: 'upload',  label: 'Upload',   icon: '⤴' },
                  { id: 'process', label: 'Detect+Warp', icon: '👁' },
                  { id: 'encode',  label: 'Encode MP4',  icon: '🎬' },
                  { id: 'done',    label: 'Ready',       icon: '✓' },
                ]" :key="s.id"
                  class="rounded p-2 text-center transition-colors"
                  :class="polishStage === 'error'
                    ? 'bg-red-500/10 text-red-300 border border-red-500/30'
                    : polishStage === s.id
                    ? 'bg-cyber-cyan/20 text-cyber-cyan border border-cyber-cyan/50 animate-pulse'
                    : (['upload','process','encode','done'].indexOf(polishStage) > idx
                       || polishStage === 'done')
                    ? 'bg-green-500/10 text-green-300 border border-green-500/30'
                    : 'bg-neural-800 text-gray-500 border border-neural-700'">
                  <div class="text-base">{{ s.icon }}</div>
                  <div class="font-bold mt-0.5">{{ s.label }}</div>
                </div>
              </div>

              <!-- Progress bar -->
              <div class="space-y-1">
                <div class="flex items-center justify-between text-[10px] text-gray-400 font-mono">
                  <span>{{ polishStage === 'done' ? 'Ready ✓' : polishStage === 'error' ? 'Failed ✕' : `${polishProgressPct}%` }}</span>
                  <span>elapsed {{ fmtMs(polishElapsedMs) }} · est. total {{ fmtMs(polishEtaMs) }}</span>
                </div>
                <div class="h-2 bg-neural-800 rounded-full overflow-hidden">
                  <div class="h-full transition-all duration-200"
                    :class="polishStage === 'error'
                      ? 'bg-red-500'
                      : polishStage === 'done'
                      ? 'bg-green-500'
                      : 'bg-gradient-to-r from-cyber-purple to-cyber-cyan'"
                    :style="{ width: polishStage === 'done' ? '100%' : `${polishProgressPct}%` }"></div>
                </div>
              </div>
            </div>

            <div v-if="polishError" class="rounded border border-red-500/40 bg-red-500/10 p-2 text-[11px] text-red-300">
              <div class="font-bold mb-0.5">Polish failed</div>
              <div class="font-mono break-all">{{ polishError }}</div>
            </div>

            <div v-if="polishedUrl" class="space-y-2">
              <div class="text-[10px] text-cyber-cyan font-bold tracking-wider">✓ POLISHED RESULT</div>
              <video :src="polishedUrl" controls class="w-full rounded bg-black"></video>
              <!-- Parsed stats card (clean numbers from X-Gaze-Stats header) -->
              <div v-if="polishStatsParsed" class="rounded border border-neural-700 bg-neural-900/70 p-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                <div>
                  <div class="text-gray-500 uppercase tracking-wider text-[9px] font-bold">Model</div>
                  <div class="text-white font-mono">{{ polishStatsParsed.model }}</div>
                </div>
                <div>
                  <div class="text-gray-500 uppercase tracking-wider text-[9px] font-bold">Frames corrected</div>
                  <div class="font-mono"
                    :class="polishStatsParsed.warpedPct > 70 ? 'text-green-300' : polishStatsParsed.warpedPct > 30 ? 'text-yellow-300' : 'text-red-300'">
                    {{ polishStatsParsed.framesWarped }} / {{ polishStatsParsed.frames }} ({{ polishStatsParsed.warpedPct }}%)
                  </div>
                </div>
                <div>
                  <div class="text-gray-500 uppercase tracking-wider text-[9px] font-bold">Skipped</div>
                  <div class="text-gray-300 font-mono">{{ polishStatsParsed.framesSkipped }} <span class="text-[9px] text-gray-500">(off-axis / no face)</span></div>
                </div>
                <div>
                  <div class="text-gray-500 uppercase tracking-wider text-[9px] font-bold">Time</div>
                  <div class="text-gray-300 font-mono">{{ polishStatsParsed.elapsedS }}s · {{ polishStatsParsed.throughputFps }}fps</div>
                </div>
              </div>
              <div v-else-if="polishStats" class="text-[10px] text-gray-400 font-mono break-all">{{ polishStats }}</div>
              <button @click="useTransformedTake"
                class="w-full px-3 py-1.5 rounded bg-cyber-cyan text-black text-xs font-bold">↪ Use polished take (replaces the working file)</button>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <input v-model="title" placeholder="Title (optional)"
              class="flex-1 px-3 py-2 rounded-lg bg-neural-800 border border-neural-600 text-white text-sm focus:border-cyber-cyan focus:outline-none" />
            <button @click="saveRecording" :disabled="saving"
              class="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-bold disabled:opacity-50">
              {{ saving ? 'Saving…' : saved ? '✓ Saved' : 'Save' }}
            </button>
            <button @click="discard" class="px-3 py-2 rounded-lg border border-neural-600 text-gray-400 text-sm hover:text-red-300 hover:border-red-500/50">Discard</button>
          </div>
          <div v-if="saveError" class="text-xs text-red-300">{{ saveError }}</div>
        </div>
      </div>

      <!-- RIGHT — controls + library -->
      <div class="space-y-4">
        <!-- Device picker -->
        <div class="rounded-xl border border-neural-700 bg-neural-800/60 p-4 space-y-3">
          <h3 class="text-sm font-bold text-white">Devices</h3>
          <div>
            <label class="text-[11px] text-gray-400 mb-1 block">Camera</label>
            <select v-model="selectedCamera"
              class="w-full px-2 py-1.5 rounded bg-neural-700 border border-neural-600 text-white text-xs">
              <option v-for="d in devices.cameras" :key="d.deviceId" :value="d.deviceId">{{ d.label || 'Camera' }}</option>
            </select>
          </div>
          <div>
            <label class="text-[11px] text-gray-400 mb-1 block">Microphone</label>
            <select v-model="selectedMic"
              class="w-full px-2 py-1.5 rounded bg-neural-700 border border-neural-600 text-white text-xs">
              <option v-for="d in devices.mics" :key="d.deviceId" :value="d.deviceId">{{ d.label || 'Microphone' }}</option>
            </select>
          </div>
        </div>

        <!-- Background -->
        <div class="rounded-xl border border-neural-700 bg-neural-800/60 p-4 space-y-3">
          <h3 class="text-sm font-bold text-white">Virtual background</h3>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <button @click="setBgType('none')"
              :class="background.type === 'none' ? 'bg-cyber-cyan/20 border-cyber-cyan text-white' : 'bg-neural-700 border-neural-600 text-gray-300'"
              class="px-2 py-1.5 rounded border font-semibold">None</button>
            <button @click="setBgType('blur')"
              :class="background.type === 'blur' ? 'bg-cyber-cyan/20 border-cyber-cyan text-white' : 'bg-neural-700 border-neural-600 text-gray-300'"
              class="px-2 py-1.5 rounded border font-semibold">Blur</button>
            <button @click="setBgType('color')"
              :class="background.type === 'color' ? 'bg-cyber-cyan/20 border-cyber-cyan text-white' : 'bg-neural-700 border-neural-600 text-gray-300'"
              class="px-2 py-1.5 rounded border font-semibold">Color</button>
            <button @click="setBgType('image')"
              :class="background.type === 'image' ? 'bg-cyber-cyan/20 border-cyber-cyan text-white' : 'bg-neural-700 border-neural-600 text-gray-300'"
              class="px-2 py-1.5 rounded border font-semibold hover:border-neural-500">Image</button>
          </div>
          <div v-if="background.type === 'color'" class="flex items-center gap-2">
            <input type="color" :value="bgColor" @change="onBgColorChange" class="w-10 h-9 rounded border border-neural-600 bg-neural-700 cursor-pointer" />
            <span class="text-[11px] text-gray-400 font-mono">{{ bgColor }}</span>
          </div>
          <div v-if="background.type === 'image' && bgImagePreview" class="relative">
            <img :src="bgImagePreview" class="w-full h-20 object-cover rounded border border-neural-600" />
          </div>
        </div>

        <!-- Teleprompter -->
        <div class="rounded-xl border border-neural-700 bg-neural-800/60 p-4 space-y-2.5">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-white">Teleprompter</h3>
            <label class="text-[11px] text-gray-400 flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" v-model="teleprompter.enabled.value" class="accent-cyber-cyan" />
              Show overlay
            </label>
          </div>
          <textarea v-model="teleprompter.script.value"
            placeholder="Paste your script here. It scrolls right under the camera so you read while looking AT the lens."
            rows="4"
            class="w-full px-2 py-1.5 rounded bg-neural-700 border border-neural-600 text-white text-xs leading-relaxed focus:border-cyber-cyan focus:outline-none"></textarea>
          <div class="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <label class="text-gray-400 mb-0.5 block">Font size · {{ teleprompter.fontPx.value }}px</label>
              <input type="range" min="18" max="64" step="2" v-model.number="teleprompter.fontPx.value" class="w-full accent-cyber-cyan" />
            </div>
            <div>
              <label class="text-gray-400 mb-0.5 block">Speed · {{ teleprompter.speedPxPerSec.value }} px/s</label>
              <input type="range" min="10" max="160" step="5" v-model.number="teleprompter.speedPxPerSec.value" class="w-full accent-cyber-cyan" />
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <button @click="teleprompter.paused.value ? teleprompter.start() : teleprompter.pause()"
              :disabled="!teleprompter.enabled.value"
              class="flex-1 px-2 py-1.5 rounded bg-neural-700 hover:bg-neural-600 border border-neural-600 text-white text-xs font-bold disabled:opacity-50">
              {{ teleprompter.paused.value ? '▶ Play' : '⏸ Pause' }}
            </button>
            <button @click="teleprompter.reset()"
              :disabled="!teleprompter.enabled.value"
              class="px-2 py-1.5 rounded bg-neural-700 hover:bg-neural-600 border border-neural-600 text-white text-xs disabled:opacity-50">↺ Reset</button>
            <label class="px-2 py-1.5 rounded border border-neural-600 text-[11px] text-gray-300 cursor-pointer flex items-center gap-1">
              <input type="checkbox" v-model="teleprompter.mirror.value" class="accent-cyber-cyan" />
              Mirror
            </label>
          </div>
          <p class="text-[10px] text-gray-500">
            Overlay sits ON the preview but is NOT recorded — only your camera + effects are saved.
          </p>

          <!-- AI script source -->
          <div class="border-t border-neural-700/70 pt-3 space-y-2">
            <div class="text-[11px] font-bold text-cyber-cyan uppercase tracking-wider">Generate script with Gabriel AI</div>
            <div class="flex items-center gap-1.5">
              <input v-model="quickQ" :disabled="quickAsking || askVoiceTranscribing"
                @keyup.enter="askGabrielFromTeleprompter"
                :placeholder="askVoiceRecording ? 'Listening… click 🎙 to stop' : askVoiceTranscribing ? 'Transcribing…' : 'e.g. \'Tell me about yourself\''"
                class="flex-1 px-2 py-1.5 rounded bg-neural-700 border border-neural-600 text-white text-xs focus:border-cyber-cyan focus:outline-none" />
              <button @click="toggleAskVoice" :disabled="quickAsking || askVoiceTranscribing"
                :class="askVoiceRecording ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-neural-700 hover:bg-neural-600 border border-neural-600 text-cyber-cyan'"
                class="px-2 py-1.5 rounded text-xs font-bold disabled:opacity-50"
                :title="askVoiceRecording ? 'Stop and transcribe' : 'Speak your question — mic input → Whisper transcription'">
                {{ askVoiceRecording ? '⏹' : askVoiceTranscribing ? '⟳' : '🎙' }}
              </button>
              <button @click="askGabrielFromTeleprompter" :disabled="!quickQ.trim() || quickAsking || askVoiceTranscribing"
                class="px-3 py-1.5 rounded bg-cyber-cyan text-black text-xs font-bold disabled:opacity-50">
                {{ quickAsking ? '…' : 'Ask' }}
              </button>
            </div>
            <div v-if="askVoiceError" class="text-[11px] text-red-300">{{ askVoiceError }}</div>
            <div class="flex items-center gap-1.5">
              <button @click="pullLatestAnswerFromChat"
                class="flex-1 px-2 py-1.5 rounded bg-neural-700 border border-neural-600 hover:border-cyber-cyan/60 text-white text-[11px] flex items-center justify-center gap-1.5">
                <span>📥</span> Use last Chat-with-Gabriel answer
                <span v-if="newAnswerAvailable" class="ml-1 px-1.5 py-0 rounded-full bg-green-500/30 text-green-300 text-[9px] font-mono">NEW</span>
              </button>
            </div>
            <div v-if="quickError" class="text-[11px] text-red-300">{{ quickError }}</div>
            <div v-if="promptSourceMsg && !quickError" class="text-[11px] text-green-300">{{ promptSourceMsg }}</div>
            <p class="text-[10px] text-gray-500">
              Same Gabriel-AI engine the chat popout uses. Answer is also stored in your chat history so it stays in sync.
            </p>
          </div>
        </div>

        <!-- Gaze correction — catalog-driven model picker -->
        <div class="rounded-xl border border-neural-700 bg-neural-800/60 p-4 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-white">AI eye-contact correction</h3>
            <span v-if="selectedGazeId !== 'off'"
              class="text-[10px] font-mono px-2 py-0.5 rounded-full"
              :class="((selectedGazeId === 'landmark' || selectedGazeId === 'custom') ? gazeReady
                       : selectedGazeId === 'onnx' ? onnxAvailable
                       : false)
                ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'">
              {{ ((selectedGazeId === 'landmark' || selectedGazeId === 'custom') ? gazeReady
                  : selectedGazeId === 'onnx' ? onnxAvailable
                  : false) ? 'active' : 'loading…' }}
            </span>
          </div>
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-[11px] text-gray-400">Model</label>
              <button @click="modelsDashboardOpen = true; inspectInDashboard(getModel(selectedGazeId)!)"
                class="text-[10px] font-bold text-cyber-cyan hover:underline"
                title="Open the AI Models Dashboard with this model selected">Manage in dashboard →</button>
            </div>
            <select v-model="selectedGazeId"
              class="w-full px-2 py-1.5 rounded bg-neural-700 border border-neural-600 text-white text-xs">
              <optgroup label="✓ Ready now">
                <option v-for="m in GAZE_MODELS.filter(x => x.status === 'ready')"
                  :key="m.id" :value="m.id">{{ m.label }}</option>
              </optgroup>
              <optgroup label="⚙ Needs setup">
                <option v-for="m in GAZE_MODELS.filter(x => x.status === 'config')"
                  :key="m.id" :value="m.id">{{ m.label }}</option>
              </optgroup>
              <optgroup label="🔮 Future / research">
                <option v-for="m in GAZE_MODELS.filter(x => x.status === 'future')"
                  :key="m.id" :value="m.id">{{ m.label }}</option>
              </optgroup>
            </select>
          </div>
          <div v-if="gazeMode === 'landmark' || gazeMode === 'custom'">
            <label class="text-[11px] text-gray-400 mb-1 block flex items-center justify-between">
              <span>Strength</span>
              <span class="font-mono">{{ Math.round(gazeStrength * 100) }}%</span>
            </label>
            <input type="range" min="0" max="1" step="0.05" v-model.number="gazeStrength" class="w-full accent-cyber-cyan" />
          </div>
          <p class="text-[10px] text-gray-500 leading-relaxed">{{ getModel(selectedGazeId)?.short }}</p>
          <div v-if="gazeError && (gazeMode === 'landmark' || gazeMode === 'custom')" class="text-[11px] text-red-300">{{ gazeError }}</div>
          <div v-if="gazeMode === 'custom' && gazeReady" class="text-[11px] flex items-center gap-1.5"
               :class="gazeFaceDetected ? 'text-green-300' : 'text-yellow-300'">
            <span class="w-1.5 h-1.5 rounded-full" :class="gazeFaceDetected ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'"></span>
            <span v-if="gazeFaceDetected">Face detected — gaze warp firing each frame.</span>
            <span v-else>No face in frame — warp idle. Look toward the camera so FaceMesh can lock on.</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Floating "Tools" button (bottom-left). Click → side panel. -->
    <button @click="toolsPanelOpen = !toolsPanelOpen"
      class="fixed bottom-6 left-6 z-40 px-4 py-3 rounded-full bg-neural-800 border border-cyber-purple/50 text-white text-sm font-bold shadow-lg hover:scale-105 transition-transform flex items-center gap-2">
      <span>🛠</span>
      <span>{{ toolsPanelOpen ? 'Close Tools' : 'Tools' }}</span>
    </button>

    <!-- Tools side panel — Audio Question + Chat with Gabriel AI -->
    <div v-if="toolsPanelOpen"
      class="fixed bottom-24 left-6 z-40 w-96 max-w-[calc(100vw-3rem)] rounded-2xl border border-neural-600 bg-neural-900/95 backdrop-blur-md shadow-2xl overflow-hidden">
      <!-- Header tabs -->
      <div class="flex border-b border-neural-700">
        <button @click="toolsTab = 'question'"
          class="flex-1 px-4 py-3 text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
          :class="toolsTab === 'question' ? 'text-white bg-neural-800/80' : 'text-gray-400 hover:text-white'">
          <span>🎙️</span> Audio Question
        </button>
        <button @click="toolsTab = 'chat'"
          class="flex-1 px-4 py-3 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 border-l border-neural-700"
          :class="toolsTab === 'chat' ? 'text-white bg-neural-800/80' : 'text-gray-400 hover:text-white'">
          <span>💬</span> Chat with Gabriel AI
        </button>
      </div>

      <!-- Question tab -->
      <div v-if="toolsTab === 'question'" class="p-4 space-y-3">
        <p class="text-[11px] text-gray-400">Capture the interviewer's question on a separate mic stream so you can replay it while answering on video.</p>
        <div class="flex items-center gap-2">
          <button v-if="!qRecording"
            @click="startQuestionRecord"
            class="flex-1 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center justify-center gap-1.5">
            <span>⏺</span> Record Question
          </button>
          <button v-else
            @click="stopQuestionRecord"
            class="flex-1 px-3 py-2 rounded-lg bg-neural-700 border border-neural-600 hover:bg-neural-600 text-white text-xs font-bold flex items-center justify-center gap-1.5">
            <span>⏹</span> Stop
            <span class="font-mono">{{ fmtDuration(qDurationMs) }}</span>
          </button>
          <button v-if="qBlobUrl" @click="clearQuestion"
            class="px-3 py-2 rounded-lg border border-neural-600 text-gray-400 text-xs hover:text-red-300 hover:border-red-500/50">Clear</button>
        </div>
        <div v-if="qError" class="text-[11px] text-red-300">{{ qError }}</div>
        <div v-if="qBlobUrl" class="rounded-lg border border-neural-700 bg-neural-800/60 p-3 space-y-2">
          <div class="text-[11px] text-gray-400 font-semibold">Captured · {{ fmtDuration(qDurationMs) }}</div>
          <audio :src="qBlobUrl" controls class="w-full" />
          <a :href="qBlobUrl" :download="`question-${Date.now()}.webm`"
            class="inline-block text-[11px] text-cyber-cyan hover:underline">Download .webm</a>
        </div>
      </div>

      <!-- Chat tab -->
      <div v-if="toolsTab === 'chat'" class="p-4 space-y-3">
        <p class="text-[11px] text-gray-400">Open the Gabriel AI chat in a side popout — it stays on top while you record so you can practice or pull answer ideas live.</p>
        <button @click="openGabrielChat"
          class="w-full px-3 py-2 rounded-lg bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white text-xs font-bold hover:opacity-90 flex items-center justify-center gap-1.5">
          <span>💬</span> Open Gabriel AI (popout)
        </button>
        <p class="text-[10px] text-gray-500 leading-relaxed">
          The popout is the same chat at <code class="font-mono text-[10px]">/interview-chat</code> — anything you type is answered as Gabriel using his portfolio context.
        </p>
      </div>
    </div>

    <!-- Floating "My Library" button (bottom-right). Click → large modal. -->
    <button @click="openLibraryModal"
      class="fixed bottom-6 right-6 z-40 px-4 py-3 rounded-full bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white text-sm font-bold shadow-lg hover:scale-105 transition-transform flex items-center gap-2">
      <span>📁</span>
      <span>My Library</span>
      <span v-if="library.length" class="ml-1 px-1.5 py-0.5 rounded-full bg-black/30 text-[10px] font-mono">{{ library.length }}</span>
    </button>

    <!-- Save-success floating toast — click opens modal -->
    <div v-if="showSavedToast"
      @click="openLibraryModal"
      class="fixed bottom-24 right-6 z-50 max-w-sm cursor-pointer rounded-xl border border-green-400/40 bg-green-500/15 backdrop-blur-md p-4 shadow-2xl hover:bg-green-500/25 transition-all">
      <div class="flex items-start gap-3">
        <div class="text-2xl">✓</div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-bold text-white">Recording saved</div>
          <div class="text-[11px] text-green-200 mt-0.5">Click here to open My Library and manage all recordings →</div>
        </div>
        <button @click.stop="showSavedToast = false" class="text-green-200 hover:text-white text-lg leading-none">×</button>
      </div>
    </div>

    <!-- Library modal — large, table layout -->
    <div v-if="libraryModalOpen"
      class="fixed inset-0 bg-black/80 z-50 flex items-stretch justify-center p-4 md:p-8"
      @click.self="closeLibraryModal">
      <div class="w-full max-w-7xl my-auto max-h-full flex flex-col rounded-2xl border border-neural-600 bg-neural-900 shadow-2xl overflow-hidden">
        <!-- Modal header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-neural-700 bg-neural-800/60">
          <div class="flex items-center gap-3">
            <div class="text-2xl">📁</div>
            <div>
              <h3 class="text-lg font-bold text-white">My Library</h3>
              <p class="text-[11px] text-gray-400">{{ library.length }} recording{{ library.length === 1 ? '' : 's' }} · stored locally in <code class="font-mono">/app/uploads/recordings</code> · Postgres table <code class="font-mono">user_recordings</code></p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button @click="loadLibrary" :disabled="libraryLoading"
              class="px-3 py-1.5 rounded-lg border border-neural-600 text-xs text-gray-300 hover:text-white hover:border-neural-500 disabled:opacity-50">
              ↻ {{ libraryLoading ? 'Loading…' : 'Refresh' }}
            </button>
            <button @click="closeLibraryModal" class="text-gray-400 hover:text-white text-2xl leading-none px-2">×</button>
          </div>
        </div>

        <!-- Table body — scrollable -->
        <div class="flex-1 overflow-auto">
          <div v-if="libraryLoading && !library.length" class="p-8 text-center text-sm text-gray-400">Loading recordings…</div>
          <div v-else-if="libraryError" class="m-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            <div class="font-bold mb-1">Library failed to load</div>
            <div class="font-mono text-xs">{{ libraryError }}</div>
            <div v-if="libraryError.includes('user_recordings')" class="mt-3 text-yellow-200 text-xs">
              Hint: the <code>user_recordings</code> table doesn't exist on your Supabase project yet.
              Run <code>docker/postgres/migrations/004_user_recordings.sql</code> in the Supabase dashboard SQL editor and create the <code>recordings</code> bucket.
            </div>
          </div>
          <div v-else-if="!library.length" class="p-12 text-center">
            <div class="text-5xl mb-3">🎞</div>
            <div class="text-sm text-gray-300">No recordings yet</div>
            <div class="text-xs text-gray-500 mt-1">Record one and click Save to see it here.</div>
          </div>
          <table v-else class="w-full text-sm">
            <thead class="sticky top-0 bg-neural-800 text-[11px] uppercase tracking-wider text-gray-400 border-b border-neural-700">
              <tr>
                <th class="text-left px-4 py-3 w-32">Preview</th>
                <th class="text-left px-3 py-3">Title</th>
                <th class="text-left px-3 py-3 w-24">Duration</th>
                <th class="text-left px-3 py-3 w-24">Size</th>
                <th class="text-left px-3 py-3 w-32">Background</th>
                <th class="text-left px-3 py-3 w-44">Created</th>
                <th class="text-right px-3 py-3 w-72">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in library" :key="r.id" class="border-b border-neural-800 hover:bg-neural-800/40 transition-colors">
                <td class="px-4 py-3">
                  <div class="w-28 aspect-video rounded overflow-hidden bg-black border border-neural-700">
                    <img v-if="r.thumbnail_url" :src="r.thumbnail_url" class="w-full h-full object-cover" />
                    <video v-else-if="r.signed_url" :src="r.signed_url" class="w-full h-full object-cover" muted preload="metadata"></video>
                    <div v-else class="w-full h-full flex items-center justify-center text-2xl text-gray-600">🎞</div>
                  </div>
                </td>
                <td class="px-3 py-3 align-middle">
                  <div class="font-semibold text-white truncate max-w-md">{{ r.title }}</div>
                  <div class="text-[10px] text-gray-500 font-mono truncate">{{ r.id }}</div>
                </td>
                <td class="px-3 py-3 align-middle text-gray-300 font-mono text-xs">{{ fmtDuration(r.duration_ms) }}</td>
                <td class="px-3 py-3 align-middle text-gray-300 font-mono text-xs">{{ fmtSize(r.size_bytes) }}</td>
                <td class="px-3 py-3 align-middle">
                  <span class="text-[11px] px-2 py-0.5 rounded bg-neural-700 border border-neural-600 text-gray-300">
                    {{ r.background_type }}
                  </span>
                  <span v-if="r.gaze_correction_enabled"
                    class="ml-1 text-[11px] px-2 py-0.5 rounded bg-cyber-purple/20 border border-cyber-purple/40 text-cyber-purple">
                    gaze
                  </span>
                </td>
                <td class="px-3 py-3 align-middle text-xs text-gray-400">{{ fmtDate(r.created_at) }}</td>
                <td class="px-3 py-3 align-middle">
                  <div class="flex items-center justify-end gap-1.5">
                    <a v-if="r.signed_url" :href="r.signed_url" target="_blank" rel="noopener"
                      class="px-2.5 py-1 rounded bg-neural-700 hover:bg-neural-600 text-[11px] font-semibold text-white">Download</a>
                    <button @click="openEmailModal(r.id)"
                      class="px-2.5 py-1 rounded bg-cyber-purple/20 hover:bg-cyber-purple/30 border border-cyber-purple/40 text-[11px] font-semibold text-white">Attach to Email</button>
                    <button @click="deleteRecording(r.id)"
                      class="px-2 py-1 rounded border border-red-500/30 text-red-300 hover:bg-red-500/10 text-[11px] font-semibold">✕</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Background image picker -->
    <div v-if="bgPickerOpen"
      class="fixed inset-0 bg-black/80 z-50 flex items-stretch justify-center p-4 md:p-8"
      @click.self="bgPickerOpen = false">
      <div class="w-full max-w-3xl my-auto max-h-full flex flex-col rounded-2xl border border-neural-600 bg-neural-900 shadow-2xl overflow-hidden">
        <div class="flex items-center justify-between px-6 py-4 border-b border-neural-700 bg-neural-800/60">
          <div>
            <h3 class="text-lg font-bold text-white">🖼 Background images</h3>
            <p class="text-[11px] text-gray-400">Upload a new one, or pick from your library. Stored in this browser.</p>
          </div>
          <div class="flex items-center gap-2">
            <label class="px-3 py-1.5 rounded bg-cyber-cyan hover:bg-cyber-cyan/80 text-black text-xs font-bold cursor-pointer">
              + Upload
              <input type="file" accept="image/*" class="hidden" @change="onBgImage" />
            </label>
            <button @click="bgPickerOpen = false" class="text-gray-400 hover:text-white text-2xl leading-none px-2">×</button>
          </div>
        </div>
        <div class="flex-1 overflow-auto p-6">
          <div v-if="!bgLibrary.length" class="text-center py-12">
            <div class="text-5xl mb-3">🖼</div>
            <div class="text-sm text-gray-300">No images yet</div>
            <div class="text-xs text-gray-500 mt-1">Click + Upload to add one. PNG/JPG, kept locally in your browser.</div>
          </div>
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            <div v-for="url in bgLibrary" :key="url"
              class="group relative aspect-video rounded-lg overflow-hidden border-2 cursor-pointer transition-colors"
              :class="bgImagePreview === url ? 'border-cyber-cyan' : 'border-neural-700 hover:border-neural-500'"
              @click="selectBgFromLibrary(url)">
              <img :src="url" class="w-full h-full object-cover" />
              <div v-if="bgImagePreview === url"
                class="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-cyber-cyan text-black text-[9px] font-bold">ACTIVE</div>
              <button @click.stop="removeFromBgLibrary(url)"
                class="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-red-300 hover:bg-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold">×</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- AI Models Dashboard modal -->
    <div v-if="modelsDashboardOpen"
      class="fixed inset-0 bg-black/80 z-50 flex items-stretch justify-center p-4 md:p-8"
      @click.self="modelsDashboardOpen = false">
      <div class="w-full max-w-6xl my-auto max-h-full flex flex-col rounded-2xl border border-neural-600 bg-neural-900 shadow-2xl overflow-hidden">
        <div class="flex items-center justify-between px-6 py-4 border-b border-neural-700 bg-neural-800/60">
          <div>
            <h3 class="text-lg font-bold text-white">📊 AI Eye-Contact Models — Dashboard</h3>
            <p class="text-[11px] text-gray-400">All approaches I researched, with live status. Pick a green one to use immediately, or open ⓘ for setup steps.</p>
          </div>
          <button @click="modelsDashboardOpen = false" class="text-gray-400 hover:text-white text-2xl leading-none px-2">×</button>
        </div>
        <div class="flex-1 overflow-hidden flex">
          <!-- LEFT: cards grid -->
          <div class="flex-1 overflow-auto p-6 space-y-6">
            <section>
              <h4 class="text-[11px] uppercase tracking-wider text-green-300 font-bold mb-2">✓ Ready now</h4>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div v-for="m in GAZE_MODELS.filter(x => x.status === 'ready')" :key="m.id"
                  @click="inspectInDashboard(m)"
                  class="rounded-xl border p-4 flex flex-col gap-2 cursor-pointer transition-colors"
                  :class="dashboardSelected?.id === m.id
                    ? 'border-cyber-cyan/70 bg-cyber-cyan/10'
                    : 'border-green-500/30 bg-green-500/5 hover:bg-green-500/10'">
                  <div class="flex items-start justify-between gap-2">
                    <div class="font-bold text-white text-sm">{{ m.label }}</div>
                    <span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyber-cyan/15 text-cyber-cyan border border-cyber-cyan/40">{{ m.runtime }}</span>
                  </div>
                  <p class="text-[11px] text-gray-300 flex-1">{{ m.short }}</p>
                  <button @click.stop="chooseFromDashboard(m)"
                    class="px-2 py-1 rounded bg-green-600 hover:bg-green-500 text-white text-[11px] font-bold">Use</button>
                </div>
              </div>
            </section>

            <section>
              <h4 class="text-[11px] uppercase tracking-wider text-yellow-300 font-bold mb-2">⚙ Needs setup</h4>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div v-for="m in GAZE_MODELS.filter(x => x.status === 'config')" :key="m.id"
                  @click="inspectInDashboard(m)"
                  class="rounded-xl border p-4 flex flex-col gap-2 cursor-pointer transition-colors"
                  :class="dashboardSelected?.id === m.id
                    ? 'border-cyber-cyan/70 bg-cyber-cyan/10'
                    : 'border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10'">
                  <div class="flex items-start justify-between gap-2">
                    <div class="font-bold text-white text-sm">{{ m.label }}</div>
                    <span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyber-cyan/15 text-cyber-cyan border border-cyber-cyan/40">{{ m.runtime }}</span>
                  </div>
                  <p class="text-[11px] text-gray-300 flex-1">{{ m.short }}</p>
                  <span class="text-[10px] text-yellow-300/90 font-bold">→ Click for setup steps</span>
                </div>
              </div>
            </section>

            <section>
              <h4 class="text-[11px] uppercase tracking-wider text-gray-400 font-bold mb-2">🔮 Future / research</h4>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div v-for="m in GAZE_MODELS.filter(x => x.status === 'future')" :key="m.id"
                  @click="inspectInDashboard(m)"
                  class="rounded-xl border p-4 flex flex-col gap-2 cursor-pointer transition-colors"
                  :class="dashboardSelected?.id === m.id
                    ? 'border-cyber-cyan/70 bg-cyber-cyan/10'
                    : 'border-neural-700 bg-neural-800/40 hover:bg-neural-800/70'">
                  <div class="flex items-start justify-between gap-2">
                    <div class="font-bold text-gray-300 text-sm">{{ m.label }}</div>
                    <span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neural-700 text-gray-400 border border-neural-600">{{ m.runtime }}</span>
                  </div>
                  <p class="text-[11px] text-gray-500 flex-1">{{ m.short }}</p>
                  <span class="text-[10px] text-gray-400 font-bold">→ Click for description</span>
                </div>
              </div>
            </section>
          </div>

          <!-- RIGHT: inline detail panel (replaces the old separate info modal) -->
          <aside class="w-96 shrink-0 border-l border-neural-700 bg-neural-950/60 overflow-auto">
            <div v-if="!dashboardSelected" class="p-8 text-center text-xs text-gray-500">
              <div class="text-4xl mb-2">👆</div>
              Click any model card to see its description, pros/cons and setup steps here.
            </div>
            <div v-else class="p-5 space-y-3">
              <div class="flex items-start justify-between gap-2">
                <h4 class="text-base font-bold text-white">{{ dashboardSelected.label }}</h4>
                <button @click="dashboardSelected = null" class="text-gray-500 hover:text-white text-lg leading-none">×</button>
              </div>
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-[10px] font-mono px-2 py-0.5 rounded-full"
                  :class="dashboardSelected.status === 'ready'
                    ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                    : dashboardSelected.status === 'config'
                    ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
                    : 'bg-gray-500/20 text-gray-300 border border-gray-500/40'">
                  {{ dashboardSelected.status === 'ready' ? 'ready' : dashboardSelected.status === 'config' ? 'needs setup' : 'future' }}
                </span>
                <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyber-cyan/15 text-cyber-cyan border border-cyber-cyan/40">{{ dashboardSelected.runtime }}</span>
                <span class="text-[10px] text-gray-400">License: {{ dashboardSelected.license }}</span>
              </div>
              <p class="text-xs text-gray-200 leading-relaxed">{{ dashboardSelected.description }}</p>
              <div class="grid grid-cols-1 gap-3">
                <div>
                  <h5 class="text-[10px] uppercase tracking-wider text-green-300 font-bold mb-1">Pros</h5>
                  <ul class="space-y-1">
                    <li v-for="p in dashboardSelected.pros" :key="p" class="text-[11px] text-gray-300 flex gap-1.5">
                      <span class="text-green-400">✓</span><span>{{ p }}</span>
                    </li>
                  </ul>
                </div>
                <div>
                  <h5 class="text-[10px] uppercase tracking-wider text-red-300 font-bold mb-1">Cons</h5>
                  <ul class="space-y-1">
                    <li v-for="c in dashboardSelected.cons" :key="c" class="text-[11px] text-gray-300 flex gap-1.5">
                      <span class="text-red-400">✕</span><span>{{ c }}</span>
                    </li>
                  </ul>
                </div>
              </div>
              <div v-if="dashboardSelected.setup.length">
                <h5 class="text-[10px] uppercase tracking-wider text-cyber-cyan font-bold mb-1">Setup steps</h5>
                <ol class="space-y-1.5">
                  <li v-for="(s, i) in dashboardSelected.setup" :key="i" class="text-[11px] text-gray-300 flex gap-1.5">
                    <span class="text-cyber-cyan font-mono w-4 shrink-0">{{ i + 1 }}.</span>
                    <span class="flex-1 break-words">{{ s }}</span>
                  </li>
                </ol>
              </div>
              <a v-if="dashboardSelected.reference" :href="dashboardSelected.reference" target="_blank" rel="noopener"
                class="block text-[10px] text-cyber-cyan hover:underline font-mono break-all pt-1">{{ dashboardSelected.reference }} ↗</a>
              <button v-if="dashboardSelected.status === 'ready'"
                @click="selectedGazeId = dashboardSelected.id; modelsDashboardOpen = false"
                class="w-full mt-2 px-3 py-2 rounded bg-cyber-cyan text-black text-xs font-bold">Use this model</button>
            </div>
          </aside>
        </div>
      </div>
    </div>

    <!-- Attach-to-email modal -->
    <div v-if="emailModal.open" class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" @click.self="closeEmailModal">
      <div class="max-w-lg w-full rounded-xl border border-neural-700 bg-neural-900 p-5 space-y-3">
        <div class="flex items-center justify-between">
          <h4 class="text-base font-bold text-white">Attach recording to interview email</h4>
          <button @click="closeEmailModal" class="text-gray-500 hover:text-white">✕</button>
        </div>
        <div class="grid grid-cols-2 gap-3 text-xs">
          <input v-model="emailForm.to" placeholder="Recipient email" class="col-span-2 px-3 py-2 rounded bg-neural-800 border border-neural-600 text-white" />
          <input v-model="emailForm.recipientName" placeholder="Recipient name" class="px-3 py-2 rounded bg-neural-800 border border-neural-600 text-white" />
          <input v-model="emailForm.jobTitle" placeholder="Job title" class="px-3 py-2 rounded bg-neural-800 border border-neural-600 text-white" />
          <input v-model="emailForm.company" placeholder="Company" class="col-span-2 px-3 py-2 rounded bg-neural-800 border border-neural-600 text-white" />
          <input v-model="emailForm.question" placeholder="Interview question" class="col-span-2 px-3 py-2 rounded bg-neural-800 border border-neural-600 text-white" />
          <textarea v-model="emailForm.script" placeholder="Script / transcript (optional)" rows="3" class="col-span-2 px-3 py-2 rounded bg-neural-800 border border-neural-600 text-white"></textarea>
        </div>
        <div class="flex items-center justify-end gap-2 pt-1">
          <button @click="closeEmailModal" class="px-3 py-1.5 rounded border border-neural-600 text-xs text-gray-400 hover:text-white">Cancel</button>
          <button @click="sendEmail" :disabled="emailSending || !emailForm.to"
            class="px-4 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-xs font-bold disabled:opacity-50">
            {{ emailSending ? 'Sending…' : 'Send' }}
          </button>
        </div>
        <div v-if="emailResult" class="text-xs" :class="emailResult.startsWith('✓') ? 'text-green-300' : 'text-red-300'">{{ emailResult }}</div>
      </div>
    </div>
</template>

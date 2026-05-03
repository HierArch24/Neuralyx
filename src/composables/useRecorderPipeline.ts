import { ref, watch, type Ref } from 'vue'
import { createSegmenter, type SelfieSegmenter } from './useSegmenter'
import { createGazeLandmark, type GazeLandmark } from './useGazeLandmark'
import { createGazeCustom, type GazeCustom } from './useGazeCustom'

export type BgConfig =
  | { type: 'none' }
  | { type: 'blur', radiusPx: number }
  | { type: 'color', color: string }
  | { type: 'image', url: string }

export type GazeMode = 'off' | 'auto' | 'landmark' | 'custom' | 'onnx'

export interface UseRecorderPipelineOpts {
  videoEl: Ref<HTMLVideoElement | null>
  canvasEl: Ref<HTMLCanvasElement | null>
  background: Ref<BgConfig>
  /** Legacy boolean kept for v1 callers — mapped to mode='landmark' when true. */
  gazeCorrection: Ref<boolean>
  /** Active gaze mode. Overrides the legacy boolean when provided. */
  gazeMode?: Ref<GazeMode>
  /** 0..1 strength for landmark warp. Default 0.5. */
  gazeStrength?: Ref<number>
}

export interface UseRecorderPipelineResult {
  start(): Promise<void>
  startRecording(): void
  stop(): Promise<Blob>
  state: Ref<'idle' | 'preview' | 'recording' | 'stopped'>
  durationMs: Ref<number>
  error: Ref<string | null>
  segmenterError: Ref<string | null>
  gazeError: Ref<string | null>
  gazeReady: Ref<boolean>
  /** Mirrors the latest face-detection result from the gaze backend.
   *  Useful to show a UI hint when the warp can't fire because the
   *  user's face isn't visible to the model. */
  gazeFaceDetected: Ref<boolean>
  devices: { cameras: MediaDeviceInfo[], mics: MediaDeviceInfo[] }
  selectedCamera: Ref<string>
  selectedMic: Ref<string>
}

/**
 * Single-source webcam capture → canvas compositor → MediaRecorder.
 *
 * All per-frame work is kicked off from `requestVideoFrameCallback` so we're
 * tied to actual decoded video frames (not rAF tearing).
 */
export function useRecorderPipeline(opts: UseRecorderPipelineOpts): UseRecorderPipelineResult {
  const state = ref<'idle' | 'preview' | 'recording' | 'stopped'>('idle')
  const durationMs = ref(0)
  const error = ref<string | null>(null)
  const segmenterError = ref<string | null>(null)
  const gazeError = ref<string | null>(null)
  const gazeReady = ref(false)
  const gazeFaceDetected = ref(false)

  const devices = ref<{ cameras: MediaDeviceInfo[], mics: MediaDeviceInfo[] }>({ cameras: [], mics: [] })
  const selectedCamera = ref<string>('')
  const selectedMic = ref<string>('')

  let mediaStream: MediaStream | null = null
  let outStream: MediaStream | null = null
  let recorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let rvfcHandle = 0
  let timerHandle: ReturnType<typeof setInterval> | null = null
  let recordStartedAt = 0
  let imgBitmapCache: ImageBitmap | null = null
  let lastBgImageUrl = ''

  let segmenter: SelfieSegmenter | null = null
  let segmenterLoadAttempted = false
  let offscreen: HTMLCanvasElement | null = null

  let gazeLandmark: GazeLandmark | null = null
  let gazeLandmarkLoadAttempted = false
  let gazeCustom: GazeCustom | null = null
  let gazeCustomLoadAttempted = false
  // Auto mode resolves to the strongest available backend at first use:
  // 'onnx' if the model file responds 200, else 'custom', else 'landmark'.
  let autoResolvedMode: 'landmark' | 'custom' | 'onnx' | null = null
  let autoResolveAttempted = false

  async function resolveAutoMode(): Promise<'landmark' | 'custom' | 'onnx' | null> {
    if (autoResolveAttempted) return autoResolvedMode
    autoResolveAttempted = true
    // Auto = no live warp. The recording stays clean; gaze correction is
    // applied server-side by WangWilly during the auto-polish step on Stop.
    // This avoids baking client-side warp artifacts into the saved take.
    // (User can pick Landmark/Custom/ONNX explicitly in the dropdown if they
    //  want a live preview effect — but those CAN show artifacts on imperfect
    //  faces, so they're opt-in.)
    autoResolvedMode = null
    return null
  }

  async function ensureGazeLandmark(): Promise<GazeLandmark | null> {
    if (gazeLandmark) return gazeLandmark
    if (gazeLandmarkLoadAttempted) return null
    gazeLandmarkLoadAttempted = true
    try {
      const g = await createGazeLandmark()
      if (!g.available) {
        gazeError.value = `Landmark gaze unavailable: ${g.loadError || 'unknown'}`
        gazeReady.value = false
        return null
      }
      gazeLandmark = g
      gazeError.value = null
      gazeReady.value = true
      return g
    } catch (e) {
      gazeError.value = `Landmark gaze failed: ${e instanceof Error ? e.message : String(e)}`
      gazeReady.value = false
      return null
    }
  }

  async function ensureGazeCustom(): Promise<GazeCustom | null> {
    if (gazeCustom) return gazeCustom
    if (gazeCustomLoadAttempted) return null
    gazeCustomLoadAttempted = true
    try {
      const g = await createGazeCustom()
      if (!g.available) {
        gazeError.value = `Custom gaze unavailable: ${g.loadError || 'unknown'}`
        gazeReady.value = false
        return null
      }
      gazeCustom = g
      gazeError.value = null
      gazeReady.value = true
      return g
    } catch (e) {
      gazeError.value = `Custom gaze failed: ${e instanceof Error ? e.message : String(e)}`
      gazeReady.value = false
      return null
    }
  }

  // Pre-warm landmark loader if mode starts at 'landmark'
  function activeMode(): GazeMode {
    if (opts.gazeMode) return opts.gazeMode.value
    return opts.gazeCorrection.value ? 'landmark' : 'off'
  }
  function activeStrength(): number {
    return opts.gazeStrength?.value ?? 0.5
  }

  async function enumerateDevices() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      devices.value = {
        cameras: list.filter(d => d.kind === 'videoinput'),
        mics: list.filter(d => d.kind === 'audioinput'),
      }
      if (!selectedCamera.value && devices.value.cameras[0]) selectedCamera.value = devices.value.cameras[0].deviceId
      if (!selectedMic.value && devices.value.mics[0]) selectedMic.value = devices.value.mics[0].deviceId
    } catch {
      /* ignore — user may not have granted permission yet */
    }
  }

  function pickMimeType(): string {
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ]
    for (const c of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
    }
    return 'video/webm'
  }

  async function ensureSegmenter(): Promise<SelfieSegmenter | null> {
    if (segmenter) return segmenter
    if (segmenterLoadAttempted) return null
    segmenterLoadAttempted = true
    try {
      segmenter = await createSegmenter('/models/selfie_segmenter.tflite')
      segmenterError.value = null
      return segmenter
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('[recorder] segmenter unavailable — falling back to no-effect background', e)
      segmenterError.value = `Background effects disabled: ${msg}`
      return null
    }
  }

  async function updateBgImageBitmap(cfg: BgConfig) {
    if (cfg.type !== 'image') { imgBitmapCache = null; lastBgImageUrl = ''; return }
    if (cfg.url === lastBgImageUrl && imgBitmapCache) return
    try {
      const res = await fetch(cfg.url)
      const blob = await res.blob()
      imgBitmapCache = await createImageBitmap(blob)
      lastBgImageUrl = cfg.url
    } catch (e) {
      console.warn('[recorder] failed to load background image', e)
      imgBitmapCache = null
    }
  }

  watch(() => opts.background.value, (cfg) => { void updateBgImageBitmap(cfg) }, { immediate: true })

  async function start(): Promise<void> {
    error.value = null
    const video = opts.videoEl.value
    const canvas = opts.canvasEl.value
    if (!video || !canvas) { error.value = 'Video/canvas not mounted'; return }

    if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) {
      error.value = 'requestVideoFrameCallback not supported — use Chromium or Edge'
      return
    }

    // Stop prior stream if re-starting
    if (mediaStream) {
      for (const t of mediaStream.getTracks()) t.stop()
      mediaStream = null
    }

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          deviceId: selectedCamera.value ? { exact: selectedCamera.value } : undefined,
        },
        audio: {
          deviceId: selectedMic.value ? { exact: selectedMic.value } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return
    }

    // After permission, device labels become available
    await enumerateDevices()

    video.srcObject = mediaStream
    await video.play().catch(() => undefined)

    // Resize canvas to video intrinsic size once metadata known
    const resize = () => {
      canvas.width = video.videoWidth || 1280
      canvas.height = video.videoHeight || 720
      if (!offscreen) offscreen = document.createElement('canvas')
      offscreen.width = canvas.width
      offscreen.height = canvas.height
    }
    if (video.readyState >= 2) resize()
    else video.addEventListener('loadedmetadata', resize, { once: true })

    // Warm up segmenter in background — OK if it fails
    void ensureSegmenter()
    // Pre-warm whichever gaze mode the user is starting in
    if (activeMode() === 'landmark') void ensureGazeLandmark()
    if (activeMode() === 'custom') void ensureGazeCustom()
    if (activeMode() === 'auto') void resolveAutoMode().then(m => {
      if (m === 'custom') void ensureGazeCustom()
      if (m === 'landmark') void ensureGazeLandmark()
    })
    // React to mode flips so we don't pay the load cost until needed
    if (opts.gazeMode) {
      watch(opts.gazeMode, (m) => {
        if (m === 'landmark') void ensureGazeLandmark()
        if (m === 'custom')   void ensureGazeCustom()
        if (m === 'auto')     void resolveAutoMode().then(r => {
          if (r === 'custom') void ensureGazeCustom()
          if (r === 'landmark') void ensureGazeLandmark()
        })
      })
    }

    // Frame pump
    const pump = async (_now: number, _meta: unknown) => {
      if (!opts.videoEl.value || !opts.canvasEl.value) return
      await renderFrame(opts.videoEl.value, opts.canvasEl.value)
      rvfcHandle = (opts.videoEl.value as any).requestVideoFrameCallback(pump)
    }
    rvfcHandle = (video as any).requestVideoFrameCallback(pump)

    state.value = 'preview'
  }

  async function renderFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width, h = canvas.height

    const bg = opts.background.value
    if (bg.type === 'none' || !segmenter) {
      // Passthrough (or no segmenter available → no effects)
      ctx.drawImage(video, 0, 0, w, h)
      // Even without background swap, run the gaze correction so user gets
      // the eye-contact effect on the unmodified frame.
      await maybeApplyGaze(video, canvas)
      return
    }

    // Segment
    let mask: HTMLCanvasElement | ImageBitmap | null = null
    try {
      mask = await segmenter.segment(video)
    } catch {
      ctx.drawImage(video, 0, 0, w, h)
      return
    }
    if (!mask) { ctx.drawImage(video, 0, 0, w, h); return }

    // Draw background layer
    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    if (bg.type === 'blur') {
      ctx.filter = `blur(${bg.radiusPx}px)`
      ctx.drawImage(video, 0, 0, w, h)
      ctx.filter = 'none'
    } else if (bg.type === 'color') {
      ctx.fillStyle = bg.color
      ctx.fillRect(0, 0, w, h)
    } else if (bg.type === 'image' && imgBitmapCache) {
      const img = imgBitmapCache
      // cover-fit
      const sr = w / h
      const ir = img.width / img.height
      let sw = img.width, sh = img.height, sx = 0, sy = 0
      if (ir > sr) { sw = img.height * sr; sx = (img.width - sw) / 2 }
      else { sh = img.width / sr; sy = (img.height - sh) / 2 }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h)
    } else {
      ctx.drawImage(video, 0, 0, w, h)
    }
    ctx.restore()

    // Composite person on top using mask (person = source-over where mask>threshold)
    // Strategy: draw video to offscreen, then use mask to keep only the person
    if (!offscreen) return
    const oc = offscreen.getContext('2d')
    if (!oc) return
    oc.clearRect(0, 0, w, h)
    oc.drawImage(video, 0, 0, w, h)
    oc.globalCompositeOperation = 'destination-in'
    oc.drawImage(mask as CanvasImageSource, 0, 0, w, h)
    oc.globalCompositeOperation = 'source-over'
    ctx.drawImage(offscreen, 0, 0, w, h)

    // Apply gaze correction last so it affects the composited canvas
    await maybeApplyGaze(video, canvas)
  }

  async function maybeApplyGaze(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
    let mode = activeMode()
    if (mode === 'off') return
    if (mode === 'auto') {
      const resolved = await resolveAutoMode()
      if (!resolved) return
      mode = resolved
    }
    if (mode === 'landmark') {
      const g = await ensureGazeLandmark()
      if (!g) return
      try { await g.correct(video, canvas, activeStrength()) } catch { /* swallow per-frame errors */ }
      return
    }
    if (mode === 'custom') {
      const g = await ensureGazeCustom()
      if (!g) return
      try {
        await g.correct(video, canvas, activeStrength())
        gazeFaceDetected.value = g.faceDetected
      } catch { /* swallow per-frame errors */ }
      return
    }
    // 'onnx' mode: integration hook lives in useGazeCorrector — keep this
    // path opt-in until a model is dropped at /models/gaze_redirect.onnx
  }

  function startRecording() {
    if (!mediaStream || !opts.canvasEl.value) return
    const canvas = opts.canvasEl.value
    const videoTracks = canvas.captureStream(30).getVideoTracks()
    const audioTracks = mediaStream.getAudioTracks()
    outStream = new MediaStream([...videoTracks, ...audioTracks])
    chunks = []
    const mimeType = pickMimeType()
    recorder = new MediaRecorder(outStream, { mimeType, videoBitsPerSecond: 2_500_000 })
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data) }
    recorder.start(1000)
    recordStartedAt = performance.now()
    durationMs.value = 0
    timerHandle = setInterval(() => { durationMs.value = performance.now() - recordStartedAt }, 200)
    state.value = 'recording'
  }

  async function stop(): Promise<Blob> {
    const wasRecording = state.value === 'recording'
    if (rvfcHandle) {
      // rVFC has no cancel; letting video stop ends the loop naturally via track.stop
      rvfcHandle = 0
    }
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null }

    let blob: Blob | null = null
    if (recorder && wasRecording) {
      blob = await new Promise<Blob>((resolve) => {
        recorder!.onstop = () => resolve(new Blob(chunks, { type: recorder!.mimeType || 'video/webm' }))
        try { recorder!.stop() } catch { resolve(new Blob(chunks, { type: 'video/webm' })) }
      })
    }

    // Tear down streams
    if (mediaStream) {
      for (const t of mediaStream.getTracks()) t.stop()
      mediaStream = null
    }
    if (outStream) {
      for (const t of outStream.getTracks()) t.stop()
      outStream = null
    }
    recorder = null

    state.value = 'stopped'
    return blob ?? new Blob([], { type: 'video/webm' })
  }

  // Best-effort on-mount enumeration (labels fill in after first getUserMedia)
  void enumerateDevices()

  return {
    start,
    startRecording,
    stop,
    state,
    durationMs,
    error,
    segmenterError,
    gazeError,
    gazeReady,
    gazeFaceDetected,
    devices: devices.value,
    selectedCamera,
    selectedMic,
  }
}

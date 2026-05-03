/**
 * useGazeCorrector — ONNX-based eye-contact correction.
 *
 * Pipeline per frame:
 *   1. FaceLandmarker (MediaPipe, already bundled) → eye bounding boxes
 *   2. Crop a square eye ROI from the canvas (normalized to model input size)
 *   3. ONNX session: input = [1,3,H,W] eye image (+ optional gaze-target [1,2])
 *      → output = warped eye image of the same shape
 *   4. Paste output back over each eye with a soft elliptical alpha mask
 *
 * The model file ships separately. Drop it at:
 *     public/models/gaze_redirect.onnx
 * Edit MODEL_INPUT_SIZE / MODEL_HAS_TARGET below if your model differs.
 *
 * If the model is absent, missing-shape, or fails to load, the composable
 * exposes `available = false` with a `loadError` string. The recorder skips
 * ONNX correction silently in that case, and the UI dropdown surfaces the
 * status so the user knows what to fix.
 */
import { ref, type Ref } from 'vue'
import {
  FaceLandmarker,
  FilesetResolver,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'

const WASM_BASE = '/models/mediapipe'
const ONNX_MODEL_URL = '/models/gaze_redirect.onnx'
const FACE_MODEL_URL = '/models/face_landmarker.task'

// ─── Tunables for the chosen ONNX model ────────────────────────────────────
// Most published gaze-redirection nets take a square 64×64 RGB eye crop and
// return a same-sized warped eye. If your model differs, change these here.
const MODEL_INPUT_SIZE = 64
// Some models expect a target-gaze vector [yaw, pitch] in radians; set to true
// and the wrapper feeds [0,0] meaning "look at camera". Disable if the model
// only takes the image input.
const MODEL_HAS_TARGET = true
const TARGET_GAZE: [number, number] = [0, 0]

const LEFT_EYE_LM  = { corners: [33, 133],  vert: [159, 145] }
const RIGHT_EYE_LM = { corners: [362, 263], vert: [386, 374] }

export interface GazeCorrector {
  readonly available: Ref<boolean>
  readonly loadError: Ref<string | null>
  init(): Promise<void>
  /** Apply the ONNX warp to the canvas in place using the latest video frame. */
  correct(video: HTMLVideoElement, targetCanvas: HTMLCanvasElement): Promise<boolean>
  dispose(): void
}

interface EyeBox { x: number; y: number; size: number; cx: number; cy: number }

function eyeBox(lm: NormalizedLandmark[], spec: typeof LEFT_EYE_LM, w: number, h: number): EyeBox | null {
  const [c1, c2] = spec.corners
  const [vt, vb] = spec.vert
  if (!lm[c1] || !lm[c2] || !lm[vt] || !lm[vb]) return null
  const x1 = lm[c1].x * w, x2 = lm[c2].x * w
  const y1 = lm[vt].y * h, y2 = lm[vb].y * h
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2
  // Square crop wider than the eye, padded so warping has room
  const span = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2.6
  const size = Math.max(24, Math.min(w, h, span))
  return { cx, cy, x: Math.max(0, cx - size / 2), y: Math.max(0, cy - size / 2), size }
}

export function useGazeCorrector(): GazeCorrector {
  const available = ref(false)
  const loadError = ref<string | null>(null)
  let session: import('onnxruntime-web').InferenceSession | null = null
  let landmarker: FaceLandmarker | null = null
  let initStarted = false

  // Reusable canvases so we don't allocate every frame
  const cropCanvas = document.createElement('canvas')
  cropCanvas.width = MODEL_INPUT_SIZE
  cropCanvas.height = MODEL_INPUT_SIZE
  const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true })

  async function probeModel(): Promise<boolean> {
    try {
      const r = await fetch(ONNX_MODEL_URL, { method: 'HEAD' })
      return r.ok && (parseInt(r.headers.get('content-length') || '0', 10) > 1024)
    } catch { return false }
  }

  async function init() {
    if (initStarted) return
    initStarted = true
    try {
      const hasModel = await probeModel()
      if (!hasModel) {
        loadError.value = `Drop a gaze-redirection ONNX model at ${ONNX_MODEL_URL} to enable this mode.`
        available.value = false
        return
      }
      // Load FaceLandmarker (used to find eye boxes)
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
      landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL },
        runningMode: 'VIDEO',
        numFaces: 1,
      })
      // Load ONNX runtime + session lazily
      // Use the bundled wasm-only ORT (no WebGPU/WebGL EP needed for our tiny model).
      // The default 'onnxruntime-web' loader picks the JSEP build which expects
      // WebGPU and can hang during init — wasm-only avoids that entirely.
      const ort = await import('onnxruntime-web/wasm')
      ;(ort.env.wasm as { wasmPaths?: string }).wasmPaths = '/models/ort/'
      ;(ort.env.wasm as { numThreads?: number }).numThreads = 1
      ;(ort.env.wasm as { proxy?: boolean }).proxy = false
      ;(ort.env.wasm as { simd?: boolean }).simd = true
      session = await ort.InferenceSession.create(ONNX_MODEL_URL, {
        executionProviders: ['wasm'],
      })
      available.value = true
      loadError.value = null
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : String(e)
      available.value = false
      session = null
    }
  }

  function imageDataToCHWFloat32(img: ImageData): Float32Array {
    const { data, width, height } = img
    const out = new Float32Array(3 * width * height)
    const planeR = 0, planeG = width * height, planeB = 2 * width * height
    let p = 0
    for (let i = 0; i < data.length; i += 4) {
      out[planeR + p] = data[i]     / 255
      out[planeG + p] = data[i + 1] / 255
      out[planeB + p] = data[i + 2] / 255
      p++
    }
    return out
  }

  // @ts-expect-error retained for future toggle but currently unused
  function paintSyntheticIris(ctx: CanvasRenderingContext2D, box: EyeBox, strength: number) {
    // Larger, more visible iris — at typical webcam resolution the eye box
    // is ~50-100px so r=10-20 reads clearly without looking cartoonish.
    const r = Math.max(5, box.size * 0.18)
    let sr = 60, sg = 60, sb = 80
    try {
      const sample = ctx.getImageData(Math.round(box.cx), Math.round(box.cy), 1, 1).data
      sr = Math.round(sample[0] * 0.75); sg = Math.round(sample[1] * 0.75); sb = Math.round(sample[2] * 0.78)
    } catch { /* tainted canvas */ }

    ctx.save()
    // Clip to a tight elliptical mask matching the visible eye opening so paint can't bleed onto the lid
    ctx.beginPath()
    ctx.ellipse(box.cx, box.cy, box.size * 0.30, box.size * 0.18, 0, 0, Math.PI * 2)
    ctx.clip()

    ctx.globalAlpha = Math.min(1, 0.85 * strength)
    ctx.fillStyle = `rgb(${sr},${sg},${sb})`
    ctx.beginPath(); ctx.arc(box.cx, box.cy, r, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = Math.min(1, 0.95 * strength)
    ctx.fillStyle = '#0d0d0d'
    ctx.beginPath(); ctx.arc(box.cx, box.cy, r * 0.45, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = Math.min(1, 0.85 * strength)
    ctx.fillStyle = '#f5f5f5'
    ctx.beginPath(); ctx.arc(box.cx + r * 0.22, box.cy - r * 0.26, Math.max(1.5, r * 0.18), 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  async function correctEye(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, box: EyeBox) {
    if (!session || !cropCtx) return
    // 1. Crop eye ROI to model input size
    cropCtx.drawImage(canvas, box.x, box.y, box.size, box.size, 0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE)
    const inputImg = cropCtx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE)
    const chw = imageDataToCHWFloat32(inputImg)

    const ort = await import('onnxruntime-web/wasm')
    const tensor = new ort.Tensor('float32', chw, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE])
    const feeds: Record<string, import('onnxruntime-web').Tensor> = {}
    const inputNames = session.inputNames
    feeds[inputNames[0]] = tensor
    if (MODEL_HAS_TARGET && inputNames.length > 1) {
      feeds[inputNames[1]] = new ort.Tensor('float32', new Float32Array(TARGET_GAZE), [1, 2])
    }

    let outputs: import('onnxruntime-web').InferenceSession.OnnxValueMapType | null = null
    try { outputs = await session.run(feeds) } catch { /* swallow — we still paint iris below */ }

    // Stage 1 — composite the learned warp back (only when ONNX produced output)
    if (outputs) {
      const out = outputs[session.outputNames[0]]
      const dims = out.dims as readonly number[]
      if (dims.length === 4 && dims[1] === 3) {
        const oh = dims[2], ow = dims[3]
        const arr = out.data as Float32Array
        const px = new Uint8ClampedArray(ow * oh * 4)
        const pR = 0, pG = ow * oh, pB = 2 * ow * oh
        for (let i = 0; i < ow * oh; i++) {
          px[i * 4]     = Math.max(0, Math.min(255, arr[pR + i] * 255))
          px[i * 4 + 1] = Math.max(0, Math.min(255, arr[pG + i] * 255))
          px[i * 4 + 2] = Math.max(0, Math.min(255, arr[pB + i] * 255))
          px[i * 4 + 3] = 255
        }
        cropCtx.putImageData(new ImageData(px, ow, oh), 0, 0)
        ctx.save()
        ctx.beginPath()
        ctx.ellipse(box.cx, box.cy, box.size * 0.42, box.size * 0.32, 0, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(cropCanvas, box.x, box.y, box.size, box.size)
        ctx.restore()
      }
    }
    // (Synthetic iris removed — user wants natural-looking eyes.
    //  ONNX warp output is the visible result; if too subtle, retrain
    //  with more pairs or use the Custom mode which does pixel warping.)
  }

  return {
    available,
    loadError,
    init,
    async correct(video, canvas) {
      if (!available.value || !session || !landmarker) return false
      let result
      try { result = landmarker.detectForVideo(video, performance.now()) } catch { return false }
      const faces = result?.faceLandmarks
      if (!faces?.length) return false
      const lm = faces[0]
      const ctx = canvas.getContext('2d')
      if (!ctx) return false
      const left = eyeBox(lm, LEFT_EYE_LM, canvas.width, canvas.height)
      const right = eyeBox(lm, RIGHT_EYE_LM, canvas.width, canvas.height)
      if (left)  await correctEye(canvas, ctx, left)
      if (right) await correctEye(canvas, ctx, right)
      return true
    },
    dispose() {
      try { landmarker?.close() } catch { /* ignore */ }
      landmarker = null
      session = null
      available.value = false
    },
  }
}

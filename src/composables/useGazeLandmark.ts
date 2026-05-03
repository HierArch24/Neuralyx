/**
 * Landmark-based "look at camera" effect.
 *
 * Uses MediaPipe FaceLandmarker (478 landmarks incl. irises 468-477) to find
 * each eye's bounding box + iris center, then warps a small ROI per eye so
 * the iris appears nudged toward the eye center (which roughly aligns with
 * the camera when the user's head is forward).
 *
 * This is a real, no-extra-file path: works as soon as the FaceLandmarker
 * model loads from /models/face_landmarker.task.
 *
 * Strength 0..1 controls how much of the iris→center delta is applied per
 * frame; 0.5 is a good default — visible but not uncanny.
 */
import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'

const WASM_BASE = '/models/mediapipe'
const MODEL_URL = '/models/face_landmarker.task'

// Landmark indices (MediaPipe FaceMesh canonical model)
const LEFT_EYE   = { corners: [33, 133],  vert: [159, 145], iris: [468, 469, 470, 471, 472] }
const RIGHT_EYE  = { corners: [362, 263], vert: [386, 374], iris: [473, 474, 475, 476, 477] }

export interface GazeLandmark {
  available: boolean
  loadError: string | null
  /** Apply the look-at-camera effect to `canvas` based on the current `video` frame. */
  correct(video: HTMLVideoElement, canvas: HTMLCanvasElement, strength: number): Promise<boolean>
  dispose(): void
}

interface EyeTransform {
  cx: number; cy: number       // eye center, canvas-px
  irisX: number; irisY: number // iris center, canvas-px
  rx: number; ry: number       // half-width / half-height of the eye ROI in canvas-px
}

export async function createGazeLandmark(): Promise<GazeLandmark> {
  let landmarker: FaceLandmarker | null = null
  let loadError: string | null = null
  try {
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
    landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    })
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e)
  }

  // Reusable scratch canvas for ROI extraction so we don't allocate per frame
  const scratch = document.createElement('canvas')
  const sctx = scratch.getContext('2d')

  function eyeTransform(landmarks: NormalizedLandmark[], spec: typeof LEFT_EYE, w: number, h: number): EyeTransform | null {
    const [c1, c2] = spec.corners
    const [vTop, vBot] = spec.vert
    const irisCenter = spec.iris[0]
    if (!landmarks[c1] || !landmarks[c2] || !landmarks[vTop] || !landmarks[vBot] || !landmarks[irisCenter]) return null
    const x1 = landmarks[c1].x * w, x2 = landmarks[c2].x * w
    const y1 = landmarks[vTop].y * h, y2 = landmarks[vBot].y * h
    const cx = (x1 + x2) / 2
    const cy = (y1 + y2) / 2
    // ROI sized to the eye span, padded for the iris radius
    const rx = Math.max(8, Math.abs(x2 - x1) / 2 + 6)
    const ry = Math.max(6, Math.abs(y2 - y1) + 8)
    return {
      cx, cy,
      irisX: landmarks[irisCenter].x * w,
      irisY: landmarks[irisCenter].y * h,
      rx, ry,
    }
  }

  function warpEye(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, t: EyeTransform, strength: number) {
    const dx = (t.cx - t.irisX) * strength
    const dy = (t.cy - t.irisY) * strength
    const w = canvas.width, h = canvas.height

    // Clamp the ROI to canvas bounds
    const sx = Math.max(0, Math.floor(t.cx - t.rx))
    const sy = Math.max(0, Math.floor(t.cy - t.ry))
    const sw = Math.min(w - sx, Math.ceil(t.rx * 2))
    const sh = Math.min(h - sy, Math.ceil(t.ry * 2))
    if (sw <= 0 || sh <= 0 || !sctx) return

    // Snapshot the eye region into the scratch canvas
    scratch.width = sw
    scratch.height = sh
    sctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh)

    // Soft elliptical alpha mask so the warp doesn't show hard edges on the eyelid
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(t.cx, t.cy, t.rx, t.ry, 0, 0, Math.PI * 2)
    ctx.clip()
    // Translate the snapshot back into the canvas with the iris→center offset
    ctx.drawImage(scratch, sx + dx, sy + dy, sw, sh)
    ctx.restore()
  }

  return {
    get available() { return !!landmarker },
    get loadError() { return loadError },
    async correct(video, canvas, strength = 0.5) {
      if (!landmarker || !video.videoWidth) return false
      let result: FaceLandmarkerResult
      try {
        result = landmarker.detectForVideo(video, performance.now())
      } catch { return false }
      const faces = result?.faceLandmarks
      if (!faces || !faces.length) return false
      const lm = faces[0]
      const ctx = canvas.getContext('2d')
      if (!ctx) return false
      const lt = eyeTransform(lm, LEFT_EYE,  canvas.width, canvas.height)
      const rt = eyeTransform(lm, RIGHT_EYE, canvas.width, canvas.height)
      if (lt) warpEye(canvas, ctx, lt, strength)
      if (rt) warpEye(canvas, ctx, rt, strength)
      return true
    },
    dispose() {
      try { landmarker?.close() } catch {/* ignore */}
      landmarker = null
    },
  }
}

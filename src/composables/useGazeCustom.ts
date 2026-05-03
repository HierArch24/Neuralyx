/**
 * Our own gaze-redirection — pure JS/Canvas2D, no external models beyond
 * the MediaPipe FaceLandmarker we already bundle. Two layered effects:
 *
 *   1. Radial warp: per-pixel iris→center pull with smooth Gaussian falloff
 *      so the eye region shifts coherently (no hard rectangle edges).
 *   2. Synthetic iris pop: a subtly darker iris disc drawn at the corrected
 *      position, anchored to the iris radius so it tracks blinks/squints.
 *
 * Strength 0..1 blends the warp and pop intensity together.
 */
import {
  FaceLandmarker,
  FilesetResolver,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'

const WASM_BASE = '/models/mediapipe'
const FACE_MODEL_URL = '/models/face_landmarker.task'

// Eye landmark groups (MediaPipe FaceMesh canonical)
const LEFT_EYE  = { corners: [33, 133],  vert: [159, 145], iris: [468, 469, 470, 471, 472] }
const RIGHT_EYE = { corners: [362, 263], vert: [386, 374], iris: [473, 474, 475, 476, 477] }

export interface GazeCustom {
  available: boolean
  loadError: string | null
  /** Last frame's face detection result — UI surfaces this so the user
   *  knows when correction can actually fire (no face → no warp). */
  faceDetected: boolean
  correct(video: HTMLVideoElement, canvas: HTMLCanvasElement, strength: number): Promise<boolean>
  dispose(): void
}

interface EyeRegion {
  cx: number; cy: number              // eye center in canvas-px
  irisX: number; irisY: number        // iris center
  irisR: number                       // iris radius (estimated)
  rx: number; ry: number              // ROI radii (rectangular bounding box)
}

function eyeRegion(lm: NormalizedLandmark[], spec: typeof LEFT_EYE, w: number, h: number): EyeRegion | null {
  const [c1, c2] = spec.corners
  const [vt, vb] = spec.vert
  const ic = spec.iris[0]
  const ir1 = spec.iris[1], ir3 = spec.iris[3]
  if (!lm[c1] || !lm[c2] || !lm[vt] || !lm[vb] || !lm[ic] || !lm[ir1] || !lm[ir3]) return null
  const x1 = lm[c1].x * w, x2 = lm[c2].x * w
  const y1 = lm[vt].y * h, y2 = lm[vb].y * h
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2
  const rx = Math.max(10, Math.abs(x2 - x1) / 2 + 8)
  const ry = Math.max(8,  Math.abs(y2 - y1) + 10)
  // Iris radius from horizontal extent of iris landmarks (469 left, 471 right)
  const irisR = Math.max(3, Math.abs(lm[ir1].x - lm[ir3].x) * w / 2)
  return {
    cx, cy,
    irisX: lm[ic].x * w, irisY: lm[ic].y * h,
    irisR, rx, ry,
  }
}

export async function createGazeCustom(): Promise<GazeCustom> {
  let landmarker: FaceLandmarker | null = null
  let loadError: string | null = null
  try {
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
    landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL_URL },
      runningMode: 'VIDEO',
      numFaces: 1,
    })
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e)
  }

  // Reusable canvases
  const scratch = document.createElement('canvas')
  const sctx = scratch.getContext('2d', { willReadFrequently: true })

  /** Per-pixel radial warp: each pixel within the eye ROI gets pulled toward
   *  the eye center by an amount that decays with distance from the iris. */
  function warpEye(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, eye: EyeRegion, strength: number) {
    if (!sctx) return
    const w = canvas.width, h = canvas.height
    const sx = Math.max(0, Math.floor(eye.cx - eye.rx))
    const sy = Math.max(0, Math.floor(eye.cy - eye.ry))
    const sw = Math.min(w - sx, Math.ceil(eye.rx * 2))
    const sh = Math.min(h - sy, Math.ceil(eye.ry * 2))
    if (sw < 4 || sh < 4) return

    scratch.width = sw
    scratch.height = sh
    sctx.clearRect(0, 0, sw, sh)
    sctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh)
    const src = sctx.getImageData(0, 0, sw, sh)
    const dst = sctx.createImageData(sw, sh)

    // Boost the warp by an extra factor so the visible shift is larger than
    // the raw iris displacement — small iris movements still produce a clear
    // "looking at camera" feel on video. Capped to avoid uncanny stretching.
    const BOOST = 2.2
    const dxBase = Math.max(-eye.rx * 0.8, Math.min(eye.rx * 0.8, (eye.cx - eye.irisX) * strength * BOOST))
    const dyBase = Math.max(-eye.ry * 0.8, Math.min(eye.ry * 0.8, (eye.cy - eye.irisY) * strength * BOOST))
    const sigma = Math.max(eye.irisR * 1.8, 10)
    const inv2sig2 = 1 / (2 * sigma * sigma)

    // Pixel center of iris within scratch coords
    const ixL = eye.irisX - sx
    const iyL = eye.irisY - sy

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const dxFromIris = x - ixL
        const dyFromIris = y - iyL
        const d2 = dxFromIris * dxFromIris + dyFromIris * dyFromIris
        const w0 = Math.exp(-d2 * inv2sig2)
        const srcX = Math.round(x - dxBase * w0)
        const srcY = Math.round(y - dyBase * w0)
        const sxC = Math.max(0, Math.min(sw - 1, srcX))
        const syC = Math.max(0, Math.min(sh - 1, srcY))
        const sIdx = (syC * sw + sxC) * 4
        const dIdx = (y * sw + x) * 4
        dst.data[dIdx]     = src.data[sIdx]
        dst.data[dIdx + 1] = src.data[sIdx + 1]
        dst.data[dIdx + 2] = src.data[sIdx + 2]
        dst.data[dIdx + 3] = 255
      }
    }
    sctx.putImageData(dst, 0, 0)

    // Composite warped patch back with elliptical alpha mask so the rectangle edges blend
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(eye.cx, eye.cy, eye.rx, eye.ry, 0, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(scratch, sx, sy, sw, sh)
    ctx.restore()
  }

  /** Draw a subtle darker iris disc at the corrected position so the
   *  redirected gaze reads more cleanly on camera. Color sampled from
   *  the existing iris pixels to match eye color. */
  // @ts-expect-error retained for future toggle but currently unused
  function popIris(_canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, eye: EyeRegion, strength: number) {
    const r = eye.irisR
    // Sample iris color from a tiny patch at the iris center
    let sr = 60, sg = 60, sb = 80
    try {
      const sample = ctx.getImageData(Math.round(eye.cx), Math.round(eye.cy), 1, 1).data
      sr = sample[0]; sg = sample[1]; sb = sample[2]
      // Push slightly darker for visibility
      sr = Math.round(sr * 0.7); sg = Math.round(sg * 0.7); sb = Math.round(sb * 0.75)
    } catch { /* getImageData may fail on tainted canvas — fall back to defaults */ }

    ctx.save()
    // Outer iris ring
    ctx.globalAlpha = 0.35 * strength
    ctx.fillStyle = `rgb(${sr},${sg},${sb})`
    ctx.beginPath()
    ctx.arc(eye.cx, eye.cy, r * 1.05, 0, Math.PI * 2)
    ctx.fill()
    // Pupil dot
    ctx.globalAlpha = 0.85 * strength
    ctx.fillStyle = '#0a0a0a'
    ctx.beginPath()
    ctx.arc(eye.cx, eye.cy, r * 0.42, 0, Math.PI * 2)
    ctx.fill()
    // Catch-light
    ctx.globalAlpha = 0.6 * strength
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(eye.cx + r * 0.18, eye.cy - r * 0.22, r * 0.18, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  let faceDetected = false
  return {
    get available() { return !!landmarker },
    get loadError() { return loadError },
    get faceDetected() { return faceDetected },
    async correct(video, canvas, strength = 0.7) {
      if (!landmarker || !video.videoWidth) { faceDetected = false; return false }
      let result
      try { result = landmarker.detectForVideo(video, performance.now()) } catch { faceDetected = false; return false }
      const faces = result?.faceLandmarks
      if (!faces?.length) { faceDetected = false; return false }
      faceDetected = true
      const lm = faces[0]
      const ctx = canvas.getContext('2d')
      if (!ctx) return false
      const left = eyeRegion(lm, LEFT_EYE,  canvas.width, canvas.height)
      const right = eyeRegion(lm, RIGHT_EYE, canvas.width, canvas.height)
      // Warp first so the synthetic iris sits on the corrected pixels
      // Pixel warp only — no synthetic iris pop. Keeps the user's real
      // eye pixels visible, only nudges them toward center.
      if (left)  warpEye(canvas, ctx, left,  strength)
      if (right) warpEye(canvas, ctx, right, strength)
      return true
    },
    dispose() {
      try { landmarker?.close() } catch { /* ignore */ }
      landmarker = null
    },
  }
}

/**
 * MediaPipe Selfie Segmenter (WebGL).
 *
 * Returns a single-channel person-mask canvas suitable for `destination-in`
 * compositing against the raw video frame.
 *
 * Smoothness pipeline:
 *   1. CONFIDENCE mask (continuous 0..1) instead of binary categories — feathered alpha.
 *   2. Per-pixel exponential moving average across frames — kills flicker.
 *   3. Light Gaussian blur on the alpha channel before compositing — softens silhouette edges.
 */
import {
  FilesetResolver,
  ImageSegmenter,
  type ImageSegmenterResult,
} from '@mediapipe/tasks-vision'

// Self-hosted from public/models/mediapipe/ — copied from the npm package's
// wasm/ folder. The CDN path on jsdelivr 404s for this package version, which
// silently failed segmenter init and made backgrounds appear to do nothing.
const WASM_BASE = '/models/mediapipe'

export interface SelfieSegmenter {
  segment(video: HTMLVideoElement): Promise<HTMLCanvasElement | null>
  dispose(): void
}

export async function createSegmenter(modelPath = '/models/selfie_segmenter.tflite'): Promise<SelfieSegmenter> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
  const segmenter = await ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelPath },
    runningMode: 'VIDEO',
    outputCategoryMask: false,
    outputConfidenceMasks: true,
  })

  const maskCanvas = document.createElement('canvas')
  // Persistent EMA buffer for temporal smoothing — same dims as the mask.
  // Closer to 1 = more responsive, more flicker. ~0.55 reads as smooth at 30fps.
  let ema: Float32Array | null = null
  const EMA_ALPHA = 0.55

  return {
    async segment(video: HTMLVideoElement) {
      if (!video.videoWidth || !video.videoHeight) return null
      const w = video.videoWidth, h = video.videoHeight
      if (maskCanvas.width !== w) maskCanvas.width = w
      if (maskCanvas.height !== h) maskCanvas.height = h
      let result: ImageSegmenterResult | undefined
      try { result = segmenter.segmentForVideo(video, performance.now()) }
      catch { return null }

      const masks = result?.confidenceMasks
      if (!masks?.length) return null
      const mask = masks[0]
      const conf = mask.getAsFloat32Array()
      if (!conf) { mask.close(); return null }

      const N = w * h
      if (!ema || ema.length !== N) ema = new Float32Array(conf)
      else {
        for (let i = 0; i < N; i++) ema[i] = EMA_ALPHA * conf[i] + (1 - EMA_ALPHA) * ema[i]
      }

      const ctx = maskCanvas.getContext('2d')
      if (!ctx) { mask.close(); return null }
      const img = ctx.createImageData(w, h)
      for (let i = 0, p = 0; i < N; i++, p += 4) {
        const a = Math.round(Math.max(0, Math.min(1, ema[i])) * 255)
        img.data[p] = 255
        img.data[p + 1] = 255
        img.data[p + 2] = 255
        img.data[p + 3] = a
      }
      ctx.putImageData(img, 0, 0)
      // Light Gaussian blur on the alpha so silhouette edges feather instead of zigzagging
      ctx.filter = 'blur(1.5px)'
      ctx.drawImage(maskCanvas, 0, 0)
      ctx.filter = 'none'
      mask.close()
      return maskCanvas
    },
    dispose() {
      try { segmenter.close() } catch { /* ignore */ }
    },
  }
}

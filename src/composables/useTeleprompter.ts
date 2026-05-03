/**
 * Teleprompter — scrolling script overlay rendered into a separate <canvas>
 * positioned over the recording stage so the reader looks AT the lens while
 * the words scroll right beneath it. This is the "honest" eye-contact fix:
 * the user really is looking at the camera, no warping needed.
 *
 * The overlay is a sibling of the recording canvas, NOT painted into it,
 * so the scrolling words DO NOT end up baked into the saved video.
 */
import { ref, computed, type Ref } from 'vue'

export interface TeleprompterState {
  enabled: Ref<boolean>
  script: Ref<string>
  fontPx: Ref<number>
  speedPxPerSec: Ref<number>
  mirror: Ref<boolean>
  paused: Ref<boolean>
  /** scroll progress in pixels from start of script */
  offsetPx: Ref<number>
  totalPx: Ref<number>
  progress: Ref<number>  // 0..1
}

export interface UseTeleprompter extends TeleprompterState {
  start(): void
  pause(): void
  reset(): void
  /** call from a render loop with the current frame timestamp; advances scroll */
  tick(now: number): void
  /** measure the rendered script height once layout is known */
  setTotalPx(px: number): void
}

export function useTeleprompter(): UseTeleprompter {
  const enabled = ref(false)
  const script = ref('')
  const fontPx = ref(34)
  const speedPxPerSec = ref(60)
  const mirror = ref(false)
  const paused = ref(true)
  const offsetPx = ref(0)
  const totalPx = ref(0)
  const progress = computed(() => {
    if (!totalPx.value) return 0
    return Math.min(1, Math.max(0, offsetPx.value / totalPx.value))
  })

  let lastTickMs = 0

  function start() { paused.value = false; lastTickMs = 0 }
  function pause() { paused.value = true }
  function reset() { offsetPx.value = 0; lastTickMs = 0 }

  function tick(now: number) {
    if (!enabled.value || paused.value) { lastTickMs = now; return }
    if (!lastTickMs) { lastTickMs = now; return }
    const dt = (now - lastTickMs) / 1000
    lastTickMs = now
    offsetPx.value += dt * speedPxPerSec.value
    if (totalPx.value && offsetPx.value > totalPx.value) {
      offsetPx.value = totalPx.value
      paused.value = true
    }
  }

  function setTotalPx(px: number) { totalPx.value = px }

  return {
    enabled, script, fontPx, speedPxPerSec, mirror, paused, offsetPx, totalPx, progress,
    start, pause, reset, tick, setTotalPx,
  }
}

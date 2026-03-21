import { ref, onMounted, onUnmounted } from 'vue'
import { ScrollTrigger } from '@/lib/gsap-setup'

export function useScrollVideo(videoRef: { value: HTMLVideoElement | null }) {
  const progress = ref(0)
  let scrollTriggerInstance: ScrollTrigger | null = null
  let rafId: number | null = null
  let targetTime = 0
  let currentSeekTime = 0

  onMounted(() => {
    const video = videoRef.value
    if (!video) return

    // Lerp-based seek loop — smoothly interpolates video.currentTime
    // instead of snapping, which causes decoder stutter
    const seekLoop = () => {
      if (video.duration) {
        // Lerp toward target (0.06 = very smooth, 0.15 = responsive)
        currentSeekTime += (targetTime - currentSeekTime) * 0.06
        const diff = Math.abs(video.currentTime - currentSeekTime)
        if (diff > 0.005) {
          if ('fastSeek' in video && typeof video.fastSeek === 'function') {
            video.fastSeek(currentSeekTime)
          } else {
            video.currentTime = currentSeekTime
          }
        }
      }
      rafId = requestAnimationFrame(seekLoop)
    }

    const setup = () => {
      if (video.duration) {
        currentSeekTime = 0
        targetTime = 0
      }

      scrollTriggerInstance = ScrollTrigger.create({
        trigger: document.body,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0,  // instant update from Lenis — lerp is handled in seekLoop
        onUpdate: (self) => {
          progress.value = self.progress
          if (video.duration) {
            targetTime = self.progress * video.duration
          }
        },
      })

      rafId = requestAnimationFrame(seekLoop)
    }

    if (video.readyState >= 1) {
      setup()
    } else {
      video.addEventListener('loadedmetadata', setup, { once: true })
    }
  })

  onUnmounted(() => {
    scrollTriggerInstance?.kill()
    if (rafId !== null) cancelAnimationFrame(rafId)
  })

  return { progress }
}

import { ref, onMounted, onUnmounted } from 'vue'
import { ScrollTrigger } from '@/lib/gsap-setup'

export function useScrollVideo(videoRef: { value: HTMLVideoElement | null }) {
  const progress = ref(0)
  let scrollTriggerInstance: ScrollTrigger | null = null

  onMounted(() => {
    const video = videoRef.value
    if (!video) return

    // Wait for video metadata to load
    const setup = () => {
      scrollTriggerInstance = ScrollTrigger.create({
        trigger: document.body,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.5,
        onUpdate: (self) => {
          progress.value = self.progress
          if (video.duration) {
            video.currentTime = self.progress * video.duration
          }
        },
      })
    }

    if (video.readyState >= 1) {
      setup()
    } else {
      video.addEventListener('loadedmetadata', setup, { once: true })
    }
  })

  onUnmounted(() => {
    scrollTriggerInstance?.kill()
  })

  return { progress }
}

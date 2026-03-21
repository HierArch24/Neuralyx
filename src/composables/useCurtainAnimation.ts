import { ref } from 'vue'
import { gsap } from '@/lib/gsap-setup'

export function useCurtainAnimation() {
  const isVisible = ref(true)
  const hasPlayed = ref(false)

  function play(curtainElements: HTMLElement[]) {
    if (hasPlayed.value || curtainElements.length === 0) return

    hasPlayed.value = true

    const tl = gsap.timeline({
      delay: 0.5,
      onComplete: () => {
        isVisible.value = false
      }
    })

    tl.to(curtainElements, {
      yPercent: -100,
      duration: 0.6,
      stagger: 0.2,
      ease: 'power3.inOut'
    })
  }

  return { isVisible, play, hasPlayed }
}

import { onMounted, onUnmounted } from 'vue'
import { gsap } from '@/lib/gsap-setup'

interface ParallaxOptions {
  speed?: number
  direction?: 'vertical' | 'horizontal'
  start?: string
  end?: string
}

export function useParallax(
  elementRef: { value: HTMLElement | null },
  options: ParallaxOptions = {},
) {
  const { speed = 0.5, direction = 'vertical', start = 'top bottom', end = 'bottom top' } = options
  let ctx: gsap.Context | null = null

  onMounted(() => {
    const el = elementRef.value
    if (!el) return

    ctx = gsap.context(() => {
      const prop = direction === 'vertical' ? 'y' : 'x'
      const distance = speed * 100

      gsap.fromTo(
        el,
        { [prop]: -distance },
        {
          [prop]: distance,
          ease: 'none',
          scrollTrigger: {
            trigger: el,
            start,
            end,
            scrub: true,
          },
        },
      )
    })
  })

  onUnmounted(() => {
    ctx?.revert()
  })
}

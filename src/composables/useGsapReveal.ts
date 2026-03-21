import { onUnmounted } from 'vue'
import { gsap } from '@/lib/gsap-setup'

export function useGsapReveal() {
  let ctx: gsap.Context | null = null

  function fadeIn(elements: string | HTMLElement | HTMLElement[], options?: {
    duration?: number
    delay?: number
    y?: number
    stagger?: number
    trigger?: string | HTMLElement
  }) {
    const opts = { duration: 0.8, delay: 0, y: 40, stagger: 0.1, ...options }

    gsap.from(elements, {
      y: opts.y,
      opacity: 0,
      duration: opts.duration,
      delay: opts.delay,
      stagger: opts.stagger,
      ease: 'power2.out',
      scrollTrigger: opts.trigger ? {
        trigger: opts.trigger,
        start: 'top 80%',
        toggleActions: 'play none none none'
      } : undefined
    })
  }

  function revealText(elements: string | HTMLElement | HTMLElement[], options?: {
    duration?: number
    delay?: number
    trigger?: string | HTMLElement
  }) {
    const opts = { duration: 1, delay: 0, ...options }

    gsap.from(elements, {
      clipPath: 'inset(0 100% 0 0)',
      opacity: 0,
      duration: opts.duration,
      delay: opts.delay,
      ease: 'power3.out',
      scrollTrigger: opts.trigger ? {
        trigger: opts.trigger,
        start: 'top 80%',
        toggleActions: 'play none none none'
      } : undefined
    })
  }

  function scrollReveal(elements: string | HTMLElement | HTMLElement[], options?: {
    y?: number
    duration?: number
    stagger?: number
    trigger?: string | HTMLElement
    start?: string
  }) {
    const opts = { y: 60, duration: 0.8, stagger: 0.15, start: 'top 85%', ...options }

    gsap.from(elements, {
      y: opts.y,
      opacity: 0,
      duration: opts.duration,
      stagger: opts.stagger,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: opts.trigger || elements,
        start: opts.start,
        toggleActions: 'play none none none'
      }
    })
  }

  function massFadeIn(elements: string | HTMLElement[], options?: {
    stagger?: number
    duration?: number
    trigger?: string | HTMLElement
  }) {
    const opts = { stagger: 0.08, duration: 0.6, ...options }

    gsap.from(elements, {
      scale: 0.8,
      opacity: 0,
      duration: opts.duration,
      stagger: opts.stagger,
      ease: 'back.out(1.2)',
      scrollTrigger: {
        trigger: opts.trigger || elements,
        start: 'top 85%',
        toggleActions: 'play none none none'
      }
    })
  }

  function parallaxScroll(element: string | HTMLElement, options?: {
    y?: number | string
    trigger?: string | HTMLElement
    start?: string
    end?: string
  }) {
    const opts = { y: 100, start: 'top bottom', end: 'bottom top', ...options }

    gsap.fromTo(element,
      { y: 0 },
      {
        y: opts.y,
        ease: 'none',
        scrollTrigger: {
          trigger: opts.trigger || element,
          start: opts.start,
          end: opts.end,
          scrub: true
        }
      }
    )
  }

  function createContext(scope: HTMLElement) {
    ctx = gsap.context(() => {}, scope)
    return ctx
  }

  onUnmounted(() => {
    ctx?.revert()
  })

  return { fadeIn, revealText, scrollReveal, massFadeIn, parallaxScroll, createContext }
}

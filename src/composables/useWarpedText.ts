import { onMounted, onUnmounted } from 'vue'
import { gsap } from '@/lib/gsap-setup'

export function useWarpedText(wrapperRef: { value: HTMLElement | null }, text: string) {
  let ctx: gsap.Context | null = null

  function init() {
    if (!wrapperRef.value) return

    const wrapper = wrapperRef.value
    wrapper.innerHTML = ''

    const cloneCount = 10
    const clones: HTMLElement[] = []

    for (let i = 0; i < cloneCount; i++) {
      const span = document.createElement('span')
      span.className = 'sk__warped-text'
      span.textContent = text
      span.style.top = `${(i / cloneCount) * 100}%`
      wrapper.appendChild(span)
      clones.push(span)
    }

    ctx = gsap.context(() => {
      clones.forEach((clone, i) => {
        const direction = i < cloneCount / 2 ? -1 : 1
        const distance = Math.abs(i - cloneCount / 2) * 15

        gsap.fromTo(clone,
          { x: direction * distance + '%' },
          {
            x: -direction * distance + '%',
            ease: 'none',
            scrollTrigger: {
              trigger: wrapper,
              start: 'top bottom',
              end: 'bottom top',
              scrub: 1
            }
          }
        )
      })
    }, wrapper)
  }

  onMounted(init)

  onUnmounted(() => {
    ctx?.revert()
  })

  return { init }
}

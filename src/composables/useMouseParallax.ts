import { ref, onMounted, onUnmounted, type Ref } from 'vue'

interface ParallaxLayer {
  element: HTMLElement
  depth: number
}

export function useMouseParallax(containerRef: Ref<HTMLElement | null>) {
  const layers = ref<ParallaxLayer[]>([])
  let rafId: number | null = null
  let targetX = 0
  let targetY = 0
  let currentX = 0
  let currentY = 0

  function onMouseMove(e: MouseEvent) {
    if (!containerRef.value) return
    const rect = containerRef.value.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    targetX = (e.clientX - centerX) / (rect.width / 2)
    targetY = (e.clientY - centerY) / (rect.height / 2)
  }

  function animate() {
    currentX += (targetX - currentX) * 0.08
    currentY += (targetY - currentY) * 0.08

    layers.value.forEach(({ element, depth }) => {
      const moveX = currentX * depth * 30
      const moveY = currentY * depth * 30
      element.style.transform = `translate3d(${moveX}px, ${moveY}px, 0)`
    })

    rafId = requestAnimationFrame(animate)
  }

  function initLayers() {
    if (!containerRef.value) return
    const els = containerRef.value.querySelectorAll<HTMLElement>('[data-depth]')
    layers.value = Array.from(els).map(el => ({
      element: el,
      depth: parseFloat(el.dataset.depth || '0')
    }))
  }

  onMounted(() => {
    initLayers()
    window.addEventListener('mousemove', onMouseMove)
    rafId = requestAnimationFrame(animate)
  })

  onUnmounted(() => {
    window.removeEventListener('mousemove', onMouseMove)
    if (rafId !== null) cancelAnimationFrame(rafId)
  })

  return { initLayers }
}

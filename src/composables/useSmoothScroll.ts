import Lenis from 'lenis'
import { gsap, ScrollTrigger } from '@/lib/gsap-setup'
import { onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'

let lenis: Lenis | null = null

function initLenis() {
  if (lenis) return
  lenis = new Lenis({
    lerp: 0.08,
    smoothWheel: true,
    syncTouch: true,
    wheelMultiplier: 1,
  })

  lenis.on('scroll', ScrollTrigger.update)

  gsap.ticker.add((time) => {
    lenis?.raf(time * 1000)
  })
  gsap.ticker.lagSmoothing(0)

  requestAnimationFrame(() => {
    ScrollTrigger.refresh()
  })
}

function destroyLenis() {
  if (!lenis) return
  lenis.destroy()
  lenis = null
}

export function useSmoothScroll() {
  const router = useRouter()

  function handleRoute(path: string) {
    const isAdmin = path.startsWith('/admin') || path === '/login'
    if (isAdmin) {
      destroyLenis()
    } else {
      initLenis()
    }
  }

  onMounted(() => {
    handleRoute(router.currentRoute.value.path)
  })

  watch(() => router.currentRoute.value.path, (path) => {
    handleRoute(path)
  })

  onUnmounted(() => {
    destroyLenis()
  })

  return { getLenis: () => lenis }
}

<template>
  <div ref="containerRef" class="parallax-mouse-layer relative w-full h-full">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const containerRef = ref<HTMLElement | null>(null)

interface Layer {
  el: HTMLElement
  depth: number
}

let layers: Layer[] = []
let rafId: number | null = null
let targetX = 0
let targetY = 0
let currentX = 0
let currentY = 0

function onMouseMove(e: MouseEvent) {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  targetX = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2)
  targetY = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2)
}

function animate() {
  currentX += (targetX - currentX) * 0.08
  currentY += (targetY - currentY) * 0.08
  layers.forEach(({ el, depth }) => {
    const moveX = currentX * depth * 50
    const moveY = currentY * depth * 50
    el.style.transform = `translate3d(${moveX}px, ${moveY}px, 0)`
  })
  rafId = requestAnimationFrame(animate)
}

onMounted(() => {
  if (!containerRef.value) return
  const els = containerRef.value.querySelectorAll<HTMLElement>('[data-depth]')
  layers = Array.from(els).map(el => ({
    el,
    depth: parseFloat(el.dataset.depth || '0')
  }))
  window.addEventListener('mousemove', onMouseMove)
  rafId = requestAnimationFrame(animate)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  if (rafId !== null) cancelAnimationFrame(rafId)
})
</script>

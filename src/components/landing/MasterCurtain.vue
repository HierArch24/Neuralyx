<template>
  <div v-if="isVisible" class="fixed inset-0 z-[9999] pointer-events-none">
    <div ref="leftRef" class="absolute inset-0 bg-neural-900" style="transform-origin: top"></div>
    <div ref="centerRef" class="absolute inset-0 bg-neural-800" style="transform-origin: top"></div>
    <div ref="rightRef" class="absolute inset-0 bg-neural-700" style="transform-origin: top"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { gsap } from '@/lib/gsap-setup'

const isVisible = ref(true)
const leftRef = ref<HTMLElement | null>(null)
const centerRef = ref<HTMLElement | null>(null)
const rightRef = ref<HTMLElement | null>(null)

onMounted(() => {
  const panels = [leftRef.value, centerRef.value, rightRef.value].filter(Boolean) as HTMLElement[]
  if (panels.length === 0) return

  gsap.to(panels, {
    yPercent: -100,
    duration: 0.6,
    stagger: 0.2,
    delay: 1.5,
    ease: 'power3.inOut',
    onComplete: () => {
      isVisible.value = false
    }
  })
})
</script>

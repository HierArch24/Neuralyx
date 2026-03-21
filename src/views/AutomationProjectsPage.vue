<template>
  <div class="min-h-screen py-24 px-6" style="background-color: var(--dark-shade-1)">
    <div class="max-w-6xl mx-auto">
      <router-link to="/" class="btn-outline-light mb-8 inline-block">&larr; Back</router-link>

      <h1 class="font-[Syncopate] text-[clamp(2rem,5vw,4rem)] font-bold uppercase bg-clip-text text-transparent mb-12"
          style="background-image: linear-gradient(135deg, var(--gradient-start), var(--gradient-mid), var(--gradient-end))">
        Automation Projects
      </h1>

      <div ref="gridRef" class="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div
          v-for="img in automationImages"
          :key="img"
          class="bg-white/5 border border-white/10 rounded-lg overflow-hidden hover:border-cyber-purple/30 transition-all duration-300 cursor-pointer"
          @click="openImage(img)"
        >
          <img :src="img" :alt="img" class="w-full object-contain" loading="lazy" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { gsap } from '@/lib/gsap-setup'

const gridRef = ref<HTMLElement | null>(null)

const automationImages = [
  '/assets/images/automation/1.png',
  '/assets/images/automation/2.png',
  '/assets/images/automation/3.png',
  '/assets/images/automation/4.png',
  '/assets/images/automation/5.png',
  '/assets/images/automation/6.png',
  '/assets/images/automation/7.png',
  '/assets/images/automation/8.png',
  '/assets/images/automation/9.png',
  '/assets/images/automation/10.png',
]

function openImage(src: string) {
  window.open(src, '_blank')
}

onMounted(() => {
  if (!gridRef.value) return
  const items = gridRef.value.querySelectorAll('div > div')
  gsap.from(items, {
    y: 30, opacity: 0, duration: 0.5, stagger: 0.08, ease: 'power2.out'
  })
})
</script>

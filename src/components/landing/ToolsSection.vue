<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { gsap } from '@/lib/gsap-setup'
import { useContentStore } from '@/stores/content'

const content = useContentStore()
const sectionRef = ref<HTMLElement | null>(null)

onMounted(() => {
  if (!sectionRef.value) return

  gsap.from(sectionRef.value.querySelectorAll('.tool-item'), {
    scale: 0.9,
    opacity: 0,
    duration: 0.4,
    stagger: 0.05,
    scrollTrigger: {
      trigger: sectionRef.value,
      start: 'top 70%',
    },
  })
})
</script>

<template>
  <section ref="sectionRef" class="relative py-32 px-6">
    <div class="max-w-6xl mx-auto">
      <h2 class="text-3xl md:text-5xl font-display font-bold text-center mb-4">
        <span class="text-gradient-angelic">Tools I Use</span>
      </h2>
      <p class="text-gray-400 text-center max-w-2xl mx-auto mb-16">
        The ecosystem of tools and platforms powering my workflow.
      </p>

      <div v-for="category in content.toolCategories" :key="category" class="mb-10">
        <h3 class="text-lg font-semibold text-gray-300 mb-4 capitalize">{{ category }}</h3>
        <div class="flex flex-wrap gap-3">
          <a
            v-for="tool in content.tools.filter(t => t.category === category)"
            :key="tool.id"
            :href="tool.url || undefined"
            :target="tool.url ? '_blank' : undefined"
            class="tool-item glass-dark rounded-lg px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:border-angelic-gold/30 transition-all"
          >
            <span v-if="tool.icon" class="mr-1.5">{{ tool.icon }}</span>
            {{ tool.name }}
          </a>
        </div>
      </div>

      <div class="text-center mt-6">
        <RouterLink
          to="/tools"
          class="inline-flex items-center gap-2 text-angelic-gold hover:text-white transition-colors"
        >
          See Full Toolkit
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </RouterLink>
      </div>
    </div>
  </section>
</template>

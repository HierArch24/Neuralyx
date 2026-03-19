<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { gsap } from '@/lib/gsap-setup'

const sectionRef = ref<HTMLElement | null>(null)

const tools = [
  { name: 'n8n', desc: 'Open-source workflow automation', color: '#ef6830' },
  { name: 'Zapier', desc: 'App integration platform', color: '#ff4a00' },
  { name: 'Make', desc: 'Visual automation builder', color: '#6d00cc' },
  { name: 'GitHub Actions', desc: 'CI/CD pipeline automation', color: '#2088ff' },
  { name: 'Docker', desc: 'Container orchestration', color: '#2496ed' },
  { name: 'Supabase', desc: 'Backend-as-a-Service', color: '#3ecf8e' },
]

onMounted(() => {
  if (!sectionRef.value) return

  // Animate pipeline connectors
  gsap.from(sectionRef.value.querySelectorAll('.auto-card'), {
    x: -40,
    opacity: 0,
    duration: 0.6,
    stagger: 0.12,
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
        <span class="text-gradient-cyber">Automation & Workflow</span>
      </h2>
      <p class="text-gray-400 text-center max-w-2xl mx-auto mb-16">
        Streamlining processes through intelligent automation pipelines.
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="tool in tools"
          :key="tool.name"
          class="auto-card glass-dark rounded-xl p-6 hover:border-cyber-purple/40 transition-all group"
        >
          <div
            class="w-3 h-3 rounded-full mb-4"
            :style="{ background: tool.color }"
          />
          <h3 class="text-lg font-semibold text-white group-hover:text-cyber-cyan transition-colors mb-1">
            {{ tool.name }}
          </h3>
          <p class="text-sm text-gray-400">{{ tool.desc }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

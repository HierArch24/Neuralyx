<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { gsap } from '@/lib/gsap-setup'

const sectionRef = ref<HTMLElement | null>(null)

const frameworks = [
  { name: 'LangChain', desc: 'LLM orchestration framework' },
  { name: 'CrewAI', desc: 'Multi-agent collaboration' },
  { name: 'AutoGen', desc: 'Autonomous AI agents' },
  { name: 'OpenAI API', desc: 'GPT integration & fine-tuning' },
  { name: 'Claude API', desc: 'Anthropic AI integration' },
  { name: 'HuggingFace', desc: 'Model hub & transformers' },
  { name: 'RAG Pipelines', desc: 'Retrieval-augmented generation' },
  { name: 'MCP Servers', desc: 'Model context protocol' },
]

onMounted(() => {
  if (!sectionRef.value) return

  gsap.from(sectionRef.value.querySelectorAll('.ai-card'), {
    y: 40,
    opacity: 0,
    duration: 0.6,
    stagger: 0.1,
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
        <span class="text-gradient-cyber">AI & Intelligence</span>
      </h2>
      <p class="text-gray-400 text-center max-w-2xl mx-auto mb-16">
        LLM frameworks, agent orchestration, and neural network engineering.
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          v-for="fw in frameworks"
          :key="fw.name"
          class="ai-card glass-dark rounded-xl p-6 hover:border-cyber-purple/40 transition-all group relative overflow-hidden"
        >
          <!-- Glow effect -->
          <div class="absolute inset-0 bg-gradient-to-br from-cyber-purple/5 to-cyber-blue/5 opacity-0 group-hover:opacity-100 transition-opacity" />

          <div class="relative z-10">
            <h3 class="text-lg font-semibold text-white group-hover:text-cyber-cyan transition-colors mb-1">
              {{ fw.name }}
            </h3>
            <p class="text-sm text-gray-400">{{ fw.desc }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

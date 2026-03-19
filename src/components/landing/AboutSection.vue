<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { gsap } from '@/lib/gsap-setup'

const sectionRef = ref<HTMLElement | null>(null)

const specializations = [
  { icon: '🧠', title: 'AI & Machine Learning', desc: 'Neural networks, NLP, computer vision, and intelligent agent systems' },
  { icon: '⚡', title: 'Automation Engineering', desc: 'n8n, Zapier, Make — building pipelines that eliminate manual work' },
  { icon: '🔗', title: 'Full-Stack Development', desc: 'Vue, React, Node, Python — end-to-end application architecture' },
  { icon: '🤖', title: 'LLM & Agent Frameworks', desc: 'LangChain, CrewAI, AutoGen — orchestrating AI agents at scale' },
]

onMounted(() => {
  if (!sectionRef.value) return

  gsap.from(sectionRef.value.querySelectorAll('.spec-card'), {
    y: 60,
    opacity: 0,
    duration: 0.8,
    stagger: 0.15,
    scrollTrigger: {
      trigger: sectionRef.value,
      start: 'top 70%',
    },
  })
})
</script>

<template>
  <section id="about" ref="sectionRef" class="relative py-32 px-6">
    <div class="max-w-6xl mx-auto">
      <h2 class="text-3xl md:text-5xl font-display font-bold text-center mb-4">
        <span class="text-gradient-cyber">Core Specializations</span>
      </h2>
      <p class="text-gray-400 text-center max-w-2xl mx-auto mb-16">
        Engineering intelligent systems that bridge the gap between AI capabilities and real-world applications.
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div
          v-for="spec in specializations"
          :key="spec.title"
          class="spec-card glass-dark rounded-xl p-8 hover:border-cyber-purple/40 transition-all duration-300 group"
        >
          <div class="text-4xl mb-4">{{ spec.icon }}</div>
          <h3 class="text-xl font-semibold text-white mb-2 group-hover:text-cyber-cyan transition-colors">
            {{ spec.title }}
          </h3>
          <p class="text-gray-400 leading-relaxed">{{ spec.desc }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

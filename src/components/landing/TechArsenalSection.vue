<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { gsap } from '@/lib/gsap-setup'
import { useContentStore } from '@/stores/content'

const content = useContentStore()
const sectionRef = ref<HTMLElement | null>(null)
const activeCategory = ref<string | null>(null)

const categoryLabels: Record<string, string> = {
  programming: 'Programming',
  database: 'Database',
  'ml-ai': 'ML / AI',
  llm: 'LLM & Agents',
  automation: 'Automation',
  'full-stack': 'Full-Stack',
  mobile: 'Mobile',
  'game-dev': 'Game Dev',
  cloud: 'Cloud',
}

const displayCategories = computed(() => {
  const cats = content.skillCategories
  return cats.length ? cats : Object.keys(categoryLabels)
})

const filteredSkills = computed(() => {
  if (!activeCategory.value) return content.skills
  return content.skills.filter((s) => s.category === activeCategory.value)
})

onMounted(() => {
  if (!sectionRef.value) return

  gsap.from(sectionRef.value.querySelectorAll('.skill-card'), {
    scale: 0.8,
    opacity: 0,
    duration: 0.5,
    stagger: 0.05,
    scrollTrigger: {
      trigger: sectionRef.value,
      start: 'top 70%',
    },
  })
})
</script>

<template>
  <section id="skills" ref="sectionRef" class="relative py-32 px-6">
    <div class="max-w-6xl mx-auto">
      <h2 class="text-3xl md:text-5xl font-display font-bold text-center mb-4">
        <span class="text-gradient-cyber">Tech Arsenal</span>
      </h2>
      <p class="text-gray-400 text-center max-w-2xl mx-auto mb-12">
        Tools and technologies I work with across the full development spectrum.
      </p>

      <!-- Category filter -->
      <div class="flex flex-wrap justify-center gap-2 mb-12">
        <button
          @click="activeCategory = null"
          class="px-4 py-2 rounded-full text-sm transition-all"
          :class="!activeCategory ? 'bg-cyber-purple text-white' : 'bg-neural-700 text-gray-300 hover:bg-neural-600'"
        >
          All
        </button>
        <button
          v-for="cat in displayCategories"
          :key="cat"
          @click="activeCategory = cat"
          class="px-4 py-2 rounded-full text-sm transition-all"
          :class="activeCategory === cat ? 'bg-cyber-purple text-white' : 'bg-neural-700 text-gray-300 hover:bg-neural-600'"
        >
          {{ categoryLabels[cat] || cat }}
        </button>
      </div>

      <!-- Skills grid -->
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div
          v-for="skill in filteredSkills"
          :key="skill.id"
          class="skill-card glass-dark rounded-xl p-4 text-center hover:border-cyber-purple/40 transition-all group"
        >
          <div v-if="skill.icon" class="text-2xl mb-2">{{ skill.icon }}</div>
          <p class="text-sm font-medium text-white group-hover:text-cyber-cyan transition-colors">
            {{ skill.name }}
          </p>
          <div class="mt-2 h-1.5 bg-neural-700 rounded-full overflow-hidden">
            <div
              class="h-full bg-gradient-to-r from-cyber-purple to-cyber-cyan rounded-full transition-all duration-700"
              :style="{ width: `${skill.proficiency}%` }"
            />
          </div>
          <p class="text-xs text-gray-500 mt-1">{{ skill.proficiency }}%</p>
        </div>
      </div>

      <div class="text-center mt-10">
        <RouterLink
          to="/skills"
          class="inline-flex items-center gap-2 text-cyber-cyan hover:text-white transition-colors"
        >
          View All Skills
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </RouterLink>
      </div>
    </div>
  </section>
</template>

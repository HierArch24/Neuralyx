<script setup lang="ts">
import { useContentStore } from '@/stores/content'

const content = useContentStore()

const categoryLabels: Record<string, string> = {
  programming: 'Programming Languages',
  database: 'Database & Storage',
  'ml-ai': 'Machine Learning & AI',
  llm: 'LLM & Agent Frameworks',
  automation: 'Automation',
  'full-stack': 'Full-Stack Development',
  mobile: 'Mobile Development',
  'game-dev': 'Game Development',
  cloud: 'Cloud & DevOps',
}
</script>

<template>
  <div class="min-h-screen pt-24 px-6 pb-16">
    <div class="max-w-6xl mx-auto">
      <h1 class="text-4xl md:text-5xl font-display font-bold mb-4">
        <span class="text-gradient-cyber">Skills & Expertise</span>
      </h1>
      <p class="text-gray-400 mb-12">Detailed breakdown by category.</p>

      <div v-for="category in content.skillCategories" :key="category" class="mb-12">
        <h2 class="text-2xl font-display font-bold text-white mb-6">
          {{ categoryLabels[category] || category }}
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="skill in content.getSkillsByCategory(category).value"
            :key="skill.id"
            class="glass-dark rounded-xl p-5"
          >
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <span v-if="skill.icon" class="text-xl">{{ skill.icon }}</span>
                <span class="font-medium text-white">{{ skill.name }}</span>
              </div>
              <span class="text-sm text-cyber-cyan">{{ skill.proficiency }}%</span>
            </div>
            <div class="h-2 bg-neural-700 rounded-full overflow-hidden">
              <div
                class="h-full bg-gradient-to-r from-cyber-purple to-cyber-cyan rounded-full"
                :style="{ width: `${skill.proficiency}%` }"
              />
            </div>
            <p v-if="skill.years_experience" class="text-xs text-gray-500 mt-2">
              {{ skill.years_experience }} year{{ skill.years_experience !== 1 ? 's' : '' }} experience
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

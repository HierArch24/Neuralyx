<script setup lang="ts">
import { ref, computed } from 'vue'
import { useContentStore } from '@/stores/content'

const content = useContentStore()
const activeCategory = ref<string | null>(null)

const categories = computed(() => {
  const cats = new Set(content.projects.map((p) => p.category))
  return Array.from(cats).sort()
})

const filtered = computed(() => {
  if (!activeCategory.value) return content.projects
  return content.projects.filter((p) => p.category === activeCategory.value)
})
</script>

<template>
  <div class="min-h-screen pt-24 px-6 pb-16">
    <div class="max-w-6xl mx-auto">
      <h1 class="text-4xl md:text-5xl font-display font-bold mb-4">
        <span class="text-gradient-cyber">Project Showcase</span>
      </h1>
      <p class="text-gray-400 mb-12">All projects and works.</p>

      <!-- Filters -->
      <div class="flex flex-wrap gap-2 mb-10">
        <button
          @click="activeCategory = null"
          class="px-4 py-2 rounded-full text-sm transition-all"
          :class="!activeCategory ? 'bg-cyber-purple text-white' : 'bg-neural-700 text-gray-300 hover:bg-neural-600'"
        >
          All
        </button>
        <button
          v-for="cat in categories"
          :key="cat"
          @click="activeCategory = cat"
          class="px-4 py-2 rounded-full text-sm capitalize transition-all"
          :class="activeCategory === cat ? 'bg-cyber-purple text-white' : 'bg-neural-700 text-gray-300 hover:bg-neural-600'"
        >
          {{ cat }}
        </button>
      </div>

      <!-- Project grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="project in filtered"
          :key="project.id"
          class="glass-dark rounded-xl overflow-hidden group hover:border-cyber-purple/40 transition-all"
        >
          <div class="aspect-video bg-neural-700 overflow-hidden">
            <img
              v-if="project.image_url"
              :src="project.image_url"
              :alt="project.title"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          </div>
          <div class="p-6">
            <div class="flex flex-wrap gap-2 mb-3">
              <span
                v-for="tech in project.tech_stack"
                :key="tech"
                class="text-xs px-2 py-1 rounded-full bg-cyber-purple/20 text-cyber-purple"
              >
                {{ tech }}
              </span>
            </div>
            <h3 class="text-lg font-semibold text-white mb-2">{{ project.title }}</h3>
            <p class="text-sm text-gray-400 line-clamp-3">{{ project.description.replace(/<[^>]*>/g, '').substring(0, 150) }}{{ project.description.length > 150 ? '...' : '' }}</p>
            <div class="flex gap-3 mt-4">
              <router-link :to="'/projects/' + project.slug" class="text-sm text-cyber-cyan hover:text-white transition-colors">
                View Details &rarr;
              </router-link>
              <a v-if="project.github_url" :href="project.github_url" target="_blank" class="text-sm text-gray-400 hover:text-white">GitHub</a>
              <a v-if="project.live_url" :href="project.live_url" target="_blank" class="text-sm text-cyber-cyan/60 hover:text-white">Live</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

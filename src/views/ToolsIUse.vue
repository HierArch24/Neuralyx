<script setup lang="ts">
import { useContentStore } from '@/stores/content'

const content = useContentStore()
</script>

<template>
  <div class="min-h-screen pt-24 px-6 pb-16">
    <div class="max-w-6xl mx-auto">
      <h1 class="text-4xl md:text-5xl font-display font-bold mb-4">
        <span class="text-gradient-angelic">Tools I Use</span>
      </h1>
      <p class="text-gray-400 mb-12">The complete toolkit powering my workflow.</p>

      <div v-for="category in content.toolCategories" :key="category" class="mb-12">
        <h2 class="text-2xl font-display font-bold text-white mb-6 capitalize">{{ category }}</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <a
            v-for="tool in content.tools.filter(t => t.category === category)"
            :key="tool.id"
            :href="tool.url || undefined"
            :target="tool.url ? '_blank' : undefined"
            class="glass-dark rounded-xl p-5 group hover:border-angelic-gold/30 transition-all"
          >
            <div class="flex items-center gap-3 mb-2">
              <span v-if="tool.icon" class="text-xl">{{ tool.icon }}</span>
              <span class="font-medium text-white group-hover:text-angelic-gold transition-colors">{{ tool.name }}</span>
            </div>
            <p v-if="tool.description" class="text-sm text-gray-400">{{ tool.description }}</p>
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<template>
  <div class="min-h-screen flex flex-col" style="background-color: var(--dark-shade-1)">
    <!-- Nav -->
    <div class="py-4 px-6">
      <router-link to="/" class="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
        <img src="/assets/images/neuralyx-logo.jpg" alt="NEURALYX" class="h-8 w-8 rounded-lg" />
        <span class="font-display font-bold text-gradient-cyber">NEURALYX</span>
      </router-link>
    </div>

    <!-- Loading -->
    <div v-if="!project" class="flex-1 flex items-center justify-center">
      <p class="text-gray-500 text-sm">{{ notFound ? 'Video not found.' : 'Loading...' }}</p>
    </div>

    <!-- Video Player -->
    <div v-else class="flex-1 flex flex-col max-w-5xl mx-auto w-full px-6 pb-12">
      <div class="relative rounded-2xl overflow-hidden bg-black border border-white/[0.06] mb-6">
        <video
          :src="project.video_url!"
          controls
          autoplay
          class="w-full aspect-video"
          controlsList="nodownload"
        />
      </div>

      <h1 class="text-xl font-bold text-white mb-2">{{ project.title }}</h1>
      <p class="text-gray-400 text-sm mb-4">{{ project.description }}</p>

      <div class="flex flex-wrap gap-2 mb-6">
        <span v-for="tech in project.tech_stack" :key="tech"
          class="px-2 py-1 text-[10px] rounded bg-cyber-purple/10 text-cyber-purple border border-cyber-purple/20">
          {{ tech }}
        </span>
      </div>

      <div class="flex gap-3">
        <a v-if="project.github_url" :href="project.github_url" target="_blank"
          class="px-4 py-2 text-xs bg-neural-700 text-gray-300 rounded-lg hover:text-white transition-colors">
          GitHub
        </a>
        <a v-if="project.live_url" :href="project.live_url" target="_blank"
          class="px-4 py-2 text-xs bg-neural-700 text-gray-300 rounded-lg hover:text-white transition-colors">
          Live Demo
        </a>
        <router-link to="/projects"
          class="px-4 py-2 text-xs bg-neural-700 text-gray-300 rounded-lg hover:text-white transition-colors">
          View All Projects
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useContentStore } from '@/stores/content'

const route = useRoute()
const content = useContentStore()
const project = ref<any>(null)
const notFound = ref(false)

onMounted(async () => {
  if (!content.loaded) await content.fetchAll()
  const slug = route.params.slug as string
  const found = content.projects.find(p => p.slug === slug && (p as any).video_url)
  if (found) {
    project.value = found
  } else {
    notFound.value = true
  }
})
</script>

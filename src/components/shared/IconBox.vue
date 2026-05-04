<template>
  <div class="sk__iconbox">
    <!-- Image or fallback icon -->
    <div class="mb-4 rounded-lg overflow-hidden">
      <img v-if="imageUrl" :src="imageUrl" :alt="title" class="w-full h-40 object-cover rounded-lg" loading="lazy" />
      <div v-else class="flex justify-center py-4">
        <span class="sk__iconbox-icon sk__flex-center">
          <span class="sk__gradient-fancy-text text-2xl">&#9670;</span>
        </span>
      </div>
    </div>
    <span v-if="!imageUrl" class="sk__iconbox-icon-dash"></span>
    <h5 class="text-white">{{ title }}</h5>
    <ul class="list-none p-0 mb-4">
      <li v-for="tech in techStack" :key="tech" class="text-white/60 text-sm">{{ tech }}</li>
    </ul>
    <div class="flex gap-2 flex-wrap">
      <button v-if="videoUrl" @click="$emit('play', videoUrl, title)"
        class="btn-primary rounded inline-block cursor-pointer">
        ▶ Watch Demo
      </button>
      <a v-if="liveUrl" :href="liveUrl" target="_blank" rel="noopener noreferrer"
        class="px-4 py-2 text-sm border border-white/20 text-white/70 hover:text-white hover:border-white/40 rounded transition-colors inline-block">
        Live Demo
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  techStack: string[]
  videoUrl?: string
  imageUrl?: string
  liveUrl?: string
}>()

defineEmits<{
  play: [src: string, title: string]
}>()
</script>

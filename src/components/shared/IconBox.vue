<template>
  <div class="sk__iconbox">
    <div class="flex justify-center">
      <span class="sk__iconbox-icon sk__flex-center">
        <span class="sk__gradient-fancy-text text-2xl">&#9670;</span>
      </span>
    </div>
    <span class="sk__iconbox-icon-dash"></span>
    <h5 class="text-white">{{ title }}</h5>
    <ul class="list-none p-0 mb-4">
      <li v-for="tech in techStack" :key="tech" class="text-white/60 text-sm">{{ tech }}</li>
    </ul>
    <a
      :href="videoUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="btn-primary rounded inline-block"
    >
      Watch Overview
    </a>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  techStack: string[]
  videoUrl: string
}>()
</script>

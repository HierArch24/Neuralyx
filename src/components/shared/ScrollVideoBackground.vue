<script setup lang="ts">
import { ref } from 'vue'
import { useScrollVideo } from '@/composables/useScrollVideo'

const videoRef = ref<HTMLVideoElement | null>(null)
const { progress } = useScrollVideo(videoRef)
</script>

<template>
  <div class="fixed inset-0 z-0">
    <video
      ref="videoRef"
      class="w-full h-full object-cover"
      :src="'/assets/videos/vid-t.mp4'"
      muted
      playsinline
      preload="auto"
    />
    <!-- Dark overlay that lightens as scroll progresses -->
    <div
      class="absolute inset-0 transition-opacity duration-200"
      :style="{
        background: `linear-gradient(to bottom, rgba(10,10,18,${0.6 - progress * 0.3}), rgba(10,10,18,${0.8 - progress * 0.4}))`,
      }"
    />
  </div>
</template>

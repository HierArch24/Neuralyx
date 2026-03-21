<template>
  <div class="sk__portfolio-item group">
    <a class="sk__portfolio-thumblink block relative cursor-pointer overflow-hidden" @click="$emit('play')">
      <div class="sk__pt-link-icon">
        <div class="sk__pt-link-icon-ovr-1"></div>
        <div class="sk__pt-link-icon-ovr-2"></div>
      </div>
      <div
        class="sk__portfolio-thumblink-image sk__image-back-cover"
        :style="{ backgroundImage: `url('${thumbnail}')` }"
      ></div>
      <div class="portfolio-thumb-info">
        <h6 :style="accentColor ? { '-webkit-text-stroke': `1px ${accentColor}`, color: 'white' } : {}">
          {{ category }}
        </h6>
        <h4 class="h4-small">{{ name }}</h4>
        <p>View Project</p>
      </div>
    </a>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  name: string
  category: string
  thumbnail: string
  accentColor?: string
}>()

defineEmits<{
  play: []
}>()
</script>

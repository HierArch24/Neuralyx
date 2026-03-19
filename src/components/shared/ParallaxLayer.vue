<script setup lang="ts">
import { ref } from 'vue'
import { useParallax } from '@/composables/useParallax'

const props = withDefaults(
  defineProps<{
    speed?: number
    direction?: 'vertical' | 'horizontal'
    class?: string
  }>(),
  { speed: 0.3, direction: 'vertical' },
)

const el = ref<HTMLElement | null>(null)
useParallax(el, { speed: props.speed, direction: props.direction })
</script>

<template>
  <div ref="el" :class="props.class">
    <slot />
  </div>
</template>

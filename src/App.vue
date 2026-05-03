<script setup lang="ts">
import { onMounted } from 'vue'
import { useContentStore } from '@/stores/content'
import { useSmoothScroll } from '@/composables/useSmoothScroll'
import ApplyToast from '@/components/shared/ApplyToast.vue'

const content = useContentStore()
useSmoothScroll()

onMounted(() => {
  content.fetchAll()
})
</script>

<template>
  <RouterView />
  <ApplyToast />
</template>

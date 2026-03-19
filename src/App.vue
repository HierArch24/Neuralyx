<script setup lang="ts">
import { onMounted } from 'vue'
import { useContentStore } from '@/stores/content'

const content = useContentStore()

onMounted(() => {
  content.fetchAll()
})
</script>

<template>
  <RouterView />
</template>

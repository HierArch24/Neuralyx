<script setup lang="ts">
import { ref } from 'vue'

const iframeUrl = ref('https://gitnexus.vercel.app')
const isLoading = ref(true)

function onLoad() {
  isLoading.value = false
}
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-5.5rem)]">
    <!-- Header -->
    <div class="flex items-center justify-between mb-3 flex-shrink-0">
      <div>
        <h2 class="text-2xl font-bold text-white">Git Nexus</h2>
        <p class="text-gray-400 text-sm mt-1">Zero-Server Code Intelligence Engine</p>
      </div>
      <a
        :href="iframeUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="px-3 py-2 bg-neural-700 hover:bg-neural-600 text-gray-300 rounded-lg text-sm transition-colors flex items-center gap-2"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
        Open in New Tab
      </a>
    </div>

    <!-- Iframe Container -->
    <div class="flex-1 relative rounded-xl overflow-hidden border border-neural-600 bg-white">
      <!-- Loading overlay -->
      <div v-if="isLoading" class="absolute inset-0 z-10 flex items-center justify-center bg-neural-900/80">
        <div class="flex flex-col items-center gap-3">
          <div class="w-8 h-8 border-2 border-cyber-purple border-t-transparent rounded-full animate-spin"></div>
          <p class="text-sm text-gray-400">Loading GitNexus...</p>
        </div>
      </div>

      <iframe
        :src="iframeUrl"
        class="w-full h-full border-0"
        @load="onLoad"
        allow="clipboard-read; clipboard-write"
      ></iframe>
    </div>
  </div>
</template>

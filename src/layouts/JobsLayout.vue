<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const sidebarOpen = ref(true)

const sidebarLinks = [
  { name: 'admin-jobs', label: 'Dashboard', icon: '📊' },
  { name: 'admin-jobs-search', label: 'Search Jobs', icon: '🔍' },
  { name: 'admin-jobs-applications', label: 'Applications', icon: '📋' },
  { name: 'admin-jobs-profile', label: 'Profile', icon: '👤' },
  { name: 'admin-jobs-agent', label: 'AI Agent', icon: '🤖' },
]
</script>

<template>
  <div class="flex min-h-screen bg-neural-900">
    <!-- Sidebar -->
    <aside
      class="bg-neural-800 border-r border-neural-600 flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden"
      :class="sidebarOpen ? 'w-64' : 'w-16'"
    >
      <!-- Header -->
      <div class="p-4 border-b border-neural-600 flex items-center" :class="sidebarOpen ? 'justify-between' : 'justify-center'">
        <div v-if="sidebarOpen" class="flex items-center gap-2 min-w-0">
          <span class="text-lg">💼</span>
          <span class="text-base font-display text-gradient-cyber font-bold truncate">Jobs Pipeline</span>
        </div>
        <button
          @click="sidebarOpen = !sidebarOpen"
          class="w-8 h-8 flex items-center justify-center rounded-lg bg-neural-700 hover:bg-neural-600 text-gray-400 hover:text-white transition-colors flex-shrink-0"
        >
          <svg class="w-4 h-4 transition-transform duration-300" :class="{ 'rotate-180': !sidebarOpen }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      <!-- Back to Admin -->
      <div class="p-2">
        <RouterLink
          :to="{ name: 'admin-dashboard' }"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:bg-neural-700 hover:text-white transition-colors"
          :class="sidebarOpen ? '' : 'justify-center'"
          :title="!sidebarOpen ? 'Back to Admin' : undefined"
        >
          <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span v-if="sidebarOpen" class="text-sm">Back to Admin</span>
        </RouterLink>
      </div>

      <div class="mx-3 border-t border-neural-700/50"></div>

      <!-- Nav links -->
      <nav class="flex-1 p-2 space-y-1 overflow-y-auto">
        <RouterLink
          v-for="link in sidebarLinks"
          :key="link.name"
          :to="{ name: link.name }"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-300 hover:bg-neural-700 hover:text-white transition-colors"
          :class="sidebarOpen ? '' : 'justify-center'"
          active-class="!bg-cyber-purple/20 !text-cyber-purple"
          :title="!sidebarOpen ? link.label : undefined"
        >
          <span class="text-base flex-shrink-0">{{ link.icon }}</span>
          <span v-if="sidebarOpen" class="text-sm truncate">{{ link.label }}</span>
        </RouterLink>
      </nav>

      <!-- Footer -->
      <div class="p-3 border-t border-neural-600">
        <p v-if="sidebarOpen" class="text-xs text-gray-500 mb-2 truncate">{{ auth.user?.email }}</p>
        <RouterLink
          :to="{ name: 'admin-dashboard' }"
          class="w-full px-3 py-2 text-sm bg-neural-700 hover:bg-neural-600 text-gray-300 hover:text-white rounded-lg transition-colors flex items-center gap-2"
          :class="sidebarOpen ? '' : 'justify-center'"
          :title="!sidebarOpen ? 'Admin Panel' : undefined"
        >
          <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span v-if="sidebarOpen">Admin Panel</span>
        </RouterLink>
      </div>
    </aside>

    <!-- Main Content -->
    <div class="flex-1 flex flex-col min-w-0">
      <header class="h-14 border-b border-neural-600 flex items-center justify-between px-6 flex-shrink-0">
        <div class="flex items-center gap-3">
          <button
            @click="sidebarOpen = !sidebarOpen"
            class="mr-2 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-neural-700 text-gray-400 hover:text-white transition-colors lg:hidden"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 class="text-lg font-semibold text-white">Job Application Pipeline</h1>
        </div>
        <div class="flex items-center gap-2 text-xs text-gray-500">
          <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
          AI Agent Ready
        </div>
      </header>

      <main class="flex-1 p-6 overflow-y-auto">
        <RouterView />
      </main>
    </div>
  </div>
</template>

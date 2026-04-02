<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const auth = useAuthStore()
const router = useRouter()
const sidebarOpen = ref(true)

async function handleLogout() {
  await auth.logout()
  router.push({ name: 'login' })
}

const sidebarLinks = [
  { name: 'admin-dashboard', label: 'Dashboard', icon: '📊' },
  { name: 'admin-projects', label: 'Projects', icon: '📁' },
  { name: 'admin-skills', label: 'Skills', icon: '⚡' },
  { name: 'admin-tools', label: 'Tools', icon: '🔧' },
  { name: 'admin-news', label: 'News', icon: '📰' },
  { name: 'admin-resume', label: 'Resume', icon: '📋' },
  { name: 'admin-sections', label: 'Sections', icon: '📄' },
  { name: 'admin-messages', label: 'Messages', icon: '✉️' },
  { name: 'admin-connections', label: 'Connections', icon: '🔗' },
  { name: 'admin-git-nexus', label: 'Git Nexus', icon: '🌐' },
  { name: 'admin-certificates', label: 'Certificates', icon: '🏆' },
  { name: 'admin-credentials', label: 'Credentials', icon: '🔐' },
  { name: 'admin-jobs', label: 'Jobs Pipeline', icon: '💼' },
]
</script>

<template>
  <div class="flex min-h-screen bg-neural-900">
    <!-- Sidebar -->
    <aside
      class="bg-neural-800 border-r border-neural-600 flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden"
      :class="sidebarOpen ? 'w-64' : 'w-16'"
    >
      <!-- Logo -->
      <div class="p-4 border-b border-neural-600 flex items-center" :class="sidebarOpen ? 'justify-between' : 'justify-center'">
        <RouterLink v-if="sidebarOpen" to="/" class="text-xl font-display text-gradient-cyber font-bold truncate">
          NEURALYX
        </RouterLink>
        <button
          @click="sidebarOpen = !sidebarOpen"
          class="w-8 h-8 flex items-center justify-center rounded-lg bg-neural-700 hover:bg-neural-600 text-gray-400 hover:text-white transition-colors flex-shrink-0"
        >
          <svg class="w-4 h-4 transition-transform duration-300" :class="{ 'rotate-180': !sidebarOpen }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

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
        <button
          @click="handleLogout"
          class="w-full px-3 py-2 text-sm bg-neural-700 hover:bg-red-900/50 text-gray-300 hover:text-red-400 rounded-lg transition-colors flex items-center gap-2"
          :class="sidebarOpen ? '' : 'justify-center'"
          :title="!sidebarOpen ? 'Logout' : undefined"
        >
          <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span v-if="sidebarOpen">Logout</span>
        </button>
      </div>
    </aside>

    <!-- Main Content -->
    <div class="flex-1 flex flex-col min-w-0">
      <header class="h-14 border-b border-neural-600 flex items-center px-6 flex-shrink-0">
        <button
          @click="sidebarOpen = !sidebarOpen"
          class="mr-4 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-neural-700 text-gray-400 hover:text-white transition-colors lg:hidden"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 class="text-lg font-semibold text-white">Admin Dashboard</h1>
      </header>

      <main class="flex-1 p-6 overflow-y-auto">
        <RouterView />
      </main>
    </div>
  </div>
</template>

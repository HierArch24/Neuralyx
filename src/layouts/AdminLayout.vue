<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const auth = useAuthStore()
const router = useRouter()

async function handleLogout() {
  await auth.logout()
  router.push({ name: 'login' })
}

const sidebarLinks = [
  { name: 'admin-dashboard', label: 'Dashboard', icon: '📊' },
  { name: 'admin-projects', label: 'Projects', icon: '📁' },
  { name: 'admin-skills', label: 'Skills', icon: '⚡' },
  { name: 'admin-tools', label: 'Tools', icon: '🔧' },
  { name: 'admin-sections', label: 'Sections', icon: '📄' },
  { name: 'admin-messages', label: 'Messages', icon: '✉️' },
]
</script>

<template>
  <div class="flex min-h-screen bg-neural-900">
    <!-- Sidebar -->
    <aside class="w-64 bg-neural-800 border-r border-neural-600 flex flex-col">
      <div class="p-6 border-b border-neural-600">
        <RouterLink to="/" class="text-xl font-display text-gradient-cyber font-bold">
          NEURALYX
        </RouterLink>
        <p class="text-sm text-gray-400 mt-1">Admin Panel</p>
      </div>

      <nav class="flex-1 p-4 space-y-1">
        <RouterLink
          v-for="link in sidebarLinks"
          :key="link.name"
          :to="{ name: link.name }"
          class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-neural-700 hover:text-white transition-colors"
          active-class="!bg-cyber-purple/20 !text-cyber-purple"
        >
          <span>{{ link.icon }}</span>
          <span>{{ link.label }}</span>
        </RouterLink>
      </nav>

      <div class="p-4 border-t border-neural-600">
        <p class="text-sm text-gray-400 mb-2 truncate">{{ auth.user?.email }}</p>
        <button
          @click="handleLogout"
          class="w-full px-4 py-2 text-sm bg-neural-700 hover:bg-red-900/50 text-gray-300 hover:text-red-400 rounded-lg transition-colors"
        >
          Logout
        </button>
      </div>
    </aside>

    <!-- Main Content -->
    <div class="flex-1 flex flex-col">
      <header class="h-16 border-b border-neural-600 flex items-center px-8">
        <h1 class="text-lg font-semibold text-white">Admin Dashboard</h1>
      </header>

      <main class="flex-1 p-8 overflow-y-auto">
        <RouterView />
      </main>
    </div>
  </div>
</template>

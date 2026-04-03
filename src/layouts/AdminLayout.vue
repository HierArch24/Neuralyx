<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const auth = useAuthStore()
const router = useRouter()
const sidebarOpen = ref(true)

// Phantom Chat Slide Panel
const phantomOpen = ref(false)
const phantomStatus = ref<'online' | 'offline' | 'checking'>('checking')
const phantomMessages = ref<{ role: 'user' | 'phantom'; text: string; time: string }[]>([])
const phantomInput = ref('')
const phantomSending = ref(false)
const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'

onMounted(async () => {
  try {
    const res = await fetch(`${mcpUrl}/api/phantom/health`, { signal: AbortSignal.timeout(5000) })
    if (res.ok) { const d = await res.json(); phantomStatus.value = d.status === 'ok' ? 'online' : 'offline' }
    else phantomStatus.value = 'offline'
  } catch { phantomStatus.value = 'offline' }
})

async function sendPhantomChat() {
  if (!phantomInput.value.trim() || phantomSending.value) return
  const msg = phantomInput.value.trim()
  phantomMessages.value.push({ role: 'user', text: msg, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
  phantomInput.value = ''
  phantomSending.value = true
  try {
    const res = await fetch(`${mcpUrl}/api/phantom/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg }), signal: AbortSignal.timeout(60000),
    })
    const d = res.ok ? await res.json() : null
    phantomMessages.value.push({ role: 'phantom', text: d?.response || d?.message || 'Phantom is not responding.', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
  } catch {
    phantomMessages.value.push({ role: 'phantom', text: 'Could not reach Phantom. Ensure containers are running.', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
  }
  phantomSending.value = false
}

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
  { name: 'admin-phantom', label: 'Phantom Report', icon: '👻' },
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
        <div class="ml-auto flex items-center gap-2">
          <button @click="phantomOpen = !phantomOpen"
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors"
            :class="phantomOpen ? 'bg-cyber-purple/20 text-cyber-purple' : 'hover:bg-neural-700 text-gray-400 hover:text-white'">
            <span>👻</span>
            <span class="text-xs font-medium hidden sm:inline">Phantom</span>
            <span class="w-2 h-2 rounded-full" :class="phantomStatus === 'online' ? 'bg-green-400' : 'bg-red-400'" />
          </button>
        </div>
      </header>

      <main class="flex-1 p-6 overflow-y-auto">
        <RouterView />
      </main>
    </div>

    <!-- Phantom Chat Slide Panel (right to left) -->
    <Transition name="slide">
      <div v-if="phantomOpen" class="fixed top-0 right-0 bottom-0 w-80 bg-neural-800 border-l border-neural-600 z-50 flex flex-col shadow-2xl">
        <!-- Header -->
        <div class="h-14 px-4 flex items-center justify-between border-b border-neural-600 shrink-0">
          <div class="flex items-center gap-2">
            <span>👻</span>
            <span class="text-sm font-semibold text-white">Phantom</span>
            <span class="w-2 h-2 rounded-full" :class="phantomStatus === 'online' ? 'bg-green-400 animate-pulse' : 'bg-red-400'" />
          </div>
          <button @click="phantomOpen = false" class="p-1.5 rounded-lg hover:bg-neural-700 text-gray-400 hover:text-white">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <!-- Messages -->
        <div class="flex-1 overflow-y-auto p-3 space-y-2">
          <div v-if="phantomMessages.length === 0" class="text-center py-12">
            <div class="text-3xl mb-2">👻</div>
            <p class="text-xs text-gray-500">{{ phantomStatus === 'online' ? 'Chat with your AI co-worker' : 'Phantom is offline' }}</p>
            <p v-if="phantomStatus === 'offline'" class="text-[10px] text-gray-600 mt-1">cd phantom && docker compose up -d</p>
          </div>
          <div v-for="(msg, idx) in phantomMessages" :key="idx"
            class="flex" :class="msg.role === 'user' ? 'justify-end' : 'justify-start'">
            <div class="max-w-[85%] px-3 py-2 rounded-lg text-xs leading-relaxed"
              :class="msg.role === 'user' ? 'bg-cyber-purple/20 text-white rounded-br-sm' : 'bg-neural-700 text-gray-300 rounded-bl-sm'">
              <p class="whitespace-pre-wrap">{{ msg.text }}</p>
              <p class="text-[8px] mt-1 opacity-50">{{ msg.time }}</p>
            </div>
          </div>
          <div v-if="phantomSending" class="flex justify-start">
            <div class="px-3 py-2 rounded-lg bg-neural-700 text-gray-400 text-xs flex items-center gap-2">
              <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              Thinking...
            </div>
          </div>
        </div>

        <!-- Input -->
        <div class="p-3 border-t border-neural-600 shrink-0">
          <form @submit.prevent="sendPhantomChat" class="flex gap-2">
            <input v-model="phantomInput" :placeholder="phantomStatus === 'online' ? 'Message Phantom...' : 'Phantom offline'"
              :disabled="phantomStatus !== 'online'"
              class="flex-1 px-3 py-2 bg-neural-900 border border-neural-600 rounded-lg text-white text-xs placeholder-gray-500 focus:border-cyber-purple focus:outline-none disabled:opacity-30" />
            <button type="submit" :disabled="!phantomInput.trim() || phantomSending || phantomStatus !== 'online'"
              class="px-3 py-2 bg-cyber-purple text-white rounded-lg text-xs hover:bg-cyber-purple/80 disabled:opacity-30 shrink-0">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
          </form>
        </div>
      </div>
    </Transition>
    <!-- Overlay -->
    <div v-if="phantomOpen" class="fixed inset-0 bg-black/30 z-40" @click="phantomOpen = false" />
  </div>
</template>

<style scoped>
.slide-enter-active, .slide-leave-active { transition: transform 0.25s ease; }
.slide-enter-from, .slide-leave-to { transform: translateX(100%); }
</style>

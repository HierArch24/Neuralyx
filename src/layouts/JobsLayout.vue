<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import JobCopilot from '@/components/admin/JobCopilot.vue'

const auth = useAuthStore()
const sidebarOpen = ref(true)
const copilotOpen = ref(false)

// Phantom Chat
const phantomOpen = ref(false)
const phantomStatus = ref<'online' | 'offline'>('offline')
const phantomMessages = ref<{ role: 'user' | 'phantom'; text: string; time: string }[]>([])
const phantomInput = ref('')
const phantomSending = ref(false)
const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'

onMounted(async () => {
  try {
    const r = await fetch(`${mcpUrl}/api/phantom/health`, { signal: AbortSignal.timeout(5000) })
    if (r.ok) { const d = await r.json(); phantomStatus.value = d.status === 'ok' ? 'online' : 'offline' }
  } catch { /* offline */ }
})

async function sendPhantomChat() {
  if (!phantomInput.value.trim() || phantomSending.value) return
  const msg = phantomInput.value.trim()
  phantomMessages.value.push({ role: 'user', text: msg, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
  phantomInput.value = ''; phantomSending.value = true
  try {
    const r = await fetch(`${mcpUrl}/api/phantom/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }), signal: AbortSignal.timeout(60000) })
    const d = r.ok ? await r.json() : null
    phantomMessages.value.push({ role: 'phantom', text: d?.response || d?.message || 'Not responding.', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
  } catch { phantomMessages.value.push({ role: 'phantom', text: 'Could not reach Phantom.', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) }
  phantomSending.value = false
}

const sidebarLinks = [
  { name: 'admin-jobs', label: 'Dashboard', icon: '📊' },
  { name: 'admin-jobs-search', label: 'Jobs', icon: '💼' },
  { name: 'admin-jobs-applications', label: 'Applications', icon: '📋' },
  { name: 'admin-jobs-profile', label: 'Profile', icon: '👤' },
  { name: 'admin-jobs-platforms', label: 'Platforms', icon: '🔌' },
  { name: 'admin-jobs-agent', label: 'AI Agent', icon: '🤖' },
  { name: 'admin-jobs-api', label: 'API Usage', icon: '📡' },
  { name: 'admin-jobs-node-report', label: 'Node Report', icon: '📝' },
  { name: 'admin-jobs-session-logs', label: 'Session Logs', icon: '📜' },
  { name: 'admin-jobs-monitor', label: 'Monitor', icon: '🖥️' },
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
        <div class="flex items-center gap-3">
          <button @click="copilotOpen = !copilotOpen"
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors border"
            :class="copilotOpen ? 'bg-cyber-purple/20 text-cyber-purple border-cyber-purple/40' : 'hover:bg-neural-700 text-gray-400 hover:text-white border-neural-700'">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            <span class="text-xs font-medium">Copilot</span>
          </button>
          <button @click="phantomOpen = !phantomOpen"
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors"
            :class="phantomOpen ? 'bg-cyber-purple/20 text-cyber-purple' : 'hover:bg-neural-700 text-gray-400 hover:text-white'">
            <span>👻</span>
            <span class="text-xs font-medium">Phantom</span>
            <span class="w-2 h-2 rounded-full" :class="phantomStatus === 'online' ? 'bg-green-400' : 'bg-red-400'" />
          </button>
        </div>
      </header>

      <main class="flex-1 p-6 overflow-y-auto">
        <RouterView />
      </main>
    </div>

    <!-- Job Copilot Slide Panel -->
    <Transition name="slide">
      <div v-if="copilotOpen" class="fixed top-0 right-0 bottom-0 w-[420px] bg-neural-900 border-l border-neural-600 z-50 flex flex-col shadow-2xl">
        <div class="h-14 px-4 flex items-center justify-between border-b border-neural-600 shrink-0">
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-cyber-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            <span class="text-sm font-semibold text-white">Job Copilot</span>
            <span class="px-1.5 py-0.5 rounded text-[9px] bg-green-500/20 text-green-400">GPT-4o</span>
          </div>
          <button @click="copilotOpen = false" class="p-1.5 rounded-lg hover:bg-neural-700 text-gray-400 hover:text-white"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div class="flex-1 min-h-0 overflow-hidden">
          <JobCopilot />
        </div>
      </div>
    </Transition>
    <div v-if="copilotOpen" class="fixed inset-0 bg-black/20 z-40" @click="copilotOpen = false" />

    <!-- Phantom Chat Slide Panel -->
    <Transition name="slide">
      <div v-if="phantomOpen" class="fixed top-0 right-0 bottom-0 w-80 bg-neural-800 border-l border-neural-600 z-50 flex flex-col shadow-2xl">
        <div class="h-14 px-4 flex items-center justify-between border-b border-neural-600 shrink-0">
          <div class="flex items-center gap-2"><span>👻</span><span class="text-sm font-semibold text-white">Phantom</span><span class="w-2 h-2 rounded-full" :class="phantomStatus === 'online' ? 'bg-green-400 animate-pulse' : 'bg-red-400'" /></div>
          <button @click="phantomOpen = false" class="p-1.5 rounded-lg hover:bg-neural-700 text-gray-400 hover:text-white"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div class="flex-1 overflow-y-auto p-3 space-y-2">
          <div v-if="phantomMessages.length === 0" class="text-center py-12"><div class="text-3xl mb-2">👻</div><p class="text-xs text-gray-500">{{ phantomStatus === 'online' ? 'Chat with Phantom' : 'Phantom offline' }}</p></div>
          <div v-for="(msg, idx) in phantomMessages" :key="idx" class="flex" :class="msg.role === 'user' ? 'justify-end' : 'justify-start'">
            <div class="max-w-[85%] px-3 py-2 rounded-lg text-xs leading-relaxed" :class="msg.role === 'user' ? 'bg-cyber-purple/20 text-white' : 'bg-neural-700 text-gray-300'">
              <p class="whitespace-pre-wrap">{{ msg.text }}</p><p class="text-[8px] mt-1 opacity-50">{{ msg.time }}</p>
            </div>
          </div>
          <div v-if="phantomSending" class="flex justify-start"><div class="px-3 py-2 rounded-lg bg-neural-700 text-gray-400 text-xs flex items-center gap-2"><svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Thinking...</div></div>
        </div>
        <div class="p-3 border-t border-neural-600 shrink-0">
          <form @submit.prevent="sendPhantomChat" class="flex gap-2">
            <input v-model="phantomInput" :placeholder="phantomStatus === 'online' ? 'Message...' : 'Offline'" :disabled="phantomStatus !== 'online'" class="flex-1 px-3 py-2 bg-neural-900 border border-neural-600 rounded-lg text-white text-xs placeholder-gray-500 focus:border-cyber-purple focus:outline-none disabled:opacity-30" />
            <button type="submit" :disabled="!phantomInput.trim() || phantomSending || phantomStatus !== 'online'" class="px-3 py-2 bg-cyber-purple text-white rounded-lg text-xs hover:bg-cyber-purple/80 disabled:opacity-30"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg></button>
          </form>
        </div>
      </div>
    </Transition>
    <div v-if="phantomOpen" class="fixed inset-0 bg-black/30 z-40" @click="phantomOpen = false" />
  </div>
</template>

<style scoped>
.slide-enter-active, .slide-leave-active { transition: transform 0.25s ease; }
.slide-enter-from, .slide-leave-to { transform: translateX(100%); }
</style>

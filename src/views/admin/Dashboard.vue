<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'

const admin = useAdminStore()
const loading = ref(true)

const stats = ref({
  projects: 0,
  skills: 0,
  tools: 0,
  messages: 0,
  unread: 0,
  sections: 0,
})

onMounted(async () => {
  // Load OpenAI key from localStorage (set via admin dashboard settings)
  try {
    await Promise.all([
      admin.fetchProjects(),
      admin.fetchSkills(),
      admin.fetchTools(),
      admin.fetchMessages(),
      admin.fetchSections(),
    ])
    stats.value = {
      projects: admin.projects.length,
      skills: admin.skills.length,
      tools: admin.tools.length,
      messages: admin.messages.length,
      unread: admin.messages.filter((m: any) => !m.is_read).length,
      sections: admin.sections.length,
    }
  } finally {
    loading.value = false
  }
})

const statCards = [
  { label: 'Projects', key: 'projects', color: 'bg-cyber-purple/20 text-cyber-purple', border: 'border-cyber-purple/30' },
  { label: 'Skills', key: 'skills', color: 'bg-cyber-cyan/20 text-cyber-cyan', border: 'border-cyber-cyan/30' },
  { label: 'Tools', key: 'tools', color: 'bg-angelic-gold/20 text-angelic-gold', border: 'border-angelic-gold/30' },
  { label: 'Sections', key: 'sections', color: 'bg-green-500/20 text-green-400', border: 'border-green-500/30' },
  { label: 'Messages', key: 'messages', color: 'bg-cyber-pink/20 text-cyber-pink', border: 'border-cyber-pink/30' },
]

// System health for configured tech tools
const systemServices = ref([
  { name: 'PostgreSQL', type: 'Database', status: 'configured', detail: 'Docker: neuralyx-postgres:5432' },
  { name: 'Supabase', type: 'Backend', status: 'limited', detail: 'Free tier limit hit (2/2 projects)' },
  { name: 'MCP Server', type: 'AI Integration', status: 'configured', detail: 'Docker: neuralyx-mcp:8080' },
  { name: 'Nginx', type: 'Web Server', status: 'configured', detail: 'Docker: neuralyx-frontend:80' },
  { name: 'Vite 8', type: 'Build Tool', status: 'active', detail: 'Dev server port 3000' },
  { name: 'GSAP', type: 'Animation', status: 'active', detail: 'ScrollTrigger + Lenis' },
  { name: 'Tailwind CSS v4', type: 'Styling', status: 'active', detail: '@tailwindcss/vite plugin' },
  { name: 'Vue Router 4', type: 'Routing', status: 'active', detail: 'History mode + auth guards' },
  { name: 'Pinia', type: 'State', status: 'active', detail: '3 stores: content, auth, admin' },
])

function statusColor(status: string) {
  switch (status) {
    case 'active': return 'bg-green-500'
    case 'configured': return 'bg-cyan-500'
    case 'limited': return 'bg-yellow-500'
    case 'error': return 'bg-red-500'
    default: return 'bg-gray-500'
  }
}

const totalContent = computed(() =>
  stats.value.projects + stats.value.skills + stats.value.tools + stats.value.sections
)

// Introduction Video Management
const introVideoUrl = ref(localStorage.getItem('neuralyx_intro_video') || '/assets/videos/Introduction_video.mp4')
const editingIntro = ref(false)
const videoDragging = ref(false)
const uploadingVideo = ref(false)

function saveIntroVideo() {
  localStorage.setItem('neuralyx_intro_video', introVideoUrl.value)
  editingIntro.value = false
}

function handleVideoDrop(e: DragEvent) {
  videoDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('video/')) processVideoFile(file)
}

function handleVideoSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) processVideoFile(file)
}

function processVideoFile(file: File) {
  uploadingVideo.value = true
  const url = URL.createObjectURL(file)
  introVideoUrl.value = url
  // Save filename for display, actual blob stays in memory for this session
  localStorage.setItem('neuralyx_intro_video', `/assets/videos/${file.name}`)
  localStorage.setItem('neuralyx_intro_video_blob', url)
  uploadingVideo.value = false
  editingIntro.value = false
}

// OpenAI Key
const openaiKey = ref(localStorage.getItem('neuralyx_openai_key') || '')
const showKeyInput = ref(false)
const keySaved = ref(false)

function saveOpenAIKey() {
  localStorage.setItem('neuralyx_openai_key', openaiKey.value)
  showKeyInput.value = false
  keySaved.value = true
  setTimeout(() => { keySaved.value = false }, 2000)
}
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold text-white mb-2">Dashboard Overview</h2>
    <p class="text-gray-400 text-sm mb-8">NEURALYX Admin Panel - Content & System Management</p>

    <!-- Loading state -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="w-8 h-8 border-2 border-cyber-purple border-t-transparent rounded-full animate-spin"></div>
    </div>

    <template v-else>
      <!-- Stat Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        <div
          v-for="card in statCards"
          :key="card.key"
          class="glass-dark rounded-xl p-5 border transition-all hover:scale-[1.02]"
          :class="card.border"
        >
          <p class="text-3xl font-bold text-white">{{ stats[card.key as keyof typeof stats] }}</p>
          <p class="text-sm text-gray-400 mt-1">{{ card.label }}</p>
          <div v-if="card.key === 'messages' && stats.unread > 0" class="mt-2">
            <span class="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full">{{ stats.unread }} unread</span>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <!-- Content Overview -->
        <div class="glass-dark rounded-xl p-6">
          <h3 class="text-lg font-semibold text-white mb-4">Content Overview</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-gray-400 text-sm">Total Managed Content</span>
              <span class="text-white font-bold text-lg">{{ totalContent }}</span>
            </div>
            <div class="w-full bg-neural-700 rounded-full h-2">
              <div class="h-2 rounded-full bg-gradient-to-r from-cyber-purple to-cyber-cyan" :style="{ width: '100%' }"></div>
            </div>
            <div class="grid grid-cols-2 gap-3 mt-4">
              <div class="bg-neural-700/50 rounded-lg p-3">
                <p class="text-xs text-gray-500 uppercase tracking-wider">Landing Sections</p>
                <p class="text-white font-semibold">11 Components</p>
              </div>
              <div class="bg-neural-700/50 rounded-lg p-3">
                <p class="text-xs text-gray-500 uppercase tracking-wider">Mobile Projects</p>
                <p class="text-white font-semibold">14 Apps</p>
              </div>
              <div class="bg-neural-700/50 rounded-lg p-3">
                <p class="text-xs text-gray-500 uppercase tracking-wider">Web Projects</p>
                <p class="text-white font-semibold">5 Projects</p>
              </div>
              <div class="bg-neural-700/50 rounded-lg p-3">
                <p class="text-xs text-gray-500 uppercase tracking-wider">Video Assets</p>
                <p class="text-white font-semibold">19 Videos</p>
              </div>
            </div>
          </div>
        </div>

        <!-- System Status -->
        <div class="glass-dark rounded-xl p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-white">System Status</h3>
            <RouterLink :to="{ name: 'admin-connections' }" class="text-xs text-cyber-cyan hover:text-white transition-colors">
              View All &rarr;
            </RouterLink>
          </div>
          <div class="space-y-2">
            <div
              v-for="service in systemServices.slice(0, 6)"
              :key="service.name"
              class="flex items-center justify-between py-2 border-b border-neural-700 last:border-0"
            >
              <div class="flex items-center gap-3">
                <div class="w-2 h-2 rounded-full" :class="statusColor(service.status)"></div>
                <div>
                  <p class="text-sm text-white">{{ service.name }}</p>
                  <p class="text-xs text-gray-500">{{ service.type }}</p>
                </div>
              </div>
              <span class="text-xs px-2 py-0.5 rounded-full capitalize"
                    :class="{
                      'bg-green-500/10 text-green-400': service.status === 'active',
                      'bg-cyan-500/10 text-cyan-400': service.status === 'configured',
                      'bg-yellow-500/10 text-yellow-400': service.status === 'limited',
                      'bg-red-500/10 text-red-400': service.status === 'error',
                    }">
                {{ service.status }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Introduction Video -->
      <div class="glass-dark rounded-xl p-6 mb-8">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-white">Introduction Video</h3>
          <button v-if="!editingIntro" @click="editingIntro = true"
            class="px-3 py-1.5 text-xs bg-neural-700 text-gray-300 rounded-lg hover:bg-neural-600 transition-colors">
            Edit Video
          </button>
        </div>

        <div class="bg-neural-700/30 rounded-xl overflow-hidden">
          <!-- Preview -->
          <div class="aspect-video bg-black rounded-t-xl overflow-hidden">
            <video :src="introVideoUrl" class="w-full h-full object-cover" muted loop autoplay playsinline />
          </div>

          <!-- Info / Edit -->
          <div class="p-4">
            <div v-if="editingIntro" class="space-y-3">
              <!-- Drop zone for video -->
              <div
                class="rounded-xl border-2 border-dashed transition-colors cursor-pointer"
                :class="videoDragging ? 'border-cyber-purple bg-cyber-purple/5' : 'border-white/10 hover:border-white/20'"
                @dragover.prevent="videoDragging = true"
                @dragleave="videoDragging = false"
                @drop.prevent="handleVideoDrop"
                @click="($refs.videoFileInput as HTMLInputElement)?.click()"
              >
                <div class="p-6 text-center">
                  <svg class="w-8 h-8 text-white/20 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                  <p class="text-xs text-white/40">Drop a video file here or click to browse</p>
                  <p class="text-[10px] text-white/20 mt-1">MP4, WebM, MOV supported</p>
                </div>
              </div>
              <input ref="videoFileInput" type="file" accept="video/*" class="hidden" @change="handleVideoSelect" />

              <!-- Or manual URL -->
              <div>
                <label class="block text-[10px] text-gray-500 uppercase mb-1">Or enter video path manually</label>
                <input v-model="introVideoUrl"
                  class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none"
                  placeholder="/assets/videos/Introduction_video.mp4" />
              </div>
              <div class="flex gap-2">
                <button @click="saveIntroVideo"
                  class="px-4 py-2 text-xs rounded-lg font-medium text-white"
                  style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
                  Save
                </button>
                <button @click="editingIntro = false" class="px-4 py-2 text-xs text-gray-400 hover:text-white">Cancel</button>
              </div>
            </div>
            <div v-else class="flex items-center justify-between">
              <div>
                <p class="text-xs text-gray-400">Currently displaying</p>
                <p class="text-sm text-white font-mono truncate">{{ introVideoUrl }}</p>
              </div>
              <span class="px-2 py-1 text-[10px] bg-green-500/10 text-green-400 rounded-full">Active</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="glass-dark rounded-xl p-6">
        <h3 class="text-lg font-semibold text-white mb-4">Quick Actions</h3>
        <div class="flex flex-wrap gap-3">
          <RouterLink
            :to="{ name: 'admin-projects' }"
            class="px-4 py-2 bg-neural-700 hover:bg-cyber-purple/20 hover:text-cyber-purple text-gray-300 rounded-lg text-sm transition-colors"
          >
            Manage Projects
          </RouterLink>
          <RouterLink
            :to="{ name: 'admin-messages' }"
            class="px-4 py-2 bg-neural-700 hover:bg-cyber-purple/20 hover:text-cyber-purple text-gray-300 rounded-lg text-sm transition-colors"
          >
            View Messages
          </RouterLink>
          <RouterLink
            :to="{ name: 'admin-sections' }"
            class="px-4 py-2 bg-neural-700 hover:bg-cyber-purple/20 hover:text-cyber-purple text-gray-300 rounded-lg text-sm transition-colors"
          >
            Edit Sections
          </RouterLink>
          <RouterLink
            :to="{ name: 'admin-connections' }"
            class="px-4 py-2 bg-neural-700 hover:bg-cyan-500/20 hover:text-cyan-400 text-gray-300 rounded-lg text-sm transition-colors"
          >
            Connection Health
          </RouterLink>
          <RouterLink
            :to="{ name: 'admin-git-nexus' }"
            class="px-4 py-2 bg-neural-700 hover:bg-angelic-gold/20 hover:text-angelic-gold text-gray-300 rounded-lg text-sm transition-colors"
          >
            Git Nexus
          </RouterLink>
        </div>

        <!-- OpenAI API Key -->
        <div class="mt-4 pt-4 border-t border-neural-600">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-400">OpenAI API Key (for Validate Need AI)</span>
              <span v-if="openaiKey" class="text-[10px] px-2 py-0.5 bg-green-500/10 text-green-400 rounded-full">Connected</span>
              <span v-else class="text-[10px] px-2 py-0.5 bg-yellow-500/10 text-yellow-400 rounded-full">Not set</span>
            </div>
            <button @click="showKeyInput = !showKeyInput" class="text-xs text-cyber-cyan hover:text-white transition-colors">
              {{ showKeyInput ? 'Cancel' : (openaiKey ? 'Update' : 'Set Key') }}
            </button>
          </div>
          <div v-if="showKeyInput" class="flex gap-2 mt-2">
            <input v-model="openaiKey" type="password" placeholder="sk-proj-..."
              class="flex-1 px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none" />
            <button @click="saveOpenAIKey" class="px-4 py-2 text-xs rounded-lg font-medium text-white"
              style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
              Save
            </button>
          </div>
          <p v-if="keySaved" class="text-[10px] text-green-400 mt-1">Key saved to local storage</p>
        </div>
      </div>
    </template>
  </div>
</template>

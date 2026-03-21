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

// Video Management
const editingVideoId = ref<string | null>(null)
const videoUrlInput = ref('')
const frontVideoUrl = ref(localStorage.getItem('neuralyx_front_video') || '/assets/videos/vid-t.mp4')
const editingFront = ref(false)
const copied = ref('')

const projectVideos = computed(() =>
  admin.projects.map(p => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    category: p.category,
    video_url: (p as any).video_url || '',
    hasVideo: !!((p as any).video_url),
  })).sort((a, b) => (a.hasVideo === b.hasVideo ? 0 : a.hasVideo ? -1 : 1))
)

const videoCount = computed(() => projectVideos.value.filter(p => p.hasVideo).length)

function startEditVideo(id: string, currentUrl: string) {
  editingVideoId.value = id
  videoUrlInput.value = currentUrl
}

async function saveVideoUrl(id: string) {
  await admin.updateRow('projects', id, { video_url: videoUrlInput.value || null })
  await admin.fetchProjects()
  editingVideoId.value = null
}

function copyShareLink(slug: string) {
  const url = `${window.location.origin}/video/${slug}`
  navigator.clipboard.writeText(url)
  copied.value = slug
  setTimeout(() => { copied.value = '' }, 2000)
}

function saveFrontVideo() {
  localStorage.setItem('neuralyx_front_video', frontVideoUrl.value)
  editingFront.value = false
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

      <!-- Video Assets -->
      <div class="glass-dark rounded-xl p-6 mb-8">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-lg font-semibold text-white">Video Assets</h3>
            <p class="text-xs text-gray-500 mt-0.5">{{ videoCount }} of {{ projectVideos.length }} projects have videos</p>
          </div>
        </div>

        <!-- Front Page Video -->
        <div class="bg-neural-700/50 rounded-lg p-3 mb-4 flex items-center justify-between">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <span class="text-lg">🎬</span>
            <div class="min-w-0 flex-1">
              <p class="text-xs text-gray-400 uppercase tracking-wider">Front Page Video</p>
              <div v-if="editingFront" class="flex gap-2 mt-1">
                <input v-model="frontVideoUrl" class="flex-1 px-2 py-1 bg-neural-800 border border-neural-600 rounded text-white text-xs focus:border-cyber-purple focus:outline-none" />
                <button @click="saveFrontVideo" class="px-2 py-1 text-[10px] bg-cyber-purple/20 text-cyber-purple rounded hover:bg-cyber-purple/30">Save</button>
                <button @click="editingFront = false" class="px-2 py-1 text-[10px] bg-neural-600 text-gray-400 rounded">Cancel</button>
              </div>
              <p v-else class="text-white text-xs truncate">{{ frontVideoUrl }}</p>
            </div>
          </div>
          <button v-if="!editingFront" @click="editingFront = true" class="px-2 py-1 text-[10px] bg-neural-600 text-gray-300 rounded hover:bg-neural-500 flex-shrink-0 ml-2">Edit</button>
        </div>

        <!-- Project Videos -->
        <div class="max-h-64 overflow-y-auto space-y-1" data-lenis-prevent>
          <div v-for="p in projectVideos" :key="p.id"
            class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neural-700/40 transition-colors">
            <span class="w-2 h-2 rounded-full flex-shrink-0" :class="p.hasVideo ? 'bg-green-400' : 'bg-gray-600'"></span>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-white truncate">{{ p.title }}</p>
              <div v-if="editingVideoId === p.id" class="flex gap-2 mt-1">
                <input v-model="videoUrlInput" placeholder="/assets/videos/web/demo.mp4"
                  class="flex-1 px-2 py-1 bg-neural-800 border border-neural-600 rounded text-white text-[10px] focus:border-cyber-purple focus:outline-none" />
                <button @click="saveVideoUrl(p.id)" class="px-2 py-1 text-[10px] bg-cyber-purple/20 text-cyber-purple rounded hover:bg-cyber-purple/30">Save</button>
                <button @click="editingVideoId = null" class="px-2 py-1 text-[10px] bg-neural-600 text-gray-400 rounded">X</button>
              </div>
              <p v-else-if="p.video_url" class="text-[10px] text-gray-500 truncate">{{ p.video_url }}</p>
            </div>
            <div v-if="editingVideoId !== p.id" class="flex items-center gap-1 flex-shrink-0">
              <button v-if="p.hasVideo" @click="copyShareLink(p.slug)"
                class="px-2 py-1 text-[10px] rounded transition-colors"
                :class="copied === p.slug ? 'bg-green-500/20 text-green-400' : 'bg-neural-600 text-gray-400 hover:text-cyan-400'">
                {{ copied === p.slug ? 'Copied!' : 'Share' }}
              </button>
              <button @click="startEditVideo(p.id, p.video_url)"
                class="px-2 py-1 text-[10px] bg-neural-600 text-gray-400 rounded hover:text-white">
                {{ p.hasVideo ? 'Edit' : '+ Add' }}
              </button>
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
      </div>
    </template>
  </div>
</template>

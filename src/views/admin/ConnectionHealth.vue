<script setup lang="ts">
import { ref, computed } from 'vue'

type ConnectionStatus = 'active' | 'configured' | 'limited' | 'error' | 'offline'

interface Connection {
  id: number
  name: string
  type: string
  category: string
  status: ConnectionStatus
  detail: string
  endpoint: string
}

const viewMode = ref<'table' | 'cards'>('cards')

const connections = ref<Connection[]>([
  // Infrastructure
  { id: 1, name: 'PostgreSQL 17', type: 'Database', category: 'infrastructure', status: 'configured', detail: 'Docker container neuralyx-postgres', endpoint: 'localhost:5432' },
  { id: 2, name: 'Nginx', type: 'Web Server', category: 'infrastructure', status: 'configured', detail: 'Docker container neuralyx-frontend', endpoint: 'localhost:3000' },
  { id: 3, name: 'Docker Compose', type: 'Container Orchestration', category: 'infrastructure', status: 'configured', detail: '3 services: frontend, postgres, mcp-server', endpoint: 'docker-compose.yml' },

  // Backend Services
  { id: 4, name: 'Supabase', type: 'Backend-as-a-Service', category: 'backend', status: 'limited', detail: 'Free tier limit hit (2/2 projects). Org: celrcwsysxnxabscdjcq', endpoint: 'supabase.co' },
  { id: 5, name: 'MCP Server', type: 'AI Integration Server', category: 'backend', status: 'configured', detail: 'Node 20 Alpine, Supabase tools', endpoint: 'localhost:8080' },

  // MCP Connections
  { id: 6, name: 'GitHub MCP', type: 'MCP Server', category: 'mcp', status: 'active', detail: 'Repository management, PR creation, issue tracking', endpoint: 'mcp__github__*' },
  { id: 7, name: 'Claude Preview MCP', type: 'MCP Server', category: 'mcp', status: 'active', detail: 'Browser preview, screenshots, console logs', endpoint: 'mcp__Claude_Preview__*' },
  { id: 8, name: 'Chrome MCP', type: 'MCP Server', category: 'mcp', status: 'active', detail: 'Browser automation, page interaction', endpoint: 'mcp__Claude_in_Chrome__*' },
  { id: 9, name: 'Neuralyx MCP', type: 'MCP Server', category: 'mcp', status: 'active', detail: 'Project management, sections, skills, tools', endpoint: 'mcp__neuralyx__*' },
  { id: 10, name: 'MCP Registry', type: 'MCP Server', category: 'mcp', status: 'active', detail: 'Search and suggest MCP connectors', endpoint: 'mcp__mcp-registry__*' },
  { id: 11, name: 'Scheduled Tasks MCP', type: 'MCP Server', category: 'mcp', status: 'active', detail: 'Create, list, update scheduled tasks', endpoint: 'mcp__scheduled-tasks__*' },

  // Skills & AI Agents
  { id: 12, name: 'GSD Workflow', type: 'Skill Suite', category: 'skills', status: 'active', detail: '30+ skills: planning, execution, verification, debugging', endpoint: 'gsd:*' },
  { id: 13, name: 'Gstack', type: 'Skill', category: 'skills', status: 'active', detail: 'Headless browser QA, testing, design review', endpoint: 'gstack' },
  { id: 14, name: 'Anthropic Skills', type: 'Skill Suite', category: 'skills', status: 'active', detail: 'PDF, XLSX, DOCX, PPTX, scheduling, skill-creator', endpoint: 'anthropic-skills:*' },
  { id: 15, name: 'Python Expert', type: 'AI Agent', category: 'ai-agent', status: 'active', detail: 'Django, FastAPI, Flask backend expert', endpoint: 'python-expert' },
  { id: 16, name: 'Claude API Skill', type: 'AI Agent', category: 'ai-agent', status: 'active', detail: 'Anthropic SDK, Agent SDK integration', endpoint: 'claude-api' },

  // Tech Stack
  { id: 17, name: 'Vue 3', type: 'Framework', category: 'tech-stack', status: 'active', detail: 'v3.5.30 + TypeScript 5.9', endpoint: 'package.json' },
  { id: 18, name: 'Vite 8', type: 'Build Tool', category: 'tech-stack', status: 'active', detail: 'Dev server port 3000, HMR', endpoint: 'vite.config.ts' },
  { id: 19, name: 'Tailwind CSS v4', type: 'Styling', category: 'tech-stack', status: 'active', detail: '@tailwindcss/vite plugin', endpoint: 'src/style.css' },
  { id: 20, name: 'GSAP 3.14', type: 'Animation', category: 'tech-stack', status: 'active', detail: 'ScrollTrigger, parallax, warped text', endpoint: 'src/lib/gsap-setup.ts' },
  { id: 21, name: 'Lenis', type: 'Smooth Scroll', category: 'tech-stack', status: 'active', detail: 'v1.3.19', endpoint: 'src/composables/useSmoothScroll.ts' },
  { id: 22, name: 'Pinia', type: 'State Management', category: 'tech-stack', status: 'active', detail: 'v3.0.4 - content, auth, admin stores', endpoint: 'src/stores/' },
  { id: 23, name: 'Vue Router 4', type: 'Routing', category: 'tech-stack', status: 'active', detail: 'v4.6.4 - History mode, auth guards', endpoint: 'src/router/index.ts' },

  // Git & Deployment
  { id: 24, name: 'GitHub (HierArch24)', type: 'Git Remote', category: 'deployment', status: 'configured', detail: 'SSH: git@github.com-hierarch24:HierArch24/NEURALYX.git', endpoint: 'github.com' },
  { id: 25, name: 'CLI-Anything', type: 'CLI Tool', category: 'ai-agent', status: 'configured', detail: 'HKUDS/CLI-Anything - Agent-native CLI', endpoint: '~/.claude/tools/cli-anything' },
])

const categories = [
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'backend', label: 'Backend Services' },
  { value: 'mcp', label: 'MCP Servers' },
  { value: 'skills', label: 'Skills & Workflows' },
  { value: 'ai-agent', label: 'AI Agents' },
  { value: 'tech-stack', label: 'Tech Stack' },
  { value: 'deployment', label: 'Git & Deployment' },
]

const selectedCategory = ref<string>('all')

const filteredConnections = computed(() => {
  if (selectedCategory.value === 'all') return connections.value
  return connections.value.filter(c => c.category === selectedCategory.value)
})

const statusCounts = computed(() => {
  const counts: Record<string, number> = { active: 0, configured: 0, limited: 0, error: 0, offline: 0 }
  connections.value.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1 })
  return counts
})

function statusBadge(status: string) {
  switch (status) {
    case 'active': return 'bg-green-500/10 text-green-400 border-green-500/20'
    case 'configured': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
    case 'limited': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
    case 'error': return 'bg-red-500/10 text-red-400 border-red-500/20'
    case 'offline': return 'bg-gray-500/10 text-gray-400 border-gray-500/20'
    default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20'
  }
}

function statusDot(status: string) {
  switch (status) {
    case 'active': return 'bg-green-500'
    case 'configured': return 'bg-cyan-500'
    case 'limited': return 'bg-yellow-500'
    case 'error': return 'bg-red-500'
    case 'offline': return 'bg-gray-500'
    default: return 'bg-gray-500'
  }
}

function categoryLabel(cat: string) {
  return categories.find(c => c.value === cat)?.label || cat
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-8">
      <div>
        <h2 class="text-2xl font-bold text-white">Connection Health</h2>
        <p class="text-gray-400 text-sm mt-1">All configured services, MCP servers, skills, and tech stack for this project</p>
      </div>
      <button
        @click="viewMode = viewMode === 'table' ? 'cards' : 'table'"
        class="px-3 py-2 bg-neural-700 hover:bg-neural-600 text-gray-300 rounded-lg text-sm transition-colors"
      >
        {{ viewMode === 'table' ? 'Card View' : 'Table View' }}
      </button>
    </div>

    <!-- Status Summary Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
      <div class="bg-neural-800 rounded-lg p-4 text-center border border-green-500/20">
        <p class="text-2xl font-bold text-green-400">{{ statusCounts.active }}</p>
        <p class="text-xs text-gray-400 mt-1">Active</p>
      </div>
      <div class="bg-neural-800 rounded-lg p-4 text-center border border-cyan-500/20">
        <p class="text-2xl font-bold text-cyan-400">{{ statusCounts.configured }}</p>
        <p class="text-xs text-gray-400 mt-1">Configured</p>
      </div>
      <div class="bg-neural-800 rounded-lg p-4 text-center border border-yellow-500/20">
        <p class="text-2xl font-bold text-yellow-400">{{ statusCounts.limited }}</p>
        <p class="text-xs text-gray-400 mt-1">Limited</p>
      </div>
      <div class="bg-neural-800 rounded-lg p-4 text-center border border-red-500/20">
        <p class="text-2xl font-bold text-red-400">{{ statusCounts.error }}</p>
        <p class="text-xs text-gray-400 mt-1">Error</p>
      </div>
      <div class="bg-neural-800 rounded-lg p-4 text-center border border-gray-500/20">
        <p class="text-2xl font-bold text-gray-400">{{ statusCounts.offline }}</p>
        <p class="text-xs text-gray-400 mt-1">Offline</p>
      </div>
    </div>

    <!-- Category Filter -->
    <div class="flex flex-wrap gap-2 mb-6">
      <button
        @click="selectedCategory = 'all'"
        class="px-3 py-1.5 rounded-lg text-xs transition-colors"
        :class="selectedCategory === 'all' ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-neural-700 text-gray-400 hover:text-white'"
      >
        All ({{ connections.length }})
      </button>
      <button
        v-for="cat in categories"
        :key="cat.value"
        @click="selectedCategory = cat.value"
        class="px-3 py-1.5 rounded-lg text-xs transition-colors"
        :class="selectedCategory === cat.value ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-neural-700 text-gray-400 hover:text-white'"
      >
        {{ cat.label }} ({{ connections.filter(c => c.category === cat.value).length }})
      </button>
    </div>

    <!-- TABLE VIEW -->
    <div v-if="viewMode === 'table'" class="bg-neural-800 rounded-xl overflow-hidden border border-neural-600">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-neural-600">
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Type</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Category</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Detail</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Endpoint</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="conn in filteredConnections"
              :key="conn.id"
              class="border-b border-neural-700/50 hover:bg-neural-700/30 transition-colors"
            >
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <div class="w-2.5 h-2.5 rounded-full" :class="statusDot(conn.status)"></div>
                  <span class="text-xs px-2 py-0.5 rounded-full border capitalize" :class="statusBadge(conn.status)">
                    {{ conn.status }}
                  </span>
                </div>
              </td>
              <td class="px-4 py-3 text-sm text-white font-medium">{{ conn.name }}</td>
              <td class="px-4 py-3 text-sm text-gray-400">{{ conn.type }}</td>
              <td class="px-4 py-3">
                <span class="text-xs px-2 py-0.5 bg-neural-700 text-gray-300 rounded">{{ categoryLabel(conn.category) }}</span>
              </td>
              <td class="px-4 py-3 text-xs text-gray-500 max-w-[250px] truncate">{{ conn.detail }}</td>
              <td class="px-4 py-3 text-xs text-gray-500 font-mono">{{ conn.endpoint }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- CARD VIEW -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="conn in filteredConnections"
        :key="conn.id"
        class="bg-neural-800 rounded-xl p-5 border border-neural-600 hover:border-neural-500 transition-all"
      >
        <div class="flex items-start justify-between mb-3">
          <div class="flex items-center gap-2">
            <div class="w-2.5 h-2.5 rounded-full" :class="statusDot(conn.status)"></div>
            <h4 class="text-sm font-semibold text-white">{{ conn.name }}</h4>
          </div>
          <span class="text-xs px-2 py-0.5 rounded-full border capitalize" :class="statusBadge(conn.status)">
            {{ conn.status }}
          </span>
        </div>
        <p class="text-xs text-gray-500 mb-1">{{ conn.type }}</p>
        <p class="text-xs text-gray-400 mb-3">{{ conn.detail }}</p>
        <div class="flex items-center justify-between">
          <span class="text-xs px-2 py-0.5 bg-neural-700 text-gray-300 rounded">{{ categoryLabel(conn.category) }}</span>
        </div>
        <p class="text-[10px] text-gray-600 mt-2 font-mono">{{ conn.endpoint }}</p>
      </div>
    </div>
  </div>
</template>

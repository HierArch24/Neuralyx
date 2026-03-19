<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'

const admin = useAdminStore()
const stats = ref({ projects: 0, skills: 0, tools: 0, messages: 0, unread: 0 })

onMounted(async () => {
  await Promise.all([
    admin.fetchProjects(),
    admin.fetchSkills(),
    admin.fetchTools(),
    admin.fetchMessages(),
  ])
  stats.value = {
    projects: admin.projects.length,
    skills: admin.skills.length,
    tools: admin.tools.length,
    messages: admin.messages.length,
    unread: admin.messages.filter((m) => !m.is_read).length,
  }
})

const cards = [
  { label: 'Projects', key: 'projects', icon: '📁', color: 'cyber-purple' },
  { label: 'Skills', key: 'skills', icon: '⚡', color: 'cyber-cyan' },
  { label: 'Tools', key: 'tools', icon: '🔧', color: 'angelic-gold' },
  { label: 'Messages', key: 'messages', icon: '✉️', color: 'cyber-pink' },
]
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold text-white mb-8">Dashboard Overview</h2>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <div
        v-for="card in cards"
        :key="card.key"
        class="glass-dark rounded-xl p-6"
      >
        <div class="flex items-center justify-between mb-4">
          <span class="text-2xl">{{ card.icon }}</span>
          <span v-if="card.key === 'messages' && stats.unread" class="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded-full">
            {{ stats.unread }} unread
          </span>
        </div>
        <p class="text-3xl font-bold text-white">{{ stats[card.key as keyof typeof stats] }}</p>
        <p class="text-sm text-gray-400 mt-1">{{ card.label }}</p>
      </div>
    </div>

    <div class="glass-dark rounded-xl p-6">
      <h3 class="text-lg font-semibold text-white mb-4">Quick Actions</h3>
      <div class="flex flex-wrap gap-3">
        <RouterLink
          :to="{ name: 'admin-projects' }"
          class="px-4 py-2 bg-neural-700 hover:bg-neural-600 text-gray-300 rounded-lg text-sm transition-colors"
        >
          Manage Projects
        </RouterLink>
        <RouterLink
          :to="{ name: 'admin-messages' }"
          class="px-4 py-2 bg-neural-700 hover:bg-neural-600 text-gray-300 rounded-lg text-sm transition-colors"
        >
          View Messages
        </RouterLink>
        <RouterLink
          :to="{ name: 'admin-sections' }"
          class="px-4 py-2 bg-neural-700 hover:bg-neural-600 text-gray-300 rounded-lg text-sm transition-colors"
        >
          Edit Sections
        </RouterLink>
      </div>
    </div>
  </div>
</template>

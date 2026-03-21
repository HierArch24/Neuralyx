<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

interface AutomationProject {
  id: string
  name: string
  description: string
  file: string
  isImage: boolean
  ext: string
  featured: boolean
}

const STORAGE_KEY = 'neuralyx_automation'
const projects = ref<AutomationProject[]>([])
const showModal = ref(false)
const editing = ref<AutomationProject | null>(null)
const searchQuery = ref('')
const viewerOpen = ref(false)
const viewerProject = ref<AutomationProject | null>(null)
const currentPage = ref(1)
const perPage = 9

const form = ref({ name: '', description: '', file: '', featured: false })

const knownFiles = [
  'Ai avatar social Automation.png',
  'Ai factory long form video generation content.png',
  'Ai lead follow automation .png',
  'Client Onboarding system automation.png',
  'Faceless Pov Ai machine.png',
  'Invoice OCR workflow.png',
  'Smart AI resume screening.png',
  'Think Tool Agent.png',
  'hermes workflow.png',
  'project directory.jpg',
]

function fileToEntry(filename: string): AutomationProject {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const name = filename.replace(/\.[^.]+$/, '')
  return {
    id: btoa(filename).replace(/=/g, ''),
    name,
    description: '',
    file: `/assets/images/automation/${filename}`,
    isImage: ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext),
    ext,
    featured: false,
  }
}

function loadProjects() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    projects.value = JSON.parse(saved)
  } else {
    projects.value = knownFiles.map(fileToEntry)
    saveProjects()
  }
}

function saveProjects() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects.value))
}

const filteredProjects = computed(() => {
  if (!searchQuery.value.trim()) return projects.value
  const q = searchQuery.value.toLowerCase()
  return projects.value.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredProjects.value.length / perPage)))
const paginatedProjects = computed(() => {
  const start = (currentPage.value - 1) * perPage
  return filteredProjects.value.slice(start, start + perPage)
})

const featuredCount = computed(() => projects.value.filter(p => p.featured).length)

function openCreate() {
  editing.value = null
  form.value = { name: '', description: '', file: '', featured: false }
  showModal.value = true
}

function openEdit(project: AutomationProject) {
  editing.value = project
  form.value = { name: project.name, description: project.description, file: project.file, featured: project.featured }
  showModal.value = true
}

function handleSave() {
  if (editing.value) {
    const idx = projects.value.findIndex(p => p.id === editing.value!.id)
    if (idx >= 0) {
      const ext = form.value.file.split('.').pop()?.toLowerCase() || ''
      projects.value[idx] = {
        ...projects.value[idx],
        name: form.value.name,
        description: form.value.description,
        file: form.value.file,
        featured: form.value.featured,
        ext,
        isImage: ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext),
      }
    }
  } else {
    const ext = form.value.file.split('.').pop()?.toLowerCase() || ''
    projects.value.push({
      id: Date.now().toString(36),
      name: form.value.name,
      description: form.value.description,
      file: form.value.file,
      featured: form.value.featured,
      ext,
      isImage: ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext),
    })
  }
  saveProjects()
  showModal.value = false
}

function handleDelete(id: string) {
  if (confirm('Delete this project?')) {
    projects.value = projects.value.filter(p => p.id !== id)
    saveProjects()
  }
}

function toggleFeatured(project: AutomationProject) {
  project.featured = !project.featured
  saveProjects()
}

function openViewer(project: AutomationProject) {
  viewerProject.value = project
  viewerOpen.value = true
}

onMounted(loadProjects)
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-white">Automation Projects</h2>
        <p class="text-xs text-gray-400 mt-1">{{ projects.length }} projects &middot; {{ featuredCount }} featured on landing</p>
      </div>
      <button @click="openCreate"
        class="px-4 py-2 rounded-lg text-sm font-medium text-white"
        style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
        + Add Project
      </button>
    </div>

    <!-- Search -->
    <div class="mb-4 relative">
      <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
      </svg>
      <input v-model="searchQuery" @input="currentPage = 1" type="text" placeholder="Search automation projects..."
        class="w-full pl-10 pr-4 py-2.5 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none placeholder-gray-500" />
    </div>

    <!-- Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      <div v-for="project in paginatedProjects" :key="project.id"
           class="bg-neural-800 border rounded-lg overflow-hidden"
           :class="project.featured ? 'border-amber-500/40' : 'border-neural-600'">
        <div class="aspect-video overflow-hidden bg-neural-900 cursor-pointer relative group" @click="openViewer(project)">
          <img v-if="project.isImage" :src="project.file" :alt="project.name" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
          <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span class="text-white text-xs bg-white/20 px-3 py-1 rounded-full">View</span>
          </div>
          <span v-if="project.featured" class="absolute top-2 left-2 px-2 py-0.5 text-[10px] rounded-full bg-amber-500/20 text-amber-400 font-semibold">⭐ Landing</span>
        </div>
        <div class="p-3">
          <h3 class="text-white text-xs font-medium truncate">{{ project.name }}</h3>
          <p v-if="project.description" class="text-gray-500 text-[10px] truncate mt-0.5">{{ project.description }}</p>
          <div class="flex items-center justify-between mt-2">
            <span class="text-white/20 text-[10px] uppercase">{{ project.ext }}</span>
            <div class="flex items-center gap-1">
              <button @click="toggleFeatured(project)"
                class="px-2 py-1 text-[10px] rounded transition-colors"
                :class="project.featured ? 'bg-amber-500/20 text-amber-400' : 'bg-neural-700 text-gray-500 hover:text-amber-400'">
                {{ project.featured ? '⭐' : '☆' }}
              </button>
              <button @click="openEdit(project)" class="px-2 py-1 text-[10px] bg-neural-700 text-white rounded hover:bg-neural-600">Edit</button>
              <button @click="handleDelete(project.id)" class="px-2 py-1 text-[10px] bg-red-900/30 text-red-400 rounded hover:bg-red-900/50">Del</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-center gap-2">
      <button @click="currentPage = Math.max(1, currentPage - 1)" :disabled="currentPage === 1"
        class="px-3 py-1.5 text-xs rounded-lg bg-neural-700 text-gray-400 disabled:opacity-30 hover:text-white">Prev</button>
      <span class="text-xs text-gray-400">{{ currentPage }} / {{ totalPages }}</span>
      <button @click="currentPage = Math.min(totalPages, currentPage + 1)" :disabled="currentPage === totalPages"
        class="px-3 py-1.5 text-xs rounded-lg bg-neural-700 text-gray-400 disabled:opacity-30 hover:text-white">Next</button>
    </div>

    <!-- Edit/Create Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" @click.self="showModal = false">
        <div class="bg-neural-800 border border-neural-600 rounded-xl w-full max-w-lg p-6">
          <h3 class="text-lg font-bold text-white mb-6">{{ editing ? 'Edit' : 'Add' }} Automation Project</h3>
          <form @submit.prevent="handleSave" class="space-y-4">
            <div>
              <label class="block text-xs text-gray-400 uppercase mb-1">Project Name</label>
              <input v-model="form.name" required class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
            </div>
            <div>
              <label class="block text-xs text-gray-400 uppercase mb-1">Description</label>
              <textarea v-model="form.description" rows="2" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none resize-none"></textarea>
            </div>
            <div>
              <label class="block text-xs text-gray-400 uppercase mb-1">Image Path</label>
              <input v-model="form.file" required class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" placeholder="/assets/images/automation/filename.png" />
              <p class="text-[10px] text-white/30 mt-1">Place file in public/assets/images/automation/ then enter the path</p>
            </div>
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="form.featured" type="checkbox" class="w-4 h-4 rounded bg-neural-700 border-neural-600" />
              <span class="text-sm text-amber-400">⭐ Feature on Landing</span>
            </label>
            <div class="flex justify-end gap-3 pt-4 border-t border-neural-600">
              <button type="button" @click="showModal = false" class="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
              <button type="submit" class="px-6 py-2 rounded-lg text-sm font-medium text-white"
                      style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
                {{ editing ? 'Update' : 'Add' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Image Viewer -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="viewerOpen" class="fixed inset-0 z-[100] flex items-center justify-center p-4" @click.self="viewerOpen = false">
          <div class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
          <div class="relative max-w-5xl w-full max-h-[90vh] rounded-xl border border-white/10 overflow-hidden" style="background: rgba(12,12,22,0.98);">
            <div class="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]">
              <span class="text-xs text-white/50">{{ viewerProject?.name }}</span>
              <button @click="viewerOpen = false" class="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center">
                <svg class="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div class="p-4 overflow-auto max-h-[80vh]" data-lenis-prevent>
              <img :src="viewerProject?.file" :alt="viewerProject?.name" class="max-w-full mx-auto rounded-lg" />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'
import type { Project } from '@/types/database'

const admin = useAdminStore()
const showModal = ref(false)
const editing = ref<Project | null>(null)
const searchQuery = ref('')
const filterCategory = ref('all')

const PROJECT_CATEGORIES = [
  { value: 'ai', label: 'AI / ML' },
  { value: 'web', label: 'Web System' },
  { value: 'mobile', label: 'Mobile App' },
  { value: 'automation', label: 'Automation' },
  { value: 'game', label: 'Game Dev' },
  { value: 'other', label: 'Other' },
]

const categoryCounts = computed(() => {
  const counts: Record<string, number> = {}
  admin.projects.forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1 })
  return counts
})

const filteredProjects = computed(() => {
  let results = admin.projects
  if (filterCategory.value !== 'all') {
    results = results.filter(p => p.category === filterCategory.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    results = results.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tech_stack.some(t => t.toLowerCase().includes(q))
    )
  }
  return results
})

const form = ref({
  title: '',
  slug: '',
  description: '',
  image_url: '',
  tech_stack: '',
  category: 'web',
  github_url: '',
  live_url: '',
  video_url: '',
  is_featured: false,
  sort_order: 0,
})

onMounted(() => admin.fetchProjects())

function openCreate() {
  editing.value = null
  Object.assign(form.value, { title: '', slug: '', description: '', image_url: '', tech_stack: '', category: 'web', github_url: '', live_url: '', video_url: '', is_featured: false, sort_order: 0 })
  showModal.value = true
}

function openEdit(project: Project) {
  editing.value = project
  Object.assign(form.value, {
    ...project,
    tech_stack: project.tech_stack.join(', '),
  })
  showModal.value = true
}

async function handleSave() {
  const data = {
    ...form.value,
    tech_stack: form.value.tech_stack.split(',').map((s) => s.trim()).filter(Boolean),
    slug: form.value.slug || form.value.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
  }

  if (editing.value) {
    await admin.updateRow('projects', editing.value.id, data)
  } else {
    await admin.insertRow('projects', data)
  }
  showModal.value = false
  await admin.fetchProjects()
}

async function handleDelete(id: string) {
  if (confirm('Delete this project?')) {
    await admin.deleteRow('projects', id)
    await admin.fetchProjects()
  }
}

async function toggleFeatured(project: Project) {
  await admin.updateRow('projects', project.id, { is_featured: !project.is_featured })
  await admin.fetchProjects()
}

// Image drag-and-drop
const isDragging = ref(false)

function handleDrop(e: DragEvent) {
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) processFile(file)
}

function handleFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) processFile(file)
}

function processFile(file: File) {
  const reader = new FileReader()
  reader.onload = (e) => {
    form.value.image_url = e.target?.result as string
  }
  reader.readAsDataURL(file)
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-white">Projects</h2>
        <p class="text-xs text-gray-400 mt-1">{{ admin.projects.length }} projects across {{ Object.keys(categoryCounts).length }} categories</p>
      </div>
      <button @click="openCreate"
        class="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
        style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
        + Add Project
      </button>
    </div>

    <!-- Search Bar -->
    <div class="mb-4">
      <div class="relative">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search projects by title, description, or tech stack..."
          class="w-full pl-10 pr-4 py-2.5 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none placeholder-gray-500"
        />
        <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    </div>

    <!-- Category Filter -->
    <div class="flex flex-wrap gap-2 mb-6">
      <button
        @click="filterCategory = 'all'"
        class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        :class="filterCategory === 'all' ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-neural-700 text-gray-400 hover:text-white'"
      >
        All ({{ admin.projects.length }})
      </button>
      <button
        v-for="cat in PROJECT_CATEGORIES"
        :key="cat.value"
        v-show="categoryCounts[cat.value]"
        @click="filterCategory = cat.value"
        class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        :class="filterCategory === cat.value ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-neural-700 text-gray-400 hover:text-white'"
      >
        {{ cat.label }} ({{ categoryCounts[cat.value] || 0 }})
      </button>
    </div>

    <!-- Projects List -->
    <div class="space-y-3">
      <div v-for="project in filteredProjects" :key="project.id"
           class="bg-neural-800 border border-neural-600 rounded-lg p-4 flex items-start gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span v-if="project.is_featured" class="px-2 py-0.5 text-[10px] rounded-full bg-amber-500/20 text-amber-400 font-semibold uppercase">
              ⭐ Featured
            </span>
            <span class="px-2 py-0.5 text-[10px] rounded-full bg-cyber-purple/20 text-cyber-purple font-semibold uppercase">
              {{ project.category }}
            </span>
            <span v-if="project.github_url" class="text-[10px] text-white/30">🔗 GitHub</span>
            <span v-if="project.live_url" class="text-[10px] text-white/30">🌐 Live</span>
          </div>
          <h3 class="text-white font-semibold text-sm truncate">{{ project.title }}</h3>
          <p class="text-gray-400 text-xs truncate mt-0.5">{{ project.description }}</p>
          <div v-if="project.tech_stack.length" class="flex flex-wrap gap-1 mt-2">
            <span v-for="tech in project.tech_stack.slice(0, 5)" :key="tech"
                  class="px-1.5 py-0.5 text-[10px] rounded bg-neural-700 text-gray-400">
              {{ tech }}
            </span>
            <span v-if="project.tech_stack.length > 5" class="px-1.5 py-0.5 text-[10px] rounded bg-neural-700 text-gray-400">
              +{{ project.tech_stack.length - 5 }}
            </span>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button @click="toggleFeatured(project)"
            class="px-3 py-1.5 text-xs rounded-lg transition-colors"
            :class="project.is_featured ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' : 'bg-neural-700 text-gray-400 hover:text-amber-400 hover:bg-amber-500/10'"
            :title="project.is_featured ? 'Remove from featured' : 'Set as featured'">
            {{ project.is_featured ? '⭐' : '☆' }}
          </button>
          <button @click="openEdit(project)" class="px-3 py-1.5 text-xs bg-neural-700 text-white rounded-lg hover:bg-neural-600 transition-colors">
            Edit
          </button>
          <button @click="handleDelete(project.id)" class="px-3 py-1.5 text-xs bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 transition-colors">
            Delete
          </button>
        </div>
      </div>

      <div v-if="!filteredProjects.length" class="text-center py-12 text-gray-400">
        <p class="text-4xl mb-3">📂</p>
        <p class="text-sm">{{ searchQuery || filterCategory !== 'all' ? 'No projects match your filter.' : 'No projects yet. Click "Add Project" to create one.' }}</p>
      </div>
    </div>

    <!-- Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" @click.self="showModal = false">
        <div class="bg-neural-800 border border-neural-600 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
          <h3 class="text-lg font-bold text-white mb-6">{{ editing ? 'Edit' : 'Add' }} Project</h3>

          <form @submit.prevent="handleSave" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs text-gray-400 uppercase mb-1">Title</label>
                <input v-model="form.title" required class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
              </div>
              <div>
                <label class="block text-xs text-gray-400 uppercase mb-1">Slug (auto-generated)</label>
                <input v-model="form.slug" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" placeholder="auto-from-title" />
              </div>
            </div>

            <div>
              <label class="block text-xs text-gray-400 uppercase mb-1">Description (HTML supported)</label>
              <textarea v-model="form.description" rows="8" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none resize-y font-mono"></textarea>
              <p class="text-[10px] text-white/30 mt-1">Use &lt;h2&gt;, &lt;p&gt;, &lt;ul&gt;&lt;li&gt;, &lt;strong&gt; for rich formatting on the project detail page</p>
            </div>

            <div>
              <label class="block text-xs text-gray-400 uppercase mb-1">Tech Stack (comma-separated)</label>
              <input v-model="form.tech_stack" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" placeholder="Vue, TypeScript, Supabase" />
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-xs text-gray-400 uppercase mb-1">Category</label>
                <select v-model="form.category" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none">
                  <option v-for="cat in PROJECT_CATEGORIES" :key="cat.value" :value="cat.value">{{ cat.label }}</option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-gray-400 uppercase mb-1">Sort Order</label>
                <input v-model.number="form.sort_order" type="number" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
              </div>
              <div class="flex items-end">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input v-model="form.is_featured" type="checkbox" class="w-4 h-4 rounded bg-neural-700 border-neural-600" />
                  <span class="text-sm text-amber-400">⭐ Featured</span>
                </label>
              </div>
            </div>

            <div>
              <label class="block text-xs text-gray-400 uppercase mb-1">Project Image</label>
              <div
                class="relative rounded-lg border-2 border-dashed transition-colors cursor-pointer overflow-hidden"
                :class="isDragging ? 'border-cyber-purple bg-cyber-purple/10' : 'border-neural-600 bg-neural-700/50 hover:border-neural-500'"
                @dragover.prevent="isDragging = true"
                @dragleave="isDragging = false"
                @drop.prevent="handleDrop"
                @click="($refs.fileInput as HTMLInputElement)?.click()"
              >
                <div v-if="form.image_url" class="relative">
                  <img :src="form.image_url" alt="Preview" class="w-full h-48 object-cover rounded-lg" />
                  <button type="button" @click.stop="form.image_url = ''"
                    class="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/70 text-white/70 hover:text-white flex items-center justify-center text-xs">
                    &#10005;
                  </button>
                </div>
                <div v-else class="flex flex-col items-center justify-center py-8 px-4">
                  <svg class="w-8 h-8 text-gray-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  <p class="text-xs text-gray-400">Drop image here or click to browse</p>
                  <p class="text-[10px] text-gray-500 mt-1">PNG, JPG, WebP supported</p>
                </div>
              </div>
              <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="handleFileSelect" />
              <input v-model="form.image_url" class="w-full mt-2 px-3 py-1.5 bg-neural-700 border border-neural-600 rounded-lg text-white text-[11px] focus:border-cyber-purple focus:outline-none" placeholder="Or paste image URL path..." />
            </div>

            <div>
              <label class="block text-xs text-gray-400 uppercase mb-1">Video URL (for Watch Overview)</label>
              <input v-model="form.video_url" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" placeholder="/assets/videos/web/demo.mp4 or https://youtube.com/..." />
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs text-gray-400 uppercase mb-1">GitHub URL</label>
                <input v-model="form.github_url" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" placeholder="https://github.com/..." />
              </div>
              <div>
                <label class="block text-xs text-gray-400 uppercase mb-1">Live URL</label>
                <input v-model="form.live_url" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" placeholder="https://..." />
              </div>
            </div>

            <div class="flex justify-end gap-3 pt-4 border-t border-neural-600">
              <button type="button" @click="showModal = false" class="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button type="submit" class="px-6 py-2 rounded-lg text-sm font-medium text-white"
                      style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
                {{ editing ? 'Update' : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

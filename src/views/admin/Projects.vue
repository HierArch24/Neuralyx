<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'
import type { Project } from '@/types/database'

const admin = useAdminStore()
const showModal = ref(false)
const editing = ref<Project | null>(null)

const form = ref({
  title: '',
  slug: '',
  description: '',
  image_url: '',
  tech_stack: '',
  category: 'web',
  github_url: '',
  live_url: '',
  is_featured: false,
  sort_order: 0,
})

onMounted(() => admin.fetchProjects())

function openCreate() {
  editing.value = null
  Object.assign(form.value, { title: '', slug: '', description: '', image_url: '', tech_stack: '', category: 'web', github_url: '', live_url: '', is_featured: false, sort_order: 0 })
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
    slug: form.value.slug || form.value.title.toLowerCase().replace(/\s+/g, '-'),
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
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-8">
      <h2 class="text-2xl font-bold text-white">Projects</h2>
      <button @click="openCreate" class="px-4 py-2 bg-cyber-purple hover:bg-cyber-purple/80 text-white rounded-lg text-sm transition-all">
        Add Project
      </button>
    </div>

    <div class="glass-dark rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-neural-700/50">
          <tr>
            <th class="text-left p-4 text-gray-400 font-medium">Title</th>
            <th class="text-left p-4 text-gray-400 font-medium">Category</th>
            <th class="text-left p-4 text-gray-400 font-medium">Featured</th>
            <th class="text-right p-4 text-gray-400 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="project in admin.projects" :key="project.id" class="border-t border-neural-700">
            <td class="p-4 text-white">{{ project.title }}</td>
            <td class="p-4 text-gray-400 capitalize">{{ project.category }}</td>
            <td class="p-4">
              <span :class="project.is_featured ? 'text-angelic-gold' : 'text-gray-600'">
                {{ project.is_featured ? 'Yes' : 'No' }}
              </span>
            </td>
            <td class="p-4 text-right space-x-2">
              <button @click="openEdit(project)" class="text-cyber-cyan hover:text-white transition-colors">Edit</button>
              <button @click="handleDelete(project.id)" class="text-red-400 hover:text-red-300 transition-colors">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div class="glass-dark rounded-xl p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <h3 class="text-xl font-bold text-white mb-6">{{ editing ? 'Edit' : 'Add' }} Project</h3>

          <form @submit.prevent="handleSave" class="space-y-4">
            <div>
              <label class="block text-sm text-gray-400 mb-1">Title</label>
              <input v-model="form.title" required class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">Description</label>
              <textarea v-model="form.description" rows="3" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none resize-none" />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm text-gray-400 mb-1">Category</label>
                <select v-model="form.category" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none">
                  <option value="ai">AI</option>
                  <option value="web">Web</option>
                  <option value="automation">Automation</option>
                  <option value="mobile">Mobile</option>
                  <option value="game">Game</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label class="block text-sm text-gray-400 mb-1">Sort Order</label>
                <input v-model.number="form.sort_order" type="number" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
              </div>
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">Tech Stack (comma-separated)</label>
              <input v-model="form.tech_stack" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" placeholder="Vue, TypeScript, Supabase" />
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">Image URL</label>
              <input v-model="form.image_url" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm text-gray-400 mb-1">GitHub URL</label>
                <input v-model="form.github_url" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
              </div>
              <div>
                <label class="block text-sm text-gray-400 mb-1">Live URL</label>
                <input v-model="form.live_url" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
              </div>
            </div>
            <label class="flex items-center gap-2">
              <input v-model="form.is_featured" type="checkbox" class="accent-cyber-purple" />
              <span class="text-sm text-gray-300">Featured project</span>
            </label>

            <div class="flex justify-end gap-3 mt-6">
              <button type="button" @click="showModal = false" class="px-4 py-2 bg-neural-700 text-gray-300 rounded-lg text-sm">Cancel</button>
              <button type="submit" class="px-4 py-2 bg-cyber-purple text-white rounded-lg text-sm">Save</button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

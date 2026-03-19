<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'
import type { Tool } from '@/types/database'

const admin = useAdminStore()
const showModal = ref(false)
const editing = ref<Tool | null>(null)

const form = ref({ name: '', category: 'ide', icon: '', url: '', description: '' })
const toolCategories = ['ide', 'ai-tools', 'devops', 'design', 'productivity', 'other']

onMounted(() => admin.fetchTools())

function openCreate() {
  editing.value = null
  Object.assign(form.value, { name: '', category: 'ide', icon: '', url: '', description: '' })
  showModal.value = true
}

function openEdit(tool: Tool) {
  editing.value = tool
  Object.assign(form.value, tool)
  showModal.value = true
}

async function handleSave() {
  if (editing.value) {
    await admin.updateRow('tools', editing.value.id, form.value)
  } else {
    await admin.insertRow('tools', form.value)
  }
  showModal.value = false
  await admin.fetchTools()
}

async function handleDelete(id: string) {
  if (confirm('Delete this tool?')) {
    await admin.deleteRow('tools', id)
    await admin.fetchTools()
  }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-8">
      <h2 class="text-2xl font-bold text-white">Tools</h2>
      <button @click="openCreate" class="px-4 py-2 bg-cyber-purple hover:bg-cyber-purple/80 text-white rounded-lg text-sm">
        Add Tool
      </button>
    </div>

    <div class="glass-dark rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-neural-700/50">
          <tr>
            <th class="text-left p-4 text-gray-400 font-medium">Name</th>
            <th class="text-left p-4 text-gray-400 font-medium">Category</th>
            <th class="text-right p-4 text-gray-400 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tool in admin.tools" :key="tool.id" class="border-t border-neural-700">
            <td class="p-4 text-white">{{ tool.icon }} {{ tool.name }}</td>
            <td class="p-4 text-gray-400">{{ tool.category }}</td>
            <td class="p-4 text-right space-x-2">
              <button @click="openEdit(tool)" class="text-cyber-cyan hover:text-white">Edit</button>
              <button @click="handleDelete(tool.id)" class="text-red-400 hover:text-red-300">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Teleport to="body">
      <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div class="glass-dark rounded-xl p-8 w-full max-w-md">
          <h3 class="text-xl font-bold text-white mb-6">{{ editing ? 'Edit' : 'Add' }} Tool</h3>
          <form @submit.prevent="handleSave" class="space-y-4">
            <div>
              <label class="block text-sm text-gray-400 mb-1">Name</label>
              <input v-model="form.name" required class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">Category</label>
              <select v-model="form.category" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none">
                <option v-for="cat in toolCategories" :key="cat" :value="cat">{{ cat }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">Icon (emoji)</label>
              <input v-model="form.icon" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">URL</label>
              <input v-model="form.url" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">Description</label>
              <textarea v-model="form.description" rows="2" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none resize-none" />
            </div>
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

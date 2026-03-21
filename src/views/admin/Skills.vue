<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'
import type { Skill } from '@/types/database'

const admin = useAdminStore()
const showModal = ref(false)
const editing = ref<Skill | null>(null)

const form = ref({
  name: '',
  category: 'programming',
  icon: '',
  proficiency: 80,
  years_experience: 1,
})

const categories = ['programming', 'database', 'ml-ai', 'llm', 'automation', 'full-stack', 'mobile', 'game-dev', 'cloud']

onMounted(() => admin.fetchSkills())

function openCreate() {
  editing.value = null
  Object.assign(form.value, { name: '', category: 'programming', icon: '', proficiency: 80, years_experience: 1 })
  showModal.value = true
}

function openEdit(skill: Skill) {
  editing.value = skill
  Object.assign(form.value, skill)
  showModal.value = true
}

async function handleSave() {
  try {
    if (editing.value) {
      await admin.updateRow('skills', editing.value.id, { ...form.value })
    } else {
      await admin.insertRow('skills', { ...form.value })
    }
    showModal.value = false
    await admin.fetchSkills()
  } catch (e: any) {
    alert('Save failed: ' + (e.message || e))
  }
}

async function handleDelete(id: string) {
  if (confirm('Delete this skill?')) {
    await admin.deleteRow('skills', id)
    await admin.fetchSkills()
  }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-8">
      <h2 class="text-2xl font-bold text-white">Skills</h2>
      <button @click="openCreate" class="px-4 py-2 bg-cyber-purple hover:bg-cyber-purple/80 text-white rounded-lg text-sm">
        Add Skill
      </button>
    </div>

    <div class="glass-dark rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-neural-700/50">
          <tr>
            <th class="text-left p-4 text-gray-400 font-medium">Name</th>
            <th class="text-left p-4 text-gray-400 font-medium">Category</th>
            <th class="text-left p-4 text-gray-400 font-medium">Proficiency</th>
            <th class="text-right p-4 text-gray-400 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="skill in admin.skills" :key="skill.id" class="border-t border-neural-700">
            <td class="p-4 text-white">{{ skill.icon }} {{ skill.name }}</td>
            <td class="p-4 text-gray-400">{{ skill.category }}</td>
            <td class="p-4">
              <div class="flex items-center gap-2">
                <div class="w-20 h-1.5 bg-neural-700 rounded-full overflow-hidden">
                  <div class="h-full bg-cyber-cyan rounded-full" :style="{ width: `${skill.proficiency}%` }" />
                </div>
                <span class="text-gray-400 text-xs">{{ skill.proficiency }}%</span>
              </div>
            </td>
            <td class="p-4 text-right space-x-2">
              <button @click="openEdit(skill)" class="text-cyber-cyan hover:text-white">Edit</button>
              <button @click="handleDelete(skill.id)" class="text-red-400 hover:text-red-300">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div class="glass-dark rounded-xl p-8 w-full max-w-md">
          <h3 class="text-xl font-bold text-white mb-6">{{ editing ? 'Edit' : 'Add' }} Skill</h3>
          <form @submit.prevent="handleSave" class="space-y-4">
            <div>
              <label class="block text-sm text-gray-400 mb-1">Name</label>
              <input v-model="form.name" required class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">Category</label>
              <select v-model="form.category" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none">
                <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">Icon (emoji)</label>
              <input v-model="form.icon" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm text-gray-400 mb-1">Proficiency (0-100)</label>
                <input v-model.number="form.proficiency" type="number" min="0" max="100" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
              </div>
              <div>
                <label class="block text-sm text-gray-400 mb-1">Years Experience</label>
                <input v-model.number="form.years_experience" type="number" min="0" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
              </div>
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

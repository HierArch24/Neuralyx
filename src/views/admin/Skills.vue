<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'
import { useSupabase } from '@/composables/useSupabase'
import type { Skill } from '@/types/database'

const admin = useAdminStore()
const { supabase } = useSupabase()
const showModal = ref(false)
const editing = ref<Skill | null>(null)
const bulkYears = ref(8)
const bulkProficiency = ref(0)
const showBulkPanel = ref(false)
const searchQuery = ref('')
const filterCategory = ref('all')

const form = ref({
  name: '',
  category: 'programming',
  icon: '',
  proficiency: 80,
  years_experience: 8,
})

const categories = ['programming', 'database', 'ml-ai', 'llm', 'automation', 'full-stack', 'mobile', 'game-dev', 'cloud']

const filteredSkills = computed(() => {
  let results = admin.skills
  if (filterCategory.value !== 'all') results = results.filter(s => s.category === filterCategory.value)
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    results = results.filter(s => s.name.toLowerCase().includes(q))
  }
  return results
})

const categoryCounts = computed(() => {
  const counts: Record<string, number> = {}
  admin.skills.forEach(s => { counts[s.category] = (counts[s.category] || 0) + 1 })
  return counts
})

onMounted(() => admin.fetchSkills())

function openCreate() {
  editing.value = null
  Object.assign(form.value, { name: '', category: 'programming', icon: '', proficiency: 80, years_experience: 8 })
  showModal.value = true
}

function openEdit(skill: Skill) {
  editing.value = skill
  form.value = {
    name: skill.name,
    category: skill.category,
    icon: skill.icon || '',
    proficiency: skill.proficiency,
    years_experience: skill.years_experience,
  }
  showModal.value = true
}

async function handleSave() {
  try {
    const data = { ...form.value }
    if (editing.value) {
      await admin.updateRow('skills', editing.value.id, data)
    } else {
      await admin.insertRow('skills', data)
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

const bulkStatus = ref('')

async function bulkSetYears() {
  bulkStatus.value = 'Applying...'
  try {
    if (filterCategory.value === 'all') {
      // Update all — use individual calls since Supabase needs a filter
      for (const s of admin.skills) {
        await supabase.from('skills').update({ years_experience: bulkYears.value } as never).eq('id', s.id)
      }
    } else {
      await supabase.from('skills').update({ years_experience: bulkYears.value } as never).eq('category', filterCategory.value)
    }
    await admin.fetchSkills()
    bulkStatus.value = `Set ${filterCategory.value === 'all' ? 'all' : filterCategory.value} skills to ${bulkYears.value} years`
    setTimeout(() => { bulkStatus.value = '' }, 3000)
  } catch (e: any) {
    bulkStatus.value = 'Error: ' + e.message
  }
}

async function bulkSetProficiency() {
  if (bulkProficiency.value <= 0) return
  bulkStatus.value = 'Applying...'
  try {
    if (filterCategory.value === 'all') {
      for (const s of admin.skills) {
        await supabase.from('skills').update({ proficiency: bulkProficiency.value } as never).eq('id', s.id)
      }
    } else {
      await supabase.from('skills').update({ proficiency: bulkProficiency.value } as never).eq('category', filterCategory.value)
    }
    await admin.fetchSkills()
    bulkStatus.value = `Set ${filterCategory.value === 'all' ? 'all' : filterCategory.value} proficiency to ${bulkProficiency.value}%`
    setTimeout(() => { bulkStatus.value = '' }, 3000)
  } catch (e: any) {
    bulkStatus.value = 'Error: ' + e.message
  }
}

// Pagination
const currentPage = ref(1)
const perPage = 10
const totalPages = computed(() => Math.max(1, Math.ceil(filteredSkills.value.length / perPage)))
const paginatedSkills = computed(() => {
  const start = (currentPage.value - 1) * perPage
  return filteredSkills.value.slice(start, start + perPage)
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-white">Skills</h2>
        <p class="text-xs text-gray-400 mt-1">{{ admin.skills.length }} skills across {{ Object.keys(categoryCounts).length }} categories</p>
      </div>
      <div class="flex gap-2">
        <button @click="showBulkPanel = !showBulkPanel"
          class="px-3 py-2 bg-neural-700 hover:bg-neural-600 text-gray-300 rounded-lg text-sm transition-colors">
          Bulk Edit
        </button>
        <button @click="openCreate"
          class="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
          + Add Skill
        </button>
      </div>
    </div>

    <!-- Bulk Edit Panel -->
    <div v-if="showBulkPanel" class="bg-neural-800 border border-neural-600 rounded-xl p-4 mb-4 space-y-3">
      <p class="text-xs text-gray-400">Apply changes to {{ filterCategory === 'all' ? 'ALL' : filterCategory }} skills:</p>
      <div class="flex flex-wrap gap-4 items-end">
        <div>
          <label class="block text-[10px] text-gray-500 uppercase mb-1">Set All Years Experience</label>
          <div class="flex gap-2">
            <input v-model.number="bulkYears" type="number" min="0" max="20"
              class="w-20 px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
            <button @click="bulkSetYears"
              class="px-4 py-2 text-xs rounded-lg font-medium text-white"
              style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
              Apply Years
            </button>
          </div>
        </div>
        <div>
          <label class="block text-[10px] text-gray-500 uppercase mb-1">Set All Proficiency</label>
          <div class="flex gap-2">
            <input v-model.number="bulkProficiency" type="number" min="0" max="100"
              class="w-20 px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
            <button @click="bulkSetProficiency"
              class="px-4 py-2 text-xs rounded-lg font-medium text-white"
              style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
              Apply Proficiency
            </button>
          </div>
        </div>
      </div>
      <p v-if="bulkStatus" class="text-xs" :class="bulkStatus.startsWith('Error') ? 'text-red-400' : 'text-green-400'">{{ bulkStatus }}</p>
      <p v-else class="text-[10px] text-white/30">Applies to {{ filterCategory === 'all' ? 'all skills' : `"${filterCategory}" category only` }}</p>
    </div>

    <!-- Search -->
    <div class="mb-4 relative">
      <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
      </svg>
      <input v-model="searchQuery" type="text" placeholder="Search skills..."
        class="w-full pl-10 pr-4 py-2.5 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none placeholder-gray-500" />
    </div>

    <!-- Category Filter -->
    <div class="flex flex-wrap gap-2 mb-4">
      <button @click="filterCategory = 'all'"
        class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        :class="filterCategory === 'all' ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-neural-700 text-gray-400 hover:text-white'">
        All ({{ admin.skills.length }})
      </button>
      <button v-for="cat in categories" :key="cat" v-show="categoryCounts[cat]"
        @click="filterCategory = cat"
        class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        :class="filterCategory === cat ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-neural-700 text-gray-400 hover:text-white'">
        {{ cat }} ({{ categoryCounts[cat] || 0 }})
      </button>
    </div>

    <!-- Skills Table -->
    <div class="glass-dark rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-neural-700/50">
          <tr>
            <th class="text-left p-4 text-gray-400 font-medium">Name</th>
            <th class="text-left p-4 text-gray-400 font-medium">Category</th>
            <th class="text-left p-4 text-gray-400 font-medium">Proficiency</th>
            <th class="text-left p-4 text-gray-400 font-medium">Years</th>
            <th class="text-right p-4 text-gray-400 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="skill in paginatedSkills" :key="skill.id" class="border-t border-neural-700">
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
            <td class="p-4 text-gray-400 text-xs">{{ skill.years_experience }}y</td>
            <td class="p-4 text-right space-x-2">
              <button @click="openEdit(skill)" class="text-cyber-cyan hover:text-white text-xs">Edit</button>
              <button @click="handleDelete(skill.id)" class="text-red-400 hover:text-red-300 text-xs">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-between mt-4">
      <p class="text-xs text-gray-500">Showing {{ (currentPage - 1) * perPage + 1 }}–{{ Math.min(currentPage * perPage, filteredSkills.length) }} of {{ filteredSkills.length }}</p>
      <div class="flex items-center gap-2">
        <button @click="currentPage = Math.max(1, currentPage - 1)" :disabled="currentPage === 1"
          class="px-3 py-1.5 text-xs rounded-lg bg-neural-700 text-gray-400 disabled:opacity-30 hover:text-white transition-colors">Prev</button>
        <span class="text-xs text-gray-400">{{ currentPage }} / {{ totalPages }}</span>
        <button @click="currentPage = Math.min(totalPages, currentPage + 1)" :disabled="currentPage === totalPages"
          class="px-3 py-1.5 text-xs rounded-lg bg-neural-700 text-gray-400 disabled:opacity-30 hover:text-white transition-colors">Next</button>
      </div>
    </div>

    <!-- Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="showModal = false">
        <div class="bg-neural-800 border border-neural-600 rounded-xl p-6 w-full max-w-md">
          <h3 class="text-lg font-bold text-white mb-6">{{ editing ? 'Edit' : 'Add' }} Skill</h3>
          <form @submit.prevent="handleSave" class="space-y-4">
            <div>
              <label class="block text-xs text-gray-400 uppercase mb-1">Name</label>
              <input v-model="form.name" required class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
            </div>
            <div>
              <label class="block text-xs text-gray-400 uppercase mb-1">Category</label>
              <select v-model="form.category" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none">
                <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-gray-400 uppercase mb-1">Icon (emoji)</label>
              <input v-model="form.icon" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs text-gray-400 uppercase mb-1">Proficiency (0-100)</label>
                <input v-model.number="form.proficiency" type="number" min="0" max="100" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
              </div>
              <div>
                <label class="block text-xs text-gray-400 uppercase mb-1">Years Experience</label>
                <input v-model.number="form.years_experience" type="number" min="0" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
              </div>
            </div>
            <div class="flex justify-end gap-3 pt-4 border-t border-neural-600">
              <button type="button" @click="showModal = false" class="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
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

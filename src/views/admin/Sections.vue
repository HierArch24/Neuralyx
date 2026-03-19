<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'
import type { Section } from '@/types/database'

const admin = useAdminStore()
const showModal = ref(false)
const editing = ref<Section | null>(null)

const form = ref({
  slug: '',
  title: '',
  subtitle: '',
  content: '{}',
  sort_order: 0,
  is_visible: true,
})

onMounted(() => admin.fetchSections())

function openEdit(section: Section) {
  editing.value = section
  Object.assign(form.value, {
    ...section,
    content: JSON.stringify(section.content, null, 2),
  })
  showModal.value = true
}

async function handleSave() {
  let parsedContent: Record<string, unknown>
  try {
    parsedContent = JSON.parse(form.value.content)
  } catch {
    alert('Invalid JSON in content field')
    return
  }

  const data = { ...form.value, content: parsedContent }

  if (editing.value) {
    await admin.updateRow('sections', editing.value.id, data)
  } else {
    await admin.insertRow('sections', data)
  }
  showModal.value = false
  await admin.fetchSections()
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-8">
      <h2 class="text-2xl font-bold text-white">Sections</h2>
    </div>

    <div class="space-y-4">
      <div
        v-for="section in admin.sections"
        :key="section.id"
        class="glass-dark rounded-xl p-6 flex items-center justify-between"
      >
        <div>
          <div class="flex items-center gap-3">
            <span class="text-xs px-2 py-1 bg-neural-700 text-gray-400 rounded font-mono">{{ section.slug }}</span>
            <h3 class="text-white font-medium">{{ section.title }}</h3>
            <span v-if="!section.is_visible" class="text-xs text-red-400">(hidden)</span>
          </div>
          <p v-if="section.subtitle" class="text-sm text-gray-400 mt-1">{{ section.subtitle }}</p>
        </div>
        <button @click="openEdit(section)" class="text-sm text-cyber-cyan hover:text-white transition-colors">
          Edit
        </button>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div class="glass-dark rounded-xl p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <h3 class="text-xl font-bold text-white mb-6">Edit Section</h3>
          <form @submit.prevent="handleSave" class="space-y-4">
            <div>
              <label class="block text-sm text-gray-400 mb-1">Title</label>
              <input v-model="form.title" required class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">Subtitle</label>
              <input v-model="form.subtitle" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">Content (JSON)</label>
              <textarea v-model="form.content" rows="10" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm font-mono focus:border-cyber-purple focus:outline-none resize-none" />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm text-gray-400 mb-1">Sort Order</label>
                <input v-model.number="form.sort_order" type="number" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
              </div>
              <div class="flex items-end">
                <label class="flex items-center gap-2">
                  <input v-model="form.is_visible" type="checkbox" class="accent-cyber-purple" />
                  <span class="text-sm text-gray-300">Visible</span>
                </label>
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

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

interface Certificate {
  id: string
  name: string
  issuer: string
  file: string
  isImage: boolean
  ext: string
  featured: boolean
}

const STORAGE_KEY = 'neuralyx_certificates'
const certificates = ref<Certificate[]>([])
const showModal = ref(false)
const editing = ref<Certificate | null>(null)
const searchQuery = ref('')
const viewerOpen = ref(false)
const viewerCert = ref<Certificate | null>(null)
const currentPage = ref(1)
const perPage = 9

const form = ref({ name: '', issuer: '', file: '', featured: false })

// Auto-scan certificate files from known directory with issuers
const knownFiles: { file: string; issuer: string; featured: boolean }[] = [
  { file: 'Data Science, Machine Learning, Data Analysis, Python & R.jpg', issuer: 'DATAhill Solutions Srinivas Reddy', featured: true },
  { file: 'comprehensive course on Langflow and Langchain.jpg', issuer: 'Techlatest.net', featured: true },
  { file: 'Business Intelligence by Google Career.png', issuer: 'Cursa', featured: true },
  { file: 'Machine Learning.pdf', issuer: 'Simplilearn', featured: true },
  { file: 'AWS Certified Machine Learning.jpeg', issuer: 'AWS', featured: false },
  { file: 'AWS DataSync Primer.pdf', issuer: 'AWS', featured: false },
  { file: 'AWS Fundamentals.pdf', issuer: 'AWS', featured: false },
  { file: 'Data Science, Machine Learning, Data Analysis, Python and R.pdf', issuer: 'DATAhill Solutions', featured: false },
  { file: 'Embedding NLP.pdf', issuer: 'Coursera', featured: false },
  { file: 'Introduction to Neural Network.pdf', issuer: 'Coursera', featured: false },
  { file: 'Introduction to deep Learning Keras.pdf', issuer: 'Coursera', featured: false },
  { file: 'Machine Learning Expert Matlab.pdf', issuer: 'MathWorks', featured: false },
  { file: 'Machine Learning by standford.png', issuer: 'Stanford Online', featured: false },
  { file: 'Machine leraning for healthcare by MIT.png', issuer: 'MIT', featured: false },
  { file: 'Multiuser Python Jupyer Notebooks for Gen AI, ML and DS.jpg', issuer: 'IBM', featured: false },
  { file: 'Natural Language Processing.png', issuer: 'Coursera', featured: false },
  { file: 'Python for Beginners.pdf', issuer: 'Simplilearn', featured: false },
  { file: 'Quantum Machine Learning.jpeg', issuer: 'IBM / Qiskit', featured: false },
  { file: 'R for Data Science (Crash Course).jpg', issuer: 'Udemy', featured: false },
  { file: 'Software Engineering 101.jpg', issuer: 'Udemy', featured: false },
]

function fileToEntry(entry: { file: string; issuer: string; featured: boolean }): Certificate {
  const ext = entry.file.split('.').pop()?.toLowerCase() || ''
  const name = entry.file.replace(/\.[^.]+$/, '')
  return {
    id: btoa(entry.file).replace(/=/g, ''),
    name,
    issuer: entry.issuer,
    file: `/assets/images/certificates/${entry.file}`,
    isImage: ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext),
    ext,
    featured: entry.featured,
  }
}

function loadCerts() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    const parsed = JSON.parse(saved)
    // Check if data has issuers filled — if all issuers are empty, re-initialize
    const hasIssuers = parsed.some((c: Certificate) => c.issuer && c.issuer.length > 0)
    if (hasIssuers) {
      certificates.value = parsed
    } else {
      certificates.value = knownFiles.map(fileToEntry)
      saveCerts()
    }
  } else {
    certificates.value = knownFiles.map(fileToEntry)
    saveCerts()
  }
}

function saveCerts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(certificates.value))
}

const filteredCerts = computed(() => {
  let results = certificates.value
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    results = results.filter(c => c.name.toLowerCase().includes(q) || c.issuer.toLowerCase().includes(q))
  }
  return results
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredCerts.value.length / perPage)))
const paginatedCerts = computed(() => {
  const start = (currentPage.value - 1) * perPage
  return filteredCerts.value.slice(start, start + perPage)
})

const featuredCount = computed(() => certificates.value.filter(c => c.featured).length)

function openCreate() {
  editing.value = null
  form.value = { name: '', issuer: '', file: '', featured: false }
  showModal.value = true
}

function openEdit(cert: Certificate) {
  editing.value = cert
  form.value = { name: cert.name, issuer: cert.issuer, file: cert.file, featured: cert.featured }
  showModal.value = true
}

function handleSave() {
  if (editing.value) {
    const idx = certificates.value.findIndex(c => c.id === editing.value!.id)
    if (idx >= 0) {
      const ext = form.value.file.split('.').pop()?.toLowerCase() || ''
      certificates.value[idx] = {
        ...certificates.value[idx],
        name: form.value.name,
        issuer: form.value.issuer,
        file: form.value.file,
        featured: form.value.featured,
        ext,
        isImage: ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext),
      }
    }
  } else {
    const ext = form.value.file.split('.').pop()?.toLowerCase() || ''
    certificates.value.push({
      id: Date.now().toString(36),
      name: form.value.name,
      issuer: form.value.issuer,
      file: form.value.file,
      featured: form.value.featured,
      ext,
      isImage: ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext),
    })
  }
  saveCerts()
  showModal.value = false
}

function handleDelete(id: string) {
  if (confirm('Delete this certificate?')) {
    certificates.value = certificates.value.filter(c => c.id !== id)
    saveCerts()
  }
}

function toggleFeatured(cert: Certificate) {
  cert.featured = !cert.featured
  saveCerts()
}

function openViewer(cert: Certificate) {
  if (cert.file.toLowerCase().endsWith('.pdf')) {
    window.open(cert.file, '_blank')
    return
  }
  viewerCert.value = cert
  viewerOpen.value = true
}

onMounted(loadCerts)
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-white">Certificates</h2>
        <p class="text-xs text-gray-400 mt-1">{{ certificates.length }} certificates &middot; {{ featuredCount }} featured in resume</p>
      </div>
      <button @click="openCreate"
        class="px-4 py-2 rounded-lg text-sm font-medium text-white"
        style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
        + Add Certificate
      </button>
    </div>

    <!-- Search -->
    <div class="mb-4 relative">
      <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
      </svg>
      <input v-model="searchQuery" @input="currentPage = 1" type="text" placeholder="Search certificates..."
        class="w-full pl-10 pr-4 py-2.5 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none placeholder-gray-500" />
    </div>

    <!-- Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      <div v-for="cert in paginatedCerts" :key="cert.id"
           class="bg-neural-800 border rounded-lg overflow-hidden"
           :class="cert.featured ? 'border-amber-500/40' : 'border-neural-600'">
        <div class="aspect-[4/3] overflow-hidden bg-neural-900 cursor-pointer relative group" @click="openViewer(cert)">
          <img v-if="cert.isImage" :src="cert.file" :alt="cert.name" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
          <embed v-else :src="cert.file + '#toolbar=0&navpanes=0&scrollbar=0'" type="application/pdf" class="w-full h-full pointer-events-none" />
          <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span class="text-white text-xs bg-white/20 px-3 py-1 rounded-full">View</span>
          </div>
          <span v-if="cert.featured" class="absolute top-2 left-2 px-2 py-0.5 text-[10px] rounded-full bg-amber-500/20 text-amber-400 font-semibold">⭐ Resume</span>
        </div>
        <div class="p-3">
          <h3 class="text-white text-xs font-medium truncate">{{ cert.name }}</h3>
          <p v-if="cert.issuer" class="text-gray-500 text-[10px] truncate mt-0.5">{{ cert.issuer }}</p>
          <div class="flex items-center justify-between mt-2">
            <span class="text-white/20 text-[10px] uppercase">{{ cert.ext }}</span>
            <div class="flex items-center gap-1">
              <button @click="toggleFeatured(cert)"
                class="px-2 py-1 text-[10px] rounded transition-colors"
                :class="cert.featured ? 'bg-amber-500/20 text-amber-400' : 'bg-neural-700 text-gray-500 hover:text-amber-400'">
                {{ cert.featured ? '⭐' : '☆' }}
              </button>
              <button @click="openEdit(cert)" class="px-2 py-1 text-[10px] bg-neural-700 text-white rounded hover:bg-neural-600">Edit</button>
              <button @click="handleDelete(cert.id)" class="px-2 py-1 text-[10px] bg-red-900/30 text-red-400 rounded hover:bg-red-900/50">Del</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-center gap-2">
      <button @click="currentPage = Math.max(1, currentPage - 1)" :disabled="currentPage === 1"
        class="px-3 py-1.5 text-xs rounded-lg bg-neural-700 text-gray-400 disabled:opacity-30 hover:text-white transition-colors">
        Prev
      </button>
      <span class="text-xs text-gray-400">{{ currentPage }} / {{ totalPages }}</span>
      <button @click="currentPage = Math.min(totalPages, currentPage + 1)" :disabled="currentPage === totalPages"
        class="px-3 py-1.5 text-xs rounded-lg bg-neural-700 text-gray-400 disabled:opacity-30 hover:text-white transition-colors">
        Next
      </button>
    </div>

    <!-- Edit/Create Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" @click.self="showModal = false">
        <div class="bg-neural-800 border border-neural-600 rounded-xl w-full max-w-lg p-6">
          <h3 class="text-lg font-bold text-white mb-6">{{ editing ? 'Edit' : 'Add' }} Certificate</h3>
          <form @submit.prevent="handleSave" class="space-y-4">
            <div>
              <label class="block text-xs text-gray-400 uppercase mb-1">Certificate Name</label>
              <input v-model="form.name" required class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
            </div>
            <div>
              <label class="block text-xs text-gray-400 uppercase mb-1">Issuer</label>
              <input v-model="form.issuer" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" placeholder="e.g. Coursera, AWS, Google" />
            </div>
            <div>
              <label class="block text-xs text-gray-400 uppercase mb-1">Image/File Path</label>
              <input v-model="form.file" required class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" placeholder="/assets/images/certificates/filename.jpg" />
              <p class="text-[10px] text-white/30 mt-1">Place file in public/assets/images/certificates/ then enter the path here</p>
            </div>
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="form.featured" type="checkbox" class="w-4 h-4 rounded bg-neural-700 border-neural-600" />
              <span class="text-sm text-amber-400">⭐ Show in Resume</span>
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
          <div class="relative max-w-4xl w-full max-h-[90vh] rounded-xl border border-white/10 overflow-hidden" style="background: rgba(12,12,22,0.98);">
            <div class="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]">
              <span class="text-xs text-white/50">{{ viewerCert?.name }}</span>
              <button @click="viewerOpen = false" class="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center">
                <svg class="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div class="p-4 overflow-auto max-h-[80vh]" data-lenis-prevent>
              <img :src="viewerCert?.file" :alt="viewerCert?.name" class="max-w-full mx-auto rounded-lg" />
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

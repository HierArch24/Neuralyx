<template>
  <div class="min-h-screen py-24 px-6" style="background-color: var(--dark-shade-1)">
    <div class="max-w-6xl mx-auto">
      <router-link to="/" class="btn-outline-light mb-8 inline-block">&larr; Back</router-link>

      <h1 class="font-[Syncopate] text-[clamp(2rem,5vw,4rem)] font-bold uppercase bg-clip-text text-transparent mb-4"
          style="background-image: linear-gradient(135deg, var(--gradient-start), var(--gradient-mid), var(--gradient-end))">
        Certificates
      </h1>
      <p class="text-white/40 text-sm font-[Poppins] mb-12">{{ certificates.length }} certificates &amp; credentials</p>

      <div ref="gridRef" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="cert in certificates"
          :key="cert.file"
          class="group bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden hover:border-cyber-purple/30 transition-all duration-300 cursor-pointer hover:-translate-y-1"
          @click="openViewer(cert)"
        >
          <div class="aspect-[4/3] overflow-hidden bg-neural-800">
            <img v-if="cert.isImage" :src="cert.file" :alt="cert.name" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
            <embed v-else :src="cert.file + '#toolbar=0&navpanes=0&scrollbar=0'" type="application/pdf" class="w-full h-full pointer-events-none" />
          </div>
          <div class="p-4">
            <h3 class="text-white text-sm font-medium truncate">{{ cert.name }}</h3>
            <div class="flex items-center justify-between mt-2">
              <span class="text-white/30 text-[10px] uppercase">{{ cert.ext }}</span>
              <span class="text-cyber-cyan/60 text-xs group-hover:text-cyber-cyan transition-colors">View &rarr;</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Floating Image/PDF Viewer -->
    <Teleport to="body">
      <Transition name="cert-viewer">
        <div v-if="viewerOpen" class="fixed inset-0 z-[100] flex items-center justify-center p-4" @click.self="closeViewer()">
          <div class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
          <div class="relative max-w-5xl w-full max-h-[92vh] rounded-2xl border border-white/10 overflow-hidden flex flex-col"
               style="background: rgba(12,12,22,0.98);">
            <div class="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] flex-shrink-0">
              <h3 class="text-white text-sm font-medium truncate pr-4">{{ viewerCert?.name }}</h3>
              <div class="flex items-center gap-2 flex-shrink-0">
                <a :href="viewerCert?.file" target="_blank" download
                   class="px-3 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                  Download
                </a>
                <button @click="closeViewer()" class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center transition-colors">
                  <svg class="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
            <div class="flex-1 overflow-auto p-4" data-lenis-prevent>
              <img v-if="viewerCert?.isImage" :src="viewerCert?.file" :alt="viewerCert?.name" class="max-w-full mx-auto rounded-lg" />
              <iframe v-else :src="viewerCert?.file" class="w-full h-[80vh] rounded-lg border-0"></iframe>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { gsap } from '@/lib/gsap-setup'

interface CertFile {
  file: string
  name: string
  ext: string
  isImage: boolean
}

const gridRef = ref<HTMLElement | null>(null)
const viewerOpen = ref(false)
const viewerCert = ref<CertFile | null>(null)

const certFiles = [
  'AWS Certified Machine Learning.jpeg',
  'AWS DataSync Primer.pdf',
  'AWS Fundamentals.pdf',
  'Business Intelligence by Google Career.png',
  'Data Science, Machine Learning, Data Analysis, Python & R.jpg',
  'Data Science, Machine Learning, Data Analysis, Python and R.pdf',
  'Embedding NLP.pdf',
  'Introduction to Neural Network.pdf',
  'Introduction to deep Learning Keras.pdf',
  'Machine Learning Expert Matlab.pdf',
  'Machine Learning by standford.png',
  'Machine Learning.pdf',
  'Machine leraning for healthcare by MIT.png',
  'Multiuser Python Jupyer Notebooks for Gen AI, ML and DS.jpg',
  'Natural Language Processing.png',
  'Python for Beginners.pdf',
  'Quantum Machine Learning.jpeg',
  'R for Data Science (Crash Course).jpg',
  'Software Engineering 101.jpg',
  'comprehensive course on Langflow and Langchain.jpg',
]

const certificates: CertFile[] = certFiles.map(f => {
  const ext = f.split('.').pop()?.toLowerCase() || ''
  const name = f.replace(/\.[^.]+$/, '')
  return {
    file: `/assets/images/certificates/${f}`,
    name,
    ext,
    isImage: ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext),
  }
})

function openViewer(cert: CertFile) {
  viewerCert.value = cert
  viewerOpen.value = true
}

function closeViewer() {
  viewerOpen.value = false
  viewerCert.value = null
}

onMounted(() => {
  if (!gridRef.value) return
  gsap.from(gridRef.value.children, {
    y: 30, opacity: 0, duration: 0.5, stagger: 0.06, ease: 'power2.out'
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && viewerOpen.value) closeViewer()
  })
})
</script>

<style scoped>
.cert-viewer-enter-active, .cert-viewer-leave-active {
  transition: opacity 0.25s ease;
}
.cert-viewer-enter-from, .cert-viewer-leave-to {
  opacity: 0;
}
</style>

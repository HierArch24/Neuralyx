<template>
  <div class="min-h-screen py-24 px-6" style="background-color: var(--dark-shade-1)">
    <div class="max-w-4xl mx-auto">
      <router-link to="/projects" class="btn-outline-light mb-8 inline-block">&larr; Back to Projects</router-link>

      <div v-if="project" class="mt-6">
        <div class="flex items-center gap-3 mb-4">
          <span class="px-3 py-1 text-xs rounded-full font-semibold uppercase"
                style="background: rgba(139,92,246,0.15); color: rgba(139,92,246,0.9);">
            {{ project.category }}
          </span>
          <span v-if="project.is_featured" class="px-3 py-1 text-xs rounded-full bg-amber-500/15 text-amber-400 font-semibold">Featured</span>
        </div>

        <h1 class="font-[Syncopate] text-[clamp(1.5rem,4vw,2.5rem)] font-bold uppercase bg-clip-text text-transparent mb-4"
            style="background-image: linear-gradient(135deg, var(--gradient-start), var(--gradient-mid), var(--gradient-end));">
          {{ project.title }}
        </h1>

        <div class="project-content text-white/50 text-sm font-[Poppins] leading-relaxed mb-8" v-html="project.description"></div>

        <!-- Tech Stack -->
        <div v-if="project.tech_stack?.length" class="mb-8">
          <h3 class="font-[Syncopate] text-xs font-bold uppercase tracking-wider text-white/40 mb-3">Tech Stack</h3>
          <div class="flex flex-wrap gap-2">
            <span v-for="tech in project.tech_stack" :key="tech"
                  class="px-3 py-1.5 text-xs rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/60">
              {{ tech }}
            </span>
          </div>
        </div>

        <!-- Project Image -->
        <div v-if="project.image_url" class="mb-8 rounded-xl overflow-hidden border border-white/[0.06]">
          <img :src="project.image_url" :alt="project.title" class="w-full max-h-[400px] object-cover" />
        </div>

        <!-- Rich content is now in project.description rendered above -->

        <!-- Links -->
        <div class="flex gap-4 mt-8">
          <button v-if="project.live_url && project.live_url.endsWith('.pdf')" @click="showPdfViewer = true"
             class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer"
             style="background: linear-gradient(135deg, var(--gradient-start), var(--gradient-mid));">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            View Document
          </button>
          <a v-else-if="project.live_url" :href="project.live_url" target="_blank"
             class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
             style="background: linear-gradient(135deg, var(--gradient-start), var(--gradient-mid));">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
            Live Demo
          </a>
          <a v-if="project.github_url" :href="project.github_url" target="_blank"
             class="btn-outline-light inline-flex items-center gap-2">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            GitHub
          </a>
        </div>
      </div>

      <div v-else class="text-center py-20 text-gray-400">
        <p class="text-4xl mb-4">📂</p>
        <p>Project not found.</p>
      </div>
    </div>

    <!-- PDF Viewer Modal -->
    <Teleport to="body">
      <div v-if="showPdfViewer && project?.live_url" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" @click.self="showPdfViewer = false">
        <div class="w-full max-w-5xl h-[90vh] flex flex-col rounded-xl overflow-hidden border border-white/10" style="background-color: var(--dark-shade-1)">
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
            <div>
              <h3 class="text-sm font-bold text-white">{{ project.title }}</h3>
              <p class="text-[10px] text-white/40">PDF Document Viewer</p>
            </div>
            <div class="flex items-center gap-2">
              <a :href="project.live_url" download class="px-3 py-1.5 rounded-lg text-xs bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors">
                Download
              </a>
              <a :href="project.live_url" target="_blank" class="px-3 py-1.5 rounded-lg text-xs bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors">
                Open in Tab
              </a>
              <button @click="showPdfViewer = false" class="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
          <!-- PDF Embed -->
          <div class="flex-1 bg-gray-900">
            <iframe :src="project.live_url" class="w-full h-full border-0" />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useContentStore } from '@/stores/content'

const route = useRoute()
const content = useContentStore()
const showPdfViewer = ref(false)

onMounted(async () => {
  if (!content.loaded) await content.fetchAll()
})

const project = computed(() => {
  const slug = route.params.slug as string
  return content.projects.find(p => p.slug === slug) || null
})

// Description now comes from Supabase and supports HTML
// Edit it in Admin > Projects > Edit > Description field
</script>

<style>
.project-content h2 {
  font-family: 'Syncopate', sans-serif;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(139,92,246,0.9);
  margin-top: 2rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid rgba(139,92,246,0.2);
}
.project-content p {
  color: rgba(255,255,255,0.6);
  font-size: 0.85rem;
  line-height: 1.7;
  margin-bottom: 1rem;
}
.project-content ul {
  list-style: none;
  padding: 0;
}
.project-content ul li {
  position: relative;
  padding-left: 1.2rem;
  margin-bottom: 0.5rem;
  font-size: 0.82rem;
  color: rgba(255,255,255,0.6);
  line-height: 1.6;
}
.project-content ul li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.55rem;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #8b5cf6;
}
.project-content ul li strong {
  color: rgba(34,211,238,0.9);
}
</style>

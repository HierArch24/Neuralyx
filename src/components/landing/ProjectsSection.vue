<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { gsap } from '@/lib/gsap-setup'
import { useContentStore } from '@/stores/content'

const content = useContentStore()
const sectionRef = ref<HTMLElement | null>(null)

onMounted(() => {
  if (!sectionRef.value) return

  gsap.from(sectionRef.value.querySelectorAll('.project-card'), {
    y: 60,
    opacity: 0,
    duration: 0.7,
    stagger: 0.15,
    scrollTrigger: {
      trigger: sectionRef.value,
      start: 'top 70%',
    },
  })
})
</script>

<template>
  <section id="projects" ref="sectionRef" class="relative py-32 px-6">
    <div class="max-w-6xl mx-auto">
      <h2 class="text-3xl md:text-5xl font-display font-bold text-center mb-4">
        <span class="text-gradient-angelic">Featured Projects</span>
      </h2>
      <p class="text-gray-400 text-center max-w-2xl mx-auto mb-16">
        Selected works showcasing AI integration, automation, and full-stack engineering.
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="project in content.featuredProjects"
          :key="project.id"
          class="project-card glass-dark rounded-xl overflow-hidden group hover:border-angelic-gold/40 transition-all"
        >
          <!-- Project image -->
          <div class="aspect-video bg-neural-700 overflow-hidden">
            <img
              v-if="project.image_url"
              :src="project.image_url"
              :alt="project.title"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-4xl text-gray-600">
              📁
            </div>
          </div>

          <div class="p-6">
            <div class="flex flex-wrap gap-2 mb-3">
              <span
                v-for="tech in project.tech_stack.slice(0, 3)"
                :key="tech"
                class="text-xs px-2 py-1 rounded-full bg-cyber-purple/20 text-cyber-purple"
              >
                {{ tech }}
              </span>
            </div>

            <h3 class="text-lg font-semibold text-white group-hover:text-angelic-gold transition-colors mb-2">
              {{ project.title }}
            </h3>
            <p class="text-sm text-gray-400 line-clamp-2">{{ project.description }}</p>

            <div class="flex gap-3 mt-4">
              <a
                v-if="project.github_url"
                :href="project.github_url"
                target="_blank"
                class="text-sm text-gray-400 hover:text-white transition-colors"
              >
                GitHub
              </a>
              <a
                v-if="project.live_url"
                :href="project.live_url"
                target="_blank"
                class="text-sm text-cyber-cyan hover:text-white transition-colors"
              >
                Live Demo
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state when no projects loaded -->
      <div v-if="!content.featuredProjects.length && content.loaded" class="text-center py-16">
        <p class="text-gray-500">Projects will appear here once added via the admin panel.</p>
      </div>

      <div class="text-center mt-10">
        <RouterLink
          to="/projects"
          class="inline-flex items-center gap-2 px-6 py-3 bg-angelic-gold/10 border border-angelic-gold/30 text-angelic-gold hover:bg-angelic-gold/20 rounded-lg transition-all"
        >
          View All Projects
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </RouterLink>
      </div>
    </div>
  </section>
</template>

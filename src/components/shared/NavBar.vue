<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()
const scrolled = ref(false)
const mobileMenuOpen = ref(false)

const sectionLinks = [
  { label: 'About', target: 'about-us' },
  { label: 'Portfolio', target: 'portfolio' },
  { label: 'Skills', target: 'skills' },
  { label: 'Web Projects', target: 'services' },
]

const pageLinks = [
  { label: 'Certificates', href: '/certificates' },
  { label: 'Automation', href: '/automation' },
]

function scrollToSection(target: string) {
  mobileMenuOpen.value = false
  if (route.path === '/') {
    const el = document.getElementById(target)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  } else {
    router.push('/').then(() => {
      setTimeout(() => {
        const el = document.getElementById(target)
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      }, 300)
    })
  }
}

function handleScroll() {
  scrolled.value = window.scrollY > 50
}

onMounted(() => window.addEventListener('scroll', handleScroll, { passive: true }))
onUnmounted(() => window.removeEventListener('scroll', handleScroll))
</script>

<template>
  <nav
    class="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
    :class="scrolled ? 'glass-dark py-3' : 'py-5'"
  >
    <div class="max-w-7xl mx-auto px-6 flex items-center justify-between">
      <!-- Logo -->
      <RouterLink to="/" class="flex items-center gap-3">
        <img src="/assets/images/neuralyx-logo.jpg" alt="NEURALYX" class="h-10 w-10 rounded-lg" />
        <span class="text-xl font-display font-bold text-gradient-cyber">NEURALYX</span>
      </RouterLink>

      <!-- Desktop Nav -->
      <div class="hidden md:flex items-center gap-8">
        <div class="flex items-center gap-6">
          <button
            v-for="link in sectionLinks"
            :key="link.target"
            class="text-sm text-gray-300 hover:text-white transition-colors"
            @click="scrollToSection(link.target)"
          >
            {{ link.label }}
          </button>
        </div>

        <div class="h-4 w-px bg-neural-600" />

        <div class="flex items-center gap-4">
          <RouterLink
            v-for="link in pageLinks"
            :key="link.href"
            :to="link.href"
            class="text-sm text-gray-400 hover:text-cyber-cyan transition-colors"
          >
            {{ link.label }}
          </RouterLink>
        </div>
      </div>

      <!-- Mobile toggle -->
      <button
        class="md:hidden text-white"
        @click="mobileMenuOpen = !mobileMenuOpen"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            v-if="!mobileMenuOpen"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 6h16M4 12h16M4 18h16"
          />
          <path
            v-else
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>

    <!-- Mobile Menu -->
    <div v-if="mobileMenuOpen" class="md:hidden glass-dark mt-2 mx-4 rounded-xl p-4 space-y-3">
      <button
        v-for="link in sectionLinks"
        :key="link.target"
        class="block w-full text-left text-sm text-gray-300 hover:text-white py-2"
        @click="scrollToSection(link.target)"
      >
        {{ link.label }}
      </button>
      <RouterLink
        v-for="link in pageLinks"
        :key="link.href"
        :to="link.href"
        class="block text-sm text-gray-400 hover:text-cyber-cyan py-2"
        @click="mobileMenuOpen = false"
      >
        {{ link.label }}
      </RouterLink>
    </div>
  </nav>
</template>

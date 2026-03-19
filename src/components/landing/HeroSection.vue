<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { gsap } from '@/lib/gsap-setup'
import ParallaxLayer from '@/components/shared/ParallaxLayer.vue'

const heroRef = ref<HTMLElement | null>(null)
const titleRef = ref<HTMLElement | null>(null)
const subtitleRef = ref<HTMLElement | null>(null)
const ctaRef = ref<HTMLElement | null>(null)

onMounted(() => {
  if (!heroRef.value) return

  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })

  tl.from(titleRef.value, { y: 60, opacity: 0, duration: 1, delay: 0.3 })
    .from(subtitleRef.value, { y: 40, opacity: 0, duration: 0.8 }, '-=0.4')
    .from(ctaRef.value, { y: 30, opacity: 0, duration: 0.6 }, '-=0.3')
})
</script>

<template>
  <section
    id="hero"
    ref="heroRef"
    class="relative min-h-screen flex items-center justify-center text-center px-6"
  >
    <!-- Cyber Sabertooth parallax background image -->
    <ParallaxLayer :speed="0.2" class="absolute inset-0 z-0 opacity-20">
      <img
        src="/assets/images/cyber-saber.jpg"
        alt=""
        class="w-full h-full object-cover"
      />
    </ParallaxLayer>

    <div class="relative z-10 max-w-4xl mx-auto">
      <!-- Logo -->
      <img
        src="/assets/images/neuralyx-logo.jpg"
        alt="NEURALYX"
        class="w-24 h-24 mx-auto mb-8 rounded-2xl shadow-2xl shadow-cyber-purple/30"
      />

      <h1
        ref="titleRef"
        class="text-5xl md:text-7xl lg:text-8xl font-display font-bold mb-6"
      >
        <span class="text-gradient-cyber">NEURALYX</span>
      </h1>

      <p
        ref="subtitleRef"
        class="text-xl md:text-2xl text-gray-300 mb-4 font-light"
      >
        AI Systems Engineering
      </p>

      <p class="text-base md:text-lg text-gray-400 mb-10 max-w-2xl mx-auto">
        Building intelligent systems at the intersection of artificial intelligence,
        automation, and full-stack engineering.
      </p>

      <div ref="ctaRef" class="flex flex-wrap items-center justify-center gap-4">
        <a
          href="#projects"
          class="px-8 py-3 bg-cyber-purple hover:bg-cyber-purple/80 text-white rounded-lg font-medium transition-all hover:shadow-lg hover:shadow-cyber-purple/25"
        >
          View Projects
        </a>
        <a
          href="#contact"
          class="px-8 py-3 border border-cyber-cyan/50 text-cyber-cyan hover:bg-cyber-cyan/10 rounded-lg font-medium transition-all"
        >
          Get in Touch
        </a>
        <a
          href="/assets/documents/resume.pdf"
          target="_blank"
          class="px-8 py-3 border border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white rounded-lg font-medium transition-all"
        >
          Resume
        </a>
      </div>
    </div>

    <!-- Scroll indicator -->
    <div class="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce">
      <svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
    </div>
  </section>
</template>

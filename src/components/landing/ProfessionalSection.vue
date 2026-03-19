<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { gsap } from '@/lib/gsap-setup'
import ParallaxLayer from '@/components/shared/ParallaxLayer.vue'

const sectionRef = ref<HTMLElement | null>(null)

onMounted(() => {
  if (!sectionRef.value) return

  gsap.from(sectionRef.value.querySelector('.prof-content'), {
    y: 50,
    opacity: 0,
    duration: 1,
    scrollTrigger: {
      trigger: sectionRef.value,
      start: 'top 60%',
    },
  })
})
</script>

<template>
  <section ref="sectionRef" class="relative py-32 px-6 overflow-hidden">
    <!-- Angelic sabertooth background -->
    <ParallaxLayer :speed="0.15" class="absolute inset-0 z-0 opacity-15">
      <img
        src="/assets/images/angelic-saber.jpeg"
        alt=""
        class="w-full h-full object-cover"
      />
    </ParallaxLayer>

    <div class="prof-content relative z-10 max-w-4xl mx-auto text-center">
      <h2 class="text-3xl md:text-5xl font-display font-bold mb-8">
        <span class="text-gradient-angelic">Professional Summary</span>
      </h2>

      <p class="text-lg md:text-xl text-gray-300 leading-relaxed mb-8">
        A versatile AI Systems Engineer with deep expertise across the full technology stack —
        from neural network architectures and LLM agent orchestration to production-ready
        web applications and automated workflow pipelines. Passionate about building systems
        that amplify human capability through intelligent automation.
      </p>

      <div class="flex flex-wrap justify-center gap-8 text-center">
        <div>
          <p class="text-3xl font-bold text-angelic-gold">9+</p>
          <p class="text-sm text-gray-400">Skill Categories</p>
        </div>
        <div>
          <p class="text-3xl font-bold text-angelic-gold">50+</p>
          <p class="text-sm text-gray-400">Technologies</p>
        </div>
        <div>
          <p class="text-3xl font-bold text-angelic-gold">AI</p>
          <p class="text-sm text-gray-400">First Approach</p>
        </div>
      </div>

      <a
        href="/assets/documents/resume.pdf"
        target="_blank"
        class="inline-flex items-center gap-2 mt-10 px-8 py-3 bg-angelic-gold hover:bg-angelic-light text-neural-900 font-semibold rounded-lg transition-all hover:shadow-lg hover:shadow-angelic-gold/25"
      >
        Download Full Resume
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </a>
    </div>
  </section>
</template>

<template>
  <section ref="sectionRef" class="relative py-28 overflow-hidden" style="background-color: var(--dark-shade-1)">
    <!-- Ambient glow -->
    <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] opacity-[0.06] pointer-events-none"
         style="background: radial-gradient(ellipse, var(--gradient-mid), transparent 70%);"></div>

    <div class="max-w-6xl mx-auto px-6 text-center">
      <!-- Main CTA heading -->
      <h2 ref="headingRef" class="font-[Syncopate] text-[clamp(1.2rem,3vw,2rem)] font-bold uppercase tracking-wider bg-clip-text text-transparent mb-4"
          style="background-image: linear-gradient(135deg, var(--gradient-start), var(--gradient-mid), var(--gradient-end))">
        Let's Build Something Intelligent
      </h2>
      <p ref="subRef" class="text-white/50 text-sm font-[Poppins] mb-8 max-w-lg mx-auto">
        AI Systems Engineer ready to transform your ideas into production-grade intelligent solutions
      </p>

      <div ref="ctaRef" class="flex flex-wrap justify-center gap-4">
        <button @click="resume.open()"
           class="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-medium text-sm transition-all duration-300 hover:scale-105 relative overflow-hidden group cursor-pointer"
           style="background: linear-gradient(135deg, var(--gradient-start), var(--gradient-mid));">
          <span class="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></span>
          <svg class="w-4 h-4 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          <span class="relative z-10">View Resume</span>
        </button>
        <button @click="showVideo = true"
           class="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-medium text-sm transition-all duration-300 hover:scale-105 relative overflow-hidden group cursor-pointer"
           style="background: linear-gradient(135deg, var(--gradient-mid), var(--gradient-end));">
          <span class="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></span>
          <svg class="w-4 h-4 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span class="relative z-10">Watch Overview</span>
        </button>
        <a href="mailto:admin@neuralyx.dev"
           class="btn-outline-light inline-flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
          Get In Touch
        </a>
      </div>
      <VideoModal :visible="showVideo" src="/videos/Introduction_video.mp4" title="Introduction — Gabriel Alvin Aquino" @close="showVideo = false" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { gsap } from '@/lib/gsap-setup'
import { useResumeModal } from '@/composables/useResumeModal'
import VideoModal from '@/components/shared/VideoModal.vue'

const resume = useResumeModal()
const showVideo = ref(false)

const sectionRef = ref<HTMLElement | null>(null)
const headingRef = ref<HTMLElement | null>(null)
const subRef = ref<HTMLElement | null>(null)
const ctaRef = ref<HTMLElement | null>(null)
let ctx: gsap.Context | null = null

onMounted(() => {
  if (!sectionRef.value) return

  ctx = gsap.context(() => {
    const tl = gsap.timeline({
      scrollTrigger: { trigger: headingRef.value, start: 'top 85%', toggleActions: 'play none none none' }
    })

    tl.from(headingRef.value, { y: 30, opacity: 0, duration: 0.7, ease: 'power2.out' })
      .from(subRef.value, { y: 20, opacity: 0, duration: 0.6, ease: 'power2.out' }, '-=0.3')
      .from(ctaRef.value, { y: 20, opacity: 0, duration: 0.6, ease: 'power2.out' }, '-=0.3')
  }, sectionRef.value)
})

onUnmounted(() => { ctx?.revert() })
</script>

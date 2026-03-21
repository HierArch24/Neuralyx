<template>
  <section id="services" ref="sectionRef" class="relative py-20 overflow-hidden border-t" style="background-color: var(--dark-shade-5); border-color: var(--dark-shade-5)">
    <!-- Parallax Background -->
    <div ref="bgRef" class="absolute bg-cover bg-center opacity-30 will-change-transform" style="background-image: url('/assets/images/intel/services-background-v3.jpg'); top: -15%; left: 0; right: 0; height: 130%;"></div>

    <div class="relative z-10 max-w-6xl mx-auto px-6">
      <div class="text-center pb-12">
        <h1 class="font-[Syncopate] text-[clamp(1.5rem,3vw,3rem)] font-bold uppercase bg-clip-text text-transparent"
            style="background-image: linear-gradient(135deg, var(--gradient-start), var(--gradient-mid), var(--gradient-end))">
          Web Development Projects ->
        </h1>
      </div>

      <div ref="cardsRef" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 justify-items-center">
        <IconBox
          v-for="project in webProjects"
          :key="project.title"
          :title="project.title"
          :tech-stack="project.techStack"
          :video-url="project.videoUrl"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { gsap } from '@/lib/gsap-setup'
import IconBox from '@/components/shared/IconBox.vue'

const sectionRef = ref<HTMLElement | null>(null)
const bgRef = ref<HTMLElement | null>(null)
const cardsRef = ref<HTMLElement | null>(null)
let ctx: gsap.Context | null = null

const webProjects = [
  {
    title: '1. Speech Improvement Center HR Development and Employee Clock Attendance Panel',
    techStack: ['Tech Stacks used: PHP, Cpanel, SQL'],
    videoUrl: '/assets/videos/web/HR portal And Employee Attendance portal for SIC.mp4'
  },
  {
    title: '2. Facial Recognition Lie Detection',
    techStack: ['Tech Stacks used: Python, Flask, SQL, Machine Learning, Deep Learning'],
    videoUrl: '/assets/videos/web/Facial Recognition Lie detection.mp4'
  },
  {
    title: '3. Speech Improvement Center Database Management and Landing Page',
    techStack: ['Tech Stacks used: Wordpress, PHP, SQL'],
    videoUrl: '/assets/videos/web/Speech Improvement Center.mp4'
  },
  {
    title: '4. Digital Polygraph Tool for Lie Detection Course',
    techStack: ['Tech Stacks used: C#, Unity, Blender 3D modelling, Html, CSS, JS'],
    videoUrl: '/assets/videos/web/Digital Polygraph tool for lie Detection Course.mp4'
  },
  {
    title: '5. Ishaan Admin Dashboard Appointment and User Management System',
    techStack: ['Tech Stacks: Javascript, React Native, Firebase'],
    videoUrl: '/assets/videos/web/Ishaan LMS Web Admin Dashboard  built in React.mp4'
  },
]

onMounted(() => {
  if (!sectionRef.value) return
  ctx = gsap.context(() => {
    // Parallax background
    gsap.fromTo(bgRef.value,
      { yPercent: -8 },
      {
        yPercent: 8,
        ease: 'none',
        scrollTrigger: { trigger: sectionRef.value, start: 'top bottom', end: 'bottom top', scrub: true }
      }
    )

    const boxes = cardsRef.value?.querySelectorAll('.sk__iconbox')
    if (boxes) {
      gsap.fromTo(boxes,
        { y: 50, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 0.6, stagger: 0.12, ease: 'power2.out',
          scrollTrigger: { trigger: cardsRef.value, start: 'top 90%', toggleActions: 'play none none none' }
        }
      )
    }
  }, sectionRef.value)
})

onUnmounted(() => { ctx?.revert() })
</script>

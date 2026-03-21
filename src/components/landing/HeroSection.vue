<template>
  <section ref="sectionRef" class="relative min-h-screen overflow-hidden flex items-end" style="background-color: var(--dark-shade-1)">
    <!-- Parallax Background GIF - moves slower than content on scroll -->
    <div ref="bgRef" class="absolute inset-0 z-0 will-change-transform" style="top: -15%; height: 130%;">
      <img
        src="/assets/images/intel/Background.gif"
        alt="Background animation"
        class="w-full h-full object-cover"
      />
      <div class="absolute inset-0 bg-[url('/assets/images/intel/overlay-pattern.png')] bg-repeat opacity-[0.37]"></div>
      <div class="absolute inset-0 bg-gradient-to-t from-neural-900 via-neural-900/40 to-transparent"></div>
    </div>

    <!-- Hero Content -->
    <div ref="contentRef" class="relative z-10 w-full px-6 md:px-12 pb-12 md:pb-20 will-change-transform">
      <div ref="headingRef" class="mb-8">
        <h1 class="font-[Bebas_Neue] text-[clamp(3rem,8vw,7rem)] leading-[0.95] tracking-wide text-white text-center md:text-left">
          AI Systems<br />
          Engineer &<br />
          Developer
        </h1>
      </div>

      <div ref="bottomRef" class="flex flex-col sm:flex-row items-center sm:items-end gap-6">
        <button
          @click="resume.open()"
          class="btn-outline-light"
        >
          View Resume
        </button>
        <div>
          <h3 class="text-white text-center sm:text-left font-[Poppins] text-lg">
            8 Years <strong>Experience</strong>
          </h3>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { gsap } from '@/lib/gsap-setup'
import { useResumeModal } from '@/composables/useResumeModal'

const resume = useResumeModal()

const sectionRef = ref<HTMLElement | null>(null)
const bgRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const headingRef = ref<HTMLElement | null>(null)
const bottomRef = ref<HTMLElement | null>(null)

let ctx: gsap.Context | null = null

onMounted(() => {
  if (!sectionRef.value) return
  ctx = gsap.context(() => {
    const tl = gsap.timeline({ delay: 2.2 })

    tl.from(headingRef.value, {
      y: 60,
      opacity: 0,
      duration: 1,
      ease: 'power3.out'
    })
    .from(bottomRef.value, {
      y: 40,
      opacity: 0,
      duration: 0.8,
      ease: 'power2.out'
    }, '-=0.4')

    // PARALLAX: Background moves at 60% of scroll speed (classic parallax)
    gsap.fromTo(bgRef.value,
      { yPercent: 0 },
      {
        yPercent: 30,
        ease: 'none',
        scrollTrigger: {
          trigger: sectionRef.value,
          start: 'top top',
          end: 'bottom top',
          scrub: true
        }
      }
    )

    // PARALLAX: Content moves faster than background (opposite direction feel)
    gsap.to(contentRef.value, {
      y: -120,
      ease: 'none',
      scrollTrigger: {
        trigger: sectionRef.value,
        start: 'top top',
        end: 'bottom top',
        scrub: true
      }
    })

    // PARALLAX: Heading drifts up even faster for layered depth
    gsap.to(headingRef.value, {
      y: -60,
      ease: 'none',
      scrollTrigger: {
        trigger: sectionRef.value,
        start: 'top top',
        end: 'bottom top',
        scrub: true
      }
    })
  }, sectionRef.value)
})

onUnmounted(() => { ctx?.revert() })
</script>

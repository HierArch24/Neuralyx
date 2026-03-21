<template>
  <section ref="sectionRef" class="sk__rings-section relative min-h-screen overflow-hidden"
           style="background-color: var(--dark-shade-1); background-image: url('/assets/images/intel/section-rings-background.svg'); background-size: cover; background-position: center;">
    <ParallaxMouseLayer class="w-full h-screen relative">
      <!-- Ring Large (blurred, deepest parallax) -->
      <div data-depth="1.20" class="absolute inset-0">
        <div class="absolute inset-0 flex items-center justify-center" style="filter: blur(13px);">
          <div class="w-[clamp(500px,55vw,785px)] h-[clamp(500px,55vw,785px)] rounded-full p-[8px]"
               style="background: linear-gradient(135deg, var(--gradient-start), var(--gradient-mid), var(--gradient-end))">
            <div class="w-full h-full rounded-full" style="background-color: var(--dark-shade-1)"></div>
          </div>
        </div>
      </div>

      <!-- Ring Medium -->
      <div data-depth="1.10" class="absolute inset-0">
        <div class="absolute inset-0 flex items-center justify-center" style="filter: blur(7.5px);">
          <div class="w-[clamp(350px,42vw,610px)] h-[clamp(350px,42vw,610px)] rounded-full p-[6px]"
               style="background: linear-gradient(135deg, var(--gradient-start), var(--gradient-mid), var(--gradient-end))">
            <div class="w-full h-full rounded-full" style="background-color: var(--dark-shade-1)"></div>
          </div>
        </div>
      </div>

      <!-- Ring Small (least blur, closest) -->
      <div data-depth="0.90" class="absolute inset-0">
        <div class="absolute inset-0 flex items-center justify-center" style="filter: blur(2px);">
          <div class="w-[clamp(220px,30vw,432px)] h-[clamp(220px,30vw,432px)] rounded-full p-[4px]"
               style="background: linear-gradient(135deg, var(--gradient-start), var(--gradient-mid), var(--gradient-end))">
            <div class="w-full h-full rounded-full" style="background-color: var(--dark-shade-1)"></div>
          </div>
        </div>
      </div>

      <!-- Decorative rectangles at various depths -->
      <div data-depth="1.00" class="absolute inset-0 pointer-events-none">
        <div class="absolute w-[60px] h-[200px] bg-white/5 top-[15%] right-[10%]"></div>
        <div class="absolute w-[45px] h-[160px] bg-white/[0.03] bottom-[25%] right-[18%]"></div>
      </div>
      <div data-depth="0.90" class="absolute inset-0 pointer-events-none">
        <div class="absolute w-[40px] h-[140px] bg-white/[0.03] bottom-[20%] left-[8%]"></div>
      </div>
      <div data-depth="0.75" class="absolute inset-0 pointer-events-none">
        <div class="absolute w-[50px] h-[170px] bg-black/20 top-[30%] left-[15%]"></div>
      </div>

      <!-- Shadow text layer (behind gradient text) -->
      <div data-depth="0.65" class="absolute inset-0">
        <div class="absolute inset-0 flex items-center justify-center px-4">
          <div class="text-center">
            <h1 class="font-[Syncopate] text-[clamp(2rem,5vw,4.5rem)] font-bold uppercase leading-tight tracking-wider text-black/30"
                style="text-shadow: 0 4px 30px rgba(0,0,0,0.5);">
              A massive step forward.
            </h1>
            <h2 class="font-[Poppins] text-[clamp(0.85rem,1.5vw,1.1rem)] font-light text-black/20 max-w-[600px] mx-auto mt-4">
              I build autonomous AI systems that run business operations — connecting people, processes, and technology across automation, DevOps, and AI/ML.
            </h2>
          </div>
        </div>
      </div>

      <!-- Gradient text layer (on top) -->
      <div data-depth="0.65" class="absolute inset-0">
        <div class="absolute inset-0 flex items-center justify-center px-4">
          <div class="text-center">
            <h1 class="font-[Syncopate] text-[clamp(2rem,5vw,4.5rem)] font-bold uppercase leading-tight tracking-wider bg-clip-text text-transparent"
                style="background-image: linear-gradient(135deg, var(--gradient-start), var(--gradient-mid), var(--gradient-end))">
              A massive step forward.
            </h1>
            <h2 class="font-[Poppins] text-[clamp(0.85rem,1.5vw,1.1rem)] font-light text-white/70 max-w-[600px] mx-auto mt-4">
              I build autonomous AI systems that run business operations — connecting people, processes, and technology across automation, DevOps, and AI/ML.
            </h2>
          </div>
        </div>
      </div>
    </ParallaxMouseLayer>

    <!-- Scroll-based parallax: entire rings section content shifts on scroll -->
    <div ref="scrollOverlay" class="absolute inset-0 pointer-events-none"></div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { gsap } from '@/lib/gsap-setup'
import ParallaxMouseLayer from '@/components/shared/ParallaxMouseLayer.vue'

const sectionRef = ref<HTMLElement | null>(null)
let ctx: gsap.Context | null = null

onMounted(() => {
  if (!sectionRef.value) return
  ctx = gsap.context(() => {
    // Scroll-based parallax on the whole mouse layer wrapper (not individual depth elements)
    const parallaxWrapper = sectionRef.value!.querySelector('.parallax-mouse-layer')
    if (parallaxWrapper) {
      gsap.fromTo(parallaxWrapper,
        { y: 40 },
        {
          y: -40,
          ease: 'none',
          scrollTrigger: {
            trigger: sectionRef.value,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true
          }
        }
      )
    }
  }, sectionRef.value)
})

onUnmounted(() => { ctx?.revert() })
</script>

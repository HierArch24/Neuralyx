<template>
  <div ref="sectionRef" class="py-12" style="background-color: var(--dark-shade-1)">
    <div class="max-w-6xl mx-auto px-6">
      <div class="text-center sm:text-left mb-6">
        <h4 class="font-[Poppins] font-semibold text-white/50 uppercase text-sm tracking-[0.15em]">
          Mobile Application Project Documents
        </h4>
        <span class="block w-[50px] h-[3px] mt-3 mx-auto sm:mx-0" style="background-color: var(--dark-shade-4)"></span>
      </div>

      <div class="grid grid-cols-3 sm:grid-cols-5 gap-4 justify-items-center">
        <div
          v-for="logo in logos"
          :key="logo.name"
          class="w-[80px] h-[80px] rounded-full bg-cover bg-center opacity-70 hover:opacity-100 hover:scale-110 transition-all duration-300 cursor-pointer"
          :style="{ backgroundImage: `url('${logo.image}')` }"
          :title="logo.name"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { gsap } from '@/lib/gsap-setup'

const sectionRef = ref<HTMLElement | null>(null)
let ctx: gsap.Context | null = null

const logos = [
  { name: 'Adutucart', image: '/assets/images/logos/mobile/Adutucart Logo.png' },
  { name: 'AutoJed', image: '/assets/images/logos/mobile/AutoJed Logo.png' },
  { name: 'Comfpee', image: '/assets/images/logos/mobile/Comfpee Logo.png' },
  { name: 'Comptutor', image: '/assets/images/logos/mobile/Comptutor Logo.png' },
  { name: 'Do-mi', image: '/assets/images/logos/mobile/Do-mi Logo.gif' },
  { name: 'Ecomart', image: '/assets/images/logos/mobile/Ecomart Logo.png' },
  { name: 'Eima', image: '/assets/images/logos/mobile/Eima Logo.png' },
  { name: 'Ishaan', image: '/assets/images/logos/mobile/Ishaan Logo.png' },
  { name: 'Kainderya', image: '/assets/images/logos/mobile/Kainderya Logo.png' },
  { name: 'Mindwell', image: '/assets/images/logos/mobile/Mindwell Logo.png' },
  { name: 'Pasabay', image: '/assets/images/logos/mobile/Pasabay Logo.png' },
  { name: 'Play & Learn', image: '/assets/images/logos/mobile/Play & Learn Logo.png' },
  { name: 'Rescuenet', image: '/assets/images/logos/mobile/Rescue net Logo.png' },
  { name: 'Spree', image: '/assets/images/logos/mobile/Spree Logo.png' },
  { name: 'Telemedicare', image: '/assets/images/logos/mobile/Telemedicare Logo.png' },
  { name: 'Transire', image: '/assets/images/logos/mobile/Transire Logo.png' },
  { name: 'Trace and Triumph', image: '/assets/images/logos/mobile/Trace and Triumph Logo Original.png' },
  { name: 'BillSense', image: '/assets/images/logos/mobile/BillSense.png' },
]

onMounted(() => {
  if (!sectionRef.value) return
  ctx = gsap.context(() => {
    const items = sectionRef.value!.querySelectorAll('[title]')
    gsap.fromTo(items,
      { scale: 0.8, opacity: 0 },
      {
        scale: 1,
        opacity: 0.7,
        duration: 0.5,
        stagger: 0.05,
        ease: 'back.out(1.2)',
        scrollTrigger: {
          trigger: sectionRef.value,
          start: 'top 92%',
          toggleActions: 'play none none none'
        }
      }
    )
  }, sectionRef.value)
})

onUnmounted(() => { ctx?.revert() })
</script>

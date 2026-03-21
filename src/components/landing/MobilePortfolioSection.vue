<template>
  <section id="portfolio" ref="sectionRef" class="py-20 overflow-hidden" style="background-color: var(--dark-shade-2)">
    <div class="max-w-7xl mx-auto px-4 sm:px-6">
      <div class="text-center pb-10">
        <h1 class="font-[Syncopate] text-[clamp(1.5rem,3vw,2.5rem)] font-bold uppercase text-white">Portfolio</h1>
      </div>

      <!-- Carousel Container -->
      <div class="relative">
        <!-- Navigation Arrows -->
        <button
          @click="prev"
          class="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all duration-300 -ml-2 sm:-ml-4"
          aria-label="Previous"
        >
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <button
          @click="next"
          class="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all duration-300 -mr-2 sm:-mr-4"
          aria-label="Next"
        >
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
        </button>

        <!-- Track -->
        <div class="overflow-hidden mx-8 sm:mx-12">
          <div ref="trackRef" class="flex gap-5 will-change-transform" style="cursor: grab;">
            <div
              v-for="project in projects"
              :key="project.name"
              class="carousel-slide flex-shrink-0"
              :style="{ width: slideWidth + 'px' }"
            >
              <PortfolioItem
                :name="project.name"
                :category="project.category"
                :thumbnail="project.thumbnail"
                :accent-color="project.accentColor"
                @play="openVideo(project)"
              />
            </div>
          </div>
        </div>

        <!-- Dots -->
        <div class="flex justify-center gap-2 mt-8">
          <button
            v-for="(_, i) in Math.ceil(projects.length / slidesPerView)"
            :key="i"
            @click="goToPage(i)"
            class="w-2.5 h-2.5 rounded-full transition-all duration-300"
            :class="currentPage === i ? 'bg-white scale-125' : 'bg-white/30 hover:bg-white/50'"
            :aria-label="'Page ' + (i + 1)"
          />
        </div>
      </div>
    </div>

    <VideoModal
      :src="activeVideo.src"
      :title="activeVideo.title"
      :visible="activeVideo.visible"
      @close="activeVideo.visible = false"
    />
  </section>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { gsap } from '@/lib/gsap-setup'
import PortfolioItem from '@/components/shared/PortfolioItem.vue'
import VideoModal from '@/components/shared/VideoModal.vue'

const sectionRef = ref<HTMLElement | null>(null)
const trackRef = ref<HTMLElement | null>(null)
let ctx: gsap.Context | null = null

const currentPage = ref(0)
const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1200)

const slidesPerView = computed(() => {
  if (windowWidth.value < 640) return 1
  if (windowWidth.value < 1024) return 2
  if (windowWidth.value < 1280) return 3
  return 4
})

const slideWidth = computed(() => {
  const containerWidth = Math.min(windowWidth.value - 128, 1280 - 96)
  const gap = 20
  return (containerWidth - gap * (slidesPerView.value - 1)) / slidesPerView.value
})

const totalPages = computed(() => Math.ceil(projects.length / slidesPerView.value))

const activeVideo = reactive({
  src: '',
  title: '',
  visible: false
})

interface Project {
  name: string
  category: string
  thumbnail: string
  videoUrl: string
  accentColor?: string
}

const projects: Project[] = [
  { name: 'Tarakain', category: 'Eatery Finder App', thumbnail: '/assets/images/portfolio/mobile/1.png', videoUrl: '/assets/videos/mobile/Kainderya.mp4', accentColor: 'rgb(30, 183, 63)' },
  { name: 'Adutucart', category: 'Grocery App', thumbnail: '/assets/images/portfolio/mobile/2.png', videoUrl: '/assets/videos/mobile/Adutucart.mp4' },
  { name: 'Ishaan', category: 'Learning Management App', thumbnail: '/assets/images/portfolio/mobile/3.png', videoUrl: '/assets/videos/mobile/Ishaan.mp4' },
  { name: 'Mindwell', category: 'Health App', thumbnail: '/assets/images/portfolio/mobile/4.png', videoUrl: '/assets/videos/mobile/Mindwell.mp4', accentColor: 'rgb(27, 167, 192)' },
  { name: 'Rescuenet', category: 'Emergency Relief App', thumbnail: '/assets/images/portfolio/mobile/5.png', videoUrl: '/assets/videos/mobile/Rescuenet.mp4', accentColor: 'rgb(0, 0, 0)' },
  { name: 'Telemedicare', category: 'Health App', thumbnail: '/assets/images/portfolio/mobile/6.png', videoUrl: '/assets/videos/mobile/Telemedicare.mp4' },
  { name: 'Comfpee', category: 'Public Comfort App', thumbnail: '/assets/images/portfolio/mobile/7.png', videoUrl: '/assets/videos/mobile/ComfPee.mp4' },
  { name: 'Transire', category: 'Hotel Booking App', thumbnail: '/assets/images/portfolio/mobile/8.png', videoUrl: '/assets/videos/mobile/Transire.mp4' },
  { name: 'Do-mi', category: 'Community Service App', thumbnail: '/assets/images/portfolio/mobile/9.png', videoUrl: '/assets/videos/mobile/Domi.mp4' },
  { name: 'Spree', category: 'Safety Navigator App', thumbnail: '/assets/images/portfolio/mobile/10.png', videoUrl: '/assets/videos/mobile/Spree.mp4', accentColor: 'rgba(128, 28, 0, 0.895)' },
  { name: 'Eima', category: 'Learning Management App', thumbnail: '/assets/images/portfolio/mobile/11.png', videoUrl: '/assets/videos/mobile/EIMa.mp4' },
  { name: 'Play n Learn', category: 'Game & Learning App', thumbnail: '/assets/images/portfolio/mobile/12.png', videoUrl: '/assets/videos/mobile/Play n Learn.mp4', accentColor: 'rgb(255, 0, 111)' },
  { name: 'Pasabay', category: 'Car Booking App', thumbnail: '/assets/images/portfolio/mobile/13.jpg', videoUrl: '/assets/videos/mobile/Pasabay.mp4', accentColor: 'rgb(174, 183, 0)' },
  { name: 'Ecomart', category: 'Grocery App', thumbnail: '/assets/images/portfolio/mobile/14.jpg', videoUrl: '/assets/videos/mobile/Ecomart.mp4', accentColor: 'rgba(2, 213, 87, 0.778)' },
]

function openVideo(project: Project) {
  activeVideo.src = project.videoUrl
  activeVideo.title = `${project.name} - ${project.category}`
  activeVideo.visible = true
}

function animateToPage(page: number) {
  if (!trackRef.value) return
  const gap = 20
  const offset = page * slidesPerView.value * (slideWidth.value + gap)
  gsap.to(trackRef.value, {
    x: -offset,
    duration: 0.6,
    ease: 'power2.inOut'
  })
  currentPage.value = page
}

function next() {
  const nextPage = currentPage.value + 1
  if (nextPage < totalPages.value) {
    animateToPage(nextPage)
  } else {
    animateToPage(0)
  }
}

function prev() {
  const prevPage = currentPage.value - 1
  if (prevPage >= 0) {
    animateToPage(prevPage)
  } else {
    animateToPage(totalPages.value - 1)
  }
}

function goToPage(page: number) {
  animateToPage(page)
}

function onResize() {
  windowWidth.value = window.innerWidth
  animateToPage(Math.min(currentPage.value, totalPages.value - 1))
}

onMounted(() => {
  window.addEventListener('resize', onResize)

  if (!sectionRef.value) return
  ctx = gsap.context(() => {
    // Entrance animation
    gsap.from('.carousel-slide', {
      y: 40,
      opacity: 0,
      duration: 0.5,
      stagger: 0.06,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: sectionRef.value,
        start: 'top 80%'
      }
    })
  }, sectionRef.value)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  ctx?.revert()
})
</script>

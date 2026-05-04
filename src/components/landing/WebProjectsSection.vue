<template>
  <section id="services" ref="sectionRef" class="relative py-20 overflow-hidden border-t" style="background-color: var(--dark-shade-5); border-color: var(--dark-shade-5)">
    <!-- Parallax Background -->
    <div ref="bgRef" class="absolute bg-cover bg-center opacity-30 will-change-transform" style="background-image: url('/assets/images/intel/services-background-v3.jpg'); top: -15%; left: 0; right: 0; height: 130%;"></div>

    <div class="relative z-10 max-w-6xl mx-auto px-6">
      <div class="flex items-end justify-between pb-12">
        <h1 class="font-[Syncopate] text-[clamp(1.5rem,3vw,3rem)] font-bold uppercase bg-clip-text text-transparent"
            style="background-image: linear-gradient(135deg, var(--gradient-start), var(--gradient-mid), var(--gradient-end))">
          Web Development Projects ->
        </h1>
        <RouterLink v-if="allWebProjects.length > 3" to="/projects?category=web"
          class="text-sm text-cyber-cyan/60 hover:text-cyber-cyan transition-colors whitespace-nowrap ml-4">
          View All ({{ allWebProjects.length }}) &rsaquo;
        </RouterLink>
      </div>

      <div ref="cardsRef" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 justify-items-center">
        <IconBox
          v-for="project in displayProjects"
          :key="project.title"
          :title="project.title"
          :tech-stack="['Tech Stack: ' + project.tech_stack.join(', ')]"
          :video-url="project.video_url || ''"
          :image-url="project.image_url || ''"
          :live-url="project.live_url || ''"
          @play="openVideo"
        />
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
import { useContentStore } from '@/stores/content'
import IconBox from '@/components/shared/IconBox.vue'
import VideoModal from '@/components/shared/VideoModal.vue'

const content = useContentStore()
const sectionRef = ref<HTMLElement | null>(null)
const bgRef = ref<HTMLElement | null>(null)
const cardsRef = ref<HTMLElement | null>(null)
let ctx: gsap.Context | null = null

const activeVideo = reactive({
  src: '',
  title: '',
  visible: false
})

function openVideo(src: string, title: string) {
  activeVideo.src = src
  activeVideo.title = title
  activeVideo.visible = true
}

const allWebProjects = computed(() =>
  content.projects.filter(p => p.category === 'web').sort((a, b) => a.sort_order - b.sort_order)
)

const displayProjects = computed(() => allWebProjects.value.slice(0, 3))

onMounted(() => {
  if (!sectionRef.value) return
  ctx = gsap.context(() => {
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

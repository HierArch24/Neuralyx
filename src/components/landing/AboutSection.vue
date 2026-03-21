<template>
  <section id="about-us" ref="sectionRef" class="relative py-24 overflow-hidden" style="background-color: var(--dark-shade-1)">
    <!-- Ambient glow -->
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-[0.04] pointer-events-none"
         style="background: radial-gradient(circle, var(--gradient-start), transparent 70%);"></div>

    <div class="max-w-7xl mx-auto px-6 relative z-10">
      <!-- Header -->
      <div ref="headerRef" class="text-center mb-6">
        <h1 class="font-[Syncopate] text-[clamp(2rem,5vw,4rem)] font-bold uppercase leading-tight tracking-wider bg-clip-text text-transparent mb-3"
            style="background-image: linear-gradient(135deg, var(--gradient-start), var(--gradient-mid), var(--gradient-end))">
          What I Do
        </h1>
        <p class="font-[Poppins] text-white/40 text-xs uppercase tracking-[0.2em] mb-2">I don't just use technology — I engineer intelligence</p>
        <p class="font-[Poppins] text-white/50 text-sm max-w-lg mx-auto">
          Click any circle to explore the full tech stack, highlights, and proficiency
        </p>
      </div>

      <!-- Big Circle Carousel -->
      <div class="relative" v-show="expandedIndex === null">
        <!-- Navigation -->
        <button @click="prevSlide"
          class="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-12 h-12 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/15 backdrop-blur-sm transition-all duration-300 -ml-2 lg:-ml-6">
          <svg class="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <button @click="nextSlide"
          class="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-12 h-12 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/15 backdrop-blur-sm transition-all duration-300 -mr-2 lg:-mr-6">
          <svg class="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
        </button>

        <!-- Track -->
        <div class="overflow-hidden mx-10 lg:mx-16">
          <div ref="trackRef" class="flex will-change-transform py-8">
            <div
              v-for="(item, index) in capabilities"
              :key="item.title"
              class="flex-shrink-0 px-3 sm:px-5 flex justify-center"
              :style="{ width: slideWidth + 'px' }"
            >
              <!-- Big Circle -->
              <div
                :ref="el => { if (el) circleRefs[index] = el as HTMLElement }"
                class="circle-card group relative cursor-pointer select-none"
                :style="{ width: circleSize + 'px', height: circleSize + 'px' }"
                @click="expandCircle(index)"
              >
                <!-- Outer glow on hover -->
                <div class="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl pointer-events-none"
                     :style="{ background: `radial-gradient(circle, ${item.glowColor}30, transparent 70%)` }"></div>

                <!-- Rotating border ring -->
                <div class="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
                  <div class="absolute inset-[-2px] rounded-full animate-[spin_12s_linear_infinite] group-hover:animate-[spin_4s_linear_infinite]"
                       :style="{ background: `conic-gradient(from ${index * 40}deg, ${item.gradientFrom}, ${item.gradientTo}, transparent 40%, ${item.gradientFrom})` }"></div>
                  <div class="absolute inset-[2px] rounded-full" style="background-color: var(--dark-shade-1)"></div>
                </div>

                <!-- Inner content -->
                <div class="absolute inset-[3px] rounded-full flex flex-col items-center justify-center text-center p-5 transition-transform duration-300 group-hover:scale-[0.96]"
                     :style="{ background: `radial-gradient(circle at 30% 30%, ${item.gradientFrom}15, ${item.gradientTo}08, transparent)` }">
                  <div class="text-4xl sm:text-5xl mb-2 transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-1">{{ item.icon }}</div>
                  <h3 class="font-[Syncopate] text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-white mb-1.5">{{ item.title }}</h3>
                  <div class="flex flex-wrap justify-center gap-1">
                    <span v-for="tag in item.tags.slice(0, 3)" :key="tag"
                          class="text-[7px] sm:text-[9px] font-[Poppins] px-1.5 py-0.5 rounded-full border"
                          :style="{ color: item.gradientFrom, borderColor: item.gradientFrom + '30', background: item.gradientFrom + '10' }">
                      {{ tag }}
                    </span>
                  </div>
                  <div class="mt-2 text-[8px] text-white/25 opacity-0 group-hover:opacity-100 transition-opacity font-[Poppins]">tap to explore</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Dots -->
        <div class="flex justify-center gap-2 mt-4">
          <button v-for="(_, i) in totalPages" :key="i" @click="goToPage(i)"
            class="h-1.5 rounded-full transition-all duration-300"
            :class="currentPage === i ? 'w-8 bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-mid)]' : 'w-1.5 bg-white/20 hover:bg-white/40'" />
        </div>
      </div>

      <!-- Expanded Rectangle Card -->
      <div v-if="expandedIndex !== null" ref="expandedRef" class="expanded-card relative will-change-transform">
        <div class="rounded-2xl border overflow-hidden"
             :style="{
               borderColor: capabilities[expandedIndex].gradientFrom + '25',
               background: `linear-gradient(135deg, ${capabilities[expandedIndex].gradientFrom}08, ${capabilities[expandedIndex].gradientTo}05, rgba(10,10,18,0.95))`
             }">
          <!-- Top bar -->
          <div class="flex items-center justify-between px-6 py-4 border-b"
               :style="{ borderColor: capabilities[expandedIndex].gradientFrom + '15' }">
            <div class="flex items-center gap-3">
              <span class="text-3xl">{{ capabilities[expandedIndex].icon }}</span>
              <div>
                <h3 class="font-[Syncopate] text-sm font-bold uppercase tracking-wider text-white">{{ capabilities[expandedIndex].title }}</h3>
                <p class="text-[11px] font-[Poppins] text-white/40">{{ capabilities[expandedIndex].stat }}</p>
              </div>
            </div>
            <button @click="collapseCard"
              class="w-10 h-10 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center transition-colors">
              <svg class="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <!-- Content -->
          <div class="p-6 sm:p-8">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
              <!-- Left -->
              <div>
                <p class="text-white/60 text-sm leading-relaxed font-[Poppins] mb-6">
                  {{ capabilities[expandedIndex].description }}
                </p>
                <div class="space-y-3">
                  <div v-for="highlight in capabilities[expandedIndex].highlights" :key="highlight"
                       class="highlight-item flex items-start gap-3">
                    <div class="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                         :style="{ background: capabilities[expandedIndex].gradientFrom }"></div>
                    <span class="text-white/70 text-sm font-[Poppins]">{{ highlight }}</span>
                  </div>
                </div>
              </div>

              <!-- Right -->
              <div>
                <h4 class="font-[Poppins] text-xs font-semibold uppercase tracking-[0.15em] text-white/40 mb-4">Tech Stack</h4>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div v-for="tech in capabilities[expandedIndex].techStack" :key="tech"
                       class="tech-chip px-3 py-2 rounded-lg text-center text-xs font-[Poppins] font-medium transition-all duration-300 hover:scale-105"
                       :style="{
                         color: capabilities[expandedIndex].gradientFrom,
                         background: capabilities[expandedIndex].gradientFrom + '10',
                         border: `1px solid ${capabilities[expandedIndex].gradientFrom}20`
                       }">
                    {{ tech }}
                  </div>
                </div>

                <!-- Proficiency bar -->
                <div class="mt-6 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-[Poppins] text-white/40 uppercase tracking-wider">Proficiency</span>
                    <span class="font-[Bebas_Neue] text-lg tracking-wider" :style="{ color: capabilities[expandedIndex].gradientFrom }">
                      {{ capabilities[expandedIndex].proficiency }}%
                    </span>
                  </div>
                  <div class="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div class="prof-bar h-full rounded-full"
                         :style="{
                           width: profBarWidth,
                           background: `linear-gradient(90deg, ${capabilities[expandedIndex].gradientFrom}, ${capabilities[expandedIndex].gradientTo})`
                         }"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Links -->
      <div ref="linksRef" class="flex justify-center gap-4 mt-14">
        <router-link to="/certificates" class="btn-outline-light group">
          <span class="flex items-center gap-2">
            <svg class="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
            Certificates
          </span>
        </router-link>
        <router-link to="/automation" class="btn-outline-light group">
          <span class="flex items-center gap-2">
            <svg class="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            Automation Projects
          </span>
        </router-link>
      </div>

      <div class="mt-12">
        <span class="block w-full h-px bg-white/10"></span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { gsap } from '@/lib/gsap-setup'

const sectionRef = ref<HTMLElement | null>(null)
const headerRef = ref<HTMLElement | null>(null)
const linksRef = ref<HTMLElement | null>(null)
const trackRef = ref<HTMLElement | null>(null)
const expandedRef = ref<HTMLElement | null>(null)
const circleRefs = ref<Record<number, HTMLElement>>({})
const currentPage = ref(0)
const expandedIndex = ref<number | null>(null)
const profBarWidth = ref('0%')
const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1200)
let autoplayTimer: ReturnType<typeof setInterval> | null = null
let ctx: gsap.Context | null = null

interface Capability {
  icon: string
  title: string
  tags: string[]
  stat: string
  description: string
  highlights: string[]
  techStack: string[]
  proficiency: number
  gradientFrom: string
  gradientTo: string
  glowColor: string
}

const capabilities: Capability[] = [
  {
    icon: '🤖',
    title: 'Agent Systems',
    tags: ['CrewAI', 'LangChain', 'MCP'],
    stat: '20+ Agents Deployed',
    description: 'I architect and deploy autonomous multi-agent AI systems that handle complex, multi-step workflows — from research and content generation to code review, customer support, and decision-making pipelines. Each agent is purpose-built with specialized tools, memory, and chain-of-thought reasoning.',
    highlights: [
      'Multi-agent orchestration with CrewAI, LangChain, and Claude Agent SDK',
      'Custom MCP servers for tool-augmented AI assistants',
      'Autonomous task delegation with chain-of-thought reasoning',
      'Production deployment with real-time monitoring and fallback chains',
    ],
    techStack: ['LangChain', 'CrewAI', 'Claude Agent SDK', 'LlamaIndex', 'OpenAI API', 'Claude API', 'MCP SDK', 'Python', 'FastAPI', 'Redis'],
    proficiency: 95,
    gradientFrom: '#8b5cf6', gradientTo: '#a78bfa', glowColor: '#8b5cf6',
  },
  {
    icon: '⚡',
    title: 'AI Automation',
    tags: ['n8n', 'Zapier', 'Make'],
    stat: '50+ Workflows Live',
    description: 'I design intelligent automation systems that eliminate manual work and accelerate business operations. From no-code platforms with AI decision nodes to custom Python pipelines, I build automation that runs reliably at enterprise scale.',
    highlights: [
      'Complex n8n workflows with AI-powered decision nodes',
      'Business process automation with Zapier, Make, and Smythos',
      'Platform integrations: Abacus.AI, Ringcentral, Synthesia, GHL, 11labs',
      'Webhook orchestration, Slack bots, and Airtable automations',
    ],
    techStack: ['n8n', 'Zapier', 'Make', 'Smythos', 'Abacus.AI', 'Ringcentral', 'Synthesia', 'GHL', 'Slack', 'Delphi.AI', 'Airtable', '11labs'],
    proficiency: 92,
    gradientFrom: '#6366f1', gradientTo: '#818cf8', glowColor: '#6366f1',
  },
  {
    icon: '💎',
    title: 'Gemini & Embeddings',
    tags: ['Gemini 2.5', 'Vectors', 'RAG'],
    stat: '10+ RAG Pipelines',
    description: 'I architect retrieval-augmented generation pipelines and embedding systems using cutting-edge models like Gemini Embedding 2.5. From vector database design to hybrid search, I build systems that give LLMs access to custom knowledge bases with grounded, accurate responses.',
    highlights: [
      'Gemini Embedding 2.5 for high-quality semantic representations',
      'Vector DB design with Pinecone, Weaviate, Faiss, and ChromaDB',
      'Advanced chunking and embedding strategies for optimal retrieval',
      'Hybrid search combining semantic and keyword matching',
    ],
    techStack: ['Gemini API', 'Pinecone', 'Weaviate', 'Faiss', 'ChromaDB', 'LlamaIndex', 'LangChain', 'OpenAI Embeddings', 'FastAPI', 'PostgreSQL'],
    proficiency: 90,
    gradientFrom: '#22d3ee', gradientTo: '#67e8f9', glowColor: '#22d3ee',
  },
  {
    icon: '👁️',
    title: 'Computer Vision',
    tags: ['YOLOv11', 'OpenCV', 'TF'],
    stat: '15+ Models Deployed',
    description: 'From real-time object detection to image classification and OCR, I build and deploy computer vision models for production applications. My focus is getting models from notebooks to production — optimized, monitored, and edge-ready.',
    highlights: [
      'Real-time object detection with YOLOv11 and Roboflow',
      'Custom model training with TensorFlow, PyTorch, and Keras',
      'NLP solutions with Transformers, HuggingFace, and OpenVINO',
      'Model optimization for edge deployment and mobile inference',
    ],
    techStack: ['YOLOv11', 'TensorFlow', 'PyTorch', 'Keras', 'OpenCV', 'Scikit-learn', 'NumPy', 'Pandas', 'Matplotlib', 'Roboflow', 'HuggingFace', 'OpenVINO'],
    proficiency: 85,
    gradientFrom: '#ec4899', gradientTo: '#f472b6', glowColor: '#ec4899',
  },
  {
    icon: '🌐',
    title: 'Full-Stack',
    tags: ['Vue', 'React', 'FastAPI'],
    stat: '30+ Projects Shipped',
    description: 'Full-stack web development from pixel-perfect frontends to scalable backend APIs. I build responsive, real-time web applications with modern frameworks, cinematic animations, and production-grade architecture.',
    highlights: [
      'Vue 3 + TypeScript with Composition API, Pinia, and GSAP',
      'React ecosystems with Next.js and server components',
      'Backend APIs with FastAPI, Django, Flask, Node.js, and Laravel',
      'Real-time features with WebSockets, Supabase, and Firebase',
    ],
    techStack: ['Vue.js 3', 'React', 'TypeScript', 'JavaScript', 'FastAPI', 'Django', 'Flask', 'Node.js', 'Laravel', 'Tailwind CSS', 'GSAP', 'Supabase', 'Pinia', 'Axios', 'Vite'],
    proficiency: 92,
    gradientFrom: '#10b981', gradientTo: '#34d399', glowColor: '#10b981',
  },
  {
    icon: '📱',
    title: 'Mobile Dev',
    tags: ['Kotlin', 'Flutter', 'Android'],
    stat: '18+ Apps Shipped',
    description: 'Native Android and cross-platform mobile development with a focus on performance, AI integration, and polished UX. From Jetpack Compose to Flutter, I deliver production apps with on-device ML capabilities.',
    highlights: [
      'Native Android with Kotlin, Jetpack Compose, and Dagger Hilt',
      'Cross-platform apps with Flutter, Dart, and Ionic/Capacitor',
      'Firebase integration for auth, Firestore, and cloud messaging',
      'On-device ML model integration for real-time AI features',
    ],
    techStack: ['Kotlin', 'Java', 'Flutter', 'Dart', 'Jetpack Compose', 'Retrofit', 'RxJava', 'Room DB', 'Dagger Hilt', 'Firebase', 'Ionic', 'Capacitor', 'Android Studio'],
    proficiency: 84,
    gradientFrom: '#f59e0b', gradientTo: '#fbbf24', glowColor: '#f59e0b',
  },
  {
    icon: '☁️',
    title: 'Cloud & DevOps',
    tags: ['Docker', 'AWS', 'GCP'],
    stat: 'Production Scale',
    description: 'Infrastructure as code, containerization, and multi-cloud deployment. I ensure applications run reliably in production with proper CI/CD pipelines, monitoring, scaling, and security configurations.',
    highlights: [
      'Docker containerization with multi-stage builds and Compose',
      'Cloud deployment on AWS, GCP, DigitalOcean, and Vercel',
      'CI/CD pipelines with GitHub Actions and automated testing',
      'CDN, edge computing, Nginx reverse proxy, and Cloudflare',
    ],
    techStack: ['Docker', 'Docker Compose', 'AWS', 'GCP', 'DigitalOcean', 'Vercel', 'Cloudflare', 'Nginx', 'GitHub Actions', 'Playwright', 'Git', 'Linux'],
    proficiency: 86,
    gradientFrom: '#06b6d4', gradientTo: '#22d3ee', glowColor: '#06b6d4',
  },
  {
    icon: '🎮',
    title: 'Game Dev',
    tags: ['Unity', 'Blender', 'C#'],
    stat: 'Creative Outlet',
    description: 'Game development as a creative and technical outlet — exploring 2D/3D game engines, procedural generation, 3D modelling, and integrating AI-driven behavior into interactive experiences.',
    highlights: [
      'Unity game development with C# scripting',
      'Blender 3D modelling and asset creation',
      'OpenGL and DirectX graphics programming',
      'AI-driven NPC behavior and procedural generation',
    ],
    techStack: ['Unity', 'C#', 'Blender', 'OpenGL', 'DirectX', 'Shader Graph'],
    proficiency: 62,
    gradientFrom: '#ef4444', gradientTo: '#f87171', glowColor: '#ef4444',
  },
]

const slidesPerView = computed(() => {
  if (windowWidth.value < 480) return 1
  if (windowWidth.value < 640) return 2
  if (windowWidth.value < 1024) return 3
  return 4
})

const circleSize = computed(() => {
  if (windowWidth.value < 480) return 220
  if (windowWidth.value < 640) return 180
  if (windowWidth.value < 1024) return 200
  return 220
})

const slideWidth = computed(() => {
  const containerWidth = Math.min(windowWidth.value - 80, 1280 - 128)
  return containerWidth / slidesPerView.value
})

const totalPages = computed(() => Math.ceil(capabilities.length / slidesPerView.value))

function animateToPage(page: number) {
  if (!trackRef.value) return
  const offset = page * slidesPerView.value * slideWidth.value
  gsap.to(trackRef.value, { x: -offset, duration: 0.7, ease: 'power3.inOut' })
  currentPage.value = page
}

function nextSlide() { animateToPage((currentPage.value + 1) % totalPages.value) }
function prevSlide() { animateToPage(currentPage.value <= 0 ? totalPages.value - 1 : currentPage.value - 1) }
function goToPage(i: number) { animateToPage(i) }

function startAutoplay() {
  stopAutoplay()
  autoplayTimer = setInterval(nextSlide, 4000)
}

function stopAutoplay() {
  if (autoplayTimer) { clearInterval(autoplayTimer); autoplayTimer = null }
}

async function expandCircle(index: number) {
  stopAutoplay()
  expandedIndex.value = index
  profBarWidth.value = '0%'

  await nextTick()

  if (!expandedRef.value) return

  // Smooth morph: circle → rectangle with staggered content
  const card = expandedRef.value

  // Phase 1: Card morphs from circle shape to rectangle
  gsap.fromTo(card,
    {
      opacity: 0,
      scale: 0.3,
      y: 0,
      clipPath: 'inset(15% 25% 15% 25% round 50%)',
    },
    {
      opacity: 1,
      scale: 1,
      y: 0,
      clipPath: 'inset(0% 0% 0% 0% round 16px)',
      duration: 0.7,
      ease: 'power4.out',
    }
  )

  // Phase 2: Inner content fades in staggered
  await nextTick()
  const contentEls = card.querySelectorAll('.highlight-item, .tech-chip, .prof-bar')
  gsap.fromTo(contentEls,
    { opacity: 0, y: 12 },
    { opacity: 1, y: 0, duration: 0.4, stagger: 0.03, delay: 0.35, ease: 'power2.out' }
  )

  // Phase 3: Proficiency bar animates
  setTimeout(() => {
    profBarWidth.value = capabilities[index].proficiency + '%'
  }, 500)
}

function collapseCard() {
  if (!expandedRef.value) {
    expandedIndex.value = null
    startAutoplay()
    return
  }

  // Smooth morph: rectangle → circle then disappear
  gsap.to(expandedRef.value, {
    opacity: 0,
    scale: 0.4,
    clipPath: 'inset(15% 25% 15% 25% round 50%)',
    duration: 0.5,
    ease: 'power3.in',
    onComplete: () => {
      expandedIndex.value = null
      startAutoplay()
    }
  })
}

function onResize() {
  windowWidth.value = window.innerWidth
  if (expandedIndex.value === null) {
    animateToPage(Math.min(currentPage.value, totalPages.value - 1))
  }
}

onMounted(() => {
  window.addEventListener('resize', onResize)
  startAutoplay()

  if (!sectionRef.value) return
  ctx = gsap.context(() => {
    gsap.fromTo(headerRef.value,
      { y: 50, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.8, ease: 'power2.out',
        scrollTrigger: { trigger: sectionRef.value, start: 'top 85%', toggleActions: 'play none none none' } }
    )

    gsap.fromTo('.circle-card',
      { scale: 0.7, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.6, stagger: 0.08, ease: 'back.out(1.4)',
        scrollTrigger: { trigger: trackRef.value, start: 'top 90%', toggleActions: 'play none none none' } }
    )

    gsap.fromTo(linksRef.value,
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.6, delay: 0.3, ease: 'power2.out',
        scrollTrigger: { trigger: linksRef.value, start: 'top 95%', toggleActions: 'play none none none' } }
    )

    gsap.to(headerRef.value, {
      y: -30, ease: 'none',
      scrollTrigger: { trigger: sectionRef.value, start: 'top bottom', end: 'bottom top', scrub: true }
    })
  }, sectionRef.value)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  stopAutoplay()
  ctx?.revert()
})
</script>

<style scoped>
.prof-bar {
  transition: width 1s cubic-bezier(0.16, 1, 0.3, 1);
}
</style>

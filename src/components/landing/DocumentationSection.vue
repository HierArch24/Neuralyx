<template>
  <section ref="sectionRef" class="relative py-20 overflow-hidden" style="background-color: var(--dark-shade-2)">
    <!-- Background glow -->
    <div class="absolute top-0 right-0 w-[500px] h-[500px] rounded-full opacity-[0.03] pointer-events-none"
         style="background: radial-gradient(circle, var(--gradient-mid), transparent 70%);"></div>

    <div class="relative z-10 max-w-7xl mx-auto px-6">
      <!-- Header -->
      <div ref="headerRef" class="flex items-end justify-between mb-10">
        <div>
          <h2 class="font-[Syncopate] text-[clamp(1.5rem,3vw,2.5rem)] font-bold uppercase tracking-wider bg-clip-text text-transparent"
              style="background-image: linear-gradient(135deg, var(--gradient-start), var(--gradient-mid), var(--gradient-end))">
            Tech News
          </h2>
          <p class="font-[Poppins] text-white/40 text-sm mt-1">Latest insights on AI, automation, and engineering</p>
        </div>
        <router-link to="/news" class="hidden sm:inline-flex items-center gap-1.5 text-sm font-[Poppins] text-white/40 hover:text-white/70 transition-colors">
          View All
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
        </router-link>
      </div>

      <!-- Search Bar -->
      <div class="relative mb-8 max-w-md">
        <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search news... try 'mcp', 'tool', 'ai-agent'"
          class="w-full pl-11 pr-10 py-2.5 rounded-xl border border-white/[0.08] text-sm font-[Poppins] text-white placeholder-white/25 focus:border-white/20 focus:outline-none transition-colors"
          style="background: rgba(255,255,255,0.03);"
        />
        <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <!-- News Cards Grid -->
      <div ref="cardsRef" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="article in displayNews"
          :key="article.id"
          class="news-card group rounded-xl border border-white/[0.06] overflow-hidden transition-all duration-300 hover:border-white/15 hover:-translate-y-1 cursor-pointer"
          style="background: linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));"
          @click="openArticle(article)"
        >
          <!-- Card image or gradient placeholder -->
          <div class="relative h-40 overflow-hidden">
            <img v-if="article.image_url" :src="article.image_url" :alt="article.title" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <div v-else class="w-full h-full flex items-center justify-center"
                 :style="{ background: `linear-gradient(135deg, ${getCategoryColor(article.category)}15, ${getCategoryColor(article.category)}05)` }">
              <span class="text-4xl opacity-30">{{ getCategoryIcon(article.category) }}</span>
            </div>
            <!-- Category badge -->
            <div class="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-[Poppins] font-semibold uppercase tracking-wider backdrop-blur-sm"
                 :style="{ color: getCategoryColor(article.category), background: getCategoryColor(article.category) + '20', border: `1px solid ${getCategoryColor(article.category)}30` }">
              {{ article.category }}
            </div>
            <!-- Video indicator -->
            <div v-if="article.video_url" class="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
              <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
            <!-- Link indicator -->
            <div v-if="article.link_url" class="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
              <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
            </div>
          </div>

          <!-- Card content -->
          <div class="p-5">
            <h3 class="font-[Poppins] text-white font-semibold text-sm mb-2 line-clamp-2 group-hover:text-white/90 transition-colors">
              {{ article.title }}
            </h3>
            <p class="text-white/40 text-xs leading-relaxed line-clamp-3 mb-4 font-[Poppins]">
              {{ article.summary }}
            </p>
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-[Poppins] text-white/25">{{ formatDate(article.created_at) }}</span>
              <span class="text-xs font-[Poppins] font-medium transition-colors"
                    :style="{ color: getCategoryColor(article.category) }">
                View More &rarr;
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="displayNews.length === 0" class="text-center py-16">
        <p class="text-white/30 font-[Poppins] text-sm">No articles found{{ searchQuery ? ' for "' + searchQuery + '"' : '' }}.</p>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex items-center justify-center gap-4 mt-10">
        <button @click="currentPage = Math.max(1, currentPage - 1)" :disabled="currentPage === 1"
          class="px-4 py-2 rounded-lg text-sm font-[Poppins] border border-white/[0.08] text-white/40 hover:text-white/70 hover:border-white/20 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
          style="background: rgba(255,255,255,0.03);">
          &larr; Prev
        </button>
        <div class="flex items-center gap-1.5">
          <button v-for="page in totalPages" :key="page" @click="currentPage = page"
            class="w-8 h-8 rounded-lg text-xs font-[Poppins] font-medium transition-all"
            :class="page === currentPage
              ? 'text-white border border-white/20'
              : 'text-white/30 border border-transparent hover:text-white/60'"
            :style="page === currentPage ? 'background: rgba(255,255,255,0.08);' : ''">
            {{ page }}
          </button>
        </div>
        <button @click="currentPage = Math.min(totalPages, currentPage + 1)" :disabled="currentPage === totalPages"
          class="px-4 py-2 rounded-lg text-sm font-[Poppins] border border-white/[0.08] text-white/40 hover:text-white/70 hover:border-white/20 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
          style="background: rgba(255,255,255,0.03);">
          Next &rarr;
        </button>
      </div>

      <!-- Result count -->
      <p v-if="searchQuery && filteredNews.length > 0" class="text-center text-white/20 text-xs font-[Poppins] mt-4">
        {{ filteredNews.length }} article{{ filteredNews.length !== 1 ? 's' : '' }} found
      </p>
    </div>

    <!-- Floating Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="activeArticle" class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8" @click.self="closeArticle">
          <!-- Backdrop -->
          <div class="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>

          <!-- Modal -->
          <div ref="modalRef" class="relative w-full max-w-4xl max-h-[90vh] rounded-2xl border border-white/10 overflow-hidden flex flex-col will-change-transform"
               style="background: linear-gradient(135deg, rgba(18,18,31,0.98), rgba(10,10,18,0.99));">
            <!-- Modal header -->
            <div class="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] flex-shrink-0">
              <div class="flex items-center gap-3 min-w-0">
                <div class="px-2.5 py-1 rounded-full text-[10px] font-[Poppins] font-semibold uppercase tracking-wider flex-shrink-0"
                     :style="{ color: getCategoryColor(activeArticle.category), background: getCategoryColor(activeArticle.category) + '20' }">
                  {{ activeArticle.category }}
                </div>
                <span class="text-white/25 text-xs font-[Poppins]">{{ formatDate(activeArticle.created_at) }}</span>
              </div>
              <button @click="closeArticle" class="w-10 h-10 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center transition-colors flex-shrink-0">
                <svg class="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <!-- Modal content (scrollable) -->
            <div class="overflow-y-auto flex-1 p-6 sm:p-8" data-lenis-prevent>
              <h1 class="font-[Syncopate] text-xl sm:text-2xl font-bold uppercase tracking-wider text-white mb-4">
                {{ activeArticle.title }}
              </h1>

              <!-- Video embed -->
              <div v-if="activeArticle.video_url" class="mb-6 rounded-xl overflow-hidden aspect-video bg-black">
                <iframe :src="activeArticle.video_url" class="w-full h-full" frameborder="0" allowfullscreen></iframe>
              </div>

              <!-- Image -->
              <div v-if="activeArticle.image_url" class="mb-6 rounded-xl overflow-hidden">
                <img :src="activeArticle.image_url" :alt="activeArticle.title" class="w-full object-cover max-h-[400px]" />
              </div>

              <!-- Content -->
              <div class="news-content font-[Poppins] text-white/70 text-sm leading-relaxed" v-html="activeArticle.content"></div>

              <!-- External link -->
              <div v-if="activeArticle.link_url" class="mt-6 pt-4 border-t border-white/[0.06]">
                <a :href="activeArticle.link_url" target="_blank" rel="noopener"
                   class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 hover:scale-105"
                   style="background: linear-gradient(135deg, var(--gradient-start), var(--gradient-mid)); color: white;">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                  Open Link
                </a>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { gsap } from '@/lib/gsap-setup'
import { useContentStore } from '@/stores/content'
import type { NewsArticle } from '@/types/database'

const content = useContentStore()
const sectionRef = ref<HTMLElement | null>(null)
const headerRef = ref<HTMLElement | null>(null)
const cardsRef = ref<HTMLElement | null>(null)
const modalRef = ref<HTMLElement | null>(null)
const activeArticle = ref<NewsArticle | null>(null)
let ctx: gsap.Context | null = null

// Search + pagination
const searchQuery = ref('')
const currentPage = ref(1)
const perPage = 9

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  ai: ['ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning', 'neural'],
  tool: ['tool', 'cli', 'sdk', 'library', 'framework', 'utility'],
  mcp: ['mcp', 'model context protocol'],
  'ai-agent': ['ai-agent', 'agent', 'autonomous', 'agentic'],
  skills: ['skills', 'learning', 'tutorial', 'course'],
  platform: ['platform', 'saas', 'service', 'cloud'],
  'ai-model': ['ai-model', 'model', 'llm', 'gpt', 'claude', 'gemini', 'benchmark'],
  '3d-gen': ['3d-gen', '3d', 'generation', 'render'],
  automation: ['automation', 'automate', 'workflow', 'pipeline', 'ci/cd'],
  web: ['web', 'website', 'frontend', 'backend', 'seo', 'html', 'css', 'javascript'],
  mobile: ['mobile', 'ios', 'android', 'app'],
  devops: ['devops', 'docker', 'kubernetes', 'deploy', 'infrastructure'],
  general: ['general', 'news', 'update'],
}

function detectCategory(query: string): string | null {
  const q = query.toLowerCase().trim()
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => q === kw || q.startsWith(kw + ' ') || q.endsWith(' ' + kw))) return cat
  }
  return null
}

const filteredNews = computed(() => {
  const allNews = content.publishedNews
  if (!searchQuery.value.trim()) return allNews

  const q = searchQuery.value.toLowerCase().trim()
  const matchedCat = detectCategory(q)

  if (matchedCat) {
    // Category match: show that category first, then text matches from other categories
    const catMatches = allNews.filter(a => a.category === matchedCat)
    const textMatches = allNews.filter(a =>
      a.category !== matchedCat && (
        a.title.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q)
      )
    )
    return [...catMatches, ...textMatches]
  }

  return allNews.filter(a =>
    a.title.toLowerCase().includes(q) ||
    a.summary.toLowerCase().includes(q) ||
    a.category.toLowerCase().includes(q)
  )
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredNews.value.length / perPage)))
const displayNews = computed(() => {
  const start = (currentPage.value - 1) * perPage
  return filteredNews.value.slice(start, start + perPage)
})

// Reset page when search changes
watch(searchQuery, () => { currentPage.value = 1 })

function getCategoryColor(cat: string): string {
  const colors: Record<string, string> = {
    ai: '#8b5cf6',
    automation: '#6366f1',
    web: '#10b981',
    mobile: '#f59e0b',
    devops: '#06b6d4',
    general: '#22d3ee',
    tool: '#f97316',
    mcp: '#a855f7',
    'ai-agent': '#ec4899',
    skills: '#14b8a6',
    platform: '#3b82f6',
    'ai-model': '#c084fc',
    '3d-gen': '#fbbf24',
  }
  return colors[cat] || colors.general
}

function getCategoryIcon(cat: string): string {
  const icons: Record<string, string> = {
    ai: '🧠', automation: '⚙️', web: '🌐', mobile: '📱', devops: '🐳', general: '📰',
    tool: '🔧', mcp: '🔌', 'ai-agent': '🤖', skills: '📚', platform: '🚀', 'ai-model': '🧬', '3d-gen': '🧊',
  }
  return icons[cat] || icons.general
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

async function openArticle(article: NewsArticle) {
  activeArticle.value = article
  document.body.style.overflow = 'hidden'
  await nextTick()
  if (modalRef.value) {
    gsap.fromTo(modalRef.value,
      { opacity: 0, y: 40, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'power3.out' }
    )
  }
}

function closeArticle() {
  if (modalRef.value) {
    gsap.to(modalRef.value, {
      opacity: 0, y: 30, scale: 0.96, duration: 0.3, ease: 'power2.in',
      onComplete: () => {
        activeArticle.value = null
        document.body.style.overflow = ''
      }
    })
  } else {
    activeArticle.value = null
    document.body.style.overflow = ''
  }
}

onMounted(() => {
  if (!sectionRef.value) return
  ctx = gsap.context(() => {
    gsap.fromTo(headerRef.value,
      { y: 40, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.7, ease: 'power2.out',
        scrollTrigger: { trigger: sectionRef.value, start: 'top 85%', toggleActions: 'play none none none' } }
    )
    gsap.fromTo('.news-card',
      { y: 50, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.6, stagger: 0.12, ease: 'power2.out',
        scrollTrigger: { trigger: cardsRef.value, start: 'top 90%', toggleActions: 'play none none none' } }
    )
  }, sectionRef.value)
})

onUnmounted(() => {
  ctx?.revert()
  document.body.style.overflow = ''
})
</script>

<style scoped>
.modal-enter-active, .modal-leave-active {
  transition: opacity 0.3s ease;
}
.modal-enter-from, .modal-leave-to {
  opacity: 0;
}

.news-content :deep(h2) {
  font-family: 'Syncopate', sans-serif;
  font-size: 0.9rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: white;
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
}

.news-content :deep(p) {
  margin-bottom: 1rem;
}

.news-content :deep(a) {
  color: var(--gradient-mid);
  text-decoration: underline;
}

.news-content :deep(.used-in-project) {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  margin: 0.75rem 0;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  background: rgba(20, 184, 166, 0.12);
  border: 1px solid rgba(20, 184, 166, 0.25);
  color: #14b8a6;
}
</style>

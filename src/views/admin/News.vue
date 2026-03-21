<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'
import type { NewsArticle } from '@/types/database'

const admin = useAdminStore()
const showModal = ref(false)
const editing = ref<NewsArticle | null>(null)
const filterCategory = ref('all')
const searchQuery = ref('')

const NEWS_CATEGORIES = [
  { value: 'ai', label: 'AI' },
  { value: 'tool', label: 'Tool' },
  { value: 'mcp', label: 'MCP' },
  { value: 'ai-agent', label: 'AI Agent' },
  { value: 'skills', label: 'Skills' },
  { value: 'platform', label: 'Platform' },
  { value: 'ai-model', label: 'AI Model' },
  { value: '3d-gen', label: '3D Generation' },
  { value: 'automation', label: 'Automation' },
  { value: 'web', label: 'Web' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'devops', label: 'DevOps' },
  { value: 'general', label: 'General' },
]

// Landing page shows the 3 articles with lowest sort_order
const landingArticles = computed(() => {
  return [...admin.news]
    .filter(a => a.is_published)
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(0, 3)
})

const landingIds = computed(() => new Set(landingArticles.value.map(a => a.id)))

const filteredArticles = computed(() => {
  let results = [...admin.news].sort((a, b) => a.sort_order - b.sort_order)
  if (filterCategory.value === 'landing') {
    return results.filter(a => landingIds.value.has(a.id))
  }
  if (filterCategory.value !== 'all') {
    results = results.filter(a => a.category === filterCategory.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    results = results.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.summary.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q)
    )
  }
  return results
})

const categoryCounts = computed(() => {
  const counts: Record<string, number> = {}
  admin.news.forEach(a => { counts[a.category] = (counts[a.category] || 0) + 1 })
  return counts
})

const form = ref({
  title: '',
  slug: '',
  summary: '',
  content: '',
  image_url: '',
  video_url: '',
  link_url: '',
  category: 'ai',
  is_published: true,
  sort_order: 0,
})

onMounted(() => admin.fetchNews())

function openCreate() {
  editing.value = null
  const maxOrder = admin.news.reduce((max, a) => Math.max(max, a.sort_order), 0)
  Object.assign(form.value, {
    title: '', slug: '', summary: '', content: '', image_url: '', video_url: '', link_url: '',
    category: 'ai', is_published: true, sort_order: maxOrder + 1,
  })
  showModal.value = true
}

function openEdit(article: NewsArticle) {
  editing.value = article
  Object.assign(form.value, {
    title: article.title,
    slug: article.slug,
    summary: article.summary,
    content: article.content,
    image_url: article.image_url,
    video_url: article.video_url,
    link_url: article.link_url,
    category: article.category,
    is_published: article.is_published,
    sort_order: article.sort_order,
  })
  showModal.value = true
}

async function handleSave() {
  const data = {
    ...form.value,
    slug: form.value.slug || form.value.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
  }

  if (editing.value) {
    await admin.updateRow('news', editing.value.id, data)
  } else {
    await admin.insertRow('news', data)
  }
  showModal.value = false
  await admin.fetchNews()
}

async function handleDelete(id: string) {
  if (confirm('Delete this article?')) {
    await admin.deleteRow('news', id)
    await admin.fetchNews()
  }
}

async function togglePublish(article: NewsArticle) {
  await admin.updateRow('news', article.id, { is_published: !article.is_published })
  await admin.fetchNews()
}

// Pin to landing: set sort_order to 0 (top), bump others up
async function pinToLanding(article: NewsArticle) {
  if (landingIds.value.has(article.id)) return // already on landing
  // Give it sort_order 1, shift others
  const minOrder = Math.min(...admin.news.map(a => a.sort_order))
  await admin.updateRow('news', article.id, { sort_order: minOrder - 1 })
  await admin.fetchNews()
}

// Unpin from landing: set sort_order high to push off top 3
async function unpinFromLanding(article: NewsArticle) {
  if (!landingIds.value.has(article.id)) return
  const maxOrder = Math.max(...admin.news.map(a => a.sort_order))
  await admin.updateRow('news', article.id, { sort_order: maxOrder + 1 })
  await admin.fetchNews()
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-white">News & Articles</h2>
        <p class="text-xs text-gray-400 mt-1">Top 3 by sort order appear on landing page</p>
      </div>
      <button @click="openCreate"
        class="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
        style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
        + Add Article
      </button>
    </div>

    <!-- Search Bar -->
    <div class="mb-4">
      <div class="relative">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search articles by title, summary, or category..."
          class="w-full pl-10 pr-4 py-2.5 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none placeholder-gray-500"
        />
        <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    </div>

    <!-- Category Filter -->
    <div class="flex flex-wrap gap-2 mb-6">
      <button
        @click="filterCategory = 'all'"
        class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        :class="filterCategory === 'all' ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-neural-700 text-gray-400 hover:text-white'"
      >
        All ({{ admin.news.length }})
      </button>
      <button
        @click="filterCategory = 'landing'"
        class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        :class="filterCategory === 'landing' ? 'bg-amber-500/20 text-amber-400' : 'bg-neural-700 text-gray-400 hover:text-amber-400'"
      >
        ⭐ Landing ({{ landingArticles.length }})
      </button>
      <button
        v-for="cat in NEWS_CATEGORIES"
        :key="cat.value"
        v-show="categoryCounts[cat.value]"
        @click="filterCategory = cat.value"
        class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        :class="filterCategory === cat.value ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-neural-700 text-gray-400 hover:text-white'"
      >
        {{ cat.label }} ({{ categoryCounts[cat.value] || 0 }})
      </button>
    </div>

    <!-- Articles List -->
    <div class="space-y-3">
      <div v-for="article in filteredArticles" :key="article.id"
           class="bg-neural-800 border rounded-lg p-4 flex items-start gap-4"
           :class="landingIds.has(article.id) ? 'border-amber-500/40' : 'border-neural-600'">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs text-gray-500 font-mono w-6">#{{ article.sort_order }}</span>
            <span class="px-2 py-0.5 text-[10px] rounded-full font-semibold uppercase"
                  :class="article.is_published ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'">
              {{ article.is_published ? 'Published' : 'Draft' }}
            </span>
            <span v-if="landingIds.has(article.id)" class="px-2 py-0.5 text-[10px] rounded-full bg-amber-500/20 text-amber-400 font-semibold uppercase">
              ⭐ Landing
            </span>
            <span class="px-2 py-0.5 text-[10px] rounded-full bg-cyber-purple/20 text-cyber-purple font-semibold uppercase">
              {{ article.category }}
            </span>
            <span v-if="article.video_url" class="text-[10px] text-white/30">🎬 Video</span>
            <span v-if="article.link_url" class="text-[10px] text-white/30">🔗 Link</span>
          </div>
          <h3 class="text-white font-semibold text-sm truncate">{{ article.title }}</h3>
          <p class="text-gray-400 text-xs truncate mt-0.5">{{ article.summary }}</p>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button v-if="landingIds.has(article.id)" @click="unpinFromLanding(article)"
            class="px-3 py-1.5 text-xs rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
            title="Remove from landing page top 3">
            ⭐ Unpin
          </button>
          <button v-else @click="pinToLanding(article)"
            class="px-3 py-1.5 text-xs rounded-lg bg-neural-700 text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
            title="Pin to landing page top 3">
            ☆ Pin
          </button>
          <button @click="togglePublish(article)"
            class="px-3 py-1.5 text-xs rounded-lg transition-colors"
            :class="article.is_published ? 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20' : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'">
            {{ article.is_published ? 'Unpublish' : 'Publish' }}
          </button>
          <button @click="openEdit(article)" class="px-3 py-1.5 text-xs bg-neural-700 text-white rounded-lg hover:bg-neural-600 transition-colors">
            Edit
          </button>
          <button @click="handleDelete(article.id)" class="px-3 py-1.5 text-xs bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 transition-colors">
            Delete
          </button>
        </div>
      </div>

      <div v-if="!filteredArticles.length" class="text-center py-12 text-gray-400">
        <p class="text-4xl mb-3">📰</p>
        <p class="text-sm">{{ searchQuery || filterCategory !== 'all' ? 'No articles match your filter.' : 'No articles yet.' }}</p>
      </div>
    </div>

    <!-- Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" @click.self="showModal = false">
        <div class="bg-neural-800 border border-neural-600 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
          <h3 class="text-lg font-bold text-white mb-6">{{ editing ? 'Edit' : 'Create' }} Article</h3>

          <form @submit.prevent="handleSave" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs text-gray-400 uppercase mb-1">Title</label>
                <input v-model="form.title" required class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
              </div>
              <div>
                <label class="block text-xs text-gray-400 uppercase mb-1">Slug (auto-generated)</label>
                <input v-model="form.slug" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" placeholder="auto-from-title" />
              </div>
            </div>

            <div>
              <label class="block text-xs text-gray-400 uppercase mb-1">Summary (shown on card)</label>
              <textarea v-model="form.summary" rows="2" required class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none resize-none"></textarea>
            </div>

            <div>
              <label class="block text-xs text-gray-400 uppercase mb-1">Content (HTML supported)</label>
              <textarea v-model="form.content" rows="10" required class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none resize-y font-mono"></textarea>
              <p class="text-[10px] text-white/30 mt-1">Use &lt;h2&gt;, &lt;p&gt;, &lt;a href="..."&gt;, &lt;strong&gt;, &lt;ul&gt;&lt;li&gt; tags for formatting</p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-xs text-gray-400 uppercase mb-1">Image URL</label>
                <input v-model="form.image_url" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" placeholder="https://..." />
              </div>
              <div>
                <label class="block text-xs text-gray-400 uppercase mb-1">Video URL (embed)</label>
                <input v-model="form.video_url" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" placeholder="https://youtube.com/embed/..." />
              </div>
              <div>
                <label class="block text-xs text-gray-400 uppercase mb-1">External Link</label>
                <input v-model="form.link_url" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" placeholder="https://..." />
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-xs text-gray-400 uppercase mb-1">Category</label>
                <select v-model="form.category" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none">
                  <option v-for="cat in NEWS_CATEGORIES" :key="cat.value" :value="cat.value">{{ cat.label }}</option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-gray-400 uppercase mb-1">Sort Order (lower = landing)</label>
                <input v-model.number="form.sort_order" type="number" class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
              </div>
              <div class="flex items-end">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input v-model="form.is_published" type="checkbox" class="w-4 h-4 rounded bg-neural-700 border-neural-600" />
                  <span class="text-sm text-gray-300">Published</span>
                </label>
              </div>
            </div>

            <div class="flex justify-end gap-3 pt-4 border-t border-neural-600">
              <button type="button" @click="showModal = false" class="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button type="submit" class="px-6 py-2 rounded-lg text-sm font-medium text-white"
                      style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
                {{ editing ? 'Update' : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

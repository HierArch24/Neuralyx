<script setup lang="ts">
import { ref, onMounted } from 'vue'

const iframeRef = ref<HTMLIFrameElement | null>(null)
const iframeUrl = ref('/gitnexus/index.html')
const isLoading = ref(true)
const showConfig = ref(false)

const githubUrl = ref(localStorage.getItem('neuralyx_github_url') || '')
const githubPat = ref(localStorage.getItem('neuralyx_github_pat') || '')
const agentStatus = ref('')
const isRunning = ref(false)
const copiedField = ref('')

function copyToClipboard(value: string, field: string) {
  navigator.clipboard.writeText(value)
  copiedField.value = field
  setTimeout(() => { copiedField.value = '' }, 2000)
}

function onLoad() {
  isLoading.value = false
}

function saveConfig() {
  localStorage.setItem('neuralyx_github_url', githubUrl.value)
  localStorage.setItem('neuralyx_github_pat', githubPat.value)
  showConfig.value = false
}

async function runAgent() {
  if (!githubUrl.value) {
    agentStatus.value = 'Set your GitHub URL in Config first'
    return
  }

  const iframe = iframeRef.value
  if (!iframe?.contentDocument) {
    agentStatus.value = 'GitNexus not loaded yet'
    return
  }

  isRunning.value = true
  agentStatus.value = 'Agent: Scanning GitNexus interface...'

  try {
    const doc = iframe.contentDocument

    // Step 1: Find and fill GitHub URL input
    await delay(500)
    const inputs = doc.querySelectorAll('input[type="text"], input[type="url"], input[placeholder*="github" i], input[placeholder*="repo" i], input[placeholder*="url" i]')
    let urlInput: HTMLInputElement | null = null

    for (const inp of inputs) {
      const el = inp as HTMLInputElement
      const placeholder = (el.placeholder || '').toLowerCase()
      if (placeholder.includes('github') || placeholder.includes('repo') || placeholder.includes('url') || placeholder.includes('http')) {
        urlInput = el
        break
      }
    }

    if (!urlInput) {
      // Try broader search - first visible text input
      const allInputs = doc.querySelectorAll('input:not([type="hidden"]):not([type="file"])')
      for (const inp of allInputs) {
        const el = inp as HTMLInputElement
        if (el.offsetParent !== null) { urlInput = el; break }
      }
    }

    if (urlInput) {
      agentStatus.value = 'Agent: Filling GitHub URL...'
      urlInput.focus()
      urlInput.value = githubUrl.value
      urlInput.dispatchEvent(new Event('input', { bubbles: true }))
      urlInput.dispatchEvent(new Event('change', { bubbles: true }))
      await delay(300)
    } else {
      agentStatus.value = 'Agent: No URL input found. Trying token field...'
    }

    // Step 2: Find and fill PAT/token input
    if (githubPat.value) {
      await delay(300)
      const tokenInputs = doc.querySelectorAll('input[type="password"], input[placeholder*="token" i], input[placeholder*="pat" i], input[placeholder*="key" i]')
      let tokenInput: HTMLInputElement | null = null

      for (const inp of tokenInputs) {
        const el = inp as HTMLInputElement
        if (el.offsetParent !== null) { tokenInput = el; break }
      }

      if (tokenInput) {
        agentStatus.value = 'Agent: Filling PAT token...'
        tokenInput.focus()
        tokenInput.value = githubPat.value
        tokenInput.dispatchEvent(new Event('input', { bubbles: true }))
        tokenInput.dispatchEvent(new Event('change', { bubbles: true }))
        await delay(300)
      }
    }

    // Step 3: Find and click the clone/load/analyze button
    await delay(300)
    const buttons = doc.querySelectorAll('button')
    let cloneBtn: HTMLButtonElement | null = null

    for (const btn of buttons) {
      const text = (btn.textContent || '').toLowerCase()
      if (text.includes('clone') || text.includes('load') || text.includes('analyze') || text.includes('fetch') || text.includes('index') || text.includes('go') || text.includes('submit')) {
        if ((btn as HTMLElement).offsetParent !== null) {
          cloneBtn = btn
          break
        }
      }
    }

    if (cloneBtn) {
      agentStatus.value = 'Agent: Clicking clone button...'
      cloneBtn.click()
      await delay(1000)
      agentStatus.value = 'Agent: Done! Repository is being loaded.'
    } else {
      agentStatus.value = urlInput
        ? 'Agent: URL filled. Press Enter or click the action button manually.'
        : 'Agent: Could not find input fields. GitNexus UI may have changed.'
    }
  } catch (err: any) {
    agentStatus.value = `Agent error: ${err.message}`
  } finally {
    isRunning.value = false
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

onMounted(() => {
  if (!githubUrl.value) showConfig.value = true
})
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-5.5rem)]">
    <!-- Header -->
    <div class="flex items-center justify-between mb-3 flex-shrink-0">
      <div>
        <h2 class="text-2xl font-bold text-white">Git Nexus</h2>
        <p class="text-gray-400 text-sm mt-1">Zero-Server Code Intelligence Engine</p>
      </div>
      <div class="flex items-center gap-2">
        <button @click="runAgent" :disabled="isRunning"
          class="px-4 py-2 rounded-lg text-sm font-medium text-white whitespace-nowrap disabled:opacity-50 flex items-center gap-2"
          style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
          <svg v-if="isRunning" class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          <span v-else>🤖</span>
          {{ isRunning ? 'Running...' : 'Auto Clone' }}
        </button>
        <button @click="showConfig = !showConfig"
          class="px-3 py-2 bg-neural-700 hover:bg-neural-600 text-gray-300 rounded-lg text-sm transition-colors">
          Config
        </button>
        <a href="https://gitnexus.vercel.app" target="_blank" rel="noopener noreferrer"
          class="px-3 py-2 bg-neural-700 hover:bg-neural-600 text-gray-300 rounded-lg text-sm transition-colors flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          External
        </a>
      </div>
    </div>

    <!-- Quick Reference / Config Panel -->
    <div class="bg-neural-800 border border-neural-600 rounded-xl p-3 mb-3 flex-shrink-0">
      <div v-if="!showConfig && githubUrl" class="flex items-center gap-3 flex-wrap">
        <!-- Saved URL with copy -->
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <span class="text-[10px] text-gray-500 uppercase whitespace-nowrap">URL:</span>
          <code class="text-xs text-cyber-cyan truncate flex-1 min-w-0">{{ githubUrl }}</code>
          <button @click="copyToClipboard(githubUrl, 'url')"
            class="px-2 py-1 text-[10px] rounded transition-colors flex-shrink-0"
            :class="copiedField === 'url' ? 'bg-green-500/20 text-green-400' : 'bg-neural-700 text-gray-400 hover:text-white'">
            {{ copiedField === 'url' ? 'Copied!' : 'Copy' }}
          </button>
        </div>
        <!-- Saved PAT with copy -->
        <div v-if="githubPat" class="flex items-center gap-2">
          <span class="text-[10px] text-gray-500 uppercase whitespace-nowrap">PAT:</span>
          <code class="text-xs text-gray-400">{{ githubPat.slice(0, 8) }}...{{ githubPat.slice(-4) }}</code>
          <button @click="copyToClipboard(githubPat, 'pat')"
            class="px-2 py-1 text-[10px] rounded transition-colors flex-shrink-0"
            :class="copiedField === 'pat' ? 'bg-green-500/20 text-green-400' : 'bg-neural-700 text-gray-400 hover:text-white'">
            {{ copiedField === 'pat' ? 'Copied!' : 'Copy' }}
          </button>
        </div>
        <button @click="showConfig = true" class="px-2 py-1 text-[10px] bg-neural-700 text-gray-400 rounded hover:text-white flex-shrink-0">Edit</button>
      </div>

      <!-- Edit mode -->
      <div v-if="showConfig || !githubUrl" class="space-y-3">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-[10px] text-gray-500 uppercase mb-1">GitHub Repository URL</label>
            <input v-model="githubUrl" placeholder="https://github.com/HierArch24/NEURALYX"
              class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
          </div>
          <div>
            <label class="block text-[10px] text-gray-500 uppercase mb-1">GitHub PAT (for private repos)</label>
            <input v-model="githubPat" type="password" placeholder="ghp_xxxxxxxxxxxx"
              class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
          </div>
        </div>
        <div class="flex gap-2">
          <button @click="saveConfig" class="px-4 py-2 text-xs rounded-lg font-medium text-white"
            style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
            Save
          </button>
          <button v-if="githubUrl" @click="showConfig = false" class="px-4 py-2 text-xs text-gray-400 hover:text-white">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Agent Status -->
    <p v-if="agentStatus" class="text-xs mb-2 flex-shrink-0 px-1"
      :class="agentStatus.includes('error') || agentStatus.includes('not') ? 'text-amber-400' : agentStatus.includes('Done') ? 'text-green-400' : 'text-cyber-cyan'">
      {{ agentStatus }}
    </p>

    <!-- Iframe Container (self-hosted, same origin = DOM access) -->
    <div class="flex-1 relative rounded-xl overflow-hidden border border-neural-600 bg-white">
      <div v-if="isLoading" class="absolute inset-0 z-10 flex items-center justify-center bg-neural-900/80">
        <div class="flex flex-col items-center gap-3">
          <div class="w-8 h-8 border-2 border-cyber-purple border-t-transparent rounded-full animate-spin"></div>
          <p class="text-sm text-gray-400">Loading GitNexus...</p>
        </div>
      </div>
      <iframe ref="iframeRef" :src="iframeUrl" class="w-full h-full border-0" @load="onLoad" allow="clipboard-read; clipboard-write"></iframe>
    </div>
  </div>
</template>

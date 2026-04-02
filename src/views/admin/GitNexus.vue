<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

// Always use Vercel-hosted GitNexus via iframe
const useIframe = computed(() => true)
const iframeUrl = ref('https://gitnexus.vercel.app')
const isLoading = ref(true)
const showConfig = ref(false)

const EXTERNAL_URL = 'https://gitnexus.vercel.app'
const DEFAULT_URL = 'https://github.com/HierArch24/Neuralyx'
const githubUrl = ref(DEFAULT_URL)
const githubPat = ref('')
const copiedField = ref('')
const agentStatus = ref('')
const isRunning = ref(false)

function onLoad() {
  isLoading.value = false
}

onMounted(() => {
  githubUrl.value = localStorage.getItem('neuralyx_github_url') || DEFAULT_URL
  githubPat.value = localStorage.getItem('neuralyx_github_pat') || ''
  if (githubUrl.value === 'admin@neuralyx.dev' || !githubUrl.value.includes('github')) {
    githubUrl.value = DEFAULT_URL
    localStorage.setItem('neuralyx_github_url', DEFAULT_URL)
  }
})

function saveConfig() {
  localStorage.setItem('neuralyx_github_url', githubUrl.value)
  localStorage.setItem('neuralyx_github_pat', githubPat.value)
  showConfig.value = false
}

function copyToClipboard(value: string, field: string) {
  navigator.clipboard.writeText(value)
  copiedField.value = field
  setTimeout(() => { copiedField.value = '' }, 2000)
}

function openExternal() {
  window.open(EXTERNAL_URL, '_blank', 'noopener,noreferrer')
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function getIframeDoc(): Promise<Document | null> {
  const iframe = document.querySelector('iframe') as HTMLIFrameElement | null
  if (!iframe) return null
  try {
    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (doc && doc.body) return doc
  } catch { /* cross-origin */ }
  return null
}

async function autoClone() {
  if (!githubUrl.value) { agentStatus.value = 'Set GitHub URL first'; return }

  // If no iframe, copy URL and open external
  if (!useIframe.value) {
    await navigator.clipboard.writeText(githubUrl.value)
    agentStatus.value = 'URL copied! Opening GitNexus externally...'
    openExternal()
    setTimeout(() => { agentStatus.value = '' }, 5000)
    return
  }

  isRunning.value = true
  agentStatus.value = 'Agent: Waiting for GitNexus to load...'

  // Wait for iframe to be accessible
  let doc: Document | null = null
  for (let i = 0; i < 10; i++) {
    doc = await getIframeDoc()
    if (doc && doc.querySelectorAll('input').length > 0) break
    await delay(500)
  }

  if (!doc || doc.querySelectorAll('input').length === 0) {
    agentStatus.value = 'Cannot access GitNexus DOM — URL copied to clipboard instead'
    await navigator.clipboard.writeText(githubUrl.value)
    isRunning.value = false
    return
  }

  try {
    agentStatus.value = 'Agent: Looking for GitHub tab...'
    await delay(500)

    // Step 0: Find and click "from GitHub" or "GitHub URL" tab
    const allClickables = Array.from(doc.querySelectorAll('button, [role="tab"], a, div, span, label, li')) as HTMLElement[]
    let tabClicked = false
    for (const el of allClickables) {
      const text = (el.textContent || '').toLowerCase().trim()
      if ((text === 'github' || text === 'from github' || text === 'github url' || text.includes('from github'))
          && !text.includes('zip') && !text.includes('clone repository')
          && el.offsetParent !== null && el.offsetWidth > 0) {
        agentStatus.value = `Agent: Clicking "${el.textContent?.trim()}" tab...`
        el.click()
        tabClicked = true
        await delay(1000)
        break
      }
    }
    if (!tabClicked) {
      const byClass = doc.querySelector('[class*="github"], [data-tab*="github"], [id*="github"]') as HTMLElement | null
      if (byClass && byClass.offsetParent !== null) {
        agentStatus.value = 'Agent: Clicking GitHub tab by class...'
        byClass.click()
        await delay(1000)
      }
    }

    agentStatus.value = 'Agent: Finding input fields...'
    await delay(300)

    const allInputs = Array.from(doc.querySelectorAll('input')) as HTMLInputElement[]
    let urlInput: HTMLInputElement | null = null
    let tokenInput: HTMLInputElement | null = null

    for (const el of allInputs) {
      const ph = (el.placeholder || '').toLowerCase()
      if (ph.includes('owner/repo') || ph.includes('github.com') || ph.includes('repository url')) {
        urlInput = el
      } else if (el.type === 'password') {
        tokenInput = el
      }
    }
    if (!urlInput) {
      for (const el of allInputs) {
        if (el.type !== 'password' && el.type !== 'hidden' && el.type !== 'file' && el.offsetParent !== null) {
          urlInput = el
          break
        }
      }
    }

    if (urlInput) {
      agentStatus.value = 'Agent: Typing GitHub URL...'
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      if (nativeSetter) {
        nativeSetter.call(urlInput, githubUrl.value)
      } else {
        urlInput.value = githubUrl.value
      }
      urlInput.dispatchEvent(new Event('input', { bubbles: true }))
      urlInput.dispatchEvent(new Event('change', { bubbles: true }))
      await delay(500)
      agentStatus.value = 'Agent: URL entered!'
    } else {
      agentStatus.value = 'Agent: No URL input found'
    }

    if (githubPat.value && tokenInput) {
      await delay(300)
      agentStatus.value = 'Agent: Filling PAT...'
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      if (nativeSetter) {
        nativeSetter.call(tokenInput, githubPat.value)
      } else {
        tokenInput.value = githubPat.value
      }
      tokenInput.dispatchEvent(new Event('input', { bubbles: true }))
      tokenInput.dispatchEvent(new Event('change', { bubbles: true }))
      await delay(300)
    }

    await delay(500)
    agentStatus.value = 'Agent: Looking for Clone Repository button...'
    const buttons = Array.from(doc.querySelectorAll('button')) as HTMLButtonElement[]
    let cloneBtn: HTMLElement | null = null

    for (const btn of buttons) {
      const text = (btn.textContent || '').trim().toLowerCase()
      if ((text === 'clone repository' || text === 'clone repo' || text === 'clone') && btn.offsetParent !== null) {
        cloneBtn = btn
        break
      }
    }
    if (!cloneBtn) {
      for (const btn of buttons) {
        const text = (btn.textContent || '').trim().toLowerCase()
        if (text.includes('clone') && !text.includes('auto') && btn.offsetParent !== null && btn.offsetHeight > 30) {
          cloneBtn = btn
          break
        }
      }
    }

    if (cloneBtn) {
      agentStatus.value = 'Agent: Clicking clone...'
      cloneBtn.click()
      await delay(1000)
      agentStatus.value = 'Agent: Done! Repository is loading.'
    } else if (urlInput) {
      agentStatus.value = 'Agent: Pressing Enter to submit...'
      urlInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }))
      urlInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', bubbles: true }))
      urlInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }))
      await delay(1000)
      agentStatus.value = 'Agent: Done! Check GitNexus below.'
    } else {
      agentStatus.value = 'Agent: URL entered but no clone button found. Click it manually.'
    }
  } catch {
    agentStatus.value = 'URL copied to clipboard — paste it in GitNexus below'
    await navigator.clipboard.writeText(githubUrl.value)
  } finally {
    isRunning.value = false
    setTimeout(() => { agentStatus.value = '' }, 8000)
  }
}
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
        <button v-if="useIframe" @click="autoClone" :disabled="isRunning"
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
        <a :href="EXTERNAL_URL" target="_blank" rel="noopener noreferrer"
          class="px-3 py-2 bg-neural-700 hover:bg-neural-600 text-gray-300 rounded-lg text-sm transition-colors flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          External
        </a>
      </div>
    </div>

    <!-- Quick Reference -->
    <div class="bg-neural-800 border border-neural-600 rounded-xl p-3 mb-3 flex-shrink-0">
      <div v-if="!showConfig" class="flex items-center gap-3 flex-wrap">
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <span class="text-[10px] text-gray-500 uppercase whitespace-nowrap">URL:</span>
          <code class="text-xs text-cyber-cyan truncate flex-1 min-w-0">{{ githubUrl }}</code>
          <button @click="copyToClipboard(githubUrl, 'url')"
            class="px-2 py-1 text-[10px] rounded transition-colors flex-shrink-0"
            :class="copiedField === 'url' ? 'bg-green-500/20 text-green-400' : 'bg-neural-700 text-gray-400 hover:text-white'">
            {{ copiedField === 'url' ? 'Copied!' : 'Copy' }}
          </button>
        </div>
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
      <div v-if="showConfig" class="space-y-3">
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
            style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">Save</button>
          <button @click="showConfig = false" class="px-4 py-2 text-xs text-gray-400 hover:text-white">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Agent Status -->
    <p v-if="agentStatus" class="text-xs mb-2 flex-shrink-0 px-1"
      :class="agentStatus.includes('Done') || agentStatus.includes('entered') || agentStatus.includes('Opening') ? 'text-green-400' : agentStatus.includes('Error') || agentStatus.includes('not found') ? 'text-amber-400' : 'text-cyber-cyan'">
      {{ agentStatus }}
    </p>

    <!-- IFRAME MODE: localhost / Docker local -->
    <div v-if="useIframe" class="flex-1 relative rounded-xl overflow-hidden border border-neural-600 bg-white">
      <div v-if="isLoading" class="absolute inset-0 z-10 flex items-center justify-center bg-neural-900/80">
        <div class="flex flex-col items-center gap-3">
          <div class="w-8 h-8 border-2 border-cyber-purple border-t-transparent rounded-full animate-spin"></div>
          <p class="text-sm text-gray-400">Loading GitNexus...</p>
        </div>
      </div>
      <iframe :src="iframeUrl" class="w-full h-full border-0" @load="onLoad" allow="clipboard-read; clipboard-write"></iframe>
    </div>

    <!-- EXTERNAL MODE: live deployment -->
    <div v-else class="flex-1 flex items-center justify-center rounded-xl border border-neural-600"
         style="background: linear-gradient(135deg, rgba(255,255,255,0.02), rgba(255,255,255,0.005));">
      <div class="text-center max-w-lg px-8">
        <!-- Logo / Icon -->
        <div class="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center"
             style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
          <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
          </svg>
        </div>

        <h3 class="text-xl font-bold text-white mb-2">GitNexus Code Intelligence</h3>
        <p class="text-sm text-white/40 mb-6 leading-relaxed">
          GitNexus runs entirely in your browser. Drop in a GitHub repo and get an interactive knowledge graph with a built-in Graph RAG agent.
        </p>

        <!-- Open external button -->
        <button @click="autoClone"
          class="px-8 py-3.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105 hover:shadow-lg hover:shadow-purple-500/20 flex items-center gap-3 mx-auto"
          style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          Open GitNexus
        </button>
        <p class="text-[11px] text-white/25 mt-3">Opens in a new tab with your GitHub URL copied to clipboard</p>

        <!-- Quick actions row -->
        <div class="flex items-center justify-center gap-3 mt-6">
          <button @click="copyToClipboard(githubUrl, 'url')"
            class="px-4 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2"
            :class="copiedField === 'url' ? 'bg-green-500/20 text-green-400' : 'bg-white/[0.05] text-white/50 hover:text-white/80 border border-white/[0.08]'">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
            {{ copiedField === 'url' ? 'Copied!' : 'Copy Repo URL' }}
          </button>
          <a :href="EXTERNAL_URL" target="_blank" rel="noopener"
            class="px-4 py-2 rounded-lg text-xs font-medium bg-white/[0.05] text-white/50 hover:text-white/80 border border-white/[0.08] transition-colors flex items-center gap-2">
            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            GitNexus on Vercel
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

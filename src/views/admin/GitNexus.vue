<script setup lang="ts">
import { ref, onMounted } from 'vue'

// Use self-hosted in Docker, external in dev
const isDev = import.meta.env.DEV
const iframeUrl = ref(isDev ? 'https://gitnexus.vercel.app' : '/gitnexus/index.html')
const isLoading = ref(true)
const showConfig = ref(false)

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
      // Match "from github", "github url", "github" tab - but NOT "clone repository" or "zip"
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
      // Try clicking element with class containing 'github' or 'repo'
      const byClass = doc.querySelector('[class*="github"], [data-tab*="github"], [id*="github"]') as HTMLElement | null
      if (byClass && byClass.offsetParent !== null) {
        agentStatus.value = 'Agent: Clicking GitHub tab by class...'
        byClass.click()
        await delay(1000)
      }
    }

    agentStatus.value = 'Agent: Finding input fields...'
    await delay(300)

    // Find URL input (placeholder contains "github.com/owner/repo")
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
    // Fallback: first visible non-password input
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
      // Use native input setter for React compatibility
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

    // Fill PAT
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

    // Find and click "Clone Repository" button specifically
    await delay(500)
    agentStatus.value = 'Agent: Looking for Clone Repository button...'
    const buttons = Array.from(doc.querySelectorAll('button')) as HTMLButtonElement[]
    let cloneBtn: HTMLElement | null = null

    for (const btn of buttons) {
      const text = (btn.textContent || '').trim().toLowerCase()
      // Match "clone repository" or "clone repo" exactly, not tab buttons
      if ((text === 'clone repository' || text === 'clone repo' || text === 'clone') && btn.offsetParent !== null) {
        cloneBtn = btn
        break
      }
    }
    // Fallback: button containing "clone" that isn't a tab
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
      // Try pressing Enter on the input
      agentStatus.value = 'Agent: Pressing Enter to submit...'
      urlInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }))
      urlInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', bubbles: true }))
      urlInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }))
      await delay(1000)
      agentStatus.value = 'Agent: Done! Check GitNexus below.'
    } else {
      agentStatus.value = 'Agent: URL entered but no clone button found. Click it manually.'
    }
  } catch (err: any) {
    // Cross-origin fallback
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
        <button @click="autoClone" :disabled="isRunning"
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
      :class="agentStatus.includes('Done') || agentStatus.includes('entered') ? 'text-green-400' : agentStatus.includes('Error') || agentStatus.includes('not found') ? 'text-amber-400' : 'text-cyber-cyan'">
      {{ agentStatus }}
    </p>

    <!-- Iframe -->
    <div class="flex-1 relative rounded-xl overflow-hidden border border-neural-600 bg-white">
      <div v-if="isLoading" class="absolute inset-0 z-10 flex items-center justify-center bg-neural-900/80">
        <div class="flex flex-col items-center gap-3">
          <div class="w-8 h-8 border-2 border-cyber-purple border-t-transparent rounded-full animate-spin"></div>
          <p class="text-sm text-gray-400">Loading GitNexus...</p>
        </div>
      </div>
      <iframe :src="iframeUrl" class="w-full h-full border-0" @load="onLoad" allow="clipboard-read; clipboard-write"></iframe>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const iframeUrl = ref('https://gitnexus.vercel.app')
const isLoading = ref(true)
const showConfig = ref(false)

// Saved credentials
const githubUrl = ref(localStorage.getItem('neuralyx_github_url') || '')
const githubPat = ref(localStorage.getItem('neuralyx_github_pat') || '')
const repoInput = ref('')
const cloneStatus = ref('')
const isCloning = ref(false)

function onLoad() {
  isLoading.value = false
}

function saveConfig() {
  localStorage.setItem('neuralyx_github_url', githubUrl.value)
  localStorage.setItem('neuralyx_github_pat', githubPat.value)
  showConfig.value = false
}

async function cloneAndDownload() {
  const repo = repoInput.value.trim() || githubUrl.value.trim()
  if (!repo) { cloneStatus.value = 'Enter a GitHub URL first'; return }

  // Parse owner/repo from URL
  const match = repo.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
  if (!match) { cloneStatus.value = 'Invalid GitHub URL'; return }

  const [, owner, repoName] = match
  isCloning.value = true
  cloneStatus.value = `Downloading ${owner}/${repoName}...`

  try {
    const headers: Record<string, string> = { 'Accept': 'application/vnd.github+json' }
    if (githubPat.value) headers['Authorization'] = `Bearer ${githubPat.value}`

    const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/zipball`, { headers })
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`)

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${repoName}.zip`
    a.click()
    URL.revokeObjectURL(url)

    cloneStatus.value = `Downloaded ${repoName}.zip — drag it into GitNexus below`
  } catch (err: any) {
    cloneStatus.value = `Error: ${err.message}`
  } finally {
    isCloning.value = false
  }
}

onMounted(() => {
  if (githubUrl.value) repoInput.value = githubUrl.value
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
        <button @click="showConfig = !showConfig"
          class="px-3 py-2 bg-neural-700 hover:bg-neural-600 text-gray-300 rounded-lg text-sm transition-colors flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          Config
        </button>
        <a :href="iframeUrl" target="_blank" rel="noopener noreferrer"
          class="px-3 py-2 bg-neural-700 hover:bg-neural-600 text-gray-300 rounded-lg text-sm transition-colors flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          Open in New Tab
        </a>
      </div>
    </div>

    <!-- Config Panel -->
    <div v-if="showConfig" class="bg-neural-800 border border-neural-600 rounded-xl p-4 mb-3 flex-shrink-0 space-y-3">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label class="block text-[10px] text-gray-500 uppercase mb-1">Default GitHub URL</label>
          <input v-model="githubUrl" placeholder="https://github.com/HierArch24/NEURALYX"
            class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
        </div>
        <div>
          <label class="block text-[10px] text-gray-500 uppercase mb-1">GitHub PAT (optional, for private repos)</label>
          <input v-model="githubPat" type="password" placeholder="ghp_xxxxxxxxxxxx"
            class="w-full px-3 py-2 bg-neural-700 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
        </div>
      </div>
      <div class="flex gap-2">
        <button @click="saveConfig" class="px-4 py-2 text-xs rounded-lg font-medium text-white"
          style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
          Save Config
        </button>
        <button @click="showConfig = false" class="px-4 py-2 text-xs text-gray-400 hover:text-white">Cancel</button>
      </div>
    </div>

    <!-- Quick Clone Bar -->
    <div class="flex gap-2 mb-3 flex-shrink-0">
      <input v-model="repoInput" placeholder="Paste GitHub repo URL to clone as ZIP..."
        class="flex-1 px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none"
        @keydown.enter="cloneAndDownload" />
      <button @click="cloneAndDownload" :disabled="isCloning"
        class="px-4 py-2 rounded-lg text-sm font-medium text-white whitespace-nowrap disabled:opacity-50"
        style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
        {{ isCloning ? 'Downloading...' : 'Clone ZIP' }}
      </button>
    </div>
    <p v-if="cloneStatus" class="text-xs mb-2 flex-shrink-0"
      :class="cloneStatus.startsWith('Error') ? 'text-red-400' : cloneStatus.startsWith('Downloaded') ? 'text-green-400' : 'text-gray-400'">
      {{ cloneStatus }}
    </p>

    <!-- Iframe Container -->
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

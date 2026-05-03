<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'

const RELAY = 'http://localhost:9223'

const CAM_SLOTS = [
  // ── Page 1 ──────────────────────────────────────────────────────────────
  { id: 1,  label: 'Indeed PH',        defaultUrl: 'https://ph.indeed.com/jobs?q=AI+engineer&l=&fromage=7&sort=date', color: '#2557a7' },
  { id: 2,  label: 'LinkedIn',         defaultUrl: 'https://www.linkedin.com/jobs/', color: '#0077b5' },
  { id: 3,  label: 'Glassdoor',        defaultUrl: 'https://www.glassdoor.com/Job/index.htm', color: '#0caa41' },
  { id: 4,  label: 'Jooble',           defaultUrl: 'https://ph.jooble.org/', color: '#ff6b2c' },
  { id: 5,  label: 'Kalibrr',          defaultUrl: 'https://www.kalibrr.com/home', color: '#1a9ed4' },
  { id: 6,  label: 'JobStreet PH',     defaultUrl: 'https://www.jobstreet.com.ph/jobs/in-Philippines', color: '#db1f48' },
  { id: 7,  label: 'OnlineJobs.ph',    defaultUrl: 'https://www.onlinejobs.ph/jobseekers/job-search?q=AI+engineer', color: '#f59e0b' },
  { id: 8,  label: 'RemoteRocketship', defaultUrl: 'https://www.remoterocketship.com/jobs?query=AI+engineer', color: '#6366f1' },
  { id: 9,  label: 'ZipRecruiter',     defaultUrl: 'https://www.ziprecruiter.com/candidate/search?search=AI+engineer&location=Philippines', color: '#00b050' },
  { id: 10, label: 'Bossjob',          defaultUrl: 'https://bossjob.ph/jobs/search?keyword=AI+engineer', color: '#e11d48' },
  { id: 11, label: 'Freelancer.com',   defaultUrl: 'https://www.freelancer.ph/jobs/python-ai/', color: '#29b2fe' },
  { id: 12, label: 'Toptal',           defaultUrl: 'https://www.toptal.com/talent/apply', color: '#204ecf' },
  // ── Page 2 ──────────────────────────────────────────────────────────────
  { id: 13, label: 'Career.io',        defaultUrl: 'https://career.io/jobs?q=AI+engineer', color: '#7c3aed' },
  { id: 14, label: 'Jobslin PH',       defaultUrl: 'https://jobslin.com/jobs?q=AI+engineer', color: '#0ea5e9' },
  { id: 15, label: 'CareerBuilder',    defaultUrl: 'https://www.careerbuilder.com/jobs?keywords=AI+engineer&location=Philippines', color: '#003893' },
  { id: 16, label: 'Indeed Messages',  defaultUrl: 'https://messages.indeed.com/', color: '#2557a7' },
  // ── Always last ─────────────────────────────────────────────────────────
  { id: 99, label: '⚡ Apply Bot',      defaultUrl: '', color: '#a855f7' },
]

const PAGE_SIZE = 12

const LOGIN_CONFIG: Record<number, { loginUrl: string; loggedOutUrl?: RegExp; loggedOutTitle?: RegExp; noLogin?: boolean }> = {
  1:  { loginUrl: 'https://secure.indeed.com/auth?hl=en_PH', loggedOutUrl: /accounts\.indeed\.com|\/login|signin/i, loggedOutTitle: /sign in|log in/i },
  2:  { loginUrl: 'https://www.linkedin.com/login', loggedOutUrl: /\/login|\/checkpoint|\/authwall|uas\/login/i },
  3:  { loginUrl: 'https://www.glassdoor.com/profile/login_input.htm', loggedOutUrl: /\/login|GD_API_AUTH/i },
  4:  { loginUrl: 'https://ph.jooble.org/', loggedOutTitle: /just a moment|checking your browser|cloudflare/i, noLogin: true },
  5:  { loginUrl: 'https://www.kalibrr.com/login', loggedOutUrl: /\/login/i },
  6:  { loginUrl: 'https://id.jobstreet.com/login?lang=en&returnUrl=https://www.jobstreet.com.ph', loggedOutUrl: /id\.jobstreet|\/login/i },
  7:  { loginUrl: 'https://www.onlinejobs.ph/login', loggedOutUrl: /\/login/i },
  8:  { loginUrl: 'https://www.remoterocketship.com/signin', loggedOutUrl: /\/signin|\/login/i },
  9:  { loginUrl: 'https://www.ziprecruiter.com/login', loggedOutUrl: /\/login/i },
  10: { loginUrl: 'https://bossjob.ph/en/login', loggedOutUrl: /\/login/i },
  11: { loginUrl: 'https://www.freelancer.ph/login', loggedOutUrl: /\/login/i },
  12: { loginUrl: 'https://www.toptal.com/login', loggedOutUrl: /\/login/i },
  13: { loginUrl: 'https://career.io/login', loggedOutUrl: /\/login/i },
  14: { loginUrl: 'https://jobslin.com/login', loggedOutUrl: /\/login/i },
  15: { loginUrl: 'https://www.careerbuilder.com/login', loggedOutUrl: /\/login/i },
  16: { loginUrl: 'https://secure.indeed.com/auth?hl=en_PH', loggedOutUrl: /accounts\.indeed\.com|\/login|signin/i },
}

type LoginState = 'in' | 'out' | 'blocked' | 'unknown'

interface MonitorPage { slotId: number; title: string; url: string }

const pages         = ref<MonitorPage[]>([])
const relayOk       = ref(false)
const opening       = ref<Record<number, boolean>>({})
const currentPage   = ref(1)
const showLoginPanel = ref(false)
const syncing       = ref(false)
const frameKeys     = ref<Record<number, number>>({})   // bump to force iframe refresh
const fullSlot      = ref<typeof CAM_SLOTS[0] | null>(null)

let pollTimer: ReturnType<typeof setInterval> | null = null
let autoLoadDone = false

const jobSlotsAll = CAM_SLOTS.filter(s => s.id !== 99)
const applySlot   = CAM_SLOTS.find(s => s.id === 99)!
const totalPages  = computed(() => Math.ceil(jobSlotsAll.length / PAGE_SIZE))

const visibleSlots = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  const slice = jobSlotsAll.slice(start, start + PAGE_SIZE)
  return [...slice, applySlot]
})

async function pollPages() {
  try {
    const r = await fetch(`${RELAY}/monitor/pages`, { signal: AbortSignal.timeout(2000) })
    if (r.ok) { pages.value = (await r.json()).pages || []; relayOk.value = true }
  } catch { relayOk.value = false }
}

function findPage(slot: typeof CAM_SLOTS[0]): MonitorPage | null {
  return pages.value.find(p => p.slotId === slot.id) ?? null
}

function frameUrl(slotId: number, key: number) {
  return `${RELAY}/monitor/frame?slotId=${slotId}&_k=${key}`
}

function streamUrl(slotId: number) {
  return `${RELAY}/monitor/stream?slotId=${slotId}`
}

function refreshFrame(slotId: number) {
  frameKeys.value = { ...frameKeys.value, [slotId]: (frameKeys.value[slotId] || 0) + 1 }
}

function refreshAll() {
  visibleSlots.value.forEach(s => { if (findPage(s)) refreshFrame(s.id) })
}

async function openCam(slot: typeof CAM_SLOTS[0], e?: Event) {
  e?.stopPropagation()
  if (opening.value[slot.id]) return
  opening.value = { ...opening.value, [slot.id]: true }
  try {
    await fetch(`${RELAY}/monitor/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: slot.defaultUrl, slotId: slot.id }),
      signal: AbortSignal.timeout(35000),
    })
    await pollPages()
    refreshFrame(slot.id)
  } catch { /* ignore */ }
  opening.value = { ...opening.value, [slot.id]: false }
}

async function openAll() {
  const missing = visibleSlots.value.filter(s => s.id !== 99 && !findPage(s))
  await Promise.allSettled(missing.map(s => openCam(s)))
}

async function openAllPages() {
  const missing = jobSlotsAll.filter(s => !findPage(s))
  await Promise.allSettled(missing.map(s => openCam(s)))
}

async function goToLogin(slot: typeof CAM_SLOTS[0]) {
  const cfg = LOGIN_CONFIG[slot.id]
  if (!cfg || cfg.noLogin) return
  opening.value = { ...opening.value, [slot.id]: true }
  try {
    await fetch(`${RELAY}/monitor/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: cfg.loginUrl, slotId: slot.id }),
      signal: AbortSignal.timeout(20000),
    })
    await pollPages()
    refreshFrame(slot.id)
    fullSlot.value = slot
    showLoginPanel.value = false
  } catch { /* ignore */ }
  opening.value = { ...opening.value, [slot.id]: false }
}

async function navigateSlot(slot: typeof CAM_SLOTS[0], url: string) {
  try {
    await fetch(`${RELAY}/monitor/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, slotId: slot.id }),
      signal: AbortSignal.timeout(30000),
    })
    await pollPages()
    refreshFrame(slot.id)
  } catch { /* ignore */ }
}

async function syncSessions() {
  syncing.value = true
  try {
    await fetch(`${RELAY}/monitor/sync-storage`, { method: 'POST', signal: AbortSignal.timeout(30000) })
    autoLoadDone = false
    await pollPages()
    if (relayOk.value) { autoLoadDone = true; openAll() }
  } catch { /* ignore */ }
  syncing.value = false
}

// Listen for nav events from iframes (link clicks)
function onIframeMessage(e: MessageEvent) {
  if (e.data?.type === 'nav' && e.data.slotId != null) {
    const slot = CAM_SLOTS.find(s => s.id === e.data.slotId)
    if (slot) navigateSlot(slot, e.data.url)
  }
}

const CLOUDFLARE_BLOCK = /request blocked|just a moment|checking your browser|cloudflare|attention required/i

function isCloudflareBlocked(page: MonitorPage): boolean {
  return CLOUDFLARE_BLOCK.test(page.title || '') || CLOUDFLARE_BLOCK.test(page.url || '')
}

// ── Login state ──────────────────────────────────────────────────────────────
function loginState(slot: typeof CAM_SLOTS[0]): LoginState {
  const page = findPage(slot)
  if (!page) return 'unknown'
  if (isCloudflareBlocked(page)) return 'blocked'
  const cfg = LOGIN_CONFIG[slot.id]
  if (!cfg) return 'unknown'
  if (cfg.loggedOutTitle?.test(page.title || '')) return cfg.noLogin ? 'blocked' : 'out'
  if (cfg.loggedOutUrl?.test(page.url || '')) return 'out'
  return 'in'
}

async function openInEdge(slot: typeof CAM_SLOTS[0]) {
  opening.value = { ...opening.value, [slot.id]: true }
  try {
    await fetch(`${RELAY}/monitor/navigate-edge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: slot.defaultUrl, slotId: slot.id }),
      signal: AbortSignal.timeout(35000),
    })
    await pollPages()
    refreshFrame(slot.id)
  } catch { /* ignore */ }
  opening.value = { ...opening.value, [slot.id]: false }
}

const loginStateColor: Record<LoginState, string> = {
  in: 'bg-green-400', out: 'bg-orange-400',
  blocked: 'bg-red-500', unknown: 'bg-gray-600',
}
const loginStateLabel: Record<LoginState, string> = {
  in: 'Logged in', out: 'Not logged in', blocked: 'Blocked', unknown: 'Not loaded',
}

// ── Address bar per slot ─────────────────────────────────────────────────────
const addressInput = ref<Record<number, string>>({})
function onAddressKey(e: KeyboardEvent, slot: typeof CAM_SLOTS[0]) {
  if (e.key === 'Enter') {
    let url = addressInput.value[slot.id] || ''
    if (!url.startsWith('http')) url = 'https://' + url
    navigateSlot(slot, url)
  }
}

watch(pages, (newPages) => {
  newPages.forEach(p => { addressInput.value[p.slotId] = p.url })
}, { deep: true })

watch(relayOk, (online) => {
  if (online && !autoLoadDone) { autoLoadDone = true; openAll() }
})

onMounted(async () => {
  await pollPages()
  pollTimer = setInterval(pollPages, 3000)
  window.addEventListener('message', onIframeMessage)
  if (relayOk.value) { autoLoadDone = true; openAll() }
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  window.removeEventListener('message', onIframeMessage)
})

const activeCamCount = computed(() => jobSlotsAll.filter(s => findPage(s)).length)
const loggedInCount  = computed(() => jobSlotsAll.filter(s => loginState(s) === 'in').length)

// ── Fullscreen MJPEG interaction ─────────────────────────────────────────────
const streamImg = ref<HTMLImageElement | null>(null)

function onStreamClick(e: MouseEvent, slot: typeof CAM_SLOTS[0]) {
  if (!streamImg.value) return
  const rect = streamImg.value.getBoundingClientRect()
  fetch(`${RELAY}/monitor/click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slotId: slot.id, x: e.clientX - rect.left, y: e.clientY - rect.top, viewW: rect.width, viewH: rect.height }),
  }).catch(() => {})
}

function onStreamScroll(e: WheelEvent, slot: typeof CAM_SLOTS[0]) {
  fetch(`${RELAY}/monitor/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slotId: slot.id, deltaX: e.deltaX, deltaY: e.deltaY }),
  }).catch(() => {})
}

function onStreamKeydown(e: KeyboardEvent, slot: typeof CAM_SLOTS[0]) {
  if (['Tab', 'F5', 'F12'].includes(e.key)) return
  e.preventDefault()
  const text = e.key.length === 1 ? e.key : e.key === 'Enter' ? '\n' : e.key === 'Backspace' ? '\b' : null
  if (!text) return
  fetch(`${RELAY}/monitor/type`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slotId: slot.id, text }),
  }).catch(() => {})
}
</script>

<template>
  <div class="h-screen bg-[#1a1a2e] flex flex-col overflow-hidden">

    <!-- ── App bar ──────────────────────────────────────────────────────── -->
    <div class="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-[#16213e] flex-shrink-0">
      <div class="flex items-center gap-2">
        <span class="text-sm">🖥️</span>
        <span class="text-sm font-semibold text-white">Job Sites Monitor</span>
        <span class="text-[10px] text-gray-500">Live embedded browser windows</span>
      </div>
      <div class="flex items-center gap-2">
        <!-- Login summary -->
        <button @click="showLoginPanel = !showLoginPanel"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] transition-colors"
          :class="loggedInCount === jobSlotsAll.length
            ? 'border-green-600/40 text-green-400 hover:border-green-500'
            : 'border-orange-600/40 text-orange-400 hover:border-orange-500'">
          🔐 {{ loggedInCount }}/{{ jobSlotsAll.length }}
        </button>
        <button @click="syncSessions" :disabled="syncing"
          class="px-2.5 py-1 rounded-lg border border-purple-600/40 text-purple-400 hover:text-white text-[11px] transition-colors disabled:opacity-40">
          {{ syncing ? 'Syncing…' : '🔑 Sync Login' }}
        </button>
        <button @click="openAll"
          class="px-2.5 py-1 rounded-lg border border-white/10 text-gray-400 hover:text-white text-[11px] transition-colors">
          Load Page
        </button>
        <button @click="refreshAll"
          class="px-2.5 py-1 rounded-lg border border-white/10 text-gray-400 hover:text-white text-[11px] transition-colors">
          ↻ Refresh
        </button>
        <div class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full" :class="relayOk ? 'bg-green-400' : 'bg-red-500 animate-pulse'"></span>
          <span class="text-[11px]" :class="relayOk ? 'text-green-400' : 'text-red-400'">
            {{ relayOk ? 'Online' : 'Relay offline' }}
          </span>
        </div>
        <span class="text-[11px] text-gray-600">{{ activeCamCount }}/{{ jobSlotsAll.length }}</span>
      </div>
    </div>

    <!-- ── Pagination ─────────────────────────────────────────────────── -->
    <div class="flex items-center justify-between px-4 py-1 bg-[#0f0f23] border-b border-white/5 flex-shrink-0">
      <div class="flex items-center gap-1.5">
        <button @click="currentPage > 1 && currentPage--" :disabled="currentPage === 1"
          class="px-2 py-0.5 rounded text-[10px] border border-white/10 text-gray-500 hover:text-white disabled:opacity-30 transition-colors">‹</button>
        <button v-for="p in totalPages" :key="p" @click="currentPage = p"
          class="w-5 h-5 rounded text-[10px] font-medium transition-colors"
          :class="p === currentPage ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-white hover:bg-white/10'">
          {{ p }}
        </button>
        <button @click="currentPage < totalPages && currentPage++" :disabled="currentPage === totalPages"
          class="px-2 py-0.5 rounded text-[10px] border border-white/10 text-gray-500 hover:text-white disabled:opacity-30 transition-colors">›</button>
        <span class="text-[10px] text-gray-700 ml-1">Page {{ currentPage }}/{{ totalPages }} · 12 per page</span>
      </div>
      <button @click="openAllPages" class="text-[10px] text-gray-700 hover:text-gray-400 transition-colors">Load all pages</button>
    </div>

    <!-- ── Window grid ────────────────────────────────────────────────── -->
    <div class="flex-1 p-1.5 grid gap-1.5 overflow-hidden"
      style="grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(3, 1fr)">

      <div v-for="slot in visibleSlots" :key="slot.id"
        class="flex flex-col rounded-lg overflow-hidden border transition-all group"
        :class="[
          fullSlot?.id === slot.id ? 'border-blue-500/60' : 'border-white/10 hover:border-white/20',
          findPage(slot) ? '' : 'opacity-60',
        ]"
        style="min-height:0">

        <!-- ── Browser chrome ── -->
        <div class="flex items-center gap-1 px-1.5 py-1 bg-[#252540] border-b border-white/10 flex-shrink-0">
          <!-- Traffic lights -->
          <div class="flex items-center gap-0.5 flex-shrink-0">
            <span class="w-2 h-2 rounded-full bg-red-500/70"></span>
            <span class="w-2 h-2 rounded-full bg-yellow-500/70"></span>
            <span class="w-2 h-2 rounded-full bg-green-500/70"></span>
          </div>

          <!-- Platform dot + favicon area -->
          <span class="w-2 h-2 rounded-full flex-shrink-0 ml-0.5" :style="{ background: slot.color }"></span>

          <!-- Address bar -->
          <input
            v-if="slot.id !== 99"
            v-model="addressInput[slot.id]"
            @keydown="onAddressKey($event, slot)"
            @click.stop
            type="text"
            :placeholder="findPage(slot) ? '' : slot.defaultUrl"
            class="flex-1 min-w-0 bg-[#1a1a35] text-[9px] text-gray-300 placeholder-gray-700 rounded px-1.5 py-0.5 border border-white/10 focus:outline-none focus:border-blue-500/50 font-mono truncate"
          />
          <span v-else class="flex-1 text-[9px] text-purple-400 font-medium truncate">⚡ Apply Bot</span>

          <!-- Login state dot -->
          <span v-if="slot.id !== 99 && findPage(slot)"
            class="w-1.5 h-1.5 rounded-full flex-shrink-0" :class="loginStateColor[loginState(slot)]"
            :title="loginStateLabel[loginState(slot)]" />

          <!-- Actions -->
          <button v-if="findPage(slot)" @click.stop="refreshFrame(slot.id)"
            class="text-gray-600 hover:text-white text-[9px] flex-shrink-0 px-0.5 transition-colors" title="Refresh">↻</button>
          <button v-if="findPage(slot)" @click.stop="fullSlot = fullSlot?.id === slot.id ? null : slot"
            class="text-gray-600 hover:text-white text-[9px] flex-shrink-0 px-0.5 transition-colors" title="Expand">⛶</button>
          <button v-else @click.stop="openCam(slot, $event)" :disabled="opening[slot.id]"
            class="text-[9px] text-gray-600 hover:text-blue-400 disabled:opacity-40 flex-shrink-0 transition-colors">
            {{ opening[slot.id] ? '…' : 'Load' }}
          </button>
        </div>

        <!-- ── Content: iframe or placeholder ── -->
        <div class="flex-1 relative overflow-hidden bg-[#0d0d1a]" style="min-height:0">

          <!-- Loaded: iframe for all slots (MJPEG only in fullscreen) -->
          <iframe
            v-if="findPage(slot)"
            :src="frameUrl(slot.id, frameKeys[slot.id] || 0)"
            :key="`frame-${slot.id}-${frameKeys[slot.id] || 0}`"
            class="absolute inset-0 w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            referrerpolicy="no-referrer"
            loading="lazy"
          />

          <!-- Loading spinner -->
          <div v-else-if="opening[slot.id]"
            class="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div class="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
            <span class="text-[8px] text-gray-600">Loading…</span>
          </div>

          <!-- Not loaded placeholder -->
          <div v-else class="absolute inset-0 flex flex-col items-center justify-center gap-2 cursor-pointer"
            @click="openCam(slot)">
            <div class="w-7 h-7 rounded-lg flex items-center justify-center opacity-15"
              :style="{ background: slot.color }">
              <span class="text-white text-xs font-bold">{{ slot.label[0] }}</span>
            </div>
            <span class="text-[8px] text-gray-700">Click to load</span>
          </div>

          <!-- Not-logged-in bar -->
          <div v-if="findPage(slot) && slot.id !== 99 && loginState(slot) === 'out'"
            class="absolute bottom-0 inset-x-0 bg-orange-900/80 backdrop-blur-sm py-1 px-2 flex items-center justify-between z-10">
            <span class="text-[8px] text-orange-300">Not logged in</span>
            <button @click.stop="goToLogin(slot)"
              class="text-[8px] text-orange-200 bg-orange-600/50 hover:bg-orange-600 px-1.5 py-0.5 rounded transition-colors">
              Login →
            </button>
          </div>

          <!-- Cloudflare blocked bar -->
          <div v-if="findPage(slot) && slot.id !== 99 && loginState(slot) === 'blocked'"
            class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-[#0d0d1a]/90 z-10">
            <span class="text-base">🚫</span>
            <span class="text-[8px] text-red-400 font-medium">Blocked by Cloudflare</span>
            <span class="text-[7px] text-gray-600">Headless browser detected</span>
            <button @click.stop="openInEdge(slot)" :disabled="opening[slot.id]"
              class="mt-1 text-[8px] text-white bg-blue-600/70 hover:bg-blue-600 px-2 py-1 rounded transition-colors disabled:opacity-40">
              {{ opening[slot.id] ? 'Opening…' : '⚡ Open in Real Edge' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Fullscreen / expanded tab view ────────────────────────────── -->
    <Teleport to="body">
      <transition name="fade">
        <div v-if="fullSlot" class="fixed inset-0 z-50 bg-[#0d0d1a] flex flex-col">
          <!-- Browser chrome -->
          <div class="flex items-center gap-2 px-3 py-2 bg-[#252540] border-b border-white/10 flex-shrink-0">
            <div class="flex items-center gap-1 flex-shrink-0">
              <span class="w-3 h-3 rounded-full bg-red-500/70 cursor-pointer hover:bg-red-500" @click="fullSlot = null"></span>
              <span class="w-3 h-3 rounded-full bg-yellow-500/70"></span>
              <span class="w-3 h-3 rounded-full bg-green-500/70"></span>
            </div>
            <span class="w-3 h-3 rounded-full flex-shrink-0" :style="{ background: fullSlot.color }"></span>
            <span class="text-xs font-semibold text-white flex-shrink-0">{{ fullSlot.label }}</span>

            <!-- Full address bar -->
            <input
              v-model="addressInput[fullSlot.id]"
              @keydown="onAddressKey($event, fullSlot)"
              type="text"
              class="flex-1 bg-[#1a1a35] text-xs text-gray-200 rounded-md px-3 py-1 border border-white/10 focus:outline-none focus:border-blue-500/50 font-mono"
              :placeholder="findPage(fullSlot)?.url || fullSlot.defaultUrl"
            />

            <!-- Status badges -->
            <span v-if="fullSlot.id !== 99"
              class="px-2 py-0.5 rounded-full text-[9px] font-medium border flex-shrink-0"
              :class="{
                'bg-green-500/15 text-green-400 border-green-500/20':   loginState(fullSlot) === 'in',
                'bg-orange-500/15 text-orange-400 border-orange-500/20': loginState(fullSlot) === 'out',
                'bg-red-500/15 text-red-400 border-red-500/20':          loginState(fullSlot) === 'blocked',
                'bg-gray-500/15 text-gray-400 border-gray-500/20':       loginState(fullSlot) === 'unknown',
              }">
              {{ loginStateLabel[loginState(fullSlot)] }}
            </span>
            <button v-if="fullSlot.id !== 99 && loginState(fullSlot) === 'blocked'"
              @click="openInEdge(fullSlot)"
              class="px-2 py-1 rounded text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/40 flex-shrink-0 transition-colors">
              ⚡ Real Edge
            </button>
            <button v-else-if="fullSlot.id !== 99 && loginState(fullSlot) !== 'in' && LOGIN_CONFIG[fullSlot.id] && !LOGIN_CONFIG[fullSlot.id].noLogin"
              @click="goToLogin(fullSlot)"
              class="px-2 py-1 rounded text-[10px] bg-orange-500/20 text-orange-300 border border-orange-500/30 hover:bg-orange-500/40 flex-shrink-0 transition-colors">
              → Login
            </button>
            <span v-if="findPage(fullSlot)"
              class="px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[9px] font-medium border border-green-500/20 flex-shrink-0">LIVE</span>
            <button @click="refreshFrame(fullSlot.id)"
              class="text-gray-500 hover:text-white text-sm px-2 py-1 rounded hover:bg-white/10 flex-shrink-0 transition-colors">↻</button>
            <button @click="fullSlot = null"
              class="text-gray-500 hover:text-white text-sm px-2 py-1 rounded hover:bg-white/10 flex-shrink-0 transition-colors">✕</button>
          </div>

          <!-- Full-page MJPEG stream — relay interaction works here (click/scroll/type) -->
          <div class="flex-1 relative overflow-hidden bg-black"
            tabindex="-1" @keydown="onStreamKeydown($event, fullSlot)">
            <template v-if="findPage(fullSlot)">
              <img
                ref="streamImg"
                :src="streamUrl(fullSlot.id)"
                class="w-full h-full object-contain cursor-crosshair select-none"
                @click="onStreamClick($event, fullSlot)"
                @wheel.prevent="onStreamScroll($event, fullSlot)"
                draggable="false"
              />
              <div class="absolute bottom-3 right-3 text-[9px] text-white/30 font-mono pointer-events-none">
                click · scroll · type to interact
              </div>
            </template>
            <div v-else class="w-full h-full flex flex-col items-center justify-center gap-4 text-gray-600">
              <span class="text-5xl">🌐</span>
              <span class="text-sm">{{ fullSlot.label }} not loaded</span>
              <button @click="openCam(fullSlot)"
                class="px-4 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 transition-colors">
                {{ opening[fullSlot.id] ? 'Loading…' : 'Load Site' }}
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- ── Login status panel ─────────────────────────────────────────── -->
    <Teleport to="body">
      <transition name="slide-right">
        <div v-if="showLoginPanel"
          class="fixed right-0 top-0 h-full w-72 z-40 bg-[#1e1e3a] border-l border-white/10 flex flex-col shadow-2xl">
          <div class="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span class="text-sm font-semibold text-white">🔐 Login Status</span>
            <button @click="showLoginPanel = false" class="text-gray-500 hover:text-white text-xs px-2 py-1 rounded hover:bg-white/10">✕</button>
          </div>
          <div class="flex-1 overflow-y-auto p-3 space-y-2">
            <div v-for="slot in jobSlotsAll" :key="slot.id"
              class="rounded-lg border p-3 transition-all"
              :class="{
                'border-green-500/20 bg-green-500/5':  loginState(slot) === 'in',
                'border-orange-500/20 bg-orange-500/5': loginState(slot) === 'out',
                'border-red-500/20 bg-red-500/5':      loginState(slot) === 'blocked',
                'border-white/10 bg-white/2':          loginState(slot) === 'unknown',
              }">
              <div class="flex items-center gap-2 mb-2">
                <span class="w-2 h-2 rounded-full flex-shrink-0" :style="{ background: slot.color }"></span>
                <span class="text-xs font-medium text-white flex-1">{{ slot.label }}</span>
                <span class="w-2 h-2 rounded-full flex-shrink-0" :class="loginStateColor[loginState(slot)]"></span>
              </div>
              <div class="text-[10px] mb-2"
                :class="{ 'text-green-400': loginState(slot) === 'in', 'text-orange-400': loginState(slot) === 'out', 'text-red-400': loginState(slot) === 'blocked', 'text-gray-600': loginState(slot) === 'unknown' }">
                {{ loginStateLabel[loginState(slot)] }}
                <span v-if="findPage(slot)" class="block text-gray-600 truncate font-mono mt-0.5">{{ findPage(slot)?.url }}</span>
              </div>
              <div class="flex gap-1.5">
                <button v-if="loginState(slot) !== 'in' && LOGIN_CONFIG[slot.id] && !LOGIN_CONFIG[slot.id].noLogin"
                  @click="goToLogin(slot)" :disabled="opening[slot.id]"
                  class="flex-1 px-2 py-1 rounded text-[10px] font-medium bg-orange-500/20 text-orange-300 hover:bg-orange-500/40 border border-orange-500/30 transition-colors disabled:opacity-40">
                  {{ opening[slot.id] ? 'Opening…' : '→ Go Login' }}
                </button>
                <button v-if="findPage(slot)" @click="fullSlot = slot; showLoginPanel = false"
                  class="flex-1 px-2 py-1 rounded text-[10px] bg-white/10 text-gray-300 hover:bg-white/20 border border-white/10 transition-colors">
                  View
                </button>
                <button v-else @click="openCam(slot)" :disabled="opening[slot.id]"
                  class="flex-1 px-2 py-1 rounded text-[10px] bg-white/10 text-gray-300 hover:bg-white/20 border border-white/10 transition-colors disabled:opacity-40">
                  {{ opening[slot.id] ? 'Loading…' : 'Load' }}
                </button>
              </div>
            </div>
          </div>
          <div class="p-3 border-t border-white/10 space-y-2">
            <p class="text-[10px] text-gray-500 leading-relaxed">
              "Go Login" opens the login page in fullscreen — interact to sign in, then Sync to persist the session.
            </p>
            <button @click="syncSessions" :disabled="syncing"
              class="w-full px-3 py-2 rounded-lg border border-purple-600/40 text-purple-400 hover:text-white text-xs transition-colors disabled:opacity-40">
              {{ syncing ? 'Syncing…' : '🔑 Sync Login from Edge' }}
            </button>
          </div>
        </div>
      </transition>
      <transition name="fade">
        <div v-if="showLoginPanel" class="fixed inset-0 z-30 bg-black/40" @click="showLoginPanel = false" />
      </transition>
    </Teleport>

  </div>
</template>

<style scoped>
.slide-right-enter-active, .slide-right-leave-active { transition: transform 0.2s ease; }
.slide-right-enter-from, .slide-right-leave-to { transform: translateX(100%); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>

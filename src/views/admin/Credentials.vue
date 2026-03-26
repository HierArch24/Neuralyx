<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'
import type { Credential } from '@/types/database'
import * as OTPAuth from 'otpauth'
import QRCode from 'qrcode'

const admin = useAdminStore()

// ─── Auth ───
const authStep = ref<'pin' | 'totp-setup' | 'totp-verify' | 'unlocked'>('pin')
const pinInput = ref('')
const pinError = ref(false)
const PIN = '041926'
const TOTP_KEY = 'neuralyx_totp_secret'
const totpInput = ref('')
const totpError = ref(false)
const qrDataUrl = ref('')
const totpSecret = ref('')

function getTOTP(s: string) {
  return new OTPAuth.TOTP({ issuer: 'NEURALYX', label: 'Credentials Vault', algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(s) })
}
function submitPin() {
  if (pinInput.value === PIN) {
    pinError.value = false
    const s = localStorage.getItem(TOTP_KEY)
    s ? (authStep.value = 'totp-verify') : doSetupTotp()
  } else { pinError.value = true; pinInput.value = '' }
}
async function doSetupTotp() {
  const secret = new OTPAuth.Secret({ size: 20 })
  const totp = new OTPAuth.TOTP({ issuer: 'NEURALYX', label: 'Credentials Vault', algorithm: 'SHA1', digits: 6, period: 30, secret })
  totpSecret.value = secret.base32
  qrDataUrl.value = await QRCode.toDataURL(totp.toString(), { width: 220, margin: 2, color: { dark: '#ffffffee', light: '#00000000' } })
  authStep.value = 'totp-setup'
}
function confirmSetup() {
  if (getTOTP(totpSecret.value).validate({ token: totpInput.value, window: 1 }) !== null) {
    localStorage.setItem(TOTP_KEY, totpSecret.value); totpError.value = false; unlock()
  } else { totpError.value = true; totpInput.value = '' }
}
function verifyTotp() {
  if (getTOTP(localStorage.getItem(TOTP_KEY)!).validate({ token: totpInput.value, window: 1 }) !== null) {
    totpError.value = false; unlock()
  } else { totpError.value = true; totpInput.value = '' }
}
function unlock() { authStep.value = 'unlocked'; admin.fetchCredentials() }
function resetTotp() {
  if (confirm('Remove 2FA? You will scan a new QR code.')) { localStorage.removeItem(TOTP_KEY); totpInput.value = ''; doSetupTotp() }
}

// ─── Constants ───
const CRED_TYPES = [
  { value: 'api_key', label: 'API Key', icon: '🔑' },
  { value: 'oauth_token', label: 'OAuth Token', icon: '🎟️' },
  { value: 'client_id', label: 'Client ID', icon: '🆔' },
  { value: 'client_secret', label: 'Client Secret', icon: '🔒' },
  { value: 'bearer_token', label: 'Bearer Token', icon: '🎫' },
  { value: 'access_key', label: 'Access Key', icon: '🗝️' },
  { value: 'secret_key', label: 'Secret Key', icon: '🔐' },
  { value: 'password', label: 'Password', icon: '🔓' },
  { value: 'pat', label: 'PAT', icon: '🎫' },
  { value: 'webhook_url', label: 'Webhook URL', icon: '🪝' },
  { value: 'endpoint', label: 'Endpoint', icon: '🌐' },
  { value: 'username', label: 'Username', icon: '👤' },
  { value: 'url', label: 'URL', icon: '🔗' },
  { value: 'other', label: 'Other', icon: '📎' },
]

const STATUSES = [
  { value: 'active', label: 'Active', color: 'bg-green-500/20 text-green-400', dot: 'bg-green-400' },
  { value: 'in_use', label: 'In Use', color: 'bg-blue-500/20 text-blue-400', dot: 'bg-blue-400' },
  { value: 'not_configured', label: 'Not Configured', color: 'bg-yellow-500/20 text-yellow-400', dot: 'bg-yellow-400' },
  { value: 'expired', label: 'Expired', color: 'bg-red-500/20 text-red-400', dot: 'bg-red-400' },
  { value: 'quota_exceeded', label: 'Quota Exceeded', color: 'bg-orange-500/20 text-orange-400', dot: 'bg-orange-400' },
  { value: 'inactive', label: 'Inactive', color: 'bg-gray-500/20 text-gray-400', dot: 'bg-gray-400' },
  { value: 'revoked', label: 'Revoked', color: 'bg-red-500/20 text-red-300', dot: 'bg-red-300' },
]

const getStatus = (s: string) => STATUSES.find(x => x.value === s) || STATUSES[0]
const typeIcon = (t: string) => CRED_TYPES.find(x => x.value === t)?.icon || '📎'
const typeLabel = (t: string) => CRED_TYPES.find(x => x.value === t)?.label || t

// ─── State ───
const searchQuery = ref('')
const filterStatus = ref('')
const expandedCompanies = ref<Set<string>>(new Set())
const showCredModal = ref(false)
const credModalKey = ref('')
const showFormModal = ref(false)
const editing = ref<Credential | null>(null)
const revealedIds = ref<Set<string>>(new Set())
const copiedId = ref<string | null>(null)

const form = ref({
  company: '', service: '', description: '', label: '',
  type: 'api_key', value: '', status: 'active', notes: '',
  utilized_by: '',
})

onMounted(() => { if (authStep.value === 'unlocked') admin.fetchCredentials() })

// ─── Data structures ───
interface ServiceGroup { service: string; description: string; status: string; credentials: Credential[] }
interface CompanyGroup { company: string; services: ServiceGroup[]; totalCreds: number }

const companyGroups = computed((): CompanyGroup[] => {
  let creds = admin.credentials
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    creds = creds.filter(c =>
      c.company.toLowerCase().includes(q) || c.service.toLowerCase().includes(q) ||
      c.label.toLowerCase().includes(q) || (c.description?.toLowerCase().includes(q)) ||
      (c.utilized_by?.toLowerCase().includes(q)) || c.type.toLowerCase().includes(q)
    )
  }
  if (filterStatus.value) creds = creds.filter(c => c.status === filterStatus.value)

  const compMap = new Map<string, Map<string, ServiceGroup>>()
  for (const c of creds) {
    if (!compMap.has(c.company)) compMap.set(c.company, new Map())
    const svcMap = compMap.get(c.company)!
    if (!svcMap.has(c.service)) {
      svcMap.set(c.service, { service: c.service, description: c.description || '', status: c.status, credentials: [] })
    }
    svcMap.get(c.service)!.credentials.push(c)
    // Use worst status for the service
    const svc = svcMap.get(c.service)!
    const priority = ['revoked', 'expired', 'quota_exceeded', 'not_configured', 'inactive', 'in_use', 'active']
    if (priority.indexOf(c.status) < priority.indexOf(svc.status)) svc.status = c.status
  }

  return [...compMap.entries()].map(([company, svcMap]) => ({
    company,
    services: [...svcMap.values()].sort((a, b) => a.service.localeCompare(b.service)),
    totalCreds: [...svcMap.values()].reduce((sum, s) => sum + s.credentials.length, 0),
  })).sort((a, b) => a.company.localeCompare(b.company))
})

const companies = computed(() => [...new Set(admin.credentials.map(c => c.company))].sort())

const modalCredentials = computed(() => {
  if (!credModalKey.value) return []
  const [company, service] = credModalKey.value.split('::')
  return admin.credentials.filter(c => c.company === company && c.service === service)
})
const modalGroup = computed(() => {
  if (!credModalKey.value) return null
  const [company, service] = credModalKey.value.split('::')
  for (const cg of companyGroups.value) {
    if (cg.company === company) {
      return cg.services.find(s => s.service === service) || null
    }
  }
  return null
})

// ─── Actions ───
function toggleCompany(company: string) {
  if (expandedCompanies.value.has(company)) expandedCompanies.value.delete(company)
  else expandedCompanies.value.add(company)
}

function viewCredentials(company: string, service: string) {
  credModalKey.value = `${company}::${service}`
  revealedIds.value.clear()
  showCredModal.value = true
}

function maskValue(v: string) {
  if (v.length <= 8) return '••••••••'
  return v.slice(0, 4) + '••••' + v.slice(-4)
}
function toggleReveal(id: string) {
  revealedIds.value.has(id) ? revealedIds.value.delete(id) : revealedIds.value.add(id)
}
async function copyValue(cred: Credential) {
  await navigator.clipboard.writeText(cred.value)
  copiedId.value = cred.id
  setTimeout(() => { copiedId.value = null }, 2000)
}

function openCreate(company?: string, service?: string) {
  editing.value = null
  form.value = { company: company || '', service: service || '', description: '', label: '', type: 'api_key', value: '', status: 'active', notes: '', utilized_by: '' }
  showFormModal.value = true
}
function openEdit(cred: Credential) {
  editing.value = cred
  form.value = {
    company: cred.company, service: cred.service, description: cred.description || '',
    label: cred.label, type: cred.type, value: cred.value, status: cred.status,
    notes: cred.notes || '', utilized_by: cred.utilized_by || '',
  }
  showFormModal.value = true
}
async function handleSave() {
  const payload: Record<string, unknown> = {
    company: form.value.company,
    service: form.value.service,
    description: form.value.description || null,
    label: form.value.label,
    type: form.value.type,
    value: form.value.value,
    status: form.value.status,
    notes: form.value.notes || null,
  }
  // Only include utilized_by if filled (column may not exist yet)
  if (form.value.utilized_by) payload.utilized_by = form.value.utilized_by
  try {
    if (editing.value) await admin.updateRow('credentials', editing.value.id, payload)
    else await admin.insertRow('credentials', payload)
    showFormModal.value = false
    await admin.fetchCredentials()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    // If utilized_by column missing, retry without it
    if (msg.includes('utilized_by')) {
      delete payload.utilized_by
      if (editing.value) await admin.updateRow('credentials', editing.value.id, payload)
      else await admin.insertRow('credentials', payload)
      showFormModal.value = false
      await admin.fetchCredentials()
    } else {
      alert(`Save failed: ${msg}`)
    }
  }
}
async function handleDelete(cred: Credential) {
  if (confirm(`Delete "${cred.label}" from ${cred.service}?`)) {
    await admin.deleteRow('credentials', cred.id)
    await admin.fetchCredentials()
  }
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return 'Never'
  const d = new Date(dateStr)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div>
    <!-- ═══ PIN ═══ -->
    <div v-if="authStep === 'pin'" class="flex items-center justify-center min-h-[70vh]">
      <div class="glass-dark rounded-xl p-8 w-full max-w-sm border border-neural-600 text-center">
        <div class="w-16 h-16 rounded-full bg-cyber-purple/20 flex items-center justify-center mx-auto mb-5">
          <svg class="w-8 h-8 text-cyber-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
        </div>
        <h3 class="text-xl font-bold text-white mb-2">Credentials Vault</h3>
        <p class="text-sm text-gray-400 mb-6">Enter PIN to access</p>
        <form @submit.prevent="submitPin">
          <input v-model="pinInput" type="password" maxlength="6" placeholder="Enter PIN" autofocus
            class="w-full px-4 py-3 bg-neural-800 border rounded-lg text-white text-center text-lg tracking-[0.5em] font-mono focus:outline-none transition-colors"
            :class="pinError ? 'border-red-500 shake' : 'border-neural-600 focus:border-cyber-purple'" @input="pinError = false" />
          <p v-if="pinError" class="text-red-400 text-xs mt-2">Incorrect PIN.</p>
          <button type="submit" class="w-full mt-4 px-4 py-2.5 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-sm font-medium hover:opacity-90">Continue</button>
        </form>
      </div>
    </div>
    <!-- ═══ TOTP Setup ═══ -->
    <div v-else-if="authStep === 'totp-setup'" class="flex items-center justify-center min-h-[70vh]">
      <div class="glass-dark rounded-xl p-8 w-full max-w-md border border-neural-600 text-center">
        <div class="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-5">
          <svg class="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
        </div>
        <h3 class="text-xl font-bold text-white mb-2">Setup 2FA</h3>
        <p class="text-sm text-gray-400 mb-5">Scan with Google Authenticator</p>
        <div class="flex justify-center mb-4"><img v-if="qrDataUrl" :src="qrDataUrl" alt="QR" class="rounded-lg" /></div>
        <details class="mb-5 text-left">
          <summary class="text-xs text-gray-500 cursor-pointer hover:text-gray-300">Manual key</summary>
          <code class="block mt-2 px-3 py-2 bg-neural-900 rounded text-xs text-gray-300 font-mono break-all select-all">{{ totpSecret }}</code>
        </details>
        <form @submit.prevent="confirmSetup">
          <input v-model="totpInput" type="text" inputmode="numeric" maxlength="6" placeholder="000000" autofocus
            class="w-full px-4 py-3 bg-neural-800 border rounded-lg text-white text-center text-lg tracking-[0.5em] font-mono focus:outline-none"
            :class="totpError ? 'border-red-500 shake' : 'border-neural-600 focus:border-cyber-purple'" @input="totpError = false" />
          <p v-if="totpError" class="text-red-400 text-xs mt-2">Invalid code.</p>
          <button type="submit" class="w-full mt-4 px-4 py-2.5 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-lg text-sm font-medium hover:opacity-90">Verify & Enable 2FA</button>
        </form>
      </div>
    </div>
    <!-- ═══ TOTP Verify ═══ -->
    <div v-else-if="authStep === 'totp-verify'" class="flex items-center justify-center min-h-[70vh]">
      <div class="glass-dark rounded-xl p-8 w-full max-w-sm border border-neural-600 text-center">
        <div class="w-16 h-16 rounded-full bg-cyber-cyan/20 flex items-center justify-center mx-auto mb-5">
          <svg class="w-8 h-8 text-cyber-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
        </div>
        <h3 class="text-xl font-bold text-white mb-2">Two-Factor Authentication</h3>
        <p class="text-sm text-gray-400 mb-6">Enter code from Google Authenticator</p>
        <form @submit.prevent="verifyTotp">
          <input v-model="totpInput" type="text" inputmode="numeric" maxlength="6" placeholder="000000" autofocus
            class="w-full px-4 py-3 bg-neural-800 border rounded-lg text-white text-center text-lg tracking-[0.5em] font-mono focus:outline-none"
            :class="totpError ? 'border-red-500 shake' : 'border-neural-600 focus:border-cyber-purple'" @input="totpError = false" />
          <p v-if="totpError" class="text-red-400 text-xs mt-2">Invalid code.</p>
          <button type="submit" class="w-full mt-4 px-4 py-2.5 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-sm font-medium hover:opacity-90">Verify</button>
        </form>
        <button @click="resetTotp" class="mt-4 text-xs text-gray-600 hover:text-gray-400">Lost access? Reset 2FA</button>
      </div>
    </div>

    <!-- ═══════════════════════════════════ MAIN ═══════════════════════════════════ -->
    <template v-else>

    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-white">Client Credentials</h2>
        <p class="text-sm text-gray-400 mt-1">{{ companyGroups.length }} companies &middot; {{ admin.credentials.length }} credentials</p>
      </div>
      <button @click="openCreate()" class="px-4 py-2 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-sm font-medium hover:opacity-90 flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
        Add Credential
      </button>
    </div>

    <!-- Filters -->
    <div class="flex gap-3 mb-6">
      <div class="flex-1 relative">
        <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input v-model="searchQuery" type="text" placeholder="Search companies, services, labels, utilized by..."
          class="w-full pl-10 pr-4 py-2.5 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm placeholder-gray-500 focus:border-cyber-purple focus:outline-none" />
      </div>
      <select v-model="filterStatus" class="px-3 py-2.5 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none">
        <option value="">All Status</option>
        <option v-for="s in STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>
    </div>

    <!-- Empty -->
    <div v-if="companyGroups.length === 0 && !admin.loading" class="text-center py-20">
      <div class="text-5xl mb-4">🔐</div>
      <h3 class="text-xl font-semibold text-white mb-2">No credentials found</h3>
      <p class="text-gray-400 mb-6">{{ admin.credentials.length === 0 ? 'Add your first credential.' : 'No results match your filters.' }}</p>
      <button v-if="admin.credentials.length === 0" @click="openCreate()" class="px-6 py-2.5 bg-cyber-purple hover:bg-cyber-purple/80 text-white rounded-lg text-sm font-medium">Add First Credential</button>
    </div>

    <!-- ─── Company Accordion ─── -->
    <div v-else class="space-y-3">
      <div v-for="cg in companyGroups" :key="cg.company" class="glass-dark rounded-xl overflow-hidden border border-neural-700/50">

        <!-- Company Header (click to expand) -->
        <button @click="toggleCompany(cg.company)"
          class="w-full flex items-center justify-between px-5 py-4 hover:bg-neural-700/30 transition-colors text-left">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-cyber-purple/30 to-cyber-cyan/20 flex items-center justify-center text-lg font-bold text-cyber-purple shrink-0">
              {{ cg.company.charAt(0) }}
            </div>
            <div>
              <h3 class="text-white font-semibold">{{ cg.company }}</h3>
              <p class="text-xs text-gray-500">{{ cg.services.length }} service{{ cg.services.length > 1 ? 's' : '' }} &middot; {{ cg.totalCreds }} credential{{ cg.totalCreds > 1 ? 's' : '' }}</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <button @click.stop="openCreate(cg.company)" class="p-1.5 rounded-lg hover:bg-neural-600 text-gray-500 hover:text-cyber-cyan transition-colors" title="Add credential">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
            </button>
            <svg class="w-5 h-5 text-gray-500 transition-transform duration-200" :class="expandedCompanies.has(cg.company) ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        <!-- Services Table (accordion content) -->
        <div v-if="expandedCompanies.has(cg.company)" class="border-t border-neural-700/50">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-neural-800/40">
                <th class="text-left px-5 py-2.5 text-gray-500 font-medium text-xs uppercase tracking-wider w-8">#</th>
                <th class="text-left px-5 py-2.5 text-gray-500 font-medium text-xs uppercase tracking-wider">Service</th>
                <th class="text-left px-5 py-2.5 text-gray-500 font-medium text-xs uppercase tracking-wider">Description</th>
                <th class="text-left px-5 py-2.5 text-gray-500 font-medium text-xs uppercase tracking-wider">Status</th>
                <th class="text-center px-5 py-2.5 text-gray-500 font-medium text-xs uppercase tracking-wider">Keys</th>
                <th class="text-center px-5 py-2.5 text-gray-500 font-medium text-xs uppercase tracking-wider">Credentials</th>
                <th class="text-right px-5 py-2.5 text-gray-500 font-medium text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(svc, idx) in cg.services" :key="svc.service"
                class="border-t border-neural-700/30 hover:bg-neural-700/20 transition-colors">
                <td class="px-5 py-3 text-gray-600 text-xs">{{ idx + 1 }}</td>
                <td class="px-5 py-3 text-white font-medium">{{ svc.service }}</td>
                <td class="px-5 py-3 text-gray-400 text-xs max-w-[180px] truncate">{{ svc.description || '—' }}</td>
                <td class="px-5 py-3">
                  <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium" :class="getStatus(svc.status).color">
                    <span class="w-1.5 h-1.5 rounded-full" :class="getStatus(svc.status).dot"></span>
                    {{ getStatus(svc.status).label }}
                  </span>
                </td>
                <td class="px-5 py-3 text-center">
                  <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-neural-700/60 text-xs text-gray-300">{{ svc.credentials.length }}</span>
                </td>
                <td class="px-5 py-3 text-center">
                  <button @click="viewCredentials(cg.company, svc.service)"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyber-purple/10 hover:bg-cyber-purple/20 text-cyber-purple text-xs font-medium transition-colors">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    View
                  </button>
                </td>
                <td class="px-5 py-3 text-right">
                  <button @click="openCreate(cg.company, svc.service)" class="p-1.5 rounded-lg hover:bg-neural-600 text-gray-500 hover:text-cyber-cyan transition-colors" title="Add to this service">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    </template>

    <!-- ═══ View Credentials Floating Window ═══ -->
    <Teleport to="body">
      <div v-if="showCredModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="showCredModal = false">
        <div class="glass-dark rounded-xl w-full max-w-3xl border border-neural-600 max-h-[85vh] flex flex-col">
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-neural-700 shrink-0">
            <div>
              <h3 class="text-lg font-bold text-white flex items-center gap-2">
                {{ modalGroup?.service }}
                <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium" :class="getStatus(modalGroup?.status || 'active').color">
                  <span class="w-1.5 h-1.5 rounded-full" :class="getStatus(modalGroup?.status || 'active').dot"></span>
                  {{ getStatus(modalGroup?.status || 'active').label }}
                </span>
              </h3>
              <p class="text-xs text-gray-500 mt-0.5">{{ modalGroup?.description }}</p>
            </div>
            <div class="flex items-center gap-2">
              <button @click="openCreate(credModalKey.split('::')[0], credModalKey.split('::')[1])"
                class="p-2 rounded-lg hover:bg-neural-600 text-gray-400 hover:text-cyber-cyan transition-colors" title="Add credential">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
              </button>
              <button @click="showCredModal = false" class="p-2 rounded-lg hover:bg-neural-600 text-gray-400 hover:text-white transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          <!-- Credentials List -->
          <div class="flex-1 overflow-y-auto p-5 space-y-3">
            <div v-for="cred in modalCredentials" :key="cred.id"
              class="bg-neural-800/60 rounded-lg border border-neural-700/50 overflow-hidden">
              <!-- Cred Header -->
              <div class="flex items-center justify-between px-4 py-3">
                <div class="flex items-center gap-3 min-w-0">
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-neural-700/60 text-xs shrink-0">
                    <span>{{ typeIcon(cred.type) }}</span>
                    <span class="text-gray-400">{{ typeLabel(cred.type) }}</span>
                  </span>
                  <span class="text-white text-sm font-medium truncate">{{ cred.label }}</span>
                  <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium" :class="getStatus(cred.status).color">
                    <span class="w-1 h-1 rounded-full" :class="getStatus(cred.status).dot"></span>
                    {{ getStatus(cred.status).label }}
                  </span>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <button @click="toggleReveal(cred.id)" class="p-1.5 rounded hover:bg-neural-600 text-gray-500 hover:text-white transition-colors" :title="revealedIds.has(cred.id) ? 'Hide' : 'Reveal'">
                    <svg v-if="!revealedIds.has(cred.id)" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  </button>
                  <button @click="copyValue(cred)" class="p-1.5 rounded hover:bg-neural-600 transition-colors"
                    :class="copiedId === cred.id ? 'text-green-400' : 'text-gray-500 hover:text-white'">
                    <svg v-if="copiedId !== cred.id" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                  </button>
                  <button @click="openEdit(cred)" class="p-1.5 rounded hover:bg-neural-600 text-gray-500 hover:text-cyber-cyan transition-colors" title="Edit">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button @click="handleDelete(cred)" class="p-1.5 rounded hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors" title="Delete">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
              <!-- Value -->
              <div class="px-4 pb-3">
                <code class="block text-xs px-3 py-2 bg-neural-900 rounded font-mono break-all select-all"
                  :class="revealedIds.has(cred.id) ? 'text-gray-200' : 'text-gray-500 tracking-wider'">
                  {{ revealedIds.has(cred.id) ? cred.value : maskValue(cred.value) }}
                </code>
              </div>
              <!-- Meta row -->
              <div class="flex items-center gap-4 px-4 pb-3 text-[11px] text-gray-600">
                <span v-if="cred.utilized_by" class="flex items-center gap-1">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.172 13.828a4 4 0 015.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" /></svg>
                  Used by: <span class="text-gray-400">{{ cred.utilized_by }}</span>
                </span>
                <span class="flex items-center gap-1">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Last used: <span class="text-gray-400">{{ timeAgo(cred.last_used_at) }}</span>
                </span>
                <span v-if="cred.notes" class="flex items-center gap-1 truncate">
                  <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                  <span class="text-gray-400 truncate">{{ cred.notes }}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ═══ Add/Edit Modal ═══ -->
    <Teleport to="body">
      <div v-if="showFormModal" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" @click.self="showFormModal = false">
        <div class="glass-dark rounded-xl p-6 w-full max-w-lg border border-neural-600 max-h-[90vh] overflow-y-auto">
          <h3 class="text-lg font-bold text-white mb-5">{{ editing ? 'Edit' : 'Add' }} Credential</h3>
          <form @submit.prevent="handleSave" class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs text-gray-400 mb-1">Company</label>
                <input v-model="form.company" required list="co-list" placeholder="e.g. LIVITI"
                  class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
                <datalist id="co-list"><option v-for="c in companies" :key="c" :value="c" /></datalist>
              </div>
              <div>
                <label class="block text-xs text-gray-400 mb-1">Service</label>
                <input v-model="form.service" required placeholder="e.g. Supabase, OpenAI..."
                  class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
              </div>
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Service Description</label>
              <input v-model="form.description" placeholder="e.g. Cloud Database, Workflow Automation..."
                class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs text-gray-400 mb-1">Label</label>
                <input v-model="form.label" required placeholder="e.g. API Key, Access Token..."
                  class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
              </div>
              <div>
                <label class="block text-xs text-gray-400 mb-1">Type</label>
                <select v-model="form.type" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none">
                  <option v-for="t in CRED_TYPES" :key="t.value" :value="t.value">{{ t.icon }} {{ t.label }}</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Value</label>
              <textarea v-model="form.value" required rows="2" placeholder="Paste key, token, or secret..."
                class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm font-mono focus:border-cyber-purple focus:outline-none resize-none" />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs text-gray-400 mb-1">Status</label>
                <select v-model="form.status" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none">
                  <option v-for="s in STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-gray-400 mb-1">Utilized By</label>
                <input v-model="form.utilized_by" placeholder="e.g. LIVITI Content Engine, NEURALYX..."
                  class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
              </div>
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Notes <span class="text-gray-600">(optional)</span></label>
              <input v-model="form.notes" placeholder="e.g. Expires Mar 2026, rate-limited..."
                class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
            </div>
            <div class="flex justify-end gap-3 pt-2">
              <button type="button" @click="showFormModal = false" class="px-4 py-2 bg-neural-700 text-gray-300 rounded-lg text-sm hover:bg-neural-600 transition-colors">Cancel</button>
              <button type="submit" class="px-4 py-2 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-sm font-medium hover:opacity-90">{{ editing ? 'Update' : 'Save' }}</button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.shake { animation: shake 0.4s ease-in-out; }
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-6px); }
  40%, 80% { transform: translateX(6px); }
}
</style>

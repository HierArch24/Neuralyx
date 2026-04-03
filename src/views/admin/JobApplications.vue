<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'
import type { JobApplication } from '@/types/database'

const admin = useAdminStore()
const filterStatus = ref('')
const filterChannel = ref('')
const searchQuery = ref('')
const currentPage = ref(1)
const perPage = 15
const showEdit = ref(false)
const editApp = ref<JobApplication | null>(null)
const showDetail = ref(false)
const detailApp = ref<JobApplication | null>(null)
const editForm = ref({ status: '', channel: '', agency_name: '', notes: '', salary_offered: '', follow_up_at: '' })

const PIPELINE = [
  { group: 'Application', stage: '1', statuses: ['applying', 'applied', 'apply_failed'], color: 'bg-blue-500', text: 'text-blue-400', bg: 'bg-blue-500/15' },
  { group: 'JD Validation', stage: '1.6', statuses: ['jd_validated', 'jd_blocked', 'jd_method_violation'], color: 'bg-indigo-500', text: 'text-indigo-400', bg: 'bg-indigo-500/15' },
  { group: 'Delivery Check', stage: '2', statuses: ['delivery_pending', 'delivery_confirmed', 'delivery_failed'], color: 'bg-sky-500', text: 'text-sky-400', bg: 'bg-sky-500/15' },
  { group: 'Screening', stage: '3', statuses: ['under_review', 'screened_out', 'phone_screen', 'endorsed'], color: 'bg-cyan-500', text: 'text-cyan-400', bg: 'bg-cyan-500/15' },
  { group: 'Pre-Assessment', stage: '4', statuses: ['video_intro', 'pre_screen_questions', 'portfolio_review', 'pre_assessment_passed'], color: 'bg-teal-500', text: 'text-teal-400', bg: 'bg-teal-500/15' },
  { group: 'Assessment', stage: '5', statuses: ['technical_test', 'test_submitted', 'test_passed', 'test_failed', 'take_home_project', 'case_study'], color: 'bg-yellow-500', text: 'text-yellow-400', bg: 'bg-yellow-500/15' },
  { group: 'Client Match', stage: '6', statuses: ['profile_sent', 'client_reviewing', 'client_approved', 'client_rejected'], color: 'bg-violet-500', text: 'text-violet-400', bg: 'bg-violet-500/15' },
  { group: 'Interview', stage: '7', statuses: ['interview_scheduled', 'interview_round_1', 'interview_round_2', 'interview_round_3', 'interview_passed', 'interview_failed'], color: 'bg-purple-500', text: 'text-purple-400', bg: 'bg-purple-500/15' },
  { group: 'Offer', stage: '8', statuses: ['offer_received', 'negotiating', 'offer_accepted', 'offer_declined', 'offer_withdrawn'], color: 'bg-green-500', text: 'text-green-400', bg: 'bg-green-500/15' },
  { group: 'Onboarding', stage: '9', statuses: ['pending_start', 'documents_submitted', 'account_setup', 'training', 'onboarded'], color: 'bg-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  { group: 'Closed', stage: '10', statuses: ['withdrawn', 'ghosted', 'position_filled', 'no_response_timeout', 'jd_method_violation', 'submission_failed', 'screening_rejected', 'assessment_failed', 'no_client_match', 'interview_rejected', 'offer_declined', 'offer_withdrawn', 'accepted_elsewhere'], color: 'bg-red-500', text: 'text-red-400', bg: 'bg-red-500/15' },
]

onMounted(() => { admin.fetchJobApplications(); admin.fetchJobListings() })

const filtered = computed(() => {
  let apps = [...admin.jobApplications]
  if (filterStatus.value) apps = apps.filter(a => a.status === filterStatus.value)
  if (filterChannel.value) apps = apps.filter(a => a.channel === filterChannel.value)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    apps = apps.filter(a => {
      const job = getJob(a.job_listing_id)
      return job?.title.toLowerCase().includes(q) || job?.company.toLowerCase().includes(q) || a.notes?.toLowerCase().includes(q)
    })
  }
  return apps.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
})

const totalPages = computed(() => Math.ceil(filtered.value.length / perPage))
const paginated = computed(() => filtered.value.slice((currentPage.value - 1) * perPage, currentPage.value * perPage))

function getJob(id: string) { return admin.jobListings.find(j => j.id === id) }

function getStatusInfo(s: string) {
  for (const p of PIPELINE) { if (p.statuses.includes(s)) return p }
  return PIPELINE[0]
}

function getStageIndex(s: string): number {
  for (let i = 0; i < PIPELINE.length; i++) { if (PIPELINE[i].statuses.includes(s)) return i }
  return 0
}

// Pipeline progress for a single application
function pipelineProgress(app: JobApplication) {
  const stageIdx = getStageIndex(app.status)
  return PIPELINE.map((stage, idx) => ({
    ...stage,
    active: idx === stageIdx,
    completed: idx < stageIdx,
    future: idx > stageIdx,
  }))
}

function daysSince(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / 86400000) }

function openEdit(app: JobApplication) {
  editApp.value = app
  editForm.value = {
    status: app.status, channel: app.channel, agency_name: app.agency_name || '',
    notes: app.notes || '', salary_offered: app.salary_offered ? String(app.salary_offered) : '',
    follow_up_at: app.follow_up_at ? app.follow_up_at.split('T')[0] : '',
  }
  showEdit.value = true
}

function openDetail(app: JobApplication) { detailApp.value = app; showDetail.value = true }

async function saveEdit() {
  if (!editApp.value) return
  await admin.updateRow('job_applications', editApp.value.id, {
    status: editForm.value.status, channel: editForm.value.channel,
    agency_name: editForm.value.agency_name || null, notes: editForm.value.notes || null,
    salary_offered: editForm.value.salary_offered ? Number(editForm.value.salary_offered) : null,
    follow_up_at: editForm.value.follow_up_at || null,
  })
  showEdit.value = false; await admin.fetchJobApplications()
}

async function deleteApp(app: JobApplication) {
  if (confirm('Remove this application?')) { await admin.deleteRow('job_applications', app.id); await admin.fetchJobApplications() }
}
</script>

<template>
  <div>
    <!-- Stage Summary Cards -->
    <div class="flex gap-2 mb-5 overflow-x-auto pb-1">
      <button v-for="p in PIPELINE" :key="p.group" @click="filterStatus = filterStatus === p.statuses[0] ? '' : p.statuses[0]"
        class="glass-dark rounded-lg px-3 py-2 border min-w-[90px] shrink-0 cursor-pointer transition-colors text-center"
        :class="filterStatus && p.statuses.includes(filterStatus) ? 'border-cyber-purple/40' : 'border-neural-700/30 hover:border-neural-600'">
        <p class="text-[9px] text-gray-500 uppercase">{{ p.group }}</p>
        <p class="text-lg font-bold" :class="p.text">{{ admin.jobApplications.filter(a => p.statuses.includes(a.status)).length }}</p>
      </button>
    </div>

    <!-- Filters -->
    <div class="flex gap-3 mb-4 items-center">
      <div class="flex-1 relative">
        <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input v-model="searchQuery" @input="currentPage = 1" placeholder="Search by job title, company..."
          class="w-full pl-10 pr-4 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm placeholder-gray-500 focus:border-cyber-purple focus:outline-none" />
      </div>
      <select v-model="filterChannel" @change="currentPage = 1" class="px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none">
        <option value="">All Channels</option>
        <option value="direct">Direct</option><option value="agency">Agency</option><option value="freelance">Freelance</option>
      </select>
      <select v-model="filterStatus" @change="currentPage = 1" class="px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none">
        <option value="">All Statuses</option>
        <optgroup v-for="p in PIPELINE" :key="p.group" :label="p.group">
          <option v-for="s in p.statuses" :key="s" :value="s">{{ s.replace(/_/g, ' ') }}</option>
        </optgroup>
      </select>
      <span class="text-[10px] text-gray-500 shrink-0">{{ filtered.length }} applications</span>
    </div>

    <!-- Empty -->
    <div v-if="filtered.length === 0" class="text-center py-16 glass-dark rounded-xl border border-neural-700/50">
      <div class="text-4xl mb-3">📋</div>
      <h3 class="text-lg font-semibold text-white mb-2">No applications</h3>
      <p class="text-gray-500 text-sm">Apply to jobs from the Jobs page to start tracking.</p>
    </div>

    <!-- Applications List -->
    <div v-else class="space-y-3">
      <div v-for="app in paginated" :key="app.id"
        class="glass-dark rounded-xl border border-neural-700/50 overflow-hidden hover:border-neural-600 transition-colors">
        <!-- Top row: job info + status -->
        <div class="flex items-center justify-between px-4 py-3">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <div class="w-9 h-9 rounded-lg flex items-center justify-center text-sm shrink-0" :class="getStatusInfo(app.status).bg">
              {{ app.channel === 'agency' ? '🏢' : app.channel === 'freelance' ? '💻' : '📨' }}
            </div>
            <div class="min-w-0">
              <p class="text-sm text-white font-medium truncate">{{ getJob(app.job_listing_id)?.title || '—' }}</p>
              <p class="text-[10px] text-gray-500">{{ getJob(app.job_listing_id)?.company || '' }} · {{ app.platform }} · {{ app.channel }}{{ app.agency_name ? ` (${app.agency_name})` : '' }}</p>
            </div>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <div class="text-right">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-medium capitalize" :class="getStatusInfo(app.status).bg + ' ' + getStatusInfo(app.status).text">{{ app.status.replace(/_/g, ' ') }}</span>
              <p class="text-[9px] text-gray-600 mt-0.5">{{ daysSince(app.created_at) }}d since applied</p>
            </div>
            <div class="flex gap-0.5">
              <button @click="openDetail(app)" class="p-1.5 rounded-lg hover:bg-neural-600 text-gray-500 hover:text-white transition-colors" title="Pipeline Report">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              </button>
              <button @click="openEdit(app)" class="p-1.5 rounded-lg hover:bg-neural-600 text-gray-500 hover:text-cyber-cyan transition-colors" title="Edit">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </button>
              <button @click="deleteApp(app)" class="p-1.5 rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors" title="Delete">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        </div>
        <!-- Pipeline progress bar -->
        <div class="px-4 pb-3">
          <div class="flex items-center gap-0.5">
            <template v-for="(stage, idx) in pipelineProgress(app)" :key="stage.group">
              <div class="flex-1 h-1.5 rounded-full transition-colors"
                :class="stage.completed ? stage.color : stage.active ? stage.color + ' animate-pulse' : 'bg-neural-700/40'" />
              <div v-if="idx < pipelineProgress(app).length - 1" class="w-0.5" />
            </template>
          </div>
          <div class="flex justify-between mt-1">
            <span class="text-[8px] text-gray-600">Applied</span>
            <span class="text-[8px] text-gray-600">Onboarded</span>
          </div>
        </div>
        <!-- Notes / follow-up -->
        <div v-if="app.notes || app.follow_up_at" class="px-4 pb-3 flex gap-4">
          <p v-if="app.notes" class="text-[10px] text-gray-500 truncate flex-1">{{ app.notes }}</p>
          <p v-if="app.follow_up_at" class="text-[10px] shrink-0" :class="new Date(app.follow_up_at) < new Date() ? 'text-red-400' : 'text-yellow-400'">
            Follow-up: {{ new Date(app.follow_up_at).toLocaleDateString() }}{{ new Date(app.follow_up_at) < new Date() ? ' (OVERDUE)' : '' }}
          </p>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-between mt-4">
      <p class="text-[10px] text-gray-500">{{ (currentPage - 1) * perPage + 1 }}-{{ Math.min(currentPage * perPage, filtered.length) }} of {{ filtered.length }}</p>
      <div class="flex items-center gap-1">
        <button @click="currentPage--" :disabled="currentPage === 1" class="px-2.5 py-1 rounded text-xs bg-neural-700 text-gray-400 hover:text-white disabled:opacity-30">&larr;</button>
        <button v-for="pg in totalPages" :key="pg" @click="currentPage = pg"
          class="w-7 h-7 rounded text-[10px] font-medium" :class="pg === currentPage ? 'bg-cyber-purple/20 text-cyber-purple' : 'text-gray-500 hover:text-white'">{{ pg }}</button>
        <button @click="currentPage++" :disabled="currentPage === totalPages" class="px-2.5 py-1 rounded text-xs bg-neural-700 text-gray-400 hover:text-white disabled:opacity-30">&rarr;</button>
      </div>
    </div>

    <!-- ═══ Pipeline Report Modal ═══ -->
    <Teleport to="body">
      <div v-if="showDetail && detailApp" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="showDetail = false">
        <div class="glass-dark rounded-xl w-full max-w-2xl border border-neural-600 max-h-[90vh] flex flex-col">
          <div class="px-6 py-4 border-b border-neural-700 shrink-0">
            <h3 class="text-lg font-bold text-white">Pipeline Status Report</h3>
            <p class="text-sm text-gray-400">{{ getJob(detailApp.job_listing_id)?.title }} at {{ getJob(detailApp.job_listing_id)?.company }}</p>
            <p v-if="(detailApp as any).auto_applied" class="text-[10px] text-cyber-purple mt-1 flex items-center gap-1">
              <span>🤖</span> Auto-applied by AI Agent
            </p>
          </div>
          <div class="flex-1 overflow-y-auto p-6 space-y-4">
            <!-- Current Status -->
            <div class="text-center py-3">
              <span class="px-4 py-1.5 rounded-full text-sm font-medium capitalize" :class="getStatusInfo(detailApp.status).bg + ' ' + getStatusInfo(detailApp.status).text">{{ detailApp.status.replace(/_/g, ' ') }}</span>
              <p class="text-xs text-gray-500 mt-2">{{ daysSince(detailApp.created_at) }} days in pipeline</p>
            </div>

            <!-- Stage-by-stage pipeline -->
            <div class="space-y-1">
              <div v-for="stage in pipelineProgress(detailApp)" :key="stage.group"
                class="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors"
                :class="stage.active ? 'bg-neural-700/40 ring-1 ring-neural-600' : ''">
                <div class="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                  :class="stage.completed ? stage.color + ' text-white' : stage.active ? stage.color + ' text-white animate-pulse' : 'bg-neural-700/50 text-gray-600'">
                  {{ stage.completed ? '✓' : stage.stage }}
                </div>
                <div class="flex-1">
                  <p class="text-xs font-medium" :class="stage.completed ? 'text-white' : stage.active ? 'text-white' : 'text-gray-600'">{{ stage.group }}</p>
                  <p v-if="stage.active" class="text-[10px]" :class="stage.text">Current stage — {{ detailApp.status.replace(/_/g, ' ') }}</p>
                </div>
                <span v-if="stage.completed" class="text-[10px] text-green-400">Done</span>
                <span v-else-if="stage.active" class="text-[10px]" :class="stage.text">Active</span>
                <span v-else class="text-[10px] text-gray-700">Pending</span>
              </div>
            </div>

            <!-- Key Info -->
            <div class="grid grid-cols-3 gap-2 pt-3 border-t border-neural-700">
              <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                <p class="text-[9px] text-gray-500 uppercase">Channel</p>
                <p class="text-xs text-white capitalize">{{ detailApp.channel }}{{ detailApp.agency_name ? ` — ${detailApp.agency_name}` : '' }}</p>
              </div>
              <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                <p class="text-[9px] text-gray-500 uppercase">Applied Via</p>
                <p class="text-xs text-white capitalize">{{ detailApp.applied_via || '—' }}</p>
              </div>
              <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                <p class="text-[9px] text-gray-500 uppercase">JD Compliance</p>
                <p class="text-xs text-green-400">Validated</p>
              </div>
              <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                <p class="text-[9px] text-gray-500 uppercase">Salary Offered</p>
                <p class="text-xs" :class="detailApp.salary_offered ? 'text-green-400' : 'text-gray-500'">{{ detailApp.salary_offered ? `${detailApp.salary_currency} ${detailApp.salary_offered.toLocaleString()}` : '—' }}</p>
              </div>
              <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                <p class="text-[9px] text-gray-500 uppercase">Follow-up</p>
                <p class="text-xs" :class="detailApp.follow_up_at ? (new Date(detailApp.follow_up_at) < new Date() ? 'text-red-400' : 'text-yellow-400') : 'text-gray-500'">
                  {{ detailApp.follow_up_at ? new Date(detailApp.follow_up_at).toLocaleDateString() : '—' }}
                </p>
              </div>
              <div class="bg-neural-800/50 rounded-lg p-3 border border-neural-700/30">
                <p class="text-[9px] text-gray-500 uppercase">Days in Pipeline</p>
                <p class="text-xs text-white">{{ daysSince(detailApp.created_at) }}d</p>
              </div>
            </div>

            <!-- Application Log (if auto-applied) -->
            <div v-if="(detailApp as any).apply_log?.length" class="pt-3 border-t border-neural-700">
              <p class="text-[9px] text-gray-500 uppercase mb-2">Application Log</p>
              <div class="space-y-1 max-h-[120px] overflow-y-auto">
                <div v-for="(log, i) in (detailApp as any).apply_log" :key="i" class="flex items-center gap-2 text-[10px]">
                  <span :class="log.status === 'done' ? 'text-green-400' : log.status === 'failed' ? 'text-red-400' : 'text-gray-400'">{{ log.status === 'done' ? '✓' : log.status === 'failed' ? '✗' : '•' }}</span>
                  <span class="text-gray-300">{{ log.step }}</span>
                  <span class="text-gray-600 ml-auto">{{ log.message }}</span>
                </div>
              </div>
            </div>

            <!-- Notes -->
            <div v-if="detailApp.notes" class="pt-3 border-t border-neural-700">
              <p class="text-[9px] text-gray-500 uppercase mb-1">Notes</p>
              <p class="text-xs text-gray-300">{{ detailApp.notes }}</p>
            </div>

            <!-- Actions -->
            <div class="flex gap-3 pt-3 border-t border-neural-700">
              <button @click="openEdit(detailApp); showDetail = false" class="px-4 py-2 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-sm font-medium hover:opacity-90">Update Status</button>
              <a v-if="getJob(detailApp.job_listing_id)?.url" :href="getJob(detailApp.job_listing_id)?.url" target="_blank" class="px-4 py-2 bg-neural-700 text-gray-300 rounded-lg text-sm hover:bg-neural-600">View Job</a>
            </div>
          </div>
          <div class="px-6 py-3 border-t border-neural-700 shrink-0">
            <button @click="showDetail = false" class="w-full py-2 bg-neural-700 text-gray-300 rounded-lg text-sm hover:bg-neural-600">Close</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ═══ Edit Modal ═══ -->
    <Teleport to="body">
      <div v-if="showEdit" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" @click.self="showEdit = false">
        <div class="glass-dark rounded-xl p-6 w-full max-w-md border border-neural-600">
          <h3 class="text-sm font-bold text-white mb-4">Update Application</h3>
          <form @submit.prevent="saveEdit" class="space-y-4">
            <div>
              <label class="block text-[10px] text-gray-400 mb-1 uppercase">Status</label>
              <select v-model="editForm.status" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none">
                <optgroup v-for="p in PIPELINE" :key="p.group" :label="p.group">
                  <option v-for="s in p.statuses" :key="s" :value="s">{{ s.replace(/_/g, ' ') }}</option>
                </optgroup>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-[10px] text-gray-400 mb-1 uppercase">Channel</label><select v-model="editForm.channel" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none"><option value="direct">Direct</option><option value="agency">Agency</option><option value="freelance">Freelance</option></select></div>
              <div><label class="block text-[10px] text-gray-400 mb-1 uppercase">Agency</label><input v-model="editForm.agency_name" placeholder="Agency name..." class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" /></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-[10px] text-gray-400 mb-1 uppercase">Salary Offered</label><input v-model="editForm.salary_offered" type="number" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" /></div>
              <div><label class="block text-[10px] text-gray-400 mb-1 uppercase">Follow-up</label><input v-model="editForm.follow_up_at" type="date" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" /></div>
            </div>
            <div><label class="block text-[10px] text-gray-400 mb-1 uppercase">Notes</label><textarea v-model="editForm.notes" rows="3" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none resize-none" /></div>
            <div class="flex justify-end gap-2">
              <button type="button" @click="showEdit = false" class="px-4 py-2 bg-neural-700 text-gray-300 rounded-lg text-xs">Cancel</button>
              <button type="submit" class="px-4 py-2 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-xs font-medium hover:opacity-90">Save</button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

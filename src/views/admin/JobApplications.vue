<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'
import type { JobApplication } from '@/types/database'

const admin = useAdminStore()
const filterStatus = ref('')
const filterChannel = ref('')
const showEdit = ref(false)
const editApp = ref<JobApplication | null>(null)
const editForm = ref({ status: '', channel: '', agency_name: '', notes: '', salary_offered: '', follow_up_at: '' })

const PIPELINE = [
  { group: 'Discovery', statuses: ['new', 'saved', 'dismissed'], color: 'text-gray-400' },
  { group: 'Application', statuses: ['applying', 'applied', 'apply_failed'], color: 'text-blue-400' },
  { group: 'Screening', statuses: ['under_review', 'screened_out', 'phone_screen', 'endorsed'], color: 'text-cyan-400' },
  { group: 'Assessment', statuses: ['technical_test', 'test_submitted', 'test_passed', 'test_failed'], color: 'text-yellow-400' },
  { group: 'Client Match', statuses: ['profile_sent', 'client_reviewing', 'client_approved', 'client_rejected'], color: 'text-violet-400' },
  { group: 'Interview', statuses: ['interview_scheduled', 'interview_round_1', 'interview_round_2', 'interview_round_3', 'interview_passed', 'interview_failed'], color: 'text-purple-400' },
  { group: 'Offer', statuses: ['offer_received', 'negotiating', 'offer_accepted', 'offer_declined'], color: 'text-green-400' },
  { group: 'Onboarding', statuses: ['pending_start', 'documents_submitted', 'onboarded'], color: 'text-emerald-400' },
  { group: 'Closed', statuses: ['withdrawn', 'ghosted', 'position_filled'], color: 'text-red-400' },
]

onMounted(() => { admin.fetchJobApplications(); admin.fetchJobListings() })

const filtered = computed(() => {
  let apps = [...admin.jobApplications]
  if (filterStatus.value) apps = apps.filter(a => a.status === filterStatus.value)
  if (filterChannel.value) apps = apps.filter(a => a.channel === filterChannel.value)
  return apps.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
})

function getJob(id: string) { return admin.jobListings.find(j => j.id === id) }

function statusColor(s: string) {
  for (const p of PIPELINE) { if (p.statuses.includes(s)) return p.color }
  return 'text-gray-400'
}

function statusBg(s: string) {
  const colorMap: Record<string, string> = {
    'text-gray-400': 'bg-gray-500/15', 'text-blue-400': 'bg-blue-500/15', 'text-cyan-400': 'bg-cyan-500/15',
    'text-yellow-400': 'bg-yellow-500/15', 'text-violet-400': 'bg-violet-500/15', 'text-purple-400': 'bg-purple-500/15',
    'text-green-400': 'bg-green-500/15', 'text-emerald-400': 'bg-emerald-500/15', 'text-red-400': 'bg-red-500/15',
  }
  return colorMap[statusColor(s)] || 'bg-gray-500/15'
}

function openEdit(app: JobApplication) {
  editApp.value = app
  editForm.value = {
    status: app.status, channel: app.channel, agency_name: app.agency_name || '',
    notes: app.notes || '', salary_offered: app.salary_offered ? String(app.salary_offered) : '',
    follow_up_at: app.follow_up_at ? app.follow_up_at.split('T')[0] : '',
  }
  showEdit.value = true
}

async function saveEdit() {
  if (!editApp.value) return
  await admin.updateRow('job_applications', editApp.value.id, {
    status: editForm.value.status, channel: editForm.value.channel,
    agency_name: editForm.value.agency_name || null, notes: editForm.value.notes || null,
    salary_offered: editForm.value.salary_offered ? Number(editForm.value.salary_offered) : null,
    follow_up_at: editForm.value.follow_up_at || null,
  })
  showEdit.value = false
  await admin.fetchJobApplications()
}

async function deleteApp(app: JobApplication) {
  if (confirm(`Remove this application?`)) {
    await admin.deleteRow('job_applications', app.id)
    await admin.fetchJobApplications()
  }
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days < 7) return `${days}d ago`
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-white">Applications</h2>
        <p class="text-sm text-gray-400 mt-1">{{ admin.jobApplications.length }} total applications</p>
      </div>
      <div class="flex gap-3">
        <select v-model="filterChannel" class="px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none">
          <option value="">All Channels</option>
          <option value="direct">Direct</option>
          <option value="agency">Agency</option>
          <option value="freelance">Freelance</option>
        </select>
        <select v-model="filterStatus" class="px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-xs focus:border-cyber-purple focus:outline-none">
          <option value="">All Statuses</option>
          <optgroup v-for="p in PIPELINE" :key="p.group" :label="p.group">
            <option v-for="s in p.statuses" :key="s" :value="s">{{ s.replace(/_/g, ' ') }}</option>
          </optgroup>
        </select>
      </div>
    </div>

    <!-- Stage Summary Cards -->
    <div class="flex gap-2 mb-6 overflow-x-auto pb-2">
      <div v-for="p in PIPELINE" :key="p.group"
        class="glass-dark rounded-lg px-3 py-2 border border-neural-700/30 min-w-[100px] shrink-0 cursor-pointer hover:border-neural-600 transition-colors"
        @click="filterStatus = filterStatus === p.statuses[0] ? '' : p.statuses[0]">
        <p class="text-[10px] text-gray-500">{{ p.group }}</p>
        <p class="text-lg font-bold" :class="p.color">{{ admin.jobApplications.filter(a => p.statuses.includes(a.status)).length }}</p>
      </div>
    </div>

    <!-- Empty -->
    <div v-if="filtered.length === 0" class="text-center py-16 glass-dark rounded-xl border border-neural-700/50">
      <div class="text-4xl mb-3">📋</div>
      <h3 class="text-lg font-semibold text-white mb-2">No applications</h3>
      <p class="text-gray-500 text-sm">Apply to jobs from the Search page.</p>
    </div>

    <!-- Table -->
    <div v-else class="glass-dark rounded-xl overflow-hidden border border-neural-700/50">
      <table class="w-full text-sm">
        <thead class="bg-neural-700/40">
          <tr>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase w-8">#</th>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase">Job</th>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase">Channel</th>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase">Platform</th>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase">Status</th>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase">Via</th>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase">Applied</th>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase">Follow-up</th>
            <th class="text-left px-4 py-3 text-gray-500 font-medium text-[10px] uppercase">Notes</th>
            <th class="text-right px-4 py-3 text-gray-500 font-medium text-[10px] uppercase">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(app, idx) in filtered" :key="app.id" class="border-t border-neural-700/30 hover:bg-neural-700/20 transition-colors">
            <td class="px-4 py-3 text-gray-600 text-xs">{{ idx + 1 }}</td>
            <td class="px-4 py-3">
              <p class="text-white font-medium text-xs truncate max-w-[200px]">{{ getJob(app.job_listing_id)?.title || '—' }}</p>
              <p class="text-[10px] text-gray-500">{{ getJob(app.job_listing_id)?.company || '' }}</p>
            </td>
            <td class="px-4 py-3">
              <span class="text-xs text-gray-400 capitalize">{{ app.channel }}</span>
              <p v-if="app.agency_name" class="text-[10px] text-gray-600">{{ app.agency_name }}</p>
            </td>
            <td class="px-4 py-3 text-xs text-gray-400 capitalize">{{ app.platform }}</td>
            <td class="px-4 py-3">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-medium capitalize" :class="statusBg(app.status) + ' ' + statusColor(app.status)">
                {{ app.status.replace(/_/g, ' ') }}
              </span>
            </td>
            <td class="px-4 py-3 text-[10px] text-gray-500 capitalize">{{ app.applied_via || '—' }}</td>
            <td class="px-4 py-3 text-[10px] text-gray-500">{{ timeAgo(app.created_at) }}</td>
            <td class="px-4 py-3 text-[10px]" :class="app.follow_up_at ? 'text-yellow-400' : 'text-gray-600'">
              {{ app.follow_up_at ? new Date(app.follow_up_at).toLocaleDateString() : '—' }}
            </td>
            <td class="px-4 py-3 text-[10px] text-gray-600 max-w-[100px] truncate">{{ app.notes || '—' }}</td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-0.5">
                <button @click="openEdit(app)" class="p-1.5 rounded-lg hover:bg-neural-600 text-gray-500 hover:text-cyber-cyan transition-colors" title="Edit">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button @click="deleteApp(app)" class="p-1.5 rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors" title="Delete">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Edit Modal -->
    <Teleport to="body">
      <div v-if="showEdit" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="showEdit = false">
        <div class="glass-dark rounded-xl p-6 w-full max-w-md border border-neural-600">
          <h3 class="text-sm font-bold text-white mb-4">Update Application</h3>
          <form @submit.prevent="saveEdit" class="space-y-4">
            <div>
              <label class="block text-[10px] text-gray-400 mb-1 uppercase tracking-wider">Status</label>
              <select v-model="editForm.status" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none">
                <optgroup v-for="p in PIPELINE" :key="p.group" :label="p.group">
                  <option v-for="s in p.statuses" :key="s" :value="s">{{ s.replace(/_/g, ' ') }}</option>
                </optgroup>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[10px] text-gray-400 mb-1 uppercase tracking-wider">Channel</label>
                <select v-model="editForm.channel" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none">
                  <option value="direct">Direct</option><option value="agency">Agency</option><option value="freelance">Freelance</option>
                </select>
              </div>
              <div>
                <label class="block text-[10px] text-gray-400 mb-1 uppercase tracking-wider">Agency</label>
                <input v-model="editForm.agency_name" placeholder="Agency name..." class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[10px] text-gray-400 mb-1 uppercase tracking-wider">Salary Offered</label>
                <input v-model="editForm.salary_offered" type="number" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
              </div>
              <div>
                <label class="block text-[10px] text-gray-400 mb-1 uppercase tracking-wider">Follow-up</label>
                <input v-model="editForm.follow_up_at" type="date" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
              </div>
            </div>
            <div>
              <label class="block text-[10px] text-gray-400 mb-1 uppercase tracking-wider">Notes</label>
              <textarea v-model="editForm.notes" rows="3" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none resize-none" />
            </div>
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

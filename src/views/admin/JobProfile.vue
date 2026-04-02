<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'
// Uses admin store for portfolio data (skills, tools, projects from Supabase)

const admin = useAdminStore()

async function syncFromPortfolio() {
  await Promise.all([admin.fetchSkills(), admin.fetchTools(), admin.fetchProjects()])
  const portfolioSkills = new Set(form.value.skills)
  for (const s of admin.skills) portfolioSkills.add(s.name)
  for (const t of admin.tools) portfolioSkills.add(t.name)
  for (const p of admin.projects) {
    for (const tech of (p.tech_stack || [])) portfolioSkills.add(tech)
  }
  form.value.skills = [...portfolioSkills].sort()
  synced.value = true
  setTimeout(() => { synced.value = false }, 2000)
}

const synced = ref(false)

const saving = ref(false)
const saved = ref(false)
const newSkill = ref('')
const newKeyword = ref('')
const newExclude = ref('')
const newLocation = ref('')

const form = ref({
  title: 'AI Systems Engineer',
  skills: [] as string[],
  experience_years: 8,
  preferred_locations: [] as string[],
  preferred_job_types: ['remote', 'full-time'] as string[],
  salary_min: 0,
  salary_currency: 'PHP',
  keywords: [] as string[],
  exclude_keywords: [] as string[],
  resume_text: '',
  cover_letter_template: '',
  auto_apply_enabled: false,
  auto_apply_min_score: 75,
})

const JOB_TYPES = ['remote', 'full-time', 'part-time', 'contract', 'hybrid', 'internship']

onMounted(async () => {
  await admin.fetchJobProfile()
  if (admin.jobProfile.length > 0) {
    const p = admin.jobProfile[0]
    form.value = {
      title: p.title,
      skills: [...p.skills],
      experience_years: p.experience_years || 0,
      preferred_locations: [...p.preferred_locations],
      preferred_job_types: [...p.preferred_job_types],
      salary_min: p.salary_min || 0,
      salary_currency: p.salary_currency,
      keywords: [...p.keywords],
      exclude_keywords: [...p.exclude_keywords],
      resume_text: p.resume_text || '',
      cover_letter_template: p.cover_letter_template || '',
      auto_apply_enabled: p.auto_apply_enabled,
      auto_apply_min_score: p.auto_apply_min_score,
    }
  }
})

function addTag(arr: string[], val: { value: string }) {
  const v = val.value.trim()
  if (v && !arr.includes(v)) arr.push(v)
  val.value = ''
}
function removeTag(arr: string[], idx: number) { arr.splice(idx, 1) }

function toggleJobType(t: string) {
  const idx = form.value.preferred_job_types.indexOf(t)
  if (idx >= 0) form.value.preferred_job_types.splice(idx, 1)
  else form.value.preferred_job_types.push(t)
}

async function handleSave() {
  saving.value = true
  const payload = { ...form.value }
  try {
    if (admin.jobProfile.length > 0) {
      await admin.updateRow('job_profile', admin.jobProfile[0].id, payload)
    } else {
      await admin.insertRow('job_profile', payload)
    }
    await admin.fetchJobProfile()
    saved.value = true
    setTimeout(() => { saved.value = false }, 2000)
  } catch (e: unknown) {
    alert(`Save failed: ${e instanceof Error ? e.message : e}`)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold text-white">Job Profile & Preferences</h2>
      <div class="flex gap-2">
        <button @click="syncFromPortfolio" class="px-4 py-2 bg-neural-700 text-gray-300 rounded-lg text-sm hover:bg-neural-600 flex items-center gap-2">
          <svg v-if="!synced" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          <svg v-else class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
          {{ synced ? 'Synced!' : 'Sync from Portfolio' }}
        </button>
        <button @click="handleSave" :disabled="saving" class="px-4 py-2 bg-gradient-to-r from-cyber-purple to-cyber-cyan text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
          <svg v-if="saved" class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
          {{ saved ? 'Saved!' : saving ? 'Saving...' : 'Save Profile' }}
        </button>
      </div>
    </div>

    <div class="grid lg:grid-cols-2 gap-6">
      <!-- Left Column -->
      <div class="space-y-6">
        <!-- Basic Info -->
        <div class="glass-dark rounded-xl p-5 border border-neural-700/50">
          <h3 class="text-sm font-semibold text-white mb-4">Basic Information</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-xs text-gray-400 mb-1">Job Title</label>
              <input v-model="form.title" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs text-gray-400 mb-1">Experience (years)</label>
                <input v-model.number="form.experience_years" type="number" class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
              </div>
              <div>
                <label class="block text-xs text-gray-400 mb-1">Min Salary</label>
                <div class="flex gap-2">
                  <select v-model="form.salary_currency" class="px-2 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none w-20">
                    <option>PHP</option><option>USD</option><option>EUR</option><option>GBP</option><option>AUD</option>
                  </select>
                  <input v-model.number="form.salary_min" type="number" class="flex-1 px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Skills -->
        <div class="glass-dark rounded-xl p-5 border border-neural-700/50">
          <h3 class="text-sm font-semibold text-white mb-4">Skills</h3>
          <div class="flex flex-wrap gap-2 mb-3">
            <span v-for="(s, i) in form.skills" :key="i" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyber-purple/20 text-cyber-purple text-xs">
              {{ s }}
              <button @click="removeTag(form.skills, i)" class="hover:text-red-400">&times;</button>
            </span>
          </div>
          <div class="flex gap-2">
            <input v-model="newSkill" @keydown.enter.prevent="addTag(form.skills, newSkill as any)" placeholder="Add skill..." class="flex-1 px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
            <button @click="addTag(form.skills, newSkill as any)" class="px-3 py-2 bg-neural-700 text-gray-300 rounded-lg text-sm hover:bg-neural-600">Add</button>
          </div>
        </div>

        <!-- Job Type Preferences -->
        <div class="glass-dark rounded-xl p-5 border border-neural-700/50">
          <h3 class="text-sm font-semibold text-white mb-4">Job Type Preferences</h3>
          <div class="flex flex-wrap gap-2">
            <button v-for="t in JOB_TYPES" :key="t" @click="toggleJobType(t)"
              class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize"
              :class="form.preferred_job_types.includes(t) ? 'bg-cyber-purple/30 text-cyber-purple border border-cyber-purple/40' : 'bg-neural-700/50 text-gray-400 border border-neural-600 hover:text-white'">
              {{ t }}
            </button>
          </div>
        </div>

        <!-- Locations -->
        <div class="glass-dark rounded-xl p-5 border border-neural-700/50">
          <h3 class="text-sm font-semibold text-white mb-4">Preferred Locations</h3>
          <div class="flex flex-wrap gap-2 mb-3">
            <span v-for="(l, i) in form.preferred_locations" :key="i" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-400 text-xs">
              {{ l }}
              <button @click="removeTag(form.preferred_locations, i)" class="hover:text-red-400">&times;</button>
            </span>
          </div>
          <div class="flex gap-2">
            <input v-model="newLocation" @keydown.enter.prevent="addTag(form.preferred_locations, newLocation as any)" placeholder="Add location..." class="flex-1 px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
            <button @click="addTag(form.preferred_locations, newLocation as any)" class="px-3 py-2 bg-neural-700 text-gray-300 rounded-lg text-sm hover:bg-neural-600">Add</button>
          </div>
        </div>
      </div>

      <!-- Right Column -->
      <div class="space-y-6">
        <!-- Search Keywords -->
        <div class="glass-dark rounded-xl p-5 border border-neural-700/50">
          <h3 class="text-sm font-semibold text-white mb-4">Search Keywords</h3>
          <div class="flex flex-wrap gap-2 mb-3">
            <span v-for="(k, i) in form.keywords" :key="i" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-500/20 text-green-400 text-xs">
              {{ k }}
              <button @click="removeTag(form.keywords, i)" class="hover:text-red-400">&times;</button>
            </span>
          </div>
          <div class="flex gap-2">
            <input v-model="newKeyword" @keydown.enter.prevent="addTag(form.keywords, newKeyword as any)" placeholder="e.g. AI Engineer, Vue.js..." class="flex-1 px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
            <button @click="addTag(form.keywords, newKeyword as any)" class="px-3 py-2 bg-neural-700 text-gray-300 rounded-lg text-sm hover:bg-neural-600">Add</button>
          </div>
        </div>

        <!-- Exclude Keywords -->
        <div class="glass-dark rounded-xl p-5 border border-neural-700/50">
          <h3 class="text-sm font-semibold text-white mb-4">Exclude Keywords</h3>
          <div class="flex flex-wrap gap-2 mb-3">
            <span v-for="(k, i) in form.exclude_keywords" :key="i" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/20 text-red-400 text-xs">
              {{ k }}
              <button @click="removeTag(form.exclude_keywords, i)" class="hover:text-red-400">&times;</button>
            </span>
          </div>
          <div class="flex gap-2">
            <input v-model="newExclude" @keydown.enter.prevent="addTag(form.exclude_keywords, newExclude as any)" placeholder="e.g. Senior, Lead..." class="flex-1 px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none" />
            <button @click="addTag(form.exclude_keywords, newExclude as any)" class="px-3 py-2 bg-neural-700 text-gray-300 rounded-lg text-sm hover:bg-neural-600">Add</button>
          </div>
        </div>

        <!-- Auto-Apply Settings -->
        <div class="glass-dark rounded-xl p-5 border border-neural-700/50">
          <h3 class="text-sm font-semibold text-white mb-4">Auto-Apply Settings</h3>
          <div class="space-y-4">
            <label class="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" v-model="form.auto_apply_enabled" class="w-4 h-4 rounded border-neural-600 bg-neural-800 text-cyber-purple focus:ring-cyber-purple" />
              <span class="text-sm text-white">Enable auto-apply for high-match jobs</span>
            </label>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Minimum Match Score ({{ form.auto_apply_min_score }}%)</label>
              <input v-model.number="form.auto_apply_min_score" type="range" min="50" max="100" step="5" class="w-full" />
              <div class="flex justify-between text-[10px] text-gray-600"><span>50%</span><span>75%</span><span>100%</span></div>
            </div>
          </div>
        </div>

        <!-- Resume Text -->
        <div class="glass-dark rounded-xl p-5 border border-neural-700/50">
          <h3 class="text-sm font-semibold text-white mb-4">Resume Summary <span class="text-xs text-gray-500">(used for AI matching)</span></h3>
          <textarea v-model="form.resume_text" rows="6" placeholder="Paste your resume text here for AI matching..."
            class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm font-mono focus:border-cyber-purple focus:outline-none resize-none" />
        </div>

        <!-- Cover Letter Template -->
        <div class="glass-dark rounded-xl p-5 border border-neural-700/50">
          <h3 class="text-sm font-semibold text-white mb-4">Cover Letter Template</h3>
          <textarea v-model="form.cover_letter_template" rows="6" placeholder="Write a template cover letter. Use {company}, {title}, {skills} as placeholders..."
            class="w-full px-3 py-2 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm focus:border-cyber-purple focus:outline-none resize-none" />
        </div>
      </div>
    </div>
  </div>
</template>

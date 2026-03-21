<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue'
import { RouterLink } from 'vue-router'
import { useContentStore } from '@/stores/content'

const content = useContentStore()
const isSaving = ref(false)
const saveMessage = ref('')
const showPreview = ref(false)
const activeSection = ref<string | null>(null)

interface ResumeJob {
  id: string
  title: string
  company: string
  dates: string
  bullets: string[]
}

interface ResumeSkillRow {
  label: string
  value: string
}

interface ResumeCert {
  name: string
  issuer: string
  url: string
  image: string
  _dragging?: boolean
}

interface ResumeEducation {
  degree: string
  school: string
  dates: string
}

const header = ref({ name: '', tagline: '', contact: '' })
const summary = ref('')
const jobs = ref<ResumeJob[]>([])
const projects = ref<ResumeJob[]>([])
const skills = ref<ResumeSkillRow[]>([])
const education = ref<ResumeEducation[]>([])
const certificates = ref<ResumeCert[]>([])
const competencies = ref('')

function uid() { return Math.random().toString(36).substring(2, 9) }

function parseHtml(html: string) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // Header
  const h1 = doc.querySelector('.resume-header h1')
  const contact = doc.querySelector('.contact-line')
  const tagline = doc.querySelector('.tagline')
  header.value = {
    name: h1?.textContent?.trim() || '',
    contact: contact?.textContent?.trim() || '',
    tagline: tagline?.textContent?.trim() || '',
  }

  // Sections
  const sections = doc.querySelectorAll('.resume-section')
  sections.forEach(section => {
    const heading = section.querySelector('h2')?.textContent?.trim().toUpperCase() || ''

    if (heading.includes('SUMMARY')) {
      summary.value = section.querySelector('p')?.textContent?.trim() || ''
    }

    if (heading.includes('WORK EXPERIENCE')) {
      jobs.value = parseJobs(section)
    }

    if (heading === 'PROJECTS') {
      projects.value = parseJobs(section)
    }

    if (heading.includes('TECHNICAL SKILLS')) {
      skills.value = []
      section.querySelectorAll('.skill-row').forEach(row => {
        const label = row.querySelector('strong')?.textContent?.trim() || ''
        const value = row.querySelector('span')?.textContent?.trim() || ''
        skills.value.push({ label, value })
      })
    }

    if (heading === 'EDUCATION') {
      education.value = []
      section.querySelectorAll('.job').forEach(job => {
        const degree = job.querySelector('h3')?.textContent?.trim() || ''
        const school = job.querySelector('.company-name')?.textContent?.trim() || ''
        const dates = job.querySelector('.dates')?.textContent?.trim() || ''
        education.value.push({ degree, school, dates })
      })
    }

    if (heading.includes('CERTIFICATES')) {
      certificates.value = []
      section.querySelectorAll('li').forEach(li => {
        const issuerEl = li.querySelector('.cert-issuer')
        const issuer = issuerEl?.textContent?.replace(/^—\s*/, '').trim() || ''
        const linkEl = li.querySelector('.cert-link') as HTMLElement | null
        const name = linkEl?.textContent?.trim() || li.textContent?.replace(issuerEl?.textContent || '', '').trim() || ''
        const url = linkEl?.dataset?.certUrl || ''
        const image = linkEl?.dataset?.certImage || ''
        certificates.value.push({ name, issuer, url, image })
      })
    }

    if (heading.includes('COMPETENCIES')) {
      competencies.value = section.querySelector('p')?.textContent?.trim() || ''
    }
  })
}

function parseJobs(section: Element): ResumeJob[] {
  const result: ResumeJob[] = []
  section.querySelectorAll('.job').forEach(job => {
    const title = job.querySelector('h3')?.textContent?.trim() || ''
    const company = job.querySelector('.company-name')?.textContent?.trim() || ''
    const dates = job.querySelector('.dates')?.textContent?.trim() || ''
    const bullets: string[] = []
    job.querySelectorAll('li').forEach(li => {
      bullets.push(li.textContent?.trim() || '')
    })
    result.push({ id: uid(), title, company, dates, bullets })
  })
  return result
}

function buildHtml(): string {
  const jobsHtml = jobs.value.map(j => `
    <div class="job">
      <div class="job-header">
        <div>
          <h3>${esc(j.title)}</h3>
          <p class="company-name">${esc(j.company)}</p>
        </div>
        <span class="dates">${esc(j.dates)}</span>
      </div>
      <ul>
        ${j.bullets.map(b => `<li>${esc(b)}</li>`).join('\n        ')}
      </ul>
    </div>`).join('\n')

  const projectsHtml = projects.value.length ? `
  <section class="resume-section">
    <h2>PROJECTS</h2>
${projects.value.map(p => `
    <div class="job">
      <div class="job-header">
        <div>
          <h3>${esc(p.title)}</h3>
        </div>
        <span class="dates">${esc(p.dates)}</span>
      </div>
      <ul>
        ${p.bullets.map(b => `<li>${esc(b)}</li>`).join('\n        ')}
      </ul>
    </div>`).join('\n')}
  </section>` : ''

  const skillsHtml = skills.value.map(s =>
    `      <div class="skill-row"><strong>${esc(s.label)}</strong><span>${esc(s.value)}</span></div>`
  ).join('\n')

  const eduHtml = education.value.map(e => `
    <div class="job">
      <div class="job-header">
        <div>
          <h3>${esc(e.degree)}</h3>
          <p class="company-name">${esc(e.school)}</p>
        </div>
        <span class="dates">${esc(e.dates)}</span>
      </div>
    </div>`).join('\n')

  const certsHtml = certificates.value.map(c =>
    `      <li class="cert-item"><span class="cert-info"><span class="cert-name">${esc(c.name)}</span> <span class="cert-issuer">— ${esc(c.issuer)}</span></span><button class="cert-view-btn" data-cert-image="${esc(c.image)}">View</button></li>`
  ).join('\n')

  return `<div class="resume-ats">
  <header class="resume-header">
    <h1>${esc(header.value.name)}</h1>
    <p class="contact-line">${esc(header.value.contact)}</p>
    <p class="tagline">${esc(header.value.tagline)}</p>
  </header>

  <section class="resume-section">
    <h2>PROFESSIONAL SUMMARY</h2>
    <p>${esc(summary.value)}</p>
  </section>

  <section class="resume-section">
    <h2>WORK EXPERIENCE</h2>
${jobsHtml}
  </section>
${projectsHtml}
  <section class="resume-section">
    <h2>TECHNICAL SKILLS</h2>
    <div class="skills-grid">
${skillsHtml}
    </div>
  </section>

  <section class="resume-section">
    <h2>EDUCATION</h2>
${eduHtml}
  </section>

  <section class="resume-section">
    <h2>CERTIFICATES</h2>
    <ul class="certs-list">
${certsHtml}
    </ul>
  </section>

  <section class="resume-section">
    <h2>KEY COMPETENCIES</h2>
    <p>${esc(competencies.value)}</p>
  </section>
</div>`
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function addJob() {
  jobs.value.push({ id: uid(), title: '', company: '', dates: '', bullets: [''] })
  nextTick(() => { activeSection.value = 'job-' + (jobs.value.length - 1) })
}

function removeJob(idx: number) { jobs.value.splice(idx, 1) }
function addBullet(job: ResumeJob) { job.bullets.push('') }
function removeBullet(job: ResumeJob, idx: number) { job.bullets.splice(idx, 1) }

function addProject() {
  projects.value.push({ id: uid(), title: '', company: '', dates: '', bullets: [''] })
}
function removeProject(idx: number) { projects.value.splice(idx, 1) }

function addSkillRow() { skills.value.push({ label: '', value: '' }) }
function removeSkillRow(idx: number) { skills.value.splice(idx, 1) }

function addEducation() { education.value.push({ degree: '', school: '', dates: '' }) }
function removeEducation(idx: number) { education.value.splice(idx, 1) }

// Certificates tab sync
interface CertTabEntry {
  id: string
  name: string
  issuer: string
  file: string
  isImage: boolean
  ext: string
  featured: boolean
}

const allCertsFromTab = ref<CertTabEntry[]>([])

function loadCertsFromTab() {
  const saved = localStorage.getItem('neuralyx_certificates')
  if (saved) {
    allCertsFromTab.value = JSON.parse(saved)
  }
}

function toggleCertInResume(cert: CertTabEntry) {
  cert.featured = !cert.featured
  // Save back to localStorage so Certificates tab stays in sync
  localStorage.setItem('neuralyx_certificates', JSON.stringify(allCertsFromTab.value))
  // Update the certificates ref used for HTML building
  syncCertsToResume()
}

function syncCertsToResume() {
  certificates.value = allCertsFromTab.value
    .filter(c => c.featured)
    .map(c => ({ name: c.name, issuer: c.issuer, url: '', image: c.file }))
}

function moveJob(idx: number, dir: -1 | 1) {
  const target = idx + dir
  if (target < 0 || target >= jobs.value.length) return
  const temp = jobs.value[idx]
  jobs.value[idx] = jobs.value[target]
  jobs.value[target] = temp
}

async function saveResume() {
  isSaving.value = true
  saveMessage.value = ''
  try {
    content.resumeHtml = buildHtml()
    saveMessage.value = 'Resume saved successfully!'
    setTimeout(() => { saveMessage.value = '' }, 3000)
  } catch {
    saveMessage.value = 'Error saving resume'
  } finally {
    isSaving.value = false
  }
}

const previewHtml = computed(() => buildHtml())

onMounted(() => {
  parseHtml(content.resumeHtml)
  loadCertsFromTab()
  syncCertsToResume()
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-white">Resume Editor</h2>
        <p class="text-gray-400 text-sm mt-1">Edit your ATS resume content — changes reflect in the landing page modal</p>
      </div>
      <div class="flex items-center gap-3">
        <button
          @click="showPreview = !showPreview"
          class="px-4 py-2 text-sm rounded-lg transition-colors"
          :class="showPreview ? 'bg-cyber-purple/30 text-cyber-purple' : 'bg-neural-700 text-gray-300 hover:bg-neural-600'"
        >
          {{ showPreview ? 'Hide Preview' : 'Show Preview' }}
        </button>
        <button
          @click="saveResume"
          :disabled="isSaving"
          class="px-5 py-2 bg-cyber-purple hover:bg-cyber-purple/80 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {{ isSaving ? 'Saving...' : 'Save Changes' }}
        </button>
      </div>
    </div>

    <!-- Save message -->
    <div v-if="saveMessage" class="mb-4 px-4 py-2 rounded-lg text-sm"
         :class="saveMessage.includes('Error') ? 'bg-red-900/30 text-red-400' : 'bg-green-900/30 text-green-400'">
      {{ saveMessage }}
    </div>

    <div class="grid gap-6" :class="showPreview ? 'grid-cols-2' : 'grid-cols-1'" style="min-width: 0;">
      <!-- Editor -->
      <div class="space-y-4 max-h-[80vh] overflow-y-auto overflow-x-hidden pr-2 min-w-0">

        <!-- Header -->
        <div class="bg-neural-800 rounded-xl border border-neural-600 p-5 overflow-hidden min-w-0">
          <h3 class="text-sm font-semibold text-white mb-4">Header</h3>
          <div class="space-y-3">
            <div>
              <label class="block text-xs text-gray-400 mb-1">Full Name</label>
              <input v-model="header.name" class="editor-input" />
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Contact Line</label>
              <input v-model="header.contact" class="editor-input" placeholder="email &bull; github &bull; linkedin" />
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Tagline</label>
              <input v-model="header.tagline" class="editor-input" />
            </div>
          </div>
        </div>

        <!-- Summary -->
        <div class="bg-neural-800 rounded-xl border border-neural-600 p-5 overflow-hidden min-w-0">
          <h3 class="text-sm font-semibold text-white mb-4">Professional Summary</h3>
          <textarea v-model="summary" rows="4" class="editor-input resize-none"></textarea>
        </div>

        <!-- Work Experience -->
        <div class="bg-neural-800 rounded-xl border border-neural-600 p-5 overflow-hidden min-w-0">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-semibold text-white">Work Experience</h3>
            <button @click="addJob" class="text-xs text-cyber-purple hover:text-white transition-colors">+ Add Job</button>
          </div>
          <div v-for="(job, i) in jobs" :key="job.id" class="mb-4 last:mb-0 bg-neural-900 rounded-lg p-4 border border-neural-700 overflow-hidden min-w-0">
            <div class="flex items-center justify-between mb-3">
              <button
                @click="activeSection = activeSection === 'job-'+i ? null : 'job-'+i"
                class="text-xs font-medium text-white hover:text-cyber-purple transition-colors text-left flex-1 truncate"
              >
                {{ job.title || 'Untitled Job' }} <span class="text-gray-500">— {{ job.company || '...' }}</span>
              </button>
              <div class="flex items-center gap-1 flex-shrink-0 ml-2">
                <button @click="moveJob(i, -1)" :disabled="i === 0" class="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-white disabled:opacity-20 transition-colors text-xs">&#9650;</button>
                <button @click="moveJob(i, 1)" :disabled="i === jobs.length - 1" class="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-white disabled:opacity-20 transition-colors text-xs">&#9660;</button>
                <button @click="removeJob(i)" class="w-6 h-6 flex items-center justify-center text-red-400 hover:text-red-300 transition-colors text-xs">&#10005;</button>
              </div>
            </div>
            <div v-show="activeSection === 'job-'+i" class="space-y-3">
              <input v-model="job.title" placeholder="Job Title" class="editor-input" />
              <div class="grid grid-cols-2 gap-3">
                <input v-model="job.company" placeholder="Company Name" class="editor-input" />
                <input v-model="job.dates" placeholder="Start – End" class="editor-input" />
              </div>
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="text-xs text-gray-400">Bullet Points</label>
                  <button @click="addBullet(job)" class="text-xs text-cyber-purple hover:text-white transition-colors">+ Add</button>
                </div>
                <div v-for="(_, bi) in job.bullets" :key="bi" class="flex gap-2 mb-2">
                  <span class="text-xs text-gray-600 mt-2.5 flex-shrink-0">{{ bi + 1 }}.</span>
                  <textarea v-model="job.bullets[bi]" rows="2" class="editor-input resize-none flex-1 text-xs"></textarea>
                  <button @click="removeBullet(job, bi)" class="text-red-400 hover:text-red-300 text-xs mt-1 flex-shrink-0">&#10005;</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Projects -->
        <div class="bg-neural-800 rounded-xl border border-neural-600 p-5 overflow-hidden min-w-0">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-semibold text-white">Projects</h3>
            <button @click="addProject" class="text-xs text-cyber-purple hover:text-white transition-colors">+ Add Project</button>
          </div>
          <div v-for="(proj, i) in projects" :key="proj.id" class="mb-4 last:mb-0 bg-neural-900 rounded-lg p-4 border border-neural-700 overflow-hidden min-w-0">
            <div class="flex items-center justify-between mb-3">
              <span class="text-xs font-medium text-white truncate">{{ proj.title || 'Untitled Project' }}</span>
              <button @click="removeProject(i)" class="text-red-400 hover:text-red-300 text-xs flex-shrink-0">&#10005;</button>
            </div>
            <div class="space-y-3">
              <input v-model="proj.title" placeholder="Project Title" class="editor-input" />
              <input v-model="proj.dates" placeholder="Start – End" class="editor-input" />
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="text-xs text-gray-400">Bullet Points</label>
                  <button @click="addBullet(proj)" class="text-xs text-cyber-purple hover:text-white transition-colors">+ Add</button>
                </div>
                <div v-for="(_, bi) in proj.bullets" :key="bi" class="flex gap-2 mb-2">
                  <textarea v-model="proj.bullets[bi]" rows="2" class="editor-input resize-none flex-1 text-xs"></textarea>
                  <button @click="removeBullet(proj, bi)" class="text-red-400 hover:text-red-300 text-xs mt-1 flex-shrink-0">&#10005;</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Skills -->
        <div class="bg-neural-800 rounded-xl border border-neural-600 p-5 overflow-hidden min-w-0">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-semibold text-white">Technical Skills</h3>
            <button @click="addSkillRow" class="text-xs text-cyber-purple hover:text-white transition-colors">+ Add Row</button>
          </div>
          <div v-for="(row, i) in skills" :key="i" class="flex gap-3 mb-3">
            <input v-model="row.label" placeholder="Category" class="editor-input w-36 flex-shrink-0 text-xs" />
            <input v-model="row.value" placeholder="Skills (comma separated)" class="editor-input flex-1 text-xs" />
            <button @click="removeSkillRow(i)" class="text-red-400 hover:text-red-300 text-xs flex-shrink-0">&#10005;</button>
          </div>
        </div>

        <!-- Education -->
        <div class="bg-neural-800 rounded-xl border border-neural-600 p-5 overflow-hidden min-w-0">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-semibold text-white">Education</h3>
            <button @click="addEducation" class="text-xs text-cyber-purple hover:text-white transition-colors">+ Add</button>
          </div>
          <div v-for="(edu, i) in education" :key="i" class="flex gap-3 mb-3 items-start">
            <div class="flex-1 space-y-2">
              <input v-model="edu.degree" placeholder="Degree / Program" class="editor-input text-xs" />
              <div class="grid grid-cols-2 gap-2">
                <input v-model="edu.school" placeholder="School" class="editor-input text-xs" />
                <input v-model="edu.dates" placeholder="Start – End" class="editor-input text-xs" />
              </div>
            </div>
            <button @click="removeEducation(i)" class="text-red-400 hover:text-red-300 text-xs mt-1 flex-shrink-0">&#10005;</button>
          </div>
        </div>

        <!-- Certificates (synced from Certificates tab) -->
        <div class="bg-neural-800 rounded-xl border border-neural-600 p-5 overflow-hidden min-w-0">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-white">Certificates</h3>
            <RouterLink to="/admin/certificates" class="text-[10px] text-cyber-cyan hover:text-white transition-colors">
              Manage in Certificates Tab &rarr;
            </RouterLink>
          </div>
          <p class="text-[10px] text-gray-500 mb-3">Select which certificates appear in your resume. Manage all certificates in the Certificates tab.</p>

          <div v-if="!allCertsFromTab.length" class="text-center py-6 text-gray-500 text-xs">
            No certificates found. Add them in the <RouterLink to="/admin/certificates" class="text-cyber-cyan">Certificates tab</RouterLink>.
          </div>

          <div v-for="cert in allCertsFromTab" :key="cert.id"
            class="flex items-center gap-3 p-2 rounded-lg mb-2 transition-colors cursor-pointer"
            :class="cert.featured ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-neural-900 border border-transparent hover:border-neural-600'"
            @click="toggleCertInResume(cert)">
            <div class="w-14 h-10 flex-shrink-0 rounded overflow-hidden bg-neural-700">
              <img v-if="cert.isImage" :src="cert.file" :alt="cert.name" class="w-full h-full object-cover" />
              <div v-else class="w-full h-full flex items-center justify-center text-[10px] text-gray-500 uppercase">{{ cert.ext }}</div>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-white truncate">{{ cert.name }}</p>
              <p v-if="cert.issuer" class="text-[10px] text-gray-500 truncate">{{ cert.issuer }}</p>
            </div>
            <span v-if="cert.featured" class="text-amber-400 text-sm flex-shrink-0">&#9733;</span>
            <span v-else class="text-gray-600 text-sm flex-shrink-0">&#9734;</span>
          </div>
        </div>

        <!-- Key Competencies -->
        <div class="bg-neural-800 rounded-xl border border-neural-600 p-5 overflow-hidden min-w-0">
          <h3 class="text-sm font-semibold text-white mb-4">Key Competencies</h3>
          <input v-model="competencies" class="editor-input text-xs" placeholder="Separate with &bull; symbols" />
        </div>
      </div>

      <!-- Preview -->
      <div v-if="showPreview" class="bg-neural-800 rounded-xl border border-neural-600 overflow-hidden sticky top-0">
        <div class="px-4 py-3 border-b border-neural-600">
          <span class="text-sm font-medium text-gray-300">Live Preview</span>
        </div>
        <div class="p-6 overflow-y-auto max-h-[80vh]">
          <div class="resume-render" v-html="previewHtml"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-input {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  background: rgba(15, 15, 25, 0.6);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.8rem;
  color: rgba(255,255,255,0.8);
  transition: border-color 0.2s;
}
.editor-input:focus {
  outline: none;
  border-color: rgba(139,92,246,0.5);
}
.editor-input::placeholder {
  color: rgba(255,255,255,0.2);
}
</style>

<style>
/* Mirror the resume-render styles from ResumeModal for preview */
.resume-render .resume-ats { color: rgba(255,255,255,0.8); font-family: 'Poppins', sans-serif; font-size: 0.85rem; line-height: 1.7; }
.resume-render .resume-header { text-align: center; margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.08); }
.resume-render .resume-header h1 { font-family: 'Syncopate', sans-serif; font-size: clamp(1.1rem, 2.5vw, 1.6rem); font-weight: 700; letter-spacing: 0.1em; background: linear-gradient(135deg, #8b5cf6, #22d3ee, #f59e0b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 0.5rem; }
.resume-render .contact-line { font-size: 0.75rem; color: rgba(255,255,255,0.4); }
.resume-render .tagline { font-size: 0.8rem; color: rgba(255,255,255,0.5); font-style: italic; margin-top: 0.5rem; }
.resume-render .resume-section { margin-bottom: 2rem; }
.resume-render .resume-section h2 { font-family: 'Syncopate', sans-serif; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #8b5cf6; padding-bottom: 0.5rem; margin-bottom: 1rem; border-bottom: 1px solid rgba(139,92,246,0.2); }
.resume-render .job { margin-bottom: 1.5rem; }
.resume-render .job-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
.resume-render .job-header h3 { font-size: 0.9rem; font-weight: 600; color: white; }
.resume-render .company { font-weight: 400; color: rgba(255,255,255,0.5); }
.resume-render .company-name { font-size: 0.8rem; color: rgba(34,211,238,0.7); }
.resume-render .dates { font-size: 0.75rem; color: rgba(255,255,255,0.35); white-space: nowrap; flex-shrink: 0; }
.resume-render ul { list-style: none; padding: 0; }
.resume-render ul li { position: relative; padding-left: 1.2rem; margin-bottom: 0.6rem; font-size: 0.8rem; color: rgba(255,255,255,0.6); }
.resume-render ul li::before { content: ''; position: absolute; left: 0; top: 0.55rem; width: 5px; height: 5px; border-radius: 50%; background: #8b5cf6; }
.resume-render ul li strong { color: rgba(255,255,255,0.85); }
.resume-render .skills-grid { display: flex; flex-direction: column; gap: 0.5rem; }
.resume-render .skill-row { display: flex; gap: 1rem; font-size: 0.78rem; padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.resume-render .skill-row strong { flex-shrink: 0; width: 140px; color: rgba(139,92,246,0.8); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; }
.resume-render .skill-row span { color: rgba(255,255,255,0.55); }
.resume-render .certs-list li { font-size: 0.78rem; }
.resume-render .cert-issuer { color: rgba(255,255,255,0.35); font-size: 0.7rem; }
</style>

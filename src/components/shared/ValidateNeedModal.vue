<template>
  <Teleport to="body">
    <Transition name="validate">
      <div v-if="visible" class="fixed inset-0 z-[100] flex items-center justify-center p-4" @click.self="$emit('close')">
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
        <div class="relative w-full max-w-2xl max-h-[90vh] rounded-2xl border border-white/10 overflow-hidden flex flex-col"
             style="background: rgba(12,12,22,0.98);">
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] flex-shrink-0">
            <div>
              <h2 class="text-lg font-bold text-white">Validate What You Need</h2>
              <p class="text-xs text-white/40 mt-0.5">AI-powered expertise matching</p>
            </div>
            <button @click="$emit('close')" class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center">
              <svg class="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-6" data-lenis-prevent>
            <!-- Input Phase -->
            <div v-if="!result">
              <!-- Guided Domain Selection -->
              <div class="mb-5">
                <p class="text-xs text-white/40 uppercase tracking-wider mb-3">Not sure what you need? Select a domain to get started:</p>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button v-for="d in DOMAIN_GUIDES" :key="d.id"
                    @click="toggleDomain(d.id)"
                    class="px-3 py-2 rounded-lg text-left transition-all border text-xs"
                    :class="selectedDomains.includes(d.id)
                      ? 'border-cyber-purple/50 bg-cyber-purple/10 text-white'
                      : 'border-white/10 bg-white/[0.02] text-white/50 hover:border-white/20 hover:text-white/70'">
                    <span class="text-sm">{{ d.icon }}</span>
                    <span class="ml-1.5 font-medium">{{ d.label }}</span>
                  </button>
                </div>
                <p v-if="selectedDomains.length" class="text-[10px] text-cyber-cyan mt-2">
                  Selected {{ selectedDomains.length }} domain{{ selectedDomains.length > 1 ? 's' : '' }} — describe your specific need below for a detailed analysis
                </p>
              </div>

              <!-- File Drop Zone -->
              <div
                class="rounded-xl border-2 border-dashed transition-colors mb-4 cursor-pointer"
                :class="isDragging ? 'border-cyber-purple bg-cyber-purple/5' : 'border-white/10 hover:border-white/20'"
                @dragover.prevent="isDragging = true"
                @dragleave="isDragging = false"
                @drop.prevent="handleFileDrop"
                @click="($refs.fileInput as HTMLInputElement)?.click()"
              >
                <div v-if="uploadedFile" class="p-4 flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                    :class="fileIcon.bg">{{ fileIcon.emoji }}</div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-white truncate">{{ uploadedFile.name }}</p>
                    <p class="text-[10px] text-white/40">{{ formatSize(uploadedFile.size) }} &middot; {{ fileStatus }}</p>
                  </div>
                  <button @click.stop="clearFile" class="text-white/30 hover:text-white/60 text-xs">Remove</button>
                </div>
                <div v-else class="p-5 text-center">
                  <svg class="w-7 h-7 text-white/20 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                  <p class="text-xs text-white/40">Drop PDF, Word, Excel, or text file</p>
                </div>
              </div>
              <input ref="fileInput" type="file" accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.md,.json" class="hidden" @change="handleFileSelect" />

              <!-- Text Input -->
              <textarea
                v-model="userInput"
                rows="4"
                class="w-full px-4 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-white text-sm resize-none focus:border-cyber-purple/50 focus:outline-none placeholder-white/20"
                placeholder="Describe your goal, problem, or requirements..."
              ></textarea>

              <!-- URL Input -->
              <input v-model="urlInput" placeholder="Or paste a URL (job post, project brief)..."
                class="w-full mt-3 px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-white text-xs focus:border-cyber-purple/50 focus:outline-none placeholder-white/20" />

              <!-- Analyze Button -->
              <button @click="analyze" :disabled="isAnalyzing || (!userInput.trim() && !urlInput.trim() && !fileContent && !selectedDomains.length && !uploadedFile)"
                class="w-full mt-4 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-30 transition-all flex items-center justify-center gap-2"
                style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
                <svg v-if="isAnalyzing" class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                {{ isAnalyzing ? analyzeStatus : 'Validate My Need' }}
              </button>
              <p class="text-[10px] text-white/20 text-center mt-2">Powered by GPT AI Analysis</p>
            </div>

            <!-- Result Phase -->
            <div v-else class="space-y-5">
              <!-- Overall Match -->
              <div class="text-center py-4">
                <div class="inline-flex items-center justify-center w-24 h-24 rounded-full border-4 mb-3"
                  :class="result.overall >= 80 ? 'border-green-400' : result.overall >= 60 ? 'border-amber-400' : 'border-red-400'">
                  <span class="text-3xl font-bold text-white">{{ result.overall }}%</span>
                </div>
                <p class="text-sm font-semibold text-white">VALIDATION COMPLETE</p>
                <p class="text-xs mt-1" :class="result.overall >= 80 ? 'text-green-400' : result.overall >= 60 ? 'text-amber-400' : 'text-white/40'">
                  {{ result.overall >= 80 ? 'Strong match — I can deliver exactly what you need' : result.overall >= 60 ? 'Good match — most needs align with my expertise' : 'Partial match — some areas may need external resources' }}
                </p>
              </div>

              <!-- AI Summary -->
              <div v-if="result.aiSummary" class="bg-white/[0.03] rounded-xl p-4 border border-cyber-purple/20">
                <h3 class="text-xs text-cyber-purple uppercase tracking-wider mb-2 flex items-center gap-1">
                  <span>🤖</span> AI Analysis
                </h3>
                <p class="text-sm text-white/70 whitespace-pre-line leading-relaxed">{{ result.aiSummary }}</p>
              </div>

              <!-- File Summary -->
              <div v-if="result.fileSummary" class="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                <h3 class="text-xs text-white/40 uppercase tracking-wider mb-2">Document Summary</h3>
                <p class="text-sm text-white/70 whitespace-pre-line">{{ result.fileSummary }}</p>
              </div>

              <!-- Domain Breakdown -->
              <div>
                <h3 class="text-xs text-white/40 uppercase tracking-wider mb-3">Domain Breakdown</h3>
                <div class="space-y-2">
                  <div v-for="d in result.domains" :key="d.name" class="flex items-center gap-3">
                    <span class="text-xs text-white/60 w-44 flex-shrink-0 truncate">{{ d.name }}</span>
                    <div class="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                      <div class="h-full rounded-full transition-all duration-700"
                        :class="d.match >= 80 ? 'bg-green-400' : d.match >= 50 ? 'bg-amber-400' : 'bg-white/20'"
                        :style="{ width: d.match + '%' }"></div>
                    </div>
                    <span class="text-xs font-mono w-10 text-right" :class="d.match >= 80 ? 'text-green-400' : d.match >= 50 ? 'text-amber-400' : 'text-white/30'">{{ d.match }}%</span>
                  </div>
                </div>
              </div>

              <!-- Keywords -->
              <div v-if="result.keywords.length">
                <h3 class="text-xs text-white/40 uppercase tracking-wider mb-3">Identified Keywords</h3>
                <div class="flex flex-wrap gap-1">
                  <span v-for="kw in result.keywords" :key="kw" class="px-2 py-0.5 text-[10px] rounded-full bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/20">{{ kw }}</span>
                </div>
              </div>

              <!-- What I Would Build -->
              <div>
                <h3 class="text-xs text-white/40 uppercase tracking-wider mb-3">What I Would Build</h3>
                <div class="space-y-2">
                  <div v-for="(item, i) in result.recommendations" :key="i" class="flex gap-2">
                    <span class="text-cyber-cyan text-xs mt-0.5">{{ i + 1 }}.</span>
                    <p class="text-sm text-white/70">{{ item }}</p>
                  </div>
                </div>
              </div>

              <!-- Tools -->
              <div>
                <h3 class="text-xs text-white/40 uppercase tracking-wider mb-3">Suggested Toolset</h3>
                <div class="flex flex-wrap gap-2">
                  <span v-for="tool in result.tools" :key="tool" class="px-2 py-1 text-[10px] rounded-full bg-cyber-purple/10 text-cyber-purple border border-cyber-purple/20">{{ tool }}</span>
                </div>
              </div>

              <!-- Prerequisites -->
              <div v-if="result.prerequisites.length">
                <h3 class="text-xs text-white/40 uppercase tracking-wider mb-3">Prerequisites</h3>
                <div class="space-y-1">
                  <p v-for="(p, i) in result.prerequisites" :key="i" class="text-xs"
                    :class="p.startsWith('\u2705') ? 'text-green-400' : p.startsWith('\u26a0') ? 'text-amber-400' : 'text-white/40'">{{ p }}</p>
                </div>
              </div>

              <!-- Next Steps -->
              <div class="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                <h3 class="text-xs text-white/40 uppercase tracking-wider mb-2">Next Steps</h3>
                <ol class="space-y-1 text-sm text-white/60 list-decimal list-inside">
                  <li>Schedule a 30-min discovery call</li>
                  <li>Share your current tools and systems</li>
                  <li>Define success metrics together</li>
                  <li>Receive a custom automation proposal</li>
                </ol>
              </div>

              <button @click="reset" class="w-full py-2.5 rounded-xl text-xs text-white/40 border border-white/10 hover:border-white/20 hover:text-white/60 transition-colors">
                Validate Another Need
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

defineProps<{ visible: boolean }>()
defineEmits<{ close: [] }>()

const userInput = ref('')
const urlInput = ref('')
const isAnalyzing = ref(false)
const analyzeStatus = ref('Analyzing...')
const result = ref<ValidationResult | null>(null)
const uploadedFile = ref<File | null>(null)
const fileContent = ref('')
const fileStatus = ref('')
const isDragging = ref(false)
const selectedDomains = ref<string[]>([])

interface DomainResult { name: string; match: number }
interface ValidationResult {
  overall: number
  domains: DomainResult[]
  recommendations: string[]
  tools: string[]
  prerequisites: string[]
  keywords: string[]
  fileSummary: string
  aiSummary: string
}

const DOMAIN_GUIDES = [
  { id: 'business', icon: '⚙️', label: 'Business Automation' },
  { id: 'marketing', icon: '📢', label: 'Marketing Automation' },
  { id: 'devops', icon: '🚀', label: 'DevOps & MLOps' },
  { id: 'ai', icon: '🧠', label: 'AI & Machine Learning' },
  { id: 'chatbot', icon: '💬', label: 'AI Chatbots' },
  { id: 'integration', icon: '🔗', label: 'Systems Integration' },
  { id: 'data', icon: '📊', label: 'Data & Analytics' },
]

function toggleDomain(id: string) {
  const idx = selectedDomains.value.indexOf(id)
  if (idx >= 0) selectedDomains.value.splice(idx, 1)
  else selectedDomains.value.push(id)
}

const fileIcon = computed(() => {
  if (!uploadedFile.value) return { emoji: '📄', bg: 'bg-white/10' }
  const ext = uploadedFile.value.name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return { emoji: '📕', bg: 'bg-red-500/20' }
  if (ext === 'docx' || ext === 'doc') return { emoji: '📘', bg: 'bg-blue-500/20' }
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return { emoji: '📗', bg: 'bg-green-500/20' }
  return { emoji: '📄', bg: 'bg-white/10' }
})

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

function handleFileDrop(e: DragEvent) {
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) processFile(file)
}

function handleFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) processFile(file)
}

async function processFile(file: File) {
  uploadedFile.value = file
  fileStatus.value = 'Extracting text...'
  fileContent.value = ''
  const ext = file.name.split('.').pop()?.toLowerCase()
  try {
    if (['txt', 'md', 'json', 'csv'].includes(ext || '')) {
      fileContent.value = await file.text()
    } else if (ext === 'pdf') {
      const pdfjsLib = await import('pdfjs-dist')
      const workerSrc = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc.default
      const ab = await file.arrayBuffer()
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(ab) })
      const pdf = await loadingTask.promise
      const texts: string[] = []
      for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        texts.push(content.items.map((item: any) => item.str).join(' '))
      }
      fileContent.value = texts.join('\n')
    } else if (ext === 'docx' || ext === 'doc') {
      const mammoth = await import('mammoth')
      const ab = await file.arrayBuffer()
      const r = await mammoth.extractRawText({ arrayBuffer: ab })
      fileContent.value = r.value
    } else {
      fileContent.value = await file.text().catch(() => '')
    }
    const wc = fileContent.value.split(/\s+/).filter(Boolean).length
    fileStatus.value = wc > 0 ? `${wc} words extracted` : 'Could not extract text'
  } catch {
    fileStatus.value = 'Extraction failed — type your requirements below'
  }
}

function clearFile() {
  uploadedFile.value = null
  fileContent.value = ''
  fileStatus.value = ''
}

// Domain data for keyword matching (fallback if GPT fails)
const DOMAINS = [
  { id: 'business', name: 'Business Automation', keywords: ['onboarding', 'workflow', 'process', 'operations', 'crm', 'dashboard', 'reporting', 'sop', 'manual', 'repetitive', 'data entry', 'tracking', 'hr', 'employee', 'management', 'approval', 'efficiency', 'payroll', 'invoice'], tools: ['n8n', 'Supabase', 'Vue.js', 'Python', 'REST APIs', 'Zoho Cliq'], recs: ['End-to-end workflow automation', 'Automated onboarding pipeline', 'Operational reporting dashboard', 'Cross-system data sync'], prereqs: ['Existing SOPs documented', 'Repetitive tasks identified', 'CRM/database access'] },
  { id: 'marketing', name: 'Marketing Automation', keywords: ['content', 'seo', 'blog', 'marketing', 'email', 'lead', 'campaign', 'funnel', 'conversion', 'engagement', 'newsletter', 'publish', 'article', 'audience', 'brand', 'ads', 'gohighlevel'], tools: ['n8n', 'Gemini 2.0 Flash', 'GoHighLevel', 'WordPress REST API', 'Surfer SEO'], recs: ['AI content engine with 6-agent pipeline', 'Automated lead capture & funnel', 'SEO scoring with 24 criteria', 'CMS auto-publishing'], prereqs: ['Content strategy defined', 'CRM in place', 'Target audience identified'] },
  { id: 'devops', name: 'DevOps & MLOps', keywords: ['deploy', 'ci/cd', 'docker', 'container', 'cloud', 'server', 'hosting', 'infrastructure', 'pipeline', 'monitoring', 'nginx', 'production', 'scale', 'digitalocean', 'aws', 'github actions'], tools: ['Docker', 'DigitalOcean', 'GitHub Actions', 'nginx', 'Cloudflare'], recs: ['Docker containerization', 'CI/CD via GitHub Actions', 'Cloud deployment with reverse proxy', 'Health monitoring with auto-heal'], prereqs: ['Application to deploy', 'Cloud account ready', 'Version control in place'] },
  { id: 'ai', name: 'AI & Machine Learning', keywords: ['ai', 'ml', 'machine learning', 'llm', 'agent', 'rag', 'vector', 'embedding', 'prompt', 'model', 'classification', 'prediction', 'nlp', 'deep learning', 'scoring', 'generation', 'autonomous', 'multi-agent', 'gemini', 'openai', 'gpt'], tools: ['Gemini 2.0 Flash', 'OpenAI API', 'pgvector', 'LangChain', 'n8n'], recs: ['Multi-agent AI pipeline', 'RAG with vector database', 'Custom scoring engine', 'Prompt engineering'], prereqs: ['Clear use case', 'Data available', 'LLM API access', 'Quality expectations set'] },
  { id: 'chatbot', name: 'AI Chatbots & Conversational AI', keywords: ['chatbot', 'chat', 'conversation', 'support', 'customer service', 'booking', 'appointment', 'whatsapp', 'slack', 'messaging', 'faq', 'ticket', 'helpdesk', 'bot'], tools: ['Python', 'Django', 'n8n', 'OpenAI', 'Abacus AI', 'GoHighLevel'], recs: ['AI chatbot with CRM integration', 'Automated appointment booking', 'Ticket triage & auto-response', 'Multi-platform messaging'], prereqs: ['Customer touchpoints identified', 'FAQs documented', 'Platform decided'] },
  { id: 'integration', name: 'Systems Integration & API', keywords: ['api', 'integration', 'webhook', 'connect', 'sync', 'rest', 'oauth', 'saas', 'stripe', 'xero', 'zapier', 'make', 'third party', 'data flow', 'json', 'endpoint'], tools: ['REST APIs', 'Webhooks', 'n8n', 'Zapier', 'Make.com'], recs: ['REST API integrations with OAuth', 'Webhook-based automation', 'Cross-platform data sync', 'Integration documentation'], prereqs: ['Tools list ready', 'API docs available', 'Sync needs defined'] },
  { id: 'data', name: 'Data Automation & Analytics', keywords: ['data', 'analytics', 'report', 'dashboard', 'etl', 'extract', 'transform', 'visualization', 'metrics', 'kpi', 'spreadsheet', 'database', 'sql', 'csv', 'pdf report', 'reconciliation', 'financial', 'power bi'], tools: ['Supabase', 'PostgreSQL', 'Python', 'n8n', 'Power BI'], recs: ['Automated data extraction', 'ETL pipeline', 'Real-time analytics dashboard', 'PDF report generation'], prereqs: ['Data sources identified', 'Reporting needs defined', 'Dashboard specs ready'] },
]

// Model: latest available — bump here when OpenAI ships newer
const VALIDATE_MODEL = 'gpt-5.5'

async function callGPT(input: string): Promise<string | null> {
  const apiKey = localStorage.getItem('neuralyx_openai_key') || import.meta.env.VITE_OPENAI_KEY
  if (!apiKey) {
    console.warn('[ValidateNeedModal] no OpenAI key found (localStorage:neuralyx_openai_key or VITE_OPENAI_KEY) — falling back to keyword matcher')
    return null
  }

  console.info(`[ValidateNeedModal] firing OpenAI validate request (model=${VALIDATE_MODEL})`)
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: VALIDATE_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an AI automation consultant for NEURALYX, an AI Systems Engineering firm. Analyze the user's requirements and provide a concise assessment across these 7 domains: Business Automation, Marketing Automation, DevOps & MLOps, AI & Machine Learning, AI Chatbots, Systems Integration, Data Automation.

Respond in this exact JSON format:
{
  "summary": "2-3 sentence analysis of what they need and how NEURALYX can help",
  "domains": [{"name": "Domain Name", "match": 85}],
  "recommendations": ["What I would build #1", "What I would build #2", "What I would build #3"],
  "tools": ["Tool1", "Tool2"],
  "prerequisites": ["What they need before starting"]
}

Match percentages should reflect how well NEURALYX expertise (n8n, AI agents, Docker, Vue.js, Python, LangChain, Supabase) aligns with the request. Be specific and actionable.`
          },
          { role: 'user', content: input.slice(0, 3000) }
        ],
        temperature: 0.7,
        max_tokens: 800,
      })
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error(`[ValidateNeedModal] OpenAI ${VALIDATE_MODEL} returned ${res.status}:`, errText.slice(0, 300))
      return null
    }
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || null
    console.info(`[ValidateNeedModal] OpenAI ${VALIDATE_MODEL} OK — ${(content || '').length} chars returned`)
    return content
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[ValidateNeedModal] OpenAI ${VALIDATE_MODEL} threw:`, msg)
    return null
  }
}

async function analyze() {
  isAnalyzing.value = true
  const domainContext = selectedDomains.value.length
    ? `\nUser is interested in: ${selectedDomains.value.map(id => DOMAIN_GUIDES.find(d => d.id === id)?.label).join(', ')}`
    : ''
  const fileContext = fileContent.value || (uploadedFile.value ? `[Uploaded file: ${uploadedFile.value.name}]` : '')
  const allInput = [userInput.value, urlInput.value, fileContext, domainContext].filter(Boolean).join('\n')

  if (!allInput.trim()) {
    isAnalyzing.value = false
    return
  }

  // Try GPT first
  analyzeStatus.value = 'Connecting to AI...'
  const gptResponse = await callGPT(allInput)

  let aiSummary = ''
  let gptDomains: DomainResult[] | null = null
  let gptRecs: string[] | null = null
  let gptTools: string[] | null = null
  let gptPrereqs: string[] | null = null

  if (gptResponse) {
    try {
      analyzeStatus.value = 'Processing AI response...'
      const jsonMatch = gptResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        aiSummary = parsed.summary || ''
        gptDomains = (parsed.domains || []).map((d: any) => ({ name: d.name, match: Math.min(98, d.match) }))
        gptRecs = parsed.recommendations
        gptTools = parsed.tools
        gptPrereqs = parsed.prerequisites?.map((p: string) => `✅ ${p}`)
      }
    } catch { /* parse failed, use fallback */ }
  }

  // Keyword-based fallback/supplement
  analyzeStatus.value = 'Finalizing analysis...'
  const inputLower = allInput.toLowerCase()
  const matchedKeywords: string[] = []

  const keywordDomains: DomainResult[] = DOMAINS.map(domain => {
    let hits = 0
    // Boost score if user selected this domain
    const selectedBoost = selectedDomains.value.includes(domain.id) ? 5 : 0
    domain.keywords.forEach(kw => {
      if (inputLower.includes(kw)) { hits++; if (!matchedKeywords.includes(kw)) matchedKeywords.push(kw) }
    })
    const match = Math.min(98, Math.round(((hits + selectedBoost) / Math.max(domain.keywords.length * 0.3, 1)) * 100))
    return { name: domain.name, match }
  }).sort((a, b) => b.match - a.match)

  // Merge GPT + keyword results
  const finalDomains = (gptDomains && gptDomains.length)
    ? gptDomains.map(gd => {
        const kd = keywordDomains.find(k => k.name === gd.name)
        return { name: gd.name, match: Math.round((gd.match * 0.7) + ((kd?.match || 0) * 0.3)) }
      }).sort((a, b) => b.match - a.match)
    : keywordDomains

  const topDomains = finalDomains.filter(d => d.match >= 40)
  const overall = topDomains.length
    ? Math.round(topDomains.reduce((sum, d) => sum + d.match, 0) / topDomains.length)
    : Math.max(25, finalDomains[0]?.match || 0)

  // Build recs/tools from keyword data if GPT didn't provide
  const recs: string[] = gptRecs || []
  const tools = new Set<string>(gptTools || [])
  const prereqs: string[] = gptPrereqs || []

  if (!gptRecs) {
    keywordDomains.slice(0, 3).forEach(d => {
      const domain = DOMAINS.find(dom => dom.name === d.name)!
      if (d.match >= 30) {
        domain.recs.forEach(r => { if (!recs.includes(r)) recs.push(r) })
        domain.tools.forEach(t => tools.add(t))
        prereqs.push(d.match >= 60 ? `✅ ${domain.prereqs[0]}` : `⚠️ ${domain.prereqs[0]}`)
      }
    })
  }

  // File summary
  let fileSummary = ''
  if (fileContent.value && uploadedFile.value) {
    const wc = fileContent.value.split(/\s+/).filter(Boolean).length
    fileSummary = `Analyzed "${uploadedFile.value.name}" (${wc} words). Found ${matchedKeywords.length} matching keywords.`
  }

  result.value = {
    overall,
    domains: finalDomains,
    recommendations: recs.slice(0, 6),
    tools: Array.from(tools).slice(0, 10),
    prerequisites: prereqs.slice(0, 5),
    keywords: matchedKeywords.slice(0, 15),
    fileSummary,
    aiSummary,
  }
  isAnalyzing.value = false
}

function reset() {
  result.value = null
  userInput.value = ''
  urlInput.value = ''
  selectedDomains.value = []
  clearFile()
}
</script>

<style scoped>
.validate-enter-active, .validate-leave-active { transition: opacity 0.25s ease; }
.validate-enter-from, .validate-leave-to { opacity: 0; }
</style>

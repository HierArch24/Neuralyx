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
              <p class="text-xs text-white/40 mt-0.5">Discover how my expertise aligns with your goals</p>
            </div>
            <button @click="$emit('close')" class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center">
              <svg class="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-6" data-lenis-prevent>
            <!-- Input Phase -->
            <div v-if="!result">
              <p class="text-sm text-white/60 mb-4">Describe your automation goal, upload a document, or paste a URL. I'll analyze how my expertise matches your needs.</p>

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
                <div v-else class="p-6 text-center">
                  <svg class="w-8 h-8 text-white/20 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                  <p class="text-xs text-white/40">Drop PDF, Word, Excel, or text file here</p>
                  <p class="text-[10px] text-white/20 mt-1">or click to browse</p>
                </div>
              </div>
              <input ref="fileInput" type="file" accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.md,.json" class="hidden" @change="handleFileSelect" />

              <!-- Text Input -->
              <textarea
                v-model="userInput"
                rows="5"
                class="w-full px-4 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-white text-sm resize-none focus:border-cyber-purple/50 focus:outline-none placeholder-white/20"
                placeholder="Or type your goal, problem, or requirements here...

Example: We want to automate our monthly financial reconciliation using Stripe and Xero."
              ></textarea>

              <!-- URL Input -->
              <input v-model="urlInput" placeholder="Or paste a URL (job post, project brief, system link)..."
                class="w-full mt-3 px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-white text-xs focus:border-cyber-purple/50 focus:outline-none placeholder-white/20" />

              <button @click="analyze" :disabled="isAnalyzing || (!userInput.trim() && !urlInput.trim() && !fileContent)"
                class="w-full mt-4 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-30 transition-all flex items-center justify-center gap-2"
                style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
                <svg v-if="isAnalyzing" class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                {{ isAnalyzing ? 'Analyzing your requirements...' : 'Validate My Need' }}
              </button>
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
                  {{ result.overall >= 80 ? 'Strong match — I can deliver exactly what you need' : result.overall >= 60 ? 'Good match — most of your needs align with my expertise' : 'Partial match — some areas may need external resources' }}
                </p>
              </div>

              <!-- File Summary (if file was uploaded) -->
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
                    <span class="text-[10px] w-10 text-right" :class="d.relevance === 'High' ? 'text-green-400' : d.relevance === 'Medium' ? 'text-amber-400' : 'text-white/30'">{{ d.relevance }}</span>
                  </div>
                </div>
              </div>

              <!-- Identified Keywords -->
              <div v-if="result.keywords.length">
                <h3 class="text-xs text-white/40 uppercase tracking-wider mb-3">Identified Keywords</h3>
                <div class="flex flex-wrap gap-1">
                  <span v-for="kw in result.keywords" :key="kw"
                    class="px-2 py-0.5 text-[10px] rounded-full bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/20">
                    {{ kw }}
                  </span>
                </div>
              </div>

              <!-- What I Would Build -->
              <div>
                <h3 class="text-xs text-white/40 uppercase tracking-wider mb-3">What I Would Build For You</h3>
                <div class="space-y-2">
                  <div v-for="(item, i) in result.recommendations" :key="i" class="flex gap-2">
                    <span class="text-cyber-cyan text-xs mt-0.5">{{ i + 1 }}.</span>
                    <p class="text-sm text-white/70">{{ item }}</p>
                  </div>
                </div>
              </div>

              <!-- Suggested Toolset -->
              <div>
                <h3 class="text-xs text-white/40 uppercase tracking-wider mb-3">Suggested Toolset</h3>
                <div class="flex flex-wrap gap-2">
                  <span v-for="tool in result.tools" :key="tool"
                    class="px-2 py-1 text-[10px] rounded-full bg-cyber-purple/10 text-cyber-purple border border-cyber-purple/20">
                    {{ tool }}
                  </span>
                </div>
              </div>

              <!-- Prerequisites -->
              <div v-if="result.prerequisites.length">
                <h3 class="text-xs text-white/40 uppercase tracking-wider mb-3">Prerequisites Check</h3>
                <div class="space-y-1">
                  <p v-for="(p, i) in result.prerequisites" :key="i" class="text-xs">
                    <span :class="p.startsWith('\u2705') ? 'text-green-400' : p.startsWith('\u26a0') ? 'text-amber-400' : 'text-white/40'">{{ p }}</span>
                  </p>
                </div>
              </div>

              <!-- Next Steps -->
              <div class="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                <h3 class="text-xs text-white/40 uppercase tracking-wider mb-2">Next Steps</h3>
                <ol class="space-y-1 text-sm text-white/60 list-decimal list-inside">
                  <li>Schedule a 30-min discovery call to discuss details</li>
                  <li>Share your current tools and systems</li>
                  <li>Define success metrics together</li>
                  <li>Receive a custom automation architecture proposal</li>
                </ol>
              </div>

              <!-- Reset -->
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
const result = ref<ValidationResult | null>(null)
const uploadedFile = ref<File | null>(null)
const fileContent = ref('')
const fileStatus = ref('')
const isDragging = ref(false)

interface DomainResult { name: string; match: number; relevance: string }
interface ValidationResult {
  overall: number
  domains: DomainResult[]
  recommendations: string[]
  tools: string[]
  prerequisites: string[]
  keywords: string[]
  fileSummary: string
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
      fileStatus.value = `${fileContent.value.split(/\s+/).length} words extracted`
    } else if (ext === 'pdf') {
      fileContent.value = await extractPdfText(file)
      fileStatus.value = `${fileContent.value.split(/\s+/).length} words extracted from PDF`
    } else if (ext === 'docx' || ext === 'doc') {
      fileContent.value = await extractDocxText(file)
      fileStatus.value = `${fileContent.value.split(/\s+/).length} words extracted from Word`
    } else if (ext === 'xlsx' || ext === 'xls') {
      fileContent.value = await file.text().catch(() => '')
      if (!fileContent.value) {
        fileStatus.value = 'Excel file detected — please also describe your need in the text box'
      } else {
        fileStatus.value = `${fileContent.value.split(/\s+/).length} words extracted`
      }
    } else {
      fileContent.value = await file.text()
      fileStatus.value = 'File loaded'
    }
  } catch {
    fileStatus.value = 'Could not extract text — please also type your requirements below'
  }
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const texts: string[] = []

  for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    texts.push(content.items.map((item: any) => item.str).join(' '))
  }
  return texts.join('\n')
}

async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value
}

function clearFile() {
  uploadedFile.value = null
  fileContent.value = ''
  fileStatus.value = ''
}

const DOMAINS = [
  {
    name: 'Business Automation',
    keywords: ['onboarding', 'workflow', 'process', 'operations', 'crm', 'dashboard', 'reporting', 'sop', 'manual', 'repetitive', 'data entry', 'tracking', 'hr', 'employee', 'management', 'approval', 'internal', 'efficiency', 'optimize', 'supervisor', 'payroll', 'invoice'],
    tools: ['n8n', 'Supabase', 'Vue.js', 'Python', 'REST APIs', 'Zoho Cliq'],
    recs: ['End-to-end workflow automation connecting CRMs and databases', 'Automated onboarding process with task assignment', 'Operational reporting dashboard with real-time data', 'Cross-system data synchronization'],
    prereqs: ['Existing SOPs or manual processes documented', 'Identified repetitive tasks', 'Access to current tools (CRM, database)'],
  },
  {
    name: 'Marketing Automation',
    keywords: ['content', 'seo', 'blog', 'marketing', 'email', 'lead', 'campaign', 'funnel', 'conversion', 'engagement', 'newsletter', 'social media', 'publish', 'article', 'copywriting', 'audience', 'brand', 'ads', 'avatar', 'gohighlevel'],
    tools: ['n8n', 'Gemini 2.0 Flash', 'GoHighLevel', 'WordPress REST API', 'Surfer SEO', 'Pixabay API'],
    recs: ['AI-powered content engine with 6-agent pipeline (Researcher, Writer, Critic, Editor)', 'Automated lead capture and CRM funnel management', 'SEO scoring engine with 24 quality criteria', 'Automated publishing to WordPress/CMS'],
    prereqs: ['Content strategy or SEO goals defined', 'CRM or email tool in place', 'Target audience identified'],
  },
  {
    name: 'DevOps & MLOps',
    keywords: ['deploy', 'ci/cd', 'docker', 'container', 'cloud', 'server', 'hosting', 'infrastructure', 'pipeline', 'monitoring', 'nginx', 'production', 'scale', 'digitalocean', 'aws', 'github actions', 'cpanel', 'ssl', 'health check', 'kill switch'],
    tools: ['Docker', 'DigitalOcean', 'GitHub Actions', 'nginx', 'Cloudflare', 'cPanel'],
    recs: ['Docker containerization with multi-stage builds', 'CI/CD pipeline via GitHub Actions', 'Cloud deployment with nginx reverse proxy', 'System health monitoring with 14 service checks and auto-heal'],
    prereqs: ['Existing application to deploy', 'Cloud infrastructure readiness', 'Version control in place'],
  },
  {
    name: 'AI & Machine Learning',
    keywords: ['ai', 'ml', 'machine learning', 'llm', 'agent', 'rag', 'vector', 'embedding', 'prompt', 'model', 'training', 'classification', 'prediction', 'nlp', 'neural', 'deep learning', 'scoring', 'generation', 'autonomous', 'multi-agent', 'orchestrator', 'gemini', 'openai', 'gpt'],
    tools: ['Gemini 2.0 Flash', 'OpenAI API', 'pgvector', 'LangChain', 'n8n', 'SearXNG'],
    recs: ['Multi-agent AI pipeline (Orchestrator, Researcher, Writer, Critic, Editor)', 'RAG workflow with vector database for semantic search', 'Proprietary scoring engine with custom criteria', 'Prompt engineering and LLM optimization'],
    prereqs: ['Clear use case defined', 'Data availability for context', 'LLM API access or budget', 'Output quality expectations'],
  },
  {
    name: 'AI Chatbots & Conversational AI',
    keywords: ['chatbot', 'chat', 'conversation', 'support', 'customer service', 'booking', 'appointment', 'whatsapp', 'slack', 'messaging', 'faq', 'ticket', 'helpdesk', 'zendesk', 'freshdesk', 'live chat', 'bot', 'delphi'],
    tools: ['Python', 'Django', 'Flutter', 'n8n', 'OpenAI', 'Abacus AI', 'Delphi AI', 'GoHighLevel'],
    recs: ['Custom AI chatbot with CRM integration for lead tracking', 'Automated appointment booking with real-time notifications', 'AI-powered ticket triage and auto-response system', 'Multi-platform messaging integration (web, mobile, Slack)'],
    prereqs: ['Customer touchpoints identified', 'FAQs or knowledge base documented', 'Desired platform decided', 'Integration requirements known'],
  },
  {
    name: 'Systems Integration & API',
    keywords: ['api', 'integration', 'webhook', 'connect', 'sync', 'rest', 'oauth', 'saas', 'platform', 'stripe', 'xero', 'zapier', 'make', 'third party', 'external', 'data flow', 'json', 'endpoint', 'microservice'],
    tools: ['REST APIs', 'Webhooks', 'OAuth', 'n8n', 'Zapier', 'Make.com', 'JSON'],
    recs: ['REST API integrations with OAuth authentication', 'Webhook-based real-time automation triggers', 'Data synchronization across 14+ platforms', 'Integration architecture documentation and standards'],
    prereqs: ['List of tools to connect', 'API documentation available', 'Data sync needs defined'],
  },
  {
    name: 'Data Automation & Analytics',
    keywords: ['data', 'analytics', 'report', 'dashboard', 'etl', 'extract', 'transform', 'visualization', 'metrics', 'kpi', 'spreadsheet', 'database', 'sql', 'postgresql', 'csv', 'pdf report', 'reconciliation', 'financial', 'power bi', 'google analytics'],
    tools: ['Supabase', 'PostgreSQL', 'Python', 'n8n', 'Power BI', 'Google Analytics'],
    recs: ['Automated data extraction from multiple sources', 'ETL pipeline for data transformation and loading', 'Real-time analytics dashboard with KPI tracking', 'Automated PDF batch report generation and distribution'],
    prereqs: ['Data sources identified', 'Reporting requirements defined', 'Dashboard visualization needs specified'],
  },
]

function analyze() {
  isAnalyzing.value = true
  const allInput = [userInput.value, urlInput.value, fileContent.value].join(' ').toLowerCase()

  setTimeout(() => {
    // Find all matching keywords
    const matchedKeywords: string[] = []
    const domainScores: DomainResult[] = DOMAINS.map(domain => {
      let hits = 0
      domain.keywords.forEach(kw => {
        if (allInput.includes(kw)) {
          hits++
          if (!matchedKeywords.includes(kw)) matchedKeywords.push(kw)
        }
      })
      const match = Math.min(98, Math.round((hits / Math.max(domain.keywords.length * 0.3, 1)) * 100))
      const relevance = match >= 75 ? 'High' : match >= 40 ? 'Medium' : 'Low'
      return { name: domain.name, match, relevance }
    }).sort((a, b) => b.match - a.match)

    const topDomains = domainScores.filter(d => d.match >= 40)
    const overall = topDomains.length
      ? Math.round(topDomains.reduce((sum, d) => sum + d.match, 0) / topDomains.length)
      : Math.max(25, domainScores[0]?.match || 0)

    const recs: string[] = []
    const tools = new Set<string>()
    const prereqs: string[] = []

    domainScores.slice(0, 3).forEach(d => {
      const domain = DOMAINS.find(dom => dom.name === d.name)!
      if (d.match >= 30) {
        domain.recs.forEach(r => { if (!recs.includes(r)) recs.push(r) })
        domain.tools.forEach(t => tools.add(t))
        if (d.match >= 60) {
          prereqs.push(`\u2705 ${domain.name}: ${domain.prereqs[0]}`)
        } else if (d.match >= 30) {
          prereqs.push(`\u26a0\ufe0f ${domain.name}: ${domain.prereqs[0]}`)
        }
      }
    })

    // Generate file summary
    let fileSummary = ''
    if (fileContent.value && uploadedFile.value) {
      const words = fileContent.value.split(/\s+/).length
      const sentences = fileContent.value.split(/[.!?]+/).filter(s => s.trim()).length
      const topMatched = domainScores.filter(d => d.match >= 50).map(d => d.name)
      fileSummary = `Analyzed "${uploadedFile.value.name}" (${words} words, ${sentences} sentences).\n`
      fileSummary += `Found ${matchedKeywords.length} matching keywords across ${topMatched.length} relevant domains.\n`
      if (topMatched.length) {
        fileSummary += `Primary focus areas: ${topMatched.join(', ')}.`
      }
    }

    result.value = {
      overall,
      domains: domainScores,
      recommendations: recs.slice(0, 6),
      tools: Array.from(tools).slice(0, 10),
      prerequisites: prereqs,
      keywords: matchedKeywords.slice(0, 20),
      fileSummary,
    }
    isAnalyzing.value = false
  }, 2000)
}

function reset() {
  result.value = null
  userInput.value = ''
  urlInput.value = ''
  clearFile()
}
</script>

<style scoped>
.validate-enter-active, .validate-leave-active { transition: opacity 0.25s ease; }
.validate-enter-from, .validate-leave-to { opacity: 0; }
</style>

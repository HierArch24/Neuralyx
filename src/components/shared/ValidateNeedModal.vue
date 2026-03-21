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
              <p class="text-sm text-white/60 mb-4">Describe your automation goal, problem, or system requirement. I'll analyze how my expertise matches your needs.</p>

              <textarea
                v-model="userInput"
                rows="6"
                class="w-full px-4 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-white text-sm resize-none focus:border-cyber-purple/50 focus:outline-none placeholder-white/20"
                placeholder="Example: We want to automate our monthly financial reconciliation using Stripe and Xero...

Or list your requirements:
- AI content generation at scale
- CRM integration with lead tracking
- Automated reporting dashboards"
              ></textarea>

              <div class="flex items-center gap-3 mt-3">
                <input v-model="urlInput" placeholder="Or paste a URL (job post, project brief)..."
                  class="flex-1 px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-white text-xs focus:border-cyber-purple/50 focus:outline-none placeholder-white/20" />
              </div>

              <button @click="analyze" :disabled="isAnalyzing || (!userInput.trim() && !urlInput.trim())"
                class="w-full mt-4 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-30 transition-all"
                style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
                {{ isAnalyzing ? 'Analyzing...' : 'Validate My Need' }}
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
                <p class="text-sm text-white/60">Overall Match Score</p>
                <p class="text-xs mt-1" :class="result.overall >= 80 ? 'text-green-400' : result.overall >= 60 ? 'text-amber-400' : 'text-white/40'">
                  {{ result.overall >= 80 ? 'Strong match — I can deliver exactly what you need' : result.overall >= 60 ? 'Good match — most of your needs align with my expertise' : 'Partial match — some areas may need external resources' }}
                </p>
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
                  <p v-for="(p, i) in result.prerequisites" :key="i" class="text-xs text-white/50">
                    <span :class="p.startsWith('✅') ? 'text-green-400' : p.startsWith('⚠') ? 'text-amber-400' : 'text-white/40'">{{ p }}</span>
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
import { ref } from 'vue'

defineProps<{ visible: boolean }>()
defineEmits<{ close: [] }>()

const userInput = ref('')
const urlInput = ref('')
const isAnalyzing = ref(false)
const result = ref<ValidationResult | null>(null)

interface DomainResult { name: string; match: number; relevance: string }
interface ValidationResult {
  overall: number
  domains: DomainResult[]
  recommendations: string[]
  tools: string[]
  prerequisites: string[]
}

const DOMAINS = [
  {
    name: 'Business Automation',
    keywords: ['onboarding', 'workflow', 'process', 'operations', 'crm', 'dashboard', 'reporting', 'sop', 'manual', 'repetitive', 'data entry', 'tracking', 'hr', 'employee', 'management', 'approval', 'internal', 'efficiency', 'optimize'],
    tools: ['n8n', 'Supabase', 'Vue.js', 'Python', 'REST APIs'],
    recs: ['End-to-end workflow automation', 'Operational reporting dashboard', 'Cross-system data synchronization', 'Automated onboarding pipeline'],
    prereqs: ['Existing SOPs or manual processes documented', 'Identified repetitive tasks', 'Access to current tools (CRM, database)'],
  },
  {
    name: 'Marketing Automation',
    keywords: ['content', 'seo', 'blog', 'marketing', 'email', 'lead', 'campaign', 'funnel', 'conversion', 'engagement', 'newsletter', 'social media', 'publish', 'article', 'copywriting', 'audience', 'brand', 'ads'],
    tools: ['n8n', 'Gemini 2.0 Flash', 'GoHighLevel', 'WordPress REST API', 'Surfer SEO'],
    recs: ['AI-powered content engine with multi-agent pipeline', 'Automated lead capture and funnel management', 'SEO scoring engine with quality criteria', 'Automated publishing to CMS'],
    prereqs: ['Content strategy or SEO goals defined', 'CRM or email tool in place', 'Target audience identified'],
  },
  {
    name: 'DevOps & MLOps',
    keywords: ['deploy', 'ci/cd', 'docker', 'container', 'cloud', 'server', 'hosting', 'infrastructure', 'pipeline', 'monitoring', 'nginx', 'production', 'scale', 'digitalocean', 'aws', 'github actions', 'cpanel'],
    tools: ['Docker', 'DigitalOcean', 'GitHub Actions', 'nginx', 'Cloudflare'],
    recs: ['Docker containerization with multi-stage builds', 'CI/CD pipeline via GitHub Actions', 'Cloud deployment with reverse proxy', 'System health monitoring with auto-heal'],
    prereqs: ['Existing application to deploy', 'Cloud infrastructure readiness', 'Version control in place'],
  },
  {
    name: 'AI & Machine Learning',
    keywords: ['ai', 'ml', 'machine learning', 'llm', 'agent', 'rag', 'vector', 'embedding', 'prompt', 'model', 'training', 'classification', 'prediction', 'nlp', 'neural', 'deep learning', 'scoring', 'generation', 'autonomous'],
    tools: ['Gemini 2.0 Flash', 'OpenAI API', 'pgvector', 'LangChain', 'n8n'],
    recs: ['Multi-agent AI pipeline (Researcher, Writer, Critic, Editor)', 'RAG workflow with vector database', 'Custom scoring engine with quality criteria', 'Prompt engineering and optimization'],
    prereqs: ['Clear use case defined', 'Data availability for context', 'LLM API access or budget', 'Output quality expectations'],
  },
  {
    name: 'AI Chatbots & Conversational AI',
    keywords: ['chatbot', 'chat', 'conversation', 'support', 'customer service', 'booking', 'appointment', 'whatsapp', 'slack', 'messaging', 'faq', 'ticket', 'helpdesk', 'zendesk', 'freshdesk', 'live chat'],
    tools: ['Python', 'Django', 'n8n', 'OpenAI', 'Abacus AI', 'GoHighLevel'],
    recs: ['Custom AI chatbot with CRM integration', 'Automated appointment booking system', 'AI-powered ticket triage and response', 'Multi-platform messaging integration'],
    prereqs: ['Customer touchpoints identified', 'FAQs documented', 'Desired platform decided', 'Integration requirements known'],
  },
  {
    name: 'Systems Integration & API',
    keywords: ['api', 'integration', 'webhook', 'connect', 'sync', 'rest', 'oauth', 'saas', 'platform', 'stripe', 'xero', 'zapier', 'make', 'third party', 'external', 'data flow', 'json'],
    tools: ['REST APIs', 'Webhooks', 'n8n', 'Zapier', 'Make.com'],
    recs: ['REST API integrations with authentication', 'Webhook-based real-time automation', 'Data synchronization across platforms', 'Integration architecture documentation'],
    prereqs: ['List of tools to connect', 'API documentation available', 'Data sync needs defined'],
  },
  {
    name: 'Data Automation & Analytics',
    keywords: ['data', 'analytics', 'report', 'dashboard', 'etl', 'extract', 'transform', 'visualization', 'metrics', 'kpi', 'spreadsheet', 'database', 'sql', 'postgresql', 'csv', 'pdf report', 'reconciliation', 'financial'],
    tools: ['Supabase', 'PostgreSQL', 'Python', 'n8n', 'Power BI'],
    recs: ['Automated data extraction from multiple sources', 'ETL pipeline for data transformation', 'Real-time analytics dashboard', 'Automated PDF report generation'],
    prereqs: ['Data sources identified', 'Reporting requirements defined', 'Dashboard needs specified'],
  },
]

function analyze() {
  isAnalyzing.value = true
  const input = (userInput.value + ' ' + urlInput.value).toLowerCase()

  setTimeout(() => {
    const domainScores: DomainResult[] = DOMAINS.map(domain => {
      let hits = 0
      domain.keywords.forEach(kw => {
        if (input.includes(kw)) hits++
      })
      const match = Math.min(98, Math.round((hits / Math.max(domain.keywords.length * 0.35, 1)) * 100))
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
        domain.recs.slice(0, 2).forEach(r => { if (!recs.includes(r)) recs.push(r) })
        domain.tools.forEach(t => tools.add(t))
        if (d.match >= 60) {
          prereqs.push(`✅ ${domain.name}: ${domain.prereqs[0]}`)
        } else {
          prereqs.push(`⚠️ ${domain.name}: ${domain.prereqs[0]}`)
        }
      }
    })

    result.value = {
      overall,
      domains: domainScores,
      recommendations: recs.slice(0, 6),
      tools: Array.from(tools).slice(0, 8),
      prerequisites: prereqs,
    }
    isAnalyzing.value = false
  }, 1500)
}

function reset() {
  result.value = null
  userInput.value = ''
  urlInput.value = ''
}
</script>

<style scoped>
.validate-enter-active, .validate-leave-active { transition: opacity 0.25s ease; }
.validate-enter-from, .validate-leave-to { opacity: 0; }
</style>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

type ConnectionStatus = 'active' | 'configured' | 'limited' | 'error' | 'offline'

interface Connection {
  id: number
  name: string
  type: string
  category: string
  status: ConnectionStatus
  detail: string
  endpoint: string
}

const viewMode = ref<'table' | 'cards'>('cards')

// ─── Live health checks ───
const liveStatuses = ref<Record<string, ConnectionStatus>>({})

async function checkUrl(url: string, timeout = 4000): Promise<'active' | 'offline'> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeout) })
    return r.ok ? 'active' : 'offline'
  } catch { return 'offline' }
}

async function runHealthChecks() {
  const checks: Record<string, () => Promise<ConnectionStatus>> = {
    'mcp-server': async () => await checkUrl('http://localhost:8080/'),
    'frontend': async () => await checkUrl('http://localhost:3000/'),
    'postgres': async () => { try { await fetch('http://localhost:8080/api/health', { signal: AbortSignal.timeout(3000) }); return 'active' } catch { return 'offline' } },
    'gaze': async () => await checkUrl('http://localhost:7881/'),
    'gaze-hf': async () => await checkUrl('https://developer26-sted-gaze-onnx.hf.space/health', 8000),
    'sadtalker': async () => await checkUrl('http://localhost:7860/'),
    'voxcpm': async () => await checkUrl('http://localhost:7861/'),
    'voxcpm-hf': async () => await checkUrl('https://developer26-neuralyx-voxcpm.hf.space/health', 8000),
    'whisper': async () => await checkUrl('http://localhost:7870/'),
    'whisper-hf': async () => await checkUrl('https://developer26-neuralyx-whisper.hf.space/health', 8000),
    'n8n': async () => await checkUrl('http://localhost:5678/'),
    'searxng': async () => await checkUrl('http://localhost:8888/'),
    'browserless': async () => await checkUrl('http://localhost:3333/'),
    'browser-harness': async () => await checkUrl('http://localhost:7880/'),
    'browser-use': async () => await checkUrl('http://localhost:7882/'),
    'ai-service': async () => await checkUrl('http://localhost:8090/'),
    'supabase': async () => await checkUrl('https://phpdxvaowytijhvclljb.supabase.co/rest/v1/', 5000),
  }

  for (const [key, fn] of Object.entries(checks)) {
    liveStatuses.value[key] = await fn()
  }
}

const connections = ref<Connection[]>([
  // ═══════════════════════════════════════════════════════
  // INFRASTRUCTURE — Docker Services
  // ═══════════════════════════════════════════════════════
  { id: 1, name: 'neuralyx-postgres', type: 'Database', category: 'infrastructure', status: 'active', detail: 'pgvector/pgvector:17 — Primary DB with vector embeddings', endpoint: 'localhost:5432' },
  { id: 2, name: 'neuralyx-frontend', type: 'Web Server', category: 'infrastructure', status: 'active', detail: 'Vue 3 + Nginx — Portfolio frontend', endpoint: 'localhost:3000' },
  { id: 3, name: 'neuralyx-mcp', type: 'MCP Server', category: 'infrastructure', status: 'active', detail: 'Node.js MCP server — API endpoints, Supabase tools, job pipeline', endpoint: 'localhost:8080' },
  { id: 4, name: 'neuralyx-gaze', type: 'AI Service', category: 'infrastructure', status: 'active', detail: 'Gaze correction sidecar — WarpCNN model, Maxine cloud fallback', endpoint: 'localhost:7881' },
  { id: 5, name: 'neuralyx-sadtalker', type: 'AI Service', category: 'infrastructure', status: 'configured', detail: 'SadTalker lip-sync engine — CPU mode (AMD Radeon 760M)', endpoint: 'localhost:7860' },
  { id: 6, name: 'neuralyx-voxcpm', type: 'AI Service', category: 'infrastructure', status: 'configured', detail: 'VoxCPM voice clone — CosyVoice2-0.5B, CPU mode', endpoint: 'localhost:7861' },
  { id: 7, name: 'neuralyx-whisper', type: 'AI Service', category: 'infrastructure', status: 'configured', detail: 'faster-whisper transcription — large-v3-turbo (int8 CPU)', endpoint: 'localhost:7870' },
  { id: 8, name: 'neuralyx-n8n', type: 'Workflow Engine', category: 'infrastructure', status: 'active', detail: 'n8n workflow automation — job pipeline, email, auto-apply', endpoint: 'localhost:5678' },
  { id: 9, name: 'neuralyx-searxng', type: 'Search Engine', category: 'infrastructure', status: 'active', detail: 'SearXNG meta-search — AI content research', endpoint: 'localhost:8888' },
  { id: 10, name: 'neuralyx-browser', type: 'Browser', category: 'infrastructure', status: 'configured', detail: 'Browserless Chrome — free self-hosted, 2 concurrent', endpoint: 'localhost:3333' },
  { id: 11, name: 'neuralyx-browser-harness', type: 'Browser Agent', category: 'infrastructure', status: 'configured', detail: 'AI-driven apply fallback — Claude-driven CDP to Edge', endpoint: 'localhost:7880' },
  { id: 12, name: 'neuralyx-browser-use', type: 'Browser Agent', category: 'infrastructure', status: 'configured', detail: 'browser-use library — Tier-3 real browser escalation', endpoint: 'localhost:7882' },
  { id: 13, name: 'neuralyx-ai', type: 'AI Service', category: 'infrastructure', status: 'active', detail: 'AI service wrapper — connects to MCP server', endpoint: 'localhost:8090' },

  // ─── Hugging Face Space fallbacks (Developer26) ─────────────────────
  { id: 130, name: 'whisper-hf', type: 'AI Service', category: 'infrastructure', status: 'active',     detail: 'HF Space fallback — faster-whisper (small.en, int8 CPU)',       endpoint: 'developer26-neuralyx-whisper.hf.space' },
  { id: 131, name: 'gaze-hf',    type: 'AI Service', category: 'infrastructure', status: 'active',     detail: 'HF Space fallback — STED-Gaze ONNX (gaze redirection)',         endpoint: 'developer26-sted-gaze-onnx.hf.space' },
  { id: 132, name: 'voxcpm-hf',  type: 'AI Service', category: 'infrastructure', status: 'configured', detail: 'HF Space fallback — VoxCPM voice clone (currently 404, needs Dockerfile push)', endpoint: 'developer26-neuralyx-voxcpm.hf.space' },

  // ═══════════════════════════════════════════════════════
  // MCP SERVERS — 14 Configured in .mcp.json
  // ═══════════════════════════════════════════════════════
  { id: 14, name: 'Supabase MCP', type: 'MCP Server', category: 'mcp', status: 'active', detail: 'Database, auth, storage — project phpdxvaowytijhvclljb', endpoint: 'mcp.supabase.com/mcp' },
  { id: 15, name: 'Playwright MCP', type: 'MCP Server', category: 'mcp', status: 'active', detail: 'Browser automation — Microsoft Edge control', endpoint: 'npx @playwright/mcp' },
  { id: 16, name: 'n8n MCP', type: 'MCP Server', category: 'mcp', status: 'active', detail: 'Workflow automation orchestration — localhost:5678', endpoint: 'npx n8n-mcp' },
  { id: 17, name: 'n8n-workflows MCP', type: 'MCP Server', category: 'mcp', status: 'active', detail: 'Direct n8n workflow definitions & execution', endpoint: 'localhost:5678/mcp-server/http' },
  { id: 18, name: 'HeyGen MCP', type: 'MCP Server', category: 'mcp', status: 'active', detail: 'AI video generation — interview/presentation content', endpoint: 'mcp.heygen.com/mcp/v1/' },
  { id: 19, name: 'GitHub MCP', type: 'MCP Server', category: 'mcp', status: 'active', detail: 'Repo management, PR creation, issue tracking, code review', endpoint: 'npx server-github' },
  { id: 20, name: 'Memory MCP', type: 'MCP Server', category: 'mcp', status: 'active', detail: 'Persistent context — store/retrieve project knowledge', endpoint: 'npx server-memory' },
  { id: 21, name: 'Sequential Thinking MCP', type: 'MCP Server', category: 'mcp', status: 'active', detail: 'Complex reasoning — step-by-step structured thought chains', endpoint: 'npx server-sequential-thinking' },
  { id: 22, name: 'Context7 MCP', type: 'MCP Server', category: 'mcp', status: 'active', detail: 'API/library documentation lookup for unfamiliar packages', endpoint: 'npx context7-mcp' },
  { id: 23, name: 'Filesystem MCP', type: 'MCP Server', category: 'mcp', status: 'active', detail: 'Batch file operations, search, metadata beyond standard tools', endpoint: 'npx server-filesystem' },
  { id: 24, name: 'Token Optimizer MCP', type: 'MCP Server', category: 'mcp', status: 'active', detail: 'Context window optimization — compression, summarization', endpoint: 'npx token-optimizer-mcp' },
  { id: 25, name: 'Vercel MCP', type: 'MCP Server', category: 'mcp', status: 'active', detail: 'Deployment management, preview URLs, env variables', endpoint: 'mcp.vercel.com' },
  { id: 26, name: 'Skill Seekers MCP', type: 'MCP Server', category: 'mcp', status: 'active', detail: 'Doc/repo/PDF ingestion → searchable knowledge (pip v3.5.1)', endpoint: 'python skill_seekers.mcp' },
  { id: 27, name: 'DesignLang MCP', type: 'MCP Server', category: 'mcp', status: 'active', detail: 'Design token extraction, Tailwind config, shadcn components', endpoint: 'npx designlang --mcp' },

  // ═══════════════════════════════════════════════════════
  // SKILLS — 6 Top-Level + Sub-Skills
  // ═══════════════════════════════════════════════════════
  { id: 28, name: 'Superpowers (14 skills)', type: 'Methodology', category: 'skills', status: 'active', detail: 'obra/superpowers v5.0.7 — spec-driven dev, TDD, subagent execution, systematic debugging, parallel agents', endpoint: '.claude/skills/superpowers/' },
  { id: 29, name: 'ECC Universal (182 skills)', type: 'Knowledge Base', category: 'skills', status: 'active', detail: 'everything-claude-code — 182 skills, 48 agents, 27 rules', endpoint: 'node_modules/ecc-universal/' },
  { id: 30, name: 'Karpathy Wiki', type: 'Skill', category: 'skills', status: 'active', detail: 'Auto-maintained project knowledge wiki — compacts old entries, adds discoveries', endpoint: '.claude/skills/karpathy-wiki/' },
  { id: 31, name: 'SEO/GEO (20 skills)', type: 'Skill Suite', category: 'skills', status: 'active', detail: 'Search optimization — keyword research, audits, content writing, schema markup', endpoint: '.claude/skills/seo-geo/' },
  { id: 32, name: 'Caveman', type: 'Skill', category: 'skills', status: 'active', detail: 'JuliusBrussee/caveman — code analysis + token-efficient compression', endpoint: '.claude/skills/caveman/' },
  { id: 33, name: 'claude-mem', type: 'Tool', category: 'skills', status: 'active', detail: 'Session memory — auto-captures, compresses, injects context (npm v10.6.3)', endpoint: 'npm global: claude-mem' },

  // ═══════════════════════════════════════════════════════
  // AGENTS — 3 Defined
  // ═══════════════════════════════════════════════════════
  { id: 34, name: 'Browser Agent', type: 'Agent', category: 'ai-agent', status: 'active', detail: 'Edge automation — BrowserMCP + Playwright, 12+ platforms logged in', endpoint: '.claude/agents/browser.md' },
  { id: 35, name: 'Auto-Apply Agent', type: 'Agent', category: 'ai-agent', status: 'active', detail: 'Job auto-apply — Indeed, JobStreet, Kalibrr, company portals, email', endpoint: '.claude/agents/auto-apply.md' },
  { id: 36, name: 'Indeed-Apply Agent', type: 'Agent', category: 'ai-agent', status: 'active', detail: 'Indeed Easy Apply specialist — answer engine, screenshot proof', endpoint: '.claude/agents/indeed-apply.md' },

  // ═══════════════════════════════════════════════════════
  // JOB PIPELINE AGENTS (MCP Server Internal)
  // ═══════════════════════════════════════════════════════
  { id: 37, name: 'Scout Agent', type: 'AI Agent', category: 'ai-agent', status: 'active', detail: 'Job discovery — 11 platforms via JSearch, Adzuna, Playwright', endpoint: '/api/jobs/agent/run' },
  { id: 38, name: 'Classifier Agent', type: 'AI Agent', category: 'ai-agent', status: 'active', detail: 'Role type detection — FullStack/AI/ML/DevOps/Freelance', endpoint: '/api/jobs/classify' },
  { id: 39, name: 'Matcher Agent', type: 'AI Agent', category: 'ai-agent', status: 'active', detail: 'Hybrid scoring — 50% semantic + 30% keyword + 20% structured (pgvector)', endpoint: '/api/jobs/match' },
  { id: 40, name: 'Research Agent', type: 'AI Agent', category: 'ai-agent', status: 'active', detail: 'Company intel — website, reviews, tech stack, red flags', endpoint: '/api/jobs/research' },
  { id: 41, name: 'Writer Agent', type: 'AI Agent', category: 'ai-agent', status: 'active', detail: 'RAG cover letter — portfolio signals + past successful applications', endpoint: '/api/jobs/cover-letter' },
  { id: 42, name: 'Applier Agent', type: 'AI Agent', category: 'ai-agent', status: 'active', detail: 'Auto-submit — LinkedIn MCP, Playwright form-fill, Easy Apply', endpoint: '/api/jobs/apply' },
  { id: 43, name: 'Nurture Agent', type: 'AI Agent', category: 'ai-agent', status: 'active', detail: 'Follow-up tracking — ghosted detection (30d), status monitoring', endpoint: '/api/jobs/nurture' },

  // ═══════════════════════════════════════════════════════
  // AI MODELS & APIs
  // ═══════════════════════════════════════════════════════
  { id: 44, name: 'OpenAI GPT-5.2', type: 'AI Model', category: 'ai-model', status: 'limited', detail: 'Article generation, classification, cover letters, DALL-E 3 thumbnails', endpoint: 'api.openai.com' },
  { id: 45, name: 'Google Gemini 2.0', type: 'AI Model', category: 'ai-model', status: 'active', detail: 'Fallback AI — Vertex key, content generation', endpoint: 'generativelanguage.googleapis.com' },
  { id: 46, name: 'Anthropic Claude', type: 'AI Model', category: 'ai-model', status: 'active', detail: 'Browser harness AI decisions, cover letter generation', endpoint: 'api.anthropic.com' },
  { id: 47, name: 'Hugging Face', type: 'AI Platform', category: 'ai-model', status: 'active', detail: 'Model downloads — VoxCPM, Whisper, SadTalker checkpoints', endpoint: 'huggingface.co' },

  // ═══════════════════════════════════════════════════════
  // BACKEND SERVICES & APIs
  // ═══════════════════════════════════════════════════════
  { id: 48, name: 'Supabase', type: 'Backend-as-a-Service', category: 'backend', status: 'active', detail: 'Database, auth, storage, realtime — project phpdxvaowytijhvclljb', endpoint: 'phpdxvaowytijhvclljb.supabase.co' },
  { id: 49, name: 'pgvector', type: 'Vector Database', category: 'backend', status: 'active', detail: 'Semantic search — resume-job matching, deduplication, RAG', endpoint: 'Supabase extension' },
  { id: 50, name: 'JSearch API', type: 'Job Aggregator', category: 'backend', status: 'active', detail: 'RapidAPI — Indeed+LinkedIn+Glassdoor+ZipRecruiter+Google (500K/mo)', endpoint: 'jsearch.p.rapidapi.com' },
  { id: 51, name: 'Adzuna API', type: 'Job Aggregator', category: 'backend', status: 'active', detail: 'Job search — 12+ countries, salary data, categories', endpoint: 'developer.adzuna.com' },
  { id: 52, name: 'Jooble API', type: 'Job Aggregator', category: 'backend', status: 'active', detail: 'Job search API — global job listings', endpoint: 'jooble.org' },
  { id: 53, name: 'SMTP (ifastnet)', type: 'Email', category: 'backend', status: 'active', detail: 'Email notifications — portfolio@neuralyx.ai.dev-environment.site', endpoint: 'dev-environment.site:465' },

  // ═══════════════════════════════════════════════════════
  // TECH STACK
  // ═══════════════════════════════════════════════════════
  { id: 54, name: 'Vue 3', type: 'Framework', category: 'tech-stack', status: 'active', detail: 'v3.5+ with TypeScript — Composition API, <script setup>', endpoint: 'package.json' },
  { id: 55, name: 'Vite', type: 'Build Tool', category: 'tech-stack', status: 'active', detail: 'Dev server port 3000, HMR, Tailwind plugin', endpoint: 'vite.config.ts' },
  { id: 56, name: 'Tailwind CSS v4', type: 'Styling', category: 'tech-stack', status: 'active', detail: 'Utility-first CSS — cyber theme colors', endpoint: 'src/style.css' },
  { id: 57, name: 'Pinia', type: 'State Management', category: 'tech-stack', status: 'active', detail: 'Stores: content, auth, admin, job', endpoint: 'src/stores/' },
  { id: 58, name: 'Vue Router 4', type: 'Routing', category: 'tech-stack', status: 'active', detail: 'History mode, auth guards, admin routes', endpoint: 'src/router/index.ts' },
  { id: 59, name: 'GSAP 3', type: 'Animation', category: 'tech-stack', status: 'active', detail: 'ScrollTrigger, parallax, warped text', endpoint: 'src/lib/gsap-setup.ts' },
  { id: 60, name: 'Lenis', type: 'Smooth Scroll', category: 'tech-stack', status: 'active', detail: 'Smooth scrolling experience', endpoint: 'src/composables/useSmoothScroll.ts' },
  { id: 61, name: 'Supabase JS', type: 'SDK', category: 'tech-stack', status: 'active', detail: 'Database client — CRUD operations, realtime subscriptions', endpoint: '@supabase/supabase-js' },

  // ═══════════════════════════════════════════════════════
  // GIT & DEPLOYMENT
  // ═══════════════════════════════════════════════════════
  { id: 62, name: 'GitHub (HierArch24)', type: 'Git Remote', category: 'deployment', status: 'active', detail: 'SSH: git@github.com-hierarch24:HierArch24/NEURALYX.git', endpoint: 'github.com' },
  { id: 63, name: 'Docker Compose', type: 'Container Orchestration', category: 'deployment', status: 'active', detail: '13 services — frontend, postgres, mcp, gaze, sadtalker, voxcpm, whisper, n8n, searxng, browser, browser-harness, browser-use, ai', endpoint: 'docker-compose.yml' },
  { id: 64, name: 'cPanel (Live)', type: 'Hosting', category: 'deployment', status: 'active', detail: 'neuralyx.ai.dev-environment.site — rsync deploy', endpoint: 'sv70.ifastnet.com:2083' },
  { id: 65, name: 'GitHub Actions CI/CD', type: 'Pipeline', category: 'deployment', status: 'active', detail: 'Auto build + deploy on push to main', endpoint: '.github/workflows/build.yml' },

  // ═══════════════════════════════════════════════════════
  // INSTALLED PACKAGES (npm global + pip)
  // ═══════════════════════════════════════════════════════
  { id: 66, name: 'claude-mem', type: 'npm Global', category: 'packages', status: 'active', detail: 'v10.6.3 — Session memory & context injection', endpoint: 'npm -g' },
  { id: 67, name: '@playwright/mcp', type: 'npm Global', category: 'packages', status: 'active', detail: 'v0.0.70 — Browser automation MCP', endpoint: 'npm -g' },
  { id: 68, name: 'n8n-mcp', type: 'npm Global', category: 'packages', status: 'active', detail: 'v2.35.5 — n8n workflow MCP', endpoint: 'npm -g' },
  { id: 69, name: '@qwen-code/qwen-code', type: 'npm Global', category: 'packages', status: 'active', detail: 'v0.15.6-nightly — Qwen Code CLI', endpoint: 'npm -g' },
  { id: 70, name: '@anthropic-ai/claude-code', type: 'npm Global', category: 'packages', status: 'active', detail: 'v2.1.126 — Claude Code CLI', endpoint: 'npm -g' },
  { id: 71, name: '@musistudio/claude-code-router', type: 'npm Global', category: 'packages', status: 'active', detail: 'v2.0.0 — Multi-model routing & fallback', endpoint: 'npm -g' },
  { id: 72, name: 'skill-seekers', type: 'pip', category: 'packages', status: 'active', detail: 'v3.5.1 — Documentation ingestion MCP', endpoint: 'pip' },
  { id: 73, name: 'langchain', type: 'pip', category: 'packages', status: 'active', detail: 'v1.2.11 — LLM chains & agents', endpoint: 'pip' },
  { id: 74, name: 'langgraph', type: 'pip', category: 'packages', status: 'active', detail: 'v1.1.0 — Agent graph orchestration', endpoint: 'pip' },
  { id: 75, name: 'agentscope', type: 'pip', category: 'packages', status: 'active', detail: 'v1.0.18 — Multi-agent orchestration', endpoint: 'pip' },
  { id: 76, name: 'ecc-universal', type: 'npm Local', category: 'packages', status: 'active', detail: 'ECC rules, skills, agents source package', endpoint: 'node_modules/ecc-universal/' },
])

const categories = [
  { value: 'infrastructure', label: '🐳 Docker Services' },
  { value: 'mcp', label: '🔌 MCP Servers' },
  { value: 'skills', label: '🧠 Skills & Tools' },
  { value: 'ai-agent', label: '🤖 AI Agents' },
  { value: 'ai-model', label: '🧬 AI Models' },
  { value: 'backend', label: '⚙️ Backend & APIs' },
  { value: 'tech-stack', label: '💻 Tech Stack' },
  { value: 'deployment', label: '🚀 Git & Deployment' },
  { value: 'packages', label: '📦 Installed Packages' },
]

const selectedCategory = ref<string>('all')
const searchQuery = ref('')
const currentPage = ref(1)
const perPage = 15

const filteredConnections = computed(() => {
  let filtered = connections.value
  if (selectedCategory.value !== 'all') filtered = filtered.filter(c => c.category === selectedCategory.value)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    filtered = filtered.filter(c => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q) || c.detail.toLowerCase().includes(q))
  }
  return filtered
})

const totalPages = computed(() => Math.ceil(filteredConnections.value.length / perPage))
const paginatedConnections = computed(() => filteredConnections.value.slice((currentPage.value - 1) * perPage, currentPage.value * perPage))

const statusCounts = computed(() => {
  const counts: Record<string, number> = { active: 0, configured: 0, limited: 0, error: 0, offline: 0 }
  connections.value.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1 })
  return counts
})

function statusBadge(status: string) {
  switch (status) {
    case 'active': return 'bg-green-500/10 text-green-400 border-green-500/20'
    case 'configured': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
    case 'limited': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
    case 'error': return 'bg-red-500/10 text-red-400 border-red-500/20'
    case 'offline': return 'bg-gray-500/10 text-gray-400 border-gray-500/20'
    default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20'
  }
}

function statusDot(status: string) {
  switch (status) {
    case 'active': return 'bg-green-500'
    case 'configured': return 'bg-cyan-500'
    case 'limited': return 'bg-yellow-500'
    case 'error': return 'bg-red-500'
    case 'offline': return 'bg-gray-500'
    default: return 'bg-gray-500'
  }
}

function categoryLabel(cat: string) {
  return categories.find(c => c.value === cat)?.label || cat
}

onMounted(() => { runHealthChecks() })
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-8">
      <div>
        <h2 class="text-2xl font-bold text-white">Connection Health</h2>
        <p class="text-gray-400 text-sm mt-1">76 configured services, MCP servers, skills, agents, and packages — live status checks</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          @click="runHealthChecks()"
          class="px-3 py-2 bg-cyber-purple/20 hover:bg-cyber-purple/30 text-cyber-purple rounded-lg text-sm transition-colors flex items-center gap-1.5"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          Refresh
        </button>
        <button
          @click="viewMode = viewMode === 'table' ? 'cards' : 'table'"
          class="px-3 py-2 bg-neural-700 hover:bg-neural-600 text-gray-300 rounded-lg text-sm transition-colors"
        >
          {{ viewMode === 'table' ? 'Card View' : 'Table View' }}
        </button>
      </div>
    </div>

    <!-- Live Docker Status Bar -->
    <div class="mb-6 p-4 bg-neural-800/80 border border-neural-600 rounded-xl">
      <p class="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-semibold">Live Docker Service Status</p>
      <div class="flex flex-wrap gap-3">
        <div v-for="(status, key) in liveStatuses" :key="key" class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
             :class="status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'">
          <span class="w-2 h-2 rounded-full" :class="status === 'active' ? 'bg-green-400 animate-pulse' : 'bg-red-400'"></span>
          {{ key }}
        </div>
      </div>
    </div>

    <!-- Status Summary Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
      <div class="bg-neural-800 rounded-lg p-4 text-center border border-green-500/20">
        <p class="text-2xl font-bold text-green-400">{{ statusCounts.active }}</p>
        <p class="text-xs text-gray-400 mt-1">Active</p>
      </div>
      <div class="bg-neural-800 rounded-lg p-4 text-center border border-cyan-500/20">
        <p class="text-2xl font-bold text-cyan-400">{{ statusCounts.configured }}</p>
        <p class="text-xs text-gray-400 mt-1">Configured</p>
      </div>
      <div class="bg-neural-800 rounded-lg p-4 text-center border border-yellow-500/20">
        <p class="text-2xl font-bold text-yellow-400">{{ statusCounts.limited }}</p>
        <p class="text-xs text-gray-400 mt-1">Limited</p>
      </div>
      <div class="bg-neural-800 rounded-lg p-4 text-center border border-red-500/20">
        <p class="text-2xl font-bold text-red-400">{{ statusCounts.error }}</p>
        <p class="text-xs text-gray-400 mt-1">Error</p>
      </div>
      <div class="bg-neural-800 rounded-lg p-4 text-center border border-gray-500/20">
        <p class="text-2xl font-bold text-gray-400">{{ statusCounts.offline }}</p>
        <p class="text-xs text-gray-400 mt-1">Offline</p>
      </div>
    </div>

    <!-- Search -->
    <div class="relative mb-4">
      <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
      <input v-model="searchQuery" @input="currentPage = 1" placeholder="Search connections..." class="w-full pl-10 pr-4 py-2.5 bg-neural-800 border border-neural-600 rounded-lg text-white text-sm placeholder-gray-500 focus:border-cyber-purple focus:outline-none" />
    </div>

    <!-- Category Filter -->
    <div class="flex flex-wrap gap-2 mb-6">
      <button
        @click="selectedCategory = 'all'"
        class="px-3 py-1.5 rounded-lg text-xs transition-colors"
        :class="selectedCategory === 'all' ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-neural-700 text-gray-400 hover:text-white'"
      >
        All ({{ connections.length }})
      </button>
      <button
        v-for="cat in categories"
        :key="cat.value"
        @click="selectedCategory = cat.value"
        class="px-3 py-1.5 rounded-lg text-xs transition-colors"
        :class="selectedCategory === cat.value ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-neural-700 text-gray-400 hover:text-white'"
      >
        {{ cat.label }} ({{ connections.filter(c => c.category === cat.value).length }})
      </button>
    </div>

    <!-- TABLE VIEW -->
    <div v-if="viewMode === 'table'" class="bg-neural-800 rounded-xl overflow-hidden border border-neural-600">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-neural-600">
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Type</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Category</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Detail</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Endpoint</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="conn in paginatedConnections"
              :key="conn.id"
              class="border-b border-neural-700/50 hover:bg-neural-700/30 transition-colors"
            >
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <div class="w-2.5 h-2.5 rounded-full" :class="statusDot(conn.status)"></div>
                  <span class="text-xs px-2 py-0.5 rounded-full border capitalize" :class="statusBadge(conn.status)">
                    {{ conn.status }}
                  </span>
                </div>
              </td>
              <td class="px-4 py-3 text-sm text-white font-medium">{{ conn.name }}</td>
              <td class="px-4 py-3 text-sm text-gray-400">{{ conn.type }}</td>
              <td class="px-4 py-3">
                <span class="text-xs px-2 py-0.5 bg-neural-700 text-gray-300 rounded">{{ categoryLabel(conn.category) }}</span>
              </td>
              <td class="px-4 py-3 text-xs text-gray-500 max-w-[250px] truncate">{{ conn.detail }}</td>
              <td class="px-4 py-3 text-xs text-gray-500 font-mono">{{ conn.endpoint }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- CARD VIEW -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="conn in paginatedConnections"
        :key="conn.id"
        class="bg-neural-800 rounded-xl p-5 border border-neural-600 hover:border-neural-500 transition-all"
      >
        <div class="flex items-start justify-between mb-3">
          <div class="flex items-center gap-2">
            <div class="w-2.5 h-2.5 rounded-full" :class="statusDot(conn.status)"></div>
            <h4 class="text-sm font-semibold text-white">{{ conn.name }}</h4>
          </div>
          <span class="text-xs px-2 py-0.5 rounded-full border capitalize" :class="statusBadge(conn.status)">
            {{ conn.status }}
          </span>
        </div>
        <p class="text-xs text-gray-500 mb-1">{{ conn.type }}</p>
        <p class="text-xs text-gray-400 mb-3">{{ conn.detail }}</p>
        <div class="flex items-center justify-between">
          <span class="text-xs px-2 py-0.5 bg-neural-700 text-gray-300 rounded">{{ categoryLabel(conn.category) }}</span>
        </div>
        <p class="text-[10px] text-gray-600 mt-2 font-mono">{{ conn.endpoint }}</p>
      </div>
    </div>
    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-between mt-4">
      <p class="text-[10px] text-gray-500">{{ (currentPage - 1) * perPage + 1 }}-{{ Math.min(currentPage * perPage, filteredConnections.length) }} of {{ filteredConnections.length }}</p>
      <div class="flex items-center gap-1">
        <button @click="currentPage--" :disabled="currentPage === 1" class="px-2.5 py-1 rounded text-xs bg-neural-700 text-gray-400 hover:text-white disabled:opacity-30">&larr;</button>
        <button v-for="pg in totalPages" :key="pg" @click="currentPage = pg"
          class="w-7 h-7 rounded text-[10px] font-medium" :class="pg === currentPage ? 'bg-cyber-purple/20 text-cyber-purple' : 'text-gray-500 hover:text-white'">{{ pg }}</button>
        <button @click="currentPage++" :disabled="currentPage === totalPages" class="px-2.5 py-1 rounded text-xs bg-neural-700 text-gray-400 hover:text-white disabled:opacity-30">&rarr;</button>
      </div>
    </div>
  </div>
</template>

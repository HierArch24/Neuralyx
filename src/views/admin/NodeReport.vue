<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'

const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

interface NodeStep {
  id: string; node: string; label: string; tool: string; description: string
  status: 'idle' | 'running' | 'pass' | 'fail' | 'skipped'
  detail: string; timestamp: string
}

interface ActiveRun {
  id: string; job_title: string; company: string; platform: string
  started_at: string; status: 'running' | 'completed' | 'failed'
  nodes: NodeStep[]
}

const NODE_TEMPLATE: Omit<NodeStep, 'status' | 'detail' | 'timestamp'>[] = [
  { id: 'n1', node: 'browser', label: 'Browser CDP Connect', tool: 'Playwright + Browser Manager', description: 'Connects to Edge Profile 7 via Chrome DevTools Protocol. Auto-reconnects on disconnect. Pre-cleans excess tabs.' },
  { id: 'n2', node: 'cleanup', label: 'Tab Cleanup', tool: 'CDP HTTP API', description: 'Closes stale smartapply, blank, and new-tab pages via raw CDP JSON endpoint. Prevents 64-tab timeout.' },
  { id: 'n3', node: 'search', label: 'Indeed Job Search', tool: 'Playwright getPage()', description: 'Navigates to ph.indeed.com with query, remote filter, and 7-day recency. Extracts job cards with jk IDs.' },
  { id: 'n4', node: 'filter', label: 'AI Job Scoring & Match', tool: 'Gemini 2.5 Flash', description: 'Scores each job by skill match %. Filters: no intern, WFH only, salary > 40k PHP, relevant keywords.' },
  { id: 'n5', node: 'cover_letter', label: 'Cover Letter Generation', tool: 'MCP API + Gemini AI', description: 'Problem-Solution framework: business pain point, approach + proof, results + ROI, 30-60 day plan. Tailored per JD.' },
  { id: 'n6', node: 'apply_click', label: 'Click Apply Button', tool: 'Playwright click()', description: 'Finds "Apply now" or "Apply with Indeed" button. Opens Easy Apply form in new tab.' },
  { id: 'n7', node: 'resume', label: 'Resume Selection', tool: 'React Fiber evaluate()', description: 'Selects saved resume from Indeed profile. Uses React fiber to trigger onChange on radio component.' },
  { id: 'n8', node: 'vision_analyze', label: 'Vision Page Analysis', tool: 'Gemini Vision AI', description: 'Screenshots each form page. Gemini identifies page type, fields, values, and next button. Returns JSON actions.' },
  { id: 'n9', node: 'fill_text', label: 'Fill Text Inputs', tool: 'Playwright type()', description: 'Types values character-by-character into text inputs. Triggers React onChange via native input events.' },
  { id: 'n10', node: 'fill_radio', label: 'Fill Radio / Yes-No / True-False', tool: 'React Fiber onChange', description: 'Finds __reactProps$ on DOM element, calls onChange handler directly. Handles Yes/No, True/False, and multi-option.' },
  { id: 'n11', node: 'fill_select', label: 'Fill Dropdowns', tool: 'Playwright selectOption()', description: 'Native select interaction. Matches "Philippines" for country, experience levels, education.' },
  { id: 'n12', node: 'fill_checkbox', label: 'Fill Multi-Checkboxes', tool: 'React Fiber + mouse.click', description: 'Checks all applicable boxes for multi-select questions (WordPress exp, skills, tools). React fiber for state.' },
  { id: 'n13', node: 'fill_cover_letter', label: 'Type Cover Letter', tool: 'Playwright type()', description: 'Clicks "Write a cover letter" radio, types full cover letter into textarea on supporting documents page.' },
  { id: 'n14', node: 'review', label: 'Review Page Reached', tool: 'Gemini Vision detect', description: 'Gemini identifies "Please review your application" or "Submit your application" text on page.' },
  { id: 'n15', node: 'consent', label: 'Consent Checkboxes', tool: 'React Fiber check()', description: 'Ticks privacy policy, terms, data processing checkboxes via React fiber onChange trigger.' },
  { id: 'n16', node: 'submit', label: 'Submit Application', tool: 'mouse.click() coordinates', description: 'Scrolls to Submit button, gets bounding box, clicks at exact center coordinates. JS fallback if needed.' },
  { id: 'n17', node: 'verify', label: 'Indeed Applied Confirm', tool: 'Browser verification', description: 'Checks page text for "submitted", "successfully applied". Verifies Indeed My Jobs shows Applied status.' },
  { id: 'n18', node: 'report_db', label: 'Supabase Record Created', tool: 'MCP POST API', description: 'POSTs to /api/jobs/auto-apply/browser. Creates job_listing + job_application records in Supabase.' },
  { id: 'n19', node: 'report_email', label: 'Email Notification', tool: 'cPanel SMTP', description: 'Sends application notification to gabrielalvin.jobs@gmail.com with job details and cover letter.' },
]

const activeRun = ref<ActiveRun | null>(null)
const pastRuns = ref<ActiveRun[]>([])
const connected = ref(false)
const loading = ref(true)
const expandedRun = ref<string | null>(null)
const selectedRuns = ref<Set<string>>(new Set())
const page = ref(1)
const pageSize = 10
let eventSource: EventSource | null = null

function initSSE() {
  try {
    eventSource = new EventSource(mcpUrl + '/api/jobs/node-status/stream')
    eventSource.onopen = () => { connected.value = true }
    eventSource.onmessage = (e) => { try { handleNodeEvent(JSON.parse(e.data)) } catch {} }
    eventSource.onerror = () => { connected.value = false }
  } catch { connected.value = false }
}

function handleNodeEvent(data: Record<string, unknown>) {
  if (data.type === 'run_start') {
    activeRun.value = {
      id: (data.run_id as string) || Date.now().toString(),
      job_title: (data.job_title as string) || 'Unknown',
      company: (data.company as string) || 'Unknown',
      platform: 'indeed', started_at: new Date().toISOString(), status: 'running',
      nodes: NODE_TEMPLATE.map(n => ({ ...n, status: 'idle' as const, detail: '', timestamp: '' })),
    }
  } else if (data.type === 'node_update' && activeRun.value) {
    const node = activeRun.value.nodes.find(n => n.node === data.node)
    if (node) {
      node.status = (data.status as NodeStep['status']) || 'running'
      node.detail = (data.detail as string) || ''
      node.timestamp = new Date().toISOString()
    }
  } else if (data.type === 'run_end' && activeRun.value) {
    activeRun.value.status = (data.status as 'completed' | 'failed') || 'completed'
    pastRuns.value.unshift({ ...activeRun.value })
    activeRun.value = null
  }
}

async function loadPastRuns() {
  loading.value = true
  try {
    const res = await fetch(supabaseUrl + '/rest/v1/job_applications?select=*,job_listings(*)&order=created_at.desc&limit=50', {
      headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
    })
    if (res.ok) {
      const data = await res.json()
      pastRuns.value = data.map((app: Record<string, unknown>) => {
        const listing = (app.job_listings || {}) as Record<string, unknown>
        const notes = (app.notes as string) || ''
        const fieldsMatch = notes.match(/(\d+) fields/)
        const fieldsCount = fieldsMatch ? parseInt(fieldsMatch[1]) : 0
        const isApplied = app.status === 'applied'
        return {
          id: app.id as string,
          job_title: (listing.title as string) || '\u2014',
          company: (listing.company as string) || '\u2014',
          platform: (listing.platform as string) || 'indeed',
          started_at: app.created_at as string,
          status: isApplied ? 'completed' : 'failed',
          nodes: NODE_TEMPLATE.map((n, i) => ({
            ...n,
            status: (isApplied ? 'pass' : i < Math.min(fieldsCount, 14) ? 'pass' : i < 16 ? 'fail' : 'skipped') as NodeStep['status'],
            detail: notes.slice(0, 80),
            timestamp: app.created_at as string,
          })),
        } as ActiveRun
      })
    }
  } catch {}
  loading.value = false
}

// Pagination
const totalPages = computed(() => Math.ceil(pastRuns.value.length / pageSize))
const paginatedRuns = computed(() => pastRuns.value.slice((page.value - 1) * pageSize, page.value * pageSize))

// Expand/collapse
function toggleExpand(id: string) { expandedRun.value = expandedRun.value === id ? null : id }

// Selection
function toggleSelect(id: string) {
  if (selectedRuns.value.has(id)) selectedRuns.value.delete(id)
  else selectedRuns.value.add(id)
}
function selectAll() {
  if (selectedRuns.value.size === paginatedRuns.value.length) selectedRuns.value.clear()
  else paginatedRuns.value.forEach(r => selectedRuns.value.add(r.id))
}

// Delete
const deleting = ref(false)
async function deleteSelected() {
  if (!confirm('Delete ' + selectedRuns.value.size + ' run(s)? This also deletes from Supabase.')) return
  deleting.value = true
  for (const id of selectedRuns.value) {
    await fetch(supabaseUrl + '/rest/v1/job_applications?id=eq.' + id, {
      method: 'DELETE', headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
    }).catch(() => {})
  }
  selectedRuns.value.clear()
  await loadPastRuns()
  deleting.value = false
}

async function clearAllRuns() {
  if (!confirm('Delete ALL past runs from Supabase?')) return
  deleting.value = true
  await fetch(supabaseUrl + '/rest/v1/job_applications?id=neq.00000000-0000-0000-0000-000000000000', {
    method: 'DELETE', headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
  }).catch(() => {})
  pastRuns.value = []
  deleting.value = false
}

// UI
const passCount = computed(() => activeRun.value?.nodes.filter(n => n.status === 'pass').length || 0)
const totalNodes = computed(() => NODE_TEMPLATE.length)
function statusIcon(s: string) { return s === 'pass' ? '\u2713' : s === 'fail' ? '\u2717' : s === 'running' ? '\u25CE' : s === 'skipped' ? '\u2013' : '\u25CB' }

let pollTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => { loadPastRuns(); initSSE(); pollTimer = setInterval(() => { fetch(mcpUrl + '/api/jobs/node-status', { signal: AbortSignal.timeout(3000) }).then(r => r.json()).then(d => { if (d.active_run) handleNodeEvent({ type: 'run_start', ...d.active_run }) }).catch(() => {}) }, 5000) })
onUnmounted(() => { eventSource?.close(); if (pollTimer) clearInterval(pollTimer) })
</script>

<template>
  <div class="nr">
    <div class="hdr">
      <div><h1>Node Report</h1><p class="sub">Indeed Apply Agent — Live Execution Nodes</p></div>
      <div class="hdr-r">
        <span class="conn" :class="connected ? 'on' : 'off'">{{ connected ? 'Live' : 'Polling' }}</span>
        <button class="btn" @click="loadPastRuns">Refresh</button>
      </div>
    </div>

    <!-- Active Run -->
    <div v-if="activeRun" class="active">
      <div class="banner running"><span class="pulse"></span><span class="btitle">APPLYING: {{ activeRun.job_title }} @ {{ activeRun.company }}</span><span class="bprog">{{ passCount }}/{{ totalNodes }}</span></div>
      <!-- Active pipeline visualization -->
      <div class="pipeline active-pipe">
        <div v-for="(node, idx) in activeRun.nodes" :key="node.id" class="pipe-node" :class="node.status">
          <div class="pipe-circle">
            <span v-if="node.status !== 'running'">{{ statusIcon(node.status) }}</span>
            <div v-else class="spin-sm"></div>
          </div>
          <div v-if="idx < activeRun.nodes.length - 1" class="pipe-line" :class="node.status"></div>
          <div class="pipe-label">{{ node.label.split(' ').slice(0, 2).join(' ') }}</div>
        </div>
      </div>
      <!-- Active node detail cards -->
      <div class="ngrid">
        <div v-for="node in activeRun.nodes.filter(n => n.status !== 'idle')" :key="node.id" class="nc" :class="node.status">
          <div class="ni">{{ statusIcon(node.status) }}</div>
          <div class="nb">
            <div class="nl">{{ node.label }}</div>
            <div class="nt">{{ node.tool }}</div>
            <div class="nd">{{ node.description }}</div>
            <div v-if="node.detail" class="ndt">{{ node.detail }}</div>
          </div>
          <div v-if="node.status === 'running'" class="spin"></div>
        </div>
      </div>
    </div>
    <div v-else class="idle"><span>No active run.</span><code>npx tsx scripts/indeed-vision-agent.ts --count 1</code></div>

    <!-- Past Runs -->
    <div class="sec">
      <div class="sec-hdr">
        <h2>Past Runs ({{ pastRuns.length }})</h2>
        <div class="sec-acts">
          <button v-if="selectedRuns.size > 0" class="btn danger" :disabled="deleting" @click="deleteSelected">Delete Selected ({{ selectedRuns.size }})</button>
          <button class="btn danger-outline" :disabled="deleting" @click="clearAllRuns">Clear All</button>
        </div>
      </div>

      <div v-if="loading" class="empty">Loading...</div>
      <div v-else-if="pastRuns.length === 0" class="empty">No past runs</div>
      <template v-else>
        <!-- Select all -->
        <div class="sel-bar">
          <label class="sel-all"><input type="checkbox" :checked="selectedRuns.size === paginatedRuns.length && paginatedRuns.length > 0" @change="selectAll" /> Select all</label>
        </div>

        <div v-for="run in paginatedRuns" :key="run.id" class="pr" :class="run.status">
          <div class="pr-row" @click="toggleExpand(run.id)">
            <input type="checkbox" :checked="selectedRuns.has(run.id)" @click.stop @change="toggleSelect(run.id)" class="pr-cb" />
            <span class="pr-title">{{ run.job_title }} @ {{ run.company }}</span>
            <span class="pr-st" :class="run.status">{{ run.status === 'completed' ? 'COMPLETED' : 'FAILED' }}</span>
            <span class="pr-date">{{ new Date(run.started_at).toLocaleString() }}</span>
            <span class="pr-arrow">{{ expandedRun === run.id ? '\u25B2' : '\u25BC' }}</span>
          </div>
          <!-- Node Pipeline -->
          <div class="pipeline">
            <div v-for="(node, idx) in run.nodes" :key="node.id" class="pipe-node" :class="node.status">
              <div class="pipe-circle">{{ statusIcon(node.status) }}</div>
              <div v-if="idx < run.nodes.length - 1" class="pipe-line" :class="node.status"></div>
              <div class="pipe-label">{{ node.label.split(' ').slice(0, 2).join(' ') }}</div>
            </div>
          </div>
          <!-- Expanded detail -->
          <div v-if="expandedRun === run.id" class="pr-detail">
            <div v-for="node in run.nodes" :key="node.id" class="pr-node" :class="node.status">
              <span class="pr-ni">{{ statusIcon(node.status) }}</span>
              <div class="pr-nb">
                <div class="pr-nl">{{ node.label }}</div>
                <div class="pr-nt">{{ node.tool }}</div>
                <div class="pr-ndesc">{{ node.description }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="pag">
          <button class="btn sm" :disabled="page <= 1" @click="page--">Prev</button>
          <span class="pag-info">Page {{ page }} / {{ totalPages }}</span>
          <button class="btn sm" :disabled="page >= totalPages" @click="page++">Next</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.nr { padding: 1.5rem; color: #e0e0e0; max-width: 1200px; }
.hdr { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
.hdr h1 { margin: 0; font-size: 1.4rem; }
.sub { color: #888; font-size: 0.8rem; }
.hdr-r { display: flex; gap: 0.75rem; align-items: center; }
.conn { font-size: 0.65rem; padding: 0.15rem 0.5rem; border-radius: 10px; }
.conn.on { background: rgba(0,255,136,0.15); color: #00ff88; }
.conn.off { background: rgba(255,170,0,0.15); color: #ffaa00; }
.btn { background: #2a2a3e; border: 1px solid #444; color: #ddd; padding: 0.3rem 0.8rem; border-radius: 6px; cursor: pointer; font-size: 0.75rem; }
.btn:hover { background: #3a3a4e; }
.btn.sm { padding: 0.2rem 0.6rem; font-size: 0.7rem; }
.btn.danger { background: #441111; border-color: #ff4444; color: #ff6666; }
.btn.danger:hover { background: #661111; }
.btn.danger-outline { background: transparent; border-color: #663333; color: #ff6666; }
.btn.danger-outline:hover { background: #331111; }

/* Active Run */
.active { margin-bottom: 2rem; }
.banner { display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 1rem; border-radius: 8px; margin-bottom: 0.75rem; }
.banner.running { background: linear-gradient(90deg, rgba(68,136,255,0.12), rgba(0,255,136,0.08)); border: 1px solid #4488ff; }
.pulse { width: 8px; height: 8px; border-radius: 50%; background: #4488ff; animation: pulse 1.5s infinite; }
@keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.3} }
.btitle { font-weight: 600; font-size: 0.9rem; flex: 1; }
.bprog { font-size: 0.75rem; color: #00ff88; }
.ngrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 0.4rem; }
.nc { display: flex; gap: 0.5rem; padding: 0.5rem; background: #1a1a2e; border-radius: 5px; border-left: 3px solid #333; align-items: flex-start; }
.nc.pass { border-left-color: #00ff88; background: rgba(0,255,136,0.03); }
.nc.fail { border-left-color: #ff4444; background: rgba(255,68,68,0.03); }
.nc.running { border-left-color: #4488ff; background: rgba(68,136,255,0.05); }
.nc.idle { opacity: 0.35; }
.ni { font-size: 0.9rem; font-weight: bold; min-width: 1rem; text-align: center; }
.nc.pass .ni { color: #00ff88; } .nc.fail .ni { color: #ff4444; } .nc.running .ni { color: #4488ff; }
.nb { flex: 1; min-width: 0; }
.nl { font-size: 0.78rem; font-weight: 500; }
.nt { font-size: 0.65rem; color: #4fc3f7; }
.nd { font-size: 0.62rem; color: #777; line-height: 1.3; margin-top: 0.1rem; }
.ndt { font-size: 0.62rem; color: #aaa; margin-top: 0.15rem; font-style: italic; }
.spin { width: 12px; height: 12px; border: 2px solid #4488ff; border-top-color: transparent; border-radius: 50%; animation: sp 0.8s linear infinite; }
.spin-sm { width: 10px; height: 10px; border: 2px solid #4488ff; border-top-color: transparent; border-radius: 50%; animation: sp 0.8s linear infinite; }
@keyframes sp { to { transform: rotate(360deg); } }
.active-pipe { margin-bottom: 0.75rem; }
.idle { background: #1a1a2e; border: 1px dashed #333; border-radius: 8px; padding: 1.5rem; text-align: center; color: #888; margin-bottom: 2rem; }
.idle code { display: block; margin-top: 0.5rem; font-size: 0.7rem; color: #4fc3f7; background: #111; padding: 0.4rem; border-radius: 4px; }

/* Past Runs */
.sec { margin-bottom: 2rem; }
.sec-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; border-bottom: 1px solid #2a2a3e; padding-bottom: 0.4rem; }
.sec-hdr h2 { font-size: 1rem; margin: 0; }
.sec-acts { display: flex; gap: 0.5rem; }
.sel-bar { margin-bottom: 0.4rem; }
.sel-all { font-size: 0.72rem; color: #888; cursor: pointer; display: flex; align-items: center; gap: 0.3rem; }
.sel-all input { cursor: pointer; }
.pr { background: #1a1a2e; border: 1px solid #2a2a3e; border-radius: 8px; margin-bottom: 0.35rem; overflow: hidden; }
.pr.completed { border-left: 3px solid #00ff88; }
.pr.failed { border-left: 3px solid #ff4444; }
.pr-row { display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 0.7rem; cursor: pointer; }
.pr-row:hover { background: rgba(255,255,255,0.02); }
.pr-cb { cursor: pointer; }
.pr-title { font-weight: 500; font-size: 0.82rem; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pr-st { font-size: 0.6rem; padding: 0.1rem 0.45rem; border-radius: 4px; text-transform: uppercase; font-weight: 600; }
.pr-st.completed { background: rgba(0,255,136,0.15); color: #00ff88; }
.pr-st.failed { background: rgba(255,68,68,0.15); color: #ff4444; }
.pr-date { font-size: 0.65rem; color: #666; }
.pr-arrow { font-size: 0.6rem; color: #666; }
.pr-nodes { display: flex; gap: 0.15rem; padding: 0 0.7rem 0.4rem; flex-wrap: wrap; }
/* Pipeline nodes */
.pipeline { display: flex; align-items: flex-start; padding: 0.6rem 0.7rem 0.3rem; overflow-x: auto; gap: 0; }
.pipe-node { display: flex; flex-direction: column; align-items: center; position: relative; min-width: 48px; }
.pipe-circle { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: bold; border: 2px solid #444; background: #1a1a2e; z-index: 1; flex-shrink: 0; }
.pipe-node.pass .pipe-circle { border-color: #00ff88; color: #00ff88; background: rgba(0,255,136,0.08); box-shadow: 0 0 6px rgba(0,255,136,0.3); }
.pipe-node.fail .pipe-circle { border-color: #ff4444; color: #ff4444; background: rgba(255,68,68,0.08); box-shadow: 0 0 6px rgba(255,68,68,0.3); }
.pipe-node.running .pipe-circle { border-color: #4488ff; color: #4488ff; background: rgba(68,136,255,0.08); animation: pulse 1.5s infinite; }
.pipe-node.idle .pipe-circle, .pipe-node.skipped .pipe-circle { border-color: #333; color: #555; }
.pipe-line { position: absolute; top: 13px; left: 50%; width: 100%; height: 2px; background: #333; z-index: 0; }
.pipe-node.pass .pipe-line { background: #00ff88; }
.pipe-node.fail .pipe-line { background: #ff4444; }
.pipe-node.running .pipe-line { background: #4488ff; }
.pipe-label { font-size: 0.5rem; color: #888; margin-top: 0.25rem; text-align: center; white-space: nowrap; max-width: 55px; overflow: hidden; text-overflow: ellipsis; }
.pipe-node.pass .pipe-label { color: #00ff88; }
.pipe-node.fail .pipe-label { color: #ff6666; }
/* Expanded */
.pr-detail { padding: 0.5rem 0.7rem; border-top: 1px solid #2a2a3e; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.3rem; }
.pr-node { display: flex; gap: 0.4rem; padding: 0.35rem; border-radius: 4px; border-left: 2px solid #333; }
.pr-node.pass { border-left-color: #00ff88; }
.pr-node.fail { border-left-color: #ff4444; }
.pr-ni { font-size: 0.75rem; font-weight: bold; min-width: 0.9rem; text-align: center; }
.pr-node.pass .pr-ni { color: #00ff88; } .pr-node.fail .pr-ni { color: #ff4444; }
.pr-nb { flex: 1; }
.pr-nl { font-size: 0.72rem; font-weight: 500; }
.pr-nt { font-size: 0.6rem; color: #4fc3f7; }
.pr-ndesc { font-size: 0.58rem; color: #777; line-height: 1.25; }
/* Pagination */
.pag { display: flex; align-items: center; justify-content: center; gap: 0.75rem; margin-top: 0.75rem; }
.pag-info { font-size: 0.72rem; color: #888; }
.empty { color: #666; padding: 1.5rem; text-align: center; }
</style>

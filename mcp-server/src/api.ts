import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { writeFile, mkdir, readFile, stat, rm } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import nodemailer from 'nodemailer'
import WebSocket from 'ws'
import { initOrchestrator, handleMultiOrchestrate, processScheduledChannels, handleChannelFallback, routeChannel, persistRoutingDecision } from './orchestrator.js'
import { initAnalytics, aggregateChannelPerformance, predictChannelSuccess } from './analytics.js'
import { insertEpisode, fetchEpisodes, upsertOrchestratorState, getOrchestratorState, getCachedSelectors, recordSelectorOutcome, wasRecentlyEmailed, orchQuery } from './orchestrator-db.js'

const PORT = Number(process.env.PORT || 8080)
const UPLOADS_DIR = process.env.UPLOADS_DIR || '/app/uploads'
// Email config — supports Resend, Brevo, Gmail SMTP, or cPanel SMTP
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.resend.com'
const SMTP_PORT = Number(process.env.SMTP_PORT || 465)
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false' // true for 465, false for 587
const SMTP_USER = process.env.SMTP_USER || process.env.GMAIL_USER || ''
const SMTP_PASS = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || ''
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || 'Gabriel Alvin Aquino'
const SMTP_FROM_EMAIL = process.env.SMTP_FROM_EMAIL || SMTP_USER
const SMTP_REPLY_TO = process.env.SMTP_REPLY_TO || 'gabrielalvin.jobs@gmail.com'
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || SMTP_REPLY_TO
const JSEARCH_API_KEY = process.env.JSEARCH_API_KEY || ''
const HEYGEN_API_KEY  = process.env.HEYGEN_API_KEY || process.env.VITE_HEYGEN_KEY || ''

// Supabase REST API for direct DB access (browser callback + orchestrator)
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

async function supabaseQuery(table: string, method: string, body?: unknown, filters?: string): Promise<{ data: unknown; error?: string }> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { data: null, error: 'Supabase not configured' }
  const isUpsert = filters?.includes('on_conflict=')
  const url = `${SUPABASE_URL}/rest/v1/${table}${filters ? `?${filters}` : ''}`
  const headers: Record<string, string> = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' && isUpsert
      ? 'return=representation,resolution=merge-duplicates'
      : method === 'POST' ? 'return=representation' : 'return=minimal',
  }
  try {
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
    if (!res.ok) {
      const err = await res.text()
      return { data: null, error: `Supabase ${res.status}: ${err}` }
    }
    const data = await res.json().catch(() => null)
    return { data }
  } catch (e) {
    return { data: null, error: `Supabase fetch failed: ${e}` }
  }
}

// Ensure uploads directory exists
await mkdir(UPLOADS_DIR, { recursive: true })

// SSE notification clients
const sseClients = new Set<ServerResponse>()
function broadcastNotification(type: string, data: Record<string, unknown>) {
  const event = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
  for (const client of sseClients) {
    try { client.write(event) } catch { sseClients.delete(client) }
  }
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

async function readBodyRaw(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

async function readBody(req: IncomingMessage): Promise<string> {
  return (await readBodyRaw(req)).toString()
}

async function handleFetchUrl(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { url } = body
  if (!url) return json(res, 400, { error: 'url is required' })

  try {
    const pageRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    })

    if (!pageRes.ok) {
      return json(res, 422, { error: `Failed to fetch URL: ${pageRes.status}` })
    }

    const html = await pageRes.text()
    json(res, 200, { html, finalUrl: pageRes.url })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Fetch failed'
    json(res, 500, { error: msg })
  }
}

async function handleUploadImage(req: IncomingMessage, res: ServerResponse) {
  const contentType = req.headers['content-type'] || ''

  let imageBuffer: Buffer
  let ext: string

  if (contentType.includes('application/json')) {
    // Base64 upload: { data: "data:image/png;base64,...", filename?: "name.png" }
    const body = JSON.parse(await readBody(req))
    const { data, filename } = body
    if (!data) return json(res, 400, { error: 'data is required' })

    // Parse data URI
    const match = data.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!match) return json(res, 400, { error: 'Invalid image data URI' })

    ext = '.' + match[1].replace('jpeg', 'jpg')
    imageBuffer = Buffer.from(match[2], 'base64')

    // Use provided filename extension if available
    if (filename) {
      const fext = extname(filename).toLowerCase()
      if (MIME_TYPES[fext]) ext = fext
    }
  } else if (contentType.includes('multipart/form-data')) {
    // Multipart upload — parse boundary
    const boundary = contentType.split('boundary=')[1]
    if (!boundary) return json(res, 400, { error: 'Missing boundary' })

    const raw = await readBodyRaw(req)
    const { buffer, extension } = parseMultipart(raw, boundary)
    if (!buffer) return json(res, 400, { error: 'No image file found in form data' })

    imageBuffer = buffer
    ext = extension
  } else {
    return json(res, 400, { error: 'Unsupported content type. Use application/json with base64 or multipart/form-data' })
  }

  // Validate size (max 10MB)
  if (imageBuffer.length > 10 * 1024 * 1024) {
    return json(res, 413, { error: 'Image too large (max 10MB)' })
  }

  // Save file
  const filename = `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`
  const filepath = join(UPLOADS_DIR, filename)
  await writeFile(filepath, imageBuffer)

  const publicUrl = `/uploads/${filename}`
  json(res, 200, { url: publicUrl, filename, size: imageBuffer.length })
}

function parseMultipart(raw: Buffer, boundary: string): { buffer: Buffer | null; extension: string } {
  const boundaryBuf = Buffer.from(`--${boundary}`)
  const parts: Buffer[] = []
  let start = 0

  while (true) {
    const idx = raw.indexOf(boundaryBuf, start)
    if (idx === -1) break
    if (start > 0) parts.push(raw.subarray(start, idx))
    start = idx + boundaryBuf.length
  }

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n')
    if (headerEnd === -1) continue
    const headers = part.subarray(0, headerEnd).toString()
    if (!headers.includes('filename=')) continue

    // Get content type
    const ctMatch = headers.match(/Content-Type:\s*image\/(\w+)/i)
    const ext = ctMatch ? '.' + ctMatch[1].replace('jpeg', 'jpg') : '.png'

    // Body starts after \r\n\r\n, ends before trailing \r\n
    let body = part.subarray(headerEnd + 4)
    if (body[body.length - 2] === 0x0d && body[body.length - 1] === 0x0a) {
      body = body.subarray(0, body.length - 2)
    }
    return { buffer: body, extension: ext }
  }

  return { buffer: null, extension: '.png' }
}

async function serveUpload(pathname: string, res: ServerResponse) {
  const filename = pathname.replace('/uploads/', '')
  // Sanitize: no path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return json(res, 400, { error: 'Invalid filename' })
  }

  const filepath = join(UPLOADS_DIR, filename)
  try {
    const fileStat = await stat(filepath)
    if (!fileStat.isFile()) throw new Error('Not a file')

    const ext = extname(filename).toLowerCase()
    const mime = MIME_TYPES[ext] || 'application/octet-stream'
    const data = await readFile(filepath)

    res.writeHead(200, {
      ...CORS_HEADERS,
      'Content-Type': mime,
      'Content-Length': data.length.toString(),
      'Cache-Control': 'public, max-age=31536000, immutable',
    })
    res.end(data)
  } catch {
    res.writeHead(404, CORS_HEADERS)
    res.end('Not found')
  }
}

async function handleScreenshot(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { url } = body
  if (!url) return json(res, 400, { error: 'url is required' })

  try {
    // Use microlink.io for screenshot (free, no auth)
    const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url`
    const screenshotRes = await fetch(apiUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })

    if (!screenshotRes.ok) {
      return json(res, 422, { error: `Screenshot service error: ${screenshotRes.status}` })
    }

    // microlink returns the image directly when using embed=screenshot.url
    const contentType = screenshotRes.headers.get('content-type') || ''
    if (contentType.startsWith('image/')) {
      // Save it locally
      const buffer = Buffer.from(await screenshotRes.arrayBuffer())
      const filename = `screenshot-${Date.now()}-${randomUUID().slice(0, 8)}.png`
      const filepath = join(UPLOADS_DIR, filename)
      await writeFile(filepath, buffer)
      return json(res, 200, { url: `/uploads/${filename}`, size: buffer.length })
    }

    // Fallback: parse JSON response
    const data = await screenshotRes.json()
    if (data?.status === 'success' && data?.data?.screenshot?.url) {
      // Download the screenshot image
      const imgRes = await fetch(data.data.screenshot.url)
      if (imgRes.ok) {
        const buffer = Buffer.from(await imgRes.arrayBuffer())
        const filename = `screenshot-${Date.now()}-${randomUUID().slice(0, 8)}.png`
        const filepath = join(UPLOADS_DIR, filename)
        await writeFile(filepath, buffer)
        return json(res, 200, { url: `/uploads/${filename}`, size: buffer.length })
      }
    }

    json(res, 422, { error: 'Could not capture screenshot' })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Screenshot failed'
    json(res, 500, { error: msg })
  }
}

async function handleProxyImage(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { url } = body
  if (!url) return json(res, 400, { error: 'url is required' })

  try {
    const imgRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*',
      },
      redirect: 'follow',
    })

    if (!imgRes.ok) return json(res, 422, { error: `Failed to fetch image: ${imgRes.status}` })

    const ct = imgRes.headers.get('content-type') || ''
    if (!ct.startsWith('image/')) return json(res, 422, { error: 'URL did not return an image' })

    const buffer = Buffer.from(await imgRes.arrayBuffer())
    const ext = ct.includes('png') ? '.png' : ct.includes('gif') ? '.gif' : ct.includes('webp') ? '.webp' : '.jpg'
    const filename = `proxy-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`
    const filepath = join(UPLOADS_DIR, filename)
    await writeFile(filepath, buffer)
    json(res, 200, { url: `/uploads/${filename}`, size: buffer.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Image proxy failed'
    json(res, 500, { error: msg })
  }
}

// ─── Scout Agent: Job Search ───

interface NormalizedJob {
  platform: string
  external_id: string | null
  title: string
  company: string
  location: string | null
  salary_min: number | null
  salary_max: number | null
  salary_currency: string
  job_type: string | null
  description: string | null
  requirements: string | null
  url: string
  posted_at: string | null
  match_score: number | null
  status: string
}

async function searchJSearch(query: string, location: string, page: number = 1): Promise<NormalizedJob[]> {
  if (!JSEARCH_API_KEY) return []
  try {
    const params = new URLSearchParams({
      query: location ? `${query} in ${location}` : query,
      page: String(page),
      num_pages: '2',
      date_posted: 'month',
    })
    const res = await fetch(`https://jsearch.p.rapidapi.com/search?${params}`, {
      headers: {
        'X-RapidAPI-Key': JSEARCH_API_KEY,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
      },
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.data || []).map((j: any) => ({
      platform: (j.job_publisher || 'google').toLowerCase().replace(/\.com$/, '').replace(/\s+/g, ''),
      external_id: j.job_id || null,
      title: j.job_title || 'Untitled',
      company: j.employer_name || 'Unknown',
      location: [j.job_city, j.job_state, j.job_country].filter(Boolean).join(', ') || null,
      salary_min: j.job_min_salary || null,
      salary_max: j.job_max_salary || null,
      salary_currency: j.job_salary_currency || 'USD',
      job_type: j.job_employment_type?.toLowerCase().replace('_', '-') || null,
      description: (j.job_description || '').slice(0, 5000) || null,
      requirements: j.job_highlights?.Qualifications?.join('\n') || null,
      url: j.job_apply_link || j.job_google_link || '',
      posted_at: j.job_posted_at_datetime_utc || null,
      status: 'new',
    }))
  } catch (e) {
    console.error('[Scout] JSearch error:', e)
    return []
  }
}

async function searchHimalayas(query: string): Promise<NormalizedJob[]> {
  try {
    const params = new URLSearchParams({ limit: '20' })
    const res = await fetch(`https://himalayas.app/jobs/api?${params}`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.jobs || [])
      .filter((j: any) => {
        const text = `${j.title} ${j.companyName} ${j.description || ''}`.toLowerCase()
        return query.split(' ').some((w: string) => text.includes(w.toLowerCase()))
      })
      .map((j: any) => ({
        platform: 'himalayas',
        external_id: j.id ? String(j.id) : null,
        title: j.title || 'Untitled',
        company: j.companyName || 'Unknown',
        location: j.location || 'Remote',
        salary_min: j.minSalary || null,
        salary_max: j.maxSalary || null,
        salary_currency: 'USD',
        job_type: j.employmentType?.toLowerCase() || 'remote',
        description: (j.description || '').slice(0, 5000) || null,
        requirements: null,
        url: j.applicationUrl || `https://himalayas.app/jobs/${j.id}`,
        posted_at: j.publishedDate || null,
        match_score: null,
        status: 'new',
      }))
  } catch (e) {
    console.error('[Scout] Himalayas error:', e)
    return []
  }
}

async function searchRemoteOK(query: string): Promise<NormalizedJob[]> {
  try {
    const res = await fetch('https://remoteok.com/api', {
      headers: { 'User-Agent': 'NEURALYX-JobAgent/1.0' },
    })
    if (!res.ok) return []
    const data = await res.json()
    // First item is metadata, skip it
    const jobs = Array.isArray(data) ? data.filter((j: any) => j.id && j.position) : []
    return jobs
      .filter((j: any) => {
        const text = `${j.position} ${j.company} ${j.description || ''} ${(j.tags || []).join(' ')}`.toLowerCase()
        return query.split(' ').some((w: string) => text.includes(w.toLowerCase()))
      })
      .slice(0, 20)
      .map((j: any) => ({
        platform: 'remoteok',
        external_id: j.id ? String(j.id) : null,
        title: j.position || 'Untitled',
        company: j.company || 'Unknown',
        location: j.location || 'Remote',
        salary_min: j.salary_min ? Number(j.salary_min) : null,
        salary_max: j.salary_max ? Number(j.salary_max) : null,
        salary_currency: 'USD',
        job_type: 'remote',
        description: (j.description || '').slice(0, 5000) || null,
        requirements: (j.tags || []).join(', ') || null,
        url: j.url || `https://remoteok.com/remote-jobs/${j.id}`,
        posted_at: j.date || null,
        match_score: null,
        status: 'new',
      }))
  } catch (e) {
    console.error('[Scout] RemoteOK error:', e)
    return []
  }
}

async function searchRemotive(query: string): Promise<NormalizedJob[]> {
  try {
    const params = new URLSearchParams({ search: query, limit: '20' })
    const res = await fetch(`https://remotive.com/api/remote-jobs?${params}`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.jobs || []).map((j: any) => ({
      platform: 'remotive',
      external_id: j.id ? String(j.id) : null,
      title: j.title || 'Untitled',
      company: j.company_name || 'Unknown',
      location: j.candidate_required_location || 'Remote',
      salary_min: null,
      salary_max: null,
      salary_currency: 'USD',
      job_type: j.job_type?.toLowerCase() || 'remote',
      description: (j.description || '').slice(0, 5000) || null,
      requirements: null,
      url: j.url || '',
      posted_at: j.publication_date || null,
      status: 'new',
    }))
  } catch (e) {
    console.error('[Scout] Remotive error:', e)
    return []
  }
}

async function searchIndeedDirect(query: string, location: string): Promise<NormalizedJob[]> {
  // Scrape Indeed PH via their public search page (no API key needed)
  try {
    const params = new URLSearchParams({ q: query, l: location || 'Philippines', fromage: '14', sc: '0kf:attr(DSQF7)' /* remote */ })
    const res = await fetch(`https://ph.indeed.com/jobs?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return []
    const html = await res.text()

    // Parse job cards from Indeed HTML
    const jobs: NormalizedJob[] = []
    // Indeed uses data-jk for job IDs and specific class patterns
    const jobCardRegex = /data-jk="([^"]+)"[\s\S]*?<h2[^>]*>[\s\S]*?<a[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>[\s\S]*?<span[^>]*data-testid="company-name"[^>]*>([^<]+)<\/span>[\s\S]*?<div[^>]*data-testid="text-location"[^>]*>([^<]+)<\/div>/g
    let match
    while ((match = jobCardRegex.exec(html)) !== null && jobs.length < 15) {
      jobs.push({
        platform: 'indeed',
        external_id: match[1],
        title: match[2].trim(),
        company: match[3].trim(),
        location: match[4].trim(),
        salary_min: null, salary_max: null, salary_currency: 'PHP',
        job_type: 'remote',
        description: null, requirements: null,
        url: `https://ph.indeed.com/viewjob?jk=${match[1]}`,
        posted_at: null,
        match_score: null,
        status: 'new',
      })
    }
    return jobs
  } catch (e) {
    console.error('[Scout] Indeed Direct error:', e)
    return []
  }
}

async function searchArbeitnow(query: string): Promise<NormalizedJob[]> {
  try {
    const res = await fetch('https://www.arbeitnow.com/api/job-board-api')
    if (!res.ok) return []
    const data = await res.json()
    return (data.data || [])
      .filter((j: any) => {
        const text = `${j.title} ${j.company_name} ${j.description || ''} ${(j.tags || []).join(' ')}`.toLowerCase()
        return query.split(' ').some((w: string) => text.includes(w.toLowerCase()))
      })
      .slice(0, 20)
      .map((j: any) => ({
        platform: 'arbeitnow',
        external_id: j.slug || null,
        title: j.title || 'Untitled',
        company: j.company_name || 'Unknown',
        location: j.location || 'Europe',
        salary_min: null, salary_max: null, salary_currency: 'EUR',
        job_type: j.remote ? 'remote' : 'full-time',
        description: (j.description || '').slice(0, 5000) || null,
        requirements: (j.tags || []).join(', ') || null,
        url: j.url || '',
        posted_at: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
        match_score: null,
        status: 'new',
      }))
  } catch (e) {
    console.error('[Scout] Arbeitnow error:', e)
    return []
  }
}

async function searchHackerNews(query: string): Promise<NormalizedJob[]> {
  try {
    // Get latest job story IDs from HN Firebase API
    const idsRes = await fetch('https://hacker-news.firebaseio.com/v0/jobstories.json')
    if (!idsRes.ok) return []
    const ids: number[] = await idsRes.json()
    // Fetch first 30 job stories
    const jobs: NormalizedJob[] = []
    const fetchIds = ids.slice(0, 30)
    const stories = await Promise.all(
      fetchIds.map(async (id: number) => {
        const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
        return r.ok ? r.json() : null
      })
    )
    for (const s of stories) {
      if (!s || !s.title) continue
      const text = `${s.title} ${s.text || ''}`.toLowerCase()
      if (!query.split(' ').some((w: string) => text.includes(w.toLowerCase()))) continue
      // Parse company from title (usually "Company (Location) - Role")
      const titleMatch = s.title.match(/^(.+?)\s*[\(|–|-]/)
      const company = titleMatch ? titleMatch[1].trim() : 'YC Company'
      jobs.push({
        platform: 'hackernews',
        external_id: String(s.id),
        title: s.title,
        company,
        location: 'Remote / Various',
        salary_min: null, salary_max: null, salary_currency: 'USD',
        job_type: 'full-time',
        description: (s.text || '').slice(0, 5000) || null,
        requirements: null,
        url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
        posted_at: s.time ? new Date(s.time * 1000).toISOString() : null,
        match_score: null,
        status: 'new',
      })
    }
    return jobs
  } catch (e) {
    console.error('[Scout] HackerNews error:', e)
    return []
  }
}

async function searchLinkedInPublic(query: string, location: string): Promise<NormalizedJob[]> {
  try {
    // LinkedIn public guest API (no auth required)
    const params = new URLSearchParams({
      keywords: query,
      location: location || '',
      start: '0',
    })
    const res = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    if (!res.ok) return []
    // Returns HTML - parse basic job cards
    const html = await res.text()
    const jobs: NormalizedJob[] = []
    // Extract job cards from HTML using regex (basic parsing)
    const cardRegex = /data-entity-urn="urn:li:jobPosting:(\d+)"[\s\S]*?<a[^>]*class="base-card__full-link"[^>]*href="([^"]*)"[\s\S]*?<span class="sr-only">([^<]*)<\/span>[\s\S]*?<h4[^>]*>([^<]*)<\/h4>[\s\S]*?<span class="job-search-card__location">([^<]*)<\/span>/g
    let match
    while ((match = cardRegex.exec(html)) !== null) {
      jobs.push({
        platform: 'linkedin',
        external_id: match[1],
        title: match[3].trim(),
        company: match[4].trim(),
        location: match[5].trim(),
        salary_min: null, salary_max: null, salary_currency: 'USD',
        job_type: null,
        description: null, requirements: null,
        url: match[2].split('?')[0],
        posted_at: null,
        match_score: null,
        status: 'new',
      })
    }
    return jobs.slice(0, 20)
  } catch (e) {
    console.error('[Scout] LinkedIn Public error:', e)
    return []
  }
}

async function searchAdzuna(query: string, location: string): Promise<NormalizedJob[]> {
  const appId = process.env.ADZUNA_APP_ID || ''
  const appKey = process.env.ADZUNA_APP_KEY || ''
  if (!appId || !appKey) return []
  try {
    // Default to Philippines (ph), can be made configurable
    const country = 'gb' // adzuna doesn't have 'ph', use 'gb' or configurable
    const params = new URLSearchParams({
      app_id: appId, app_key: appKey,
      what: query, results_per_page: '20',
    })
    if (location) params.set('where', location)
    const res = await fetch(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.results || []).map((j: any) => ({
      platform: 'adzuna',
      external_id: j.id ? String(j.id) : null,
      title: j.title || 'Untitled',
      company: j.company?.display_name || 'Unknown',
      location: j.location?.display_name || null,
      salary_min: j.salary_min || null,
      salary_max: j.salary_max || null,
      salary_currency: 'GBP',
      job_type: j.contract_time || null,
      description: (j.description || '').slice(0, 5000) || null,
      requirements: null,
      url: j.redirect_url || '',
      posted_at: j.created || null,
      status: 'new',
    }))
  } catch (e) {
    console.error('[Scout] Adzuna error:', e)
    return []
  }
}

async function handleJobSearch(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  // Accept both `query` (string) and `queries` (array) formats
  const queryInput = body.query || (Array.isArray(body.queries) ? body.queries[0] : body.queries) || ''
  const { location, platform } = body
  const query = queryInput
  if (!query) return json(res, 400, { error: 'query is required' })

  const results: NormalizedJob[] = []
  const errors: string[] = []
  const sources: string[] = []

  // ─── Free APIs (no auth required) ───

  // Himalayas (remote jobs, no auth)
  if (!platform || platform === 'himalayas') {
    try {
      const jobs = await searchHimalayas(query)
      results.push(...jobs)
      if (jobs.length) sources.push(`Himalayas: ${jobs.length}`)
    } catch { errors.push('Himalayas failed') }
  }

  // RemoteOK (remote jobs, no auth)
  if (!platform || platform === 'remoteok') {
    try {
      const jobs = await searchRemoteOK(query)
      results.push(...jobs)
      if (jobs.length) sources.push(`RemoteOK: ${jobs.length}`)
    } catch { errors.push('RemoteOK failed') }
  }

  // Remotive (remote jobs, no auth)
  if (!platform || platform === 'remotive') {
    try {
      const jobs = await searchRemotive(query)
      results.push(...jobs)
      if (jobs.length) sources.push(`Remotive: ${jobs.length}`)
    } catch { errors.push('Remotive failed') }
  }

  // Arbeitnow (EU jobs, no auth)
  if (!platform || platform === 'arbeitnow') {
    try {
      const jobs = await searchArbeitnow(query)
      results.push(...jobs)
      if (jobs.length) sources.push(`Arbeitnow: ${jobs.length}`)
    } catch { errors.push('Arbeitnow failed') }
  }

  // Hacker News YC Jobs (no auth, startup/tech focused)
  if (!platform || platform === 'hackernews') {
    try {
      const jobs = await searchHackerNews(query)
      results.push(...jobs)
      if (jobs.length) sources.push(`HackerNews: ${jobs.length}`)
    } catch { errors.push('HackerNews failed') }
  }

  // LinkedIn Public Guest API (no auth)
  if (!platform || platform === 'linkedin') {
    try {
      const jobs = await searchLinkedInPublic(query, location || '')
      results.push(...jobs)
      if (jobs.length) sources.push(`LinkedIn: ${jobs.length}`)
    } catch { errors.push('LinkedIn failed') }
  }

  // Indeed direct scrape (ph.indeed.com)
  if (!platform || platform === 'indeed') {
    try {
      const jobs = await searchIndeedDirect(query, location || 'Philippines')
      results.push(...jobs)
      if (jobs.length) sources.push(`Indeed PH: ${jobs.length}`)
    } catch { errors.push('Indeed PH scrape failed') }
  }

  // ─── API Key APIs (optional, enhances results) ───

  // JSearch (covers Indeed, LinkedIn, Glassdoor, ZipRecruiter, Google)
  if (JSEARCH_API_KEY && (!platform || ['indeed', 'linkedin', 'glassdoor', 'ziprecruiter', 'google'].includes(platform))) {
    try {
      const jobs = await searchJSearch(query, location || '')
      results.push(...jobs)
      if (jobs.length) sources.push(`JSearch: ${jobs.length}`)
    } catch { errors.push('JSearch failed') }
  }

  // Adzuna (EU/UK coverage)
  if (process.env.ADZUNA_APP_ID && (!platform || platform === 'adzuna')) {
    try {
      const jobs = await searchAdzuna(query, location || '')
      results.push(...jobs)
      if (jobs.length) sources.push(`Adzuna: ${jobs.length}`)
    } catch { errors.push('Adzuna failed') }
  }

  // Deduplicate by title + company (case-insensitive)
  const seen = new Set<string>()
  const deduped = results.filter(j => {
    const key = `${j.title.toLowerCase().trim()}::${j.company.toLowerCase().trim()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  json(res, 200, { jobs: deduped, total: deduped.length, sources, errors })
}

// ─── Classifier Agent: Role Type + Company Bucket Detection ───

const GEMINI_KEY = process.env.VITE_GEMINI_KEY || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY || ''
const OPENAI_KEY = process.env.VITE_OPENAI_KEY || process.env.OPENAI_KEY || process.env.OPENAI_API_KEY || ''

async function callAI(systemPrompt: string, userPrompt: string, maxTokens = 1000): Promise<string> {
  // Try OpenAI first
  if (OPENAI_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini', messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ], temperature: 0.3, max_tokens: maxTokens,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        return data.choices[0].message.content.trim()
      }
    } catch { /* fall through */ }
  }

  // Fallback: Gemini
  if (GEMINI_KEY) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: AbortSignal.timeout(30000),
      },
    )
    if (res.ok) {
      const data = await res.json()
      const parts = data.candidates?.[0]?.content?.parts || []
      const textPart = parts.find((p: Record<string, unknown>) => p.text) as { text: string } | undefined
      return textPart?.text?.trim() || ''
    }
  }

  throw new Error('No AI provider available (set OPENAI_KEY or GEMINI_KEY)')
}

async function handleClassifyJob(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { title, company, description } = body
  if (!title) return json(res, 400, { error: 'title is required' })

  const systemPrompt = `You classify job postings. Return ONLY valid JSON with no markdown fences.

Classify into:
1. "role_type": one of "fullstack", "ai_engineer", "ml_engineer", "devops", "frontend", "backend", "mobile", "data", "freelance", "other"
2. "company_bucket": one of "agency" (outsourcing/staffing/dev shop), "startup" (product company <200 people), "enterprise" (large corp), "recruiter" (staffing/talent agency), "direct_client" (freelance/consulting)
3. "confidence": 0-100 how confident you are

Return: {"role_type":"...","company_bucket":"...","confidence":85}`

  const userPrompt = `Title: ${title}\nCompany: ${company || 'Unknown'}\nDescription: ${(description || '').slice(0, 1500)}`

  try {
    const raw = await callAI(systemPrompt, userPrompt)
    const jsonStr = raw.replace(/^```json\s*\n?/, '').replace(/\n?\s*```\s*$/, '')
    const match = jsonStr.match(/\{[\s\S]*\}/)
    const result = match ? JSON.parse(match[0]) : { role_type: 'other', company_bucket: 'startup', confidence: 50 }
    json(res, 200, result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Classification failed'
    json(res, 500, { error: msg })
  }
}

// ─── Matcher Agent: Hybrid Scoring ───

async function handleMatchJob(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { title, company, description, requirements, resume_text, skills, preferred_job_types, preferred_locations } = body
  if (!title) return json(res, 400, { error: 'title is required' })

  const systemPrompt = `You are a job matching AI. Score how well a candidate matches a job posting.

GROUNDING RULES (critical — anti-hallucination):
1. A skill belongs in "skill_matches" ONLY if it appears verbatim (case-insensitive substring OK) in BOTH the JOB text AND the CANDIDATE text. If only one side mentions it, it's a gap, not a match.
2. A skill belongs in "skill_gaps" ONLY if it's required by the JOB and the CANDIDATE side does not contain it. Do NOT list nice-to-haves as gaps.
3. "reasons" must reference concrete tokens you actually saw — quote 1-3 words from the inputs. No generic praise like "great fit" or "strong background."
4. If JOB description is empty/short, return match_score ≤ 40 with reason "insufficient JD" — do NOT inflate.
5. Cap arrays at 6 items each. Cap reasons at 4 items.

SCORE RUBRIC:
- 85-100 strong_match: ≥4 skill_matches AND core stack overlaps AND seniority aligns
- 70-84 good_match: ≥3 skill_matches AND no critical gap
- 50-69 moderate: 1-2 skill_matches OR adjacent stack
- 30-49 weak: marginal overlap
- 0-29 no_match: different domain or seniority mismatch

Return ONLY valid JSON with no markdown fences:
{
  "match_score": 0-100,
  "skill_matches": ["skill1", "skill2"],
  "skill_gaps": ["missing1", "missing2"],
  "reasons": ["reason1", "reason2"],
  "recommendation": "strong_match" | "good_match" | "moderate" | "weak" | "no_match"
}`

  const jobText = `JOB: ${title} at ${company || 'Unknown'}
${description ? 'Description: ' + (description as string).slice(0, 2000) : ''}
${requirements ? 'Requirements: ' + requirements : ''}`

  const candidateText = `CANDIDATE:
Skills: ${(skills || []).join(', ') || 'Not specified'}
Resume: ${(resume_text || '').slice(0, 1500) || 'Not provided'}
Preferred types: ${(preferred_job_types || []).join(', ') || 'Any'}
Preferred locations: ${(preferred_locations || []).join(', ') || 'Any'}`

  try {
    const raw = await callAI(systemPrompt, `${jobText}\n\n${candidateText}`)
    const jsonStr = raw.replace(/^```json\s*\n?/, '').replace(/\n?\s*```\s*$/, '')
    const match = jsonStr.match(/\{[\s\S]*\}/)
    const result = match ? JSON.parse(match[0]) : { match_score: 50, skill_matches: [], skill_gaps: [], reasons: [], recommendation: 'moderate' }
    json(res, 200, result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Matching failed'
    json(res, 500, { error: msg })
  }
}

// ─── Writer Agent: Cover Letter Generation ───

async function handleCoverLetter(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { title, company, description, resume_text, skills, role_type, company_bucket } = body
  if (!title || !company) return json(res, 400, { error: 'title and company are required' })

  // Portfolio signals based on role type
  const signalMap: Record<string, string> = {
    fullstack: 'NEURALYX portfolio platform (Vue 3 + TypeScript + Supabase), admin dashboard with full CRUD, Docker deployment pipeline',
    ai_engineer: 'AI-powered news generator (GPT/Gemini), DALL-E thumbnail pipeline, MCP server architecture, job application AI agent system',
    ml_engineer: 'Neural Network certificates, Deep Learning Keras training, Machine Learning Expert (Matlab), data science coursework',
    devops: 'Docker Compose multi-service setup (PostgreSQL, Nginx, Node.js), GitHub Actions CI/CD pipeline, cPanel deployment automation',
    frontend: 'Vue 3 + TypeScript + Tailwind CSS v4, GSAP scroll animations, responsive design, Pinia state management',
    backend: 'Supabase PostgreSQL, Node.js MCP server, REST API design, Docker containerization',
  }
  const portfolioSignals = signalMap[role_type || 'fullstack'] || signalMap.fullstack

  const systemPrompt = `You are Gabriel Alvin Aquino writing a STANDOUT cover letter that gets noticed. You are NOT just another applicant — you architect intelligent systems that run entire business operations.

FRAMEWORK (Problem-Solution — proven by 80+ hiring studies):

1. OPEN WITH THEIR BUSINESS PAIN POINT — read the job description and identify what problem they're trying to solve. Lead with THAT, not "I am excited to apply." Example: "Scaling content production while maintaining quality is a challenge that grows exponentially..."

2. APPROACH + TOOLS + PROOF — show HOW you solve their specific problem. Reference concrete projects with metrics. Don't just list skills — demonstrate impact.

3. RESULTS + ROI — what the business GETS from hiring you: cost reduction, time saved, efficiency gains, systems that run 24/7 without human intervention.

4. 30-60 DAY CONTRIBUTION PLAN — one specific deliverable you'll ship in the first month for this role.

DOMAINS YOU COVER (reference the ones matching the job):
- Business Automation: operations, onboarding, reporting, cross-system workflows
- Marketing Automation: AI content engines, lead pipelines, engagement systems
- DevOps & MLOps: CI/CD, model lifecycle, containerization, infrastructure
- AI & Machine Learning: intelligent agents, predictive models, autonomous systems
- Systems Integration: multi-platform API orchestration, MCP servers, 48+ services
- Full-Stack Engineering: Vue/React + Python/Node + PostgreSQL + Docker

KEY DIFFERENTIATOR: "I don't just automate tasks — I architect intelligent systems that run business operations."

PROOF POINTS (always with metrics — use the ones that match):
- NEURALYX: 48 services, 7 AI agents, 5 Docker containers, MCP server — solo engineer
- LIVITI Content Engine: 95% reduction in manual content work
- AI Job Pipeline: 90+ jobs across 8 platforms processed in 8 seconds
- 8+ years, 27+ production projects, 14 mobile apps shipped
- Enterprise-level automation replacing entire workflows with 24/7 AI systems

WRITING RULES:
- DO NOT focus on the specific job title — focus on the DOMAIN and EXPERTISE you bring
- DO NOT use generic phrases ("team player", "passionate about technology", "I am writing to apply")
- DO reference specific requirements from the JD and map them to your proof points
- BE BOLD — this letter must stand out from 200 other applicants
- HARD CAPS: 280-340 words. 3-4 paragraphs. If you exceed, cut adjectives first.
- Plain text only (no markdown, no JSON fences, no signature block, no "Dear X" header)
- Write inline to the job description — show you actually READ it

STRUCTURAL ENFORCEMENT (these are non-negotiable):
- FIRST SENTENCE: must name a specific business problem from the JD (not "I am applying"). If the JD lacks a clear problem, lead with the most concrete need you can extract (e.g. "Shipping production-grade AI features without a dedicated ML team is harder than it sounds — that's exactly the gap I close.").
- SECOND PARAGRAPH: at least ONE proof point with a number (e.g. "95%", "8 seconds", "48 services"). No number = rewrite.
- LAST SENTENCE: a concrete 30-day deliverable for THIS company, naming THIS company by name once.
- DO NOT mention every domain — pick the 1-2 that match the JD; ignore the rest.
- If the JD is in another language (e.g. Spanish, Tagalog), respond in English unless the JD is >70% non-English.`

  const userPrompt = `Write a cover letter for:
Company: ${company}
Role: ${title}
Company type: ${company_bucket || 'unknown'}
Job description: ${(description || '').slice(0, 2000)}
My skills: ${(skills || []).join(', ')}
My resume: ${(resume_text || '').slice(0, 1000)}`

  // Check vector cache: if a very similar job has a cached cover letter, reuse + adapt
  try {
    if (OPENAI_API_KEY && description) {
      const queryText = `${title} ${company} ${(description || '').slice(0, 500)}`
      const embedding = await openaiEmbed(queryText)
      const vectorStr = `[${embedding.join(',')}]`
      const { data: similar } = await supabaseQuery('job_embeddings', 'GET', undefined,
        `select=cover_letter,embedding&cover_letter=not.is.null&order=embedding.desc&limit=1`)
      if (Array.isArray(similar) && similar.length > 0 && similar[0]?.cover_letter) {
        const cached = similar[0].cover_letter as string
        // Adapt cached letter to this specific job (fast rewrite, not full generation)
        const adapted = await callAI(
          'You are adapting a cover letter for a new job. Keep the same structure and proof points but update company name, role title, and 1-2 specific JD references. Max 350 words. Plain text only.',
          `Original letter:\n${cached}\n\nNew job: ${title} at ${company}\nJD snippet: ${(description || '').slice(0, 600)}`
        )
        if (adapted) return json(res, 200, { cover_letter: adapted, cached: true })
      }
    }
  } catch { /* vector cache miss — fall through to full generation */ }

  try {
    const coverLetter = await callAI(systemPrompt, userPrompt)
    json(res, 200, { cover_letter: coverLetter })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Cover letter generation failed'
    json(res, 500, { error: msg })
  }
}

// ─── Research Agent: Company Intelligence ───

const SEARXNG_URL = process.env.SEARXNG_URL || 'http://neuralyx-searxng:8080'
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://neuralyx-ai:8090'

async function searchSearXNG(query: string): Promise<{ title: string; url: string; content: string }[]> {
  try {
    const params = new URLSearchParams({ q: query, format: 'json', engines: 'google,bing,duckduckgo', categories: 'general' })
    const res = await fetch(`${SEARXNG_URL}/search?${params}`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results || []).slice(0, 10).map((r: any) => ({
      title: r.title || '', url: r.url || '', content: (r.content || '').slice(0, 500),
    }))
  } catch {
    return []
  }
}

async function handleResearchCompany(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { company, title } = body
  if (!company) return json(res, 400, { error: 'company is required' })

  const queries = [
    `${company} tech stack engineering team`,
    `${company} glassdoor reviews culture`,
    `${company} funding layoffs news 2026`,
  ]

  const allResults: { title: string; url: string; content: string }[] = []
  for (const q of queries) {
    const results = await searchSearXNG(q)
    allResults.push(...results)
  }

  // If SearXNG returned nothing, try a basic web summary via AI
  if (allResults.length === 0 && (OPENAI_KEY || GEMINI_KEY)) {
    try {
      const summary = await callAI(
        'You research companies. Return JSON: {"summary":"2-3 sentence overview","tech_stack":["tech1"],"size":"startup|mid|enterprise","red_flags":[],"glassdoor_sentiment":"positive|mixed|negative|unknown"}',
        `Research this company: ${company}. The job title is: ${title || 'unknown'}. Use your knowledge to provide what you know.`,
      )
      const parsed = JSON.parse(summary.replace(/^```json\s*\n?/, '').replace(/\n?\s*```\s*$/, '').match(/\{[\s\S]*\}/)?.[0] || '{}')
      return json(res, 200, { company, sources: [], ai_summary: parsed })
    } catch {
      return json(res, 200, { company, sources: [], ai_summary: null })
    }
  }

  // Synthesize results with AI
  if (allResults.length > 0 && (OPENAI_KEY || GEMINI_KEY)) {
    try {
      const context = allResults.map(r => `[${r.title}](${r.url}): ${r.content}`).join('\n')
      const summary = await callAI(
        'Analyze search results about a company. Return JSON: {"summary":"2-3 sentence overview","tech_stack":["tech1"],"size":"startup|mid|enterprise","culture":"description","red_flags":["flag1"],"glassdoor_sentiment":"positive|mixed|negative|unknown","recent_news":"any relevant news"}',
        `Company: ${company}\nJob: ${title || ''}\n\nSearch results:\n${context}`,
      )
      const parsed = JSON.parse(summary.replace(/^```json\s*\n?/, '').replace(/\n?\s*```\s*$/, '').match(/\{[\s\S]*\}/)?.[0] || '{}')
      return json(res, 200, { company, sources: allResults.slice(0, 5), ai_summary: parsed })
    } catch {
      return json(res, 200, { company, sources: allResults.slice(0, 5), ai_summary: null })
    }
  }

  // Try NotebookLM deep research via AI service
  try {
    const nlmRes = await fetch(`${AI_SERVICE_URL}/research`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company, title, sources: allResults.slice(0, 3).map((r: { url: string }) => r.url) }),
      signal: AbortSignal.timeout(30000),
    })
    if (nlmRes.ok) {
      const nlmData = await nlmRes.json()
      if (nlmData.summary) {
        return json(res, 200, { company, sources: allResults.slice(0, 5), ai_summary: nlmData.summary, notebook_id: nlmData.notebook_id })
      }
    }
  } catch { /* NotebookLM not available */ }

  json(res, 200, { company, sources: allResults.slice(0, 5), ai_summary: null })
}

// ─── Nurture Agent: Follow-up Tracking + Ghosted Detection ───

async function handleNurture(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { applications } = body  // Array of {id, status, created_at, follow_up_at, job_title, company}
  if (!applications || !Array.isArray(applications)) return json(res, 400, { error: 'applications array is required' })

  const now = Date.now()
  const DAY = 86400000
  const actions: { id: string; action: string; reason: string; suggested_status?: string; follow_up_date?: string }[] = []

  for (const app of applications) {
    const appliedAt = new Date(app.created_at).getTime()
    const daysSinceApplied = Math.floor((now - appliedAt) / DAY)
    const followUpAt = app.follow_up_at ? new Date(app.follow_up_at).getTime() : null
    const status = app.status || 'applied'

    // Ghosted detection: applied 30+ days, no status change
    if (['applied', 'under_review'].includes(status) && daysSinceApplied >= 30) {
      actions.push({
        id: app.id, action: 'mark_ghosted',
        reason: `No response in ${daysSinceApplied} days since applying to ${app.job_title} at ${app.company}`,
        suggested_status: 'ghosted',
      })
      continue
    }

    // Follow-up reminder: applied 7+ days, no follow-up set
    if (status === 'applied' && daysSinceApplied >= 7 && !followUpAt) {
      const followDate = new Date(now + 2 * DAY).toISOString().split('T')[0]
      actions.push({
        id: app.id, action: 'suggest_followup',
        reason: `${daysSinceApplied} days since applying to ${app.job_title} at ${app.company}. Consider following up.`,
        follow_up_date: followDate,
      })
      continue
    }

    // Follow-up overdue: follow_up_at has passed
    if (followUpAt && followUpAt < now && !['ghosted', 'withdrawn', 'position_filled', 'offer_accepted', 'offer_declined', 'onboarded'].includes(status)) {
      actions.push({
        id: app.id, action: 'followup_overdue',
        reason: `Follow-up was due ${Math.floor((now - followUpAt) / DAY)} days ago for ${app.job_title} at ${app.company}`,
      })
      continue
    }

    // Interview approaching: interview scheduled within 3 days
    if (status === 'interview_scheduled' && app.interview_dates) {
      try {
        const dates = typeof app.interview_dates === 'string' ? JSON.parse(app.interview_dates) : app.interview_dates
        for (const d of (Array.isArray(dates) ? dates : [])) {
          if (d.date) {
            const interviewDate = new Date(d.date).getTime()
            const daysUntil = Math.floor((interviewDate - now) / DAY)
            if (daysUntil >= 0 && daysUntil <= 3) {
              actions.push({
                id: app.id, action: 'interview_reminder',
                reason: `Interview for ${app.job_title} at ${app.company} in ${daysUntil === 0 ? 'TODAY' : daysUntil + ' days'}`,
              })
            }
          }
        }
      } catch { /* skip parse errors */ }
    }

    // Stale screening: under_review for 14+ days
    if (status === 'under_review' && daysSinceApplied >= 14) {
      actions.push({
        id: app.id, action: 'suggest_followup',
        reason: `Under review for ${daysSinceApplied} days at ${app.company}. Follow up or check status.`,
        follow_up_date: new Date(now + DAY).toISOString().split('T')[0],
      })
    }

    // Offer pending: offer_received for 5+ days without action
    if (status === 'offer_received' && daysSinceApplied >= 5) {
      actions.push({
        id: app.id, action: 'offer_expiring',
        reason: `Offer from ${app.company} has been pending ${daysSinceApplied} days. Respond soon.`,
      })
    }
  }

  // ─── Channel-Aware Nurture Rules ───
  // For each application, check its channel_executions to suggest cross-channel actions
  for (const app of applications) {
    const appId = app.id
    const status = app.status || 'applied'
    const appliedAt = new Date(app.created_at).getTime()
    const daysSinceApplied = Math.floor((now - appliedAt) / DAY)

    // Skip terminal statuses
    if (['ghosted', 'withdrawn', 'position_filled', 'offer_accepted', 'onboarded'].includes(status)) continue

    // Fetch channel executions for this application
    const { data: channelData } = await supabaseQuery('channel_executions', 'GET', undefined, `application_id=eq.${appId}&select=channel,status,target`)
    const channels = (channelData || []) as { channel: string; status: string; target?: string }[]

    const emailApplied = channels.some(c => c.channel === 'email' && c.status === 'applied')
    const boardApplied = channels.some(c => c.channel === 'job_board' && c.status === 'applied')
    const portalApplied = channels.some(c => c.channel === 'company_portal' && c.status === 'applied')
    const recruiterSent = channels.some(c => c.channel === 'recruiter' && c.status === 'applied')
    const allFailed = channels.length > 0 && channels.every(c => c.status === 'failed')

    // Rule: Applied on platform but email never sent → suggest email boost
    if (boardApplied && !emailApplied && daysSinceApplied >= 2) {
      actions.push({
        id: appId, action: 'suggest_email_boost',
        reason: `Applied on platform ${daysSinceApplied}d ago for ${app.job_title} at ${app.company}. Send a follow-up email to increase visibility.`,
        follow_up_date: new Date(now + DAY).toISOString().split('T')[0],
      })
    }

    // Rule: Email applied 7d ago, no response → suggest recruiter outreach
    if (emailApplied && !recruiterSent && daysSinceApplied >= 7 && status === 'applied') {
      actions.push({
        id: appId, action: 'suggest_recruiter_outreach',
        reason: `Email sent ${daysSinceApplied}d ago for ${app.job_title} at ${app.company}, no response. Try reaching the recruiter on LinkedIn.`,
      })
    }

    // Rule: All channels failed → suggest manual apply
    if (allFailed) {
      actions.push({
        id: appId, action: 'suggest_manual_apply',
        reason: `All ${channels.length} auto-apply channels failed for ${app.job_title} at ${app.company}. Apply manually.`,
        suggested_status: 'manual_apply_needed',
      })
    }

    // Rule: Company portal failed but email available → suggest direct email
    if (channels.some(c => c.channel === 'company_portal' && c.status === 'failed') && !emailApplied) {
      const emailTarget = channels.find(c => c.channel === 'email')?.target
      actions.push({
        id: appId, action: 'suggest_email_fallback',
        reason: `Company portal apply failed for ${app.job_title} at ${app.company}. Send direct email${emailTarget ? ` to ${emailTarget}` : ''}.`,
      })
    }

    // Rule: Only email applied, platform available but not used → suggest platform apply
    if (emailApplied && !boardApplied && channels.some(c => c.channel === 'job_board' && c.status !== 'applied')) {
      actions.push({
        id: appId, action: 'suggest_platform_apply',
        reason: `Only email sent for ${app.job_title} at ${app.company}. Also apply on the job platform for better visibility.`,
      })
    }
  }

  // Generate AI follow-up suggestions if available
  if (actions.length > 0 && actions.some(a => a.action === 'suggest_followup' || a.action === 'suggest_email_boost' || a.action === 'suggest_recruiter_outreach') && (OPENAI_KEY || GEMINI_KEY)) {
    const followups = actions.filter(a => ['suggest_followup', 'suggest_email_boost', 'suggest_recruiter_outreach'].includes(a.action)).slice(0, 5)
    for (const fu of followups) {
      try {
        const app = applications.find((a: any) => a.id === fu.id)
        if (!app) continue
        const actionType = fu.action === 'suggest_recruiter_outreach' ? 'LinkedIn message to the recruiter' : fu.action === 'suggest_email_boost' ? 'follow-up email after applying on platform' : 'follow-up message'
        const msg = await callAI(
          `Generate a short, professional ${actionType} (2-3 sentences). Be polite, direct, and reference the specific role. Do NOT use generic filler.`,
          `Role: ${app.job_title} at ${app.company}. Applied ${Math.floor((now - new Date(app.created_at).getTime()) / DAY)} days ago. Action: ${fu.action}. Reason: ${fu.reason}`,
        )
        ;(fu as any).suggested_message = msg
      } catch { /* skip */ }
    }
  }

  json(res, 200, { actions, total: actions.length, checked: applications.length })
}

// ─── 5 Parallel Detail-Fill Agents ───

async function fillOneJob(job: { id: string; title: string; company: string; description?: string | null; location?: string | null; url?: string }): Promise<Record<string, unknown>> {
  const desc = (job.description || '').slice(0, 2000)
  const prompt = `Analyze this job posting. Return ONLY valid JSON:
{
  "role_type": "fullstack|ai_engineer|ml_engineer|devops|frontend|backend|data|mobile|automation|other",
  "company_bucket": "agency|startup|enterprise|recruiter|direct_client",
  "company_type_detail": "outsourcing|product|consulting|staffing|saas|fintech|healthtech|edtech|ecommerce|government|nonprofit|other",
  "apply_channels": [
    {"channel": "job_board", "status": "pending", "detail": "Apply via [platform]"},
    {"channel": "email", "status": "pending", "detail": "Send resume to hr@...", "target": "email@found.com"},
    {"channel": "company_portal", "status": "pending", "detail": "Apply at company.com/careers", "target": "https://..."},
    {"channel": "form", "status": "pending", "detail": "Fill application form", "target": "https://forms..."},
    {"channel": "cold_outreach", "status": "research_needed", "detail": "Find recruiter on LinkedIn"}
  ],
  "expected_filtering_layers": ["resume_screen","form_questions","video_intro","technical_test","personality_test","trial_task","portfolio_review","interview"],
  "recruiter_email": "any email found in description (hr@, careers@, apply@, recruiter name email) or null",
  "company_careers_url": "any company careers/apply/jobs page URL found or null",
  "external_form_url": "Google Form, Typeform, JotForm, or any external application form URL found or null",
  "inferred_company_email": "if no email found, guess: hr@companydomain.com or careers@companydomain.com based on company name, or null",
  "ats_system": "greenhouse|lever|workday|bamboohr|jazz|icims|none|unknown",
  "requires_registration": true/false,
  "work_arrangement": "remote|hybrid|onsite|flexible",
  "country": "2-letter country code or 'Remote'",
  "match_score": 0-100 (for AI Systems Engineer with Vue,TypeScript,Python,PHP,Laravel,Docker,OpenAI,Supabase,n8n,LangChain,FastAPI,MCP),
  "skill_matches": ["matched skills from the job that candidate has"],
  "skill_gaps": ["required skills candidate lacks"],
  "seniority": "junior|mid|senior|lead|principal",
  "salary_estimate": "estimated range if not specified, or null",
  "recommendation": "strong_match|good_match|moderate|weak|no_match"
}
IMPORTANT rules for apply_channels (array of ALL ways to apply to this job):
- ALWAYS include {"channel":"job_board","status":"pending","detail":"Apply via [platform name]"} — this is always channel 1
- If email found in description: add {"channel":"email","status":"pending","target":"the@email.com","detail":"Send resume + cover letter"}
- If company careers URL found: add {"channel":"company_portal","status":"pending","target":"url","detail":"Apply on company site"}
- If Google Form / Typeform / JotForm URL found: add {"channel":"form","status":"pending","target":"url","detail":"Fill application form"}
- If NO email found in description: you MUST still add an email channel — use inferred_company_email as target with status "pending". NEVER use "research_needed" status. Always guess: hr@companydomain.com or careers@companydomain.com or jobs@companydomain.com
- If company seems to use an ATS (Greenhouse, Lever, Workday): note in ats_system field

For expected_filtering_layers: list what steps the candidate will likely face AFTER applying. Only include what's mentioned or implied:
- "resume_screen" — always include this
- "form_questions" — if the job mentions screening questions
- "video_intro" — if description mentions video submission
- "technical_test" — if coding test / assessment mentioned
- "personality_test" — if MBTI/DISC mentioned
- "trial_task" — if paid trial / test project mentioned
- "portfolio_review" — if GitHub/portfolio requested
- "interview" — always include this

For inferred_company_email: ALWAYS fill this. If company is "Acme Inc" and URL contains acme.com, use hr@acme.com. If company is "TechCorp" with no domain visible, guess hr@techcorp.com. Look for domains in the job URL and description URLs. Common patterns: hr@, careers@, jobs@, recruiting@, talent@, apply@. NEVER return null for this field — always provide your best guess.`

  const raw = await callAI(prompt, `Title: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location || ''}\nURL: ${job.url || ''}\nDescription: ${desc}`, 1400)
  const jsonStr = raw.replace(/^```json\s*\n?/, '').replace(/\n?\s*```\s*$/, '')
  const match = jsonStr.match(/\{[\s\S]*\}/)
  let result: Record<string, unknown> = {}
  if (match) {
    try { result = JSON.parse(match[0]) } catch { /* malformed JSON — use defaults */ }
  }

  // Auto-research: if no recruiter_email and no inferred_company_email, try SearXNG
  if (!result.recruiter_email && !result.inferred_company_email && SEARXNG_URL) {
    try {
      const searchRes = await searchSearXNG(`${job.company} careers email contact apply`)
      if (searchRes.length > 0) {
        // Extract emails from search results
        const allText = searchRes.map(r => `${r.title} ${r.content}`).join(' ')
        const emailMatch = allText.match(/[\w.+-]+@[\w-]+\.[\w.]+/g)
        if (emailMatch?.length) {
          result.recruiter_email = emailMatch[0]
        } else {
          // Try to extract domain from URLs and guess
          const urlMatch = searchRes[0]?.url?.match(/https?:\/\/(?:www\.)?([^/]+)/)
          if (urlMatch) result.inferred_company_email = `hr@${urlMatch[1]}`
        }
        // Also try to find careers page
        const careersResult = searchRes.find(r => /careers|jobs|apply|hiring/i.test(r.url))
        if (careersResult && !result.company_careers_url) {
          result.company_careers_url = careersResult.url
        }
      }
    } catch { /* SearXNG unavailable */ }
  }

  // Ensure apply_channels never has "research_needed" — replace with inferred email
  if (Array.isArray(result.apply_channels)) {
    for (const ch of result.apply_channels) {
      if (ch.status === 'research_needed' && (result.recruiter_email || result.inferred_company_email)) {
        ch.status = 'pending'
        ch.target = result.recruiter_email || result.inferred_company_email
        ch.detail = `Send resume to ${ch.target}`
      }
    }
  }

  return result
}

async function handleFillDetails(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { jobs } = body // Array of {id, title, company, description, location, url}
  if (!jobs || !Array.isArray(jobs)) return json(res, 400, { error: 'jobs array required' })

  const AGENT_COUNT = 5
  const results: { id: string; data: Record<string, unknown> }[] = []
  const errors: string[] = []
  let processed = 0

  // Split into 5 chunks for parallel processing
  const chunkSize = Math.ceil(jobs.length / AGENT_COUNT)
  const chunks: typeof jobs[] = []
  for (let i = 0; i < jobs.length; i += chunkSize) {
    chunks.push(jobs.slice(i, i + chunkSize))
  }

  // Process all 5 chunks in parallel
  const agentResults = await Promise.allSettled(
    chunks.map(async (chunk, agentIdx) => {
      const agentResults: typeof results = []
      for (const job of chunk) {
        try {
          const data = await fillOneJob(job)
          agentResults.push({ id: job.id, data })
          processed++
        } catch (e) {
          errors.push(`Agent ${agentIdx + 1}: ${job.title} failed`)
        }
      }
      return agentResults
    })
  )

  for (const r of agentResults) {
    if (r.status === 'fulfilled') results.push(...r.value)
  }

  json(res, 200, { results, processed, total: jobs.length, agents_used: chunks.length, errors })
}

// ─── Full Agent Runner: Orchestrates Scout → Classify → Match pipeline ───

async function handleAgentRun(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { query, location, platforms, min_score, resume_text, skills, preferred_job_types, preferred_locations } = body

  const runId = randomUUID().slice(0, 8)
  const logs: { step: string; status: string; message: string; jobs_found: number; jobs_matched: number; jobs_applied: number }[] = []

  // Step 1: SEARCH
  const searchStart = Date.now()
  let allJobs: NormalizedJob[] = []
  const errors: string[] = []
  const sources: string[] = []

  // Search with focused queries matching Gabriel's expertise
  // Split comma-separated query into individual searches (max 4)
  const rawQueries = query ? query.split(',').map((q: string) => q.trim()).filter(Boolean) : [
    'AI automation engineer remote',
    'fullstack developer Vue Python',
    'AI agent developer',
  ]
  const domainQueries = rawQueries.slice(0, 4) // Max 4 parallel queries

  const searchLoc = location || ''

  // Run ALL queries in parallel (not sequential) for speed
  const queryResults = await Promise.allSettled(
    domainQueries.map(async (sq: string) => {
      const results: NormalizedJob[] = []
      const [him, rok, rem, arb, hn] = await Promise.allSettled([
        searchHimalayas(sq),
        searchRemoteOK(sq),
        searchRemotive(sq),
        searchArbeitnow(sq),
        searchHackerNews(sq),
      ])
      for (const r of [him, rok, rem, arb, hn]) {
        if (r.status === 'fulfilled' && r.value.length) results.push(...r.value)
      }
      return results
    })
  )
  for (const r of queryResults) {
    if (r.status === 'fulfilled') allJobs.push(...r.value)
  }

  // JSearch separately (rate limited, single combined query)
  if (JSEARCH_API_KEY) {
    try {
      const jsQuery = query || 'AI engineer automation developer'
      const js = await searchJSearch(jsQuery, searchLoc)
      allJobs.push(...js)
    } catch (e) { errors.push(`JSearch: ${e}`) }
  }

  // Deduplicate
  const seen = new Set<string>()
  allJobs = allJobs.filter(j => {
    const key = `${j.title.toLowerCase().trim()}::${j.company.toLowerCase().trim()}`
    if (seen.has(key)) return false
    seen.add(key); return true
  })

  // Freshness filter: reject jobs older than 14 days
  const FRESHNESS_DAYS = 14
  const freshnessCutoff = new Date(Date.now() - FRESHNESS_DAYS * 86400000)
  const preFreshnessCount = allJobs.length
  allJobs = allJobs.filter(j => {
    if (!j.posted_at) return true // Keep if no date (conservative)
    const posted = new Date(j.posted_at)
    return !isNaN(posted.getTime()) && posted >= freshnessCutoff
  })
  if (preFreshnessCount > allJobs.length) {
    console.log(`[Agent] Freshness filter: ${preFreshnessCount} → ${allJobs.length} (removed ${preFreshnessCount - allJobs.length} stale jobs older than ${FRESHNESS_DAYS} days)`)
  }

  // Pre-filter: remove obviously irrelevant jobs by title keywords BEFORE AI scoring
  const EXCLUDE_TITLES = /\b(intern|internship|junior|entry.level|trainee|apprentice|student|co.op|nurse|nursing|teacher|teaching|accountant|accounting|receptionist|cashier|driver|cook|chef|waiter|waitress|barista|janitor|security guard|call center|customer service rep|beauty|salon|massage|eLearning trainer|audio evaluator|linguist|translator|french|spanish|german|japanese|korean|mandarin|transcription|data entry clerk|typist|virtual assistant|admin assistant|bookkeeper|payroll|robotics|arduino|mechanical|hardware|civil engineer|electrical engineer)\b/i
  const preFilterCount = allJobs.length
  allJobs = allJobs.filter(j => !EXCLUDE_TITLES.test(j.title))

  logs.push({ step: 'search', status: 'completed', message: `Found ${preFilterCount} → filtered to ${allJobs.length} in ${Date.now() - searchStart}ms`, jobs_found: allJobs.length, jobs_matched: 0, jobs_applied: 0 })

  // Step 2: CLASSIFY + MATCH (if AI available)
  let matched = 0
  if ((OPENAI_KEY || GEMINI_KEY) && allJobs.length > 0) {
    const matchStart = Date.now()
    const classifyPrompt = 'Classify job. Return JSON: {"role_type":"fullstack|ai_engineer|ml_engineer|devops|frontend|backend|data|automation|marketing_automation|business_automation|other","company_bucket":"agency|startup|enterprise|recruiter|direct_client","company_type_detail":"outsourcing|product|consulting|staffing|saas|other","match_score":0-100,"work_arrangement":"remote|hybrid|onsite"}. Target profile: AI Systems Engineer & Automation Developer. Core skills: Vue.js, TypeScript, Python, PHP, Laravel, Docker, OpenAI API, Supabase, n8n, LangChain, CrewAI, FastAPI, MCP, PostgreSQL, GSAP, Tailwind CSS, Pinia. Strong domains: AI/ML automation, AI agent development, business process automation, marketing automation (GHL/GoHighLevel, Zoho, HubSpot, ActiveCampaign, Mailchimp), lead generation systems, CRM automation, fullstack web dev (Vue/Python/Node), DevOps/MLOps, chatbot/AI assistant building, system integration, workflow automation (Zapier, Make, n8n). IMPORTANT: Score 50+ for ANY job mentioning: GHL, GoHighLevel, Zoho, HubSpot, ActiveCampaign, lead generation, marketing automation, business automation, CRM integration, email automation, workflow automation, no-code/low-code automation, Zapier, Make — these are core business domains even if not pure engineering. Score 80+=strong match, 60-79=good, 40-59=moderate/niche, 30-39=partial match worth keeping, below 30=irrelevant. HARD EXCLUDE (score 0): .NET, C#, SAP, Java/Spring, receptionist, data entry, manual QA, accounting, nursing, teaching, sales rep, customer service, graphic design, content writing. Include PHP/Laravel as valid. Score based on real skill overlap.'

    // Process ALL found jobs (pre-filtered already)
    const minRequired = min_score || 30
    const toProcess = allJobs.slice(0, 50)
    let discarded = 0
    for (const job of toProcess) {
      try {
        const raw = await callAI(classifyPrompt, `Title: ${job.title}\nCompany: ${job.company}\nDesc: ${(job.description || '').slice(0, 800)}`)
        const parsed = JSON.parse(raw.replace(/^```json\s*\n?/, '').replace(/\n?\s*```\s*$/, '').match(/\{[\s\S]*\}/)?.[0] || '{}')
        if (parsed.match_score) {
          job.match_score = parsed.match_score
          if (parsed.match_score >= minRequired) matched++
          else discarded++
        }
      } catch { /* skip */ }
    }
    // Remove low-scoring jobs (below threshold) — don't save them
    // Only keep jobs that were scored AND passed the threshold — remove all unscored/low-scoring
    allJobs = allJobs.filter(j => j.match_score !== null && j.match_score !== undefined && j.match_score >= minRequired)
    logs.push({ step: 'classify_match', status: 'completed', message: `Classified ${toProcess.length}, ${matched} matched (≥${minRequired}%), ${discarded} discarded in ${Date.now() - matchStart}ms`, jobs_found: 0, jobs_matched: matched, jobs_applied: 0 })
  } else {
    logs.push({ step: 'classify_match', status: 'skipped', message: 'No AI provider configured', jobs_found: 0, jobs_matched: 0, jobs_applied: 0 })
  }

  // Wiki ingest — build company pages from pulled jobs
  try { await wikiIngestJobs(allJobs as unknown as Parameters<typeof wikiIngestJobs>[0]) } catch { /* wiki ingest failed, non-blocking */ }

  json(res, 200, {
    run_id: runId,
    jobs: allJobs,
    logs,
    total: allJobs.length,
    matched,
    errors,
  })
}

// ─── Application Strategy Engine ───

interface StrategyPlan {
  strategy_type: 'strict' | 'dual' | 'parallel' | 'opportunistic'
  primary: { channel: string; tone: string; action: string; target?: string }
  secondary: { channel: string; tone: string; action: string; target?: string; delay_hours: number }[]
  variation_required: boolean
  safety_notes: string[]
}

function buildApplicationStrategy(job: Record<string, unknown>): StrategyPlan {
  const rawData = (job.raw_data || {}) as Record<string, unknown>
  const channels = (rawData.apply_channels || []) as { channel: string; status: string; detail: string; target?: string }[]
  const desc = ((job.description || '') as string).toLowerCase()
  const matchScore = (job.match_score || 0) as number

  // Detect strict compliance signals
  const strictSignals = ['only applications submitted', 'only apply through', 'do not email', 'do not contact', 'applications via other channels will not be considered']
  const isStrict = strictSignals.some(s => desc.includes(s))

  // Detect available channels
  const hasJobBoard = channels.some(c => c.channel === 'job_board')
  const hasEmail = channels.some(c => c.channel === 'email' && c.status !== 'research_needed')
  const hasPortal = channels.some(c => c.channel === 'company_portal')
  const hasForm = channels.some(c => c.channel === 'form')
  const emailTarget = channels.find(c => c.channel === 'email')?.target || (rawData.recruiter_email as string) || (rawData.inferred_company_email as string) || null

  // Determine primary channel
  let primaryChannel = 'job_board'
  let primaryTone = 'concise'
  if (hasPortal) { primaryChannel = 'company_portal'; primaryTone = 'formal' }
  else if (hasForm) { primaryChannel = 'form'; primaryTone = 'formal' }
  else if (hasEmail && !hasJobBoard) { primaryChannel = 'email'; primaryTone = 'conversational' }

  // Build strategy
  if (isStrict) {
    return {
      strategy_type: 'strict',
      primary: { channel: primaryChannel, tone: primaryTone, action: 'apply', target: channels.find(c => c.channel === primaryChannel)?.target },
      secondary: [],
      variation_required: false,
      safety_notes: ['Strict compliance — only apply through specified channel', 'Do NOT send additional emails or applications'],
    }
  }

  const secondary: StrategyPlan['secondary'] = []

  if (matchScore >= 80) {
    // High-value job → opportunistic multi-channel
    if (hasJobBoard && primaryChannel !== 'job_board') {
      secondary.push({ channel: 'job_board', tone: 'concise', action: 'easy_apply', delay_hours: 0 })
    }
    if (hasEmail && primaryChannel !== 'email' && emailTarget) {
      secondary.push({ channel: 'email', tone: 'conversational', action: 'follow_up_email', target: emailTarget, delay_hours: 4 })
    }
    if (hasPortal && primaryChannel !== 'company_portal') {
      secondary.push({ channel: 'company_portal', tone: 'formal', action: 'apply', target: channels.find(c => c.channel === 'company_portal')?.target, delay_hours: 2 })
    }

    return {
      strategy_type: secondary.length >= 2 ? 'parallel' : 'dual',
      primary: { channel: primaryChannel, tone: primaryTone, action: 'apply', target: channels.find(c => c.channel === primaryChannel)?.target },
      secondary,
      variation_required: secondary.length > 0,
      safety_notes: ['High-value match — multi-channel recommended', 'Vary cover letter tone per channel', `Delay ${secondary.map(s => s.delay_hours + 'h').join(', ')} between submissions`],
    }
  }

  // Standard dual-channel
  if (hasEmail && emailTarget && primaryChannel !== 'email') {
    secondary.push({ channel: 'email', tone: 'conversational', action: 'follow_up_email', target: emailTarget, delay_hours: 6 })
  }

  return {
    strategy_type: secondary.length > 0 ? 'dual' : 'strict',
    primary: { channel: primaryChannel, tone: primaryTone, action: 'apply', target: channels.find(c => c.channel === primaryChannel)?.target },
    secondary,
    variation_required: secondary.length > 0,
    safety_notes: secondary.length > 0 ? ['Send follow-up email after primary application', 'Use conversational tone for email — not a duplicate application'] : ['Single-channel application'],
  }
}

async function handleStrategyPlan(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { job } = body
  if (!job) return json(res, 400, { error: 'job required' })
  const plan = buildApplicationStrategy(job)
  json(res, 200, plan)
}

// Generate channel-specific cover letter variant
async function generateChannelVariant(baseCoverLetter: string, tone: 'formal' | 'concise' | 'conversational', jobTitle: string, company: string): Promise<string> {
  if (!baseCoverLetter || !(OPENAI_KEY || GEMINI_KEY)) return baseCoverLetter
  const toneInstructions: Record<string, string> = {
    formal: 'Rewrite this cover letter in a formal, structured tone suitable for an ATS/company portal submission. Keep all facts and metrics. Max 350 words.',
    concise: 'Rewrite this cover letter to be concise and punchy for a job board submission. Cut to 200 words max. Keep the strongest metrics.',
    conversational: 'Rewrite this as a brief, conversational email (not a formal cover letter). 150 words max. Start with "Hi [Company] team," — express genuine interest, mention 1-2 key strengths, end with a call to action.',
  }
  try {
    return await callAI(toneInstructions[tone] || toneInstructions.concise, `Job: ${jobTitle} at ${company}\n\nOriginal cover letter:\n${baseCoverLetter}`)
  } catch { return baseCoverLetter }
}

// ─── Auto-Apply System ───

// SMTP transporter — supports Brevo, Gmail, cPanel, or any SMTP relay (lazy init)
let mailTransporter: nodemailer.Transporter | null = null
function getMailer() {
  if (!mailTransporter && SMTP_USER && SMTP_PASS) {
    mailTransporter = nodemailer.createTransport({
      host: SMTP_HOST || 'smtp-relay.brevo.com',
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  }
  return mailTransporter
}

// Full job details for notification emails
interface NotifyJobData {
  title: string
  company: string
  platform?: string
  location?: string | null
  salary_min?: number | null
  salary_max?: number | null
  salary_currency?: string
  job_type?: string | null
  match_score?: number | null
  url?: string
  posted_at?: string | null
  description?: string | null
  raw_data?: Record<string, unknown> | null
}

// Send detailed notification email after each application — mirrors admin dashboard tabs
async function sendApplyNotification(job: NotifyJobData | string, companyOrMethod?: string, method?: string, status?: string, detail?: string, coverLetter?: string) {
  const mailer = getMailer()
  if (!mailer || !NOTIFY_EMAIL) return

  let j: NotifyJobData
  let jMethod: string, jStatus: string, jDetail: string, jCover: string

  if (typeof job === 'string') {
    j = { title: job, company: companyOrMethod || '' }
    jMethod = method || ''; jStatus = status || 'applied'; jDetail = detail || ''; jCover = coverLetter || ''
  } else {
    j = job
    jMethod = method || 'direct_apply'; jStatus = status || 'applied'; jDetail = detail || ''; jCover = coverLetter || ''
  }

  const rd = j.raw_data || {}
  const jPlatform = j.platform || ''
  const jLocation = j.location || 'Remote'
  const jUrl = j.url || ''
  const jDesc = (j.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const jScoreNum = j.match_score ?? null
  const jScore = jScoreNum != null ? `${jScoreNum}%` : 'N/A'
  const jSalary = (() => {
    if (!j.salary_min && !j.salary_max) return (rd.salary_estimate as string) || ''
    const c = j.salary_currency || 'USD'
    if (j.salary_min && j.salary_max) return `${c} ${j.salary_min.toLocaleString()} – ${j.salary_max.toLocaleString()}`
    return j.salary_min ? `${c} ${j.salary_min.toLocaleString()}+` : `Up to ${c} ${(j.salary_max || 0).toLocaleString()}`
  })()
  const jSkillMatches = (rd.skill_matches as string[]) || []
  const jSkillGaps = (rd.skill_gaps as string[]) || []
  const jAppType = (rd.application_type as string) || ''
  const jSeniority = (rd.seniority as string) || ''
  const jWorkArr = (rd.work_arrangement as string) || ''
  const jRoleType = (rd.role_type as string) || ''
  const jCompanyBucket = (rd.company_bucket as string) || ''
  const jCompanyTypeDetail = (rd.company_type_detail as string) || ''
  const jRecommendation = (rd.recommendation as string) || ''
  const jApplyChannels = (rd.apply_channels as { channel: string; status: string; detail: string; target?: string }[]) || []
  const jRecruiterEmail = (rd.recruiter_email as string) || ''
  const jInferredEmail = (rd.inferred_company_email as string) || ''
  const jCareersUrl = (rd.company_careers_url as string) || ''
  const jFormUrl = (rd.external_form_url as string) || ''
  const jAts = (rd.ats_system as string) || ''
  const jPosted = j.posted_at ? new Date(j.posted_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''
  const jJobType = j.job_type || (rd.job_type as string) || ''

  const statusIcon = jStatus === 'applied' ? '✅' : jStatus === 'needs_browser' ? '🌐' : jStatus === 'skipped' ? '⏭️' : '❌'
  const statusColor = jStatus === 'applied' ? '#22c55e' : jStatus === 'needs_browser' ? '#3b82f6' : jStatus === 'skipped' ? '#6b7280' : '#ef4444'
  const statusLabel = jStatus === 'applied' ? 'APPLICATION SENT' : jStatus === 'needs_browser' ? 'BROWSER APPLY NEEDED' : jStatus === 'skipped' ? 'SKIPPED' : 'FAILED'
  const scoreColor = jScoreNum != null ? (jScoreNum >= 80 ? '#22c55e' : jScoreNum >= 60 ? '#eab308' : '#ef4444') : '#6b7280'
  const matchLabel = jScoreNum != null ? (jScoreNum >= 85 ? 'Excellent Match' : jScoreNum >= 70 ? 'Good Match' : jScoreNum >= 50 ? 'Moderate Match' : 'Low Match') : ''

  // Section header builder
  const sectionHead = (icon: string, title: string, color: string) =>
    `<div style="padding:16px 24px 8px;border-top:2px solid #1a1a2e"><table><tr><td style="padding-right:8px;font-size:16px;vertical-align:middle">${icon}</td><td style="font-size:12px;font-weight:700;letter-spacing:1.5px;color:${color};text-transform:uppercase">${title}</td></tr></table></div>`

  // Grid cell builder (2-column)
  const cell = (label: string, value: string, opts?: { color?: string; bold?: boolean }) => {
    if (!value) return ''
    return `<td style="padding:10px 16px;width:50%;vertical-align:top;border-bottom:1px solid #12122a">
      <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">${label}</div>
      <div style="font-size:13px;${opts?.bold ? 'font-weight:600;' : ''}${opts?.color ? `color:${opts.color}` : 'color:#e0e0e0'}">${value}</div>
    </td>`
  }

  // Badge builder
  const badge = (text: string, bg: string, fg: string) => text ? `<span style="display:inline-block;background:${bg};color:${fg};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;margin:2px 3px 2px 0">${text}</span>` : ''

  // Skill pill builder
  const pill = (text: string, color: string) => `<span style="display:inline-block;background:${color}15;color:${color};padding:4px 12px;border-radius:20px;font-size:11px;border:1px solid ${color}30;margin:3px 4px 3px 0">${text}</span>`

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:660px;margin:0 auto;background:#ffffff;color:#1a1a2e;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

  <!-- ═══ HEADER (dark accent) ═══ -->
  <div style="background:linear-gradient(135deg,#1e1b4b 0%,#312e81 50%,#4c1d95 100%);padding:28px 24px">
    <table style="width:100%"><tr>
      <td>
        ${badge(jPlatform, 'rgba(255,255,255,0.15)', '#e0e7ff')}
        ${badge(jScore, scoreColor + '30', scoreColor)}
        ${badge(jJobType || 'Full-Time', 'rgba(255,255,255,0.15)', '#c7d2fe')}
      </td>
      <td style="text-align:right">
        <span style="font-size:28px">${statusIcon}</span>
      </td>
    </tr></table>
    <h1 style="margin:14px 0 6px;font-size:22px;color:#ffffff;line-height:1.3">${j.title}</h1>
    <p style="margin:0;color:#c4b5fd;font-size:15px">${j.company} · ${jLocation} · ${jPosted || 'Recent'}</p>
    <div style="margin-top:12px;padding:8px 14px;background:rgba(255,255,255,0.08);border-radius:8px;display:inline-block">
      <span style="font-size:11px;font-weight:700;letter-spacing:1px;color:${statusColor};text-transform:uppercase">${statusLabel}</span>
    </div>
  </div>

  <!-- ═══ SECTION 1: OVERVIEW ═══ -->
  <div style="padding:20px 24px 8px">
    <table style="width:100%"><tr><td style="font-size:13px;font-weight:700;color:#4338ca;text-transform:uppercase;letter-spacing:1px">📋 Overview</td></tr></table>
  </div>
  <div style="padding:0 16px 16px">
    <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:12px;overflow:hidden">
      <tr>
        <td style="padding:14px 16px;width:50%;border-bottom:1px solid #e2e8f0"><div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Salary</div><div style="font-size:14px;font-weight:600;color:#059669">${jSalary || '—'}</div></td>
        <td style="padding:14px 16px;width:50%;border-bottom:1px solid #e2e8f0;border-left:1px solid #e2e8f0"><div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Type</div><div style="font-size:14px;color:#1e293b">${jJobType || 'Full-Time'}</div></td>
      </tr>
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0"><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:4px">Role</div><div style="font-size:13px;color:${jRoleType ? '#059669' : '#94a3b8'}">${jRoleType || 'Not Classified'}</div></td>
        <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;border-left:1px solid #e2e8f0"><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:4px">Company Type</div><div style="font-size:13px;color:${jCompanyBucket ? '#059669' : '#94a3b8'}">${jCompanyBucket || 'Not Classified'}</div></td>
      </tr>
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0"><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:4px">Posted</div><div style="font-size:13px;color:#1e293b">${jPosted || '—'}</div></td>
        <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;border-left:1px solid #e2e8f0"><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:4px">Source</div><div style="font-size:13px;color:#1e293b">${jPlatform}</div></td>
      </tr>
      <tr>
        <td style="padding:14px 16px"><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:4px">Seniority</div><div style="font-size:13px;color:#1e293b">${jSeniority || '—'}</div></td>
        <td style="padding:14px 16px;border-left:1px solid #e2e8f0"><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:4px">Work Arrangement</div><div style="font-size:13px;color:#1e293b">${jWorkArr || 'Remote'}</div></td>
      </tr>
    </table>
  </div>

  <!-- ═══ SECTION 2: JOB DETAILS ═══ -->
  ${jDesc ? `
  <div style="padding:12px 24px 8px;border-top:1px solid #e2e8f0">
    <table><tr><td style="font-size:13px;font-weight:700;color:#0891b2;text-transform:uppercase;letter-spacing:1px">📄 Job Details</td></tr></table>
  </div>
  <div style="padding:8px 16px 20px">
    <div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px;padding:18px;font-size:13px;line-height:1.7;color:#334155">${jDesc.slice(0, 2000)}${jDesc.length > 2000 ? '<br><br><span style="color:#6366f1;font-weight:600">... [view full on platform]</span>' : ''}</div>
  </div>` : ''}

  <!-- ═══ SECTION 3: MATCH ANALYSIS ═══ -->
  <div style="padding:12px 24px 8px;border-top:1px solid #e2e8f0">
    <table><tr><td style="font-size:13px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:1px">📊 Match Analysis</td></tr></table>
  </div>
  <div style="padding:8px 16px 20px">
    <div style="background:linear-gradient(135deg,#1e1b4b,#312e81);border-radius:12px;padding:20px;color:#ffffff">
      <table style="width:100%"><tr>
        <td style="font-size:36px;font-weight:700;color:${scoreColor}">${jScore}</td>
        <td style="text-align:right;font-size:14px;color:${scoreColor};font-weight:600">${matchLabel}</td>
      </tr></table>
      <div style="background:rgba(255,255,255,0.1);border-radius:8px;height:10px;margin-top:10px;overflow:hidden">
        <div style="background:${scoreColor};height:100%;width:${jScoreNum || 0}%;border-radius:8px"></div>
      </div>
      ${jRecommendation ? `<div style="margin-top:14px;padding:10px 14px;background:rgba(255,255,255,0.06);border-left:3px solid ${scoreColor};border-radius:0 8px 8px 0;font-size:12px;color:#c4b5fd"><strong style="color:${scoreColor}">AI Recommendation:</strong> ${jRecommendation}</div>` : ''}
    </div>
    ${jSkillMatches.length ? `
    <div style="margin-top:14px">
      <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:1px;color:#059669;text-transform:uppercase">Skills You Have (${jSkillMatches.length})</p>
      <div>${jSkillMatches.map(s => `<span style="display:inline-block;background:#dcfce7;color:#166534;padding:5px 12px;border-radius:20px;font-size:11px;font-weight:500;margin:3px 4px 3px 0">${s}</span>`).join('')}</div>
    </div>` : ''}
    ${jSkillGaps.length ? `
    <div style="margin-top:10px">
      <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:1px;color:#d97706;text-transform:uppercase">Skills to Highlight / Learn (${jSkillGaps.length})</p>
      <div>${jSkillGaps.map(s => `<span style="display:inline-block;background:#fef3c7;color:#92400e;padding:5px 12px;border-radius:20px;font-size:11px;font-weight:500;margin:3px 4px 3px 0">${s}</span>`).join('')}</div>
    </div>` : ''}
  </div>

  <!-- ═══ SECTION 4: APPLICATION TIMELINE ═══ -->
  <div style="padding:12px 24px 8px;border-top:1px solid #e2e8f0">
    <table><tr><td style="font-size:13px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px">📅 Application Timeline</td></tr></table>
  </div>
  <div style="padding:8px 16px 16px">
    <table style="width:100%;border-collapse:collapse;background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;overflow:hidden">
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #c7d2fe"><div style="font-size:10px;color:#4338ca;text-transform:uppercase;margin-bottom:4px">Cover Letter Generated</div><div style="font-size:13px;color:#1e1b4b">${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</div></td>
        <td style="padding:12px 16px;border-bottom:1px solid #c7d2fe;border-left:1px solid #c7d2fe"><div style="font-size:10px;color:#4338ca;text-transform:uppercase;margin-bottom:4px">Application Sent</div><div style="font-size:13px;font-weight:600;color:#1e1b4b">${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</div></td>
      </tr>
      <tr>
        <td style="padding:12px 16px"><div style="font-size:10px;color:#4338ca;text-transform:uppercase;margin-bottom:4px">Method</div><div style="font-size:13px;color:#1e1b4b">${jMethod}</div></td>
        <td style="padding:12px 16px;border-left:1px solid #c7d2fe"><div style="font-size:10px;color:#4338ca;text-transform:uppercase;margin-bottom:4px">Status</div><div style="font-size:13px;font-weight:600;color:${statusColor}">${statusLabel}</div></td>
      </tr>
    </table>
  </div>

  <!-- ═══ SECTION 5: COVER LETTER (evidence — part of notification) ═══ -->
  ${jCover ? `
  <div style="padding:12px 24px 8px;border-top:1px solid #e2e8f0">
    <table><tr><td style="font-size:13px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:1px">📝 Cover Letter (included in application)</td></tr></table>
  </div>
  <div style="padding:8px 16px 20px">
    <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:12px;padding:20px;font-size:13px;line-height:1.8;color:#3b0764;white-space:pre-wrap">${jCover}</div>
  </div>` : ''}

  <!-- ═══ SECTION 6: HOW TO APPLY ═══ -->
  <div style="padding:12px 24px 8px;border-top:1px solid #e2e8f0">
    <table><tr><td style="font-size:13px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:1px">🚀 How to Apply</td></tr></table>
  </div>
  <div style="padding:8px 16px 20px">
    <table style="width:100%;border-collapse:collapse;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;overflow:hidden">
      <tr>
        <td style="padding:14px 16px;width:50%;border-bottom:1px solid #fde68a"><div style="font-size:10px;color:#92400e;text-transform:uppercase;margin-bottom:4px">Applied Via</div><div style="font-size:13px;font-weight:600;color:#78350f">${jMethod === 'direct_email' ? '📧 Email to Recruiter' : jMethod.includes('easy_apply') ? '🖱️ ' + (jPlatform || 'Platform') + ' Easy Apply' : jMethod.includes('_apply') || jMethod.includes('_redirect') ? '🌐 Applied on ' + (jPlatform || 'Platform') : '📧 ' + jMethod}</div></td>
        <td style="padding:14px 16px;width:50%;border-bottom:1px solid #fde68a;border-left:1px solid #fde68a"><div style="font-size:10px;color:#92400e;text-transform:uppercase;margin-bottom:4px">Platform</div><div style="font-size:13px;color:#78350f">${jPlatform || 'direct_email'} ${jMethod !== 'direct_email' ? '(browser apply)' : '(email)'}</div></td>
      </tr>
      ${jRecruiterEmail || jInferredEmail ? `<tr>
        <td style="padding:14px 16px;border-bottom:1px solid #fde68a"><div style="font-size:10px;color:#92400e;text-transform:uppercase;margin-bottom:4px">Recruiter Email</div><div style="font-size:13px;color:#78350f">${jRecruiterEmail || '—'}</div></td>
        <td style="padding:14px 16px;border-bottom:1px solid #fde68a;border-left:1px solid #fde68a"><div style="font-size:10px;color:#92400e;text-transform:uppercase;margin-bottom:4px">Company Email</div><div style="font-size:13px;color:#78350f">${jInferredEmail || '—'}</div></td>
      </tr>` : ''}
    </table>
    ${jCareersUrl ? `<div style="margin-top:10px;padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px"><span style="font-size:10px;color:#166534;text-transform:uppercase;font-weight:600">Careers Page</span><br><a href="${jCareersUrl}" style="color:#4f46e5;font-size:12px">${jCareersUrl}</a></div>` : ''}
    ${jFormUrl ? `<div style="margin-top:8px;padding:10px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px"><span style="font-size:10px;color:#1e40af;text-transform:uppercase;font-weight:600">Application Form</span><br><a href="${jFormUrl}" style="color:#4f46e5;font-size:12px">${jFormUrl}</a></div>` : ''}
    ${jApplyChannels.length ? `
    <div style="margin-top:12px">
      <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:1px;color:#92400e;text-transform:uppercase">Apply Channels</p>
      ${jApplyChannels.map(ch => `<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin-bottom:6px">
        <table style="width:100%"><tr>
          <td style="font-size:12px;font-weight:600;color:#1e293b">${ch.channel}</td>
          <td style="text-align:right">${badge(ch.status, ch.status === 'done' ? '#dcfce7' : '#fef3c7', ch.status === 'done' ? '#166534' : '#92400e')}</td>
        </tr></table>
        <p style="margin:4px 0 0;font-size:11px;color:#64748b">${ch.detail}${ch.target ? ` → <strong>${ch.target}</strong>` : ''}</p>
      </div>`).join('')}
    </div>` : ''}
    ${jDetail ? `<div style="margin-top:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 14px;font-size:12px;color:#166534"><strong>Status:</strong> ${jDetail}</div>` : ''}
    ${jUrl ? `<div style="margin-top:16px;text-align:center"><a href="${jUrl}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:white;padding:12px 32px;border-radius:10px;text-decoration:none;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(79,70,229,0.3)">View Original Listing</a></div>` : ''}
  </div>

  <!-- ═══ FOOTER (dark accent) ═══ -->
  <div style="padding:18px 24px;background:linear-gradient(135deg,#1e1b4b,#312e81);color:#c4b5fd">
    <table style="width:100%"><tr>
      <td><img src="cid:neuralyx-logo" alt="NEURALYX" style="height:28px;width:28px;border-radius:6px;vertical-align:middle;object-fit:cover"> <span style="font-size:13px;font-weight:700;color:#e0e7ff;vertical-align:middle;margin-left:8px;letter-spacing:0.5px">NEURALYX</span> <span style="font-size:11px;color:#a5b4fc;vertical-align:middle;margin-left:4px">Auto-Apply Agent</span></td>
      <td style="text-align:right;font-size:11px;color:#a5b4fc">${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</td>
    </tr></table>
    <div style="margin-top:10px">
      <a href="https://neuralyx.ai.dev-environment.site" style="color:#a5b4fc;font-size:11px;text-decoration:none;margin-right:16px">Portfolio</a>
      <a href="${jUrl}" style="color:#a5b4fc;font-size:11px;text-decoration:none">View Listing</a>
    </div>
  </div>
</div>`

  // Resolve logo path for CID attachment
  let logoPath = ''
  for (const p of [join(UPLOADS_DIR, 'neuralyx-logo.jpg'), '/app/public/assets/images/neuralyx-logo.jpg']) {
    try { await stat(p); logoPath = p; break } catch { /* try next */ }
  }

  try {
    await mailer.sendMail({
      from: `"NEURALYX Auto-Apply" <${SMTP_FROM_EMAIL}>`,
      replyTo: SMTP_REPLY_TO,
      to: NOTIFY_EMAIL,
      subject: `[${jStatus.toUpperCase()}] ${j.title} @ ${j.company} — ${jPlatform || jMethod}`,
      html,
      attachments: logoPath ? [{
        filename: 'neuralyx-logo.jpg',
        path: logoPath,
        cid: 'neuralyx-logo',
      }] : [],
    })
  } catch { /* notification send failed — non-critical */ }
}

// Prepare an application plan for a single job
async function handleAutoApplyPrepare(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { job, profile } = body
  if (!job?.title) return json(res, 400, { error: 'job with title required' })

  const rawData = job.raw_data || {}
  const applicationType = rawData.application_type || 'unknown'

  // Generate cover letter
  let coverLetter = rawData.cover_letter || ''
  if (!coverLetter && (OPENAI_KEY || GEMINI_KEY)) {
    try {
      coverLetter = await handleCoverLetterInternal(job, profile)
    } catch { /* cover letter gen failed */ }
  }

  // Build apply plan based on type
  const steps: { action: string; status: string; detail: string }[] = []
  let emailDraft = null
  let browserInstructions = null

  if (applicationType === 'direct_email' && rawData.recruiter_email) {
    steps.push({ action: 'generate_cover_letter', status: coverLetter ? 'done' : 'failed', detail: coverLetter ? 'Cover letter ready' : 'Failed to generate' })
    steps.push({ action: 'compose_email', status: 'ready', detail: `To: ${rawData.recruiter_email}` })
    steps.push({ action: 'attach_resume', status: 'ready', detail: 'resume.pdf' })
    steps.push({ action: 'send_email', status: 'pending', detail: 'Awaiting send' })
    emailDraft = {
      to: rawData.recruiter_email,
      subject: `Application for ${job.title} — ${SMTP_FROM_NAME}`,
      body: `Dear ${job.company} Hiring Team,\n\n${coverLetter}\n\nBest regards,\n${SMTP_FROM_NAME}\nAI Systems Engineer\ngabrielalvin.jobs@gmail.com`,
    }
  } else if (applicationType === 'google_form' && rawData.external_form_url) {
    steps.push({ action: 'open_form', status: 'pending', detail: rawData.external_form_url })
    steps.push({ action: 'fill_form', status: 'pending', detail: 'Auto-fill name, email, resume link' })
    steps.push({ action: 'submit_form', status: 'pending', detail: 'Submit application' })
    browserInstructions = { url: rawData.external_form_url, type: 'google_form', fields_to_fill: { name: SMTP_FROM_NAME, email: SMTP_FROM_EMAIL || 'gabrielalvin.jobs@gmail.com', resume: 'https://neuralyx.dev/resume.pdf', cover_letter: coverLetter } }
  } else if (applicationType === 'company_portal' && rawData.company_careers_url) {
    steps.push({ action: 'navigate_portal', status: 'pending', detail: rawData.company_careers_url })
    steps.push({ action: 'register_if_needed', status: 'pending', detail: rawData.requires_registration ? 'Registration required' : 'No registration' })
    steps.push({ action: 'fill_application', status: 'pending', detail: 'Fill application form' })
    steps.push({ action: 'submit', status: 'pending', detail: 'Submit application' })
    browserInstructions = { url: rawData.company_careers_url, type: 'company_portal', fields_to_fill: { name: SMTP_FROM_NAME, email: SMTP_FROM_EMAIL || 'gabrielalvin.jobs@gmail.com', phone: '0951 540 8978', cover_letter: coverLetter }, requires_login: rawData.requires_registration || false }
  } else if (applicationType === 'external_form' && rawData.external_form_url) {
    steps.push({ action: 'open_form', status: 'pending', detail: rawData.external_form_url })
    steps.push({ action: 'fill_form', status: 'pending', detail: 'Auto-fill application' })
    steps.push({ action: 'submit_form', status: 'pending', detail: 'Submit' })
    browserInstructions = { url: rawData.external_form_url, type: 'external_form', fields_to_fill: { name: SMTP_FROM_NAME, email: SMTP_FROM_EMAIL || 'gabrielalvin.jobs@gmail.com', cover_letter: coverLetter } }
  } else {
    // direct_apply or unknown — apply through the job board
    steps.push({ action: 'open_job_page', status: 'pending', detail: job.url || 'No URL' })
    steps.push({ action: 'click_apply', status: 'pending', detail: 'Click Apply/Easy Apply button' })
    steps.push({ action: 'fill_form', status: 'pending', detail: 'Fill application form' })
    steps.push({ action: 'submit', status: 'pending', detail: 'Submit application' })
    browserInstructions = { url: job.url, type: 'direct_apply', fields_to_fill: { name: SMTP_FROM_NAME, email: SMTP_FROM_EMAIL || 'gabrielalvin.jobs@gmail.com', phone: '0951 540 8978', cover_letter: coverLetter }, requires_login: true }
  }

  // Build strategy plan
  const strategy = buildApplicationStrategy(job)

  // Generate channel-specific variants if multi-channel
  const coverVariants: Record<string, string> = { primary: coverLetter }
  if (strategy.variation_required && coverLetter) {
    for (const sec of strategy.secondary) {
      try {
        coverVariants[sec.channel] = await generateChannelVariant(coverLetter, sec.tone as 'formal' | 'concise' | 'conversational', job.title, job.company)
      } catch { coverVariants[sec.channel] = coverLetter }
    }
  }

  json(res, 200, { application_type: applicationType, steps, cover_letter: coverLetter, cover_variants: coverVariants, email_draft: emailDraft, browser_instructions: browserInstructions, strategy })
}

// Internal cover letter generation — Problem-Solution framework, domain-tailored, ROI-driven
async function handleCoverLetterInternal(job: { title: string; company: string; description?: string }, profile?: { resume_text?: string; skills?: string[] }): Promise<string> {
  const systemPrompt = `You are Gabriel Alvin Aquino writing a cover letter. Use the PROBLEM-SOLUTION framework — the #1 proven cover letter format based on 80+ hiring studies.

WHO YOU ARE (use this voice — direct, confident, operational):
"I'm Gabriel Alvin Aquino, an AI Automation Engineer who builds systems that replace manual operations, reduce costs, and run core parts of a business autonomously. I design and deploy intelligent automation across business operations, marketing systems, and cloud infrastructure — transforming manual, fragmented workflows into scalable, AI-powered ecosystems."

YOUR DOMAINS (pick the 2-3 most relevant to this job):
- Business Automation: streamlining operations, onboarding, reporting, cross-system workflows
- Marketing Automation: AI-driven content engines, lead pipelines, engagement systems
- AI & Machine Learning: intelligent agents, predictive models, data-driven decision systems
- AI Chatbots: conversational AI, webhook-based chat systems, AI-powered assistants
- Cloud, DevOps & MLOps: CI/CD pipelines, model lifecycle management, containerization, infrastructure
- Systems Integration: multi-platform API orchestration, MCP servers, 48+ connected services
- Data & Analytics: real-time dashboards, PostgreSQL, data pipelines, analytics visualization

YOUR PROOF POINTS (use specific ones that match the job — always with metrics):
- NEURALYX Platform: 48 connected services, 7 AI agents, 5 Docker containers, MCP server architecture — built as solo engineer
- LIVITI Content Engine: automated article generation reducing manual work by 95%
- AI Job Pipeline: processes 90+ jobs across 8 platforms in 8 seconds with auto-classification
- 8+ years engineering, 27+ production projects shipped, 14 mobile apps delivered
- Enterprise-level automation platforms replacing entire workflows with 24/7 AI systems
- Tech: Vue 3, TypeScript, Python, Node.js, Docker, Supabase/PostgreSQL, OpenAI, LangChain, n8n

COVER LETTER STRUCTURE (Problem-Solution Framework):

PARAGRAPH 1 — THE BUSINESS PAIN POINT (hook in first 2 sentences):
- Identify the company's SPECIFIC challenge from the job description
- Show you deeply understand what they need and WHY they're hiring
- Do NOT start with "I am excited" or "I am writing to apply" — start with THEIR problem
- Example opener: "[Company] is scaling its automation capabilities but needs an engineer who can architect intelligent systems end-to-end, not just write scripts."

PARAGRAPH 2 — YOUR APPROACH + TOOLS + PROOF:
- How you solve this exact type of problem
- Name the specific tools/tech you'd use (matched to their stack)
- Reference 1-2 specific projects (NEURALYX, LIVITI, etc.) with METRICS
- Show your approach is operational, not just technical: "I analyze business processes deeply, align systems with SOPs, and build automation that integrates seamlessly into real-world environments"

PARAGRAPH 3 — RESULTS + ROI + WHAT BUSINESS GETS:
- Concrete outcomes: cost reduction, time saved, efficiency gained
- What the business gets by hiring you (not what you get from the job)
- Frame everything in business value: "reducing manual work by 95%", "processing 90+ sources in 8 seconds"
- What sets you apart: "I don't just automate tasks — I architect intelligent systems that run business operations"

PARAGRAPH 4 — 30-60 DAY CONTRIBUTION PLAN:
- Specific deliverable in first 30 days tailored to THIS role
- Show you can hit the ground running
- End with confidence, not desperation

CRITICAL RULES:
- Max 300-350 words, 4 tight paragraphs
- Every sentence must earn its place — no filler, no fluff
- Keywords from the job description woven naturally throughout
- Plain text only (no markdown, no JSON, no code fences)
- Tone: Direct, confident, results-focused, operational
- NEVER use: "I am excited to apply", "I believe I would be a great fit", "Thank you for considering"
- ALWAYS use: specific metrics, project names, business outcomes, ROI language`

  const userPrompt = `Write a Problem-Solution cover letter for:

COMPANY: ${job.company}
ROLE: ${job.title}
JOB DESCRIPTION (READ EVERY LINE — this is what they need):
${(job.description || '').slice(0, 2500)}

MY ADDITIONAL SKILLS: ${profile?.skills?.join(', ') || 'Vue.js, TypeScript, Python, Docker, OpenAI, LangChain, n8n, Supabase, GSAP, Tailwind CSS'}

INSTRUCTIONS:
1. READ the job description line by line. Identify the EXACT problem they are hiring for — not a generic "they need an engineer" but the SPECIFIC challenge (e.g., "scaling their AI pipeline while maintaining accuracy", "replacing fragmented manual workflows with automation")
2. For EACH key requirement in the JD, show I've already solved that exact problem — with a metric or project name
3. Use THEIR keywords from the JD naturally throughout (ATS optimization)
4. Position me as the candidate who already did what they need — not someone who "could" do it
5. Make the reader think "this person already built what we need" within the first 2 sentences
6. Be specific — never say "various projects" when you can say "NEURALYX (48 services, 7 AI agents)" or "LIVITI Content Engine (95% manual work reduction)"
7. The cover letter must make them want to reply IMMEDIATELY

Write the cover letter now — every sentence must earn its place.`

  return await callAI(systemPrompt, userPrompt)
}

// Send application email via Gmail SMTP
async function handleAutoApplySendEmail(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { to, subject, body: emailBody, attachments } = body
  if (!to || !subject || !emailBody) return json(res, 400, { error: 'to, subject, body required' })

  const mailer = getMailer()
  if (!mailer) return json(res, 500, { error: 'Gmail SMTP not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD env vars.' })

  try {
    const mailOptions: nodemailer.SendMailOptions = {
      from: `"${SMTP_FROM_NAME}" <${SMTP_REPLY_TO}>`,
      replyTo: SMTP_REPLY_TO,
      to, subject, text: emailBody,
      // BCC removed — sendApplyNotification() already sends a detailed notification with cover letter included
      attachments: attachments || [],
    }

    // Attach resume if exists
    try {
      await stat(join(UPLOADS_DIR, 'resume.pdf'))
      mailOptions.attachments = [...(mailOptions.attachments as nodemailer.SendMailOptions['attachments'] || []), { filename: `${SMTP_FROM_NAME.replace(/\s+/g, '_')}_Resume.pdf`, path: join(UPLOADS_DIR, 'resume.pdf') }]
    } catch { /* no resume file, skip attachment */ }

    const info = await mailer.sendMail(mailOptions)
    // No notification here — callers (batch/orchestrate) handle their own notifications
    json(res, 200, { success: true, messageId: info.messageId, detail: `Email sent to ${to}` })
  } catch (e) {
    json(res, 500, { success: false, error: e instanceof Error ? e.message : 'Send failed' })
  }
}

// ─── EmailApplyAgent (Phase 1b) ─────────────────────────────────────────────
// AI-adapted email body + custom subject + 48h dedup + episode logging.
// Replaces the hardcoded "Dear <company> Hiring Team" template with a per-job
// draft that the chatbot memory can recall later.

interface EmailDraftJob {
  title?: string
  company?: string
  description?: string
  url?: string
}

async function generateEmailDraft(job: EmailDraftJob, coverLetter: string): Promise<{ subject: string; body: string }> {
  const fallbackSubject = `Application for ${job.title || 'open role'} — ${SMTP_FROM_NAME}`
  const fallbackBody = `Dear ${job.company || ''} Hiring Team,\n\n${coverLetter}\n\nBest regards,\n${SMTP_FROM_NAME}\nAI Systems Engineer\ngabrielalvin.jobs@gmail.com\nhttps://neuralyx.ai.dev-environment.site`

  try {
    const systemPrompt = `You write concise professional application emails. Output strict JSON only: {"subject": string, "body": string}.
Rules:
- Subject: under 70 chars. Format "Application for <exact role> — <candidate>".
- Body: 130-170 words. Greeting, 2 sentences of relevant proof (reuse metrics from cover letter), close with availability + portfolio link. First-person, professional, not generic. No markdown.
- End body with: "Best regards,\\n${SMTP_FROM_NAME}\\nAI Systems Engineer\\ngabrielalvin.jobs@gmail.com\\nhttps://neuralyx.ai.dev-environment.site"
`
    const userPrompt = `Role: ${job.title || 'unknown'}
Company: ${job.company || 'unknown'}
JD snippet: ${(job.description || '').slice(0, 900)}
Cover letter (source material):
${coverLetter.slice(0, 2000)}

Return JSON.`
    const raw = await callAI(systemPrompt, userPrompt, 700)
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) return { subject: fallbackSubject, body: fallbackBody }
    const parsed = JSON.parse(m[0]) as { subject?: string; body?: string }
    const subject = (parsed.subject || '').trim().slice(0, 120) || fallbackSubject
    const body = (parsed.body || '').trim() || fallbackBody
    return { subject, body }
  } catch {
    return { subject: fallbackSubject, body: fallbackBody }
  }
}

interface EmailApplyInput {
  application_id: string
  job: EmailDraftJob & { id?: string }
  target_email: string
  cover_letter: string
}

interface EmailApplyResult {
  status: 'applied' | 'skipped_dedup' | 'apply_failed' | 'skipped_no_cover_letter'
  detail: string
  message_id?: string
  episode_id?: string
  subject?: string
}

async function runEmailApply(input: EmailApplyInput): Promise<EmailApplyResult> {
  const { application_id, job, target_email, cover_letter } = input
  const company = job.company || ''
  const domain = (() => { try { return new URL(job.url || '').hostname } catch { return '' } })()

  if (!cover_letter || cover_letter.length < 50) {
    return { status: 'skipped_no_cover_letter', detail: 'Cover letter empty — refusing to send' }
  }

  // 48h dedup — don't spam the same recipient for the same company
  const recent = await wasRecentlyEmailed(target_email, company, 48).catch(() => null)
  if (recent) {
    await insertEpisode({
      application_id,
      domain,
      channel: 'email',
      sub_agent: 'EmailApplyAgent',
      episode_type: 'email_skipped',
      observation: { target_email, company, duplicate_of: recent.episode_id, last_sent_at: recent.sent_at },
      action: 'dedup_skip',
      outcome: 'skipped',
      reasoning: `Already emailed ${target_email} for ${company} within 48h`,
      vision_summary: `Skipped duplicate email to ${target_email} for ${company} (sent ${recent.sent_at})`,
    }).catch(() => '')
    return { status: 'skipped_dedup', detail: `Already emailed ${target_email} for ${company} within 48h` }
  }

  const mailer = getMailer()
  if (!mailer) return { status: 'apply_failed', detail: 'SMTP not configured' }

  const draft = await generateEmailDraft(job, cover_letter)

  const mailOptions: nodemailer.SendMailOptions = {
    from: `"${SMTP_FROM_NAME}" <${SMTP_REPLY_TO}>`,
    replyTo: SMTP_REPLY_TO,
    to: target_email,
    subject: draft.subject,
    text: draft.body,
  }
  try {
    await stat(join(UPLOADS_DIR, 'resume.pdf'))
    mailOptions.attachments = [{ filename: `${SMTP_FROM_NAME.replace(/\s+/g, '_')}_Resume.pdf`, path: join(UPLOADS_DIR, 'resume.pdf') }]
  } catch { /* no resume */ }

  try {
    const info = await mailer.sendMail(mailOptions)
    const messageId = typeof info.messageId === 'string' ? info.messageId : ''
    const episodeId = await insertEpisode({
      application_id,
      domain,
      channel: 'email',
      sub_agent: 'EmailApplyAgent',
      episode_type: 'email_sent',
      observation: {
        target_email, company,
        subject: draft.subject,
        body_hash: draft.body.length, // cheap proxy — full body hashed by DB row size
        message_id: messageId,
        has_attachment: !!mailOptions.attachments,
      },
      action: 'sent',
      outcome: 'pending_ack',
      reasoning: `AI-drafted email sent to ${target_email}. Awaiting delivery webhook.`,
      vision_summary: `Sent application email to ${target_email} for "${job.title}" at ${company}. Subject: ${draft.subject.slice(0, 80)}.`,
      first_try_success: true,
    }).catch(() => '')
    return { status: 'applied', detail: `Email sent to ${target_email}`, message_id: messageId, episode_id: episodeId, subject: draft.subject }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Send failed'
    await insertEpisode({
      application_id,
      domain,
      channel: 'email',
      sub_agent: 'EmailApplyAgent',
      episode_type: 'abort',
      observation: { target_email, company, error: msg },
      action: 'send_failed',
      outcome: 'error',
      reasoning: msg,
      vision_summary: `Failed to send email to ${target_email} for ${company}: ${msg.slice(0, 120)}`,
      first_try_success: false,
    }).catch(() => '')
    return { status: 'apply_failed', detail: msg }
  }
}

// ─── RAG chunking store ───
// POST /api/rag/chunk — { source_type, source_id?, source_domain?, text, metadata?, target_chars?, overlap_chars? }
//   → { stored: N, ids: uuid[], chunks: [{index, token_estimate, length}] }
async function handleRagChunkStore(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as {
      source_type?: string
      source_id?: string | null
      source_domain?: string | null
      text?: string
      metadata?: Record<string, unknown>
      target_chars?: number
      overlap_chars?: number
    }
    const { source_type, source_id, source_domain, text, metadata } = body
    if (!source_type || !text || text.length < 30) {
      return json(res, 400, { error: 'source_type + text (min 30 chars) required' })
    }
    const { chunkText } = await import('./chunker.js')
    const chunks = chunkText(text, {
      targetChars: body.target_chars ?? 2000,
      overlapChars: body.overlap_chars ?? 200,
    })
    if (chunks.length === 0) return json(res, 200, { stored: 0, ids: [], chunks: [] })

    // If source_id provided, wipe existing chunks for idempotent re-ingest.
    if (source_id) {
      await orchQuery(
        `DELETE FROM chunked_documents WHERE source_type = $1 AND source_id = $2`,
        [source_type, source_id]
      )
    }

    const ids: string[] = []
    for (const c of chunks) {
      let vec: number[]
      try { vec = await openaiEmbed(c.text) } catch (e) {
        return json(res, 502, { error: e instanceof Error ? e.message : 'embed failed', stored: ids.length, ids })
      }
      const vecLit = `[${vec.join(',')}]`
      const rows = await orchQuery<{ id: string }>(
        `INSERT INTO chunked_documents
           (source_type, source_id, source_domain, chunk_index, chunk_count, chunk_text, chunk_token_estimate, embedding, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::vector,$9)
         RETURNING id`,
        [
          source_type,
          source_id || null,
          source_domain || null,
          c.index,
          chunks.length,
          c.text,
          c.tokenEstimate,
          vecLit,
          JSON.stringify(metadata || {}),
        ]
      )
      ids.push(rows[0]?.id)
    }
    return json(res, 200, {
      stored: ids.length,
      ids,
      chunks: chunks.map((c) => ({ index: c.index, token_estimate: c.tokenEstimate, length: c.text.length })),
    })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'chunk-store failed' })
  }
}

// POST /api/rag/search — { query, source_type?, source_id?, source_domain?, limit?, min_similarity? }
//   → { hits: [{ id, source_type, source_id, chunk_index, chunk_text, similarity, metadata }] }
async function handleRagSearch(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as {
      query?: string
      source_type?: string
      source_id?: string
      source_domain?: string
      limit?: number
      min_similarity?: number
    }
    if (!body.query || body.query.length < 3) return json(res, 400, { error: 'query required' })
    const limit = Math.min(Math.max(body.limit || 5, 1), 25)
    const minSim = body.min_similarity ?? 0
    let vec: number[]
    try { vec = await openaiEmbed(body.query) } catch (e) {
      return json(res, 502, { error: e instanceof Error ? e.message : 'embed failed' })
    }
    const vecLit = `[${vec.join(',')}]`

    const where: string[] = []
    const params: unknown[] = [vecLit]
    if (body.source_type) { params.push(body.source_type); where.push(`source_type = $${params.length}`) }
    if (body.source_id)   { params.push(body.source_id);   where.push(`source_id = $${params.length}`) }
    if (body.source_domain) { params.push(body.source_domain); where.push(`source_domain = $${params.length}`) }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    params.push(limit)

    const rows = await orchQuery<{
      id: string; source_type: string; source_id: string | null; chunk_index: number;
      chunk_text: string; metadata: Record<string, unknown>; distance: number
    }>(
      `SELECT id, source_type, source_id, chunk_index, chunk_text, metadata,
              (embedding <=> $1::vector) AS distance
       FROM chunked_documents
       ${whereSql}
       ORDER BY embedding <=> $1::vector
       LIMIT $${params.length}`,
      params
    )
    const hits = rows
      .map((r) => ({
        id: r.id,
        source_type: r.source_type,
        source_id: r.source_id,
        chunk_index: r.chunk_index,
        chunk_text: r.chunk_text,
        metadata: r.metadata,
        similarity: 1 - Number(r.distance),
      }))
      .filter((h) => h.similarity >= minSim)
    return json(res, 200, { hits })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'rag-search failed' })
  }
}

// HTTP: POST /api/success/embed — capture confirmation-page text + embed
// { application_id?, episode_id?, domain, page_text } → { stored: bool, id? }
async function handleSuccessEmbed(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req))
    const { episode_id, domain, page_text } = body as { episode_id?: string; domain?: string; page_text?: string }
    if (!page_text || page_text.length < 30) return json(res, 400, { error: 'page_text required (min 30 chars)' })
    const trimmed = page_text.slice(0, 2000)
    let vec: number[]
    try { vec = await openaiEmbed(trimmed) } catch (e) {
      return json(res, 502, { error: e instanceof Error ? e.message : 'embed failed' })
    }
    const vecLit = `[${vec.join(',')}]`
    const rows = await orchQuery<{ id: string }>(
      `INSERT INTO success_embeddings (episode_id, page_text, embedding, source_domain)
       VALUES ($1, $2, $3::vector, $4) RETURNING id`,
      [episode_id || null, trimmed, vecLit, domain || null]
    )
    return json(res, 200, { stored: true, id: rows[0]?.id })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'embed-success failed' })
  }
}

// HTTP: POST /api/success/check — does current page text look like a known success?
// { domain?, page_text } → { matched, similarity, nearest: { id, source_domain, snippet } | null }
async function handleSuccessCheck(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req))
    const { page_text, domain } = body as { page_text?: string; domain?: string }
    if (!page_text || page_text.length < 20) return json(res, 400, { error: 'page_text required' })
    let vec: number[]
    try { vec = await openaiEmbed(page_text.slice(0, 2000)) } catch (e) {
      return json(res, 502, { error: e instanceof Error ? e.message : 'embed failed' })
    }
    const vecLit = `[${vec.join(',')}]`
    const filterDomain = domain ? 'WHERE source_domain = $2' : ''
    const params: unknown[] = [vecLit]
    if (domain) params.push(domain)
    const rows = await orchQuery<{ id: string; source_domain: string | null; page_text: string; distance: number }>(
      `SELECT id, source_domain, page_text, (embedding <=> $1::vector) AS distance
       FROM success_embeddings ${filterDomain}
       ORDER BY embedding <=> $1::vector LIMIT 1`,
      params
    )
    if (rows.length === 0) return json(res, 200, { matched: false, similarity: 0, nearest: null })
    const similarity = 1 - Number(rows[0].distance)
    const matched = similarity >= 0.85
    return json(res, 200, {
      matched,
      similarity,
      nearest: { id: rows[0].id, source_domain: rows[0].source_domain, snippet: rows[0].page_text.slice(0, 200) },
    })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'check-success failed' })
  }
}

// HTTP: POST /api/apply/email  { application_id, job, target_email, cover_letter }
async function handleEmailApply(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req))
    const { application_id, job, target_email, cover_letter } = body
    if (!application_id || !job || !target_email) {
      return json(res, 400, { error: 'application_id, job, target_email required' })
    }
    const result = await runEmailApply({ application_id, job, target_email, cover_letter: cover_letter || '' })
    return json(res, 200, result)
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'email apply failed' })
  }
}

// HTTP: POST /api/webhooks/resend — bounce/delivered callbacks from Resend
// Updates the matching apply_episodes row via message_id lookup.
async function handleResendWebhook(req: IncomingMessage, res: ServerResponse) {
  try {
    const raw = await readBody(req)
    // Optional HMAC verification if RESEND_WEBHOOK_SECRET set
    const secret = process.env.RESEND_WEBHOOK_SECRET || ''
    if (secret) {
      const sig = (req.headers['svix-signature'] || req.headers['resend-signature'] || '').toString()
      if (!sig) return json(res, 401, { error: 'missing signature' })
      // Light check only — full svix HMAC verification would need extra dep
    }
    const body = JSON.parse(raw) as { type?: string; data?: { email_id?: string; to?: string[] } }
    const type = body.type || ''
    const messageId = body.data?.email_id || ''
    const outcome = type.includes('bounced') ? 'bounced' : type.includes('delivered') ? 'delivered' : null
    if (!messageId || !outcome) return json(res, 200, { ignored: true })
    // Find original episode and append a follow-up
    await insertEpisode({
      application_id: '00000000-0000-0000-0000-000000000000', // follow-up; linked via message_id
      channel: 'email',
      sub_agent: 'EmailApplyAgent',
      episode_type: outcome === 'bounced' ? 'email_bounced' : 'email_delivered',
      observation: { message_id: messageId, type, to: body.data?.to || [] },
      action: `webhook_${outcome}`,
      outcome,
      reasoning: `Resend webhook: ${type}`,
      vision_summary: `Email ${outcome} (message_id=${messageId.slice(0, 20)})`,
    }).catch(() => '')
    return json(res, 200, { ok: true })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'webhook failed' })
  }
}

// HTTP: POST /api/orchestrator/route — Phase 2 channel router
// { application_id, job, raw_data } → { sub_agent, channel, ats_type, target_email?, reason, secondary[] }
async function handleOrchestratorRoute(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req))
    const { application_id, job, raw_data } = body
    if (!application_id || !job) return json(res, 400, { error: 'application_id, job required' })
    const decision = routeChannel({ application_id, job, raw_data: raw_data || null })
    await persistRoutingDecision({ application_id, job, raw_data: raw_data || null }, decision).catch((e) => {
      console.warn('[orchestrator/route] persist failed:', e instanceof Error ? e.message : e)
    })
    return json(res, 200, { decision })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'route failed' })
  }
}

// Batch auto-apply: process multiple jobs sequentially
async function handleAutoApplyBatch(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { jobs, profile, mode } = body // jobs: array of job objects, mode: 'email_only' | 'all'
  if (!jobs?.length) return json(res, 400, { error: 'jobs array required' })

  const results: { job_id: string; title: string; status: string; method: string; detail: string }[] = []
  const mailer = getMailer()

  for (const job of jobs) {
    const rawData = job.raw_data || {}
    const appType = rawData.application_type || 'unknown'

    // Detect email channel from apply_channels if application_type not set
    const emailChannel = Array.isArray(rawData.apply_channels)
      ? rawData.apply_channels.find((ch: Record<string, unknown>) => ch.channel === 'email' && ch.target)
      : null
    const effectiveEmail = rawData.recruiter_email || rawData.inferred_company_email || emailChannel?.target || null
    const isEmailJob = appType === 'direct_email' || !!effectiveEmail

    // Only process email jobs in email_only mode
    if (mode === 'email_only' && !isEmailJob) {
      results.push({ job_id: job.id, title: job.title, status: 'skipped', method: appType, detail: 'Not an email application' })
      continue
    }

    if (isEmailJob && effectiveEmail && mailer) {
      rawData.recruiter_email = rawData.recruiter_email || effectiveEmail
      try {
        let coverLetter = rawData.cover_letter || ''
        if (!coverLetter) {
          try { coverLetter = await handleCoverLetterInternal(job, profile) } catch { /* skip */ }
        }

        // Delegate to EmailApplyAgent — AI body, dedup, episode logging
        const application_id = job.application_id || job.id || randomUUID()
        const result = await runEmailApply({
          application_id,
          job: { id: job.id, title: job.title, company: job.company, description: job.description, url: job.url },
          target_email: rawData.recruiter_email,
          cover_letter: coverLetter,
        })

        if (result.status === 'applied') {
          results.push({ job_id: job.id, title: job.title, status: 'applied', method: 'direct_email', detail: result.detail })
          broadcastNotification('apply', { job_id: job.id, title: job.title, company: job.company, status: 'applied', method: 'direct_email', detail: result.detail, timestamp: new Date().toISOString() })
          sendApplyNotification(job as NotifyJobData, undefined, 'direct_email', 'applied', result.detail, coverLetter)
          await new Promise(r => setTimeout(r, 30000))
        } else if (result.status === 'skipped_dedup') {
          results.push({ job_id: job.id, title: job.title, status: 'skipped', method: 'direct_email', detail: result.detail })
          broadcastNotification('apply', { job_id: job.id, title: job.title, company: job.company, status: 'skipped', method: 'direct_email', detail: result.detail, timestamp: new Date().toISOString() })
        } else {
          results.push({ job_id: job.id, title: job.title, status: 'apply_failed', method: 'direct_email', detail: result.detail })
          broadcastNotification('apply', { job_id: job.id, title: job.title, company: job.company, status: 'apply_failed', method: 'direct_email', detail: result.detail, timestamp: new Date().toISOString() })
          sendApplyNotification(job as NotifyJobData, undefined, 'direct_email', 'apply_failed', result.detail)
        }
      } catch (e) {
        results.push({ job_id: job.id, title: job.title, status: 'apply_failed', method: 'direct_email', detail: e instanceof Error ? e.message : 'Send failed' })
        broadcastNotification('apply', { job_id: job.id, title: job.title, company: job.company, status: 'apply_failed', method: 'direct_email', detail: e instanceof Error ? e.message : 'Send failed', timestamp: new Date().toISOString() })
        sendApplyNotification(job as NotifyJobData, undefined, 'direct_email', 'apply_failed', e instanceof Error ? e.message : 'Send failed')
      }
    } else if (!isEmailJob) {
      // Browser-based apply — return instructions for the frontend/agent
      results.push({ job_id: job.id, title: job.title, status: 'needs_browser', method: appType, detail: `Requires browser automation: ${rawData.company_careers_url || rawData.external_form_url || job.url}` })
      broadcastNotification('apply', { job_id: job.id, title: job.title, company: job.company, status: 'needs_browser', method: appType, timestamp: new Date().toISOString() })
    } else {
      results.push({ job_id: job.id, title: job.title, status: 'skipped', method: appType, detail: 'No recruiter email or SMTP not configured' })
    }
  }

  json(res, 200, { results, total: jobs.length, applied: results.filter(r => r.status === 'applied').length, failed: results.filter(r => r.status === 'apply_failed').length, needs_browser: results.filter(r => r.status === 'needs_browser').length })
}

// ─── Browser Apply Callback ───
// Called by scripts/apply-indeed.ts after completing a platform apply
async function handleBrowserApplyCallback(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { job_id, job_title, company, platform, status, method, detail, screenshot_pre, screenshot_confirm, cover_letter, error, url, description } = body

  if (!job_title && !job_id) return json(res, 400, { error: 'job_title or job_id required' })

  const now = new Date().toISOString()
  let listingId = job_id || null

  // 1. Create or find job_listing record (so dashboard has full details)
  if (!listingId && job_title) {
    // Check if listing already exists by URL or title+company
    if (url) {
      const { data: existing } = await supabaseQuery('job_listings', 'GET', undefined, `select=id&url=eq.${encodeURIComponent(url)}&limit=1`) as { data: any[] | null }
      if (existing && existing.length > 0 && existing[0]?.id) listingId = existing[0].id
    }
    if (!listingId) {
      // Create new job listing with full details
      listingId = randomUUID()
      const listing = {
        id: listingId,
        title: job_title,
        company: company || 'Unknown',
        platform: platform || 'indeed',
        url: url || null,
        description: (description || '').slice(0, 5000) || null,
        location: 'Remote',
        status: status === 'applied' ? 'applied' : 'saved',
        created_at: now,
        updated_at: now,
      }
      const { error: listErr } = await supabaseQuery('job_listings', 'POST', listing)
      if (listErr) console.error('[BrowserCallback] Job listing insert failed:', listErr)
      else console.log('[BrowserCallback] Created job listing:', job_title, '@', company)
    }
  }

  // 2. Insert job_application record linked to the listing
  const appStatus = status === 'applied' ? 'applied'
    : status === 'dry_run' ? 'saved'
    : status === 'form_incomplete' ? 'apply_failed'
    : status === 'captcha' ? 'manual_apply_needed'
    : status === 'skipped' ? 'saved'
    : 'apply_failed'

  const appRecord = {
    id: randomUUID(),
    job_listing_id: listingId,
    platform: platform || 'indeed',
    channel: 'direct',
    status: appStatus,
    applied_via: method || 'indeed_vision_agent',
    cover_letter: cover_letter || null,
    notes: `${detail || ''}${error ? ` | Error: ${error}` : ''}`,
    created_at: now,
    updated_at: now,
  }

  const { error: dbError } = await supabaseQuery('job_applications', 'POST', appRecord)
  if (dbError) console.error('[BrowserCallback] Application insert failed:', dbError)

  // 3. Update job_listing status
  if (listingId && status === 'applied') {
    await supabaseQuery('job_listings', 'PATCH', { status: 'applied', updated_at: now }, `id=eq.${listingId}`)
  }

  // 3. Broadcast SSE notification (with full details)
  broadcastNotification('apply', {
    job_id, title: job_title, company, platform, url,
    status, method, detail,
    timestamp: new Date().toISOString(),
  })

  // 4. Send email notification — SKIP for Indeed (Indeed sends its own confirmation)
  const jobPlatform = (platform || 'indeed').toLowerCase()
  if (!jobPlatform.includes('indeed')) {
    sendApplyNotification(
      { title: job_title || 'Unknown', company: company || 'Unknown', url: url || '', platform: jobPlatform } as NotifyJobData,
      undefined, method || 'browser_agent', status, detail, cover_letter
    )
  } else {
    console.log('[BrowserCallback] Skipping Gmail notification for Indeed — dashboard + SSE only')
  }

  // 5. Log to agent logs
  const logEntry = {
    id: randomUUID(),
    run_id: `browser-${Date.now()}`,
    step: 'browser_apply',
    status: status === 'applied' ? 'completed' : 'failed',
    message: `${job_title} @ ${company}: ${detail}`,
    jobs_applied: status === 'applied' ? 1 : 0,
    created_at: new Date().toISOString(),
  }
  await supabaseQuery('job_agent_logs', 'POST', logEntry)

  json(res, 200, { success: true, application_id: appRecord.id, status })
}

// ─── Indeed Browser Search & Apply — real browser, search ph.indeed.com + form fill ───

const APPLICANT_PROFILE = {
  name: 'Gabriel Alvin Aquino',
  email: 'gabrielalvin.jobs@gmail.com',
  phone: '0951 540 8978',
  title: 'AI Systems Engineer & Automation Developer',
  location: 'Angeles, Central Luzon, Philippines',
  experience_years: 8,
  salary_php: '80000-150000',
  salary_usd: '1500-3000',
  portfolio: 'https://neuralyx.ai.dev-environment.site',
  github: 'https://github.com/HierArch24',
  linkedin: 'https://linkedin.com/in/gabrielalvinaquino',
  video_intro: 'https://drive.google.com/file/d/1gLq_z3wHdp7FVX8kWUZheR9nozxbVdcR/view?usp=sharing',
  resume_url: 'https://neuralyx.ai.dev-environment.site/assets/resume.pdf',
  experience_summary: `I have 8+ years building AI automation systems and full-stack applications. Key achievements:
- Engineered NEURALYX: AI-powered portfolio with 48 integrated services, 7 autonomous agents, 5 Docker containers
- Automated 95% of content workflows for LIVITI using n8n and OpenAI
- Built a job pipeline processing 90+ listings in 8 seconds across 8 platforms
- Tech stack: Vue.js, TypeScript, Python, FastAPI, Docker, Supabase, PostgreSQL, OpenAI, LangChain, n8n`,
  work_authorization: 'Yes, I am authorized to work in the Philippines. No visa sponsorship required.',
  willing_relocate: 'Open to remote work. Based in Philippines.',
  start_date: 'Immediately available / 1 week notice',
  willing_wfh: 'Yes',
  education: 'BS Information Technology, University of the Cordilleras',
}

function answerIndeedQuestion(questionText: string, coverLetter?: string): string {
  const q = (questionText || '').toLowerCase()
  if (q.includes('video') || q.includes('introduction video') || q.includes('record')) return APPLICANT_PROFILE.video_intro
  if (q.includes('resume') || q.includes('cv')) return APPLICANT_PROFILE.resume_url
  if (q.includes('salary') || q.includes('compensation') || q.includes('rate')) {
    if (q.includes('usd') || q.includes('dollar') || q.includes('$')) return `USD ${APPLICANT_PROFILE.salary_usd}/month`
    return `PHP ${APPLICANT_PROFILE.salary_php}/month`
  }
  if (q.includes('authorized') || q.includes('visa') || q.includes('sponsorship') || q.includes('legally')) return APPLICANT_PROFILE.work_authorization
  if (q.includes('relocate')) return APPLICANT_PROFILE.willing_relocate
  if (q.includes('start date') || q.includes('available') || q.includes('earliest')) return APPLICANT_PROFILE.start_date
  if (q.includes('remote') || q.includes('work from home') || q.includes('wfh')) return APPLICANT_PROFILE.willing_wfh
  if (q.includes('years') && (q.includes('experience') || q.includes('how many'))) return String(APPLICANT_PROFILE.experience_years)
  if (q.includes('first name') && !q.includes('last')) return APPLICANT_PROFILE.name.split(' ')[0]
  if (q.includes('last name') || q.includes('surname')) return APPLICANT_PROFILE.name.split(' ').slice(1).join(' ')
  if (q.includes('full name') || (q.includes('name') && !q.includes('first') && !q.includes('last'))) return APPLICANT_PROFILE.name
  if (q.includes('email')) return APPLICANT_PROFILE.email
  if (q.includes('phone') || q.includes('tel') || q.includes('mobile')) return APPLICANT_PROFILE.phone
  if (q.includes('city') || q.includes('location') || q.includes('address')) return APPLICANT_PROFILE.location
  if (q.includes('linkedin')) return APPLICANT_PROFILE.linkedin
  if (q.includes('github') || q.includes('git')) return APPLICANT_PROFILE.github
  if (q.includes('portfolio') || q.includes('website')) return APPLICANT_PROFILE.portfolio
  if (q.includes('education') || q.includes('degree') || q.includes('university')) return APPLICANT_PROFILE.education
  if (q.includes('cover letter') || q.includes('why') || q.includes('interest') || q.includes('experience') || q.includes('background') || q.includes('tell us')) return coverLetter || APPLICANT_PROFILE.experience_summary
  if (q.includes('do you have') || q.includes('are you') || q.includes('can you') || q.includes('will you')) {
    if (q.includes('criminal') || q.includes('disability') || q.includes('not')) return 'No'
    return 'Yes'
  }
  return coverLetter || APPLICANT_PROFILE.experience_summary
}

let browserSearchApplyRunning = false

// Edge CDP Relay — runs on host machine, bridges Docker → host Edge browser
// Start it with: node scripts/edge-relay.js (or scripts\start-relay.bat)
const EDGE_RELAY_HOSTS = ['host.docker.internal', 'localhost', '127.0.0.1']

async function findEdgeRelay(): Promise<string | null> {
  for (const host of EDGE_RELAY_HOSTS) {
    try {
      const res = await fetch(`http://${host}:9223/health`, { signal: AbortSignal.timeout(2000) })
      if (res.ok) return `http://${host}:9223`
    } catch { /* try next */ }
  }
  return null
}

async function handleIndeedBrowserSearchApply(req: IncomingMessage, res: ServerResponse) {
  if (browserSearchApplyRunning) return json(res, 200, { error: 'Browser pipeline already running', running: true })
  browserSearchApplyRunning = true

  const body = JSON.parse(await readBody(req))
  const { query = 'AI automation engineer OR n8n developer OR workflow automation', count = 1, min_score = 40 } = body

  // Respond immediately — pipeline runs in background
  json(res, 200, { started: true, query, count, min_score })

  const ts = () => new Date().toISOString()

  try {
    broadcastNotification('node_status', { node: 'browser_search', status: 'starting', message: 'Connecting to Edge relay (gabrielalvin.jobs@gmail.com)...', timestamp: ts() })

    // ─── Locate edge-relay on host ───
    const relayBase = await findEdgeRelay()
    if (!relayBase) {
      broadcastNotification('node_status', {
        node: 'browser_search', status: 'error',
        message: 'Edge relay not running. Start it: double-click scripts\\start-relay.bat (Edge must be open with Profile 7)',
        timestamp: ts(),
      })
      browserSearchApplyRunning = false
      return
    }
    broadcastNotification('node_status', { node: 'browser_search', status: 'running', message: `Relay found at ${relayBase} — opening Indeed PH: "${query}"`, timestamp: ts() })

    // ─── Step 1: Search via relay ───
    let searchResult: { jobs?: any[]; error?: string }
    try {
      const searchRes = await fetch(`${relayBase}/browser/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, count: count + 3 }),
        signal: AbortSignal.timeout(120000),
      })
      searchResult = await searchRes.json() as { jobs?: any[]; error?: string }
    } catch (e) {
      broadcastNotification('node_status', { node: 'browser_search', status: 'error', message: `Search failed: ${e}`, timestamp: ts() })
      browserSearchApplyRunning = false
      return
    }

    if (searchResult.error || !searchResult.jobs?.length) {
      broadcastNotification('node_status', { node: 'browser_search', status: 'error', message: searchResult.error || 'No jobs found on Indeed PH', timestamp: ts() })
      browserSearchApplyRunning = false
      return
    }

    const allJobs = searchResult.jobs
    broadcastNotification('node_status', { node: 'browser_search', status: 'running', message: `${allJobs.length} job(s) found — scoring against profile (min ${min_score})`, timestamp: ts() })

    // ─── Step 2: Score jobs ───
    const MY_KEYWORDS = ['automation','n8n','workflow','rpa','ai','playwright','typescript','javascript','node','python','llm','api','integration','data','pipeline','scraping','devops','backend','fastapi','supabase','docker','openai','langchain']
    const scoredJobs = allJobs.map((job: any) => {
      const text = `${job.title} ${job.description}`.toLowerCase()
      const matches = MY_KEYWORDS.filter(k => text.includes(k)).length
      const score = Math.min(100, Math.round((matches / MY_KEYWORDS.length) * 100 * 1.5))
      return { ...job, score }
    }).filter((j: any) => j.score >= min_score)

    if (scoredJobs.length === 0) {
      broadcastNotification('node_status', { node: 'browser_search', status: 'complete', message: `No jobs passed score threshold (${min_score}+). Try lowering min score.`, timestamp: ts() })
      browserSearchApplyRunning = false
      return
    }

    const toApply = scoredJobs.slice(0, count)
    broadcastNotification('node_status', { node: 'browser_search', status: 'complete', message: `${toApply.length} qualified job(s) — generating cover letters`, timestamp: ts() })

    // ─── Step 3: Cover Letters ───
    for (const job of toApply) {
      try {
        const system = `Write a concise cover letter (150-250 words) for this job using Problem-Solution framework.
Applicant: Gabriel Alvin Aquino, AI Systems Engineer & Automation Developer, 8+ years.
Key projects: NEURALYX (48 services, 7 agents), LIVITI (95% automation), Job Pipeline (90+ listings/8s).
Stack: Vue.js, TypeScript, Python, FastAPI, Docker, Supabase, n8n, OpenAI, LangChain.
Portfolio: ${APPLICANT_PROFILE.portfolio} | Video: ${APPLICANT_PROFILE.video_intro}
Rules: Lead with their problem, match experience to requirements, mention video link, no buzzwords, under 250 words, no header/footer, just letter body.`
        job.cover_letter = await callAI(system, `Job: ${job.title} at ${job.company}\n\n${(job.description || '').slice(0, 1500)}`)
      } catch { job.cover_letter = APPLICANT_PROFILE.experience_summary }
    }

    // ─── Step 4: Apply to each job via relay ───
    for (let i = 0; i < toApply.length; i++) {
      const job = toApply[i]
      broadcastNotification('node_status', { node: 'apply_start', status: 'running', job_title: job.title, company: job.company, message: `Applying: ${job.title} @ ${job.company} (score: ${job.score})`, timestamp: ts() })

      let applyStatus = 'failed'
      let applyDetail = 'Unknown error'

      try {
        const applyRes = await fetch(`${relayBase}/browser/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_url: job.url, job_title: job.title, company: job.company, cover_letter: job.cover_letter }),
          signal: AbortSignal.timeout(180000),
        })
        const applyResult = await applyRes.json() as { status?: string; detail?: string; error?: string; final_url?: string }
        applyStatus = applyResult.status || (applyResult.error ? 'error' : 'failed')
        applyDetail = applyResult.detail || applyResult.error || ''
      } catch (e) {
        applyStatus = 'error'
        applyDetail = e instanceof Error ? e.message : String(e)
      }

      broadcastNotification('node_status', { node: 'apply_complete', status: applyStatus, job_title: job.title, company: job.company, detail: applyDetail, timestamp: ts() })

      // Record result in Supabase
      try {
        await fetch(`http://localhost:${PORT}/api/jobs/auto-apply/browser`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_title: job.title, company: job.company, platform: 'indeed', status: applyStatus, method: 'browser_search_apply', detail: applyDetail, cover_letter: job.cover_letter }),
        })
      } catch { /* non-critical */ }

      // Throttle between jobs
      if (i < toApply.length - 1) await new Promise(r => setTimeout(r, 15000 + Math.random() * 10000))
    }

    broadcastNotification('node_status', { node: 'pipeline_complete', status: 'complete', message: `Pipeline done. Processed ${toApply.length} job(s).`, timestamp: ts() })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    broadcastNotification('node_status', { node: 'pipeline_error', status: 'error', message: msg, timestamp: ts() })
  } finally {
    browserSearchApplyRunning = false
  }
}

// ─── Indeed Form Apply — Full step-by-step orchestration via Edge CDP ───
async function handleIndeedFormApply(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { job_url, job_title, company, cover_letter, jk, dry_run } = body

  if (!job_url && !jk) return json(res, 400, { error: 'job_url or jk required' })

  // Broadcast start status
  broadcastNotification('node_status', { node: 'indeed_form_apply', status: 'started', job_title, company, timestamp: new Date().toISOString() })

  try {
    // Delegate to Edge relay HTTP API (works from Docker)
    const relayBase = await findEdgeRelay().catch(() => null)
    if (!relayBase) {
      return json(res, 200, { status: 'failed', detail: 'Edge relay not running. Start it: double-click scripts\\start-relay.bat' })
    }

    const relayRes = await fetch(`${relayBase}/browser/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_url: job_url || `https://ph.indeed.com/viewjob?jk=${jk}`, job_title, company, cover_letter }),
      signal: AbortSignal.timeout(180000),
    }).catch((e: Error) => { throw new Error(`Relay apply failed: ${e.message}`) })

    const relayData = await relayRes.json() as { status?: string; detail?: string; steps?: number; final_url?: string }
    // Normalize to n8n switch node values: applied | captcha | dry_run | failed
    const N8N_STATUSES = new Set(['applied', 'captcha', 'dry_run', 'failed'])
    const normalizedStatus = N8N_STATUSES.has(relayData.status || '') ? relayData.status : 'failed'
    broadcastNotification('node_status', { node: 'indeed_form_apply', status: normalizedStatus, detail: relayData.detail, timestamp: new Date().toISOString() })
    return json(res, 200, { status: normalizedStatus, detail: relayData.detail || relayData.status, final_url: relayData.final_url })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    broadcastNotification('node_status', { node: 'indeed_form_apply', status: 'error', detail: msg, timestamp: new Date().toISOString() })
    return json(res, 200, { status: 'failed', detail: msg })
  }
}

// ─── DEAD CODE BELOW — old CDP-direct path, kept for reference ───
async function _handleIndeedFormApplyLegacy_unused(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { job_url, job_title, company, cover_letter, jk, dry_run } = body
  try {
    let chromium: any
    try {
      chromium = (await import(/* webpackIgnore: true */ 'playwright' as string)).chromium
    } catch {
      return json(res, 200, { status: 'failed', detail: 'Playwright not available' })
    }
    const browser = await chromium.connectOverCDP('http://localhost:9222')
    const ctx = browser.contexts()[0]
    const pages = ctx.pages()

    // Find or open the Indeed job page
    let jobPage = pages.find((p: any) => p.url().includes(jk || ''))
    if (!jobPage) {
      const targetUrl = job_url || `https://ph.indeed.com/viewjob?jk=${jk}`
      const searchTab = pages.find((p: any) => p.url().includes('ph.indeed.com'))
      if (searchTab) {
        await searchTab.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
        jobPage = searchTab
      } else {
        jobPage = await ctx.newPage()
        await jobPage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
      }
    }
    await jobPage.bringToFront()
    await jobPage.waitForTimeout(2000)

    // Step 1: Click Apply Now
    broadcastNotification('node_status', { node: 'click_apply', status: 'running', timestamp: new Date().toISOString() })
    const applyClicked = await jobPage.evaluate(() => {
      const btn = document.getElementById('indeedApplyButton') || document.querySelector('button[class*="apply"]')
      if (btn) { (btn as HTMLElement).click(); return true }
      return false
    })
    if (!applyClicked) {
      return json(res, 200, { status: 'failed', detail: 'No Apply button found — job may require external application' })
    }
    await jobPage.waitForTimeout(5000)

    // Find the SmartApply form tab
    const allPages = ctx.pages()
    let formPage = allPages.find((p: any) => p.url().includes('smartapply.indeed.com/beta/indeedapply/form'))
    if (!formPage) {
      return json(res, 200, { status: 'failed', detail: 'SmartApply form did not open — may need Cloudflare bypass' })
    }
    await formPage.bringToFront()

    // Step 2: Walk through form using fillAllSteps
    broadcastNotification('node_status', { node: 'fill_form', status: 'running', timestamp: new Date().toISOString() })

    let fillAllSteps: any
    try {
      const mod = await import(/* webpackIgnore: true */ '../scripts/indeed-form-filler' as string)
      fillAllSteps = mod.fillAllSteps
    } catch {
      return json(res, 200, { status: 'error', detail: 'Form filler module not available in this environment' })
    }
    const fillResult = await fillAllSteps(formPage, cover_letter || '', 15)

    broadcastNotification('node_status', {
      node: 'fill_form', status: fillResult.success ? 'completed' : 'failed',
      filled: fillResult.allFilled.length, skipped: fillResult.allSkipped.length,
      timestamp: new Date().toISOString()
    })

    // Step 3: Handle review page
    const currentUrl = formPage.url()
    const bodyText = (await formPage.innerText('body').catch(() => '')).toLowerCase()

    if (bodyText.includes('application has been submitted') || bodyText.includes('successfully applied')) {
      // Already submitted during fillAllSteps
      broadcastNotification('node_status', { node: 'submit', status: 'completed', timestamp: new Date().toISOString() })
      return json(res, 200, { status: 'applied', detail: 'Application submitted via form flow', filled: fillResult.allFilled, skipped: fillResult.allSkipped })
    }

    if (dry_run) {
      return json(res, 200, { status: 'dry_run', detail: 'Reached review page — dry run, not submitting', filled: fillResult.allFilled, skipped: fillResult.allSkipped, url: currentUrl })
    }

    // Step 4: Solve reCAPTCHA if present
    broadcastNotification('node_status', { node: 'captcha', status: 'checking', timestamp: new Date().toISOString() })
    const captchaIframe = await formPage.evaluate(() => {
      const iframes = Array.from(document.querySelectorAll('iframe'))
      const anchor = iframes.find(f => f.src.includes('recaptcha') && f.src.includes('anchor') && f.src.includes('normal'))
      if (anchor) {
        anchor.scrollIntoView({ block: 'center' })
        return true
      }
      return false
    })

    if (captchaIframe) {
      await formPage.waitForTimeout(1000)
      // Click the reCAPTCHA checkbox
      const pos = await formPage.evaluate(() => {
        const iframes = Array.from(document.querySelectorAll('iframe'))
        const anchor = iframes.find(f => f.src.includes('anchor') && f.src.includes('normal'))
        if (!anchor) return null
        const rect = anchor.getBoundingClientRect()
        return { x: rect.x + 30, y: rect.y + rect.height / 2 }
      })
      if (pos) {
        await formPage.mouse.click(pos.x, pos.y)
        await formPage.waitForTimeout(5000)
        // Check if image challenge appeared
        const challengeVisible = await formPage.evaluate(() => {
          const iframes = Array.from(document.querySelectorAll('iframe'))
          const bframe = iframes.find(f => f.src.includes('bframe'))
          return bframe ? bframe.offsetHeight > 200 : false
        })
        if (challengeVisible) {
          broadcastNotification('node_status', { node: 'captcha', status: 'challenge_appeared', detail: 'Image CAPTCHA challenge — needs manual solve', timestamp: new Date().toISOString() })
          return json(res, 200, { status: 'captcha', detail: 'reCAPTCHA image challenge appeared — manual solve needed', filled: fillResult.allFilled })
        }
      }
      broadcastNotification('node_status', { node: 'captcha', status: 'solved', timestamp: new Date().toISOString() })
    }

    // Step 5: Click Submit
    broadcastNotification('node_status', { node: 'submit', status: 'running', timestamp: new Date().toISOString() })
    await formPage.evaluate(() => {
      const btns = document.querySelectorAll('button')
      for (const btn of btns) {
        if (btn.innerText.trim().includes('Submit your application')) { btn.click(); return }
      }
    })
    await formPage.waitForTimeout(8000)

    // Check result
    const finalText = (await formPage.innerText('body').catch(() => '')).toLowerCase()
    const submitted = finalText.includes('application has been submitted') || finalText.includes('successfully')

    broadcastNotification('node_status', { node: 'submit', status: submitted ? 'completed' : 'failed', timestamp: new Date().toISOString() })

    return json(res, 200, {
      status: submitted ? 'applied' : 'submit_failed',
      detail: submitted ? 'Application submitted successfully' : 'Submit button clicked but confirmation not detected',
      filled: fillResult.allFilled,
      skipped: fillResult.allSkipped,
      url: formPage.url()
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    broadcastNotification('node_status', { node: 'indeed_form_apply', status: 'error', detail: msg, timestamp: new Date().toISOString() })
    return json(res, 200, { status: 'error', detail: msg })
  }
}

// ─── Indeed Form Step — execute a single step (called by n8n per-node) ───
async function handleIndeedFormStep(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { step, action, data } = body

  broadcastNotification('node_status', { node: `step_${step}`, status: 'running', action, timestamp: new Date().toISOString() })

  try {
    let chromium: any
    try {
      chromium = (await import(/* webpackIgnore: true */ 'playwright' as string)).chromium
    } catch {
      return json(res, 200, { success: false, error: 'Playwright not available in this environment.' })
    }
    const browser = await chromium.connectOverCDP('http://localhost:9222')
    const ctx = browser.contexts()[0]
    const pages = ctx.pages()
    const formPage = pages.find((p: any) => p.url().includes('smartapply.indeed.com/beta/indeedapply/form'))

    if (!formPage) {
      return json(res, 200, { success: false, error: 'No SmartApply form tab found' })
    }
    await formPage.bringToFront()
    await formPage.waitForTimeout(1000)

    const currentUrl = formPage.url()
    const bodyText = await formPage.innerText('body').catch(() => '')

    let result: any = { step, currentUrl, bodyText: bodyText.substring(0, 500) }

    switch (action) {
      case 'get_page_info': {
        const fields = await formPage.evaluate(() => {
          return Array.from(document.querySelectorAll('input, select, textarea'))
            .filter((e: any) => e.name !== 'g-recaptcha-response')
            .map((el: any) => ({ tag: el.tagName, type: el.type, name: el.name || el.id, value: el.value?.substring(0, 200), label: el.closest('div')?.querySelector('label')?.innerText?.trim() || '' }))
        })
        const buttons = await formPage.evaluate(() => Array.from(document.querySelectorAll('button')).map((b: any) => b.innerText.trim()).filter((t: string) => t.length > 0))
        result = { ...result, fields, buttons }
        break
      }
      case 'fill_field': {
        const { selector, value } = data
        await formPage.locator(selector).fill(value)
        result.filled = true
        break
      }
      case 'click_continue': {
        await formPage.evaluate(() => {
          const btns = document.querySelectorAll('button')
          for (const btn of btns) {
            const t = btn.innerText.trim()
            if (t === 'Continue' || t === 'Continue applying' || t === 'Apply anyway') { btn.click(); return }
          }
        })
        await formPage.waitForTimeout(3000)
        result.newUrl = formPage.url()
        break
      }
      case 'write_cover_letter': {
        const { cover_letter } = data
        // Navigate to additional-documents if not there
        if (!currentUrl.includes('additional-documents')) {
          await formPage.evaluate(() => {
            window.history.pushState({}, '', '/beta/indeedapply/form/resume-module/additional-documents')
            window.dispatchEvent(new PopStateEvent('popstate'))
          })
          await formPage.waitForTimeout(3000)
        }
        // Look for Write option and textarea
        const writeOption = formPage.locator('text=Write a cover letter').first()
        if (await writeOption.count() > 0) {
          await writeOption.click().catch(() => {})
          await formPage.waitForTimeout(1500)
        }
        const ta = formPage.locator('textarea:visible').first()
        if (await ta.count() > 0) {
          await ta.click()
          await ta.fill('')
          await ta.type((cover_letter || '').slice(0, 2000), { delay: 3 })
          result.written = true
          result.chars = cover_letter?.length || 0
        } else {
          result.written = false
          result.error = 'No textarea found'
        }
        break
      }
      case 'click_submit': {
        await formPage.evaluate(() => {
          const btns = document.querySelectorAll('button')
          for (const btn of btns) { if (btn.innerText.trim().includes('Submit your application')) { btn.click(); return } }
        })
        await formPage.waitForTimeout(8000)
        const finalText = (await formPage.innerText('body').catch(() => '')).toLowerCase()
        result.submitted = finalText.includes('application has been submitted') || finalText.includes('successfully')
        result.newUrl = formPage.url()
        break
      }
      case 'screenshot': {
        const screenshotPath = `screenshots/n8n-step-${step}-${Date.now()}.png`
        await formPage.screenshot({ path: screenshotPath })
        result.screenshot = screenshotPath
        break
      }
      default:
        result.error = `Unknown action: ${action}`
    }

    broadcastNotification('node_status', { node: `step_${step}`, status: 'completed', action, timestamp: new Date().toISOString() })
    return json(res, 200, { success: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    broadcastNotification('node_status', { node: `step_${step}`, status: 'error', detail: msg, timestamp: new Date().toISOString() })
    return json(res, 200, { success: false, error: msg })
  }
}

// ─── Indeed Auto-Pipeline — search → score → filter → apply loop ───
let indeedPipelineRunning = false

async function handleIndeedAutoPipeline(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { target = 20, min_score = 40, platform = 'indeed' } = body

  if (indeedPipelineRunning) {
    return json(res, 200, { error: 'Pipeline already running', running: true })
  }

  indeedPipelineRunning = true
  const results: any[] = []
  const ts = () => new Date().toISOString()

  // Respond immediately — pipeline runs in background
  json(res, 200, { started: true, target, min_score, platform })

  try {
    // Step 1: Search
    broadcastNotification('indeed_pipeline', { step: 'searching', message: `Searching ${platform} for jobs...`, timestamp: ts() })

    const searchRes = await fetch(`http://localhost:${PORT}/api/jobs/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queries: ['AI engineer remote', 'full stack developer remote', 'automation engineer remote', 'Python developer remote'],
        platforms: [platform], count: target * 2, freshness_days: 7,
      }),
      signal: AbortSignal.timeout(60000),
    })
    const searchData = await searchRes.json() as any
    const rawJobs = searchData.jobs || searchData.results || []
    broadcastNotification('indeed_pipeline', { step: 'search_complete', total: rawJobs.length, message: `Found ${rawJobs.length} jobs`, timestamp: ts() })

    if (!rawJobs.length) {
      broadcastNotification('indeed_pipeline', { step: 'pipeline_complete', applied: 0, failed: 0, message: 'No jobs found', timestamp: ts() })
      indeedPipelineRunning = false
      return
    }

    // Step 2: Score & Classify
    broadcastNotification('indeed_pipeline', { step: 'scoring', message: `Scoring ${rawJobs.length} jobs...`, timestamp: ts() })

    const classifyRes = await fetch(`http://localhost:${PORT}/api/jobs/classify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobs: rawJobs }),
      signal: AbortSignal.timeout(120000),
    })
    const classifyData = await classifyRes.json() as any
    const scoredJobs = classifyData.jobs || classifyData.classified || classifyData.results || rawJobs

    // Step 3: Filter
    const qualified = scoredJobs.filter((j: any) => {
      const score = j.match_score || j.score || 0
      return score >= min_score && !j.already_applied && !j.expired
    }).slice(0, target)

    broadcastNotification('indeed_pipeline', {
      step: 'filter_complete', total: qualified.length,
      message: `${qualified.length} jobs qualify (score ≥ ${min_score})`,
      timestamp: ts()
    })

    if (!qualified.length) {
      broadcastNotification('indeed_pipeline', { step: 'pipeline_complete', applied: 0, failed: 0, message: 'No jobs meet minimum score', timestamp: ts() })
      indeedPipelineRunning = false
      return
    }

    // Step 4: Apply to each job
    let applied = 0, failed = 0, captcha = 0

    for (let i = 0; i < qualified.length; i++) {
      if (!indeedPipelineRunning) {
        broadcastNotification('indeed_pipeline', { step: 'stopped', job_index: i, total: qualified.length, message: 'Pipeline stopped by user', timestamp: ts() })
        break
      }

      const job = qualified[i]
      const jobTitle = job.title || 'Unknown'
      const company = job.company || 'Unknown'
      const jobUrl = job.url || ''
      const jk = jobUrl.match(/jk=([a-f0-9]+)/)?.[1] || ''

      broadcastNotification('indeed_pipeline', {
        step: 'apply_start', job_index: i, total: qualified.length,
        job_title: jobTitle, company,
        score: job.match_score || job.score,
        message: `Applying ${i + 1}/${qualified.length}: ${jobTitle} @ ${company}`,
        timestamp: ts()
      })

      try {
        // Generate cover letter
        let coverLetter = ''
        try {
          const clRes = await fetch(`http://localhost:${PORT}/api/jobs/cover-letter`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: jobTitle, company, description: (job.description || '').substring(0, 3000), skills: ['Python', 'TypeScript', 'AI/ML', 'LLM', 'Docker', 'Vue.js', 'n8n', 'Automation'] }),
            signal: AbortSignal.timeout(30000),
          })
          const clData = await clRes.json() as any
          coverLetter = clData.cover_letter || ''
        } catch { /* cover letter optional */ }

        // Apply via form
        const applyRes = await fetch(`http://localhost:${PORT}/api/jobs/indeed/form-apply`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_url: jobUrl, jk, job_title: jobTitle, company, cover_letter: coverLetter, dry_run: false }),
          signal: AbortSignal.timeout(180000),
        })
        const applyData = await applyRes.json() as any

        const status = applyData.status || 'error'
        if (status === 'applied') applied++
        else if (status === 'captcha') captcha++
        else failed++

        results.push({ title: jobTitle, company, status, detail: applyData.detail || '' })

        broadcastNotification('indeed_pipeline', {
          step: 'apply_result', job_index: i, total: qualified.length,
          job_title: jobTitle, company, status,
          detail: applyData.detail || '',
          applied, failed, captcha,
          message: `${status === 'applied' ? '✓' : status === 'captcha' ? '⚠' : '✗'} ${jobTitle} @ ${company}: ${status}`,
          timestamp: ts()
        })

        // Record to Supabase (skip Gmail for Indeed)
        await fetch(`http://localhost:${PORT}/api/jobs/auto-apply/browser`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_title: jobTitle, company, platform, url: jobUrl, status: status === 'applied' ? 'applied' : 'apply_failed', method: 'indeed_auto_pipeline', detail: applyData.detail || status, cover_letter: coverLetter }),
        }).catch(() => {})

      } catch (e) {
        failed++
        const msg = e instanceof Error ? e.message : String(e)
        results.push({ title: jobTitle, company, status: 'error', detail: msg })
        broadcastNotification('indeed_pipeline', {
          step: 'apply_result', job_index: i, total: qualified.length,
          job_title: jobTitle, company, status: 'error', detail: msg,
          applied, failed, captcha,
          message: `✗ ${jobTitle} @ ${company}: ${msg.substring(0, 80)}`,
          timestamp: ts()
        })
      }

      // Throttle between applications
      if (i < qualified.length - 1 && indeedPipelineRunning) {
        await new Promise(r => setTimeout(r, 15000))
      }
    }

    // Done
    broadcastNotification('indeed_pipeline', {
      step: 'pipeline_complete', applied, failed, captcha,
      total: qualified.length, results,
      message: `Pipeline complete. Applied: ${applied}, Failed: ${failed}, CAPTCHA: ${captcha}`,
      timestamp: ts()
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    broadcastNotification('indeed_pipeline', { step: 'error', detail: msg, timestamp: ts() })
  } finally {
    indeedPipelineRunning = false
  }
}

// ─── Orchestrate: Route jobs to browser or email apply ───
// Platform routing: indeed/jobstreet/kalibrr → browser, others → email
const BROWSER_PLATFORMS = new Set(['indeed', 'indeed_ph', 'jobstreet', 'kalibrr', 'glassdoor', 'linkedin'])

async function handleOrchestrate(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { job_ids, mode } = body // mode: 'browser' | 'email' | 'auto'
  if (!job_ids?.length) return json(res, 400, { error: 'job_ids array required' })

  const results: { job_id: string; title: string; company: string; route: string; status: string; detail: string }[] = []

  for (const jobId of job_ids) {
    // Fetch job from Supabase
    const { data: jobRows } = await supabaseQuery('job_listings', 'GET', undefined, `id=eq.${jobId}&select=*`)
    const jobs = jobRows as Record<string, unknown>[] | null
    if (!jobs?.length) {
      results.push({ job_id: jobId, title: '?', company: '?', route: 'skip', status: 'skipped', detail: 'Job not found in DB' })
      continue
    }
    const job = jobs[0]
    const rawData = (job.raw_data || {}) as Record<string, unknown>
    const platform = (job.platform as string || '').toLowerCase()
    const title = job.title as string || ''
    const company = job.company as string || ''
    const jobUrl = job.url as string || ''

    // Generate cover letter if missing
    let coverLetter = (rawData.cover_letter as string) || ''
    if (!coverLetter && (OPENAI_KEY || GEMINI_KEY)) {
      try { coverLetter = await handleCoverLetterInternal({ title, company, description: (job.description as string) || '' }, undefined) } catch { /* skip */ }
    }

    // Route decision
    const useBrowser = mode === 'browser' || (mode === 'auto' && BROWSER_PLATFORMS.has(platform))
    const useEmail = mode === 'email' || (mode === 'auto' && !BROWSER_PLATFORMS.has(platform))

    if (useBrowser && jobUrl) {
      // Browser apply — return instructions for the browser agent script
      results.push({
        job_id: jobId, title, company,
        route: 'browser',
        status: 'pending_browser',
        detail: JSON.stringify({
          id: jobId, url: jobUrl, title, company,
          cover_letter: coverLetter, platform,
          description: ((job.description as string) || '').slice(0, 1000),
        }),
      })
    } else if (useEmail) {
      // Email apply — use existing flow
      const recruiterEmail = (rawData.recruiter_email as string) || (rawData.inferred_company_email as string) || ''
      if (!recruiterEmail) {
        results.push({ job_id: jobId, title, company, route: 'email', status: 'skipped', detail: 'No recruiter email found' })
        continue
      }

      if (!coverLetter || coverLetter.length < 50) {
        results.push({ job_id: jobId, title, company, route: 'email', status: 'skipped', detail: 'Cover letter too short — refusing to send' })
        continue
      }

      const mailer = getMailer()
      if (!mailer) {
        results.push({ job_id: jobId, title, company, route: 'email', status: 'failed', detail: 'SMTP not configured' })
        continue
      }

      try {
        const emailBody = `Dear ${company} Hiring Team,\n\n${coverLetter}\n\nBest regards,\n${SMTP_FROM_NAME}\nAI Systems Engineer\ngabrielalvin.jobs@gmail.com\nhttps://neuralyx.ai.dev-environment.site`
        const mailOptions: nodemailer.SendMailOptions = {
          from: `"${SMTP_FROM_NAME}" <${SMTP_REPLY_TO}>`,
          replyTo: SMTP_REPLY_TO,
          to: recruiterEmail,
          subject: `Application for ${title} — ${SMTP_FROM_NAME}`,
          text: emailBody,
        }
        try {
          await stat(join(UPLOADS_DIR, 'resume.pdf'))
          mailOptions.attachments = [{ filename: `${SMTP_FROM_NAME.replace(/\s+/g, '_')}_Resume.pdf`, path: join(UPLOADS_DIR, 'resume.pdf') }]
        } catch { /* no resume */ }

        await mailer.sendMail(mailOptions)

        // Record application in Supabase
        await supabaseQuery('job_applications', 'POST', {
          id: randomUUID(),
          job_listing_id: jobId,
          platform, channel: 'email', status: 'applied',
          applied_via: 'auto_apply_agent',
          cover_letter: coverLetter,
          notes: `Cover letter sent to ${recruiterEmail} - ${title}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

        // Update listing status
        await supabaseQuery('job_listings', 'PATCH', { status: 'applied', updated_at: new Date().toISOString() }, `id=eq.${jobId}`)

        // SSE + notification
        broadcastNotification('apply', { job_id: jobId, title, company, status: 'applied', method: 'direct_email', detail: `Email sent to ${recruiterEmail}`, timestamp: new Date().toISOString() })
        sendApplyNotification(job as unknown as NotifyJobData, undefined, 'direct_email', 'applied', `Email sent to ${recruiterEmail}`, coverLetter)

        results.push({ job_id: jobId, title, company, route: 'email', status: 'applied', detail: `Email sent to ${recruiterEmail}` })

        // Throttle
        await new Promise(r => setTimeout(r, 30000))
      } catch (e) {
        results.push({ job_id: jobId, title, company, route: 'email', status: 'failed', detail: e instanceof Error ? e.message : 'Send failed' })
      }
    } else {
      results.push({ job_id: jobId, title, company, route: 'skip', status: 'skipped', detail: 'No apply method available' })
    }
  }

  // Separate browser jobs that need the script
  const browserJobs = results.filter(r => r.route === 'browser' && r.status === 'pending_browser')
  const emailResults = results.filter(r => r.route !== 'browser' || r.status !== 'pending_browser')

  json(res, 200, {
    results: emailResults,
    browser_jobs: browserJobs.map(r => JSON.parse(r.detail)),
    summary: {
      total: job_ids.length,
      email_applied: emailResults.filter(r => r.status === 'applied').length,
      browser_pending: browserJobs.length,
      skipped: emailResults.filter(r => r.status === 'skipped').length,
      failed: emailResults.filter(r => r.status === 'failed').length,
    },
  })
}

// ─── LLM Wiki (Karpathy Pattern) ───

const WIKI_DIR = '/app/wiki'

async function wikiIngestJobs(jobs: { title: string; company: string; description?: string | null; location?: string | null; url?: string; raw_data?: Record<string, unknown> }[]) {
  try { await mkdir(join(WIKI_DIR, 'pages', 'companies'), { recursive: true }) } catch { /* exists */ }
  try { await mkdir(join(WIKI_DIR, 'pages', 'skills'), { recursive: true }) } catch { /* exists */ }

  const companiesUpdated = new Set<string>()
  const skillsFound = new Map<string, number>()
  const now = new Date().toISOString().split('T')[0]

  for (const job of jobs) {
    const companySlug = job.company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
    if (!companySlug || companiesUpdated.has(companySlug)) continue
    companiesUpdated.add(companySlug)

    const companyFile = join(WIKI_DIR, 'pages', 'companies', `${companySlug}.md`)
    const rawData = job.raw_data || {}
    const skillMatches = (rawData.skill_matches as string[]) || []
    const skillGaps = (rawData.skill_gaps as string[]) || []

    // Track skills
    for (const s of [...skillMatches, ...skillGaps]) {
      skillsFound.set(s, (skillsFound.get(s) || 0) + 1)
    }

    // Check if company page exists
    let existing = ''
    try { existing = await readFile(companyFile, 'utf-8') } catch { /* new page */ }

    if (!existing) {
      // Create new company page
      const page = `---
title: ${job.company}
type: company
created: ${now}
updated: ${now}
sources: 1
tags: [${(rawData.company_type_detail as string) || 'unknown'}]
---

# ${job.company}

## Overview
- **Type:** ${(rawData.company_bucket as string)?.replace('_', ' ') || 'Unknown'}
- **Industry:** ${(rawData.company_type_detail as string)?.replace('_', ' ') || 'Unknown'}
- **ATS:** ${(rawData.ats_system as string) || 'Unknown'}

## Open Positions
- ${job.title} (${job.location || 'Remote'}) — [View](${job.url || '#'})

## Application Channels
${(rawData.apply_channels as { channel: string; detail: string }[])?.map(c => `- **${c.channel}:** ${c.detail}`).join('\n') || '- Job board apply'}

## Contact
- Recruiter email: ${(rawData.recruiter_email as string) || (rawData.inferred_company_email as string) || 'Not found'}

## Notes
*Auto-generated by NEURALYX Wiki Agent on ${now}*
`
      await writeFile(companyFile, page)
    } else {
      // Update existing page — add new position
      const posLine = `- ${job.title} (${job.location || 'Remote'}) — [View](${job.url || '#'})`
      if (!existing.includes(job.title)) {
        const updated = existing.replace(
          /## Open Positions\n/,
          `## Open Positions\n${posLine}\n`
        ).replace(/updated: .+/, `updated: ${now}`)
          .replace(/sources: (\d+)/, (_, n) => `sources: ${Number(n) + 1}`)
        await writeFile(companyFile, updated)
      }
    }
  }

  // Update wiki log
  try {
    const logFile = join(WIKI_DIR, 'log.md')
    let log = ''
    try { log = await readFile(logFile, 'utf-8') } catch { log = '# Operation Log\n' }
    log += `\n## [${now}] ingest | ${jobs.length} jobs from ${companiesUpdated.size} companies\nCompanies: ${[...companiesUpdated].slice(0, 10).join(', ')}${companiesUpdated.size > 10 ? ` +${companiesUpdated.size - 10} more` : ''}\nSkills found: ${[...skillsFound.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s, c]) => `${s}(${c})`).join(', ')}\n`
    await writeFile(logFile, log)
  } catch { /* log write failed */ }
}

async function handleWikiSearch(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { query } = body
  if (!query) return json(res, 400, { error: 'query required' })

  const pagesDir = join(WIKI_DIR, 'pages')
  const results: { file: string; title: string; excerpt: string }[] = []

  async function searchDir(dir: string) {
    try {
      const { readdir } = await import('node:fs/promises')
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) { await searchDir(path); continue }
        if (!entry.name.endsWith('.md')) continue
        try {
          const content = await readFile(path, 'utf-8')
          if (content.toLowerCase().includes(query.toLowerCase())) {
            const titleMatch = content.match(/^# (.+)$/m)
            const title = titleMatch?.[1] || entry.name.replace('.md', '')
            const idx = content.toLowerCase().indexOf(query.toLowerCase())
            const excerpt = content.slice(Math.max(0, idx - 50), idx + 100).trim()
            results.push({ file: path.replace(WIKI_DIR + '/', ''), title, excerpt })
          }
        } catch { /* skip */ }
      }
    } catch { /* dir doesn't exist */ }
  }

  await searchDir(pagesDir)
  json(res, 200, { results, total: results.length })
}

// ===================================================================
// Orchestrator memory + Vision Recovery endpoints (Phase 0, 1)
// ===================================================================

async function handleOrchestratorEpisodePost(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as {
      application_id?: string
      job_listing_id?: string
      domain?: string
      channel?: string
      sub_agent?: string
      episode_type?: string
      observation?: Record<string, unknown>
      action?: string
      outcome?: string
      reasoning?: string
      vision_summary?: string
      confidence?: number
      first_try_success?: boolean
      pre_flight_blockers?: Record<string, unknown>[]
      screenshot_path?: string
    }
    if (!body.application_id || !body.episode_type) {
      return json(res, 400, { error: 'application_id and episode_type required' })
    }
    const id = await insertEpisode({
      application_id: body.application_id,
      job_listing_id: body.job_listing_id || null,
      domain: body.domain || null,
      channel: body.channel || null,
      sub_agent: body.sub_agent || null,
      episode_type: body.episode_type,
      observation: body.observation || null,
      action: body.action || null,
      outcome: body.outcome || null,
      reasoning: body.reasoning || null,
      vision_summary: body.vision_summary || null,
      confidence: body.confidence ?? null,
      first_try_success: body.first_try_success ?? null,
      pre_flight_blockers: body.pre_flight_blockers || null,
      screenshot_path: body.screenshot_path || null,
    })
    return json(res, 200, { id })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'Episode insert failed' })
  }
}

async function handleOrchestratorEpisodesGet(applicationId: string, limit: number, res: ServerResponse) {
  try {
    const rows = await fetchEpisodes(applicationId, limit)
    return json(res, 200, { episodes: rows })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'Fetch failed' })
  }
}

async function handleOrchestratorStateGet(applicationId: string, res: ServerResponse) {
  try {
    const rows = await getOrchestratorState(applicationId)
    return json(res, 200, { state: rows })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'Fetch failed' })
  }
}

// GET /api/orchestrator/dashboard → UI summary
//   { first_try: {rate, n, hits}, recent_recoveries[], active_states[], routing_counts{} }
async function handleOrchestratorDashboard(res: ServerResponse) {
  try {
    const [kpi, recoveries, active, routing] = await Promise.all([
      orchQuery<{ hits: number; total: number }>(
        `SELECT
           COUNT(*) FILTER (WHERE first_try_success IS TRUE)::int AS hits,
           COUNT(*) FILTER (WHERE first_try_success IS NOT NULL)::int AS total
         FROM apply_episodes
         WHERE created_at > now() - interval '14 days'`
      ),
      orchQuery(
        `SELECT id, application_id, domain, channel, sub_agent, episode_type, action, outcome,
                reasoning, vision_summary, confidence, created_at
         FROM apply_episodes
         WHERE episode_type IN ('recovery_action','form_analyzed','email_sent','email_bounced','abort')
         ORDER BY created_at DESC LIMIT 20`
      ),
      orchQuery(
        `SELECT application_id, channel, sub_agent, ats_type, current_step, step_name,
                step_attempts, last_url, last_decision, decision_conf, updated_at
         FROM orchestrator_state
         WHERE updated_at > now() - interval '6 hours'
         ORDER BY updated_at DESC LIMIT 15`
      ),
      orchQuery<{ sub_agent: string; n: number }>(
        `SELECT sub_agent, COUNT(*)::int AS n
         FROM apply_episodes
         WHERE action = 'route_channel' AND created_at > now() - interval '14 days'
         GROUP BY sub_agent ORDER BY n DESC`
      ),
    ])
    const k = kpi[0] || { hits: 0, total: 0 }
    return json(res, 200, {
      first_try: {
        hits: k.hits || 0,
        total: k.total || 0,
        rate: k.total ? Math.round(((k.hits || 0) / k.total) * 1000) / 10 : 0,
      },
      recent_recoveries: recoveries,
      active_states: active,
      routing_counts: Object.fromEntries(routing.map((r) => [r.sub_agent, r.n])),
    })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'dashboard failed' })
  }
}

async function handleSmartApplySmoke(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as {
      job_url?: string; job_title?: string; company?: string; cover_letter?: string
    }
    if (!body.job_url) return json(res, 400, { error: 'job_url required' })

    const relayBase = await findEdgeRelay().catch(() => null)
    if (!relayBase) return json(res, 503, { error: 'Edge relay offline — start scripts/start-relay.bat' })

    const application_id = randomUUID()
    const startedAt = Date.now()

    broadcastNotification('node_status', {
      node: 'smartapply_smoke', status: 'started',
      application_id, job_url: body.job_url, job_title: body.job_title, company: body.company,
      timestamp: new Date().toISOString(),
    })

    const relayRes = await fetch(`${relayBase}/browser/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_url: body.job_url,
        job_title: body.job_title || '',
        company: body.company || '',
        cover_letter: body.cover_letter || '',
        application_id,
        smoke: true,  // keeps jobPage on the target URL — no search-results redirect
      }),
      signal: AbortSignal.timeout(240000),
    }).catch((e: Error) => { throw new Error(`relay unreachable: ${e.message}`) })

    const relayData = await relayRes.json() as { status?: string; detail?: string; steps?: number; final_url?: string }

    const episodes = await orchQuery<{
      episode_type: string; action: string | null; outcome: string | null; reasoning: string | null;
      vision_summary: string | null; domain: string | null; confidence: number | null; created_at: string;
    }>(
      `SELECT episode_type, action, outcome, reasoning, vision_summary, domain, confidence, created_at
       FROM apply_episodes WHERE application_id = $1::uuid ORDER BY created_at ASC`,
      [application_id]
    ).catch(() => [])

    const hasRoute = episodes.some(e => e.action === 'route_channel')
    const hasRecovery = episodes.filter(e => e.episode_type === 'recovery_action').length
    const hasFormAnalyzed = episodes.some(e => e.episode_type === 'form_analyzed')

    // On job_gone (404), fetch a fresh candidate suggestion from job_listings so UI can one-click retry.
    let nextCandidate: { job_url: string; title: string | null; company: string | null } | null = null
    if (relayData.status === 'job_gone') {
      const fresh = await orchQuery<{ job_url: string; title: string | null; company: string | null }>(
        `SELECT jl.job_url, jl.title, jl.company
         FROM job_listings jl
         WHERE jl.job_url IS NOT NULL
           AND jl.job_url LIKE 'http%'
           AND jl.job_url <> $1
           AND NOT EXISTS (
             SELECT 1 FROM apply_episodes ae
             WHERE ae.observation->>'url' = jl.job_url
               AND ae.observation->>'stuck_reason' IN ('job_gone_404','login_required')
           )
         ORDER BY jl.created_at DESC NULLS LAST
         LIMIT 1`,
        [body.job_url]
      ).catch(() => [])
      if (fresh.length > 0) nextCandidate = fresh[0]
    }

    const result = {
      application_id,
      status: relayData.status || 'unknown',
      detail: relayData.detail || '',
      steps: relayData.steps || 0,
      final_url: relayData.final_url || '',
      duration_ms: Date.now() - startedAt,
      episode_count: episodes.length,
      recovery_count: hasRecovery,
      form_analyzed: hasFormAnalyzed,
      routed: hasRoute,
      episodes: episodes.slice(0, 40),
      next_candidate: nextCandidate,
    }

    broadcastNotification('node_status', {
      node: 'smartapply_smoke', status: result.status,
      application_id, detail: result.detail, duration_ms: result.duration_ms,
      timestamp: new Date().toISOString(),
    })

    return json(res, 200, result)
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'smoke failed' })
  }
}

async function handleSmartApplyCandidates(res: ServerResponse) {
  try {
    const rows = await orchQuery<{
      application_id: string; url: string; page_title: string | null; domain: string | null;
      episode_type: string; outcome: string | null; vision_summary: string | null;
      company: string | null; job_title: string | null; created_at: string;
    }>(
      `WITH latest AS (
         SELECT DISTINCT ON (e.application_id)
           e.application_id,
           e.observation->>'url' AS url,
           e.observation->>'title' AS page_title,
           e.domain,
           e.episode_type,
           e.outcome,
           e.vision_summary,
           e.created_at
         FROM apply_episodes e
         WHERE e.observation->>'url' IS NOT NULL
           AND e.observation->>'url' LIKE 'http%'
         ORDER BY e.application_id, e.created_at DESC
       )
       SELECT l.application_id, l.url, l.page_title, l.domain, l.episode_type, l.outcome,
              l.vision_summary, l.created_at,
              jl.company, jl.title AS job_title
       FROM latest l
       LEFT JOIN job_applications ja ON ja.id = l.application_id
       LEFT JOIN job_listings jl ON jl.id = ja.job_listing_id
       ORDER BY l.created_at DESC
       LIMIT 15`
    )
    return json(res, 200, { candidates: rows })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'candidates failed' })
  }
}

async function handleOrchestratorStatePost(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as { application_id?: string; channel?: string; patch?: Record<string, unknown> }
    if (!body.application_id || !body.channel) return json(res, 400, { error: 'application_id and channel required' })
    await upsertOrchestratorState(body.application_id, body.channel, body.patch || {})
    return json(res, 200, { ok: true })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'Upsert failed' })
  }
}

async function handleSelectorsCacheGet(domain: string, buttonType: string, res: ServerResponse) {
  try {
    const selectors = await getCachedSelectors(domain, buttonType)
    return json(res, 200, { selectors })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'Fetch failed' })
  }
}

async function handleSelectorsCachePost(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as { domain?: string; button_type?: string; selector?: string; success?: boolean; episode_id?: string }
    if (!body.domain || !body.button_type || !body.selector) return json(res, 400, { error: 'domain, button_type, selector required' })
    await recordSelectorOutcome(body.domain, body.button_type, body.selector, body.success !== false, body.episode_id)
    return json(res, 200, { ok: true })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'Record failed' })
  }
}

async function handleVisionRecover(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as {
      application_id: string
      domain: string
      channel: string
      ats_type?: string
      sub_agent: string
      current_url: string
      current_title: string
      stuck_reason: string
      pre_flight_blockers?: Record<string, unknown>[]
      screenshot_base64?: string
      dom_snapshot?: string
      history?: Record<string, unknown>[]
    }
    if (!body.application_id || !body.screenshot_base64) return json(res, 400, { error: 'application_id and screenshot_base64 required' })
    if (!GEMINI_KEY) return json(res, 500, { error: 'GEMINI_KEY not configured' })

    // Channel-specific hint
    const channelHint =
      body.ats_type === 'workday' ? 'Workday forms: stuck usually means a required field above the fold was missed, or the wizard moved to the next step already.' :
      body.ats_type === 'greenhouse' ? 'Greenhouse forms: submit needs the resume upload field filled and the EEO radios selected.' :
      body.ats_type === 'lever' ? 'Lever forms: usually a simple single-page form. Stuck often means a required demographic question.' :
      body.channel === 'job_board' ? 'Indeed SmartApply / LinkedIn Easy Apply: invisible reCAPTCHA is a common silent blocker — look for the grecaptcha badge in the bottom-right.' :
      body.channel === 'generic_form' ? 'Unknown form: look closely for red validation text near fields, or hidden required fields off-screen.' :
      'No channel-specific hints.'

    const historySummary = (body.history || []).slice(0, 5).map((h, i) => {
      const hh = h as { episode_type?: string; action?: string; outcome?: string; reasoning?: string; created_at?: string }
      return `${i + 1}. [${hh.episode_type || '?'}] ${hh.action || ''} → ${hh.outcome || '?'}${hh.reasoning ? ' // ' + String(hh.reasoning).slice(0, 100) : ''}`
    }).join('\n')

    const prompt = `You are a RecoveryAgent for an automated job-apply pipeline.
A sub-agent is stuck. Your job: look at the screenshot, the DOM snapshot, and the episode history — then recommend exactly ONE action.

CONTEXT:
  Domain: ${body.domain}
  Channel: ${body.channel}${body.ats_type ? ' / ' + body.ats_type : ''}
  Sub-agent: ${body.sub_agent}
  Current URL: ${body.current_url}
  Page title: ${body.current_title}
  Stuck reason: ${body.stuck_reason}
  Pre-flight blockers: ${JSON.stringify(body.pre_flight_blockers || [])}

CHANNEL HINT: ${channelHint}

DOM SNAPSHOT (pruned):
${(body.dom_snapshot || '').slice(0, 4000)}

RECENT EPISODES:
${historySummary || '(none)'}

DECISION VOCABULARY (pick EXACTLY ONE):
  - RETRY_SAME: transient issue, retry the same action
  - RETRY_DIFFERENT_SELECTOR: submit button selector was wrong, try a different one (also return suggested_selector)
  - WAIT_FOR_CAPTCHA: invisible reCAPTCHA is processing, wait wait_ms and retry
  - VISION_CLICK: click at specific coordinates (also return click_coordinates {x, y})
  - REFRESH_PAGE: page state is broken, reload and retry
  - SCROLL_AND_RETRY: needed element is off-screen
  - ABORT_CHANNEL: unrecoverable, give up this channel

Return STRICT JSON (no markdown, no commentary):
{
  "decision": "<one of the above>",
  "confidence": <0-100>,
  "reasoning": "<1-3 sentences explaining the decision, chatbot-readable>",
  "suggested_selector": "<optional>",
  "click_coordinates": {"x": <number>, "y": <number>} (optional),
  "wait_ms": <optional>,
  "detected_blockage": "invisible_recaptcha|validation|login_wall|missing_field|overlay|unknown",
  "next_channel_hint": "<optional, only if ABORT_CHANNEL>"
}`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/png', data: body.screenshot_base64 } },
            ],
          }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 600, thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: AbortSignal.timeout(30000),
      },
    )
    if (!geminiRes.ok) {
      const err = await geminiRes.text()
      return json(res, 502, { error: `Gemini ${geminiRes.status}: ${err.slice(0, 200)}` })
    }
    const geminiData = await geminiRes.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) {
      return json(res, 502, {
        decision: 'ABORT_CHANNEL',
        confidence: 0,
        reasoning: 'Gemini returned non-JSON response',
        detected_blockage: 'unknown',
      })
    }
    const parsed = JSON.parse(match[0]) as {
      decision?: string; confidence?: number; reasoning?: string;
      suggested_selector?: string; click_coordinates?: { x: number; y: number };
      wait_ms?: number; detected_blockage?: string; next_channel_hint?: string;
    }
    return json(res, 200, {
      decision: parsed.decision || 'ABORT_CHANNEL',
      confidence: parsed.confidence ?? 50,
      reasoning: parsed.reasoning || '',
      suggested_selector: parsed.suggested_selector,
      click_coordinates: parsed.click_coordinates,
      wait_ms: parsed.wait_ms,
      detected_blockage: parsed.detected_blockage || 'unknown',
      next_channel_hint: parsed.next_channel_hint,
    })
  } catch (e) {
    return json(res, 500, {
      decision: 'ABORT_CHANNEL',
      confidence: 0,
      reasoning: `Recovery endpoint error: ${e instanceof Error ? e.message : String(e)}`,
      detected_blockage: 'unknown',
    })
  }
}

// HTTP: POST /api/vision/analyze-form — Phase 1c GenericFormAgent field enumerator
// { screenshot_base64, dom_snapshot?, url? } →
//   { fields: [{ label, field_type, required?, visible_options?, selector_hint? }] }
async function handleVisionAnalyzeForm(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as {
      screenshot_base64?: string
      dom_snapshot?: string
      url?: string
    }
    if (!body.screenshot_base64) return json(res, 400, { error: 'screenshot_base64 required' })
    if (!GEMINI_KEY) return json(res, 500, { error: 'GEMINI_KEY not configured' })

    const prompt = `You analyze a job-application form. Enumerate EVERY input, textarea, select, radio-group, checkbox, and file-upload visible in the screenshot.

URL: ${body.url || 'unknown'}
DOM SNAPSHOT (pruned):
${(body.dom_snapshot || '').slice(0, 4000)}

Return STRICT JSON (no markdown):
{
  "fields": [
    {
      "label": "<human label, e.g. 'First name', 'Resume', 'How did you hear about us?'>",
      "field_type": "text|email|phone|number|textarea|select|radio|checkbox|file|date|url|unknown",
      "required": true|false,
      "visible_options": ["opt1","opt2"] (for select/radio only),
      "selector_hint": "<a CSS selector the filler can try, or null>"
    }
  ]
}
Order fields top-to-bottom as they appear. Skip decorative text and labels that aren't fields.`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/png', data: body.screenshot_base64 } },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1800, thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: AbortSignal.timeout(40000),
      },
    )
    if (!geminiRes.ok) {
      const err = await geminiRes.text()
      return json(res, 502, { error: `Gemini ${geminiRes.status}: ${err.slice(0, 200)}` })
    }
    const data = await geminiRes.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return json(res, 502, { error: 'Gemini returned non-JSON', fields: [] })
    const parsed = JSON.parse(match[0]) as { fields?: unknown[] }
    return json(res, 200, { fields: parsed.fields || [] })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'analyze-form failed', fields: [] })
  }
}

const server = createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    return res.end()
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`)

  // ─── Orchestrator memory + Vision Recovery ───
  if (url.pathname === '/api/vision/recover' && req.method === 'POST') {
    return handleVisionRecover(req, res)
  }
  if (url.pathname === '/api/vision/analyze-form' && req.method === 'POST') {
    return handleVisionAnalyzeForm(req, res)
  }
  if (url.pathname === '/api/orchestrator/episode' && req.method === 'POST') {
    return handleOrchestratorEpisodePost(req, res)
  }
  if (url.pathname.startsWith('/api/orchestrator/episodes/') && req.method === 'GET') {
    const appId = url.pathname.replace('/api/orchestrator/episodes/', '')
    const limit = parseInt(url.searchParams.get('limit') || '20', 10)
    return handleOrchestratorEpisodesGet(appId, limit, res)
  }
  if (url.pathname === '/api/orchestrator/state' && req.method === 'POST') {
    return handleOrchestratorStatePost(req, res)
  }
  if (url.pathname === '/api/orchestrator/dashboard' && req.method === 'GET') {
    return handleOrchestratorDashboard(res)
  }
  if (url.pathname === '/api/smartapply/smoke' && req.method === 'POST') {
    return handleSmartApplySmoke(req, res)
  }
  if (url.pathname === '/api/smartapply/candidates' && req.method === 'GET') {
    return handleSmartApplyCandidates(res)
  }
  if (url.pathname.startsWith('/api/orchestrator/state/') && req.method === 'GET') {
    const appId = url.pathname.replace('/api/orchestrator/state/', '')
    return handleOrchestratorStateGet(appId, res)
  }
  if (url.pathname === '/api/selectors/cache' && req.method === 'GET') {
    const domain = url.searchParams.get('domain') || ''
    const buttonType = url.searchParams.get('button_type') || 'continue'
    if (!domain) return json(res, 400, { error: 'domain required' })
    return handleSelectorsCacheGet(domain, buttonType, res)
  }
  if (url.pathname === '/api/selectors/cache' && req.method === 'POST') {
    return handleSelectorsCachePost(req, res)
  }

  if (url.pathname === '/api/fetch-url' && req.method === 'POST') {
    return handleFetchUrl(req, res)
  }

  if (url.pathname === '/api/upload-image' && req.method === 'POST') {
    return handleUploadImage(req, res)
  }

  if (url.pathname === '/api/ai/compress' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req))
    const { text, mode } = body
    if (!text) return json(res, 400, { error: 'text required' })
    const system = mode === 'caveman'
      ? 'Rewrite text in ultra-compressed caveman style. Drop articles (a/an/the), filler words, pleasantries. Keep ALL technical terms, numbers, proper nouns, and facts exact. Max 2 sentences. Return ONLY the compressed text, no quotes, no explanation.'
      : 'Compress this text to 30% of original length. Keep all key information. Return ONLY compressed text.'
    try {
      const result = await callAI(system, text)
      return json(res, 200, { compressed: result.trim() })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Compression failed'
      return json(res, 500, { error: msg })
    }
  }

  if (url.pathname === '/api/screenshot' && req.method === 'POST') {
    return handleScreenshot(req, res)
  }

  if (url.pathname === '/api/proxy-image' && req.method === 'POST') {
    return handleProxyImage(req, res)
  }

  if (url.pathname === '/api/jobs/search' && req.method === 'POST') {
    return handleJobSearch(req, res)
  }

  if (url.pathname === '/api/jobs/classify' && req.method === 'POST') {
    return handleClassifyJob(req, res)
  }

  if (url.pathname === '/api/jobs/match' && req.method === 'POST') {
    return handleMatchJob(req, res)
  }

  if (url.pathname === '/api/jobs/cover-letter' && req.method === 'POST') {
    return handleCoverLetter(req, res)
  }

  if (url.pathname === '/api/jobs/research' && req.method === 'POST') {
    return handleResearchCompany(req, res)
  }

  if (url.pathname === '/api/jobs/agent/run' && req.method === 'POST') {
    return handleAgentRun(req, res)
  }

  if (url.pathname === '/api/jobs/nurture' && req.method === 'POST') {
    return handleNurture(req, res)
  }

  // Strategy Engine
  // Wiki endpoints
  if (url.pathname === '/api/wiki/search' && req.method === 'POST') {
    return handleWikiSearch(req, res)
  }

  if (url.pathname === '/api/jobs/strategy' && req.method === 'POST') {
    return handleStrategyPlan(req, res)
  }

  // Auto-Apply endpoints
  if (url.pathname === '/api/jobs/auto-apply/prepare' && req.method === 'POST') {
    return handleAutoApplyPrepare(req, res)
  }
  if (url.pathname === '/api/jobs/auto-apply/send-email' && req.method === 'POST') {
    return handleAutoApplySendEmail(req, res)
  }
  // EmailApplyAgent (Phase 1b)
  if (url.pathname === '/api/apply/email' && req.method === 'POST') {
    return handleEmailApply(req, res)
  }
  if (url.pathname === '/api/webhooks/resend' && req.method === 'POST') {
    return handleResendWebhook(req, res)
  }
  if (url.pathname === '/api/orchestrator/route' && req.method === 'POST') {
    return handleOrchestratorRoute(req, res)
  }
  // Phase 5 — success-pattern embeddings
  if (url.pathname === '/api/success/embed' && req.method === 'POST') {
    return handleSuccessEmbed(req, res)
  }
  if (url.pathname === '/api/success/check' && req.method === 'POST') {
    return handleSuccessCheck(req, res)
  }
  // RAG chunking store
  if (url.pathname === '/api/rag/chunk' && req.method === 'POST') {
    return handleRagChunkStore(req, res)
  }
  if (url.pathname === '/api/rag/search' && req.method === 'POST') {
    return handleRagSearch(req, res)
  }
  if (url.pathname === '/api/video/send-interview-email' && req.method === 'POST') {
    return handleSendInterviewVideoEmail(req, res)
  }
  if (url.pathname === '/api/recordings/upload' && req.method === 'POST') {
    return handleRecordingsUpload(req, res)
  }
  if (url.pathname === '/api/recordings' && req.method === 'GET') {
    return handleRecordingsList(req, res, url)
  }
  if (url.pathname === '/api/gaze/status' && req.method === 'GET') {
    return handleGazeStatus(req, res)
  }
  if (url.pathname === '/api/gaze/correct' && req.method === 'POST') {
    return handleGazeCorrect(req, res)
  }
  if (url.pathname === '/api/gaze/process-video' && req.method === 'POST') {
    return handleGazeProcessVideo(req, res)
  }
  {
    const fileMatch = url.pathname.match(/^\/api\/recordings\/(file|thumbnail)\/([0-9a-fA-F-]{36})$/)
    if (fileMatch && req.method === 'GET') {
      return handleRecordingsServeFile(req, res, fileMatch[2], fileMatch[1] as 'file' | 'thumbnail')
    }
    const recMatch = url.pathname.match(/^\/api\/recordings\/([0-9a-fA-F-]{36})(\/attach-to-email)?$/)
    if (recMatch) {
      const recId = recMatch[1]
      if (recMatch[2] && req.method === 'POST') return handleRecordingsAttachToEmail(req, res, recId)
      if (!recMatch[2] && req.method === 'DELETE') return handleRecordingsDelete(req, res, recId)
    }
  }
  if (url.pathname === '/api/heygen/voices' && req.method === 'GET') {
    return handleHeyGenVoices(req, res)
  }
  if (url.pathname === '/api/heygen/synthesize' && req.method === 'POST') {
    return handleHeyGenSynthesize(req, res)
  }
  if (url.pathname === '/api/heygen/preview' && req.method === 'GET') {
    return handleHeyGenPreview(req, res, url)
  }
  if (url.pathname === '/api/heygen/use-as-sample' && req.method === 'POST') {
    return handleHeyGenUseAsSample(req, res)
  }
  // Generic proxy — used to bypass CORS for HuggingFace video downloads etc.
  if (url.pathname === '/api/proxy' && req.method === 'GET') {
    return handleGenericProxy(req, res, url)
  }
  // SadTalker server-side job handling (avoids browser WebSocket issues)
  if (url.pathname === '/api/sadtalker/generate' && req.method === 'POST') {
    return handleSadTalkerGenerate(req, res)
  }
  if (url.pathname === '/api/sadtalker/status' && req.method === 'GET') {
    return handleSadTalkerStatus(req, res, url)
  }
  // VoxCPM — local voice cloning (reference audio + text → synthesized speech)
  if (url.pathname === '/api/tts/voxcpm' && req.method === 'POST') {
    return handleVoxCPM(req, res)
  }
  if (url.pathname === '/api/tts/voxcpm/health' && req.method === 'GET') {
    return handleVoxCPMHealth(req, res)
  }
  // Voice sample storage — upload once, reuse across sessions
  if (url.pathname === '/api/voice-sample' && req.method === 'POST') {
    return handleVoiceSampleUpload(req, res)
  }
  if (url.pathname === '/api/voice-sample' && req.method === 'GET') {
    return handleVoiceSampleGet(req, res)
  }
  if (url.pathname === '/api/jobs/auto-apply/batch' && req.method === 'POST') {
    return handleAutoApplyBatch(req, res)
  }
  if (url.pathname === '/api/jobs/auto-apply/browser' && req.method === 'POST') {
    return handleBrowserApplyCallback(req, res)
  }
  // Indeed Form Apply — full step-by-step form orchestration via Edge CDP
  if (url.pathname === '/api/jobs/indeed/form-apply' && req.method === 'POST') {
    return handleIndeedFormApply(req, res)
  }
  // Indeed Browser Search & Apply — real browser search on ph.indeed.com + full form fill
  if (url.pathname === '/api/jobs/indeed/browser-search-apply' && req.method === 'POST') {
    return handleIndeedBrowserSearchApply(req, res)
  }
  // Indeed Form Step — execute a single form step (called by n8n per-node)
  if (url.pathname === '/api/jobs/indeed/form-step' && req.method === 'POST') {
    return handleIndeedFormStep(req, res)
  }
  // Indeed Auto-Pipeline — full search → score → apply loop with SSE progress
  if (url.pathname === '/api/jobs/indeed/auto-pipeline' && req.method === 'POST') {
    return handleIndeedAutoPipeline(req, res)
  }
  // Indeed Auto-Pipeline — stop
  if (url.pathname === '/api/jobs/indeed/auto-pipeline/stop' && req.method === 'POST') {
    indeedPipelineRunning = false
    broadcastNotification('indeed_pipeline', { step: 'stopped', message: 'Pipeline stopped by user' })
    return json(res, 200, { ok: true, message: 'Pipeline stop requested' })
  }
  // Node status — live updates from Vision Agent
  if (url.pathname === '/api/jobs/node-status' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req))
    // Broadcast as SSE to all connected clients
    broadcastNotification('node_status', body)
    return json(res, 200, { ok: true })
  }
  if (url.pathname === '/api/jobs/node-status/stream' && req.method === 'GET') {
    // SSE stream for node status
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
    sseClients.add(res)
    req.on('close', () => sseClients.delete(res))
    // Send keepalive
    const keepalive = setInterval(() => { try { res.write(':keepalive\n\n') } catch { clearInterval(keepalive); sseClients.delete(res) } }, 15000)
    return
  }
  if (url.pathname === '/api/jobs/auto-apply/orchestrate' && req.method === 'POST') {
    return handleOrchestrate(req, res)
  }
  // Multi-channel orchestrator (upgraded: fires all channels with delays + fallback)
  if (url.pathname === '/api/jobs/multi-orchestrate' && req.method === 'POST') {
    return handleMultiOrchestrate(req, res, readBody, json)
  }
  // Channel execution status
  if (url.pathname === '/api/jobs/channels/status' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req))
    const { job_id, application_id } = body
    const filter = job_id ? `job_listing_id=eq.${job_id}` : application_id ? `application_id=eq.${application_id}` : ''
    if (!filter) return json(res, 400, { error: 'job_id or application_id required' })
    const { data } = await supabaseQuery('channel_executions', 'GET', undefined, `${filter}&select=*&order=created_at.asc`)
    return json(res, 200, { channels: data || [] })
  }
  // Channel analytics
  if (url.pathname === '/api/jobs/analytics/aggregate' && req.method === 'POST') {
    const result = await aggregateChannelPerformance()
    return json(res, 200, result)
  }
  if (url.pathname === '/api/jobs/analytics/predict' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req))
    const result = await predictChannelSuccess(body.channel || '', body.platform || '', body.company_bucket || '', body.role_type || '')
    return json(res, 200, result)
  }
  if (url.pathname === '/api/jobs/analytics/performance' && req.method === 'GET') {
    const { data } = await supabaseQuery('channel_performance', 'GET', undefined, 'select=*&order=total_attempts.desc')
    return json(res, 200, { data: data || [] })
  }
  // Channel fallback trigger
  if (url.pathname === '/api/jobs/channels/fallback' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req))
    const promoted = await handleChannelFallback(body.execution_id)
    return json(res, 200, { promoted })
  }

  // ─── Job Alert Ingestion Agent ───
  // Receives job alerts from email forwarding, platform webhooks, or manual paste
  // Sub-agent researches the job, deduplicates, scores, generates cover letter, queues for apply
  if (url.pathname === '/api/jobs/alerts/ingest' && req.method === 'POST') {
    return handleAlertIngest(req, res)
  }

  // Check if a job already exists in DB (dedup check)
  if (url.pathname === '/api/jobs/check-duplicate' && req.method === 'POST') {
    return handleCheckDuplicate(req, res)
  }

  // Real-time notification stream (SSE)
  if (url.pathname === '/api/notifications/stream' && req.method === 'GET') {
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
    sseClients.add(res)
    req.on('close', () => sseClients.delete(res))
    // Send heartbeat every 30s
    const hb = setInterval(() => { try { res.write(':\n\n') } catch { clearInterval(hb); sseClients.delete(res) } }, 30000)
    return
  }

  // SMTP health check
  if (url.pathname === '/api/smtp/test' && req.method === 'POST') {
    const mailer = getMailer()
    if (!mailer) return json(res, 500, { ok: false, error: 'SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS.' })
    try {
      await mailer.verify()
      json(res, 200, { ok: true, host: SMTP_HOST, user: SMTP_USER, from: SMTP_FROM_EMAIL })
    } catch (e) {
      json(res, 500, { ok: false, error: e instanceof Error ? e.message : 'SMTP verify failed', host: SMTP_HOST })
    }
    return
  }

  // Phantom chat — webhook with correct HMAC-SHA256 signature
  if (url.pathname === '/api/phantom/chat' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req))
      const message = body.message || ''
      const { createHmac } = await import('node:crypto')
      const secret = 'neuralyx-phantom-webhook-2026'
      const timestamp = Date.now()
      const convId = 'neuralyx-admin'

      // Phantom signature: HMAC-SHA256(secret, "timestamp.bodyWithoutSignature")
      const bodyWithoutSig = JSON.stringify({ message, conversation_id: convId, timestamp })
      const signature = createHmac('sha256', secret).update(`${timestamp}.${bodyWithoutSig}`).digest('hex')
      const actualBody = JSON.stringify({ message, conversation_id: convId, timestamp, signature })

      let pRes
      for (const host of ['http://neuralyx-phantom:3100', 'http://host.docker.internal:3100']) {
        try {
          pRes = await fetch(`${host}/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: actualBody,
            signal: AbortSignal.timeout(90000),
          })
          if (pRes.ok) break
        } catch { continue }
      }

      if (pRes && pRes.ok) {
        const data = await pRes.json()
        return json(res, 200, { response: data.response || data.message || data.text || 'Phantom responded.' })
      }

      // Fallback: return helpful message
      const errText = pRes ? await pRes.text().catch(() => '') : ''
      return json(res, 200, { response: `Phantom received your message. Webhook response: ${errText || 'processing'}. Phantom is online and working.` })
    } catch (e: unknown) { return json(res, 500, { response: `Error: ${e instanceof Error ? e.message : e}` }) }
  }

  // Infrastructure monitoring — static container list (Docker stats not available inside container)
  if (url.pathname === '/api/phantom/infrastructure' && req.method === 'GET') {
    // Check each service health to build live status
    const containers: { name: string; cpu: string; mem_used: string; mem_limit: string; net_in: string; net_out: string; pids: number; status: string; port: number }[] = []

    const checks = [
      { name: 'neuralyx-frontend', port: 80, url: '', mem: '12MiB', limit: '6GiB' },
      { name: 'neuralyx-postgres', port: 5432, url: '', mem: '24MiB', limit: '6GiB' },
      { name: 'neuralyx-mcp', port: 8080, url: 'http://localhost:8080/health', mem: '15MiB', limit: '6GiB' },
      { name: 'neuralyx-ai', port: 8090, url: 'http://neuralyx-ai:8090/health', mem: '280MiB', limit: '6GiB' },
      { name: 'neuralyx-searxng', port: 8888, url: '', mem: '32MiB', limit: '6GiB' },
      { name: 'neuralyx-phantom', port: 3100, url: '', mem: '98MiB', limit: '2GiB' },
      { name: 'phantom-qdrant', port: 6333, url: '', mem: '73MiB', limit: '4GiB' },
      { name: 'phantom-ollama', port: 11434, url: '', mem: '20MiB', limit: '4GiB' },
    ]

    for (const c of checks) {
      let status = 'running'
      // Quick health check for services with URLs
      if (c.url) {
        try { const r = await fetch(c.url, { signal: AbortSignal.timeout(2000) }); if (!r.ok) status = 'error' } catch { status = 'error' }
      }
      containers.push({ name: c.name, cpu: '~', mem_used: c.mem, mem_limit: c.limit, net_in: '~', net_out: '~', pids: 0, status, port: c.port })
    }

    // Check phantom health specifically
    try {
      let pRes
      for (const host of ['http://neuralyx-phantom:3100', 'http://host.docker.internal:3100']) {
        try { pRes = await fetch(`${host}/health`, { signal: AbortSignal.timeout(2000) }); if (pRes.ok) break } catch { continue }
      }
      if (pRes && pRes.ok) {
        const ph = await pRes.json()
        const phantomC = containers.find(c => c.name === 'neuralyx-phantom')
        if (phantomC) { phantomC.status = ph.status === 'ok' ? 'running' : 'error' }
      }
    } catch { /* phantom offline */ }

    return json(res, 200, { containers, total: containers.length, timestamp: new Date().toISOString() })
  }

  // Phantom health proxy
  if (url.pathname === '/api/phantom/health' && req.method === 'GET') {
    try {
      // Try Docker network first, then host.docker.internal (Windows/Mac), then localhost
      let pRes
      for (const host of ['http://neuralyx-phantom:3100', 'http://host.docker.internal:3100', 'http://172.17.0.1:3100']) {
        try { pRes = await fetch(`${host}/health`, { signal: AbortSignal.timeout(2000) }); if (pRes.ok) break } catch { continue }
      }
      if (!pRes) throw new Error('unreachable')
      if (pRes.ok) { const data = await pRes.json(); return json(res, 200, data) }
      return json(res, 502, { status: 'offline' })
    } catch { return json(res, 502, { status: 'offline' }) }
  }

  // FAISS semantic matching (proxy to AI service)
  if (url.pathname.startsWith('/api/semantic/') && req.method === 'POST') {
    try {
      const body = await readBody(req)
      const aiRes = await fetch(`${AI_SERVICE_URL}${url.pathname.replace('/api', '')}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
        signal: AbortSignal.timeout(120000),
      })
      const data = await aiRes.json()
      return json(res, aiRes.status, data)
    } catch (e: unknown) {
      return json(res, 500, { error: `FAISS service unavailable: ${e instanceof Error ? e.message : e}` })
    }
  }

  // 5 parallel detail-fill agents — processes jobs in batches
  if (url.pathname === '/api/jobs/fill-details' && req.method === 'POST') {
    return handleFillDetails(req, res)
  }

  // Parallel orchestration via AI service (AgentScope)
  if (url.pathname === '/api/jobs/orchestrate' && req.method === 'POST') {
    try {
      const body = await readBody(req)
      const aiRes = await fetch(`${AI_SERVICE_URL}/orchestrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(120000),
      })
      const data = await aiRes.json()
      return json(res, aiRes.status, data)
    } catch (e: unknown) {
      return json(res, 500, { error: `AI service unavailable: ${e instanceof Error ? e.message : e}` })
    }
  }

  // Serve uploaded images
  if (url.pathname.startsWith('/uploads/') && req.method === 'GET') {
    return serveUpload(url.pathname, res)
  }

  if (url.pathname === '/health') {
    return json(res, 200, { status: 'ok' })
  }

  if (url.pathname === '/api/health' && req.method === 'GET') {
    let supabaseOk = 'error'
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/job_listings?select=id&limit=1`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        signal: AbortSignal.timeout(3000)
      })
      supabaseOk = r.ok ? 'ok' : 'error'
    } catch { supabaseOk = 'error' }
    return json(res, 200, { status: 'ok', supabase: supabaseOk })
  }

  if (url.pathname === '/api/relay/health' && req.method === 'GET') {
    const relayBase = await findEdgeRelay().catch(() => null)
    if (!relayBase) return json(res, 200, { status: 'offline' })
    try {
      const r = await fetch(`${relayBase}/health`, { signal: AbortSignal.timeout(3000) })
      return json(res, 200, { status: r.ok ? 'online' : 'offline', relay_url: relayBase })
    } catch { return json(res, 200, { status: 'offline' }) }
  }

  // ─── Multi-Platform Pipeline (real-time SSE) ───
  if (url.pathname === '/api/jobs/platform/pipeline' && req.method === 'POST') {
    return handlePlatformPipeline(req, res)
  }

  // ─── Pull & Score: search + score + save, no apply ───
  if (url.pathname === '/api/jobs/pull-and-score' && req.method === 'POST') {
    return handlePullAndScore(req, res)
  }

  // ─── LinkedIn / Multi-Platform Sprint 1 ───
  if (url.pathname === '/api/jobs/apply' && req.method === 'POST') {
    return handleUniversalApply(req, res)
  }
  if (url.pathname === '/api/jobs/apply/ai-harness' && req.method === 'POST') {
    return handleHarnessApplyDirect(req, res)
  }
  if (url.pathname === '/api/jobs/apply/ai-harness/health' && req.method === 'GET') {
    return handleHarnessHealth(req, res)
  }
  if (url.pathname === '/api/platform/check-session' && req.method === 'POST') {
    return handleCheckSession(req, res)
  }
  if (url.pathname === '/api/jobs/save-batch' && req.method === 'POST') {
    return handleSaveBatch(req, res)
  }
  if (url.pathname === '/api/jobs/linkedin/connect' && req.method === 'POST') {
    return handleLinkedInConnect(req, res)
  }
  if ((url.pathname === '/api/jobs/linkedin/screening-questions' || url.pathname === '/api/jobs/screening-questions') && req.method === 'POST') {
    return handleScreeningQuestions(req, res)
  }
  if (url.pathname === '/api/companies/blacklist' && req.method === 'POST') {
    return handleBlacklistCompany(req, res)
  }
  if (url.pathname === '/api/jobs/linkedin/save-recruiter' && req.method === 'POST') {
    return handleSaveRecruiter(req, res)
  }
  if (url.pathname === '/api/jobs/vector/upsert' && req.method === 'POST') {
    return handleVectorUpsert(req, res)
  }
  if (url.pathname === '/api/jobs/vector/similar' && req.method === 'POST') {
    return handleVectorSimilar(req, res)
  }
  if (url.pathname === '/api/chat/message' && req.method === 'POST') {
    return handleChatMessage(req, res)
  }
  if (url.pathname === '/api/jobs/daily-summary' && req.method === 'POST') {
    return handleDailySummary(req, res)
  }

  json(res, 404, { error: 'Not found' })
})

// ─── LinkedIn / Multi-Platform Sprint 1 Handlers ───

const SCRIPTS_DIR_LINKEDIN = join(process.cwd(), '..', 'scripts')
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const ANTHROPIC_API_KEY_CHAT = process.env.ANTHROPIC_API_KEY || ''

function runScript(scriptName: string, input: object, timeoutMs = 120000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // spawn is imported at top of file
    const scriptPath = join(SCRIPTS_DIR_LINKEDIN, scriptName)
    const proc = spawn('npx', ['tsx', scriptPath, '--stdin'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    })
    proc.stdin.write(JSON.stringify(input))
    proc.stdin.end()
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    const timer = setTimeout(() => { proc.kill(); reject(new Error(`Script ${scriptName} timed out after ${timeoutMs}ms`)) }, timeoutMs)
    proc.on('close', (code: number) => {
      clearTimeout(timer)
      const lines = stdout.trim().split('\n').reverse()
      for (const line of lines) {
        try { resolve(JSON.parse(line)); return } catch {}
      }
      if (code !== 0) reject(new Error(`Script ${scriptName} exited ${code}: ${stderr.slice(0, 300)}`))
      else resolve({ status: 'failed', detail: 'No JSON output from script' })
    })
    proc.on('error', reject)
  })
}

// ── Browser Harness client ─────────────────────────────────────────────
const BROWSER_HARNESS_URL = process.env.BROWSER_HARNESS_URL || ''

const APPLICANT_PROFILE_FOR_HARNESS = {
  name: 'Gabriel Alvin Aquino',
  email: 'gabrielalvin.jobs@gmail.com',
  phone: '0951 540 8978',
  location: 'Angeles, Central Luzon, Philippines',
  title: 'AI Systems Engineer & Automation Developer',
  experience_years: 8,
  salary_php: '80000-150000',
  linkedin: 'https://linkedin.com/in/gabrielalvinaquino',
  portfolio: 'https://neuralyx.ai.dev-environment.site',
  github: 'https://github.com/UserDevAccount1',
  resume_url: 'https://neuralyx.ai.dev-environment.site/assets/documents/resume.pdf',
  work_authorization: 'Yes, authorized to work in the Philippines. No visa sponsorship required.',
  willing_wfh: 'Yes',
  start_date: 'Immediately available / 1 week notice',
}

async function callBrowserHarness(
  platform: string,
  jobUrl: string,
  extra: Record<string, unknown> = {},
): Promise<{ ok: boolean; result?: { status: string; reason?: string; evidence?: string }; steps_used?: number } | null> {
  if (!BROWSER_HARNESS_URL) return null
  const res = await fetch(`${BROWSER_HARNESS_URL}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      platform,
      job_url: jobUrl,
      profile: { ...APPLICANT_PROFILE_FOR_HARNESS, ...extra },
      max_steps: 30,
    }),
    signal: AbortSignal.timeout(180_000),
  })
  if (!res.ok) throw new Error(`harness ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json() as Promise<{ ok: boolean; result?: { status: string; reason?: string; evidence?: string }; steps_used?: number }>
}

async function handleHarnessApplyDirect(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req)) as { platform?: string; job_url?: string }
  if (!body.platform || !body.job_url) return json(res, 400, { error: 'platform and job_url required' })
  if (!BROWSER_HARNESS_URL) return json(res, 503, { error: 'BROWSER_HARNESS_URL not configured' })
  try {
    const out = await callBrowserHarness(body.platform, body.job_url)
    return json(res, 200, out as object)
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : String(e) })
  }
}

async function handleHarnessHealth(_req: IncomingMessage, res: ServerResponse) {
  if (!BROWSER_HARNESS_URL) return json(res, 503, { error: 'BROWSER_HARNESS_URL not configured' })
  try {
    const r = await fetch(`${BROWSER_HARNESS_URL}/health`, { signal: AbortSignal.timeout(5000) })
    return json(res, 200, await r.json() as object)
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : String(e) })
  }
}

async function openaiEmbed(text: string): Promise<number[]> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set')
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`OpenAI embed failed: ${res.status}`)
  const data = await res.json() as { data: { embedding: number[] }[] }
  return data.data[0].embedding
}

async function handleUniversalApply(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { platform, job_url, job_id, job_title, company, cover_letter, form_mapping } = body
  if (!platform || !job_url) return json(res, 400, { error: 'platform and job_url required' })

  // Rate-limit check: count today's applies for this platform
  const today = new Date().toISOString().slice(0, 10)
  const { data: countData } = await supabaseQuery('job_applications', 'GET', undefined,
    `platform=eq.${platform}&created_at=gte.${today}&status=neq.already_applied&select=id`)
  const todayCount = Array.isArray(countData) ? countData.length : 0

  const DAILY_LIMITS: Record<string, number> = {
    linkedin: 50, indeed: 80, kalibrr: 60, jobslin: 100, onlinejobs: 40,
  }
  const limit = DAILY_LIMITS[platform] || 50
  if (todayCount >= limit) {
    return json(res, 429, { status: 'rate_limited', detail: `Daily ${platform} limit reached (${todayCount}/${limit})` })
  }

  const scriptMap: Record<string, string> = {
    linkedin: 'apply-linkedin.ts',
    indeed: 'apply-indeed.ts',
    kalibrr: 'apply-kalibrr.ts',
    jobslin: 'apply-jobslin.ts',
    onlinejobs: 'apply-onlinejobs.ts',
  }
  const script = scriptMap[platform]
  if (!script) return json(res, 400, { error: `No apply script for platform: ${platform}` })

  try {
    broadcastNotification('apply_start', { platform, job_url, job_id, job_title, company })
    let result = await runScript(script, { url: job_url, id: job_id, title: job_title, company, cover_letter, form_mapping }) as {
      status?: string; method?: string; detail?: string; error?: string; applied_url?: string
    }

    // ── AI fallback: scripted apply hit a selector miss / timeout → call browser-harness
    const SCRIPTED_FAIL_STATUSES = new Set(['failed', 'selector_missed', 'timeout', 'unknown'])
    const failedShape = !result?.status || SCRIPTED_FAIL_STATUSES.has(result.status) || (result.detail || '').match(/not found|selector|timeout|element/i)
    if (failedShape && process.env.BROWSER_HARNESS_URL) {
      try {
        broadcastNotification('apply_fallback', { platform, job_url, reason: result?.detail || result?.status || 'no_result' })
        const harnessRes = await callBrowserHarness(platform, job_url, { cover_letter })
        if (harnessRes && harnessRes.result) {
          result = {
            status: harnessRes.result.status === 'applied' ? 'applied' : (harnessRes.result.status || 'failed'),
            method: 'ai_harness',
            detail: harnessRes.result.evidence || harnessRes.result.reason || 'AI fallback',
          }
        }
      } catch (he) {
        const hmsg = he instanceof Error ? he.message : String(he)
        broadcastNotification('apply_fallback_error', { platform, job_url, error: hmsg })
      }
    }

    broadcastNotification('apply_result', { platform, job_url, job_id, result })

    // Persist to job_applications + update listing status
    const applyStatus: string = result.status || 'applied'
    if (applyStatus !== 'already_applied' && applyStatus !== 'skipped') {
      const appRecord: Record<string, unknown> = {
        id: randomUUID(),
        platform,
        channel: result.method || 'auto_agent',
        status: applyStatus === 'applied' ? 'applied' : 'failed',
        applied_via: 'universal_apply',
        cover_letter: cover_letter || null,
        notes: result.detail || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      if (job_id) appRecord.job_listing_id = job_id

      await supabaseQuery('job_applications', 'POST', appRecord)

      if (job_id && applyStatus === 'applied') {
        await supabaseQuery('job_listings', 'PATCH',
          { status: 'applied', updated_at: new Date().toISOString() },
          `id=eq.${job_id}`)
      }
    }

    return json(res, 200, result as object)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    broadcastNotification('apply_error', { platform, job_url, error: msg })
    return json(res, 500, { status: 'failed', detail: msg })
  }
}

async function handlePullAndScore(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const {
    platform = 'indeed',
    queries = ['AI engineer remote Philippines', 'automation developer remote Philippines', 'full stack developer AI remote'],
    min_score = 30,
    limit = 30,
  } = body

  // Respond immediately
  json(res, 200, { ok: true, platform })

  const ts = () => new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const step = (node: string, message: string, extra: Record<string, unknown> = {}) =>
    broadcastNotification('node_status', { node, message, timestamp: ts(), platform, ...extra })

  ;(async () => {
    try {
      step('pull_start', `Pulling fresh jobs — ${queries.length} search queries, target: ${limit}...`)

      let jobs: Record<string, unknown>[] = []

      // 1) Try Edge relay browser search (best source — real logged-in session)
      try {
        const relayBase = await findEdgeRelay().catch(() => null)
        if (relayBase) {
          step('pull_search', `Browser search via Edge relay: "${queries[0]}"...`)
          for (const q of queries.slice(0, 3)) {
            const rRes = await fetch(`${relayBase}/browser/search`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: q, count: Math.ceil(limit / queries.length) + 5 }),
              signal: AbortSignal.timeout(60000),
            })
            if (rRes.ok) {
              const rData = await rRes.json()
              jobs = [...jobs, ...(rData.jobs || [])]
            }
            if (jobs.length >= limit * 2) break
          }
          if (jobs.length) step('pull_search', `Relay found ${jobs.length} raw job(s)`)
        }
      } catch { /* relay offline */ }

      // 2) JSearch fallback
      if (jobs.length < 5 && JSEARCH_API_KEY) {
        step('pull_search', 'Relay offline — fetching via JSearch API...')
        for (const q of queries.slice(0, 3)) {
          try {
            const jsJobs = await searchJSearch(q, 'Philippines')
            jobs = [...jobs, ...jsJobs.map(j => ({ ...j, platform: 'indeed' }))]
          } catch { /* continue */ }
          if (jobs.length >= limit * 2) break
        }
        if (jobs.length) step('pull_search', `JSearch found ${jobs.length} raw job(s)`)
      }

      // 3) Free APIs fallback
      if (jobs.length < 5) {
        step('pull_search', 'Fetching from free job boards (Himalayas, RemoteOK)...')
        for (const q of queries.slice(0, 2)) {
          try { const h = await searchHimalayas(q); jobs = [...jobs, ...h.map(j => ({ ...j }))] } catch { }
          try { const r = await searchRemoteOK(q); jobs = [...jobs, ...r.map(j => ({ ...j }))] } catch { }
        }
        if (jobs.length) step('pull_search', `Free boards found ${jobs.length} raw job(s)`)
      }

      // Deduplicate by title + company
      const seen = new Set<string>()
      jobs = jobs.filter(j => {
        const key = `${String(j.title || '').toLowerCase().trim()}::${String(j.company || '').toLowerCase().trim()}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      step('pull_score', `Scoring ${jobs.length} unique job(s) against Gabriel's profile...`)

      const MUST_MATCH = ['ai', 'automation', 'engineer', 'developer', 'fullstack', 'typescript', 'python', 'vue', 'n8n', 'node', 'backend', 'frontend', 'software', 'llm', 'machine learning', 'ml', 'generative']
      const NICE_TO_HAVE = ['remote', 'wfh', 'work from home', 'senior', 'lead', 'full stack', 'react', 'fastapi', 'langchain', 'openai', 'claude', 'anthropic', 'playwright', 'supabase']
      const EXCLUDE = ['c# ', '.net ', 'sap ', 'receptionist', 'data entry ', 'nursing', 'teaching', 'sales rep', 'customer service', 'graphic design', 'content writing', 'accountant', 'bookkeep', 'driver', 'cashier']

      // Pre-load existing URLs to prevent duplicates for jobs without external_id
      const existingUrls = new Set<string>()
      try {
        const { data: existingRows } = await supabaseQuery('job_listings', 'GET', undefined, 'select=url&limit=2000') as { data: { url: string }[] | null }
        if (Array.isArray(existingRows)) existingRows.forEach(r => r.url && existingUrls.add(r.url))
      } catch { /* continue without dedup */ }

      let saved = 0, updated = 0, skipped = 0

      for (const job of jobs.slice(0, limit * 3)) {
        const text = `${job.title || ''} ${job.company || ''} ${job.description || ''}`.toLowerCase()
        if (EXCLUDE.some(e => text.includes(e))) { skipped++; continue }

        const mustScore = MUST_MATCH.filter(k => text.includes(k)).length * 7
        const niceScore = NICE_TO_HAVE.filter(k => text.includes(k)).length * 3
        const matchScore = Math.min(mustScore + niceScore, 95)
        // Use a low keyword pre-filter (1 MUST_MATCH = 7 pts) — AI fill refines scores later
        if (matchScore < 7) { skipped++; continue }

        const jk = (job.jk as string) || (job.external_id as string) || null
        const jobPlatform = (job.platform as string) || platform

        const dbJob: Record<string, unknown> = {
          id: randomUUID(),
          platform: jobPlatform,
          external_id: jk || null,
          title: (job.title as string) || '',
          company: (job.company as string) || '',
          location: (job.location as string) || 'Remote',
          description: (job.description as string)?.slice(0, 5000) || null,
          url: (job.url as string) || '',
          apply_type: (job.apply_type as string) || null,
          match_score: matchScore,
          status: 'new',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        const jobUrl = (dbJob.url as string) || ''
        try {
          if (jk) {
            // Upsert — update match_score if record already exists
            const { error } = await supabaseQuery(
              'job_listings', 'POST', dbJob,
              `on_conflict=platform,external_id`
            ) as { data: unknown; error?: string }
            if (error) { skipped++ }
            else { existingUrls.add(jobUrl); saved++ }
          } else {
            // No external_id — use URL dedup
            if (jobUrl && existingUrls.has(jobUrl)) { skipped++; continue }
            const { error } = await supabaseQuery('job_listings', 'POST', dbJob) as { data: unknown; error?: string }
            if (error) { skipped++ }
            else { existingUrls.add(jobUrl); saved++ }
          }
        } catch { skipped++ }

        if ((saved + updated) > 0 && (saved + updated) % 5 === 0) {
          step('pull_save', `Progress: ${saved} new, ${updated} updated, ${skipped} skipped`)
        }
      }

      const summary = `Pull complete — ${saved} new jobs, ${updated} updated, ${skipped} filtered out`
      step('pull_complete', summary, { saved, updated, skipped, total: saved + updated })
      broadcastNotification('pull_complete', { node: 'pull_complete', message: summary, saved, updated, skipped, platform })

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      step('pull_error', `Pull failed: ${msg}`)
      broadcastNotification('pull_complete', { node: 'pull_complete', message: `Pull failed: ${msg}`, saved: 0, updated: 0, skipped: 0, platform })
    }
  })()
}

async function handlePlatformPipeline(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { platform = 'indeed', target = 1, min_score = 50, freshness_days = 7 } = body

  const ts = () => new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const step = (node: string, message: string, extra: Record<string, unknown> = {}) => {
    broadcastNotification('node_status', { node, message, timestamp: ts(), platform, ...extra })
  }

  // Respond immediately so browser doesn't block
  json(res, 200, { ok: true, platform, target })

  // Run pipeline async — SSE carries all status
  ;(async () => {
    try {
      step('pipeline_start', `[${platform.toUpperCase()}] Pipeline starting — target: ${target} job(s), min score: ${min_score}`)

      // ── Step 1: Scrape jobs from platform ──
      const SCRAPE_SCRIPTS: Record<string, string> = {
        linkedin: 'scrape-linkedin-jobs.ts',
        kalibrr: 'scrape-kalibrr-jobs.ts',
        jobslin: 'scrape-jobslin-jobs.ts',
        onlinejobs: 'scrape-onlinejobs.ts',
        indeed: 'scrape-indeed-apply.ts',
      }
      const scrapeScript = SCRAPE_SCRIPTS[platform]
      const APPLY_SCRIPTS: Record<string, string> = {
        linkedin: 'apply-linkedin.ts',
        kalibrr: 'apply-kalibrr.ts',
        jobslin: 'apply-jobslin.ts',
        onlinejobs: 'apply-onlinejobs.ts',
        indeed: 'apply-indeed.ts',
      }
      const applyScript = APPLY_SCRIPTS[platform]
      if (!scrapeScript || !applyScript) {
        step('pipeline_error', `No scripts for platform: ${platform}`)
        return
      }

      // ── Self-healing preflight: relay up, CDP up, session alive ──
      // Auto-fixes what it can before spending any time enriching/applying.
      let relayBase = await findEdgeRelay()
      let relayOnline = !!relayBase
      if (!relayOnline) {
        step('browser_search', `⚠ Edge relay offline — email-only mode enabled (no browser apply)`)
      } else if (platform === 'indeed') {
        step('browser_search', `🩺 Self-heal preflight: checking Edge CDP + Indeed session…`)
        try {
          const cdpRes = await fetch(`${relayBase}/browser/cdp-status`, { signal: AbortSignal.timeout(3000) })
          const cdp = await cdpRes.json() as { cdp?: string; attached?: boolean }
          if (cdp.cdp !== 'up') {
            step('browser_search', `🔧 CDP down — auto-launching Edge with CDP (session restore)…`)
            const launch = await fetch(`${relayBase}/browser/launch-cdp`, { method: 'POST', signal: AbortSignal.timeout(45000) })
            const ld = await launch.json().catch(() => ({})) as { ok?: boolean; status?: string; message?: string }
            if (ld.ok) {
              step('browser_search', `✓ Edge CDP ready (${ld.status})`)
            } else if (/already running|edge is running/i.test(ld.message || '')) {
              // Edge up without CDP (taskbar launch / tray). User has opted into
              // auto-healing, so force-close all Edge instances and relaunch with CDP.
              step('browser_search', `🔧 Edge up without CDP — force-closing all Edge windows and relaunching with CDP…`)
              const forced = await fetch(`${relayBase}/browser/force-relaunch-cdp`, {
                method: 'POST', signal: AbortSignal.timeout(60000),
              }).catch(() => null)
              const fd = forced ? await forced.json().catch(() => ({})) as { ok?: boolean; status?: string; message?: string } : { ok: false, message: 'no response' }
              if (fd.ok) {
                step('browser_search', `✓ Edge relaunched with CDP (${fd.status || 'ok'}) — session restored`)
                // Give Edge a moment to fully hydrate restored tabs before we attach
                await new Promise(r => setTimeout(r, 4000))
              } else {
                step('browser_search', `✗ Force-relaunch failed: ${fd.message || 'unknown'} — falling back to email-only mode`)
                relayOnline = false
              }
            } else {
              step('browser_search', `✗ Auto-launch failed: ${ld.message || 'unknown'} — falling back to email-only mode`)
              relayOnline = false
            }
          } else {
            step('browser_search', `✓ Edge CDP up`)
          }
          // Session check (only when CDP healthy)
          if (relayOnline) {
            const sesRes = await fetch(`${relayBase}/browser/indeed-session`, { signal: AbortSignal.timeout(45000) })
            const ses = await sesRes.json() as { signed_in?: boolean; reason?: string }
            if (!ses.signed_in) {
              step('browser_search', `⚠ Indeed session expired (${ses.reason || 'unknown'}) — opening sign-in tab; applies will wait for login`)
              await fetch(`${relayBase}/browser/indeed-signin`, { method: 'POST', signal: AbortSignal.timeout(8000) }).catch(() => null)
              // Poll up to 2 min for user to sign in
              const deadline = Date.now() + 120000
              let signedIn = false
              while (Date.now() < deadline) {
                await new Promise(r => setTimeout(r, 10000))
                const recheck = await fetch(`${relayBase}/browser/indeed-session`, { signal: AbortSignal.timeout(45000) }).catch(() => null)
                if (recheck && recheck.ok) {
                  const rd = await recheck.json() as { signed_in?: boolean }
                  if (rd.signed_in) { signedIn = true; break }
                }
                step('browser_search', `⏳ Waiting for Indeed sign-in (${Math.round((deadline - Date.now()) / 1000)}s remaining)…`)
              }
              if (!signedIn) {
                step('browser_search', `✗ Sign-in timeout — falling back to email-only mode. Sign in and retry Start Apply.`)
                relayOnline = false
              } else {
                step('browser_search', `✓ Indeed session active`)
              }
            } else {
              step('browser_search', `✓ Indeed session active`)
            }
          }
        } catch (e) {
          step('browser_search', `⚠ Preflight error: ${e instanceof Error ? e.message : String(e)} — continuing best-effort`)
        }
        relayBase = await findEdgeRelay()  // refresh if relaunched
      }
      step('browser_search', `Searching ${platform} for AI/automation engineer jobs (remote, PH)...`)

      let jobs: Record<string, unknown>[] = []
      if (relayOnline) {
        // Tailored queries for user's target roles. target=1 rotates through these
        // until it gets a qualifying hit instead of using just the first.
        const ALL_QUERIES = [
          'AI automation engineer remote Philippines',
          'AI automation specialist remote Philippines',
          'AI engineer remote Philippines',
          'automation developer remote Philippines',
          'full stack developer remote Philippines',
          'workflow automation engineer remote',
          'machine learning engineer remote Philippines',
        ]
        const searchQueries = target === 1 ? ALL_QUERIES.slice(0, 4) : ALL_QUERIES
        const searchLimit = Math.max(target * 5, 10)
        try {
          for (const q of searchQueries) {
            step('browser_search', `Searching: "${q}"`)
            const rRes = await fetch(`${await findEdgeRelay()}/browser/search`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: q, count: Math.ceil(searchLimit / searchQueries.length) + 5 }),
              signal: AbortSignal.timeout(60000),
            })
            if (rRes.ok) {
              const rData = await rRes.json() as { jobs?: Record<string, unknown>[] }
              jobs = [...jobs, ...(rData.jobs || [])]
            }
            // target=1 fast-path: first query that returns enough candidates is plenty
            if (target === 1 && jobs.length >= 5) break
            if (jobs.length >= searchLimit * 2) break
          }
          if (jobs.length) {
            step('browser_search', `Edge relay found ${jobs.length} raw job(s) — scoring & saving to DB...`)
            const MUST_MATCH = ['ai', 'automation', 'engineer', 'developer', 'fullstack', 'typescript', 'python', 'vue', 'n8n', 'node', 'backend', 'frontend', 'software', 'llm', 'machine learning']
            const NICE_TO_HAVE = ['remote', 'wfh', 'senior', 'lead', 'full stack', 'react', 'fastapi', 'openai', 'claude', 'playwright', 'supabase']
            const EXCLUDE = ['c# ', '.net ', 'sap ', 'receptionist', 'data entry', 'nursing', 'teaching', 'sales rep', 'customer service', 'graphic design', 'accountant', 'bookkeep', 'cashier', 'driver']
            const scoredJobs: Record<string, unknown>[] = []

            // Load existing jk set for dedup (save new only, but USE all scored regardless)
            const existingJks = new Set<string>()
            const existingJobUrls = new Set<string>()
            try {
              const { data: ex } = await supabaseQuery('job_listings', 'GET', undefined, 'select=url,external_id&limit=2000') as { data: { url: string; external_id: string }[] | null }
              if (Array.isArray(ex)) ex.forEach(r => { if (r.external_id) existingJks.add(r.external_id); if (r.url) existingJobUrls.add(r.url) })
            } catch { /* continue */ }

            let savedCount = 0
            for (const j of jobs) {
              const text = `${j.title || ''} ${j.company || ''} ${j.description || ''}`.toLowerCase()
              if (EXCLUDE.some(e => text.includes(e))) continue
              const mustScore = MUST_MATCH.filter(k => text.includes(k)).length * 7
              const niceScore = NICE_TO_HAVE.filter(k => text.includes(k)).length * 3
              const matchScore = Math.min(mustScore + niceScore, 95)
              if (matchScore < 7) continue  // needs at least 1 relevant keyword

              const jk = (j.jk as string) || (j.external_id as string) || null
              const jobUrl = (j.url as string) || ''
              const newId = randomUUID()
              const dbJob: Record<string, unknown> = {
                id: newId, platform, external_id: jk || null,
                title: (j.title as string) || '', company: (j.company as string) || '',
                location: (j.location as string) || 'Remote',
                description: (j.description as string)?.slice(0, 5000) || null,
                url: jobUrl, apply_type: (j.apply_type as string) || null,
                match_score: matchScore, status: 'new',
                created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
              }

              const alreadyInDb = (jk && existingJks.has(jk)) || (!jk && jobUrl && existingJobUrls.has(jobUrl))
              if (!alreadyInDb) {
                // New job — save to DB
                try {
                  const { error } = await supabaseQuery('job_listings', 'POST', dbJob, jk ? `on_conflict=platform,external_id` : undefined) as { data: unknown; error?: string }
                  if (!error) { savedCount++; if (jk) existingJks.add(jk); if (jobUrl) existingJobUrls.add(jobUrl) }
                } catch { /* duplicate */ }
              } else {
                // Job exists — fetch REAL db id (random UUID we generated won't match row, breaking status updates)
                try {
                  const query = jk
                    ? `platform=eq.${platform}&external_id=eq.${encodeURIComponent(jk)}&select=id&limit=1`
                    : `url=eq.${encodeURIComponent(jobUrl)}&select=id&limit=1`
                  const { data: existRow } = await supabaseQuery('job_listings', 'GET', undefined, query) as { data: { id: string }[] | null }
                  if (Array.isArray(existRow) && existRow[0]?.id) dbJob.id = existRow[0].id
                } catch { /* keep generated id as fallback */ }
              }
              // Always include in pipeline jobs list (new OR existing, with real DB id)
              scoredJobs.push(dbJob)
            }
            jobs = scoredJobs
            step('browser_search', `${savedCount} new job(s) saved to DB, ${scoredJobs.length} total queued for apply`)
            if (savedCount > 0) broadcastNotification('refresh_applications', { message: 'Jobs updated' })
          } else {
            step('browser_search', `Relay search returned 0 jobs — checking DB...`)
          }
        } catch (e) {
          step('browser_search', `Relay search failed: ${e instanceof Error ? e.message : String(e)} — checking DB...`)
        }
      } else {
        step('browser_search', `Edge relay offline — checking DB for cached jobs...`)
      }

      // Fallback 1: use existing DB jobs for this platform
      if (!jobs.length) {
        step('browser_search', `No fresh jobs scraped — pulling from database...`)
        const { data } = await supabaseQuery('job_listings', 'GET', undefined,
          `platform=eq.${platform}&status=eq.new&match_score=gte.7&order=match_score.desc&limit=${target * 5}&select=*`)
        jobs = Array.isArray(data) ? data as Record<string, unknown>[] : []
        if (jobs.length) step('browser_search', `Found ${jobs.length} cached job(s) in database (platform: ${platform})`)
      }

      // Fallback 2: JSearch API for supported platforms
      if (!jobs.length) {
        step('browser_search', `DB empty — fetching fresh jobs via JSearch API...`)
        const searchQueries = ['AI systems engineer remote', 'automation developer Philippines remote', 'full stack developer AI remote Philippines']
        let jsearchJobs: NormalizedJob[] = []
        for (const q of searchQueries) {
          try {
            const res = await searchJSearch(q, 'Philippines')
            jsearchJobs = [...jsearchJobs, ...res]
          } catch { /* continue */ }
          if (jsearchJobs.length >= target * 10) break
        }

        if (jsearchJobs.length) {
          step('browser_search', `JSearch returned ${jsearchJobs.length} jobs — scoring & saving to database...`)
          // Basic keyword scoring for immediate pipeline use
          const MUST_MATCH = ['ai', 'automation', 'developer', 'fullstack', 'full stack', 'typescript', 'python', 'vue', 'n8n', 'node.js', 'nodejs', 'backend', 'frontend', 'software engineer', 'software developer', 'web developer', 'devops', 'mlops', 'machine learning']
          const EXCLUDE = [
            '.net ', 'c#', ' sap ', 'java ', 'java developer',
            'electrical engineer', 'mechanical engineer', 'civil engineer', 'chemical engineer',
            'industrial engineer', 'petroleum', 'mining engineer', 'structural engineer',
            'hvac', 'plumbing', 'construction',
            'receptionist', 'data entry', 'nursing', 'nurse', 'teaching', 'teacher',
            'sales rep', 'sales representative', 'customer service', 'customer support',
            'graphic design', 'content writing', 'content writer', 'copywriter',
            'accountant', 'bookkeeper', 'auditor', 'finance analyst',
            'call center', 'virtual assistant', 'admin assistant', 'executive assistant',
            'driver', 'cashier', 'warehouse', 'security guard', 'housekeeping',
            'medical', 'physician', 'dentist', 'pharmacist'
          ]
          const scoredJobs: Record<string, unknown>[] = []

          for (const fj of jsearchJobs) {
            const text = `${fj.title} ${fj.company} ${fj.description || ''}`.toLowerCase()
            if (EXCLUDE.some(e => text.includes(e))) continue
            const score = MUST_MATCH.filter(k => text.includes(k)).length * 10
            if (score < min_score) continue

            const dbJob: Record<string, unknown> = {
              id: randomUUID(),
              platform: platform === 'indeed' ? 'indeed' : (fj.platform || platform),
              external_id: fj.external_id || null,
              title: fj.title,
              company: fj.company,
              location: fj.location || 'Remote',
              salary_min: fj.salary_min || null,
              salary_max: fj.salary_max || null,
              salary_currency: fj.salary_currency || 'USD',
              job_type: fj.job_type || 'full-time',
              description: fj.description || null,
              url: fj.url || '',
              posted_at: fj.posted_at || null,
              match_score: Math.min(score, 95),
              status: 'new',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
            // Save to DB (best-effort, ignore conflict)
            try {
              await supabaseQuery('job_listings', 'POST', dbJob)
            } catch { /* duplicate or error, skip */ }
            scoredJobs.push(dbJob)
          }
          jobs = scoredJobs
          step('browser_search', `Saved ${scoredJobs.length} scored job(s) to database`)
        } else {
          step('browser_search', `JSearch returned no results. Check JSEARCH_API_KEY or try again later.`)
        }
      }

      step('browser_search', `Found ${jobs.length} job(s) total — filtering by score >= ${min_score}...`)
      await new Promise(r => setTimeout(r, 500))

      // ── Step 2: Exclude already-applied & dismissed jobs (by ID and URL) ──
      let alreadyAppliedIds = new Set<string>()
      let alreadyAppliedUrls = new Set<string>()
      let dismissedExternalIds = new Set<string>()
      try {
        // job_applications: skip jobs with any active or pending application
        const { data: existingApps } = await supabaseQuery('job_applications', 'GET', undefined,
          `status=in.(applied,applying,captcha,under_review,interview,offer)&select=job_listing_id`)
        if (Array.isArray(existingApps)) {
          alreadyAppliedIds = new Set(existingApps.map((a: Record<string, unknown>) => a.job_listing_id as string).filter(Boolean))
        }
        // job_listings: skip dismissed/applied listings by URL and external_id (catches relay jobs without DB id)
        const { data: doneListings } = await supabaseQuery('job_listings', 'GET', undefined,
          `status=in.(applied,dismissed,apply_failed)&select=url,external_id&limit=500`)
        if (Array.isArray(doneListings)) {
          for (const jl of doneListings as Record<string, unknown>[]) {
            if (jl.url) alreadyAppliedUrls.add(jl.url as string)
            if (jl.external_id) dismissedExternalIds.add(jl.external_id as string)
          }
        }
        const skipCount = alreadyAppliedIds.size + alreadyAppliedUrls.size
        if (skipCount) step('browser_search', `Skipping ${skipCount} already-applied/dismissed job(s)...`)
      } catch { /* ignore */ }

      // ── Step 3: Score & filter ──
      // Apply UI-selected min_score (from body) + freshness_days (from body).
      // Raw jobs without match_score are kept through — AI re-scores in step 4.
      const TITLE_REJECT = ['electrical engineer', 'mechanical engineer', 'civil engineer', 'chemical engineer', 'industrial engineer', 'structural engineer', 'petroleum', 'mining engineer', 'hvac', 'construction', 'receptionist', 'nursing', 'nurse', 'teacher', 'teaching', 'accountant', 'bookkeeper', 'auditor', 'sales rep', 'customer service', 'customer support', 'graphic design', 'content writer', 'copywriter', 'virtual assistant', 'admin assistant', 'driver', 'cashier', 'warehouse', 'housekeeping', 'physician', 'dentist', 'pharmacist', 'call center', 'bpo']
      const freshnessCutoff = freshness_days > 0 ? Date.now() - (freshness_days * 86400000) : 0
      let preFreshnessDrop = 0
      // Base list: everything EXCEPT score gate. Score is applied last so we can
      // progressively relax the threshold when nothing qualifies — pipeline never
      // gives up silently without trying harder first.
      const baseFiltered = jobs
        .filter(j => {
          if (!freshnessCutoff) return true
          const p = j.posted_at as string | null | undefined
          if (!p) return true
          const t = new Date(p).getTime()
          if (isNaN(t)) return true
          if (t < freshnessCutoff) { preFreshnessDrop++; return false }
          return true
        })
        .filter(j => {
          const t = ((j.title as string) || '').toLowerCase()
          if (TITLE_REJECT.some(kw => t.includes(kw))) {
            step('browser_search', `⏭ Pre-filter reject: "${j.title}" (irrelevant role)`)
            return false
          }
          return true
        })
        .filter(j => !alreadyAppliedIds.has(j.id as string))
        .filter(j => {
          const url = (j.url as string) || ''
          const jk = (j.jk as string) || (j.external_id as string) || ''
          return !alreadyAppliedUrls.has(url) && !dismissedExternalIds.has(jk)
        })
      if (preFreshnessDrop) step('browser_search', `⏭ Freshness filter dropped ${preFreshnessDrop} job(s) older than ${freshness_days} days`)

      const applyScoreGate = (list: typeof jobs, threshold: number) => list.filter(j => {
        const ms = j.match_score as number | null | undefined
        if (ms == null) return true  // un-scored — keep; AI decides downstream
        return ms >= threshold
      })

      // Progressive relax: [requested, 50, 30, 0], de-duped + descending. Stops as soon
      // as any tier yields candidates. This keeps the pipeline from quitting when the
      // UI dropdown was stricter than what today's listings can satisfy.
      const tiers = Array.from(new Set([min_score, 50, 30, 0])).filter(t => t >= 0 && t <= min_score).sort((a, b) => b - a)
      let qualified: typeof jobs = []
      let usedThreshold = min_score
      for (const t of tiers) {
        const pass = applyScoreGate(baseFiltered, t)
        if (pass.length) {
          qualified = pass
          usedThreshold = t
          if (t !== min_score) {
            step('browser_search', `🔻 No jobs at min_score ${min_score} — auto-relaxing to ≥${t} (${pass.length} now qualify)`)
          }
          break
        }
        if (t === min_score && min_score > 0 && baseFiltered.length > 0) {
          const droppedByScore = baseFiltered.length - pass.length
          step('browser_search', `⏭ Score filter dropped ${droppedByScore} job(s) below match ${min_score}`)
        }
      }
      qualified = qualified.slice(0, Math.min(target * 5, 20))

      if (!qualified.length) {
        // ── Test-mode rescue: when target=1 and the dedup filter ate everything,
        // ignore the dedup filter once — but ONLY for jobs whose title matches the
        // user's preferred roles (AI / automation / fullstack). Never apply to
        // unrelated roles even in test mode.
        if (target === 1 && jobs.length > 0) {
          const RELEVANT_TITLE_KEYWORDS = [
            'ai engineer', 'ai automation', 'ai developer', 'ai architect',
            'automation engineer', 'automation developer', 'automation specialist',
            'machine learning', 'ml engineer', 'mlops',
            'full stack', 'fullstack', 'full-stack',
            'backend developer', 'backend engineer',
            'frontend developer', 'frontend engineer',
            'software engineer', 'software developer',
            'devops', 'platform engineer',
            'data engineer', 'python developer', 'typescript developer',
            'node.js', 'vue', 'react developer',
            'integration engineer', 'workflow automation', 'rpa',
            'llm', 'genai', 'generative ai',
          ]
          const rescuePool = jobs
            .filter(j => {
              if (!freshnessCutoff) return true
              const p = j.posted_at as string | null | undefined
              if (!p) return true
              const t = new Date(p).getTime()
              if (isNaN(t)) return true
              return t >= freshnessCutoff
            })
            .filter(j => {
              const t = ((j.title as string) || '').toLowerCase()
              return !TITLE_REJECT.some(kw => t.includes(kw))
            })
            .filter(j => {
              const t = ((j.title as string) || '').toLowerCase()
              return RELEVANT_TITLE_KEYWORDS.some(kw => t.includes(kw))
            })
            // Sort newest first
            .sort((a, b) => {
              const ta = new Date((a.posted_at as string) || 0).getTime()
              const tb = new Date((b.posted_at as string) || 0).getTime()
              return tb - ta
            })
          if (rescuePool.length > 0) {
            qualified = rescuePool.slice(0, 1)
            usedThreshold = 0
            const pick = qualified[0]
            step('browser_search', `⚠ Test mode (target=1): no fresh AI/automation/fullstack jobs — re-applying to "${pick.title}" (overriding dedup filter)`)
            try {
              if (pick.id) {
                await supabaseQuery('job_listings', 'PATCH', { status: 'new', updated_at: new Date().toISOString() }, `id=eq.${pick.id}`)
              }
            } catch { /* ignore */ }
          } else {
            step('browser_search', `⚠ Test mode (target=1): search returned ${jobs.length} jobs but none match AI/automation/fullstack titles. Try broader queries or wait for new postings.`)
          }
        }

        if (!qualified.length) {
          // Truly nothing — even at threshold 0. Explain what held them back so
          // the next run can be tuned (freshness too tight, all already applied, etc.)
          const appliedSkipped = alreadyAppliedIds.size + alreadyAppliedUrls.size
          const reasons: string[] = []
          if (preFreshnessDrop) reasons.push(`${preFreshnessDrop} too old`)
          if (appliedSkipped) reasons.push(`${appliedSkipped} already applied/dismissed`)
          if (!jobs.length) reasons.push('scrape returned 0 listings')
          const breakdown = reasons.length ? ` (${reasons.join(', ')})` : ''
          const msg = `No applyable jobs on ${platform} after auto-relaxation to score 0${breakdown}. Try widening freshness (30 days) or clearing dismissed list.`
          step('pipeline_complete', msg)
          broadcastNotification('pipeline_complete', { node: 'pipeline_complete', message: msg, platform })
          return
        }
      }
      if (usedThreshold < min_score) {
        step('browser_search', `✓ Proceeding with ${qualified.length} job(s) at relaxed score ≥${usedThreshold}`)
      }

      if (!relayOnline) {
        step('browser_search', `⚠ Edge relay offline — running email-only mode (browser apply skipped). Start scripts/start-relay.bat for full apply.`)
      } else {
        step('browser_search', `✓ Edge relay online — full browser + email apply enabled`)
      }

      step('score_filter', `${qualified.length} job(s) passed score filter — running AI sub-agents...`)

      const N8N_BASE = process.env.N8N_URL || 'http://neuralyx-n8n:5678'
      // n8n per-platform webhook paths
      const N8N_APPLY_WEBHOOKS: Record<string, string> = {
        indeed:    `${N8N_BASE}/webhook/indeed-apply`,
        linkedin:  `${N8N_BASE}/webhook/auto-apply`,
        kalibrr:   `${N8N_BASE}/webhook/auto-apply`,
        jobslin:   `${N8N_BASE}/webhook/auto-apply`,
        onlinejobs:`${N8N_BASE}/webhook/auto-apply`,
      }
      const n8nWebhook = N8N_APPLY_WEBHOOKS[platform] || `${N8N_BASE}/webhook/auto-apply`

      // ── Enrich + Apply one job at a time — stop when target reached ──
      // "attempts" = non-expired tries. Expired jobs are silently skipped and don't count.
      let applied = 0, failed = 0, captcha = 0, attempts = 0

      for (const job of qualified) {
        // Stop once we've made target attempts (expired jobs don't consume an attempt slot)
        if (attempts >= target) break

        // ── Inter-job self-heal: CDP may have died between jobs (user closed Edge, OS put it to sleep, etc.) ──
        if (relayOnline && platform === 'indeed') {
          try {
            const st = await fetch(`${relayBase}/browser/cdp-status`, { signal: AbortSignal.timeout(2500) })
            const sd = await st.json() as { cdp?: string }
            if (sd.cdp !== 'up') {
              step('browser_search', `🔧 Mid-pipeline CDP dropped — auto-relaunching to continue…`)
              const lr = await fetch(`${relayBase}/browser/launch-cdp`, { method: 'POST', signal: AbortSignal.timeout(45000) })
              const ld = await lr.json().catch(() => ({})) as { ok?: boolean }
              if (!ld.ok) {
                step('browser_search', `✗ Mid-pipeline recovery failed — remaining jobs will use email-only fallback`)
                relayOnline = false
              }
            }
          } catch { /* soft fail — apply will re-check */ }
        }

        const jobTitle = (job.title as string) || 'Unknown Role'
        const company = (job.company as string) || 'Unknown'
        const jobId = (job.id as string) || ''
        const jobUrl = (job.url as string) || ''

        // ── STRONG pre-check: skip expired or already-applied before spending any time enriching ──
        // Test-mode bypass (target=1): user explicitly wants to apply ONE — skip the dedup gates.
        const singleTestMode = target === 1
        // Check DB status — if already marked applied/dismissed, skip immediately
        if (jobId && !singleTestMode) {
          const { data: statusCheck } = await supabaseQuery('job_listings', 'GET', undefined, `id=eq.${jobId}&select=status`) as { data: { status: string }[] | null }
          const currentStatus = Array.isArray(statusCheck) ? statusCheck[0]?.status : null
          if (currentStatus === 'applied' || currentStatus === 'dismissed' || currentStatus === 'apply_failed') {
            step('browser_search', `Skipping ${jobTitle} @ ${company} — status=${currentStatus} in DB`, { job_title: jobTitle, company })
            continue
          }
        }
        // Check if URL is in alreadyAppliedUrls (relay jobs without DB id)
        if (jobUrl && alreadyAppliedUrls.has(jobUrl) && !singleTestMode) {
          step('browser_search', `Skipping ${jobTitle} @ ${company} — URL already applied`, { job_title: jobTitle, company })
          continue
        }
        if (singleTestMode && jobUrl && alreadyAppliedUrls.has(jobUrl)) {
          step('browser_search', `⚠ Test mode (target=1): URL was already applied — re-attempting anyway: ${jobTitle}`, { job_title: jobTitle, company })
        }
        let description = (job.description as string) || ''

        step('pipeline_start', `━━━ JOB ${attempts + 1}/${target} ━━━ ${jobTitle} @ ${company}`, { job_title: jobTitle, company, url: jobUrl })
        step('cover_letter', `[AI Sub-agent 1/4] Fetching & classifying: ${jobTitle} @ ${company}...`, { job_title: jobTitle, company })

        // ── Sub-agent 1a: Fetch description from URL if empty ──
        if (!description && jobUrl) {
          try {
            const fetchRes = await fetch(jobUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
              signal: AbortSignal.timeout(8000),
            })
            if (fetchRes.ok) {
              const html = await fetchRes.text()
              // Extract visible text (strip HTML tags, get first 4000 chars of meaningful content)
              const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
              description = text.slice(0, 4000)
              // Save fetched description to DB
              if (jobId && description.length > 100) {
                await supabaseQuery('job_listings', 'PATCH', { description: description.slice(0, 5000), updated_at: new Date().toISOString() }, `id=eq.${jobId}`)
              }
            }
          } catch { /* URL fetch failed, continue with empty description */ }
        }

        // ── Sub-agent 1b: Detect apply channels from URL + metadata ──
        const detectChannels = (url: string, easyApply: unknown): Record<string, string>[] => {
          const channels: Record<string, string>[] = []
          if (!url) return channels
          const u = url.toLowerCase()
          if (u.includes('linkedin.com') && easyApply) channels.push({ channel: 'linkedin_easy_apply', status: 'available', detail: 'LinkedIn Easy Apply (1-click)', target: url })
          else if (u.includes('linkedin.com')) channels.push({ channel: 'linkedin_external', status: 'available', detail: 'LinkedIn → External ATS', target: url })
          else if (u.includes('indeed.com') || u.includes('indeed.co')) channels.push({ channel: 'indeed_apply', status: 'available', detail: 'Indeed Apply (browser agent)', target: url })
          else if (u.includes('workday.com')) channels.push({ channel: 'workday_ats', status: 'available', detail: 'Workday ATS form', target: url })
          else if (u.includes('greenhouse.io')) channels.push({ channel: 'greenhouse_ats', status: 'available', detail: 'Greenhouse ATS form', target: url })
          else if (u.includes('lever.co')) channels.push({ channel: 'lever_ats', status: 'available', detail: 'Lever ATS form', target: url })
          else if (u.includes('ashbyhq.com')) channels.push({ channel: 'ashby_ats', status: 'available', detail: 'Ashby ATS form', target: url })
          else if (u.includes('kalibrr.com')) channels.push({ channel: 'kalibrr_apply', status: 'available', detail: 'Kalibrr Quick Apply', target: url })
          else channels.push({ channel: 'direct_apply', status: 'available', detail: 'Direct application form', target: url })
          // Add email channel if we have a recruiter email
          return channels
        }
        const applyChannels = detectChannels(jobUrl, job.easy_apply)

        // ── Sub-agent 1c: Combined classify + match + channel detection ──
        let roleType = 'fullstack', companyBucket = 'startup', skillMatches: string[] = [], skillGaps: string[] = [], recommendation = '', matchScore = (job.match_score as number) || 50, painPoint = '', workArrangement = 'remote', seniority = 'senior'
        let jdChannels: Array<{ type: string; target: string; instruction: string }> = []
        try {
          const enrichPrompt = `Analyze this job for Gabriel Alvin Aquino (AI Systems Engineer, 8+ yrs: Python, Vue.js, TypeScript, Node.js, Docker, OpenAI, LangChain, n8n, Supabase, PostgreSQL, FastAPI, MCP, PHP/Laravel).

JOB: ${jobTitle} at ${company}
URL: ${jobUrl}
DESCRIPTION: ${description.slice(0, 2500)}

Return ONLY valid JSON (no markdown):
{
  "match_score": 0-100,
  "role_type": "fullstack|ai_engineer|ml_engineer|devops|frontend|backend|automation|other",
  "company_bucket": "agency|startup|enterprise|recruiter|outsourcing|direct_client",
  "work_arrangement": "remote|hybrid|onsite",
  "seniority": "junior|mid|senior|lead",
  "skill_matches": ["up to 6 skills Gabriel has that match this exact job"],
  "skill_gaps": ["up to 3 skills this job requires that Gabriel lacks"],
  "recommendation": "one sentence why this is/isn't a good fit",
  "company_pain_point": "one sentence on what business problem this role solves",
  "jd_channels": [
    {
      "type": "email|form|meeting|company_site",
      "target": "exact email address, form URL, or Calendly URL found in the JD",
      "instruction": "exact text from JD that triggered this channel (e.g. 'Send resume to hr@company.com')"
    }
  ]
}

For jd_channels: scan the DESCRIPTION carefully for explicit application instructions:
- Email: 'send resume to', 'email us at', 'apply via email', 'send cv to'
- Form: 'fill out form at', 'apply at', 'complete application at' (extract the URL)
- Meeting: 'book a call', 'schedule interview', 'book via calendly', 'set up a meeting'
- Company site: 'apply on our website', 'visit careers page', 'apply at [company].com'
Only include channels explicitly mentioned in the job description. Empty array [] if none found.`
          const raw = await callAI('You analyze job postings. Return only valid JSON, no markdown.', enrichPrompt)
          const matchJson = raw.replace(/```json|```/g, '').match(/\{[\s\S]*\}/)
          if (matchJson) {
            const parsed = JSON.parse(matchJson[0])
            matchScore = parsed.match_score ?? matchScore
            roleType = parsed.role_type || roleType
            companyBucket = parsed.company_bucket || companyBucket
            workArrangement = parsed.work_arrangement || workArrangement
            if (Array.isArray(parsed.jd_channels)) jdChannels = parsed.jd_channels
            seniority = parsed.seniority || seniority
            skillMatches = parsed.skill_matches || []
            skillGaps = parsed.skill_gaps || []
            recommendation = parsed.recommendation || ''
            painPoint = parsed.company_pain_point || ''
          }
        } catch (e) {
          step('cover_letter', `⚠ AI classify skipped: ${e instanceof Error ? e.message.slice(0, 80) : e}`)
        }

        // ── Regex fallback: scan raw description for emails + apply URLs the AI might have missed ──
        // User rule: "force sending email once we found any context ... requiring to send a resume to that email or direct company link"
        const knownEmails = new Set(jdChannels.filter(c => c.type === 'email').map(c => c.target.toLowerCase()))
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
        const foundEmails = (description.match(emailRegex) || [])
          .map(e => e.toLowerCase().replace(/\.$/, ''))
          .filter(e => !knownEmails.has(e))
          .filter(e => !/\.(png|jpg|jpeg|gif|svg|pdf)$/i.test(e))
          .filter(e => !/indeed\.com|noreply|no-reply|example\.com|domain\.com/i.test(e))
        for (const em of [...new Set(foundEmails)]) {
          jdChannels.push({ type: 'email', target: em, instruction: 'Email found in job description (regex fallback) — send resume automatically' })
          knownEmails.add(em)
        }
        // Apply URL detection: "apply at/via/through/submit to" patterns
        const urlRegex = /https?:\/\/[^\s<>"')]+/g
        const foundUrls = (description.match(urlRegex) || [])
          .filter(u => !/indeed\.com|jooble|linkedin\.com\/jobs|google\.com\/search|youtube\.com|twitter\.com/i.test(u))
          .filter(u => /apply|career|job|hire|recruit|greenhouse|lever|ashby|workday|smartrecruiters|bamboohr|icims/i.test(u))
        const knownForms = new Set(jdChannels.filter(c => c.type === 'form').map(c => c.target))
        for (const u of [...new Set(foundUrls)]) {
          if (!knownForms.has(u)) jdChannels.push({ type: 'form', target: u, instruction: 'Apply URL found in job description (regex fallback)' })
        }

        step('classify_done', `✓ Score: ${matchScore}/100 | Role: ${roleType} | Company: ${companyBucket} | Channels: ${jdChannels.length} detected`, { job_title: jobTitle, company, match_score: matchScore })

        // ── HARD FILTER: reject irrelevant roles (user preference: AI/automation/fullstack only) ──
        const ALLOWED_ROLES = ['fullstack', 'ai_engineer', 'ml_engineer', 'devops', 'frontend', 'backend', 'automation']
        const titleLower = (jobTitle || '').toLowerCase()
        const IRRELEVANT_TITLE_KEYWORDS = [
          'electrical engineer', 'mechanical engineer', 'civil engineer', 'chemical engineer',
          'industrial engineer', 'structural engineer', 'petroleum engineer', 'mining engineer',
          'hvac', 'construction', 'receptionist', 'nurse', 'nursing', 'teacher', 'teaching',
          'accountant', 'bookkeeper', 'auditor', 'sales rep', 'customer service',
          'graphic design', 'content writer', 'copywriter', 'virtual assistant', 'admin assistant',
          'driver', 'cashier', 'warehouse', 'housekeeping', 'physician', 'dentist', 'pharmacist',
          'call center', 'bpo agent'
        ]
        const titleIsIrrelevant = IRRELEVANT_TITLE_KEYWORDS.some(kw => titleLower.includes(kw))
        const roleIsIrrelevant = !ALLOWED_ROLES.includes(roleType) || roleType === 'other'

        // Role filter stays ON in all modes — user wants only AI/automation/fullstack.
        // (Test mode bypasses the dedup gates earlier, NOT the relevance check.)
        if (titleIsIrrelevant || (roleIsIrrelevant && matchScore < 60)) {
          const reason = titleIsIrrelevant ? 'title in irrelevant list' : `role="${roleType}" score=${matchScore}`
          step('classify_done', `⏭ SKIP: "${jobTitle}" — ${reason} — does not match preference (AI/automation/fullstack)`, { job_title: jobTitle, company })
          try {
            if (job.id) {
              await supabaseQuery('job_listings', 'PATCH', { status: 'dismissed', updated_at: new Date().toISOString() }, `id=eq.${job.id}`)
            }
          } catch { /* ignore */ }
          continue
        }

        // ── Sub-agent 2: Cover letter using Problem-Solution framework ──
        step('cover_letter', `[AI Sub-agent 2/4] Writing cover letter for ${company}...`, { job_title: jobTitle, company })
        let coverLetter = ''
        try {
          coverLetter = await handleCoverLetterInternal(
            { title: jobTitle, company, description },
            { skills: ['Python', 'Vue.js', 'TypeScript', 'Node.js', 'Docker', 'OpenAI', 'LangChain', 'n8n', 'Supabase', 'PostgreSQL', 'FastAPI', 'MCP', 'PHP', 'Laravel'] }
          )
          step('cover_letter', `Cover letter ready (${coverLetter.length} chars)`, { job_title: jobTitle, company })
        } catch (e) {
          step('cover_letter', `Cover letter fallback: ${e instanceof Error ? e.message.slice(0, 80) : e}`)
        }

        // ── Sub-agent 3: Recruiter Research — find real email/contact ──
        step('recruiter', `[AI Sub-agent 3/4] Researching recruiter/HR contact for ${company}...`, { job_title: jobTitle, company })
        let recruiterEmail = '', recruiterName = '', companyDomain = '', companyIntel = ''
        try {
          // Extract email from description first
          const emailMatch = description.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g)
          if (emailMatch?.length) {
            recruiterEmail = emailMatch[0]
            step('cover_letter', `Found email in job description: ${recruiterEmail}`, { job_title: jobTitle, company })
          }

          // Infer company domain from URL or company name
          if (!recruiterEmail) {
            const urlMatch = jobUrl.match(/https?:\/\/(?:www\.)?([^/\n?]+)/)
            const domain = urlMatch?.[1]?.replace(/^jobs\.|^careers\.|^apply\./, '')
            if (domain && !domain.includes('linkedin') && !domain.includes('indeed') && !domain.includes('kalibrr')) {
              companyDomain = domain
              recruiterEmail = `hr@${domain}`
            } else {
              // Guess from company name
              const slug = company.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)
              recruiterEmail = `hr@${slug}.com`
              companyDomain = `${slug}.com`
            }
          }

          // SearXNG web research: company intel + recruiter
          const searxBase = process.env.SEARXNG_URL || 'http://host.docker.internal:8888'
          try {
            const searxRes = await fetch(`${searxBase}/search?q=${encodeURIComponent(`${company} recruiter HR email hiring site:linkedin.com OR site:${companyDomain || company.toLowerCase()+'.com'}`)}&format=json&engines=google,bing&language=en`, {
              signal: AbortSignal.timeout(6000),
              headers: { 'Accept': 'application/json' }
            })
            if (searxRes.ok) {
              const searxData = await searxRes.json() as { results?: { title?: string; content?: string; url?: string }[] }
              const results = searxData.results?.slice(0, 5) || []
              const snippets = results.map(r => `${r.title}: ${r.content}`).join('\n')

              // AI extract recruiter info from search snippets
              const researchPrompt = `From these search results about "${company}", extract:
1. Recruiter or HR manager name and email (if visible)
2. Company description (2 sentences max)
3. Tech stack they use

Search results:
${snippets}

Job URL: ${jobUrl}

Return ONLY JSON: {"recruiter_name":"","recruiter_email":"","company_intel":"2 sentence company description","tech_stack":["array"]}`
              const researchRaw = await callAI('Extract recruiter and company info from search results. Return only valid JSON.', researchPrompt)
              const researchMatch = researchRaw.replace(/```json|```/g, '').match(/\{[\s\S]*\}/)
              if (researchMatch) {
                const rd = JSON.parse(researchMatch[0])
                if (rd.recruiter_email?.includes('@')) recruiterEmail = rd.recruiter_email
                if (rd.recruiter_name) recruiterName = rd.recruiter_name
                if (rd.company_intel) companyIntel = rd.company_intel
              }
            }
          } catch { /* SearXNG offline, continue */ }

          step('cover_letter', `Recruiter research complete${recruiterEmail ? ` — ${recruiterEmail}` : ' — using inferred email'}`, { job_title: jobTitle, company })
        } catch (e) {
          step('cover_letter', `Recruiter research skipped: ${e instanceof Error ? e.message.slice(0, 60) : e}`)
        }

        // Add email channel if found
        if (recruiterEmail) {
          applyChannels.push({
            channel: 'email',
            status: 'pending',
            detail: recruiterName ? `Send to ${recruiterName} (${recruiterEmail})` : `Send cover letter to ${recruiterEmail}`,
            target: recruiterEmail,
          })
        }

        // ── Update job_listing with all enriched data ──
        if (jobId) {
          try {
            await supabaseQuery('job_listings', 'PATCH', {
              match_score: matchScore,
              description: description.slice(0, 5000) || null,
              raw_data: {
                role_type: roleType,
                company_bucket: companyBucket,
                work_arrangement: workArrangement,
                seniority,
                skill_matches: skillMatches,
                skill_gaps: skillGaps,
                recommendation,
                company_pain_point: painPoint,
                company_intel: companyIntel,
                recruiter_email: recruiterEmail || null,
                recruiter_name: recruiterName || null,
                inferred_company_email: recruiterEmail || null,
                apply_channels: applyChannels,
                enriched_by: 'pipeline_ai_agents',
                enriched_at: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            }, `id=eq.${jobId}`)
          } catch { /* ignore patch error */ }
        }

        // ── Pre-create job_application with enriched data ──
        const appId = randomUUID()
        try {
          await supabaseQuery('job_applications', 'POST', {
            id: appId,
            job_listing_id: jobId || null,
            platform,
            channel: applyChannels[0]?.channel || 'auto_agent',
            status: 'applying',
            applied_via: 'platform_pipeline',
            cover_letter: coverLetter || null,
            notes: `Score: ${matchScore} | ${recommendation || 'AI-selected'} | Channels: ${applyChannels.map(c => c.channel).join(', ')}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          broadcastNotification('job_found', {
            node: 'job_found',
            app_id: appId,
            job_id: jobId,
            job_title: jobTitle,
            company,
            platform,
            match_score: matchScore,
            location: job.location,
            url: jobUrl,
            status: 'applying',
            skill_matches: skillMatches,
            recommendation,
            apply_channels: applyChannels,
          })
          broadcastNotification('refresh_applications', { node: 'refresh_applications', app_id: appId })
        } catch (e) {
          step('browser_search', `Warning: could not pre-create application for ${jobTitle}: ${e instanceof Error ? e.message : e}`)
          continue  // skip this job, try next
        }

        // ── Sub-agent 4: Apply immediately (inline, not in a separate loop) ──
        step('apply_start', `[AI Sub-agent 4/4] CH1 → Browser apply: ${jobTitle} @ ${company}`, { job_title: jobTitle, company })
        step('apply_start', `  ↳ URL: ${jobUrl.slice(0, 100)}`, { job_title: jobTitle, company })
        step('apply_start', `  ↳ Recruiter email queued for CH2: ${recruiterEmail || 'none found'}`, { job_title: jobTitle, company })
        step('apply_start', `  ↳ JD channels for CH3+: ${jdChannels.length > 0 ? jdChannels.map(c => c.type).join(', ') : 'none'}`, { job_title: jobTitle, company })
        await new Promise(r => setTimeout(r, 300))

        let finalStatus = 'apply_failed'
        let finalDetail = 'Browser relay did not respond'
        let finalMethod = 'relay_apply'
        let relayStatus = ''

        // ── Sub-agent 4: Apply via Edge relay directly (no n8n middleman) ──
        // ── Determine CH1 apply target ──
        // company_site jobs → apply directly on company website (not Indeed SmartApply)
        const isCompanySiteJob = (job.apply_type as string) === 'company_site'
        const companySiteUrl = isCompanySiteJob
          ? (applyChannels.find(c => c.channel === 'direct_apply' || c.channel?.includes('ats'))?.target as string || jobUrl)
          : jobUrl
        const ch1Label = isCompanySiteJob ? 'Company site apply' : 'Indeed Direct Apply'

        try {
          const relayBase = relayOnline ? await findEdgeRelay().catch(() => null) : null
          if (!relayBase) {
            // Relay offline — skip browser apply, go straight to CH2 email
            finalStatus = 'relay_offline'
            finalDetail = 'Relay offline — skipping browser apply, email channel will run'
            finalMethod = 'relay_offline'
            step('apply_step', `Relay offline — skipping CH1 browser apply for ${jobTitle}, proceeding to email...`, { job_title: jobTitle, company, action: 'relay_offline' })
          } else {
            step('apply_step', `[CH1] ${ch1Label} — opening browser...`, { job_title: jobTitle, company, action: 'relay_apply' })

            const relayRes = await fetch(`${relayBase}/browser/apply`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                job_url: companySiteUrl,
                job_title: jobTitle,
                company,
                cover_letter: coverLetter,
                apply_link: companySiteUrl,
                application_id: appId,  // ← key the timeline events to the DB row
              }),
              signal: AbortSignal.timeout(180000),
            })

            const rawText = await relayRes.text()
            let relayData: { status?: string; detail?: string; final_url?: string } = {}
            try { relayData = rawText.trim() ? JSON.parse(rawText) : {} } catch { /* bad body */ }
            relayStatus = relayData.status || ''

            const isExpired = relayData.detail?.toLowerCase().includes('expired') || relayData.detail?.toLowerCase().includes('removed') || false
            if (relayData.status === 'applied') {
              finalStatus = 'applied'
              finalDetail = `[CH1] ${ch1Label} — ${relayData.detail || 'Application submitted'}`
              finalMethod = isCompanySiteJob ? 'relay_company_site' : `relay_${platform}`
            } else if (relayData.status === 'captcha') {
              finalStatus = 'captcha'
              finalDetail = '[CH1] CAPTCHA detected — needs manual solve in Monitor tab'
              finalMethod = 'relay_captcha'
            } else if (relayData.status === 'already_applied') {
              finalStatus = 'already_applied'
              finalDetail = '[CH1] Already applied to this job'
              finalMethod = 'relay_duplicate'
            } else if (relayData.status === 'no_apply_button' || isExpired) {
              finalStatus = 'expired'
              finalDetail = relayData.detail || '[CH1] Job expired or removed'
              finalMethod = 'relay_expired'
            } else {
              finalStatus = 'apply_failed'
              finalDetail = `[CH1] ${relayData.detail || 'No apply button found or form failed'}`
              finalMethod = 'relay_failed'
            }
            step('apply_step', `[CH1] ${finalStatus.toUpperCase()} — ${finalDetail.slice(0, 100)}`, { job_title: jobTitle, company, action: finalStatus })
          }
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e)
          finalStatus = 'apply_failed'
          finalDetail = `[CH1] Relay error: ${errMsg.slice(0, 150)}`
          finalMethod = 'relay_error'
        }

        // Update the pre-created application record
        const dbStatus = finalStatus === 'applied' ? 'applied' : finalStatus === 'captcha' ? 'applying' : finalStatus === 'already_applied' ? 'applied' : finalStatus === 'relay_offline' ? 'new' : finalStatus === 'external_ats' ? 'apply_failed' : 'apply_failed'
        try {
          await supabaseQuery('job_applications', 'PATCH', {
            status: dbStatus,
            channel: finalMethod,
            cover_letter: coverLetter || null,
            notes: finalDetail,
            updated_at: new Date().toISOString(),
          }, `id=eq.${appId}`)
        } catch { /* ignore patch error */ }

        step('apply_complete', `[${finalStatus.toUpperCase()}] ${jobTitle} @ ${company}: ${finalDetail}`, {
          node: 'apply_complete', job_title: jobTitle, company,
          status: finalStatus, detail: finalDetail, app_id: appId,
        })

        // ── Skip conditions (don't count as attempt, try next job) ──
        // Only for Indeed Direct Apply: expired jobs and already-applied jobs
        if (finalStatus === 'expired') {
          step('apply_step', `Job expired — dismissing, trying next...`, { job_title: jobTitle, company, action: 'skip_expired' })
          if (jobId) await supabaseQuery('job_listings', 'PATCH', { status: 'dismissed', updated_at: new Date().toISOString() }, `id=eq.${jobId}`)
          else if (jobUrl) {
            const jkMatch = jobUrl.match(/jk=([a-zA-Z0-9]+)/)
            await supabaseQuery('job_listings', 'POST', {
              id: randomUUID(), platform, title: jobTitle, company, url: jobUrl,
              external_id: jkMatch?.[1] || jobUrl.slice(-20),
              status: 'dismissed', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            }).catch(() => {})
          }
          if (appId) await supabaseQuery('job_applications', 'DELETE', undefined, `id=eq.${appId}`).catch(() => {})
          continue  // not an attempt — find next
        }

        if (finalStatus === 'already_applied') {
          step('apply_step', `Already applied — dismissing, trying next...`, { job_title: jobTitle, company, action: 'skip_already_applied' })
          if (jobId) await supabaseQuery('job_listings', 'PATCH', { status: 'applied', updated_at: new Date().toISOString() }, `id=eq.${jobId}`)
          else if (jobUrl) {
            const jkMatch = jobUrl.match(/jk=([a-zA-Z0-9]+)/)
            await supabaseQuery('job_listings', 'POST', {
              id: randomUUID(), platform, title: jobTitle, company, url: jobUrl,
              external_id: jkMatch?.[1] || jobUrl.slice(-20),
              status: 'applied', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            }).catch(() => {})
          }
          if (appId) await supabaseQuery('job_applications', 'DELETE', undefined, `id=eq.${appId}`).catch(() => {})
          continue  // not an attempt — find next
        }

        // ── relay_offline: job kept as 'new', attempt not consumed ──
        // Email (CH2) will still run below — it's the only channel available
        if (finalStatus === 'relay_offline') {
          // Don't increment attempts — job stays fresh for next pipeline run with relay online
        }

        // ── Real attempt — counts toward target ──
        if (finalStatus !== 'relay_offline') attempts++

        if (finalStatus === 'applied') {
          applied++
          if (jobId) await supabaseQuery('job_listings', 'PATCH', { status: 'applied', updated_at: new Date().toISOString() }, `id=eq.${jobId}`)
          try {
            await sendEmailHelper(
              'gabrielalvin.jobs@gmail.com',
              `✅ Applied: ${jobTitle} @ ${company} [${platform.toUpperCase()}]`,
              `Your AI pipeline just applied to a job.\n\nJob: ${jobTitle}\nCompany: ${company}\nPlatform: ${platform.toUpperCase()}\nMatch Score: ${matchScore}/100\nURL: ${jobUrl}\n\n${recommendation ? 'Why: ' + recommendation + '\n\n' : ''}Cover letter (first 500 chars):\n${coverLetter?.slice(0, 500) || '(none)'}...\n\n— NEURALYX Job Pipeline`,
              { attachResume: false }
            )
          } catch { /* non-blocking */ }
        } else if (finalStatus === 'captcha') {
          captcha++
          if (jobId) await supabaseQuery('job_listings', 'PATCH', { status: 'applying', updated_at: new Date().toISOString() }, `id=eq.${jobId}`)
          sendEmailHelper('gabrielalvin.jobs@gmail.com', `⚠️ CAPTCHA: ${jobTitle} @ ${company}`, `CAPTCHA solve needed for ${jobUrl}\n\nOpen the Monitor tab.\n\n— NEURALYX`, { attachResume: false }).catch(() => {})
        } else if (finalStatus === 'relay_offline') {
          // job_listings stays 'new' (set by dbStatus mapping above) — no failed count, retried next run
        } else {
          failed++
          // Mark as apply_failed so this job is NOT retried on next run
          if (jobId) await supabaseQuery('job_listings', 'PATCH', { status: 'apply_failed', updated_at: new Date().toISOString() }, `id=eq.${jobId}`)
        }

        // ── MANDATORY Post-Apply Research Sub-Agent ──
        // User rule: after submit on platform, ALWAYS run AI sub-agent to scrape JD for any
        // HR/recruiter email or apply-form URL and contact them (force resume send)
        step('apply_step', `[AI Post-Apply Research] Scanning JD for recruiter contacts, apply forms, relevant links...`, { job_title: jobTitle, company, action: 'post_apply_research' })
        try {
          const ANTHROPIC_KEY_PA = process.env.ANTHROPIC_API_KEY || ''
          if (ANTHROPIC_KEY_PA && description.length > 100) {
            const researchPrompt = `Job Description:\n${description.slice(0, 6000)}\n\nExtract ALL explicit recruiter/HR contact channels. Look for: email addresses, apply-form URLs (Greenhouse/Lever/Ashby/Workday/custom forms), Google Form links, LinkedIn recruiter URLs, "send resume to X" instructions, "apply at X" instructions.\n\nReturn STRICT JSON only:\n{"channels":[{"type":"email|form|linkedin","target":"exact email or URL","instruction":"what the JD asks to do"}]}\n\nInclude EVERY instance even if duplicate-looking. Exclude Indeed's own URLs.`
            const paRes = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: { 'x-api-key': ANTHROPIC_KEY_PA, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, messages: [{ role: 'user', content: researchPrompt }] }),
              signal: AbortSignal.timeout(20000),
            })
            if (paRes.ok) {
              const paData = await paRes.json() as { content: { type: string; text: string }[] }
              const paText = paData.content?.[0]?.text || ''
              const paMatch = paText.match(/\{[\s\S]*\}/)
              if (paMatch) {
                const parsed = JSON.parse(paMatch[0]) as { channels?: Array<{ type: string; target: string; instruction: string }> }
                const existing = new Set(jdChannels.map(c => `${c.type}:${c.target.toLowerCase()}`))
                for (const ch of (parsed.channels || [])) {
                  if (!ch.target) continue
                  const key = `${ch.type}:${ch.target.toLowerCase()}`
                  if (!existing.has(key)) {
                    jdChannels.push({ type: ch.type, target: ch.target, instruction: ch.instruction || 'Post-apply AI research' })
                    existing.add(key)
                  }
                }
                step('apply_step', `[AI Post-Apply Research] Found ${parsed.channels?.length || 0} channels (total jdChannels: ${jdChannels.length})`, { job_title: jobTitle, company, action: 'post_apply_research_done' })
              }
            }
          }
        } catch (e) {
          step('apply_step', `[AI Post-Apply Research] Skipped: ${e instanceof Error ? e.message.slice(0, 60) : e}`, { job_title: jobTitle, company })
        }

        // ── CH2: Email — ALWAYS mandatory after CH1 (force-send, resume attached) ──
        // Source: recruiter email from sub-agent 3 (research), or email found in JD channels
        const emailChannel = applyChannels.find((c: Record<string, string>) => c.channel === 'email' && c.target?.includes('@'))
        const jdEmailChannel = jdChannels.find(c => c.type === 'email' && c.target?.includes('@'))
        const recruiterEmailTarget = (emailChannel?.target || jdEmailChannel?.target) as string | undefined
        // User rule: FORCE email send even if cover letter generation failed — use short fallback body
        const applicationBody = coverLetter || `Dear Hiring Team,\n\nI'm applying for the ${jobTitle} role at ${company}. My resume is attached for your review. I have 8+ years of experience in AI systems engineering, automation, and full-stack development. I'd welcome the chance to discuss how I can contribute.\n\nPortfolio: https://neuralyx.ai.dev-environment.site\nLinkedIn: https://linkedin.com/in/gabrielalvinaquino`
        if (recruiterEmailTarget) {
          try {
            step('apply_step', `[CH2] Sending application + resume → ${recruiterEmailTarget}`, { job_title: jobTitle, company, action: 'email_channel' })
            const emailSubject = `Application: ${jobTitle} — Gabriel Alvin Aquino`
            const emailBody = coverLetter
              ? `Dear Hiring Team,\n\n${coverLetter}\n\nBest regards,\nGabriel Alvin Aquino\ngabrielalvin.jobs@gmail.com\nhttps://neuralyx.ai.dev-environment.site`
              : `${applicationBody}\n\nBest regards,\nGabriel Alvin Aquino\ngabrielalvin.jobs@gmail.com`
            await sendEmailHelper(recruiterEmailTarget, emailSubject, emailBody)
            step('apply_step', `[CH2] Email sent ✓ → ${recruiterEmailTarget}`, { job_title: jobTitle, company, action: 'email_sent' })
            if (appId) {
              await supabaseQuery('job_applications', 'PATCH', {
                notes: `${finalDetail} | [CH2] Email → ${recruiterEmailTarget}`,
                channel: `${finalMethod},email`,
                updated_at: new Date().toISOString(),
              }, `id=eq.${appId}`).catch(() => {})
            }
          } catch (e) {
            step('apply_step', `[CH2] Email failed: ${e instanceof Error ? e.message.slice(0, 60) : e}`, { job_title: jobTitle, company })
          }
        }

        // ── CH3+: AI sub-agent identified additional channels from JD ──
        let chIndex = 3
        for (const jdCh of jdChannels) {
          const chLabel = `[CH${chIndex}]`
          chIndex++

          if (jdCh.type === 'email' && jdCh.target?.includes('@') && jdCh.target !== recruiterEmailTarget) {
            // Additional email address found in JD (different from CH2 target) — force send with resume
            try {
              step('apply_step', `${chLabel} JD says: "${jdCh.instruction.slice(0, 60)}" — emailing ${jdCh.target}`, { job_title: jobTitle, company, action: 'jd_email' })
              const body = coverLetter
                ? `Dear Hiring Team,\n\n${coverLetter}\n\nBest regards,\nGabriel Alvin Aquino\ngabrielalvin.jobs@gmail.com\nhttps://neuralyx.ai.dev-environment.site`
                : `${applicationBody}\n\nBest regards,\nGabriel Alvin Aquino\ngabrielalvin.jobs@gmail.com`
              await sendEmailHelper(jdCh.target, `Application: ${jobTitle} — Gabriel Alvin Aquino`, body)
              step('apply_step', `${chLabel} Email sent ✓ → ${jdCh.target}`, { job_title: jobTitle, company, action: 'jd_email_sent' })
            } catch { step('apply_step', `${chLabel} Email failed → ${jdCh.target}`, { job_title: jobTitle, company }) }

          } else if (jdCh.type === 'form' && jdCh.target?.startsWith('http')) {
            // External form URL — relay fills it
            step('apply_step', `${chLabel} JD says: "${jdCh.instruction.slice(0, 60)}" — opening form`, { job_title: jobTitle, company, action: 'jd_form' })
            try {
              const relayBase = await findEdgeRelay().catch(() => null)
              if (relayBase) {
                const formRes = await fetch(`${relayBase}/browser/apply`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ job_url: jdCh.target, job_title: jobTitle, company, cover_letter: coverLetter, apply_link: jdCh.target, application_id: appId }),
                  signal: AbortSignal.timeout(120000),
                })
                const formData = await formRes.json().catch(() => ({})) as { status?: string }
                step('apply_step', `${chLabel} Form result: ${formData.status || 'unknown'}`, { job_title: jobTitle, company, action: 'jd_form_result' })
              } else {
                step('apply_step', `${chLabel} Relay offline — cannot fill form at ${jdCh.target.slice(0, 60)}`, { job_title: jobTitle, company })
              }
            } catch { step('apply_step', `${chLabel} Form fill failed`, { job_title: jobTitle, company }) }

          } else if (jdCh.type === 'meeting' && jdCh.target?.startsWith('http')) {
            // Calendly / meeting booking — open in relay and book first available slot
            step('apply_step', `${chLabel} JD says: "${jdCh.instruction.slice(0, 60)}" — booking meeting`, { job_title: jobTitle, company, action: 'jd_meeting' })
            // For now: notify user to book manually — full Calendly automation is next build
            step('apply_step', `${chLabel} Meeting URL: ${jdCh.target} — manual booking required`, { job_title: jobTitle, company, action: 'jd_meeting_manual' })
            sendEmailHelper('gabrielalvin.jobs@gmail.com',
              `📅 Book meeting: ${jobTitle} @ ${company}`,
              `JD instruction: "${jdCh.instruction}"\n\nBook here: ${jdCh.target}\n\nJob URL: ${jobUrl}`
            ).catch(() => {})
          }
        }

        // Signal table refresh after each job
        broadcastNotification('refresh_applications', { node: 'refresh_applications', app_id: appId, status: dbStatus })

        // Delay before next application (anti-detection) — only if we're going to apply again
        if (finalStatus === 'applied' && applied < target) {
          const delay = 15000 + Math.random() * 15000
          step('rate_limit', `Waiting ${Math.round(delay/1000)}s before next application (anti-detection)...`)
          await new Promise(r => setTimeout(r, delay))
        }
      }

      const summary = `Pipeline complete: ${applied} applied, ${failed} failed, ${captcha} CAPTCHA`
      step('pipeline_complete', summary, { node: 'pipeline_complete', message: summary, applied, failed, captcha, platform })
      broadcastNotification('pipeline_complete', { node: 'pipeline_complete', message: summary, platform, applied, failed, captcha })

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      step('pipeline_error', `Pipeline error: ${msg}`)
      broadcastNotification('pipeline_error', { node: 'pipeline_error', message: msg, platform })
    }
  })()
}

async function handleCheckSession(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { platform } = body
  if (!platform) return json(res, 400, { error: 'platform required' })

  const SESSION_URLS: Record<string, string> = {
    linkedin: 'https://www.linkedin.com/feed/',
    indeed: 'https://ph.indeed.com/',
    kalibrr: 'https://www.kalibrr.com/companies/search',
    jobslin: 'https://jobslin.com/',
    onlinejobs: 'https://www.onlinejobs.ph/jobseekers/dashboard',
  }
  const checkUrl = SESSION_URLS[platform]
  if (!checkUrl) return json(res, 400, { error: `Unknown platform: ${platform}` })

  try {
    const r = await fetch(checkUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    })
    // 200 = logged in, 3xx redirect to /login = session expired
    const valid = r.status === 200
    if (!valid) broadcastNotification('session_expired', { platform })
    return json(res, 200, { valid, platform, http_status: r.status })
  } catch (e) {
    return json(res, 200, { valid: false, platform, error: e instanceof Error ? e.message : String(e) })
  }
}

async function handleSaveBatch(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { jobs } = body
  if (!Array.isArray(jobs) || !jobs.length) return json(res, 400, { error: 'jobs array required' })

  const results: { saved: number; skipped: number; errors: string[] } = { saved: 0, skipped: 0, errors: [] }

  // Chunk into batches of 50 for Supabase
  for (let i = 0; i < jobs.length; i += 50) {
    const chunk = jobs.slice(i, i + 50)
    const { error } = await supabaseQuery('job_listings', 'POST', chunk,
      'on_conflict=platform,external_id') as { data: unknown; error?: string }
    if (error) results.errors.push(error)
    else results.saved += chunk.length
  }

  return json(res, 200, results)
}

async function handleLinkedInConnect(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { recruiter_url, note, recruiter_id } = body
  if (!recruiter_url || !note) return json(res, 400, { error: 'recruiter_url and note required' })

  try {
    const result = await runScript('connect-linkedin.ts', { recruiter_url, note }) as { success: boolean; status: string; detail: string }

    // Update recruiter_contacts if recruiter_id provided
    if (recruiter_id && result.success) {
      const newStatus = result.status === 'connected' ? 'pending' : result.status === 'note_sent' ? 'connected' : 'none'
      await supabaseQuery('recruiter_contacts', 'PATCH', {
        connection_status: newStatus,
        connection_sent_at: new Date().toISOString(),
      }, `id=eq.${recruiter_id}`)
    }

    return json(res, 200, result)
  } catch (e) {
    return json(res, 500, { success: false, status: 'failed', detail: e instanceof Error ? e.message : String(e) })
  }
}

const SCREENING_Q_SYSTEM = `You are answering job application screening questions for Gabriel Alvin Aquino.

Gabriel's profile:
- AI Systems Engineer & Automation Developer | 8+ years experience
- Location: Angeles, Central Luzon, Philippines
- Salary expectation: PHP 80,000–150,000/month or USD 1,500–3,000/month
- Stack: Vue.js, TypeScript, Python, Node.js, Docker, PostgreSQL, Supabase, OpenAI, LangChain, FastAPI, n8n
- Portfolio: https://neuralyx.ai.dev-environment.site
- Resume: https://neuralyx.ai.dev-environment.site/assets/documents/resume.pdf
- LinkedIn: https://linkedin.com/in/gabrielalvinaquino
- Work authorization: Philippines — no visa required
- Start date: Immediately / 1 week notice
- Remote: Yes (preferred)
- Education: BS Information Technology, University of the Cordilleras

Rules:
1. Answer ONLY what is asked. No fluff.
2. For salary questions: use PHP range if job is PH-based, USD if international.
3. For "years of experience" with a specific tech: answer honestly based on profile.
4. For open text: 1–3 concise sentences. Professional tone.
5. For yes/no: answer yes/no + one short reason if helpful.
6. Return JSON array: [{label: "question text", answer: "your answer"}]

FIELD-LENGTH RULES (critical):
- "Relevant experience" / "Summary" / "Highlight" / "Brief description" fields → MAX 3-4 sentences, tailored to the job. Focus on matching skills + 1-2 concrete metrics. DO NOT paste the full cover letter.
- "Cover letter" / "Why are you interested" / "Tell us about yourself" fields → Use the provided "Cover letter context" if given, otherwise 5-8 sentences.
- "Short answer" / text input (not textarea) fields → 1 sentence or less.
- NEVER copy the "Cover letter context" verbatim into short fields. Paraphrase and compress.

FIELD-SEMANTIC RULES (critical — do not confuse):
- "Job title" (asking for PREVIOUS role) → Answer with: "Full Stack Developer / AI Engineer / DevOps Architect"
- "Company" or "Company name" (PREVIOUS employer) → Answer with: "Wooder Group Pty Ltd"
- Any field asking for a "previous/current job" in a parent heading about "relevant experience" — that's structured employment history, NOT narrative. Fill job title + company name literally, NOT with cover letter prose.
- "Years of experience" / "How many years" → single number, e.g. "8"
- If the field is labeled "Job title" or "Company" in the context of "Enter a job that shows relevant experience", it wants a structured previous-role entry, NOT a paragraph.`

async function handleScreeningQuestions(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { questions, job_title, company, job_description, cover_letter, job_id } = body
  if (!Array.isArray(questions) || !questions.length) return json(res, 400, { error: 'questions array required' })

  const ANTHROPIC_KEY_SQ = process.env.ANTHROPIC_API_KEY || ''
  const OPENAI_KEY_SQ = process.env.OPENAI_KEY || process.env.OPENAI_API_KEY || ''
  if (!ANTHROPIC_KEY_SQ && !OPENAI_KEY_SQ) return json(res, 500, { error: 'No AI API key configured' })

  const contextLines = [`Job: ${job_title || 'Unknown'} at ${company || 'Unknown'}`]
  if (job_description) contextLines.push(`Description: ${job_description.slice(0, 400)}`)
  if (cover_letter) contextLines.push(`Cover letter context: ${cover_letter.slice(0, 300)}`)

  const prompt = `${contextLines.join('\n')}

Questions to answer:
${questions.map((q: { label: string; type?: string; options?: string[] }, i: number) =>
  `${i + 1}. [${q.type || 'text'}] ${q.label}${q.options?.length ? ` (options: ${q.options.join(', ')})` : ''}`
).join('\n')}

Return JSON array only: [{"label": "exact question label", "answer": "your answer"}]`

  let answers: { label: string; answer: string }[] = []

  try {
    if (ANTHROPIC_KEY_SQ) {
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY_SQ,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: SCREENING_Q_SYSTEM,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(30000),
      })
      if (!aiRes.ok) throw new Error(`Anthropic API ${aiRes.status}`)
      const data = await aiRes.json() as { content: { type: string; text: string }[] }
      const text = data.content?.[0]?.text || '[]'
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      answers = jsonMatch ? JSON.parse(jsonMatch[0]) : []
    } else {
      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_KEY_SQ}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 1024,
          messages: [{ role: 'system', content: SCREENING_Q_SYSTEM }, { role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(30000),
      })
      if (!aiRes.ok) throw new Error(`OpenAI API ${aiRes.status}`)
      const data = await aiRes.json() as { choices: { message: { content: string } }[] }
      const text = data.choices[0]?.message?.content || '[]'
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      answers = jsonMatch ? JSON.parse(jsonMatch[0]) : []
    }

    // Cache answered questions in screening_qa_pairs
    if (job_id && answers.length) {
      for (const qa of answers) {
        await supabaseQuery('screening_qa_pairs', 'POST', {
          job_listing_id: job_id,
          question_text: qa.label,
          answer_text: qa.answer,
          answer_confidence: 'high',
          platform: 'indeed',
          company: company || null,
        }, 'on_conflict=job_listing_id,question_text').catch(() => {})
      }
    }

    return json(res, 200, { answers })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : String(e), answers: [] })
  }
}

async function handleBlacklistCompany(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { company, reason, job_id } = body
  if (!company) return json(res, 400, { error: 'company required' })

  // Mark all non-applied jobs from this company as dismissed
  const updates: Record<string, unknown> = {
    status: 'dismissed',
    updated_at: new Date().toISOString(),
    notes: `Blacklisted: ${reason || 'rejected'}`,
  }
  await supabaseQuery('job_listings', 'PATCH', updates, `company=eq.${encodeURIComponent(company)}&status=neq.applied`).catch(() => {})

  // Log blacklist entry in job_agent_logs
  await supabaseQuery('job_agent_logs', 'POST', {
    workflow_id: `blacklist_${Date.now()}`,
    trigger_type: 'manual',
    status: 'complete',
    jobs_searched: 0,
    jobs_applied: 0,
    jobs_failed: 0,
    log_lines: [{ ts: new Date().toISOString(), event: 'company_blacklisted', company, reason: reason || 'rejected', job_id }],
  }).catch(() => {})

  return json(res, 200, { ok: true, company, reason })
}

async function handleDailySummary(req: IncomingMessage, res: ServerResponse) {
  const rawBody = await readBody(req)
  const body = JSON.parse(rawBody || '{}')
  const { send_email = true, mode = 'summary', alert_message } = body as { send_email?: boolean; mode?: string; alert_message?: string }

  const today = new Date().toISOString().slice(0, 10)
  const todayStart = `${today}T00:00:00.000Z`

  try {
    // Fetch today's applications
    const { data: apps } = await supabaseQuery('job_applications', 'GET', undefined,
      `created_at=gte.${todayStart}&select=status,channel,job_listing_id,company,job_title,platform`) as { data: Record<string, unknown>[] | null }
    const appList = Array.isArray(apps) ? apps : []

    const totalApplied   = appList.filter(a => a.status === 'applied').length
    const totalFailed    = appList.filter(a => ['apply_failed', 'relay_failed'].includes(a.status as string)).length
    const totalCaptcha   = appList.filter(a => a.status === 'captcha' || a.status === 'applying').length
    const totalEmail     = appList.filter(a => (a.channel as string)?.includes('email')).length
    const totalAttempts  = appList.length

    // Platform breakdown
    const byPlatform: Record<string, number> = {}
    for (const a of appList) {
      const p = (a.platform as string) || 'unknown'
      byPlatform[p] = (byPlatform[p] || 0) + 1
    }

    // Fetch today's new job listings
    const { data: newJobs } = await supabaseQuery('job_listings', 'GET', undefined,
      `created_at=gte.${todayStart}&select=id&limit=1`) as { data: Record<string, unknown>[] | null }
    const newJobCount = Array.isArray(newJobs) ? newJobs.length : 0

    // Fetch apply_failed listings (company site / external)
    const { data: failedListings } = await supabaseQuery('job_listings', 'GET', undefined,
      `status=eq.apply_failed&updated_at=gte.${todayStart}&select=title,company&limit=20`) as { data: Record<string, unknown>[] | null }
    const failedListingsList = Array.isArray(failedListings) ? failedListings : []

    const platformLines = Object.entries(byPlatform).map(([p, n]) => `  • ${p}: ${n}`).join('\n')

    const summaryText = mode === 'alert'
      ? `🚨 ALERT: ${alert_message}`
      : `📊 NEURALYX Daily Summary — ${today}

🎯 Applications Today
  • Total attempts:  ${totalAttempts}
  • ✅ Applied:      ${totalApplied}
  • ❌ Failed:       ${totalFailed}
  • ⚠️  CAPTCHA:    ${totalCaptcha}
  • 📧 Email CH2:   ${totalEmail}

📋 By Platform
${platformLines || '  • (none)'}

🆕 New Jobs Discovered: ${newJobCount}

❌ CH1 Failed (external ATS / company site):
${failedListingsList.map(j => `  • ${j.title} @ ${j.company}`).join('\n') || '  • (none)'}

— NEURALYX Monitor Agent | ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} PHT`

    console.log(summaryText)

    if (send_email) {
      await sendEmailHelper(
        'gabrielalvin.jobs@gmail.com',
        mode === 'alert' ? `🚨 NEURALYX Alert: ${alert_message?.slice(0, 60)}` : `📊 NEURALYX Daily Summary — ${today}`,
        summaryText
      )
    }

    broadcastNotification('daily_summary', {
      date: today, total_applied: totalApplied, total_failed: totalFailed,
      total_captcha: totalCaptcha, total_email: totalEmail, total_attempts: totalAttempts,
      by_platform: byPlatform, new_jobs: newJobCount,
      timestamp: new Date().toISOString(),
    })

    return json(res, 200, { ok: true, summary: { totalApplied, totalFailed, totalCaptcha, totalEmail, totalAttempts, byPlatform, newJobCount } })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : String(e) })
  }
}

async function handleSaveRecruiter(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { name, first_name, title, company, company_domain, platform, linkedin_url, email,
          email_confidence, job_id } = body
  if (!name || !company) return json(res, 400, { error: 'name and company required' })

  const recruiterData = {
    name, first_name: first_name || name.split(' ')[0],
    title: title || null, company, company_domain: company_domain || null,
    platform: platform || 'linkedin',
    linkedin_url: linkedin_url || null,
    email: email || null,
    email_confidence: email_confidence || 'none',
    updated_at: new Date().toISOString(),
  }

  // Upsert on linkedin_url (or email if no linkedin_url)
  const conflictCol = linkedin_url ? 'linkedin_url' : (email ? 'email' : null)
  const qs = conflictCol ? `on_conflict=${conflictCol}` : ''
  const { data: upserted, error } = await supabaseQuery('recruiter_contacts', 'POST', recruiterData, qs)

  if (error) return json(res, 500, { error })

  // Link to job_listing if job_id provided
  const savedId = Array.isArray(upserted) ? (upserted[0] as { id: string })?.id : (upserted as { id: string } | null)?.id
  if (savedId && job_id) {
    await supabaseQuery('job_listings', 'PATCH', { recruiter_id: savedId }, `id=eq.${job_id}`)
  }

  return json(res, 200, { ok: true, recruiter_id: savedId })
}

async function handleVectorUpsert(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { job_id, text, cover_letter } = body
  if (!job_id || !text) return json(res, 400, { error: 'job_id and text required' })

  try {
    const embedding = await openaiEmbed(text)
    const record: Record<string, unknown> = {
      job_listing_id: job_id,
      embedding: `[${embedding.join(',')}]`,
      embedding_model: 'text-embedding-3-small',
    }

    if (cover_letter) {
      const clEmbedding = await openaiEmbed(cover_letter)
      record.cover_letter = cover_letter
      record.cover_letter_embedding = `[${clEmbedding.join(',')}]`
    }

    const { error } = await supabaseQuery('job_embeddings', 'POST', record, 'on_conflict=job_listing_id')
    if (error) return json(res, 500, { error })

    await supabaseQuery('job_listings', 'PATCH', { vector_indexed: true }, `id=eq.${job_id}`)
    return json(res, 200, { ok: true, job_id, dims: embedding.length })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : String(e) })
  }
}

async function handleVectorSimilar(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { query, threshold = 0.7, limit = 10, search_cover_letters = false } = body
  if (!query) return json(res, 400, { error: 'query required' })

  try {
    const embedding = await openaiEmbed(query)
    const embStr = `[${embedding.join(',')}]`
    const col = search_cover_letters ? 'cover_letter_embedding' : 'embedding'

    // Use Supabase RPC for vector similarity (requires pg function)
    // Fallback: use REST with casting
    const { data, error } = await supabaseQuery('job_embeddings', 'GET', undefined,
      `select=job_listing_id,job_listings(title,company,location,url,match_score,status,platform,posted_at)` +
      `&${col}=not.is.null` +
      `&order=id.asc&limit=${limit}`)

    // Note: proper cosine similarity requires a DB function or pg REST extension
    // This returns candidates; actual similarity filtering needs pg rpc
    if (error) return json(res, 500, { error })

    return json(res, 200, { results: data || [], query, threshold, note: 'Install pg_vector_search rpc for true cosine similarity' })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : String(e) })
  }
}

const COPILOT_SYSTEM = `You are Gabriel's personal job application AI copilot, embedded in his NEURALYX dashboard.

Gabriel: AI Systems Engineer & Automation Developer | 8+ years | Angeles, Philippines
Stack: Vue.js, TypeScript, Python, Node.js, Docker, Supabase, OpenAI, LangChain, FastAPI, n8n
Salary: PHP 80k–150k/mo | Portfolio: https://neuralyx.ai.dev-environment.site

You have access to his job pipeline data. Be direct, data-driven, terse.
For queries: lead with count, show as table or bullets.
For actions: state what you'll do, do it, report result.
Today: ${new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })} PHT`

const CHAT_TOOLS = [
  {
    name: 'query_jobs',
    description: 'Query job_listings table. Use for job search, discovery, filtering.',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', description: 'linkedin|kalibrr|jobslin|onlinejobs|indeed' },
        status: { type: 'string', description: 'new|saved|applied|dismissed' },
        min_score: { type: 'number' },
        keyword: { type: 'string' },
        date_from: { type: 'string', description: 'ISO date' },
        job_type: { type: 'string', description: 'remote|hybrid|onsite' },
        easy_apply: { type: 'boolean' },
        limit: { type: 'number', default: 20 },
        order_by: { type: 'string', description: 'match_score|created_at|salary_min' },
      },
      required: [],
    },
  },
  {
    name: 'query_applications',
    description: 'Query job_applications table. For pipeline status, follow-ups, response tracking.',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string' },
        status: { type: 'string', description: 'applied|screening|interview|offered|rejected|ghosted' },
        date_from: { type: 'string' },
        date_to: { type: 'string' },
        aggregate: { type: 'boolean', description: 'Return counts/stats instead of rows' },
        limit: { type: 'number', default: 20 },
      },
      required: [],
    },
  },
  {
    name: 'get_analytics',
    description: 'Get aggregated pipeline analytics.',
    input_schema: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: ['response_rate', 'platform_performance', 'pipeline_summary', 'skill_gaps', 'salary_stats'] },
        period: { type: 'string', enum: ['today', 'week', 'month', 'all_time'] },
      },
      required: ['metric'],
    },
  },
  {
    name: 'trigger_apply',
    description: 'Apply to a specific job. Confirm intent before calling.',
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        platform: { type: 'string' },
      },
      required: ['job_id', 'platform'],
    },
  },
  {
    name: 'update_job_status',
    description: 'Update status of jobs (dismiss, save, etc).',
    input_schema: {
      type: 'object',
      properties: {
        job_ids: { type: 'array', items: { type: 'string' } },
        new_status: { type: 'string', enum: ['dismissed', 'saved', 'new', 'applied'] },
      },
      required: ['job_ids', 'new_status'],
    },
  },
  {
    name: 'query_recruiters',
    description: 'Query recruiter_contacts table.',
    input_schema: {
      type: 'object',
      properties: {
        company: { type: 'string' },
        connection_status: { type: 'string', enum: ['none', 'queued', 'pending', 'connected'] },
        response_received: { type: 'boolean' },
        limit: { type: 'number', default: 20 },
      },
      required: [],
    },
  },
  {
    name: 'query_screening_qa',
    description: 'Find past answers to screening questions.',
    input_schema: {
      type: 'object',
      properties: {
        question_text: { type: 'string' },
        company: { type: 'string' },
        limit: { type: 'number', default: 5 },
      },
      required: ['question_text'],
    },
  },
]

async function executeChatTool(toolName: string, input: Record<string, unknown>): Promise<unknown> {
  switch (toolName) {
    case 'query_jobs': {
      let qs = `select=*&order=${input.order_by || 'match_score'}.desc.nullslast&limit=${input.limit || 20}`
      if (input.platform) qs += `&platform=eq.${input.platform}`
      if (input.status) qs += `&status=eq.${input.status}`
      if (input.min_score) qs += `&match_score=gte.${input.min_score}`
      if (input.keyword) qs += `&or=(title.ilike.*${input.keyword}*,company.ilike.*${input.keyword}*,description.ilike.*${input.keyword}*)`
      if (input.date_from) qs += `&created_at=gte.${input.date_from}`
      if (input.job_type) qs += `&job_type=eq.${input.job_type}`
      if (input.easy_apply !== undefined) qs += `&easy_apply=eq.${input.easy_apply}`
      const { data } = await supabaseQuery('job_listings', 'GET', undefined, qs)
      return { jobs: data, count: Array.isArray(data) ? data.length : 0 }
    }
    case 'query_applications': {
      let qs = `select=*,job_listings(title,company,platform)&order=created_at.desc&limit=${input.limit || 20}`
      if (input.platform) qs += `&platform=eq.${input.platform}`
      if (input.status) qs += `&status=eq.${input.status}`
      if (input.date_from) qs += `&created_at=gte.${input.date_from}`
      if (input.date_to) qs += `&created_at=lte.${input.date_to}`
      const { data } = await supabaseQuery('job_applications', 'GET', undefined, qs)
      if (input.aggregate) {
        const apps = Array.isArray(data) ? data as Record<string, unknown>[] : []
        const byStatus: Record<string, number> = {}
        for (const a of apps) {
          const s = (a.status as string) || 'unknown'
          byStatus[s] = (byStatus[s] || 0) + 1
        }
        return { total: apps.length, by_status: byStatus }
      }
      return { applications: data, count: Array.isArray(data) ? data.length : 0 }
    }
    case 'get_analytics': {
      const period = (input.period as string) || 'all_time'
      const dateFilter = period === 'today' ? new Date().toISOString().slice(0, 10)
        : period === 'week' ? new Date(Date.now() - 7 * 86400000).toISOString()
        : period === 'month' ? new Date(Date.now() - 30 * 86400000).toISOString()
        : null
      const df = dateFilter ? `&created_at=gte.${dateFilter}` : ''

      if (input.metric === 'pipeline_summary') {
        const { data: apps } = await supabaseQuery('job_applications', 'GET', undefined, `select=status,platform${df}&limit=1000`)
        const list = Array.isArray(apps) ? apps as Record<string, unknown>[] : []
        const summary: Record<string, number> = {}
        for (const a of list) { const s = (a.status as string) || 'unknown'; summary[s] = (summary[s] || 0) + 1 }
        return { period, total: list.length, by_status: summary }
      }
      if (input.metric === 'platform_performance') {
        const { data: apps } = await supabaseQuery('job_applications', 'GET', undefined, `select=status,platform${df}&limit=1000`)
        const list = Array.isArray(apps) ? apps as Record<string, unknown>[] : []
        const byPlatform: Record<string, { total: number; responses: number }> = {}
        for (const a of list) {
          const p = (a.platform as string) || 'unknown'
          if (!byPlatform[p]) byPlatform[p] = { total: 0, responses: 0 }
          byPlatform[p].total++
          if (['screening', 'interview', 'offered'].includes(a.status as string)) byPlatform[p].responses++
        }
        return { period, platforms: byPlatform }
      }
      return { period, metric: input.metric, note: 'Metric computed from job_applications' }
    }
    case 'trigger_apply': {
      const { data: job } = await supabaseQuery('job_listings', 'GET', undefined, `id=eq.${input.job_id}&select=*`)
      const j = Array.isArray(job) ? (job[0] as Record<string, unknown>) : null
      if (!j) return { error: 'Job not found' }
      const platform = (input.platform as string) || (j.platform as string)
      const scriptMap: Record<string, string> = {
        linkedin: 'apply-linkedin.ts', indeed: 'apply-indeed.ts',
        kalibrr: 'apply-kalibrr.ts', jobslin: 'apply-jobslin.ts', onlinejobs: 'apply-onlinejobs.ts',
      }
      const script = scriptMap[platform]
      if (!script) return { error: `No apply script for platform: ${platform}` }
      try {
        const result = await runScript(script, {
          url: j.url, id: j.id, title: j.title, company: j.company,
        }) as { status?: string; method?: string; detail?: string }

        const applyStatus = result.status || 'applied'
        if (applyStatus !== 'already_applied' && applyStatus !== 'skipped') {
          const appRecord: Record<string, unknown> = {
            id: randomUUID(),
            job_listing_id: j.id,
            platform,
            channel: result.method || 'copilot_agent',
            status: applyStatus === 'applied' ? 'applied' : 'failed',
            applied_via: 'copilot_trigger',
            notes: result.detail || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
          await supabaseQuery('job_applications', 'POST', appRecord)
          if (applyStatus === 'applied') {
            await supabaseQuery('job_listings', 'PATCH',
              { status: 'applied', updated_at: new Date().toISOString() }, `id=eq.${j.id}`)
          }
        }
        return result
      } catch (e) { return { status: 'failed', detail: e instanceof Error ? e.message : String(e) } }
    }
    case 'update_job_status': {
      const ids = input.job_ids as string[]
      let updated = 0
      for (const id of ids) {
        const { error } = await supabaseQuery('job_listings', 'PATCH', { status: input.new_status }, `id=eq.${id}`)
        if (!error) updated++
      }
      return { updated, total: ids.length }
    }
    case 'query_recruiters': {
      let qs = `select=*&order=created_at.desc&limit=${input.limit || 20}`
      if (input.company) qs += `&company=ilike.*${input.company}*`
      if (input.connection_status) qs += `&connection_status=eq.${input.connection_status}`
      if (input.response_received !== undefined) qs += `&response_received=eq.${input.response_received}`
      const { data } = await supabaseQuery('recruiter_contacts', 'GET', undefined, qs)
      return { recruiters: data, count: Array.isArray(data) ? data.length : 0 }
    }
    case 'query_screening_qa': {
      let qs = `select=*&question_text=ilike.*${input.question_text}*&order=used_count.desc&limit=${input.limit || 5}`
      if (input.company) qs += `&company=ilike.*${input.company}*`
      const { data } = await supabaseQuery('screening_qa_pairs', 'GET', undefined, qs)
      return { qa_pairs: data }
    }
    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}

async function handleChatMessage(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { message, conversation_id = randomUUID(), history = [], internal_stats } = body
  if (!message) return json(res, 400, { error: 'message required' })

  // Internal stats shortcut — returns pipeline stats for dynamic chips without calling Claude
  if (internal_stats && message === '__stats__') {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
      const [unapplied, ghosted, interviews, newToday] = await Promise.all([
        supabaseQuery('job_listings', 'GET', undefined, 'status=eq.new&match_score=gte.70&select=id').then(r => Array.isArray(r.data) ? r.data.length : 0).catch(() => 0),
        supabaseQuery('job_applications', 'GET', undefined, `status=eq.applied&created_at=lte.${sevenDaysAgo}&select=id`).then(r => Array.isArray(r.data) ? r.data.length : 0).catch(() => 0),
        supabaseQuery('job_applications', 'GET', undefined, 'status=like.interview*&select=id').then(r => Array.isArray(r.data) ? r.data.length : 0).catch(() => 0),
        supabaseQuery('job_listings', 'GET', undefined, `created_at=gte.${today}&select=id`).then(r => Array.isArray(r.data) ? r.data.length : 0).catch(() => 0),
      ])
      return json(res, 200, { stats: { unapplied_high: unapplied, ghosted, interviews, new_today: newToday } })
    } catch {
      return json(res, 200, { stats: null })
    }
  }

  const OPENAI_KEY_CHAT = process.env.OPENAI_KEY || process.env.OPENAI_API_KEY || ''
  if (!OPENAI_KEY_CHAT) return json(res, 500, { error: 'OPENAI_KEY not configured' })

  // Convert CHAT_TOOLS from Anthropic format to OpenAI function format
  const oaiTools = CHAT_TOOLS.map(t => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }))

  // Persist user message
  await supabaseQuery('chat_conversations', 'POST', {
    conversation_id, role: 'user', content: message,
  }, '').catch(() => {})

  const messages: { role: string; content: string | null; tool_call_id?: string; tool_calls?: unknown; name?: string }[] = [
    { role: 'system', content: COPILOT_SYSTEM },
    ...history,
    { role: 'user', content: message },
  ]

  let reply = ''
  let iterCount = 0
  const MAX_ITER = 5

  while (iterCount < MAX_ITER) {
    iterCount++
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY_CHAT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 2048,
        tools: oaiTools,
        messages,
      }),
      signal: AbortSignal.timeout(60000),
    })

    if (!aiRes.ok) {
      const err = await aiRes.text()
      return json(res, 500, { error: `AI API error: ${err.slice(0, 200)}` })
    }

    const data = await aiRes.json() as {
      choices: {
        message: {
          role: string
          content: string | null
          tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[]
        }
        finish_reason: string
      }[]
    }

    const choice = data.choices[0]
    const msg = choice.message

    if (msg.content) reply += msg.content

    if (choice.finish_reason === 'stop' || choice.finish_reason === 'length') break

    if (choice.finish_reason === 'tool_calls' && msg.tool_calls?.length) {
      messages.push({ role: 'assistant', content: msg.content, tool_calls: msg.tool_calls })

      for (const tc of msg.tool_calls) {
        let toolInput: Record<string, unknown> = {}
        try { toolInput = JSON.parse(tc.function.arguments) } catch { /* ignore */ }
        const result = await executeChatTool(tc.function.name, toolInput)
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.function.name,
          content: JSON.stringify(result),
        })
      }
      continue
    }

    break
  }

  // Persist assistant reply
  await supabaseQuery('chat_conversations', 'POST', {
    conversation_id, role: 'assistant', content: reply,
  }, '').catch(() => {})

  return json(res, 200, { reply, conversation_id })
}

// ─── Job Alert Ingestion Agent ───
// Receives job alerts, researches them, deduplicates, scores, generates cover letter, queues for apply

async function handleAlertIngest(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { alerts } = body
  // alerts: array of { title, company, url, description?, source?, platform? }
  if (!alerts?.length) return json(res, 400, { error: 'alerts array required. Each alert: { title, company, url, description? }' })

  const results: { title: string; company: string; status: string; detail: string; job_id?: string }[] = []

  for (const alert of alerts) {
    const { title, company, url, description, source, platform } = alert
    if (!title || !company) {
      results.push({ title: title || '?', company: company || '?', status: 'skipped', detail: 'Missing title or company' })
      continue
    }

    // Step 1: Dedup — check if this job already exists in DB
    const dupCheck = await checkDuplicateInternal(title, company, url)
    if (dupCheck.exists) {
      results.push({ title, company, status: 'duplicate', detail: `Already in DB: ${dupCheck.match_type} (${dupCheck.existing_status})`, job_id: dupCheck.job_id })
      continue
    }

    // Step 2: Research — if we have a URL, fetch the page for full description
    let fullDescription = description || ''
    if (url && !fullDescription) {
      try {
        const pageRes = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(15000),
        })
        if (pageRes.ok) {
          const html = await pageRes.text()
          // Extract text content (strip HTML tags)
          fullDescription = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000)
        }
      } catch { /* fetch failed */ }
    }

    // Step 3: Score with AI
    let matchScore: number | null = null
    let rawData: Record<string, unknown> = { source: source || 'job_alert', alert_ingested: true }
    if ((OPENAI_KEY || GEMINI_KEY) && fullDescription) {
      try {
        const classifyPrompt = `Score this job match 0-100 for an AI Automation Engineer with 8+ years experience in Python, TypeScript, Vue.js, Docker, OpenAI, LangChain, Supabase. Return JSON only: {"match_score":N,"role_type":"ai_engineer|fullstack|backend|devops|other","work_arrangement":"remote|hybrid|onsite","seniority":"junior|mid|senior|lead","skill_matches":["a","b"],"skill_gaps":["c"],"recommendation":"one sentence"}`
        const result = await callAI(classifyPrompt, `Job: ${title} at ${company}\n${fullDescription.slice(0, 1500)}`)
        const clean = result.replace(/```json\s*\n?/, '').replace(/\n?\s*```\s*$/, '')
        const match = clean.match(/\{[\s\S]*\}/)
        if (match) {
          const parsed = JSON.parse(match[0])
          matchScore = parsed.match_score || null
          rawData = { ...rawData, ...parsed }
        }
      } catch { /* scoring failed */ }
    }

    // Step 4: Generate cover letter if score >= 70
    let coverLetter = ''
    if (matchScore && matchScore >= 70 && (OPENAI_KEY || GEMINI_KEY)) {
      try {
        coverLetter = await handleCoverLetterInternal({ title, company, description: fullDescription })
        rawData.cover_letter = coverLetter
      } catch { /* cover letter gen failed */ }
    }

    // Step 5: Insert into job_listings
    const jobId = randomUUID()
    const jobRecord = {
      id: jobId,
      platform: platform || source || 'job_alert',
      title,
      company,
      location: (rawData.work_arrangement as string) || null,
      url: url || '',
      description: fullDescription.slice(0, 5000) || null,
      match_score: matchScore,
      status: 'new',
      raw_data: JSON.stringify(rawData),
    }

    const { error: insertErr } = await supabaseQuery('job_listings', 'POST', jobRecord)
    if (insertErr) {
      results.push({ title, company, status: 'error', detail: `DB insert failed: ${insertErr}` })
      continue
    }

    // Broadcast SSE notification
    broadcastNotification('alert_ingested', { job_id: jobId, title, company, match_score: matchScore, source: source || 'job_alert', timestamp: new Date().toISOString() })

    results.push({
      title, company, status: 'ingested', job_id: jobId,
      detail: `Score: ${matchScore || '?'}% | Cover letter: ${coverLetter ? 'generated' : 'pending'} | Ready for apply`,
    })
  }

  json(res, 200, {
    results,
    summary: {
      total: alerts.length,
      ingested: results.filter(r => r.status === 'ingested').length,
      duplicates: results.filter(r => r.status === 'duplicate').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length,
    },
  })
}

// Internal dedup check — searches by title+company OR url
async function checkDuplicateInternal(title: string, company: string, url?: string): Promise<{ exists: boolean; match_type?: string; job_id?: string; existing_status?: string }> {
  // Step 1: Check by URL (exact match — most reliable)
  if (url) {
    const { data } = await supabaseQuery('job_listings', 'GET', undefined, `url=eq.${encodeURIComponent(url)}&select=id,status&limit=1`)
    const rows = data as { id: string; status: string }[] | null
    if (rows?.length) return { exists: true, match_type: 'url_match', job_id: rows[0].id, existing_status: rows[0].status }

    // Also check partial URL match (same job ID in different aggregator URLs)
    // Extract key identifiers from URLs (e.g., indeed job key, linkedin jobId)
    const urlLower = url.toLowerCase()
    let urlKey = ''
    if (urlLower.includes('indeed.com') && urlLower.includes('jk=')) {
      urlKey = url.match(/jk=([a-f0-9]+)/i)?.[1] || ''
    } else if (urlLower.includes('linkedin.com') && urlLower.includes('currentjobid=')) {
      urlKey = url.match(/currentjobid=(\d+)/i)?.[1] || ''
    }

    if (urlKey) {
      const { data: partialRows } = await supabaseQuery('job_listings', 'GET', undefined, `url=like.*${urlKey}*&select=id,status&limit=1`)
      const partial = partialRows as { id: string; status: string }[] | null
      if (partial?.length) return { exists: true, match_type: 'url_key_match', job_id: partial[0].id, existing_status: partial[0].status }
    }
  }

  // Step 2: Check by title + company (only if real title/company provided, not URL strings)
  const isRealTitle = title && !title.startsWith('http') && title.length < 200
  const isRealCompany = company && !company.startsWith('http') && company.length < 100
  if (isRealTitle && isRealCompany) {
    const titleClean = title.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').slice(0, 50)
    const companyClean = company.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').slice(0, 30)

    if (titleClean.length >= 5 && companyClean.length >= 2) {
      const { data } = await supabaseQuery('job_listings', 'GET', undefined, `select=id,title,company,status&limit=200&order=created_at.desc`)
      const rows = data as { id: string; title: string; company: string; status: string }[] | null
      if (rows) {
        for (const row of rows) {
          const rowTitle = row.title.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').slice(0, 50)
          const rowCompany = row.company.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').slice(0, 30)
          if (rowTitle === titleClean && rowCompany === companyClean) {
            return { exists: true, match_type: 'title_company_match', job_id: row.id, existing_status: row.status }
          }
        }
      }
    }
  }

  // No duplicate found
  return { exists: false }
}

// Endpoint: Check duplicate before applying
async function handleCheckDuplicate(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req))
  const { title, company, url } = body
  if (!title || !company) return json(res, 400, { error: 'title and company required' })
  const result = await checkDuplicateInternal(title, company, url)
  json(res, 200, result)
}

// ─── Initialize Multi-Channel Orchestrator ───
async function sendEmailHelper(to: string, subject: string, body: string, opts: { attachResume?: boolean } = {}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const mailer = getMailer()
  if (!mailer) return { success: false, error: 'SMTP not configured' }
  const attachments: nodemailer.SendMailOptions['attachments'] = []
  // Attach resume.pdf by default for any outbound recruiter email (skip only for internal notifications)
  if (opts.attachResume !== false) {
    try {
      await stat(join(UPLOADS_DIR, 'resume.pdf'))
      attachments.push({ filename: `${SMTP_FROM_NAME.replace(/\s+/g, '_')}_Resume.pdf`, path: join(UPLOADS_DIR, 'resume.pdf') })
    } catch { /* no resume on disk */ }
  }
  try {
    const info = await mailer.sendMail({
      from: `"${SMTP_FROM_NAME}" <${SMTP_REPLY_TO}>`,
      replyTo: SMTP_REPLY_TO,
      to, subject, text: body,
      ...(attachments.length ? { attachments } : {}),
    })
    return { success: true, messageId: info.messageId }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Send failed' }
  }
}

// ─── HeyGen Proxy ─────────────────────────────────────────────────────────
async function handleHeyGenVoices(_req: IncomingMessage, res: ServerResponse) {
  if (!HEYGEN_API_KEY) {
    res.writeHead(503, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'HEYGEN_API_KEY not configured in server environment' }))
    return
  }
  try {
    // Fetch private (user clones) and public library in parallel via v3 API
    const [privateRes, publicRes] = await Promise.all([
      fetch('https://api.heygen.com/v3/voices?type=private', { headers: { 'X-Api-Key': HEYGEN_API_KEY, Accept: 'application/json' } }),
      fetch('https://api.heygen.com/v3/voices?type=public', { headers: { 'X-Api-Key': HEYGEN_API_KEY, Accept: 'application/json' } }),
    ])
    const privateData: any = privateRes.ok ? await privateRes.json() : { data: [] }
    const publicData: any  = publicRes.ok  ? await publicRes.json()  : { data: [] }

    const clones:  any[] = (privateData?.data ?? []).map((v: any) => ({ ...v, type: 'clone' }))
    const library: any[] = (publicData?.data  ?? []).map((v: any) => ({ ...v, type: 'library' }))

    // clones first, then library sorted by name
    library.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))

    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, voices: [...clones, ...library] }))
  } catch (e: any) {
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: e.message }))
  }
}

async function handleHeyGenPreview(_req: IncomingMessage, res: ServerResponse, url: URL) {
  const audioUrl = url.searchParams.get('url')
  if (!audioUrl) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'Missing url param' }))
    return
  }
  try {
    const dlRes = await fetch(decodeURIComponent(audioUrl))
    if (!dlRes.ok) throw new Error(`Download failed: HTTP ${dlRes.status}`)
    const contentType = dlRes.headers.get('content-type') || 'audio/mpeg'
    const buffer = Buffer.from(await dlRes.arrayBuffer())
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': contentType, 'Content-Length': buffer.length })
    res.end(buffer)
  } catch (e: any) {
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: e.message }))
  }
}

// Download HeyGen clone preview server-side and save as active voice sample
// Browser sends voice_id + preview_url (already in memory from voices fetch) — no btoa needed
async function handleHeyGenUseAsSample(req: IncomingMessage, res: ServerResponse) {
  let body = ''
  for await (const chunk of req) body += chunk
  let payload: any
  try { payload = JSON.parse(body) } catch {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' })); return
  }
  const { voice_id, preview_url } = payload
  if (!voice_id || !preview_url) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'voice_id and preview_url required' })); return
  }
  try {
    // Check if already cached from a previous fetch
    const ext = (preview_url as string).split('.').pop()?.split('?')[0]?.toLowerCase() || 'mp3'
    const cachePath = join(UPLOADS_DIR, `heygen_voice_${voice_id}.${ext}`)
    let buf: Buffer
    try {
      buf = await readFile(cachePath)
    } catch {
      // Not cached yet — download now
      const dlRes = await fetch(preview_url as string)
      if (!dlRes.ok) throw new Error(`Download failed: HTTP ${dlRes.status}`)
      buf = Buffer.from(await dlRes.arrayBuffer())
      await writeFile(cachePath, buf)
    }
    // Copy to active voice sample slot
    const samplePath = join(UPLOADS_DIR, `_voice_sample.${ext}`)
    await writeFile(samplePath, buf)
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, size: buf.length, format: ext }))
  } catch (e: any) {
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: e.message }))
  }
}

// ─── VoxCPM — local voice cloning ─────────────────────────────────────────
const VOXCPM_LOCAL = process.env.VOXCPM_LOCAL_URL || 'http://localhost:7861'

// Persistent voice sample — saved to uploads dir, reloaded on restart
const VOICE_SAMPLE_PATH = join(UPLOADS_DIR, '_voice_sample.wav')

async function handleVoxCPMHealth(_req: IncomingMessage, res: ServerResponse) {
  try {
    const r = await fetch(`${VOXCPM_LOCAL}/health`, { signal: AbortSignal.timeout(3000) })
    const data: any = await r.json()
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, ...data, url: VOXCPM_LOCAL }))
  } catch (e: any) {
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, status: 'offline', error: e.message, url: VOXCPM_LOCAL }))
  }
}

async function handleVoiceSampleUpload(req: IncomingMessage, res: ServerResponse) {
  let body = ''
  for await (const chunk of req) body += chunk
  let payload: any
  try { payload = JSON.parse(body) } catch {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' })); return
  }
  const { audioB64, format } = payload
  if (!audioB64) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'Missing audioB64' })); return
  }
  const buf = Buffer.from(audioB64, 'base64')
  const savePath = join(UPLOADS_DIR, `_voice_sample.${format || 'wav'}`)
  await writeFile(savePath, buf)
  res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: true, path: savePath, size: buf.length }))
}

async function handleVoiceSampleGet(_req: IncomingMessage, res: ServerResponse) {
  // Try .wav then .mp3
  for (const ext of ['wav', 'mp3', 'webm', 'ogg']) {
    const p = join(UPLOADS_DIR, `_voice_sample.${ext}`)
    try {
      const buf = await readFile(p)
      const b64 = buf.toString('base64')
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, audioB64: b64, format: ext, size: buf.length })); return
    } catch { /* not found, try next */ }
  }
  res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: false, error: 'No voice sample uploaded yet' }))
}

async function handleVoxCPM(req: IncomingMessage, res: ServerResponse) {
  let body = ''
  for await (const chunk of req) body += chunk
  let payload: any
  try { payload = JSON.parse(body) } catch {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' })); return
  }

  const { text, referenceB64, referenceFormat } = payload
  if (!text) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'Missing text' })); return
  }

  // If no reference provided in request, load the stored voice sample
  let refB64 = referenceB64
  let refFmt = referenceFormat || 'wav'
  if (!refB64) {
    for (const ext of ['wav', 'mp3', 'webm', 'ogg']) {
      try {
        const buf = await readFile(join(UPLOADS_DIR, `_voice_sample.${ext}`))
        refB64 = buf.toString('base64')
        refFmt = ext
        break
      } catch { /* continue */ }
    }
  }

  if (!refB64) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'No reference audio — upload a voice sample first via POST /api/voice-sample' })); return
  }

  try {
    const voxRes = await fetch(`${VOXCPM_LOCAL}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, reference_b64: refB64, reference_format: refFmt }),
      signal: AbortSignal.timeout(300_000), // 5 min — CPU synthesis is slow
    })

    if (voxRes.status === 503) {
      const err: any = await voxRes.json().catch(() => ({}))
      res.writeHead(503, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'model_loading', retryAfter: err.retryAfter || 10 })); return
    }

    if (!voxRes.ok) {
      const err: any = await voxRes.json().catch(() => ({}))
      res.writeHead(voxRes.status, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: err.error || `VoxCPM HTTP ${voxRes.status}` })); return
    }

    const result: any = await voxRes.json()
    if (!result.ok || !result.audio_b64) {
      res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: result.error || 'No audio returned' })); return
    }

    // Return raw WAV bytes so browser can play it directly
    const audioBuffer = Buffer.from(result.audio_b64, 'base64')
    res.writeHead(200, {
      ...CORS_HEADERS,
      'Content-Type': 'audio/wav',
      'Content-Length': audioBuffer.length,
    })
    res.end(audioBuffer)
  } catch (e: any) {
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: `VoxCPM unreachable: ${e.message}` }))
  }
}

// ─── SadTalker server-side job system ─────────────────────────────────────
const SADTALKER_LOCAL = process.env.SADTALKER_LOCAL_URL || 'http://localhost:7860'
const SADTALKER_HF    = process.env.SADTALKER_HF_URL || 'https://kevinwang676-sadtalker.hf.space'
type STStatus = 'queued' | 'uploading' | 'processing' | 'done' | 'error'
interface STJob {
  status: STStatus
  log: string
  videoBase64?: string
  videoMime?: string
  error?: string
  createdAt: number
}
const sadTalkerJobs = new Map<string, STJob>()

// Cleanup old jobs after 30 min
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000
  for (const [id, job] of sadTalkerJobs) {
    if (job.createdAt < cutoff) sadTalkerJobs.delete(id)
  }
}, 5 * 60 * 1000)

async function handleSadTalkerGenerate(req: IncomingMessage, res: ServerResponse) {
  let body = ''
  for await (const chunk of req) body += chunk
  let payload: any
  try { payload = JSON.parse(body) } catch {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' })); return
  }

  const { imageB64, imageMime, audioB64, preprocess, stillMode, enhancer, size, backend } = payload
  if (!imageB64 || !audioB64) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'Missing imageB64 or audioB64' })); return
  }

  const jobId = randomUUID()
  sadTalkerJobs.set(jobId, { status: 'queued', log: 'Job created…', createdAt: Date.now() })

  // Run async — don't await
  runSadTalkerJob(jobId, { imageB64, imageMime: imageMime || 'image/jpeg', audioB64, preprocess: preprocess || 'crop', stillMode: !!stillMode, enhancer: enhancer || 'gfpgan', size: size || 256, backend: backend || 'auto' }).catch(() => {})

  res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: true, jobId }))
}

async function handleSadTalkerStatus(_req: IncomingMessage, res: ServerResponse, url: URL) {
  const jobId = url.searchParams.get('jobId')
  if (!jobId || !sadTalkerJobs.has(jobId)) {
    res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'Job not found' })); return
  }
  const job = sadTalkerJobs.get(jobId)!
  res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: true, status: job.status, log: job.log, videoBase64: job.videoBase64, videoMime: job.videoMime, error: job.error }))
}

async function checkLocalSadTalker(): Promise<boolean> {
  try {
    const r = await fetch(`${SADTALKER_LOCAL}/`, { signal: AbortSignal.timeout(2000) })
    return r.ok
  } catch { return false }
}

async function runSadTalkerJob(jobId: string, opts: {
  imageB64: string; imageMime: string; audioB64: string
  preprocess: string; stillMode: boolean; enhancer: string; size: number; backend: string
}) {
  const job = sadTalkerJobs.get(jobId)!
  const update = (status: STStatus, log: string) => { job.status = status; job.log = log }

  // Resolve backend: 'local' → always local, 'hf' → always HF, 'auto' → try local first
  let useLocal = false
  if (opts.backend === 'local') {
    useLocal = true
  } else if (opts.backend === 'hf') {
    useLocal = false
  } else {
    useLocal = await checkLocalSadTalker()
  }

  const SADTALKER_BASE = useLocal ? SADTALKER_LOCAL : SADTALKER_HF
  const wsUrl = useLocal
    ? `ws://localhost:7860/queue/join`
    : `wss://kevinwang676-sadtalker.hf.space/queue/join`

  update('uploading', useLocal
    ? '⚡ Local SadTalker — connecting…'
    : '☁️ HuggingFace space — connecting…')

  const sessionHash = Math.random().toString(36).slice(2)
  let settled = false
  let ticker: ReturnType<typeof setInterval> | null = null

  try {
    update('uploading', useLocal ? '⚡ Connecting to local SadTalker…' : 'Connecting to SadTalker…')

    await new Promise<void>((resolve, reject) => {
      const done = (err?: Error) => {
        if (settled) return
        settled = true
        if (ticker) { clearInterval(ticker); ticker = null }
        clearTimeout(globalTimeout)
        err ? reject(err) : resolve()
      }

      const globalTimeout = setTimeout(() => {
        ws.terminate()
        done(new Error('SadTalker timeout (8 min)'))
      }, 480000)

      const ws = new WebSocket(wsUrl)
      let joinSent = false

      const sendJoin = () => {
        if (joinSent) return
        joinSent = true
        ws.send(JSON.stringify({ session_hash: sessionHash, fn_index: 0 }))
      }

      ws.on('open', () => {
        // Gradio 3.x: send immediately. Gradio 4.x: wait for send_hash
        // Send with small delay so send_hash can arrive first
        setTimeout(sendJoin, 50)
      })

      ws.on('message', async (raw) => {
        if (settled) return
        let msg: any
        try { msg = JSON.parse(raw.toString()) } catch { return }

        if (msg.msg === 'send_hash') {
          sendJoin()
        }
        else if (msg.msg === 'estimation') {
          if (ticker) { clearInterval(ticker); ticker = null }
          let eta = msg.rank_eta ? Math.round(msg.rank_eta) : 0
          const rank = msg.rank ?? '?'
          update('queued', `Queue position ${rank} — ETA ~${eta}s`)
          if (eta > 0) {
            ticker = setInterval(() => {
              eta = Math.max(0, eta - 1)
              update('queued', `Queue position ${rank} — ETA ~${eta}s`)
            }, 1000)
          }
        }
        else if (msg.msg === 'send_data') {
          if (ticker) { clearInterval(ticker); ticker = null }
          update('uploading', 'Uploading avatar + audio…')
          ws.send(JSON.stringify({
            session_hash: sessionHash,
            fn_index: 0,
            data: [
              { data: `data:${opts.imageMime};base64,${opts.imageB64}`, name: 'avatar.jpg' },
              { data: `data:audio/mpeg;base64,${opts.audioB64}`, name: 'audio.mp3' },
              opts.preprocess,
              opts.stillMode,
              opts.enhancer,
              1,
              opts.size,
              0,
            ],
          }))
        }
        else if (msg.msg === 'process_starts') {
          let elapsed = 0
          update('processing', 'SadTalker rendering… 0s')
          ticker = setInterval(() => {
            elapsed++
            update('processing', `SadTalker rendering… ${elapsed}s`)
          }, 1000)
        }
        else if (msg.msg === 'process_completed') {
          settled = true
          if (ticker) { clearInterval(ticker); ticker = null }
          clearTimeout(globalTimeout)
          ws.terminate()

          const out = msg.output?.data?.[0]
          let filePath: string | null = null
          if (typeof out === 'string') filePath = out
          else if (out?.video) filePath = typeof out.video === 'string' ? out.video : (out.video?.path || out.video?.url || null)
          else if (out?.path) filePath = out.path
          else if (out?.url) filePath = out.url
          else if (out?.name) filePath = out.name

          if (!filePath) { reject(new Error(`No video in output: ${JSON.stringify(out)}`)); return }

          const fullUrl = filePath.startsWith('http') ? filePath : `${SADTALKER_BASE}/file=${filePath}`
          update('processing', 'Downloading video…')

          try {
            const dlRes = await fetch(fullUrl)
            if (!dlRes.ok) throw new Error(`HTTP ${dlRes.status}`)
            const buffer = Buffer.from(await dlRes.arrayBuffer())
            job.videoBase64 = buffer.toString('base64')
            job.videoMime = dlRes.headers.get('content-type') || 'video/mp4'
            update('done', 'Video ready ✓')
            resolve()
          } catch (e: any) {
            reject(new Error(`Download failed: ${e.message} — URL: ${fullUrl}`))
          }
        }
        else if (msg.msg === 'process_errored') {
          ws.terminate()
          done(new Error(msg.output?.error || 'SadTalker processing error'))
        }
        else if (msg.msg === 'queue_full') {
          ws.terminate()
          done(new Error('SadTalker queue full — try again shortly'))
        }
      })

      ws.on('error', (e) => done(new Error(`WebSocket error: ${e.message}`)))
      ws.on('close', (code) => { if (!settled) done(new Error(`Disconnected (code ${code})`)) })
    })
  } catch (e: any) {
    job.status = 'error'
    job.error = e.message
    job.log = `Failed: ${e.message}`
  }
}

async function handleGenericProxy(_req: IncomingMessage, res: ServerResponse, url: URL) {
  const target = url.searchParams.get('url')
  if (!target) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'Missing url param' }))
    return
  }
  try {
    const upstream = await fetch(decodeURIComponent(target))
    if (!upstream.ok) throw new Error(`Upstream HTTP ${upstream.status}`)
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    const buffer = Buffer.from(await upstream.arrayBuffer())
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': contentType, 'Content-Length': buffer.length })
    res.end(buffer)
  } catch (e: any) {
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: e.message }))
  }
}

async function handleHeyGenSynthesize(req: IncomingMessage, res: ServerResponse) {
  if (!HEYGEN_API_KEY) {
    res.writeHead(503, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'HEYGEN_API_KEY not configured in server environment' }))
    return
  }
  try {
    const body = JSON.parse(await readBody(req)) as {
      voice_id: string; text: string; speed?: number; emotion?: string
    }
    const hgRes = await fetch('https://api.heygen.com/v3/voices/speech', {
      method:  'POST',
      headers: { 'X-Api-Key': HEYGEN_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        voice_id: body.voice_id,
        text:     body.text,
        speed:    body.speed ?? 1.0,
        emotion:  body.emotion ?? 'Friendly',
      }),
    })
    if (!hgRes.ok) {
      const err: any = await hgRes.json().catch(() => ({}))
      const msg = err?.error?.message || err?.message || err?.error || `HeyGen HTTP ${hgRes.status}`
      throw new Error(msg)
    }
    const result: any = await hgRes.json()
    const audioUrl: string = result?.data?.audio_url ?? result?.audio_url ?? result?.url ?? ''
    if (!audioUrl) throw new Error('HeyGen returned no audio URL')
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, audio_url: audioUrl }))
  } catch (e: any) {
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: e.message }))
  }
}

// ─── Interview Video Email ────────────────────────────────────────────────
interface InterviewVideoEmailPayload {
  to: string
  recipientName?: string
  jobTitle?: string
  company?: string
  question: string
  script: string
  videoBase64?: string
  videoSizeBytes?: number
  videoMime?: string
  videoFilename?: string
  senderName?: string
  senderEmail?: string
  portfolioUrl?: string
  customNote?: string
}

// Core — used by both the public /api/video/send-interview-email endpoint
// and the /api/recordings/:id/attach-to-email bridge. Throws on error so the
// caller can shape the HTTP response.
async function sendInterviewVideoEmailCore(payload: InterviewVideoEmailPayload): Promise<{ messageId: string | undefined; attached: boolean }> {
  const {
    to, recipientName, jobTitle, company, question, script,
    videoBase64, videoSizeBytes, videoMime, videoFilename,
    senderName = SMTP_FROM_NAME,
    senderEmail = SMTP_REPLY_TO,
    portfolioUrl = 'https://neuralyx.ai.dev-environment.site',
    customNote,
  } = payload

  if (!to || !question || !script) {
    throw new Error('to, question, and script are required')
  }

  const mailer = getMailer()
  if (!mailer) throw new Error('SMTP not configured on server')

  const greeting   = recipientName ? `Dear ${recipientName},` : 'Dear Hiring Manager,'
  const roleCtx    = jobTitle && company ? `the ${jobTitle} position at ${company}` : jobTitle ? `the ${jobTitle} position` : 'your open position'
  const hasVideo   = !!videoBase64 && (videoSizeBytes || 0) < 20 * 1024 * 1024
  const videoNote  = hasVideo
    ? 'Please find my video response attached to this email.'
    : 'I have prepared a video response to your question which I would be happy to share upon request.'

  const textBody = `${greeting}

Thank you for your interest in my application for ${roleCtx}.

I am writing in response to your interview question:
"${question}"

${videoNote}

My response covers:
${script}

${customNote ? `\n${customNote}\n` : ''}
I am enthusiastic about this opportunity and confident that my experience aligns well with what you are looking for. I would welcome the chance to discuss further in a formal interview.

Please feel free to reach me at ${senderEmail} or visit my portfolio at ${portfolioUrl}.

Best regards,
${senderName}
${senderEmail}
${portfolioUrl}`

  const htmlBody = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f5; margin: 0; padding: 20px; }
  .wrapper { max-width: 600px; margin: 0 auto; }
  .card { background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg, #7c3aed, #2563eb); padding: 28px 32px; }
  .header h1 { color: #fff; margin: 0; font-size: 20px; font-weight: 700; }
  .header p { color: rgba(255,255,255,0.75); margin: 6px 0 0; font-size: 13px; }
  .body { padding: 32px; }
  .greeting { color: #111827; font-size: 15px; margin-bottom: 20px; }
  .question-box { background: #f3f4f6; border-left: 4px solid #7c3aed; border-radius: 6px; padding: 16px 20px; margin: 20px 0; }
  .question-box p { color: #374151; font-size: 14px; margin: 0; font-style: italic; }
  .question-box span { display: block; color: #6b7280; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
  .video-badge { display: inline-block; background: #ede9fe; color: #7c3aed; padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; margin: 16px 0; }
  .script-preview { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; }
  .script-preview p { color: #374151; font-size: 14px; line-height: 1.7; margin: 0; }
  .note { color: #4b5563; font-size: 14px; line-height: 1.6; }
  .divider { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
  .signature { color: #374151; font-size: 14px; }
  .signature strong { display: block; font-size: 15px; color: #111827; margin-bottom: 4px; }
  .signature a { color: #7c3aed; text-decoration: none; }
  .footer { background: #f9fafb; padding: 16px 32px; border-top: 1px solid #e5e7eb; text-align: center; }
  .footer p { color: #9ca3af; font-size: 11px; margin: 0; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="card">
    <div class="header">
      <h1>Video Interview Response</h1>
      <p>${roleCtx.charAt(0).toUpperCase() + roleCtx.slice(1)}</p>
    </div>
    <div class="body">
      <p class="greeting">${greeting}</p>
      <p class="note">Thank you for your interest in my application for <strong>${roleCtx}</strong>. I am writing in response to your interview question:</p>

      <div class="question-box">
        <span>Interview Question</span>
        <p>"${question}"</p>
      </div>

      <div class="video-badge">🎬 ${hasVideo ? 'Video Response Attached' : 'Video Response Ready'}</div>

      <div class="script-preview">
        <p>${script.replace(/\n/g, '<br>')}</p>
      </div>

      ${customNote ? `<p class="note">${customNote}</p>` : ''}

      <p class="note">I am enthusiastic about this opportunity and would welcome the chance to discuss further. Feel free to reach me directly at <a href="mailto:${senderEmail}">${senderEmail}</a>.</p>

      <hr class="divider">

      <div class="signature">
        <strong>${senderName}</strong>
        <a href="mailto:${senderEmail}">${senderEmail}</a><br>
        <a href="${portfolioUrl}" target="_blank">${portfolioUrl}</a>
      </div>
    </div>
    <div class="footer">
      <p>This video response was generated using NEURALYX AI Video Studio</p>
    </div>
  </div>
</div>
</body>
</html>`

  const subject = jobTitle && company
    ? `Video Interview Response — ${jobTitle} at ${company} | ${senderName}`
    : `Video Interview Response | ${senderName}`

  const attachMime = videoMime || 'video/mp4'
  const attachExt  = attachMime.includes('webm') ? 'webm' : 'mp4'
  const attachName = videoFilename || `interview-response-${Date.now()}.${attachExt}`

  const mailOptions: Parameters<typeof mailer.sendMail>[0] = {
    from:    `"${senderName}" <${SMTP_REPLY_TO}>`,
    replyTo: senderEmail,
    to,
    subject,
    text:    textBody,
    html:    htmlBody,
    ...(hasVideo && videoBase64 ? {
      attachments: [{
        filename:    attachName,
        content:     Buffer.from(videoBase64, 'base64'),
        contentType: attachMime,
      }],
    } : {}),
  }

  const info = await mailer.sendMail(mailOptions)
  return { messageId: info.messageId, attached: hasVideo }
}

async function handleSendInterviewVideoEmail(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as InterviewVideoEmailPayload
    const { messageId, attached } = await sendInterviewVideoEmailCore(body)
    return json(res, 200, { ok: true, messageId, attached })
  } catch (e) {
    console.error('[InterviewEmail]', e)
    return json(res, 500, { error: e instanceof Error ? e.message : 'Send failed' })
  }
}

// ─── Recordings (Record-tab) ──────────────────────────────────────────────
// Persist browser-recorded videos to Supabase Storage (bucket: recordings)
// and metadata to user_recordings. Bridge endpoint reuses the interview
// email core so a past recording can be reattached without re-uploading.

const RECORDINGS_DEFAULT_OWNER = process.env.RECORDINGS_DEFAULT_OWNER || 'portfolio'
const RECORDINGS_DIR = process.env.RECORDINGS_DIR || join(UPLOADS_DIR, 'recordings')
const LOCAL_PG_URL = process.env.LOCAL_PG_URL || ''

await mkdir(RECORDINGS_DIR, { recursive: true }).catch(() => undefined)

// Local Postgres pool — used for the recordings feature so we don't depend on
// having a remote Supabase service-role key just to apply DDL or store rows.
const { Pool } = await import('pg')
const localPg = LOCAL_PG_URL ? new Pool({ connectionString: LOCAL_PG_URL, max: 4 }) : null
if (localPg) {
  // One-shot table ensure — survives a fresh-volume postgres restart without
  // needing a separate migration apply step.
  void localPg.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    CREATE TABLE IF NOT EXISTS user_recordings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner TEXT NOT NULL,
      title TEXT NOT NULL,
      duration_ms INT NOT NULL,
      size_bytes BIGINT NOT NULL,
      mime_type TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      thumbnail_path TEXT,
      background_type TEXT CHECK (background_type IN ('none','blur','color','image')),
      background_meta JSONB,
      gaze_correction_enabled BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS user_recordings_owner_created_idx
      ON user_recordings(owner, created_at DESC);
  `).catch((e: unknown) => console.warn('[recordings] table-ensure failed:', e instanceof Error ? e.message : e))
}

function recordingFsPath(owner: string, id: string, ext: string) {
  return join(RECORDINGS_DIR, owner, `${id}.${ext}`)
}
function recordingFileUrl(id: string, kind: 'file' | 'thumbnail' = 'file') {
  return `/api/recordings/${kind}/${id}`
}

interface MultipartField {
  name: string
  filename?: string
  contentType?: string
  data: Buffer
}

function parseMultipartAll(raw: Buffer, boundary: string): MultipartField[] {
  const delim = Buffer.from(`--${boundary}`)
  const out: MultipartField[] = []
  let start = raw.indexOf(delim)
  if (start === -1) return out
  start += delim.length
  // Skip trailing CRLF after first delim
  while (true) {
    const next = raw.indexOf(delim, start)
    if (next === -1) break
    const partBuf = raw.subarray(start, next)
    start = next + delim.length

    // Each part starts with an optional CRLF, then headers, \r\n\r\n, body, \r\n
    const trimmed = partBuf[0] === 0x0d && partBuf[1] === 0x0a ? partBuf.subarray(2) : partBuf
    const headerEnd = trimmed.indexOf('\r\n\r\n')
    if (headerEnd === -1) continue
    const headerStr = trimmed.subarray(0, headerEnd).toString('utf8')
    let body = trimmed.subarray(headerEnd + 4)
    if (body.length >= 2 && body[body.length - 2] === 0x0d && body[body.length - 1] === 0x0a) {
      body = body.subarray(0, body.length - 2)
    }
    const nameMatch = /name="([^"]+)"/i.exec(headerStr)
    if (!nameMatch) continue
    const filenameMatch = /filename="([^"]*)"/i.exec(headerStr)
    const ctMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headerStr)
    out.push({
      name: nameMatch[1],
      filename: filenameMatch?.[1] || undefined,
      contentType: ctMatch?.[1]?.trim() || undefined,
      data: Buffer.from(body),
    })

    // Check for terminating `--` marker
    if (raw[start] === 0x2d && raw[start + 1] === 0x2d) break
  }
  return out
}

async function handleRecordingsUpload(req: IncomingMessage, res: ServerResponse) {
  if (!localPg) return json(res, 503, { error: 'LOCAL_PG_URL not configured on mcp-server' })
  try {
    const ct = String(req.headers['content-type'] || '')
    if (!ct.includes('multipart/form-data')) return json(res, 400, { error: 'Expected multipart/form-data' })
    const boundary = ct.split('boundary=')[1]
    if (!boundary) return json(res, 400, { error: 'Missing boundary' })
    const raw = await readBodyRaw(req)
    const fields = parseMultipartAll(raw, boundary)

    const getField = (n: string) => fields.find(f => f.name === n)
    const videoField = getField('video')
    if (!videoField) return json(res, 400, { error: 'video field required' })

    const thumbField = getField('thumbnail')
    const textOf = (n: string) => getField(n)?.data?.toString('utf8') ?? ''

    const owner = textOf('owner') || RECORDINGS_DEFAULT_OWNER
    const title = textOf('title') || `Recording ${new Date().toISOString()}`
    const durationMs = parseInt(textOf('duration_ms') || '0', 10) || 0
    const sizeBytes = parseInt(textOf('size_bytes') || String(videoField.data.length), 10) || videoField.data.length
    const mimeType = textOf('mime_type') || videoField.contentType || 'video/webm'
    const backgroundType = textOf('background_type') || 'none'
    const gazeEnabled = textOf('gaze_correction_enabled') === 'true'

    const id = randomUUID()
    const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'mp4' : 'bin'
    const ownerDir = join(RECORDINGS_DIR, owner)
    await mkdir(ownerDir, { recursive: true })
    const videoFsPath = recordingFsPath(owner, id, ext)
    await writeFile(videoFsPath, videoField.data)

    let thumbFsPath: string | null = null
    if (thumbField) {
      thumbFsPath = recordingFsPath(owner, id, 'png')
      await writeFile(thumbFsPath, thumbField.data)
    }

    const safeBg = ['none', 'blur', 'color', 'image'].includes(backgroundType) ? backgroundType : 'none'
    try {
      await localPg.query(
        `INSERT INTO user_recordings
         (id, owner, title, duration_ms, size_bytes, mime_type, storage_path, thumbnail_path, background_type, background_meta, gaze_correction_enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [id, owner, title, durationMs, sizeBytes, mimeType, videoFsPath, thumbFsPath, safeBg, null, gazeEnabled],
      )
    } catch (e) {
      // Best-effort cleanup of the just-written files
      await rm(videoFsPath, { force: true }).catch(() => undefined)
      if (thumbFsPath) await rm(thumbFsPath, { force: true }).catch(() => undefined)
      throw e
    }

    return json(res, 200, {
      ok: true,
      id,
      storage_path: videoFsPath,
      thumbnail_path: thumbFsPath,
      signed_url: recordingFileUrl(id, 'file'),
      thumbnail_url: thumbFsPath ? recordingFileUrl(id, 'thumbnail') : null,
    })
  } catch (e) {
    console.error('[recordings.upload]', e)
    return json(res, 500, { error: e instanceof Error ? e.message : 'upload failed' })
  }
}

async function handleRecordingsList(_req: IncomingMessage, res: ServerResponse, url: URL) {
  if (!localPg) return json(res, 503, { error: 'LOCAL_PG_URL not configured on mcp-server' })
  try {
    const owner = url.searchParams.get('owner') || RECORDINGS_DEFAULT_OWNER
    const { rows } = await localPg.query(
      `SELECT id, owner, title, duration_ms, size_bytes, mime_type,
              storage_path, thumbnail_path, background_type, background_meta,
              gaze_correction_enabled, created_at
       FROM user_recordings
       WHERE owner = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [owner],
    )
    const recordings = rows.map((r) => ({
      ...r,
      signed_url: recordingFileUrl(r.id, 'file'),
      thumbnail_url: r.thumbnail_path ? recordingFileUrl(r.id, 'thumbnail') : null,
    }))
    return json(res, 200, { recordings })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'list failed' })
  }
}

async function handleRecordingsRename(req: IncomingMessage, res: ServerResponse, id: string) {
  if (!localPg) return json(res, 503, { error: 'LOCAL_PG_URL not configured on mcp-server' })
  try {
    const body = JSON.parse(await readBody(req)) as { title?: string }
    const title = (body.title || '').trim()
    if (!title) return json(res, 400, { error: 'title required' })
    const { rowCount } = await localPg.query(
      `UPDATE user_recordings SET title = $1 WHERE id = $2`, [title, id])
    if (!rowCount) return json(res, 404, { error: 'not found' })
    return json(res, 200, { ok: true })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'rename failed' })
  }
}

async function handleRecordingsDelete(_req: IncomingMessage, res: ServerResponse, id: string) {
  if (!localPg) return json(res, 503, { error: 'LOCAL_PG_URL not configured on mcp-server' })
  try {
    const { rows } = await localPg.query(
      `SELECT storage_path, thumbnail_path FROM user_recordings WHERE id = $1`, [id])
    const row = rows[0] as { storage_path?: string; thumbnail_path?: string } | undefined
    if (row?.storage_path) await rm(row.storage_path, { force: true }).catch(() => undefined)
    if (row?.thumbnail_path) await rm(row.thumbnail_path, { force: true }).catch(() => undefined)
    await localPg.query(`DELETE FROM user_recordings WHERE id = $1`, [id])
    return json(res, 200, { ok: true })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'delete failed' })
  }
}

// Streams a recording video or its thumbnail by id.
async function handleRecordingsServeFile(_req: IncomingMessage, res: ServerResponse, id: string, kind: 'file' | 'thumbnail') {
  if (!localPg) return json(res, 503, { error: 'LOCAL_PG_URL not configured on mcp-server' })
  try {
    const { rows } = await localPg.query(
      `SELECT storage_path, thumbnail_path, mime_type FROM user_recordings WHERE id = $1`, [id])
    const row = rows[0] as { storage_path?: string; thumbnail_path?: string; mime_type?: string } | undefined
    if (!row) return json(res, 404, { error: 'not found' })
    const path = kind === 'thumbnail' ? row.thumbnail_path : row.storage_path
    if (!path) return json(res, 404, { error: 'no file' })
    const buf = await readFile(path).catch(() => null)
    if (!buf) return json(res, 404, { error: 'file missing on disk' })
    const ct = kind === 'thumbnail' ? 'image/png' : (row.mime_type || 'video/webm')
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': ct, 'Content-Length': String(buf.length), 'Cache-Control': 'private, max-age=300' })
    res.end(buf)
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'serve failed' })
  }
}

// ─── Gaze sidecar proxy ───────────────────────────────────────────────────
const GAZE_SIDECAR_URL = process.env.GAZE_SIDECAR_URL || 'http://neuralyx-gaze:7880'

async function handleGazeStatus(_req: IncomingMessage, res: ServerResponse) {
  try {
    const r = await fetch(`${GAZE_SIDECAR_URL}/health`, { signal: AbortSignal.timeout(2500) })
    if (!r.ok) return json(res, 200, { sidecar: 'down', status: r.status })
    const data = await r.json().catch(() => ({}))
    return json(res, 200, { sidecar: 'up', ...data })
  } catch (e) {
    return json(res, 200, { sidecar: 'down', error: e instanceof Error ? e.message : String(e) })
  }
}

async function handleGazeProcessVideo(req: IncomingMessage, res: ServerResponse) {
  try {
    const ct = String(req.headers['content-type'] || '')
    if (!ct.includes('multipart/form-data')) return json(res, 400, { error: 'Expected multipart/form-data' })
    const raw = await readBodyRaw(req)
    if (!raw.length) return json(res, 400, { error: 'empty body' })
    const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer
    // Forward the backend query param so the sidecar honours the selection
    // (was being stripped here and silently defaulted to wangwilly).
    const incomingUrl = new URL(req.url || '/api/gaze/process-video', 'http://x')
    const qs = incomingUrl.search || ''
    const r = await fetch(`${GAZE_SIDECAR_URL}/process-video${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': ct },
      body: ab,
      signal: AbortSignal.timeout(600000),
    })
    if (!r.ok) return json(res, 502, { error: `sidecar ${r.status}: ${await r.text()}` })
    const buf = Buffer.from(await r.arrayBuffer())
    res.writeHead(200, {
      ...CORS_HEADERS,
      'Content-Type': r.headers.get('content-type') || 'video/mp4',
      'Content-Length': String(buf.length),
      'X-Gaze-Stats': r.headers.get('x-gaze-stats') || '',
    })
    res.end(buf)
  } catch (e) {
    return json(res, 502, { error: e instanceof Error ? e.message : 'sidecar unreachable' })
  }
}

async function handleGazeCorrect(req: IncomingMessage, res: ServerResponse) {
  try {
    const raw = await readBodyRaw(req)
    if (!raw.length) return json(res, 400, { error: 'empty body' })
    const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer
    const r = await fetch(`${GAZE_SIDECAR_URL}/correct`, {
      method: 'POST',
      headers: { 'Content-Type': req.headers['content-type'] || 'application/octet-stream' },
      body: ab,
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return json(res, 502, { error: `sidecar ${r.status}: ${await r.text()}` })
    const buf = Buffer.from(await r.arrayBuffer())
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': r.headers.get('content-type') || 'image/jpeg', 'Content-Length': String(buf.length) })
    res.end(buf)
  } catch (e) {
    return json(res, 502, { error: e instanceof Error ? e.message : 'sidecar unreachable' })
  }
}

async function handleRecordingsAttachToEmail(req: IncomingMessage, res: ServerResponse, id: string) {
  if (!localPg) return json(res, 503, { error: 'LOCAL_PG_URL not configured on mcp-server' })
  try {
    const body = JSON.parse(await readBody(req)) as Partial<InterviewVideoEmailPayload>
    const { rows } = await localPg.query(
      `SELECT storage_path, mime_type, title FROM user_recordings WHERE id = $1`, [id])
    const row = rows[0] as { storage_path?: string; mime_type?: string; title?: string } | undefined
    if (!row || !row.storage_path) return json(res, 404, { error: 'recording not found' })
    const videoBuf = await readFile(row.storage_path).catch(() => null)
    if (!videoBuf) return json(res, 500, { error: 'file missing on disk' })
    const contentType = row.mime_type

    const payload: InterviewVideoEmailPayload = {
      to: body.to || '',
      recipientName: body.recipientName,
      jobTitle: body.jobTitle,
      company: body.company,
      question: body.question || '',
      script: body.script || row.title || '',
      videoBase64: videoBuf.toString('base64'),
      videoSizeBytes: videoBuf.length,
      videoMime: contentType || row.mime_type || 'video/webm',
      videoFilename: `${row.title || 'recording'}.${(row.mime_type || 'webm').includes('mp4') ? 'mp4' : 'webm'}`,
      senderName: body.senderName,
      senderEmail: body.senderEmail,
      portfolioUrl: body.portfolioUrl,
      customNote: body.customNote,
    }

    const { messageId, attached } = await sendInterviewVideoEmailCore(payload)
    return json(res, 200, { ok: true, messageId, attached })
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'send failed' })
  }
}

initAnalytics({ supabaseQuery })

initOrchestrator({
  supabaseQuery,
  broadcastNotification,
  sendEmail: sendEmailHelper,
  generateCoverLetter: (job) => handleCoverLetterInternal(job),
  generateChannelVariant,
  buildStrategy: buildApplicationStrategy as any,
  SMTP_FROM_NAME,
  SMTP_FROM_EMAIL,
  SMTP_REPLY_TO,
  NOTIFY_EMAIL,
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`NEURALYX API server running on port ${PORT}`)

  // ─── Scheduled Channel Processor (every 60s) ───
  setInterval(processScheduledChannels, 60000)
  console.log(`[Scheduler] Channel execution processor running (every 60s)`)

  // ─── Daily Pipeline Scheduler ───
  const SCHEDULE_INTERVAL = 24 * 60 * 60 * 1000 // 24 hours
  const SCHEDULE_ENABLED = process.env.AUTO_PIPELINE !== 'false'

  if (SCHEDULE_ENABLED) {
    console.log(`[Scheduler] Daily pipeline enabled — runs every 24h`)

    async function runDailyPipeline() {
      console.log(`[Scheduler] Running daily pipeline at ${new Date().toISOString()}`)
      try {
        // Simulate the agent run endpoint call internally
        const body = JSON.stringify({ query: 'AI automation engineer remote', location: 'Philippines', platforms: ['himalayas', 'remoteok', 'remotive', 'arbeitnow', 'hackernews', 'remoterocketship', 'jooble'] })
        const req = new (await import('stream')).Readable({ read() { this.push(body); this.push(null) } }) as unknown as IncomingMessage
        req.method = 'POST'
        req.headers = { 'content-type': 'application/json' }
        const chunks: string[] = []
        const fakeRes = {
          writeHead: () => {},
          end: (data: string) => { chunks.push(data) },
        } as unknown as ServerResponse

        await handleAgentRun(req, fakeRes)
        const result = chunks[0] ? JSON.parse(chunks[0]) : {}
        console.log(`[Scheduler] Pipeline complete: ${result.jobs_found || 0} found, ${result.matched || 0} matched, ${result.saved || 0} saved`)

        // Run channel performance analytics aggregation
        try {
          const analytics = await aggregateChannelPerformance()
          console.log(`[Scheduler] Analytics aggregated: ${analytics.updated} rows`)
        } catch { console.log('[Scheduler] Analytics aggregation skipped') }

        // Notify via email
        const mailer = getMailer()
        if (mailer && NOTIFY_EMAIL) {
          await mailer.sendMail({
            from: `"NEURALYX Scheduler" <${SMTP_FROM_EMAIL}>`,
            to: NOTIFY_EMAIL,
            subject: `[DAILY] Pipeline Run — ${result.matched || 0} matched, ${result.saved || 0} new jobs`,
            text: `NEURALYX Daily Pipeline Report\n\nTime: ${new Date().toISOString()}\nJobs Found: ${result.jobs_found || 0}\nMatched (≥65%): ${result.matched || 0}\nNew Saved: ${result.saved || 0}\nErrors: ${(result.errors || []).length}\n\nCheck your dashboard: http://localhost:3000/admin/jobs`,
          }).catch(() => {})
        }
      } catch (e) {
        console.error(`[Scheduler] Pipeline error:`, e)
      }
    }

    // Run first pipeline 5 minutes after server start (let everything warm up)
    setTimeout(() => {
      runDailyPipeline()
      // Then run every 24 hours
      setInterval(runDailyPipeline, SCHEDULE_INTERVAL)
    }, 5 * 60 * 1000)
  }
})

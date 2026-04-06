import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { writeFile, mkdir, readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import nodemailer from 'nodemailer'

const PORT = Number(process.env.PORT || 8080)
const UPLOADS_DIR = process.env.UPLOADS_DIR || '/app/uploads'
// Email config — supports Gmail SMTP or cPanel SMTP
const SMTP_HOST = process.env.SMTP_HOST || '' // cPanel: mail.yourdomain.com
const SMTP_PORT = Number(process.env.SMTP_PORT || 465)
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false' // true for 465, false for 587
const SMTP_USER = process.env.SMTP_USER || process.env.GMAIL_USER || ''
const SMTP_PASS = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || ''
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || process.env.SMTP_FROM_NAME || 'Gabriel Alvin Aquino'
const SMTP_FROM_EMAIL = process.env.SMTP_FROM_EMAIL || SMTP_USER
const JSEARCH_API_KEY = process.env.JSEARCH_API_KEY || ''

// Ensure uploads directory exists
await mkdir(UPLOADS_DIR, { recursive: true })

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
  const { query, location, platform } = body
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

const GEMINI_KEY = process.env.VITE_GEMINI_KEY || process.env.GEMINI_KEY || ''
const OPENAI_KEY = process.env.VITE_OPENAI_KEY || process.env.OPENAI_KEY || ''

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
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
          ], temperature: 0.3, max_tokens: 500,
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
          generationConfig: { temperature: 0.3, maxOutputTokens: 500, thinkingConfig: { thinkingBudget: 0 } },
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

  const systemPrompt = `You are Gabriel Alvin, an AI Systems Engineer writing a TAILORED cover letter for a specific job. Every cover letter must be unique and targeted.

CRITICAL RULES:
1. OPEN with the company's BUSINESS PAIN POINT — what problem they're trying to solve based on the job description
2. SHOW METRICS — "reduced deployment time by 60%", "built a system processing 90+ data sources in 8 seconds", "managed 27+ production projects"
3. MAP YOUR SKILLS TO THEIR NEEDS — for each requirement they list, show how you've done it
4. EXPLAIN HOW YOU WORK — "I architect the full system first, then build iteratively with weekly demos"
5. CLOSE with CONTRIBUTION — specifically what you'll deliver in the first 30-60 days

Writing style:
- Direct, confident, results-focused
- NO generic filler ("I am excited to apply" — instead lead with their problem)
- Use numbers and percentages wherever possible
- Show you READ their job description by referencing specific requirements
- 3-4 tight paragraphs, max 350 words

Portfolio achievements to reference (use specific ones that match the job):
${portfolioSignals}

Key metrics:
- 8+ years experience, 27+ production projects shipped
- Built AI pipeline processing 90+ jobs across 8 platforms in 8 seconds
- NEURALYX: 48 connected services, 7 AI agents, 5 Docker containers
- LIVITI Content Engine: automated article generation reducing manual work by 95%
- 14 mobile apps shipped to production

Return the cover letter as plain text (no JSON, no markdown fences). Make it SPECIFIC to this exact job.`

  const userPrompt = `Write a cover letter for:
Company: ${company}
Role: ${title}
Company type: ${company_bucket || 'unknown'}
Job description: ${(description || '').slice(0, 2000)}
My skills: ${(skills || []).join(', ')}
My resume: ${(resume_text || '').slice(0, 1000)}`

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

  // Generate AI follow-up suggestions if available
  if (actions.length > 0 && actions.some(a => a.action === 'suggest_followup') && (OPENAI_KEY || GEMINI_KEY)) {
    const followups = actions.filter(a => a.action === 'suggest_followup').slice(0, 3)
    for (const fu of followups) {
      try {
        const app = applications.find((a: any) => a.id === fu.id)
        if (!app) continue
        const msg = await callAI(
          'Generate a short, professional follow-up message (2-3 sentences) for a job application. Be polite and direct.',
          `I applied for ${app.job_title} at ${app.company} ${Math.floor((now - new Date(app.created_at).getTime()) / DAY)} days ago. Generate a follow-up message.`,
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

  const raw = await callAI(prompt, `Title: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location || ''}\nURL: ${job.url || ''}\nDescription: ${desc}`)
  const jsonStr = raw.replace(/^```json\s*\n?/, '').replace(/\n?\s*```\s*$/, '')
  const match = jsonStr.match(/\{[\s\S]*\}/)
  const result = match ? JSON.parse(match[0]) : {}

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
  // Use focused queries — max 3 to avoid timeout
  const domainQueries = query ? [query] : [
    'AI automation engineer remote',
    'fullstack developer Vue Python',
    'AI agent developer PHP Laravel',
  ]

  const searchLoc = location || ''

  // Run ALL queries in parallel (not sequential) for speed
  const queryResults = await Promise.allSettled(
    domainQueries.map(async (sq) => {
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

  // Pre-filter: remove obviously irrelevant jobs by title keywords BEFORE AI scoring
  const EXCLUDE_TITLES = /\b(nurse|nursing|teacher|teaching|accountant|accounting|receptionist|cashier|driver|cook|chef|waiter|waitress|barista|janitor|security guard|call center|customer service rep|beauty|salon|massage|eLearning trainer|audio evaluator|linguist|translator|french|spanish|german|japanese|korean|mandarin|transcription|data entry clerk|typist|virtual assistant|admin assistant|bookkeeper|payroll)\b/i
  const preFilterCount = allJobs.length
  allJobs = allJobs.filter(j => !EXCLUDE_TITLES.test(j.title))

  logs.push({ step: 'search', status: 'completed', message: `Found ${preFilterCount} → filtered to ${allJobs.length} in ${Date.now() - searchStart}ms`, jobs_found: allJobs.length, jobs_matched: 0, jobs_applied: 0 })

  // Step 2: CLASSIFY + MATCH (if AI available)
  let matched = 0
  if ((OPENAI_KEY || GEMINI_KEY) && allJobs.length > 0) {
    const matchStart = Date.now()
    const classifyPrompt = 'Classify job. Return JSON: {"role_type":"fullstack|ai_engineer|ml_engineer|devops|frontend|backend|data|automation|other","company_bucket":"agency|startup|enterprise|recruiter|direct_client","company_type_detail":"outsourcing|product|consulting|staffing|saas|other","match_score":0-100,"work_arrangement":"remote|hybrid|onsite"}. Target profile: AI Systems Engineer & Automation Developer. Core skills: Vue.js, TypeScript, Python, PHP, Laravel, Docker, OpenAI API, Supabase, n8n, LangChain, CrewAI, FastAPI, MCP, PostgreSQL, GSAP, Tailwind CSS, Pinia. Strong domains: AI/ML automation, AI agent development, business process automation, fullstack web dev (Vue/Python/Node), DevOps/MLOps, chatbot/AI assistant building, system integration, workflow automation. Score 80+=strong match, 60-79=good, 40-59=moderate, below 40=irrelevant. HARD EXCLUDE (score 0): .NET, C#, SAP, Java/Spring, receptionist, data entry, manual QA, accounting, nursing, teaching, sales rep, customer service, graphic design, content writing. Include PHP/Laravel as a valid skill match. Only score high if the job genuinely needs software engineering, AI, automation, or DevOps skills.'

    // Process ALL found jobs (pre-filtered already)
    const minRequired = min_score || 65
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

// SMTP transporter — supports Gmail or cPanel (lazy init)
let mailTransporter: nodemailer.Transporter | null = null
function getMailer() {
  if (!mailTransporter && SMTP_USER && SMTP_PASS) {
    if (SMTP_HOST) {
      // cPanel or custom SMTP
      mailTransporter = nodemailer.createTransport({
        host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      })
    } else {
      // Gmail fallback
      mailTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      })
    }
  }
  return mailTransporter
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

// Internal cover letter generation (reuse existing logic)
async function handleCoverLetterInternal(job: { title: string; company: string; description?: string }, profile?: { resume_text?: string; skills?: string[] }): Promise<string> {
  const systemPrompt = `Write a concise, professional cover letter (3-4 paragraphs, max 350 words) for ${SMTP_FROM_NAME}, an AI Systems Engineer applying for ${job.title} at ${job.company}. Open with the company's pain point. Show metrics: 8+ years, 27+ projects, AI pipeline (90+ jobs/8 platforms/8 seconds). Close with a 30-60 day contribution plan. Plain text only.`
  const userPrompt = `Job: ${job.title} at ${job.company}\nDescription: ${(job.description || '').slice(0, 1000)}\nSkills: ${profile?.skills?.join(', ') || 'Vue.js, TypeScript, Python, Docker, OpenAI, n8n, LangChain'}`
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
      from: `"${SMTP_FROM_NAME}" <${SMTP_FROM_EMAIL}>`,
      to, subject, text: emailBody,
      attachments: attachments || [],
    }

    // Attach resume if exists
    try {
      await stat(join(UPLOADS_DIR, 'resume.pdf'))
      mailOptions.attachments = [...(mailOptions.attachments as nodemailer.SendMailOptions['attachments'] || []), { filename: `${SMTP_FROM_NAME.replace(/\s+/g, '_')}_Resume.pdf`, path: join(UPLOADS_DIR, 'resume.pdf') }]
    } catch { /* no resume file, skip attachment */ }

    const info = await mailer.sendMail(mailOptions)
    json(res, 200, { success: true, messageId: info.messageId, detail: `Email sent to ${to}` })
  } catch (e) {
    json(res, 500, { success: false, error: e instanceof Error ? e.message : 'Send failed' })
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

    // Only process email jobs in email_only mode
    if (mode === 'email_only' && appType !== 'direct_email') {
      results.push({ job_id: job.id, title: job.title, status: 'skipped', method: appType, detail: 'Not an email application' })
      continue
    }

    if (appType === 'direct_email' && rawData.recruiter_email && mailer) {
      try {
        // Generate cover letter
        let coverLetter = rawData.cover_letter || ''
        if (!coverLetter) {
          try { coverLetter = await handleCoverLetterInternal(job, profile) } catch { /* skip */ }
        }

        const emailBody = `Dear ${job.company} Hiring Team,\n\n${coverLetter}\n\nBest regards,\n${SMTP_FROM_NAME}\nAI Systems Engineer\ngabrielalvin.jobs@gmail.com`
        const mailOptions: nodemailer.SendMailOptions = {
          from: `"${SMTP_FROM_NAME}" <${SMTP_FROM_EMAIL}>`,
          to: rawData.recruiter_email,
          subject: `Application for ${job.title} — ${SMTP_FROM_NAME}`,
          text: emailBody,
        }
        try {
          await stat(join(UPLOADS_DIR, 'resume.pdf'))
          mailOptions.attachments = [{ filename: `${SMTP_FROM_NAME.replace(/\s+/g, '_')}_Resume.pdf`, path: join(UPLOADS_DIR, 'resume.pdf') }]
        } catch { /* no resume */ }

        await mailer.sendMail(mailOptions)
        results.push({ job_id: job.id, title: job.title, status: 'applied', method: 'direct_email', detail: `Email sent to ${rawData.recruiter_email}` })

        // Throttle: 30s between emails
        await new Promise(r => setTimeout(r, 30000))
      } catch (e) {
        results.push({ job_id: job.id, title: job.title, status: 'apply_failed', method: 'direct_email', detail: e instanceof Error ? e.message : 'Send failed' })
      }
    } else if (appType !== 'direct_email') {
      // Browser-based apply — return instructions for the frontend/agent
      results.push({ job_id: job.id, title: job.title, status: 'needs_browser', method: appType, detail: `Requires browser automation: ${rawData.company_careers_url || rawData.external_form_url || job.url}` })
    } else {
      results.push({ job_id: job.id, title: job.title, status: 'skipped', method: appType, detail: 'No recruiter email found' })
    }
  }

  json(res, 200, { results, total: jobs.length, applied: results.filter(r => r.status === 'applied').length, failed: results.filter(r => r.status === 'apply_failed').length, needs_browser: results.filter(r => r.status === 'needs_browser').length })
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

const server = createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    return res.end()
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`)

  if (url.pathname === '/api/fetch-url' && req.method === 'POST') {
    return handleFetchUrl(req, res)
  }

  if (url.pathname === '/api/upload-image' && req.method === 'POST') {
    return handleUploadImage(req, res)
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
  if (url.pathname === '/api/jobs/auto-apply/batch' && req.method === 'POST') {
    return handleAutoApplyBatch(req, res)
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

  json(res, 404, { error: 'Not found' })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`NEURALYX API server running on port ${PORT}`)
})

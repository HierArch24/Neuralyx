import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { writeFile, mkdir, readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.PORT || 8080)
const UPLOADS_DIR = process.env.UPLOADS_DIR || '/app/uploads'
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
      num_pages: '1',
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
        }),
      },
    )
    if (res.ok) {
      const data = await res.json()
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
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

  const systemPrompt = `You are Gabriel Alvin, an AI Systems Engineer writing a cover letter. You position yourself as a Solution Engineer who designs, builds, and deploys end-to-end systems — NOT just a coder.

Writing style:
- Professional but personable
- Lead with SYSTEM DESIGN capability, not individual skills
- Reference specific projects from your portfolio
- Show you understand the company's needs
- 3-4 paragraphs, concise

Portfolio highlights to reference: ${portfolioSignals}

Return the cover letter as plain text (no JSON, no markdown fences).`

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

  const searchQuery = query || 'software engineer'

  // Run all sources
  try {
    const [him, rok, rem, arb, hn, li] = await Promise.allSettled([
      searchHimalayas(searchQuery),
      searchRemoteOK(searchQuery),
      searchRemotive(searchQuery),
      searchArbeitnow(searchQuery),
      searchHackerNews(searchQuery),
      searchLinkedInPublic(searchQuery, location || ''),
    ])
    for (const r of [him, rok, rem, arb, hn, li]) {
      if (r.status === 'fulfilled' && r.value.length) allJobs.push(...r.value)
    }
    if (JSEARCH_API_KEY) {
      const js = await searchJSearch(searchQuery, location || '')
      allJobs.push(...js)
    }
  } catch (e) { errors.push(String(e)) }

  // Deduplicate
  const seen = new Set<string>()
  allJobs = allJobs.filter(j => {
    const key = `${j.title.toLowerCase().trim()}::${j.company.toLowerCase().trim()}`
    if (seen.has(key)) return false
    seen.add(key); return true
  })

  logs.push({ step: 'search', status: 'completed', message: `Found ${allJobs.length} jobs in ${Date.now() - searchStart}ms`, jobs_found: allJobs.length, jobs_matched: 0, jobs_applied: 0 })

  // Step 2: CLASSIFY + MATCH (if AI available)
  let matched = 0
  if ((OPENAI_KEY || GEMINI_KEY) && allJobs.length > 0) {
    const matchStart = Date.now()
    const classifyPrompt = 'Classify job. Return JSON: {"role_type":"fullstack|ai_engineer|ml_engineer|devops|frontend|backend|other","company_bucket":"agency|startup|enterprise|recruiter|direct_client","match_score":0-100}. Score based on: AI Systems Engineer, 8 years experience, Vue.js, TypeScript, Python, Docker, OpenAI, Supabase, n8n.'

    // Process top 30 jobs max to avoid timeout
    const toProcess = allJobs.slice(0, 30)
    for (const job of toProcess) {
      try {
        const raw = await callAI(classifyPrompt, `Title: ${job.title}\nCompany: ${job.company}\nDesc: ${(job.description || '').slice(0, 800)}`)
        const parsed = JSON.parse(raw.replace(/^```json\s*\n?/, '').replace(/\n?\s*```\s*$/, '').match(/\{[\s\S]*\}/)?.[0] || '{}')
        if (parsed.match_score) {
          job.match_score = parsed.match_score
          if (parsed.match_score >= (min_score || 50)) matched++
        }
      } catch { /* skip */ }
    }
    logs.push({ step: 'classify_match', status: 'completed', message: `Classified ${toProcess.length} jobs, ${matched} matched in ${Date.now() - matchStart}ms`, jobs_found: 0, jobs_matched: matched, jobs_applied: 0 })
  } else {
    logs.push({ step: 'classify_match', status: 'skipped', message: 'No AI provider configured', jobs_found: 0, jobs_matched: 0, jobs_applied: 0 })
  }

  json(res, 200, {
    run_id: runId,
    jobs: allJobs,
    logs,
    total: allJobs.length,
    matched,
    errors,
  })
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

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
  external_id: string
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

  // Search JSearch (covers Indeed, LinkedIn, Glassdoor, ZipRecruiter, Google)
  if (!platform || ['indeed', 'linkedin', 'glassdoor', 'ziprecruiter', 'google'].includes(platform)) {
    try {
      const jsearchResults = await searchJSearch(query, location || '')
      results.push(...jsearchResults)
    } catch { errors.push('JSearch failed') }
  }

  // Search Adzuna (EU/UK coverage)
  if (!platform || platform === 'adzuna') {
    try {
      const adzunaResults = await searchAdzuna(query, location || '')
      results.push(...adzunaResults)
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

  json(res, 200, { jobs: deduped, total: deduped.length, errors })
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

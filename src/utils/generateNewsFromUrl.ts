const CATEGORIES = ['ai', 'tool', 'mcp', 'ai-agent', 'skills', 'platform', 'ai-model', '3d-gen', 'automation', 'web', 'mobile', 'devops', 'general'] as const

export interface GeneratedArticle {
  title: string
  slug: string
  summary: string
  content: string
  category: string
  image_url: string
  link_url: string
}

interface ExtractedPage {
  title: string
  description: string
  ogImage: string
  favicon: string
  siteName: string
  textContent: string
}

/**
 * Fetches a URL, extracts content, and uses OpenAI GPT-4o-mini to generate
 * a news article written as Gabriel Alvin sharing a discovery.
 */
export async function generateNewsFromUrl(
  url: string,
  apiKey: string,
  onStatus?: (msg: string) => void,
): Promise<GeneratedArticle> {
  // Step 1: Fetch URL content via CORS proxy
  onStatus?.('Fetching page content...')
  const html = await fetchWithProxy(url)

  // Step 2: Extract metadata and text
  onStatus?.('Extracting metadata...')
  const extracted = extractFromHTML(html, url)

  // Step 3: Generate article via OpenAI
  onStatus?.('Generating article with AI...')
  const article = await callOpenAI(extracted, url, apiKey)

  // Step 4: If no image, try screenshot → DALL-E
  if (!article.image_url) {
    const { generateThumbnail } = await import('./generateThumbnail')
    const thumb = await generateThumbnail(
      article.title, article.category, article.summary, url, apiKey, onStatus,
    )
    if (thumb) article.image_url = thumb.url
  }

  return article
}

async function fetchWithProxy(url: string): Promise<string> {
  // Use our MCP API server as proxy (no CORS issues)
  const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
  try {
    const res = await fetch(`${mcpUrl}/api/fetch-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    if (res.ok) {
      const data = await res.json()
      return data.html
    }
  } catch {
    // MCP server not available, try fallback
  }

  // Fallback: try direct fetch (works for CORS-enabled sites)
  try {
    const direct = await fetch(url, {
      headers: { 'Accept': 'text/html' },
    })
    if (direct.ok) return await direct.text()
  } catch {
    // CORS blocked
  }

  // Fallback: CORS proxies
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ]
  for (const proxyUrl of proxies) {
    try {
      const res = await fetch(proxyUrl)
      if (res.ok) return await res.text()
    } catch { /* try next */ }
  }

  throw new Error('Failed to fetch URL. Make sure the MCP server is running (docker compose up -d).')
}

function extractFromHTML(html: string, sourceUrl: string): ExtractedPage {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const getMeta = (attr: string, value: string): string => {
    const el = doc.querySelector(`meta[${attr}="${value}"]`)
    return el?.getAttribute('content') || ''
  }

  const title = getMeta('property', 'og:title')
    || getMeta('name', 'twitter:title')
    || doc.querySelector('title')?.textContent?.trim()
    || ''

  const description = getMeta('property', 'og:description')
    || getMeta('name', 'twitter:description')
    || getMeta('name', 'description')

  // Image: OG > twitter > apple-touch-icon > favicon
  let ogImage = getMeta('property', 'og:image')
    || getMeta('name', 'twitter:image')
    || getMeta('name', 'twitter:image:src')

  let favicon = ''
  const appleIcon = doc.querySelector('link[rel="apple-touch-icon"]')
  if (appleIcon) favicon = appleIcon.getAttribute('href') || ''
  if (!favicon) {
    const icon = doc.querySelector('link[rel="icon"], link[rel="shortcut icon"]')
    if (icon) favicon = icon.getAttribute('href') || ''
  }

  // Resolve relative URLs
  const base = new URL(sourceUrl)
  if (ogImage && !ogImage.startsWith('http')) ogImage = new URL(ogImage, base).href
  if (favicon && !favicon.startsWith('http')) favicon = new URL(favicon, base).href

  const siteName = getMeta('property', 'og:site_name') || base.hostname.replace('www.', '')

  // Extract text content
  // Remove non-content elements
  const clone = doc.body?.cloneNode(true) as HTMLElement
  if (clone) {
    clone.querySelectorAll('script, style, nav, footer, header, aside, [role="navigation"], [role="banner"]')
      .forEach(el => el.remove())
  }

  let textContent = (clone?.textContent || '')
    .replace(/\s+/g, ' ')
    .trim()

  if (textContent.length > 4000) {
    textContent = textContent.slice(0, 4000) + '...'
  }

  return { title, description, ogImage, favicon, siteName, textContent }
}

async function callOpenAI(page: ExtractedPage, sourceUrl: string, apiKey: string): Promise<GeneratedArticle> {
  const systemPrompt = `You are Gabriel Alvin, an AI Systems Engineer who shares tech discoveries, tools, and industry news on his portfolio. You write in first person, sharing things you've found interesting, tools you're utilizing, or news you want to share with your audience.

Your writing style:
- First person, conversational but professional ("I recently discovered...", "This caught my attention...", "I've been exploring...")
- Eye-catching and descriptive — hook the reader immediately
- Show genuine enthusiasm for the tech
- Include practical insights about why it matters
- Keep it concise but informative

Output a JSON object with these exact fields:
{
  "title": "A concise, eye-catching news title (max 80 chars)",
  "slug": "url-friendly-slug-from-title",
  "summary": "2-3 sentences for the card preview. Hook the reader. Written as Gabriel sharing this discovery.",
  "content": "HTML-formatted article body using <h2>, <p>, <strong>, <a href>, <ul><li> tags. 3-5 paragraphs. Written as Gabriel Alvin sharing this with his audience. Include why it's interesting, what it does, and your take on it.",
  "category": "one of: ${CATEGORIES.join(', ')}",
  "image_url": "best thumbnail URL from the extracted data, or empty string"
}

IMPORTANT for image_url:
- Use the OG image if available and it looks like a proper thumbnail/hero image
- If no good image, return empty string
- Never make up image URLs

IMPORTANT for category:
- Choose the most specific matching category
- "tool" for new software tools/products
- "ai" for general AI news
- "ai-agent" for autonomous agent related content
- "ai-model" for new model releases/benchmarks
- "mcp" for Model Context Protocol related
- "platform" for platform/service announcements

Return ONLY valid JSON, no markdown code fences.`

  const userPrompt = `Generate a news article from this webpage:

URL: ${sourceUrl}
Page Title: ${page.title}
Description: ${page.description}
Site: ${page.siteName}
OG Image: ${page.ogImage}
Favicon/Logo: ${page.favicon}

Page Content:
${page.textContent}`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.2',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenAI API error ${res.status}: ${errText}`)
  }

  const data = await res.json()
  const raw: string = data.choices[0].message.content.trim()

  // Parse JSON (strip markdown fences if GPT adds them)
  const jsonStr = raw.replace(/^```json\s*/, '').replace(/\s*```$/, '')
  const article = JSON.parse(jsonStr) as GeneratedArticle

  // Validate category
  if (!CATEGORIES.includes(article.category as typeof CATEGORIES[number])) {
    article.category = 'general'
  }

  // Fallback to OG image
  if (!article.image_url && page.ogImage) {
    article.image_url = page.ogImage
  }

  // Always include source URL
  article.link_url = sourceUrl

  return article
}

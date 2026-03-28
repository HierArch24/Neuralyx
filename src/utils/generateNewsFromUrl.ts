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
 * Fetches a URL, extracts content, and uses OpenAI to generate a news article.
 * Works both locally (MCP server) and online (CORS proxy fallbacks).
 */
export async function generateNewsFromUrl(
  url: string,
  apiKey: string,
  onStatus?: (msg: string) => void,
): Promise<GeneratedArticle> {
  onStatus?.('Fetching page content...')
  const html = await fetchWithProxy(url)

  onStatus?.('Extracting metadata...')
  const extracted = extractFromHTML(html, url)

  onStatus?.('Generating article with AI...')
  const article = await callOpenAI(extracted, url, apiKey)

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
  const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'

  // Try MCP server first (local Docker)
  try {
    const res = await fetch(`${mcpUrl}/api/fetch-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const data = await res.json()
      return data.html
    }
  } catch {
    // MCP server not available — use fallbacks
  }

  // Fallback: CORS proxies (works online)
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ]
  for (const proxyUrl of proxies) {
    try {
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) })
      if (res.ok) return await res.text()
    } catch { /* try next */ }
  }

  // Last resort: direct fetch (works for CORS-enabled sites)
  try {
    const direct = await fetch(url, { headers: { 'Accept': 'text/html' } })
    if (direct.ok) return await direct.text()
  } catch { /* CORS blocked */ }

  throw new Error('Could not fetch page content. The site may be blocking requests.')
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

  const base = new URL(sourceUrl)
  if (ogImage && !ogImage.startsWith('http')) ogImage = new URL(ogImage, base).href
  if (favicon && !favicon.startsWith('http')) favicon = new URL(favicon, base).href

  const siteName = getMeta('property', 'og:site_name') || base.hostname.replace('www.', '')

  const clone = doc.body?.cloneNode(true) as HTMLElement
  if (clone) {
    clone.querySelectorAll('script, style, nav, footer, header, aside, [role="navigation"], [role="banner"]')
      .forEach(el => el.remove())
  }

  let textContent = (clone?.textContent || '').replace(/\s+/g, ' ').trim()
  if (textContent.length > 4000) textContent = textContent.slice(0, 4000) + '...'

  return { title, description, ogImage, favicon, siteName, textContent }
}

function buildPrompts(page: ExtractedPage, sourceUrl: string) {
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

  return { systemPrompt, userPrompt }
}

function parseArticleResponse(raw: string, page: ExtractedPage, sourceUrl: string): GeneratedArticle {
  // Strip markdown code fences (```json ... ```) with flexible whitespace
  let jsonStr = raw.trim()
  jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '')

  // If still not valid JSON, try to extract JSON object
  if (!jsonStr.startsWith('{')) {
    const match = jsonStr.match(/\{[\s\S]*\}/)
    if (match) jsonStr = match[0]
  }

  const article = JSON.parse(jsonStr) as GeneratedArticle

  if (!CATEGORIES.includes(article.category as typeof CATEGORIES[number])) {
    article.category = 'general'
  }
  if (!article.image_url && page.ogImage) {
    article.image_url = page.ogImage
  }
  // Ensure content is never empty — use summary as fallback
  if (!article.content && article.summary) {
    article.content = `<p>${article.summary}</p>`
  }
  article.link_url = sourceUrl
  return article
}

async function callOpenAI(page: ExtractedPage, sourceUrl: string, apiKey: string): Promise<GeneratedArticle> {
  const { systemPrompt, userPrompt } = buildPrompts(page, sourceUrl)

  // Try OpenAI first
  try {
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

    if (res.ok) {
      const data = await res.json()
      const raw: string = data.choices[0].message.content.trim()
      return parseArticleResponse(raw, page, sourceUrl)
    }

    // Check if quota/billing error — fall through to Gemini
    const errText = await res.text()
    const isQuotaError = errText.includes('insufficient_quota') || errText.includes('billing') || res.status === 429
    if (!isQuotaError) {
      throw new Error(`OpenAI API error ${res.status}: ${errText}`)
    }
    console.warn('OpenAI quota exceeded, falling back to Gemini...')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('OpenAI API error')) throw e
    console.warn('OpenAI failed, trying Gemini:', msg)
  }

  // Fallback: Google Gemini
  return callGemini(page, sourceUrl)
}

async function callGemini(page: ExtractedPage, sourceUrl: string): Promise<GeneratedArticle> {
  const geminiKey = import.meta.env.VITE_GEMINI_KEY || ''
  if (!geminiKey) {
    throw new Error('OpenAI quota exceeded and no Gemini API key configured (VITE_GEMINI_KEY)')
  }

  const { systemPrompt, userPrompt } = buildPrompts(page, sourceUrl)

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
      }),
    },
  )

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${errText}`)
  }

  const data = await res.json()
  const raw: string = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
  if (!raw) throw new Error('Gemini returned empty response')

  return parseArticleResponse(raw, page, sourceUrl)
}

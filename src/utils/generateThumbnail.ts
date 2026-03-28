/**
 * Thumbnail generation pipeline for news articles.
 * Works both locally (via MCP server) and online (direct API calls).
 * Tries in order: 1) Screenshot via microlink  2) DALL-E generation  3) null
 */

const getMcpUrl = () => import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'

export interface ThumbnailResult {
  url: string
  method: 'screenshot' | 'dalle' | 'proxy'
}

/**
 * Check if MCP server is reachable (local Docker)
 */
async function isMcpAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${getMcpUrl()}/api/health`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    // Also try a simple HEAD to uploads
    try {
      const res = await fetch(getMcpUrl(), { method: 'HEAD', signal: AbortSignal.timeout(2000) })
      return res.ok || res.status === 404
    } catch {
      return false
    }
  }
}

/**
 * Take a screenshot via microlink.io (works from anywhere)
 */
async function screenshotDirect(sourceUrl: string): Promise<string | null> {
  try {
    const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(sourceUrl)}&screenshot=true&meta=false&embed=screenshot.url`
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    // microlink with embed returns the image directly
    const contentType = res.headers.get('content-type') || ''
    if (contentType.startsWith('image/')) {
      // Convert to blob URL or data URI
      const blob = await res.blob()
      return URL.createObjectURL(blob)
    }
    // If JSON response, extract screenshot URL
    const data = await res.json()
    return data?.data?.screenshot?.url || null
  } catch {
    return null
  }
}

/**
 * Take a screenshot via MCP server (local Docker)
 */
async function screenshotViaMcp(sourceUrl: string): Promise<ThumbnailResult | null> {
  try {
    const res = await fetch(`${getMcpUrl()}/api/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: sourceUrl }),
    })
    if (!res.ok) return null
    const { url } = await res.json()
    return { url: `${getMcpUrl()}${url}`, method: 'screenshot' }
  } catch {
    return null
  }
}

/**
 * Proxy an external image URL through MCP server
 */
async function proxyViaMcp(imageUrl: string): Promise<ThumbnailResult | null> {
  try {
    const res = await fetch(`${getMcpUrl()}/api/proxy-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: imageUrl }),
    })
    if (!res.ok) return null
    const { url } = await res.json()
    return { url: `${getMcpUrl()}${url}`, method: 'proxy' }
  } catch {
    return null
  }
}

/**
 * Generate an image using DALL-E 3 based on article context
 */
export async function generateDalleImage(
  title: string,
  category: string,
  _summary: string,
  apiKey: string,
): Promise<ThumbnailResult | null> {
  const CATEGORY_VISUALS: Record<string, string> = {
    ai: 'neural network, digital brain, blue and purple neon',
    tool: 'developer workstation, code editor, sleek tech tool',
    mcp: 'connected nodes, protocol diagram, purple network',
    'ai-agent': 'autonomous robot, multi-agent swarm, futuristic AI',
    skills: 'learning path, skill tree, knowledge graph',
    platform: 'cloud platform, dashboard interface, SaaS',
    'ai-model': 'large language model, transformer architecture, GPU cluster',
    '3d-gen': '3D render, generative mesh, volumetric art',
    automation: 'automated pipeline, robotic workflow, gears and circuits',
    web: 'web interface, responsive design, browser window',
    mobile: 'mobile app, smartphone interface, iOS/Android',
    devops: 'deployment pipeline, containers, server infrastructure',
    general: 'technology, digital innovation, modern tech',
  }

  const visual = CATEGORY_VISUALS[category] || CATEGORY_VISUALS.general
  const prompt = `Clean, modern tech blog thumbnail. Theme: ${visual}. Representing: "${title}". Style: minimal, professional, dark background with vibrant accent colors (purple, cyan, blue). No text, no words, no letters. Abstract tech illustration, 16:9 aspect ratio.`

  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1792x1024',
        quality: 'standard',
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('DALL-E error:', err)
      return null
    }

    const data = await res.json()
    const dalleUrl = data.data?.[0]?.url
    if (!dalleUrl) return null

    // Try to proxy through MCP for permanent storage (local only)
    if (await isMcpAvailable()) {
      const proxied = await proxyViaMcp(dalleUrl)
      if (proxied) return { url: proxied.url, method: 'dalle' }
    }

    // Online: use DALL-E URL directly (valid for ~1 hour, but saved to DB immediately)
    return { url: dalleUrl, method: 'dalle' }
  } catch {
    return null
  }
}

/**
 * Full pipeline: try screenshot → DALL-E → null
 * Works both locally and on live deployment
 */
export async function generateThumbnail(
  title: string,
  category: string,
  summary: string,
  sourceUrl: string | null,
  apiKey: string,
  onStatus?: (msg: string) => void,
): Promise<ThumbnailResult | null> {
  const mcpUp = await isMcpAvailable()

  // 1. Try screenshot
  if (sourceUrl) {
    onStatus?.('Taking screenshot of source page...')
    if (mcpUp) {
      const screenshot = await screenshotViaMcp(sourceUrl)
      if (screenshot) return screenshot
    }
    // Fallback: direct microlink (works online)
    const directUrl = await screenshotDirect(sourceUrl)
    if (directUrl) return { url: directUrl, method: 'screenshot' }
  }

  // 2. Try DALL-E generation
  if (apiKey) {
    onStatus?.('Generating image with DALL-E...')
    const dalle = await generateDalleImage(title, category, summary, apiKey)
    if (dalle) return dalle
  }

  onStatus?.('Could not generate thumbnail')
  return null
}

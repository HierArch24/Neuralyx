import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'

const supabase = createClient(supabaseUrl, supabaseKey)

const server = new McpServer({
  name: 'neuralyx',
  version: '1.0.0',
})

// Read tools
server.tool('get_projects', 'Get all portfolio projects', {}, async () => {
  const { data, error } = await supabase.from('projects').select('*').order('sort_order')
  if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
})

server.tool('get_skills', 'Get all skills', {}, async () => {
  const { data, error } = await supabase.from('skills').select('*').order('category')
  if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
})

server.tool('get_tools', 'Get all tools', {}, async () => {
  const { data, error } = await supabase.from('tools').select('*').order('name')
  if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
})

server.tool('get_sections', 'Get all landing page sections', {}, async () => {
  const { data, error } = await supabase.from('sections').select('*').order('sort_order')
  if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
})

server.tool('get_messages', 'Get contact form submissions', {}, async () => {
  const { data, error } = await supabase.from('contact_messages').select('*').order('created_at', { ascending: false })
  if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
})

// Write tools
server.tool(
  'update_section',
  'Update a landing page section',
  {
    slug: z.string().describe('Section slug'),
    title: z.string().optional().describe('Section title'),
    subtitle: z.string().optional().describe('Section subtitle'),
    content: z.string().optional().describe('Section content as JSON string'),
    is_visible: z.boolean().optional().describe('Whether section is visible'),
  },
  async ({ slug, title, subtitle, content, is_visible }) => {
    const updates: Record<string, unknown> = {}
    if (title !== undefined) updates.title = title
    if (subtitle !== undefined) updates.subtitle = subtitle
    if (content !== undefined) updates.content = JSON.parse(content)
    if (is_visible !== undefined) updates.is_visible = is_visible

    const { data, error } = await supabase.from('sections').update(updates).eq('slug', slug).select().single()
    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  },
)

server.tool(
  'create_project',
  'Create a new portfolio project',
  {
    title: z.string().describe('Project title'),
    description: z.string().describe('Project description'),
    category: z.string().describe('Project category (ai, web, automation, mobile, game, other)'),
    tech_stack: z.array(z.string()).describe('Array of technologies used'),
    github_url: z.string().optional().describe('GitHub repository URL'),
    live_url: z.string().optional().describe('Live demo URL'),
    is_featured: z.boolean().optional().describe('Whether to feature on landing page'),
  },
  async ({ title, description, category, tech_stack, github_url, live_url, is_featured }) => {
    const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const { data, error } = await supabase
      .from('projects')
      .insert({ title, slug, description, category, tech_stack, github_url, live_url, is_featured: is_featured ?? false, sort_order: 0 } as never)
      .select()
      .single()
    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  },
)

server.tool(
  'update_project',
  'Update an existing portfolio project',
  {
    id: z.string().describe('Project ID (UUID)'),
    title: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    tech_stack: z.array(z.string()).optional(),
    github_url: z.string().optional(),
    live_url: z.string().optional(),
    is_featured: z.boolean().optional(),
  },
  async ({ id, ...updates }) => {
    const filtered = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined))
    const { data, error } = await supabase.from('projects').update(filtered as never).eq('id', id).select().single()
    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  },
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)

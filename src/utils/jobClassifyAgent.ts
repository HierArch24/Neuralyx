/**
 * Classifier + Matcher + Writer Agents
 * Calls MCP server endpoints or falls back to direct Gemini API
 */

const getMcpUrl = () => import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
const getGeminiKey = () => import.meta.env.VITE_GEMINI_KEY || ''

interface ClassifyResult {
  role_type: string
  company_bucket: string
  confidence: number
}

interface MatchResult {
  match_score: number
  skill_matches: string[]
  skill_gaps: string[]
  reasons: string[]
  recommendation: string
}

async function callGeminiFallback(systemPrompt: string, userPrompt: string): Promise<string> {
  const key = getGeminiKey()
  if (!key) throw new Error('No AI provider available')
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
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
  if (!res.ok) throw new Error(`Gemini error ${res.status}`)
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
}

function parseJSON(raw: string): Record<string, unknown> {
  const clean = raw.replace(/^```json\s*\n?/, '').replace(/\n?\s*```\s*$/, '')
  const match = clean.match(/\{[\s\S]*\}/)
  return match ? JSON.parse(match[0]) : {}
}

export async function classifyJob(title: string, company: string, description?: string): Promise<ClassifyResult> {
  // Try MCP server
  try {
    const res = await fetch(`${getMcpUrl()}/api/jobs/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, company, description }),
      signal: AbortSignal.timeout(15000),
    })
    if (res.ok) return await res.json()
  } catch { /* fall through */ }

  // Fallback: direct Gemini
  const raw = await callGeminiFallback(
    'Classify this job. Return JSON: {"role_type":"fullstack|ai_engineer|ml_engineer|devops|frontend|backend|other","company_bucket":"agency|startup|enterprise|recruiter|direct_client","confidence":85}',
    `Title: ${title}\nCompany: ${company}\nDescription: ${(description || '').slice(0, 1500)}`,
  )
  return parseJSON(raw) as unknown as ClassifyResult
}

export async function matchJob(
  job: { title: string; company: string; description?: string | null; requirements?: string | null },
  profile: { resume_text?: string | null; skills?: string[]; preferred_job_types?: string[]; preferred_locations?: string[] },
): Promise<MatchResult> {
  // Try MCP server
  try {
    const res = await fetch(`${getMcpUrl()}/api/jobs/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...job, ...profile }),
      signal: AbortSignal.timeout(20000),
    })
    if (res.ok) return await res.json()
  } catch { /* fall through */ }

  // Fallback: direct Gemini
  const raw = await callGeminiFallback(
    'Score job match 0-100. Return JSON: {"match_score":75,"skill_matches":["a"],"skill_gaps":["b"],"reasons":["c"],"recommendation":"good_match"}',
    `JOB: ${job.title} at ${job.company}\n${(job.description || '').slice(0, 1500)}\n\nCANDIDATE:\nSkills: ${(profile.skills || []).join(', ')}\nResume: ${(profile.resume_text || '').slice(0, 1000)}`,
  )
  return parseJSON(raw) as unknown as MatchResult
}

export async function generateCoverLetter(
  job: { title: string; company: string; description?: string | null },
  profile: { resume_text?: string | null; skills?: string[] },
  roleType?: string,
  companyBucket?: string,
): Promise<string> {
  // Try MCP server
  try {
    const res = await fetch(`${getMcpUrl()}/api/jobs/cover-letter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...job, ...profile, role_type: roleType, company_bucket: companyBucket }),
      signal: AbortSignal.timeout(30000),
    })
    if (res.ok) {
      const data = await res.json()
      return data.cover_letter || ''
    }
  } catch { /* fall through */ }

  // Fallback: direct Gemini
  return callGeminiFallback(
    'You are Gabriel Alvin, AI Systems Engineer. Write a 3-4 paragraph cover letter. Position as Solution Engineer. Reference NEURALYX portfolio. Plain text only.',
    `Company: ${job.company}\nRole: ${job.title}\nDescription: ${(job.description || '').slice(0, 1500)}\nMy skills: ${(profile.skills || []).join(', ')}`,
  )
}

/**
 * Answer Engine — matches form questions to pre-configured answers
 * Used by all platform apply scripts to auto-fill application forms
 */

import { APPLICANT, MCP_URL } from './applicant-profile'

export function answerQuestion(questionText: string, coverLetter?: string): string {
  const q = questionText.toLowerCase()

  // ═══ PRIORITY 1: CONTACT INFO (check FIRST — most specific) ═══

  // Email — MUST check before "address" pattern
  if (q.includes('email'))
    return APPLICANT.email

  // Phone / Mobile — MUST check before salary (avoids "php" matching)
  if (q.includes('phone') || q.includes('mobile') || q.includes('contact number') || q.includes('sms') || q.includes('text message'))
    return APPLICANT.phone

  // Full name (Family Name, First Name format)
  if (q.includes('family name') || q.includes('last name') || q.includes('surname'))
    return 'Aquino, Gabriel Alvin'

  // First name only
  if (q.includes('first name') && !q.includes('family'))
    return 'Gabriel Alvin'

  // Last name only
  if (q.includes('last name') && !q.includes('first'))
    return 'Aquino'

  // Full name (generic)
  if ((q.includes('your name') || q.includes('full name') || q.includes('complete name')) && !q.includes('company'))
    return APPLICANT.name

  // Current address / home address
  if ((q.includes('current address') || q.includes('home address') || q.includes('street') || q.includes('mailing address')) && !q.includes('email'))
    return APPLICANT.location

  // Equipment / PC / Laptop / Office / Internet
  if (q.includes('equipment') || q.includes('laptop') || q.includes('desktop') || q.includes('pc ') || q.includes('computer') || q.includes('dedicated office') || q.includes('own device'))
    return 'Yes'

  // Internet / connectivity
  if (q.includes('internet') || q.includes('wifi') || q.includes('connection') || q.includes('bandwidth') || q.includes('mbps'))
    return 'Yes'

  // Shift / schedule / overtime
  if (q.includes('night shift') || q.includes('graveyard') || q.includes('overtime') || q.includes('weekend'))
    return 'Yes'

  // Background check / drug test
  if (q.includes('background check') || q.includes('drug test') || q.includes('nbi') || q.includes('clearance'))
    return 'Yes'

  // ═══ PRIORITY 2: VIDEO / RESUME / LINKS ═══

  // Video introduction
  if (q.includes('video') || q.includes('introduction video') || q.includes('video link') || q.includes('video intro') || q.includes('record'))
    return APPLICANT.video_intro

  // Resume / CV link
  if (q.includes('resume') || q.includes('cv link') || q.includes('curriculum'))
    return APPLICANT.resume_url

  // ═══ PRIORITY 3: SALARY (check before generic "experience") ═══

  // Salary — be explicit about format
  if (q.includes('salary') || q.includes('compensation') || q.includes('expected pay') || q.includes('desired pay')) {
    if (q.includes('usd') || q.includes('dollar') || q.includes('$') || q.includes('us ')) return `USD ${APPLICANT.salary_usd}/month`
    if (q.includes('annual') || q.includes('yearly') || q.includes('per year')) return 'PHP 1,200,000 - 1,800,000 per year'
    return `PHP ${APPLICANT.salary_php}/month`
  }

  // ═══ PRIORITY 4: WORK PREFERENCES ═══

  // Work authorization / visa
  if (q.includes('authorized') || q.includes('authorization') || q.includes('visa') || q.includes('sponsorship') || q.includes('legally'))
    return APPLICANT.work_authorization

  // Relocate
  if (q.includes('relocate') || q.includes('relocation'))
    return APPLICANT.willing_relocate

  // Start date / availability
  if (q.includes('start date') || q.includes('when can you start') || q.includes('earliest'))
    return APPLICANT.start_date

  // Available / availability (hours, not start date)
  if (q.includes('available') && !q.includes('start'))
    return 'Available full-time (40+ hours/week), flexible schedule'

  // Remote / WFH
  if (q.includes('remote') || q.includes('work from home') || q.includes('wfh') || q.includes('hybrid'))
    return APPLICANT.willing_wfh

  // Years of experience — INTELLIGENT answers based on real timeline
  if (q.includes('years') && (q.includes('experience') || q.includes('how many') || q.includes('how long'))) {
    // Technologies with accurate year counts (as of 2026)
    // Started career 2019 = ~7-8 years total software engineering

    // 0-1 years (new/not primary skill)
    if (q.includes('.net') || q.includes('asp.net') || q.includes('blazor') || q.includes('wpf')) return '1'
    if (q.includes('c#') && !q.includes('css')) return '1'
    if (q.includes('java') && !q.includes('javascript')) return '1'
    if (q.includes('angular')) return '1'
    if (q.includes('ruby') || q.includes('rails')) return '0'
    if (q.includes('go ') || q.includes('golang')) return '1'
    if (q.includes('rust')) return '0'
    if (q.includes('scala') || q.includes('kotlin') && !q.includes('android')) return '1'
    if (q.includes('swift') || q.includes('ios')) return '1'
    if (q.includes('sap') || q.includes('oracle') || q.includes('salesforce')) return '0'
    if (q.includes('terraform') || q.includes('ansible') || q.includes('puppet')) return '1'
    if (q.includes('kubernetes') || q.includes('k8s')) return '2'

    // 1-2 years (new but actively using — released 2024-2025)
    if (q.includes('mcp') || q.includes('model context protocol')) return '2' // Anthropic released Nov 2024
    if (q.includes('claude') && q.includes('code')) return '2' // Claude Code released 2024
    if (q.includes('crew') || q.includes('crewai')) return '2' // CrewAI released 2024
    if (q.includes('cursor') || q.includes('copilot')) return '2'
    if (q.includes('rag') || q.includes('semantic search') || q.includes('vector')) return '2' // RAG mainstream 2024
    if (q.includes('langchain') || q.includes('langgraph')) return '2' // LangChain released 2023
    if (q.includes('embeddings') || q.includes('pgvector')) return '2'

    // 8 years (core since career start 2019)
    if (q.includes('docker') || q.includes('container')) return '8'
    if (q.includes('devops') || q.includes('dev ops')) return '8'
    if (q.includes('full stack') || q.includes('fullstack') || q.includes('full-stack')) return '8'
    if (q.includes('ci/cd') || q.includes('cicd') || q.includes('github actions')) return '8'
    if (q.includes('aws') || q.includes('amazon web')) return '8'
    if (q.includes('gcp') || q.includes('google cloud')) return '8'
    if (q.includes('azure')) return '5'
    if (q.includes('digital ocean') || q.includes('digitalocean')) return '8'
    if (q.includes('cloud') && !q.includes('azure')) return '8'
    if (q.includes('javascript') || q.includes('js')) return '8'
    if (q.includes('html') || q.includes('css')) return '8'
    if (q.includes('git')) return '8'
    if (q.includes('web development') || q.includes('web dev')) return '8'
    if (q.includes('software engineer') || q.includes('software develop')) return '8'
    if (q.includes('node') || q.includes('nodejs')) return '8'
    if (q.includes('php') || q.includes('laravel')) return '8'

    // 5-7 years (strong experience)
    if (q.includes('ai engineer') || q.includes('ai develop')) return '5'
    if (q.includes('machine learning') || q.includes('ml engineer') || q.includes('ml ')) return '5'
    if (q.includes('mlops') || q.includes('ml ops')) return '5'
    if (q.includes('ai automation') || q.includes('intelligent automation')) return '5'
    if (q.includes('business automation') || q.includes('process automation') || q.includes('rpa')) return '5'
    if (q.includes('marketing automation')) return '5'
    if (q.includes('automation')) return '8'
    if (q.includes('llm') || q.includes('large language') || q.includes('ai tooling')) return '5'
    if (q.includes('deep learning')) return '4'
    if (q.includes('python')) return '7'
    if (q.includes('typescript')) return '6'
    if (q.includes('vue') || q.includes('vuejs')) return '6'
    if (q.includes('react')) return '5'
    if (q.includes('next') || q.includes('nextjs')) return '4'
    if (q.includes('sql') || q.includes('mysql') || q.includes('database')) return '8'
    if (q.includes('postgresql') || q.includes('postgres')) return '6'
    if (q.includes('rest') || q.includes('api')) return '8'
    if (q.includes('mobile') || q.includes('android')) return '5'
    if (q.includes('openai') || q.includes('gpt')) return '4'

    // 3-4 years
    if (q.includes('tailwind')) return '4'
    if (q.includes('supabase')) return '3'
    if (q.includes('fastapi')) return '3'
    if (q.includes('n8n') || q.includes('zapier') || q.includes('make')) return '3'
    if (q.includes('ai agent') || q.includes('agentic')) return '3'

    // Default for generic "years of experience"
    return String(APPLICANT.experience_years)
  }

  // Portfolio / website
  if (q.includes('portfolio') || q.includes('website') || q.includes('url') || q.includes('link'))
    return APPLICANT.portfolio

  // LinkedIn
  if (q.includes('linkedin'))
    return APPLICANT.linkedin

  // GitHub
  if (q.includes('github') || q.includes('git'))
    return APPLICANT.github

  // Tools / platforms
  if (q.includes('platform') || q.includes('tool') || q.includes('software') || q.includes('crm') || q.includes('framework'))
    return 'I have experience with similar platforms and tools including Supabase, PostgreSQL, n8n, Docker, OpenAI API, and custom API integrations. I can quickly adapt to new tools and platforms.'

  // Education
  if (q.includes('education') || q.includes('degree') || q.includes('university') || q.includes('school'))
    return APPLICANT.education

  // Cover letter / why this role / motivation
  if (q.includes('cover letter') || q.includes('why') || q.includes('interest') || q.includes('motivation') || q.includes('apply'))
    return coverLetter || APPLICANT.experience_summary

  // Phone number
  if (q.includes('phone') || q.includes('contact number') || q.includes('mobile'))
    return APPLICANT.phone

  // Location / address / city
  if (q.includes('location') || q.includes('address') || q.includes('city') || q.includes('where do you'))
    return APPLICANT.location

  // Country
  if (q.includes('country'))
    return APPLICANT.country

  // Name
  if (q.includes('name') || q.includes('full name'))
    return APPLICANT.name

  // Hours / availability per week
  if (q.includes('hours') || q.includes('per week') || q.includes('availability'))
    return 'Available full-time (40+ hours/week), flexible schedule, can work any timezone'

  // Notice period
  if (q.includes('notice') || q.includes('when can you start'))
    return APPLICANT.start_date

  // Willing to travel
  if (q.includes('travel') || q.includes('onsite'))
    return 'Prefer remote but open to occasional travel'

  // Languages
  if (q.includes('language') || q.includes('speak') || q.includes('fluent'))
    return 'English (Fluent/Professional), Filipino (Native)'

  // Yes/No detection
  if (q.includes('do you have') || q.includes('are you') || q.includes('can you') || q.includes('will you')) {
    if (q.includes('not') || q.includes('criminal') || q.includes('disability') || q.includes('convicted')) return 'No'
    return 'Yes'
  }

  // Fallback: use cover letter or experience summary
  return coverLetter || APPLICANT.experience_summary
}

/**
 * AI-powered answer fallback — calls MCP server for complex questions
 */
export async function answerWithAI(questionText: string, jobTitle: string, company: string): Promise<string> {
  try {
    const res = await fetch(`${MCP_URL}/api/jobs/cover-letter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: jobTitle,
        company,
        description: `Answer this application question concisely (max 200 words): "${questionText}"`,
        skills: APPLICANT.skills,
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (res.ok) {
      const data = await res.json()
      return data.cover_letter || APPLICANT.experience_summary
    }
  } catch { /* fallback */ }
  return APPLICANT.experience_summary
}

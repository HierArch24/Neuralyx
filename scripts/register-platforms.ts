/**
 * NEURALYX Platform Registration Bot
 *
 * Runs Playwright in HEADED mode (visible browser).
 * Auto-fills all form fields with your resume data.
 * PAUSES at CAPTCHAs for you to solve manually.
 *
 * Usage: npx tsx scripts/register-platforms.ts
 * Or:    npx tsx scripts/register-platforms.ts --platform indeed
 */

import { chromium, Page } from 'playwright'

const PROFILE = {
  email: 'gabrielalvin.jobs@gmail.com',
  password: 'Jobs@2026',
  firstName: 'Gabriel Alvin',
  lastName: 'Aquino',
  fullName: 'Gabriel Alvin Aquino',
  phone: '', // Add your PH phone number
  title: 'AI Systems Engineer',
  location: 'Philippines',
  city: 'Metro Manila',
  experience: '8',
  summary: 'AI Systems Engineer with 8+ years experience. Built NEURALYX portfolio platform (Vue 3, TypeScript, Supabase, Docker). Created AI-powered content engines, agent orchestrators, and MCP servers. Expert in Vue.js, TypeScript, Python, Node.js, Docker, PostgreSQL, OpenAI, LangChain, CrewAI, n8n.',
  skills: ['Vue.js', 'TypeScript', 'Python', 'Node.js', 'Docker', 'PostgreSQL', 'Supabase', 'FastAPI', 'OpenAI API', 'LangChain', 'CrewAI', 'n8n', 'AWS', 'GitHub Actions', 'React', 'TensorFlow', 'PyTorch'],
  portfolioUrl: 'https://neuralyx.ai.dev-environment.site',
  githubUrl: 'https://github.com/HierArch24',
}

async function waitForHuman(page: Page, message: string) {
  console.log(`\n⏸️  HUMAN ACTION NEEDED: ${message}`)
  console.log('   Press Enter in terminal when done...')
  await new Promise<void>(resolve => {
    process.stdin.once('data', () => resolve())
  })
}

async function fillIfExists(page: Page, selector: string, value: string) {
  try {
    const el = await page.$(selector)
    if (el) {
      await el.click()
      await el.fill(value)
      return true
    }
  } catch { /* element not found */ }
  return false
}

async function clickIfExists(page: Page, selector: string) {
  try {
    const el = await page.$(selector)
    if (el) { await el.click(); return true }
  } catch { /* not found */ }
  return false
}

// ─── Platform Registration Functions ───

async function registerIndeed(page: Page) {
  console.log('\n🔵 Registering on Indeed PH...')
  await page.goto('https://secure.indeed.com/auth?hl=en_PH&co=PH')
  await page.waitForLoadState('networkidle')

  await fillIfExists(page, 'input[name="__email"]', PROFILE.email)
  await fillIfExists(page, '#ifl-InputFormField-3', PROFILE.email)
  await clickIfExists(page, 'button[type="submit"]')

  await waitForHuman(page, 'Complete Indeed registration (CAPTCHA, email verification, password setup)')
  console.log('✅ Indeed PH registered')
}

async function registerJobStreet(page: Page) {
  console.log('\n🟣 Registering on JobStreet PH...')
  await page.goto('https://ph.jobstreet.com/oauth/registration')
  await page.waitForLoadState('networkidle')

  await fillIfExists(page, 'input[name="emailAddress"]', PROFILE.email)
  await fillIfExists(page, 'input[name="password"]', PROFILE.password)
  await fillIfExists(page, 'input[name="firstName"]', PROFILE.firstName)
  await fillIfExists(page, 'input[name="lastName"]', PROFILE.lastName)

  await waitForHuman(page, 'Complete JobStreet registration (CAPTCHA, terms, email verify)')
  console.log('✅ JobStreet PH registered')
}

async function registerKalibrr(page: Page) {
  console.log('\n🔷 Registering on Kalibrr...')
  await page.goto('https://www.kalibrr.com/signup')
  await page.waitForLoadState('networkidle')

  await fillIfExists(page, 'input[name="email"]', PROFILE.email)
  await fillIfExists(page, 'input[name="password"]', PROFILE.password)
  await fillIfExists(page, 'input[name="first_name"]', PROFILE.firstName)
  await fillIfExists(page, 'input[name="last_name"]', PROFILE.lastName)

  await waitForHuman(page, 'Complete Kalibrr registration (CAPTCHA, email verify, skills assessment)')
  console.log('✅ Kalibrr registered')
}

async function registerOnlineJobs(page: Page) {
  console.log('\n🟠 Registering on OnlineJobs.ph...')
  await page.goto('https://www.onlinejobs.ph/jobseekers/register')
  await page.waitForLoadState('networkidle')

  await fillIfExists(page, 'input[name="email"]', PROFILE.email)
  await fillIfExists(page, 'input[name="password"]', PROFILE.password)
  await fillIfExists(page, 'input[name="password_confirmation"]', PROFILE.password)
  await fillIfExists(page, 'input[name="first_name"]', PROFILE.firstName)
  await fillIfExists(page, 'input[name="last_name"]', PROFILE.lastName)

  await waitForHuman(page, 'Complete OnlineJobs.ph registration (CAPTCHA, terms, email verify)')
  console.log('✅ OnlineJobs.ph registered')
}

async function registerBossjob(page: Page) {
  console.log('\n🟡 Registering on Bossjob...')
  await page.goto('https://www.bossjob.ph/register')
  await page.waitForLoadState('networkidle')

  await fillIfExists(page, 'input[type="email"]', PROFILE.email)
  await fillIfExists(page, 'input[type="password"]', PROFILE.password)
  await fillIfExists(page, 'input[name="name"]', PROFILE.fullName)

  await waitForHuman(page, 'Complete Bossjob registration (CAPTCHA, email verify)')
  console.log('✅ Bossjob registered')
}

async function registerVirtualStaff(page: Page) {
  console.log('\n👤 Registering on VirtualStaff.ph...')
  await page.goto('https://www.virtualstaff.ph/signup/worker')
  await page.waitForLoadState('networkidle')

  await fillIfExists(page, 'input[name="email"]', PROFILE.email)
  await fillIfExists(page, 'input[name="password"]', PROFILE.password)
  await fillIfExists(page, 'input[name="first_name"]', PROFILE.firstName)
  await fillIfExists(page, 'input[name="last_name"]', PROFILE.lastName)

  await waitForHuman(page, 'Complete VirtualStaff.ph registration')
  console.log('✅ VirtualStaff.ph registered')
}

async function registerGlassdoor(page: Page) {
  console.log('\n🟢 Registering on Glassdoor...')
  await page.goto('https://www.glassdoor.com/member/join.htm')
  await page.waitForLoadState('networkidle')

  await fillIfExists(page, 'input[name="email"]', PROFILE.email)
  await fillIfExists(page, 'input[name="password"]', PROFILE.password)

  await waitForHuman(page, 'Complete Glassdoor registration (Google signup or email)')
  console.log('✅ Glassdoor registered')
}

async function registerUpwork(page: Page) {
  console.log('\n🟩 Registering on Upwork...')
  await page.goto('https://www.upwork.com/signup')
  await page.waitForLoadState('networkidle')

  await waitForHuman(page, 'Complete Upwork registration (requires full profile setup, skills, portfolio)')
  console.log('✅ Upwork registered')
}

async function registerMynimo(page: Page) {
  console.log('\n📍 Registering on Mynimo...')
  await page.goto('https://www.mynimo.com/register')
  await page.waitForLoadState('networkidle')

  await fillIfExists(page, 'input[name="email"]', PROFILE.email)
  await fillIfExists(page, 'input[name="password"]', PROFILE.password)
  await fillIfExists(page, 'input[name="first_name"]', PROFILE.firstName)
  await fillIfExists(page, 'input[name="last_name"]', PROFILE.lastName)

  await waitForHuman(page, 'Complete Mynimo registration')
  console.log('✅ Mynimo registered')
}

async function registerBruntWork(page: Page) {
  console.log('\n💼 Registering on BruntWork...')
  await page.goto('https://www.bruntworkcareers.co/philippines-job-application/')
  await page.waitForLoadState('networkidle')

  await waitForHuman(page, 'Complete BruntWork application/registration')
  console.log('✅ BruntWork registered')
}

// ─── Main ───

const PLATFORMS: Record<string, (page: Page) => Promise<void>> = {
  indeed: registerIndeed,
  jobstreet: registerJobStreet,
  kalibrr: registerKalibrr,
  onlinejobs: registerOnlineJobs,
  bossjob: registerBossjob,
  virtualstaff: registerVirtualStaff,
  glassdoor: registerGlassdoor,
  upwork: registerUpwork,
  mynimo: registerMynimo,
  bruntwork: registerBruntWork,
}

async function main() {
  const targetPlatform = process.argv[2]?.replace('--platform=', '').replace('--platform', '').trim()

  console.log('🚀 NEURALYX Platform Registration Bot')
  console.log('======================================')
  console.log(`Email: ${PROFILE.email}`)
  console.log(`Name: ${PROFILE.fullName}`)
  console.log(`Title: ${PROFILE.title}`)
  console.log('')

  const browser = await chromium.launch({
    headless: false,  // VISIBLE browser
    slowMo: 500,      // Slow down so you can see actions
  })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()

  const platformsToRegister = targetPlatform
    ? { [targetPlatform]: PLATFORMS[targetPlatform] }
    : PLATFORMS

  for (const [name, registerFn] of Object.entries(platformsToRegister)) {
    if (!registerFn) {
      console.log(`⚠️  Unknown platform: ${name}`)
      continue
    }
    try {
      await registerFn(page)
    } catch (e) {
      console.error(`❌ ${name} registration failed:`, e)
    }
  }

  console.log('\n✅ ALL REGISTRATIONS COMPLETE')
  console.log('Close the browser window when ready.')

  // Keep browser open until manually closed
  await page.waitForTimeout(999999999)
}

main().catch(console.error)

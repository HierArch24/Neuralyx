/**
 * Login to ALL registered platforms using Microsoft Edge
 * Uses existing Edge Profile 7 (gabrielalvin.jobs@gmail.com)
 * Opens all platforms in separate tabs
 *
 * Usage: npx tsx scripts/login-platforms.ts
 */

import { chromium } from 'playwright'
import { join } from 'path'

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const USER_DATA = join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'User Data')
const PROFILE = 'Profile 7' // gabrielalvin.jobs@gmail.com

const PLATFORMS = [
  { name: 'Indeed PH', url: 'https://ph.indeed.com', login: 'https://secure.indeed.com/auth?hl=en_PH&co=PH', profile: 'https://ph.indeed.com/my/profile' },
  { name: 'LinkedIn', url: 'https://linkedin.com', login: 'https://linkedin.com/login', profile: 'https://linkedin.com/in/me' },
  { name: 'Glassdoor', url: 'https://glassdoor.com', login: 'https://glassdoor.com/member/home', profile: 'https://glassdoor.com/member/profile' },
  { name: 'ZipRecruiter', url: 'https://ziprecruiter.com', login: 'https://ziprecruiter.com/login', profile: 'https://ziprecruiter.com/profile' },
  { name: 'JobStreet PH', url: 'https://ph.jobstreet.com', login: 'https://ph.jobstreet.com/login', profile: 'https://ph.jobstreet.com/profile' },
  { name: 'Kalibrr', url: 'https://kalibrr.com', login: 'https://kalibrr.com/login', profile: 'https://kalibrr.com/home/profile' },
  { name: 'OnlineJobs.ph', url: 'https://onlinejobs.ph', login: 'https://onlinejobs.ph/jobseekers/login', profile: 'https://onlinejobs.ph/jobseekers/profile' },
  { name: 'Bossjob', url: 'https://bossjob.ph', login: 'https://bossjob.ph/login', profile: 'https://bossjob.ph/my/profile' },
  { name: 'CareerBuilder', url: 'https://careerbuilder.com', login: 'https://careerbuilder.com/user/sign-in', profile: 'https://careerbuilder.com/my/profile' },
  { name: 'Freelancer', url: 'https://freelancer.com', login: 'https://freelancer.com/login', profile: 'https://freelancer.com/u/' },
]

async function main() {
  console.log('🚀 NEURALYX Platform Login — Microsoft Edge')
  console.log(`📧 Profile: ${PROFILE} (gabrielalvin.jobs@gmail.com)`)
  console.log(`🌐 Opening ${PLATFORMS.length} platforms in tabs...\n`)

  // Launch Edge with existing profile (keeps all cookies/sessions)
  const browser = await chromium.launchPersistentContext(
    join(USER_DATA, PROFILE),
    {
      executablePath: EDGE_PATH,
      headless: false,
      channel: 'msedge',
      args: [
        '--no-first-run',
        '--disable-blink-features=AutomationControlled',
        `--profile-directory=${PROFILE}`,
      ],
      viewport: { width: 1400, height: 900 },
      ignoreDefaultArgs: ['--enable-automation'],
    }
  )

  // Open each platform in a new tab
  for (const platform of PLATFORMS) {
    console.log(`📑 ${platform.name}...`)
    try {
      const page = await browser.newPage()
      // Go to main page first (may already be logged in from Edge profile)
      await page.goto(platform.url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
      console.log(`  ✅ Opened: ${platform.name}`)
    } catch (e) {
      console.log(`  ⚠️ ${platform.name}: ${e}`)
    }
  }

  console.log(`\n✅ All ${PLATFORMS.length} tabs opened in Edge!`)
  console.log('📌 Since you already signed in with this Edge profile,')
  console.log('   most platforms should already be logged in.')
  console.log('📌 Check each tab and complete any missing logins.')
  console.log('📌 Close the browser when done.\n')

  // Keep open
  await new Promise(() => {})
}

main().catch(console.error)

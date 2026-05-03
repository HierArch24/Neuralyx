/**
 * Login to ALL registered platforms using Microsoft Edge
 * Connects to your EXISTING Edge via CDP — no new browser, no session wipes
 *
 * Step 1: Open Edge with: msedge.exe --remote-debugging-port=9222 --profile-directory="Profile 7"
 * Step 2: Run: npx tsx scripts/login-platforms.ts
 *
 * Or just run this script — it will launch Edge if not already running.
 */

import { chromium, Browser, BrowserContext } from 'playwright'
import { execSync } from 'child_process'

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PROFILE = 'Profile 7'
const CDP_PORT = 9222

const PLATFORMS = [
  { name: 'Indeed PH', url: 'https://ph.indeed.com' },
  { name: 'LinkedIn', url: 'https://linkedin.com' },
  { name: 'Glassdoor', url: 'https://glassdoor.com' },
  { name: 'ZipRecruiter', url: 'https://ziprecruiter.com' },
  { name: 'JobStreet PH', url: 'https://ph.jobstreet.com' },
  { name: 'Kalibrr', url: 'https://kalibrr.com' },
  { name: 'OnlineJobs.ph', url: 'https://onlinejobs.ph' },
  { name: 'Bossjob', url: 'https://bossjob.ph' },
  { name: 'Freelancer', url: 'https://freelancer.com' },
  { name: 'RemoteRocketship', url: 'https://www.remoterocketship.com' },
  { name: 'Jooble', url: 'https://jooble.org' },
]

async function connectToEdge(): Promise<{ browser: Browser; context: BrowserContext }> {
  // Try connecting to existing Edge with CDP already enabled
  try {
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const context = browser.contexts()[0] || await browser.newContext()
    console.log('Connected to existing Edge with CDP!')
    return { browser, context }
  } catch { /* not running with CDP */ }

  // Edge may be running without CDP — need to restart it
  // Check if Edge is running at all
  try {
    const result = execSync('tasklist /FI "IMAGENAME eq msedge.exe" /NH', { encoding: 'utf8' })
    if (result.includes('msedge.exe')) {
      console.log('Edge is running but without CDP. Closing Edge...')
      console.log('(Your tabs will be restored when Edge reopens)')
      execSync('taskkill /F /IM msedge.exe /T', { stdio: 'ignore' })
      await new Promise(r => setTimeout(r, 3000)) // Wait for full shutdown
    }
  } catch { /* no Edge running */ }

  // Launch Edge fresh with CDP + correct profile
  console.log('Launching Edge with CDP enabled...')
  const cmd = `"${EDGE_PATH}" --remote-debugging-port=${CDP_PORT} --profile-directory="${PROFILE}" --no-first-run --restore-last-session`
  execSync(`start "" ${cmd}`, { shell: 'cmd.exe', stdio: 'ignore' })

  // Wait for CDP to become available
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1000))
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
      const context = browser.contexts()[0] || await browser.newContext()
      console.log('Connected to Edge via CDP!')
      return { browser, context }
    } catch { /* retry */ }
  }

  throw new Error('Could not connect to Edge CDP after 20 seconds')
}

async function main() {
  console.log('NEURALYX Platform Login — Microsoft Edge (CDP)')
  console.log(`Profile: ${PROFILE} (gabrielalvin.jobs@gmail.com)`)
  console.log(`Opening ${PLATFORMS.length} platforms in tabs...\n`)

  const { browser, context } = await connectToEdge()

  for (const platform of PLATFORMS) {
    try {
      const page = await context.newPage()
      await page.goto(platform.url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
      console.log(`  [OK] ${platform.name}`)
    } catch (e) {
      console.log(`  [ERR] ${platform.name}: ${e}`)
    }
  }

  console.log(`\nAll ${PLATFORMS.length} tabs opened.`)
  console.log('Log in to any platform that needs it.')
  console.log('Your Edge stays open — sessions are preserved.\n')

  // Disconnect (don't close Edge)
  await browser.close().catch(() => {})
}

main().catch(console.error)

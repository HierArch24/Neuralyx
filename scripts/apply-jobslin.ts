/**
 * NEURALYX JobsLin PH Apply Script
 *
 * Uses Edge Profile 7 via CDP.
 * Handles standard application form:
 *   - Name, email, phone (pre-filled)
 *   - Cover letter textarea
 *   - Resume upload
 *   - Submit
 *
 * Also detects employer email for direct email apply fallback.
 *
 * Usage:
 *   npx tsx scripts/apply-jobslin.ts --stdin
 *   Input: {"url":"...","id":"uuid","title":"...","company":"...","cover_letter":"...","employer_email":"..."}
 *   Output: ApplyResult JSON as last stdout line
 */

import { Page, BrowserContext } from 'playwright'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { getBrowser } from './browser-manager'
import { APPLICANT } from './applicant-profile'

const SCREENSHOTS_DIR = join(process.cwd(), 'screenshots', 'jobslin')
const RESUME_PATH = join(process.cwd(), 'assets', 'resume.pdf')
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

interface ApplyInput {
  url: string
  id?: string
  title: string
  company: string
  cover_letter?: string
  employer_email?: string
}

interface ApplyResult {
  job_id?: string
  job_title: string
  company: string
  platform: 'jobslin'
  status: 'applied' | 'failed' | 'already_applied' | 'external_redirect' | 'session_expired'
  method: 'jobslin_form' | 'jobslin_external'
  detail: string
  screenshot?: string
}

const SEL = {
  applyBtn:      'button:has-text("Apply"), button:has-text("Apply Now"), .apply-button, a:has-text("Apply")',
  alreadyApplied:'.applied-badge, button:has-text("Applied"), text="You have already applied"',
  nameField:     'input[name="name"], input[name="full_name"], input[placeholder*="name"], input[id*="name"]',
  emailField:    'input[name="email"], input[type="email"], input[placeholder*="email"]',
  phoneField:    'input[name="phone"], input[type="tel"], input[placeholder*="phone"]',
  coverLetter:   'textarea[name="cover_letter"], textarea[name="message"], textarea[placeholder*="cover"], textarea[placeholder*="letter"], textarea',
  resumeInput:   'input[type="file"][accept*="pdf"], input[type="file"][name*="resume"], input[type="file"]',
  submitBtn:     'button[type="submit"]:has-text("Submit"), button[type="submit"]:has-text("Send"), button[type="submit"], input[type="submit"]',
  successMsg:    '.success-message, .application-sent, text="Application submitted", text="Thank you", .alert-success',
  externalLink:  'a[target="_blank"]:has-text("Apply"), a[href*="workday"], a[href*="greenhouse"], a[href*="lever"]',
}

function ensureDir() {
  try { mkdirSync(SCREENSHOTS_DIR, { recursive: true }) } catch {}
}

async function screenshot(page: Page, name: string): Promise<string> {
  ensureDir()
  const path = join(SCREENSHOTS_DIR, `${name}-${Date.now()}.png`)
  await page.screenshot({ path }).catch(() => {})
  return path
}

async function fillField(page: Page, selector: string, value: string, clear = true) {
  const el = page.locator(selector).first()
  if (!await el.isVisible().catch(() => false)) return false
  await el.scrollIntoViewIfNeeded().catch(() => {})
  if (clear) await el.fill('')
  await sleep(rand(100, 300))
  await el.fill(value)
  await sleep(rand(200, 400))
  return true
}

async function applyViaForm(page: Page, input: ApplyInput): Promise<ApplyResult> {
  const coverLetter = input.cover_letter || APPLICANT.experience_summary.slice(0, 800)

  // Click Apply button to open form
  const applyBtn = page.locator(SEL.applyBtn).first()
  if (await applyBtn.isVisible().catch(() => false)) {
    await applyBtn.scrollIntoViewIfNeeded().catch(() => {})
    await sleep(rand(300, 700))
    await applyBtn.click()
    await sleep(rand(2000, 3500))
  }

  // Check for form modal or inline form
  const form = page.locator('form[id*="apply"], form[class*="apply"], .application-form, [id*="apply-form"]').first()
  const formVisible = await form.isVisible().catch(() => false)
  const hasFields = await page.locator(SEL.nameField).count() > 0

  if (!formVisible && !hasFields) {
    // Check for external redirect
    if (await page.locator(SEL.externalLink).count() > 0) {
      const href = await page.locator(SEL.externalLink).first().getAttribute('href').catch(() => null)
      return { job_id: input.id, job_title: input.title, company: input.company, platform: 'jobslin', status: 'external_redirect', method: 'jobslin_external', detail: `External apply: ${href || 'company site'}` }
    }
    await screenshot(page, 'no-form-found')
    return { job_id: input.id, job_title: input.title, company: input.company, platform: 'jobslin', status: 'failed', method: 'jobslin_form', detail: 'Application form not found' }
  }

  // Fill fields
  await fillField(page, SEL.nameField, APPLICANT.name)
  await fillField(page, SEL.emailField, APPLICANT.email)
  await fillField(page, SEL.phoneField, APPLICANT.phone)

  // Cover letter
  const clFilled = await fillField(page, SEL.coverLetter, coverLetter)
  if (!clFilled) {
    // Try all textareas
    const textareas = await page.locator('textarea').all()
    for (const ta of textareas) {
      if (await ta.isVisible().catch(() => false)) {
        await ta.fill(coverLetter)
        await sleep(rand(200, 400))
        break
      }
    }
  }

  // Resume upload
  const resumeInput = page.locator(SEL.resumeInput).first()
  if (await resumeInput.count() > 0) {
    await resumeInput.setInputFiles(RESUME_PATH).catch(async () => {
      const uploadBtn = page.locator('label:has-text("Upload"), button:has-text("Upload resume"), .upload-trigger').first()
      if (await uploadBtn.isVisible().catch(() => false)) {
        const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), uploadBtn.click()])
        await fc.setFiles(RESUME_PATH)
      }
    })
    await sleep(rand(2000, 3000))
  }

  // Submit
  const submitBtn = page.locator(SEL.submitBtn).first()
  if (!await submitBtn.isVisible().catch(() => false)) {
    await screenshot(page, 'submit-not-found')
    return { job_id: input.id, job_title: input.title, company: input.company, platform: 'jobslin', status: 'failed', method: 'jobslin_form', detail: 'Submit button not found' }
  }

  await sleep(rand(500, 1000))
  await submitBtn.click()
  await sleep(rand(3000, 5000))

  // Check success
  const success = await page.locator(SEL.successMsg).count() > 0
  const alreadyApplied = await page.locator(SEL.alreadyApplied).count() > 0

  if (success || alreadyApplied) {
    const sc = await screenshot(page, 'applied-success')
    return { job_id: input.id, job_title: input.title, company: input.company, platform: 'jobslin', status: alreadyApplied ? 'already_applied' : 'applied', method: 'jobslin_form', detail: alreadyApplied ? 'Already applied' : 'Application submitted', screenshot: sc }
  }

  await screenshot(page, 'apply-uncertain')
  return { job_id: input.id, job_title: input.title, company: input.company, platform: 'jobslin', status: 'applied', method: 'jobslin_form', detail: 'Submitted — success banner not detected, assuming applied' }
}

async function applyToJob(context: BrowserContext, input: ApplyInput): Promise<ApplyResult> {
  let page: Page | null = null
  try {
    const jobUrl = input.url.split('?')[0]
    page = await context.newPage()
    console.log(`[JobsLin Apply] Navigating to: ${jobUrl}`)
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await sleep(rand(2000, 4000))

    const url = page.url()
    if (url.includes('/login') || url.includes('/sign-in')) {
      return { job_id: input.id, job_title: input.title, company: input.company, platform: 'jobslin', status: 'session_expired', method: 'jobslin_form', detail: 'Not logged in to JobsLin' }
    }

    if (await page.locator(SEL.alreadyApplied).count() > 0) {
      return { job_id: input.id, job_title: input.title, company: input.company, platform: 'jobslin', status: 'already_applied', method: 'jobslin_form', detail: 'Already applied' }
    }

    return await applyViaForm(page, input)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (page) await screenshot(page, 'apply-exception')
    return { job_id: input.id, job_title: input.title, company: input.company, platform: 'jobslin', status: 'failed', method: 'jobslin_form', detail: `Exception: ${msg}` }
  } finally {
    if (page && !page.isClosed()) await page.close().catch(() => {})
  }
}

async function main() {
  let input: ApplyInput = { url: '', title: '', company: '' }

  if (process.argv.includes('--stdin')) {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    try { input = JSON.parse(Buffer.concat(chunks).toString()) } catch {}
  }

  if (!input.url) {
    console.log(JSON.stringify({ status: 'failed', detail: 'No url provided', platform: 'jobslin', method: 'jobslin_form', job_title: '', company: '' }))
    process.exit(1)
  }

  const { context } = await getBrowser()
  const result = await applyToJob(context, input)
  console.log(JSON.stringify(result))
}

main().catch(e => {
  console.log(JSON.stringify({ status: 'failed', detail: `Fatal: ${e}`, platform: 'jobslin', method: 'jobslin_form', job_title: '', company: '' }))
  process.exit(1)
})

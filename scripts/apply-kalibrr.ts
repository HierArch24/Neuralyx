/**
 * NEURALYX Kalibrr Apply Script
 *
 * Uses Edge Profile 7 (logged into kalibrr.com) via CDP.
 * Handles:
 *   - Quick Apply (profile-based, 1 click + cover letter)
 *   - Assessment tests (English, Logic → AI-answered; Technical → skip)
 *   - External redirects → detect and return status='external_redirect'
 *   - Profile completion check before first apply
 *
 * Usage:
 *   npx tsx scripts/apply-kalibrr.ts --stdin
 *   Input: {"url":"https://www.kalibrr.com/job-board/12345","id":"uuid","title":"...","company":"...","cover_letter":"..."}
 *   Output: ApplyResult JSON as last stdout line
 */

import { Page, BrowserContext } from 'playwright'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { getBrowser } from './browser-manager'
import { APPLICANT, MCP_URL } from './applicant-profile'

const SCREENSHOTS_DIR = join(process.cwd(), 'screenshots', 'kalibrr')
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

interface ApplyInput {
  url: string
  id?: string
  title: string
  company: string
  cover_letter?: string
}

interface ApplyResult {
  job_id?: string
  job_title: string
  company: string
  platform: 'kalibrr'
  status: 'applied' | 'failed' | 'already_applied' | 'external_redirect' | 'assessment_skipped' | 'profile_incomplete' | 'session_expired'
  method: 'kalibrr_quick_apply' | 'kalibrr_assessment' | 'kalibrr_external'
  detail: string
  screenshot?: string
}

const SEL = {
  quickApplyBtn: 'button[data-testid="quick-apply-btn"], button:has-text("Quick Apply"), .quick-apply-button',
  applyBtn:      'button[data-testid="apply-btn"], button:has-text("Apply Now"), button:has-text("Apply"), .apply-button',
  alreadyApplied:'button:has-text("Applied"), .applied-badge, [data-testid="already-applied"]',
  externalLink:  'a[data-testid="external-apply"], .external-apply-link, a[target="_blank"]:has-text("Apply")',
  coverLetterField: 'textarea[name="cover_letter"], textarea[placeholder*="cover letter"], textarea[placeholder*="Cover letter"], .cover-letter-field textarea',
  submitBtn:     'button[type="submit"]:has-text("Submit"), button:has-text("Submit application"), button:has-text("Send application")',
  successBanner: '.application-success, .applied-badge, [data-testid="success-banner"], text="Application submitted"',
  errorBanner:   '.error-message, .alert-danger, [data-testid="error-message"]',
  assessmentContainer: '.assessment-container, [data-testid="assessment"], .assessment-modal',
  assessmentQuestion:  '.question-text, [data-testid="question"], .assessment-question-label',
  assessmentOptions:   'input[type="radio"], input[type="checkbox"], .option-item',
  assessmentNext:      'button:has-text("Next"), button[data-testid="next-question"]',
  assessmentSubmit:    'button:has-text("Submit"), button:has-text("Finish assessment")',
  profileIncompleteAlert: 'text="complete your profile", text="profile is incomplete", .profile-completion-warning',
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

async function humanType(page: Page, selector: string, text: string) {
  const el = page.locator(selector).first()
  await el.scrollIntoViewIfNeeded().catch(() => {})
  await el.click()
  await el.fill('')
  await sleep(rand(200, 400))
  for (const char of text) {
    await page.keyboard.type(char)
    await sleep(rand(30, 80))
  }
}

// ─── Assessment Handler ───

async function detectAssessmentType(page: Page): Promise<'english' | 'logic' | 'technical' | 'custom' | null> {
  const title = await page.locator('.assessment-title, [data-testid="assessment-title"], h2, h3').first().innerText().catch(() => '')
  const lower = title.toLowerCase()

  if (lower.includes('english') || lower.includes('grammar') || lower.includes('language')) return 'english'
  if (lower.includes('logic') || lower.includes('aptitude') || lower.includes('reasoning') || lower.includes('pattern')) return 'logic'
  if (lower.includes('coding') || lower.includes('technical') || lower.includes('programming') || lower.includes('test')) return 'technical'
  return 'custom'
}

async function answerAssessmentQuestion(questionText: string, options: string[], type: 'english' | 'logic' | 'custom'): Promise<string> {
  // Call MCP screening Q agent for AI-powered answers
  try {
    const res = await fetch(`${MCP_URL}/api/jobs/linkedin/screening-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questions: [{ label: questionText, type: options.length > 0 ? 'radio' : 'text' }],
        job_title: 'Assessment',
        company: 'Kalibrr Assessment',
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (res.ok) {
      const data = await res.json() as { answers: { label: string; answer: string }[] }
      if (data.answers?.length > 0) return data.answers[0].answer
    }
  } catch {}

  // Fallback: pick first option for MCQs
  if (options.length > 0) return options[0]
  return 'Yes'
}

async function handleAssessment(page: Page, assessmentType: 'english' | 'logic' | 'technical' | 'custom'): Promise<boolean> {
  if (assessmentType === 'technical') {
    console.log('[Kalibrr Apply] Technical assessment detected — skipping (requires manual)')
    return false
  }

  let questionCount = 0
  const MAX_QUESTIONS = 30

  while (questionCount < MAX_QUESTIONS) {
    // Get current question
    const questionEl = page.locator(SEL.assessmentQuestion).first()
    if (!await questionEl.isVisible().catch(() => false)) break

    const questionText = await questionEl.innerText().catch(() => '')
    console.log(`[Kalibrr Apply] Assessment Q${questionCount + 1}: ${questionText.slice(0, 80)}...`)

    // Get options if any
    const optionEls = await page.locator(SEL.assessmentOptions).all()
    const options: string[] = []
    for (const opt of optionEls) {
      const label = await opt.getAttribute('value').catch(() => null) || await opt.innerText().catch(() => '')
      if (label) options.push(label)
    }

    const answer = await answerAssessmentQuestion(questionText, options, assessmentType)

    // Fill answer
    if (options.length > 0) {
      // MCQ — find and click matching option
      const matchingOpt = optionEls.find(async (_, i) => options[i] === answer)
      if (matchingOpt) {
        await matchingOpt.click().catch(() => {})
      } else {
        // Click first option as fallback
        await optionEls[0]?.click().catch(() => {})
      }
    } else {
      // Text input
      const textInput = page.locator('input[type="text"], textarea').first()
      if (await textInput.count() > 0) {
        await textInput.fill(answer)
      }
    }

    await sleep(rand(800, 1500))

    // Check for next or submit
    const nextBtn = page.locator(SEL.assessmentNext).first()
    const submitBtn = page.locator(SEL.assessmentSubmit).first()

    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click()
      await sleep(rand(2000, 3000))
      return true
    }

    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click()
      await sleep(rand(1000, 2000))
      questionCount++
    } else {
      break
    }
  }

  return questionCount > 0
}

// ─── Main Apply Flow ───

async function applyToJob(context: BrowserContext, input: ApplyInput): Promise<ApplyResult> {
  let page: Page | null = null

  try {
    const jobUrl = input.url.split('?')[0]
    const coverLetter = input.cover_letter || APPLICANT.experience_summary.slice(0, 500)

    page = await context.newPage()
    console.log(`[Kalibrr Apply] Navigating to: ${jobUrl}`)
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await sleep(rand(2000, 4000))

    // Session check
    const url = page.url()
    if (url.includes('/login') || url.includes('/sign-in')) {
      return { job_id: input.id, job_title: input.title, company: input.company, platform: 'kalibrr', status: 'session_expired', method: 'kalibrr_quick_apply', detail: 'Not logged in to Kalibrr' }
    }

    // Already applied?
    if (await page.locator(SEL.alreadyApplied).count() > 0) {
      return { job_id: input.id, job_title: input.title, company: input.company, platform: 'kalibrr', status: 'already_applied', method: 'kalibrr_quick_apply', detail: 'Already applied to this job' }
    }

    // Profile incomplete warning?
    if (await page.locator(SEL.profileIncompleteAlert).count() > 0) {
      return { job_id: input.id, job_title: input.title, company: input.company, platform: 'kalibrr', status: 'profile_incomplete', method: 'kalibrr_quick_apply', detail: 'Kalibrr profile incomplete — run setup-kalibrr-profile.ts first' }
    }

    // External apply link?
    if (await page.locator(SEL.externalLink).count() > 0 && !await page.locator(SEL.quickApplyBtn).count()) {
      const externalHref = await page.locator(SEL.externalLink).first().getAttribute('href').catch(() => null)
      return { job_id: input.id, job_title: input.title, company: input.company, platform: 'kalibrr', status: 'external_redirect', method: 'kalibrr_external', detail: `External apply: ${externalHref || 'company site'}` }
    }

    // Assessment check before apply
    const assessmentBadge = await page.locator('.assessment-required, [data-testid="assessment-badge"], text="Assessment Required"').count()

    // Click Quick Apply or Apply Now
    const quickApply = page.locator(SEL.quickApplyBtn).first()
    const applyNow = page.locator(SEL.applyBtn).first()
    const applyBtn = await quickApply.isVisible().catch(() => false) ? quickApply : applyNow

    if (!await applyBtn.isVisible().catch(() => false)) {
      await screenshot(page, 'apply-btn-missing')
      return { job_id: input.id, job_title: input.title, company: input.company, platform: 'kalibrr', status: 'failed', method: 'kalibrr_quick_apply', detail: 'Apply button not found' }
    }

    console.log('[Kalibrr Apply] Clicking Apply...')
    await applyBtn.scrollIntoViewIfNeeded().catch(() => {})
    await sleep(rand(300, 700))
    await applyBtn.click()
    await sleep(rand(2000, 4000))

    // Handle assessment if it appears
    const assessmentVisible = await page.locator(SEL.assessmentContainer).isVisible().catch(() => false)
    if (assessmentVisible || assessmentBadge > 0) {
      console.log('[Kalibrr Apply] Assessment detected')
      const assessType = await detectAssessmentType(page)
      if (!assessType || assessType === 'technical') {
        await screenshot(page, 'assessment-skipped')
        return { job_id: input.id, job_title: input.title, company: input.company, platform: 'kalibrr', status: 'assessment_skipped', method: 'kalibrr_assessment', detail: `Assessment type '${assessType}' requires manual completion` }
      }
      const assessPassed = await handleAssessment(page, assessType)
      if (!assessPassed) {
        return { job_id: input.id, job_title: input.title, company: input.company, platform: 'kalibrr', status: 'assessment_skipped', method: 'kalibrr_assessment', detail: 'Assessment could not be completed automatically' }
      }
      await sleep(rand(2000, 3000))
    }

    // Fill cover letter if field is visible
    const clField = page.locator(SEL.coverLetterField).first()
    if (await clField.isVisible().catch(() => false)) {
      console.log('[Kalibrr Apply] Filling cover letter...')
      await clField.scrollIntoViewIfNeeded().catch(() => {})
      await clField.fill(coverLetter)
      await sleep(rand(500, 1000))
    }

    // Submit
    const submitBtn = page.locator(SEL.submitBtn).first()
    if (!await submitBtn.isVisible().catch(() => false)) {
      // Try generic submit
      const genericSubmit = page.locator('button[type="submit"]').first()
      if (!await genericSubmit.isVisible().catch(() => false)) {
        await screenshot(page, 'submit-missing')
        return { job_id: input.id, job_title: input.title, company: input.company, platform: 'kalibrr', status: 'failed', method: 'kalibrr_quick_apply', detail: 'Submit button not found' }
      }
      await genericSubmit.click()
    } else {
      await submitBtn.click()
    }

    await sleep(rand(3000, 5000))

    // Check success
    const successVisible = await page.locator(SEL.successBanner).count() > 0
    const alreadyAppliedNow = await page.locator(SEL.alreadyApplied).count() > 0
    const errorVisible = await page.locator(SEL.errorBanner).count() > 0

    if (successVisible || alreadyAppliedNow) {
      const sc = await screenshot(page, 'applied-success')
      console.log('[Kalibrr Apply] ✅ Application submitted!')
      return { job_id: input.id, job_title: input.title, company: input.company, platform: 'kalibrr', status: 'applied', method: 'kalibrr_quick_apply', detail: 'Application submitted via Quick Apply', screenshot: sc }
    }

    if (errorVisible) {
      const errText = await page.locator(SEL.errorBanner).first().innerText().catch(() => 'Unknown error')
      await screenshot(page, 'apply-error')
      return { job_id: input.id, job_title: input.title, company: input.company, platform: 'kalibrr', status: 'failed', method: 'kalibrr_quick_apply', detail: `Error: ${errText.slice(0, 100)}` }
    }

    await screenshot(page, 'apply-uncertain')
    return { job_id: input.id, job_title: input.title, company: input.company, platform: 'kalibrr', status: 'applied', method: 'kalibrr_quick_apply', detail: 'Submitted — no explicit success/error banner detected' }

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`[Kalibrr Apply] Error: ${msg}`)
    if (page) await screenshot(page, 'apply-exception')
    return { job_id: input.id, job_title: input.title, company: input.company, platform: 'kalibrr', status: 'failed', method: 'kalibrr_quick_apply', detail: `Exception: ${msg}` }
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
    console.log(JSON.stringify({ status: 'failed', detail: 'No url provided', platform: 'kalibrr', method: 'kalibrr_quick_apply', job_title: '', company: '' }))
    process.exit(1)
  }

  const { context } = await getBrowser()
  const result = await applyToJob(context, input)
  console.log(JSON.stringify(result))
}

main().catch(e => {
  console.log(JSON.stringify({ status: 'failed', detail: `Fatal: ${e}`, platform: 'kalibrr', method: 'kalibrr_quick_apply', job_title: '', company: '' }))
  process.exit(1)
})

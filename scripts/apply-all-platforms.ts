/**
 * NEURALYX Universal Auto-Apply Script
 *
 * Uses Playwright with Edge Profile 7 (gabrielalvin.jobs@gmail.com)
 * to apply to jobs across ALL platforms — not just Indeed.
 *
 * Usage:
 *   npx tsx scripts/apply-all-platforms.ts --stdin        (pipe JSON array of jobs)
 *   npx tsx scripts/apply-all-platforms.ts --job '{...}'  (single job JSON)
 *   npx tsx scripts/apply-all-platforms.ts --test         (login check on all platforms)
 *   npx tsx scripts/apply-all-platforms.ts --login-check  (check which platforms are logged in)
 *
 * After each apply, POSTs result to MCP server /api/jobs/auto-apply/browser
 */

import { chromium, Page, BrowserContext, Browser } from 'playwright'
import { join } from 'path'
import { writeFileSync, mkdirSync } from 'fs'
import { execSync } from 'child_process'
import { APPLICANT, EDGE_PATH, USER_DATA_DIR, PROFILE_DIR, MCP_URL } from './applicant-profile'
import { answerQuestion } from './answer-engine'
import { detectPlatform, PLATFORM_CONFIGS, type PlatformConfig } from './platform-configs'
import { solveCaptcha as solveCaptchaExternal, detectCaptchaType } from './captcha-solver'

const SCREENSHOTS_DIR = join(process.cwd(), 'screenshots')
const THROTTLE_MS = 30000
const CDP_PORT = 9222

interface JobInput {
  id?: string
  url: string
  title: string
  company: string
  cover_letter?: string
  description?: string
  platform?: string
}

interface ApplyResult {
  job_id?: string
  job_title: string
  company: string
  platform: string
  status: 'applied' | 'failed' | 'captcha' | 'login_required' | 'already_applied' | 'form_error' | 'expired' | 'skipped'
  method: string
  detail: string
  screenshot_pre?: string
  screenshot_confirm?: string
  error?: string
}

// ─── Screenshot helpers ───

function ensureDir(dir: string) {
  try { mkdirSync(dir, { recursive: true }) } catch { /* exists */ }
}

async function takeScreenshot(page: Page, name: string): Promise<string> {
  ensureDir(SCREENSHOTS_DIR)
  const path = join(SCREENSHOTS_DIR, `${name}-${Date.now()}.png`)
  await page.screenshot({ path, fullPage: false })
  return path
}

// ─── Login Check ───

async function checkLoginStatus(context: BrowserContext): Promise<Record<string, boolean>> {
  const status: Record<string, boolean> = {}
  const page = await context.newPage()

  for (const [id, config] of Object.entries(PLATFORM_CONFIGS)) {
    if (!config.loginCheckUrl || !config.loginCheckSelector) {
      status[id] = true // No login needed (e.g., RemoteOK)
      continue
    }

    try {
      await page.goto(config.loginCheckUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await page.waitForTimeout(2000)

      // Check if redirected to login page
      const currentUrl = page.url().toLowerCase()
      if (currentUrl.includes('login') || currentUrl.includes('signin') || currentUrl.includes('auth')) {
        status[id] = false
        console.log(`  [${config.name}] ❌ Not logged in (redirected to login)`)
        continue
      }

      // Check for logged-in indicator element
      const indicator = await page.locator(config.loginCheckSelector).count()
      status[id] = indicator > 0
      console.log(`  [${config.name}] ${indicator > 0 ? '✅ Logged in' : '❌ Not logged in'}`)
    } catch {
      status[id] = false
      console.log(`  [${config.name}] ⚠️ Check failed (timeout/error)`)
    }
  }

  await page.close()
  return status
}

// ─── URL Validation ───

async function validateJobUrl(page: Page, url: string, config: PlatformConfig): Promise<'active' | 'expired' | 'error'> {
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    if (!response || response.status() >= 400) return 'error'

    await page.waitForTimeout(2000)
    const text = (await page.innerText('body').catch(() => '')).toLowerCase()

    // Check Cloudflare challenge
    const title = await page.title()
    if (title.includes('moment') || title.includes('Verify') || title.includes('Checking')) {
      console.log('  ⏳ Cloudflare challenge — waiting 10s...')
      await page.waitForTimeout(10000)
    }

    // Check for expired indicators
    if (config.expiredIndicators.some(p => text.includes(p.toLowerCase()))) return 'expired'

    return 'active'
  } catch {
    return 'error'
  }
}

// ─── Universal Form Filler ───

async function fillFormFields(page: Page, config: PlatformConfig, coverLetter?: string, job?: JobInput): Promise<void> {
  // Fill text inputs
  const textInputs = page.locator('input[type="text"]:visible, input[type="email"]:visible, input[type="tel"]:visible, input[type="url"]:visible')
  const inputCount = await textInputs.count()

  for (let i = 0; i < inputCount; i++) {
    const input = textInputs.nth(i)
    const value = await input.inputValue().catch(() => '')
    if (value) continue

    const label = await input.getAttribute('aria-label') || await input.getAttribute('name') || await input.getAttribute('placeholder') || ''
    const lbl = label.toLowerCase()

    if (lbl.includes('subject')) await input.fill(`${job?.title || 'Open Position'} — 8+ yrs AI Automation | 27 Production Projects | ${APPLICANT.name}`)
    else if (lbl.includes('name') || lbl.includes('full name')) await input.fill(APPLICANT.name)
    else if (lbl.includes('email')) await input.fill(APPLICANT.email)
    else if (lbl.includes('phone') || lbl.includes('tel') || lbl.includes('mobile')) await input.fill(APPLICANT.phone)
    else if (lbl.includes('city') || lbl.includes('location') || lbl.includes('address')) await input.fill(APPLICANT.location)
    else if (lbl.includes('linkedin')) await input.fill(APPLICANT.linkedin)
    else if (lbl.includes('github')) await input.fill(APPLICANT.github)
    else if (lbl.includes('portfolio') || lbl.includes('website') || lbl.includes('url')) await input.fill(APPLICANT.portfolio)
  }

  // Fill textareas (application questions / cover letter)
  const textareas = page.locator('textarea:visible')
  const taCount = await textareas.count()

  for (let i = 0; i < taCount; i++) {
    const ta = textareas.nth(i)
    const value = await ta.inputValue().catch(() => '')
    if (value.length > 10) continue

    // Find the question label
    const taId = await ta.getAttribute('id') || ''
    let questionText = ''
    if (taId) {
      questionText = await page.locator(`label[for="${taId}"]`).innerText().catch(() => '')
    }
    if (!questionText) {
      questionText = await ta.evaluate(el => {
        const parent = el.closest('fieldset, .form-group, .ia-BasePage-component, .ia-Questions-item, [class*="question"]')
        return parent?.querySelector('label, legend, h3, h4, p')?.textContent || ''
      }).catch(() => '')
    }

    // If it looks like a cover letter field, use the cover letter
    const qLower = (questionText || '').toLowerCase()
    if (qLower.includes('cover letter') || qLower.includes('message') || (taCount === 1 && !questionText)) {
      await ta.fill(coverLetter || APPLICANT.experience_summary)
    } else {
      const answer = answerQuestion(questionText, coverLetter)
      await ta.fill(answer)
    }
    console.log(`  📝 Filled textarea: "${(questionText || 'cover letter').slice(0, 60)}"`)
  }

  // Handle dropdowns
  const selects = page.locator('select:visible')
  const selectCount = await selects.count()
  for (let i = 0; i < selectCount; i++) {
    const sel = selects.nth(i)
    const currentVal = await sel.inputValue().catch(() => '')
    if (currentVal) continue

    const options = await sel.locator('option').allTextContents()
    const labelText = await sel.evaluate(el => {
      const label = el.closest('fieldset, .form-group')?.querySelector('label, legend')
      return label?.textContent || ''
    }).catch(() => '')

    const lbl = (labelText || '').toLowerCase()
    if (lbl.includes('country')) {
      const ph = options.find(o => o.toLowerCase().includes('philippines'))
      if (ph) await sel.selectOption({ label: ph })
    } else if (lbl.includes('experience') || lbl.includes('years')) {
      const exp = options.find(o => o.includes('8') || o.includes('5') || o.includes('7'))
      if (exp) await sel.selectOption({ label: exp })
    }
  }

  // Handle radio buttons (Yes/No)
  const radioGroups = page.locator('fieldset:has(input[type="radio"]):visible')
  const radioCount = await radioGroups.count()
  for (let i = 0; i < radioCount; i++) {
    const group = radioGroups.nth(i)
    const legend = await group.locator('legend, label').first().innerText().catch(() => '')
    if (!legend) continue

    const answer = answerQuestion(legend, coverLetter)
    const isYes = answer.toLowerCase().startsWith('yes') || answer === 'Yes'
    const targetLabel = isYes ? 'Yes' : 'No'

    const radioOption = group.locator(`label:has-text("${targetLabel}"), input[value="${targetLabel}"]`).first()
    if (await radioOption.count() > 0) await radioOption.click().catch(() => {})
  }

  // Resume selection (radio button for Indeed-style)
  const resumeRadio = page.locator('input[type="radio"]').first()
  const pageText = await page.innerText('body').catch(() => '')
  if (await resumeRadio.count() > 0 && pageText.toLowerCase().includes('resume')) {
    await resumeRadio.click().catch(() => {})
    console.log('  📎 Selected resume')
  }
}

// ─── CAPTCHA Detection ───

async function detectCaptcha(page: Page): Promise<boolean> {
  // Only detect VISIBLE CAPTCHAs — not script tags (Indeed loads recaptcha scripts on every page)
  const hasVisibleCaptcha = await page.evaluate(() => {
    // Check for visible reCAPTCHA iframe
    const recaptchaFrame = document.querySelector('iframe[src*="recaptcha"][style*="visibility: visible"], iframe[src*="recaptcha"]:not([style*="display: none"])')
    if (recaptchaFrame) {
      const rect = recaptchaFrame.getBoundingClientRect()
      if (rect.width > 50 && rect.height > 50) return true
    }
    // Check for visible hCaptcha
    const hcaptcha = document.querySelector('iframe[src*="hcaptcha"]')
    if (hcaptcha) {
      const rect = hcaptcha.getBoundingClientRect()
      if (rect.width > 50 && rect.height > 50) return true
    }
    // Check for Cloudflare Turnstile widget
    const turnstile = document.querySelector('.cf-turnstile iframe, [data-turnstile-callback] iframe')
    if (turnstile) return true
    // Check for visible "not a robot" text
    const bodyText = document.body.innerText || ''
    if (bodyText.includes('not a robot') || bodyText.includes('verify you are human')) return true
    return false
  }).catch(() => false)
  return hasVisibleCaptcha
}

// ─── Universal Apply Function ───

async function applyToJob(context: BrowserContext, job: JobInput, config: PlatformConfig): Promise<ApplyResult> {
  const result: ApplyResult = {
    job_id: job.id,
    job_title: job.title,
    company: job.company,
    platform: config.id,
    status: 'failed',
    method: config.applyMethod,
    detail: '',
  }

  let page: Page | null = null

  try {
    page = await context.newPage()
    console.log(`  📄 Navigating to: ${job.url}`)

    // Validate URL is still active
    const urlStatus = await validateJobUrl(page, job.url, config)
    if (urlStatus === 'expired') {
      result.status = 'expired'
      result.detail = 'Job listing is expired or no longer available'
      console.log('  💀 Job expired — skipping')
      return result
    }
    if (urlStatus === 'error') {
      result.status = 'failed'
      result.detail = 'Failed to load job page (404 or timeout)'
      console.log('  ❌ Page load failed')
      return result
    }

    // Scrape job description from the page for cover letter generation
    const pageText = await page.innerText('body').catch(() => '')
    if (!job.cover_letter || job.cover_letter.length < 50) {
      console.log('  📝 No cover letter provided — generating from job description...')
      const jobDesc = pageText.slice(0, 3000)
      try {
        const clRes = await fetch(`${MCP_URL}/api/jobs/cover-letter`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: job.title,
            company: job.company,
            description: jobDesc,
            skills: APPLICANT.skills,
          }),
          signal: AbortSignal.timeout(60000),
        })
        if (clRes.ok) {
          const clData = await clRes.json()
          if (clData.cover_letter && clData.cover_letter.length > 50) {
            job.cover_letter = clData.cover_letter
            console.log(`  ✅ Cover letter generated (${job.cover_letter.length} chars) — tailored to job description`)
          }
        }
      } catch { console.log('  ⚠️ Cover letter generation failed — using profile summary') }
    }

    // Check if already applied
    if (pageText.toLowerCase().includes('already applied') || pageText.toLowerCase().includes('you applied')) {
      result.status = 'already_applied'
      result.detail = 'Already applied to this job'
      console.log('  ✅ Already applied — skipping')
      return result
    }

    // Find Apply button — try primary then fallbacks
    let applyBtn = page.locator(config.applyButtonSelector).first()
    if (await applyBtn.count() === 0) {
      for (const fallback of config.applyButtonFallbacks) {
        applyBtn = page.locator(fallback).first()
        if (await applyBtn.count() > 0) break
      }
    }

    // For aggregator/redirect platforms: extract href and navigate directly instead of clicking
    if (await applyBtn.count() > 0 && config.opensNewTab) {
      const href = await applyBtn.getAttribute('href').catch(() => null)
      if (href && (href.startsWith('http') || href.startsWith('/'))) {
        const fullUrl = href.startsWith('/') ? new URL(href, page.url()).toString() : href
        console.log(`  🔗 Found apply link: ${fullUrl.slice(0, 80)}`)
        // Navigate directly to the apply URL instead of fighting with click
        try {
          const newPage = await context.newPage()
          await newPage.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
          await newPage.waitForTimeout(2000)

          // Now we're on the actual company apply page — fill form
          const applyPageText = (await newPage.innerText('body').catch(() => '')).toLowerCase()

          // Check for success indicators on this page
          if (config.successIndicators.some(ind => applyPageText.includes(ind.toLowerCase()))) {
            result.status = 'applied'
            result.detail = `Application submitted via ${config.name} redirect`
            result.screenshot_confirm = await takeScreenshot(newPage, `confirm-${config.id}-${job.company.replace(/\s+/g, '_')}`)
            console.log('  ✅ Application submitted via redirect!')
            await newPage.close().catch(() => {})
            return result
          }

          // Try to fill forms on the redirected page
          await fillFormFields(newPage, config, job.cover_letter, job)

          // Look for submit button on redirected page
          const submitBtn = newPage.locator('button:has-text("Submit"), button:has-text("Apply"), button:has-text("Send"), input[type="submit"]').first()
          if (await submitBtn.count() > 0) {
            await submitBtn.scrollIntoViewIfNeeded().catch(() => {})
            await submitBtn.click({ force: true }).catch(() => {})
            await newPage.waitForTimeout(3000)
            const finalText = (await newPage.innerText('body').catch(() => '')).toLowerCase()
            if (finalText.includes('submitted') || finalText.includes('thank you') || finalText.includes('successfully')) {
              result.status = 'applied'
              result.detail = `Application submitted on ${new URL(fullUrl).hostname}`
              result.screenshot_confirm = await takeScreenshot(newPage, `confirm-${config.id}-${job.company.replace(/\s+/g, '_')}`)
              console.log('  ✅ Applied on redirected page!')
              await newPage.close().catch(() => {})
              return result
            }
          }

          // Record what page we landed on even if we couldn't complete the form
          result.screenshot_confirm = await takeScreenshot(newPage, `redirect-${config.id}-${job.company.replace(/\s+/g, '_')}`)
          result.detail = `Navigated to ${new URL(fullUrl).hostname} — form may need manual completion`
          result.status = 'form_error'
          await newPage.close().catch(() => {})
          return result
        } catch (navErr) {
          console.log(`  ⚠️ Redirect navigation failed: ${navErr}`)
        }
      }
    }

    if (await applyBtn.count() === 0) {
      result.detail = 'No Apply button found on page'
      console.log('  ❌ No Apply button found')
      return result
    }

    console.log('  🖱️ Clicking Apply...')
    result.screenshot_pre = await takeScreenshot(page, `pre-${config.id}-${job.company.replace(/\s+/g, '_')}`)

    // Scroll the apply button into view first
    await applyBtn.scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(500)

    // Handle new tab/popup if platform opens one
    let applyPage: Page
    if (config.opensNewTab) {
      const [newPage] = await Promise.all([
        context.waitForEvent('page', { timeout: 15000 }).catch(() => null),
        applyBtn.click({ force: true, timeout: 10000 }).catch(() => applyBtn.dispatchEvent('click').catch(() => {})),
      ])
      applyPage = newPage || page
      if (newPage) {
        console.log('  📑 Apply form opened in new tab')
        await newPage.waitForLoadState('domcontentloaded', { timeout: 15000 })
      } else {
        // No new tab — check if URL changed (redirect on same page)
        await page.waitForTimeout(2000)
        const newUrl = page.url()
        if (newUrl !== job.url) {
          console.log(`  🔄 Redirected to: ${newUrl.slice(0, 80)}`)
        }
      }
    } else {
      await applyBtn.click({ force: true, timeout: 10000 }).catch(() => applyBtn.dispatchEvent('click').catch(() => {}))
      applyPage = page
    }

    await applyPage.waitForTimeout(2000)

    // ─── Multi-step form processing ───
    let step = 0
    while (step < config.maxSteps) {
      step++

      // Detect if this is Indeed (used for form-specific logic)
      const isIndeed = config.id === 'indeed' || applyPage.url().includes('indeed.com')

      // Check for VISIBLE CAPTCHA — skip for Indeed (false positives from reCAPTCHA script tags)
      if (!isIndeed) {
        const hasCaptcha = await detectCaptcha(applyPage)
        if (hasCaptcha) {
          console.log('  🤖 Visible CAPTCHA detected — attempting solve...')
          const solved = await solveCaptchaExternal(applyPage)
          if (solved) {
            console.log('  ✅ CAPTCHA solved! Continuing form...')
            await applyPage.waitForTimeout(2000)
            continue
          } else {
            result.status = 'captcha'
            result.detail = 'CAPTCHA detected — auto-solve failed'
            console.log('  ❌ CAPTCHA could not be solved')
            return result
          }
        }
      }

      // Check success
      const bodyText = (await applyPage.innerText('body').catch(() => '')).toLowerCase()
      if (config.successIndicators.some(ind => bodyText.includes(ind.toLowerCase()))) {
        result.status = 'applied'
        result.detail = `Application submitted via ${config.name}`
        result.screenshot_confirm = await takeScreenshot(applyPage, `confirm-${config.id}-${job.company.replace(/\s+/g, '_')}`)
        console.log('  ✅ Application submitted!')
        return result
      }

      // Fill form fields — SKIP for Indeed (let Indeed auto-fill from saved profile)
      if (!isIndeed) {
        await fillFormFields(applyPage, config, job.cover_letter, job)
      } else {
        console.log(`  ⏩ Indeed: using Playwright fill() with intelligent answers`)
        // For Indeed: use Playwright fill() which works with React + smart answer engine
        const inputs = applyPage.locator('input:visible:not([type=file]):not([type=radio]):not([type=checkbox]):not([type=hidden]), textarea:visible')
        for (let i = 0; i < await inputs.count(); i++) {
          const inp = inputs.nth(i)
          const val = await inp.inputValue().catch(() => '')
          if (val && val.length > 0) continue

          const id = await inp.getAttribute('id').catch(() => '')
          let label = id ? await applyPage.locator(`label[for="${id}"]`).innerText().catch(() => '') : ''
          if (!label) label = await inp.evaluate(el => el.closest('.ia-BasePage-component, fieldset')?.querySelector('label, legend')?.textContent?.trim() || '').catch(() => '')

          const isTA = (await inp.evaluate(el => el.tagName).catch(() => '')) === 'TEXTAREA'
          const answer = isTA ? (job.cover_letter || answerQuestion(label || 'cover letter', job.cover_letter)) : answerQuestion(label || 'experience', job.cover_letter)

          try {
            await inp.click()
            await inp.clear()
            await inp.fill(answer)
            console.log(`  📝 ${label?.slice(0, 40) || 'field'} = ${answer.slice(0, 15)}`)
          } catch { /* skip unfillable */ }
        }

        // Handle radio buttons (Yes for most)
        const radioGroups = applyPage.locator('fieldset:has(input[type="radio"]):visible')
        for (let i = 0; i < await radioGroups.count(); i++) {
          const group = radioGroups.nth(i)
          const legend = await group.locator('legend, label').first().innerText().catch(() => '')
          const answer = answerQuestion(legend, job.cover_letter)
          const isYes = answer.toLowerCase().startsWith('yes')
          const target = group.locator(`label:has-text("${isYes ? 'Yes' : 'No'}")`).first()
          if (await target.count() > 0) await target.click().catch(() => {})
        }
      }

      // Click Continue / Next / Submit — use JS click for Indeed (bypasses visibility issues)
      let clicked = false
      if (isIndeed) {
        // Indeed: use evaluate to find and click button (bypasses Playwright visibility checks)
        const btnResult = await applyPage.evaluate(() => {
          const btns = [...document.querySelectorAll('button')]
          const btn = btns.find(b => /continue|next|review|submit.*application|apply/i.test(b.textContent || ''))
          if (btn) { btn.click(); return (btn.textContent || '').trim().slice(0, 30) }
          return null
        })
        if (btnResult) {
          console.log(`  ➡️ Step ${step}: JS-clicked "${btnResult}"`)
          clicked = true
          await applyPage.waitForTimeout(2500)
        }
      }

      if (!clicked) {
        const continueBtn = applyPage.locator(
          'button:has-text("Continue"), button:has-text("Next"), button:has-text("Review"), ' +
          'button:has-text("Submit"), button:has-text("Apply"), button:has-text("Send"), ' +
          'button:has-text("Confirm"), input[type="submit"]'
        ).first()

        if (await continueBtn.count() > 0) {
          const btnText = await continueBtn.innerText().catch(() => 'Next')
          console.log(`  ➡️ Step ${step}: Clicking "${btnText.trim()}"...`)

          if (btnText.toLowerCase().includes('submit') || btnText.toLowerCase().includes('send') || btnText.toLowerCase().includes('apply')) {
            result.screenshot_pre = await takeScreenshot(applyPage, `pre-submit-${config.id}-${job.company.replace(/\s+/g, '_')}`)
          }

          // Scroll into view before clicking (fixes buttons below the fold)
          await continueBtn.scrollIntoViewIfNeeded().catch(() => {})
          await applyPage.waitForTimeout(500)
          await continueBtn.click()
          await applyPage.waitForTimeout(2500)
        } else {
          console.log(`  ⚠️ Step ${step}: No continue/submit button — form may be done`)
          break
        }
      } // end !clicked
    }

    // Final success check
    const finalText = (await applyPage.innerText('body').catch(() => '')).toLowerCase()
    const finalUrl = applyPage.url().toLowerCase()
    if (config.successIndicators.some(ind => finalText.includes(ind.toLowerCase())) ||
        finalText.includes('submitted') || finalText.includes('successfully') || finalText.includes('thank you') ||
        finalText.includes('email has been sent') || finalText.includes('message sent') ||
        finalUrl.includes('success') || finalUrl.includes('thank')) {
      result.status = 'applied'
      result.detail = `Application submitted via ${config.name}`
      result.screenshot_confirm = await takeScreenshot(applyPage, `confirm-${config.id}-${job.company.replace(/\s+/g, '_')}`)
    } else {
      result.status = 'form_error'
      result.detail = `Form did not complete after ${config.maxSteps} steps`
      result.screenshot_confirm = await takeScreenshot(applyPage, `incomplete-${config.id}-${job.company.replace(/\s+/g, '_')}`)
    }

    return result
  } catch (err) {
    result.status = 'failed'
    result.error = err instanceof Error ? err.message : String(err)
    result.detail = `Error: ${result.error}`
    if (page) result.screenshot_confirm = await takeScreenshot(page, `error-${config.id}-${job.company.replace(/\s+/g, '_')}`).catch(() => undefined)
    return result
  } finally {
    if (page) await page.close().catch(() => {})
  }
}

// ─── MCP Server Callback ───

async function reportToMcpServer(result: ApplyResult, coverLetter?: string): Promise<void> {
  try {
    const res = await fetch(`${MCP_URL}/api/jobs/auto-apply/browser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: result.job_id,
        job_title: result.job_title,
        company: result.company,
        platform: result.platform,
        status: result.status,
        method: result.method,
        detail: result.detail,
        screenshot_pre: result.screenshot_pre,
        screenshot_confirm: result.screenshot_confirm,
        cover_letter: coverLetter,
        error: result.error,
      }),
    })
    console.log(res.ok ? '  📡 Reported to MCP server' : `  ⚠️ MCP callback failed: ${res.status}`)
  } catch (e) {
    console.log(`  ⚠️ MCP callback error: ${e}`)
  }
}

// ─── CLI Entry Point ───

async function main() {
  const args = process.argv.slice(2)
  const isTest = args.includes('--test')
  const isLoginCheck = args.includes('--login-check')
  const isStdin = args.includes('--stdin')

  console.log('🚀 NEURALYX Universal Auto-Apply Agent')
  console.log(`📧 Profile: ${APPLICANT.email} (Edge Profile 7)`)
  console.log(`🌐 MCP Server: ${MCP_URL}\n`)

  // ─── Connect to existing Edge via CDP (preserves sessions, no logout) ───
  let browser!: Browser
  let context!: BrowserContext

  // Step 1: Try connecting to Edge already running with CDP
  try {
    console.log(`🔗 Connecting to Edge on CDP port ${CDP_PORT}...`)
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    context = browser.contexts()[0] || await browser.newContext()
    console.log('✅ Connected to existing Edge — all sessions preserved!')
  } catch {
    // Step 2: Edge not running with CDP — restart it with CDP enabled
    console.log('⚠️ Edge not running with CDP. Restarting Edge with CDP...')
    console.log('   (Your tabs will be restored via --restore-last-session)')

    try {
      // Close existing Edge
      execSync('taskkill /F /IM msedge.exe /T 2>nul', { shell: 'cmd.exe', stdio: 'ignore' })
      await new Promise(r => setTimeout(r, 3000))

      // Relaunch with CDP + profile + restore tabs
      const cmd = `"${EDGE_PATH}" --remote-debugging-port=${CDP_PORT} --profile-directory="${PROFILE_DIR}" --no-first-run --restore-last-session --disable-blink-features=AutomationControlled`
      execSync(`start "" ${cmd}`, { shell: 'cmd.exe', stdio: 'ignore' })

      // Wait for CDP
      let connected = false
      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise(r => setTimeout(r, 1000))
        try {
          browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
          context = browser.contexts()[0] || await browser.newContext()
          connected = true
          console.log('✅ Edge relaunched with CDP — sessions intact!')
          break
        } catch { /* retry */ }
      }
      if (!connected) throw new Error('CDP connection timeout')
    } catch (err) {
      console.error(`❌ Failed to connect to Edge: ${err}`)
      process.exit(1)
    }
  }

  // ─── Login Check Mode ───
  if (isLoginCheck || isTest) {
    console.log('\n🔑 Checking login status on all platforms...\n')
    const status = await checkLoginStatus(context)
    console.log('\n━━━ LOGIN STATUS ━━━')
    for (const [id, loggedIn] of Object.entries(status)) {
      const config = PLATFORM_CONFIGS[id]
      console.log(`  ${loggedIn ? '✅' : '❌'} ${config?.name || id}: ${loggedIn ? 'Logged in' : 'NOT logged in'}`)
    }

    // Output as JSON for programmatic use
    const output = JSON.stringify(status, null, 2)
    ensureDir(SCREENSHOTS_DIR)
    writeFileSync(join(SCREENSHOTS_DIR, 'login-status.json'), output)
    console.log(`\n📁 Status saved to screenshots/login-status.json`)

    if (isTest) {
      console.log('\n🧪 Test mode — no applications will be submitted')
    }

    // Disconnect from CDP — do NOT close the browser (user's Edge stays open)
    if (browser) await browser.close().catch(() => {})
    process.exit(0)
  }

  // ─── Parse Jobs ───
  let jobs: JobInput[] = []

  if (isStdin) {
    const input = await new Promise<string>(resolve => {
      let data = ''
      process.stdin.on('data', chunk => data += chunk)
      process.stdin.on('end', () => resolve(data))
    })
    const parsed = JSON.parse(input)
    jobs = Array.isArray(parsed) ? parsed : [parsed]
  } else {
    const jobIdx = args.indexOf('--job')
    if (jobIdx >= 0 && args[jobIdx + 1]) {
      jobs = [JSON.parse(args[jobIdx + 1])]
    } else {
      console.log('Usage:')
      console.log('  npx tsx scripts/apply-all-platforms.ts --test')
      console.log('  npx tsx scripts/apply-all-platforms.ts --login-check')
      console.log('  npx tsx scripts/apply-all-platforms.ts --job \'{"url":"...","title":"...","company":"..."}\'')
      console.log('  echo \'[{...}]\' | npx tsx scripts/apply-all-platforms.ts --stdin')
      process.exit(1)
    }
  }

  console.log(`📋 Jobs to apply: ${jobs.length}\n`)

  const results: ApplyResult[] = []

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]
    console.log(`\n━━━ Job ${i + 1}/${jobs.length}: ${job.title} @ ${job.company} ━━━`)

    // Detect platform
    const config = detectPlatform(job.url)
    if (!config) {
      console.log(`  ⚠️ Unknown platform for URL: ${job.url}`)
      console.log('  📧 Falling back to email-only apply')
      results.push({
        job_id: job.id,
        job_title: job.title,
        company: job.company,
        platform: job.platform || 'unknown',
        status: 'skipped',
        method: 'unknown',
        detail: 'Unknown platform — use email apply instead',
      })
      continue
    }

    console.log(`  🏷️ Platform: ${config.name} (${config.applyMethod})`)

    const result = await applyToJob(context, job, config)
    results.push(result)

    // Report to MCP server
    await reportToMcpServer(result, job.cover_letter)
    console.log(`  Result: ${result.status} — ${result.detail}`)

    // Throttle
    if (i < jobs.length - 1) {
      console.log(`  ⏳ Waiting ${THROTTLE_MS / 1000}s before next...`)
      await new Promise(r => setTimeout(r, THROTTLE_MS))
    }
  }

  // Summary
  console.log('\n━━━ SUMMARY ━━━')
  const applied = results.filter(r => r.status === 'applied').length
  const failed = results.filter(r => r.status === 'failed' || r.status === 'form_error').length
  const captcha = results.filter(r => r.status === 'captcha').length
  const expired = results.filter(r => r.status === 'expired').length
  const skipped = results.filter(r => r.status === 'skipped' || r.status === 'already_applied').length
  console.log(`✅ Applied: ${applied}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`🤖 CAPTCHA: ${captcha}`)
  console.log(`💀 Expired: ${expired}`)
  console.log(`⏭️ Skipped: ${skipped}`)
  console.log(`📊 Total: ${results.length}`)

  // Save results
  ensureDir(SCREENSHOTS_DIR)
  writeFileSync(join(SCREENSHOTS_DIR, 'results.json'), JSON.stringify(results, null, 2))
  console.log(`\n📁 Results saved to screenshots/results.json`)

  // Disconnect from CDP — user's Edge stays open with all sessions intact
  if (browser) await browser.close().catch(() => {})
  process.exit(0)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

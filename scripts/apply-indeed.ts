/**
 * NEURALYX Indeed Auto-Apply Script
 *
 * Uses Playwright with Edge Profile 7 (gabrielalvin.jobs@gmail.com)
 * to apply to Indeed PH jobs via Easy Apply.
 *
 * Usage:
 *   npx tsx scripts/apply-indeed.ts --job '{"url":"https://ph.indeed.com/viewjob?jk=abc123","title":"AI Engineer","company":"Acme","cover_letter":"..."}'
 *   npx tsx scripts/apply-indeed.ts --test   (dry run with first recommended job)
 *   echo '{"url":...}' | npx tsx scripts/apply-indeed.ts --stdin
 *
 * After successful apply, POSTs result to MCP server /api/jobs/auto-apply/browser
 */

import { chromium, Page, BrowserContext } from 'playwright'
import { join } from 'path'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { solveCaptcha } from './captcha-solver'
import { solveRecaptcha } from './recaptcha-solver-service'

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const USER_DATA = join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'User Data')
const PROFILE_DIR = 'Profile 7'
const MCP_URL = process.env.MCP_SERVER_URL || 'http://localhost:8080'
const RESUME_PATH = join(process.cwd(), 'assets', 'resume.pdf')
const SCREENSHOTS_DIR = join(process.cwd(), 'screenshots')

// Applicant profile — single source of truth
const APPLICANT = {
  name: 'Gabriel Alvin Aquino',
  email: 'gabrielalvin.jobs@gmail.com',
  phone: '0951 540 8978',
  title: 'AI Systems Engineer & Automation Developer',
  location: 'Angeles, Central Luzon, Philippines',
  experience_years: 8,
  salary_php: '80000-150000',
  salary_usd: '1500-3000',
  portfolio: 'https://neuralyx.ai.dev-environment.site',
  github: 'https://github.com/HierArch24',
  linkedin: 'https://linkedin.com/in/gabrielalvinaquino',

  // Standard answers for common Indeed questions
  experience_summary: `I have 8+ years building AI automation systems and full-stack applications. Key achievements:
- Engineered NEURALYX, an AI-powered portfolio with 48 integrated services, 7 autonomous agents, and 5 Docker containers
- Automated 95% of content workflows for LIVITI using n8n and OpenAI
- Built a job pipeline processing 90+ listings in 8 seconds
- Tech stack: Vue.js, TypeScript, Python, FastAPI, Docker, Supabase, PostgreSQL, OpenAI API, LangChain, CrewAI, PHP/Laravel`,

  work_authorization: 'Yes, I am authorized to work in the Philippines. No visa sponsorship required.',
  willing_relocate: 'Open to remote work. Based in Philippines.',
  start_date: 'Immediately available / 1 week notice',
  willing_wfh: 'Yes',
  video_intro: 'https://drive.google.com/file/d/1gLq_z3wHdp7FVX8kWUZheR9nozxbVdcR/view?usp=sharing',
  resume_url: 'https://neuralyx.ai.dev-environment.site/assets/resume.pdf',
}

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
  status: 'applied' | 'failed' | 'captcha' | 'login_required' | 'already_applied' | 'form_error'
  method: 'indeed_easy_apply' | 'company_site'
  detail: string
  screenshot_pre?: string
  screenshot_confirm?: string
  error?: string
  applied_url?: string
}

// ─── Answer Engine: matches question text to pre-configured answers ───

function answerQuestion(questionText: string, coverLetter?: string): string {
  const q = questionText.toLowerCase()

  // Experience / background
  if (q.includes('experience') || q.includes('background') || q.includes('describe your') || q.includes('tell us about')) {
    return coverLetter || APPLICANT.experience_summary
  }

  // Salary
  if (q.includes('salary') || q.includes('compensation') || q.includes('pay') || q.includes('rate')) {
    if (q.includes('usd') || q.includes('dollar') || q.includes('$')) return `USD ${APPLICANT.salary_usd}/month`
    return `PHP ${APPLICANT.salary_php}/month`
  }

  // Work authorization / visa
  if (q.includes('authorized') || q.includes('authorization') || q.includes('visa') || q.includes('sponsorship') || q.includes('legally')) {
    return APPLICANT.work_authorization
  }

  // Relocate
  if (q.includes('relocate') || q.includes('relocation')) {
    return APPLICANT.willing_relocate
  }

  // Start date / availability
  if (q.includes('start date') || q.includes('available') || q.includes('earliest') || q.includes('when can you')) {
    return APPLICANT.start_date
  }

  // Remote / WFH
  if (q.includes('remote') || q.includes('work from home') || q.includes('wfh') || q.includes('hybrid')) {
    return APPLICANT.willing_wfh
  }

  // Years of experience (numeric)
  if (q.includes('years') && (q.includes('experience') || q.includes('how many') || q.includes('how long'))) {
    return String(APPLICANT.experience_years)
  }

  // Video introduction
  if (q.includes('video') || q.includes('introduction video') || q.includes('video link') || q.includes('video presentation') || q.includes('video intro') || q.includes('record')) {
    return APPLICANT.video_intro
  }

  // Resume / CV link
  if (q.includes('resume') || q.includes('cv') || q.includes('curriculum')) {
    return APPLICANT.resume_url
  }

  // Portfolio / website
  if (q.includes('portfolio') || q.includes('website') || q.includes('url') || q.includes('link')) {
    return APPLICANT.portfolio
  }

  // LinkedIn
  if (q.includes('linkedin')) {
    return APPLICANT.linkedin
  }

  // GitHub
  if (q.includes('github') || q.includes('git')) {
    return APPLICANT.github
  }

  // Tools / platforms (generic)
  if (q.includes('platform') || q.includes('tool') || q.includes('software') || q.includes('crm') || q.includes('framework')) {
    return 'I have experience with similar platforms and tools including Supabase, PostgreSQL, n8n, Docker, OpenAI API, and custom API integrations. I can quickly adapt to new tools and platforms.'
  }

  // Education
  if (q.includes('education') || q.includes('degree') || q.includes('university') || q.includes('school')) {
    return 'BS Information Technology, University of the Cordilleras'
  }

  // Cover letter / why this role / motivation
  if (q.includes('cover letter') || q.includes('why') || q.includes('interest') || q.includes('motivation') || q.includes('apply')) {
    return coverLetter || APPLICANT.experience_summary
  }

  // Yes/No detection
  if (q.includes('do you have') || q.includes('are you') || q.includes('can you') || q.includes('will you')) {
    // Default to "Yes" for most capability questions
    if (q.includes('not') || q.includes('criminal') || q.includes('disability')) return 'No'
    return 'Yes'
  }

  // Fallback: use cover letter or experience summary
  return coverLetter || APPLICANT.experience_summary
}

// ─── Screenshot helper ───

function ensureScreenshotDir() {
  try { mkdirSync(SCREENSHOTS_DIR, { recursive: true }) } catch { /* exists */ }
}

async function takeScreenshot(page: Page, name: string): Promise<string> {
  ensureScreenshotDir()
  const path = join(SCREENSHOTS_DIR, `${name}-${Date.now()}.png`)
  await page.screenshot({ path, fullPage: false })
  return path
}

// ─── Main Apply Logic ───

async function applyToIndeedJob(context: BrowserContext, job: JobInput): Promise<ApplyResult> {
  const result: ApplyResult = {
    job_id: job.id,
    job_title: job.title,
    company: job.company,
    platform: 'indeed',
    status: 'failed',
    method: 'indeed_easy_apply',
    detail: '',
  }

  let page: Page | null = null

  try {
    page = await context.newPage()
    console.log(`  📄 Navigating to: ${job.url}`)
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    // Check if already on a Cloudflare challenge
    const title = await page.title().catch(() => '')
    if (title.includes('moment') || title.includes('Verify')) {
      console.log('  ⚠️ Cloudflare/Turnstile challenge detected — waiting up to 30s...')
      // Turnstile usually auto-solves with a real browser profile
      for (let tw = 0; tw < 30; tw++) {
        await new Promise(r => setTimeout(r, 1000))
        // Check if page navigated away (Turnstile passed)
        if (page.isClosed()) break
        const currentTitle = await page.title().catch(() => '')
        if (!currentTitle.includes('moment') && !currentTitle.includes('Verify')) {
          console.log('  ✅ Cloudflare challenge passed')
          break
        }
        if (tw === 5) {
          // Try clicking the Turnstile checkbox after 5s
          await solveCaptcha(page).catch(() => {})
        }
      }
      // Recover page reference if it closed
      if (page.isClosed()) {
        const pages = context.pages()
        if (pages.length > 0) {
          page = pages[pages.length - 1]
          console.log('  🔄 Using new page after Turnstile redirect')
          await page.waitForLoadState('domcontentloaded').catch(() => {})
        } else {
          // Open a fresh page
          page = await context.newPage()
          await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
          console.log('  🔄 Reopened page after Turnstile')
        }
      }
      await page.waitForTimeout(2000).catch(() => {})
    }

    // Check for "Already applied" indicator
    const alreadyApplied = await page.locator('text=Already applied').count()
    if (alreadyApplied > 0) {
      result.status = 'already_applied'
      result.detail = 'Already applied to this job'
      console.log('  ✅ Already applied — skipping')
      return result
    }

    // Detect Apply button type: Easy Apply vs Company Site
    const easyApplyBtn = page.locator('button:has-text("Apply now"), a:has-text("Apply now"), button:has-text("Easy Apply")')
    const companySiteBtn = page.locator('button:has-text("Apply on company site"), a:has-text("Apply on company site")')
    const easyCount = await easyApplyBtn.count()
    const companyCount = await companySiteBtn.count()

    if (easyCount === 0 && companyCount === 0) {
      result.detail = 'No Apply button found on page'
      console.log('  ❌ No Apply button found')
      return result
    }

    const isCompanySite = easyCount === 0 && companyCount > 0
    const applyBtn = isCompanySite ? companySiteBtn : easyApplyBtn
    result.method = isCompanySite ? 'company_site' : 'indeed_easy_apply'

    console.log(`  🖱️ Clicking ${isCompanySite ? 'Apply on company site' : 'Apply now'}...`)

    // Listen for new page (popup/tab)
    const [newPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 15000 }).catch(() => null),
      applyBtn.first().click(),
    ])

    // Use the new page if opened, otherwise stay on current
    let applyPage = newPage || page
    if (newPage) {
      console.log(`  📑 ${isCompanySite ? 'Company site' : 'Apply form'} opened in new tab`)
      await newPage.waitForLoadState('domcontentloaded', { timeout: 30000 })
    }
    await applyPage.waitForTimeout(2000)

    // If company site — handle Turnstile/Cloudflare on the new domain too
    if (isCompanySite && newPage) {
      const extTitle = await applyPage.title().catch(() => '')
      if (extTitle.includes('moment') || extTitle.includes('Verify') || extTitle.includes('Check')) {
        console.log('  ⚠️ Company site has Turnstile — waiting 30s...')
        for (let tw = 0; tw < 30; tw++) {
          await new Promise(r => setTimeout(r, 1000))
          if (applyPage.isClosed()) break
          const t = await applyPage.title().catch(() => '')
          if (!t.includes('moment') && !t.includes('Verify') && !t.includes('Check')) break
          if (tw === 5) await solveCaptcha(applyPage).catch(() => {})
        }
      }
      result.applied_url = applyPage.url()
      console.log(`  🌐 Company site: ${result.applied_url}`)
    }

    // Take pre-submit screenshot
    result.screenshot_pre = await takeScreenshot(applyPage, `pre-${job.company.replace(/\s+/g, '_')}`)

    // ─── Process the apply form (multi-step, more steps for company sites) ───
    let maxSteps = isCompanySite ? 12 : 8
    let step = 0

    while (step < maxSteps) {
      step++
      const pageContent = await applyPage.content()
      const pageText = await applyPage.innerText('body').catch(() => '')

      // Check for CAPTCHA — only visible widgets, not just the word in HTML
      const hasVisibleCaptcha = await applyPage.locator(
        'iframe[title*="reCAPTCHA"]:visible, .g-recaptcha:visible, [data-sitekey]:visible, ' +
        'iframe[src*="hcaptcha"]:visible, .h-captcha:visible, .cf-turnstile:visible'
      ).count().catch(() => 0)
      const hasBlockingCaptcha = pageText.includes('not a robot') || pageText.includes('verify you are human')
      if (hasVisibleCaptcha > 0 || hasBlockingCaptcha) {
        console.log('  🤖 CAPTCHA detected — attempting auto-solve...')

        // Strategy 1: Gemini Vision solver (free, fast)
        let captchaSolved = await solveCaptcha(applyPage).catch(() => false)

        // Strategy 2: 2captcha API token injection (paid, reliable)
        if (!captchaSolved) {
          console.log('  🔄 Gemini solver failed — trying 2captcha API...')
          captchaSolved = await solveRecaptcha(applyPage).catch(() => false)
        }

        if (captchaSolved) {
          console.log('  ✅ CAPTCHA solved! Continuing application...')
          await applyPage.waitForTimeout(2000)
          // After solving, try clicking Continue/Submit if it appeared
          const postCaptchaBtn = applyPage.locator(
            'button:has-text("Continue"), button:has-text("Next"), button:has-text("Submit"), button:has-text("Apply")'
          ).first()
          if (await postCaptchaBtn.count() > 0) {
            await postCaptchaBtn.click().catch(() => {})
            await applyPage.waitForTimeout(2000)
          }
          continue // Re-enter the form loop to process next step
        } else {
          result.status = 'captcha'
          result.detail = 'CAPTCHA detected — auto-solve failed after all strategies'
          console.log('  ❌ CAPTCHA not solved — all strategies exhausted')
          result.screenshot_confirm = await takeScreenshot(applyPage, `captcha-fail-${job.company.replace(/\s+/g, '_')}`)
          return result
        }
      }

      // Check for success/confirmation (Indeed + company sites)
      if (pageText.includes('application has been submitted') ||
          pageText.includes('application was sent') ||
          pageText.includes('successfully applied') ||
          pageText.includes('Your application has been') ||
          pageText.includes('Application submitted') ||
          pageText.includes('Thank you for applying') ||
          pageText.includes('thank you for your application') ||
          pageText.includes('application received') ||
          pageText.includes('we have received your') ||
          pageText.includes('successfully submitted') ||
          pageText.includes('Thanks for applying')) {
        result.status = 'applied'
        result.detail = `Application submitted via ${isCompanySite ? 'company site' : 'Indeed Easy Apply'}`
        result.screenshot_confirm = await takeScreenshot(applyPage, `confirm-${job.company.replace(/\s+/g, '_')}`)
        console.log('  ✅ Application submitted!')
        return result
      }

      // ─── Resume upload step ───
      const fileInput = applyPage.locator('input[type="file"]:not([style*="display: none"])')
      const fileInputHidden = applyPage.locator('input[type="file"]')
      const hasFileInput = (await fileInput.count() > 0) || (await fileInputHidden.count() > 0)
      const pageHasUpload = pageText.toLowerCase().includes('upload') || pageText.toLowerCase().includes('resume') || pageText.toLowerCase().includes('cv')

      if (hasFileInput && pageHasUpload && existsSync(RESUME_PATH)) {
        console.log('  📎 Uploading resume...')
        const target = (await fileInputHidden.count() > 0) ? fileInputHidden.first() : fileInput.first()
        await target.setInputFiles(RESUME_PATH).catch(async (e) => {
          console.log(`  ⚠️ Direct upload failed: ${String(e).slice(0, 50)}`)
          // Fallback: try via page file chooser
          const [chooser] = await Promise.all([
            applyPage.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
            applyPage.locator('button:has-text("Upload"), button:has-text("Choose"), button:has-text("Browse"), [class*="upload"], [class*="dropzone"]').first().click().catch(() => {}),
          ])
          if (chooser) {
            await chooser.setFiles(RESUME_PATH)
            console.log('  📎 Resume uploaded via file chooser')
          }
        })
        await applyPage.waitForTimeout(2000)
        // Verify upload registered (button may now be enabled)
        console.log('  ✅ Resume file set')
      }

      // ─── Resume selection step (Indeed radio buttons) ───
      const resumeRadio = applyPage.locator('input[type="radio"]').first()
      if (await resumeRadio.count() > 0 && pageText.includes('resume')) {
        console.log('  📎 Selecting resume...')
        await resumeRadio.click().catch(() => {})
        await applyPage.waitForTimeout(500)
      }

      // ─── Fill text inputs (works for Indeed + company sites) ───
      const textInputs = applyPage.locator('input[type="text"]:visible, input[type="email"]:visible, input[type="tel"]:visible, input[type="url"]:visible')
      const inputCount = await textInputs.count()
      for (let i = 0; i < inputCount; i++) {
        const input = textInputs.nth(i)
        const value = await input.inputValue().catch(() => '')
        if (value) continue // Already filled

        // Get label from multiple sources (Indeed + company forms)
        const attrLabel = await input.getAttribute('aria-label') || await input.getAttribute('name') || await input.getAttribute('placeholder') || ''
        const parentLabel = await input.evaluate(el => {
          // Walk up to find a label
          const id = el.getAttribute('id')
          if (id) { const lbl = document.querySelector(`label[for="${id}"]`); if (lbl) return lbl.textContent || '' }
          const parent = el.closest('div, fieldset, .form-group, .field, [class*="field"], [class*="question"]')
          return parent?.querySelector('label, legend, span.label, h3, h4')?.textContent || ''
        }).catch(() => '')
        const label = parentLabel || attrLabel
        const labelLower = label.toLowerCase()

        if (labelLower.includes('first name') && !labelLower.includes('last')) {
          await input.fill(APPLICANT.name.split(' ')[0])
        } else if (labelLower.includes('last name') || labelLower.includes('surname') || labelLower.includes('family name')) {
          await input.fill(APPLICANT.name.split(' ').slice(1).join(' '))
        } else if (labelLower.includes('name') || labelLower.includes('full name')) {
          await input.fill(APPLICANT.name)
        } else if (labelLower.includes('email')) {
          await input.fill(APPLICANT.email)
        } else if (labelLower.includes('phone') || labelLower.includes('tel') || labelLower.includes('mobile') || labelLower.includes('contact number')) {
          await input.fill(APPLICANT.phone)
        } else if (labelLower.includes('city') || labelLower.includes('location') || labelLower.includes('address')) {
          await input.fill(APPLICANT.location)
        } else if (labelLower.includes('linkedin')) {
          await input.fill(APPLICANT.linkedin)
        } else if (labelLower.includes('video') || labelLower.includes('introduction video') || labelLower.includes('video link')) {
          await input.fill(APPLICANT.video_intro)
        } else if (labelLower.includes('portfolio') || labelLower.includes('website') || labelLower.includes('url') || labelLower.includes('personal site')) {
          await input.fill(APPLICANT.portfolio)
        } else if (labelLower.includes('github')) {
          await input.fill(APPLICANT.github)
        } else if (labelLower.includes('salary') || labelLower.includes('expected') || labelLower.includes('desired pay')) {
          await input.fill(APPLICANT.salary_php.split('-')[0])
        } else if (labelLower.includes('title') || labelLower.includes('position') || labelLower.includes('role') || labelLower.includes('job title')) {
          await input.fill(APPLICANT.title)
        }
      }

      // ─── Fill textareas (application questions) ───
      const textareas = applyPage.locator('textarea:visible')
      const taCount = await textareas.count()
      for (let i = 0; i < taCount; i++) {
        const ta = textareas.nth(i)
        const value = await ta.inputValue().catch(() => '')
        if (value.length > 10) continue // Already has content

        // Find the question label
        const taId = await ta.getAttribute('id') || ''
        let questionText = ''
        if (taId) {
          const label = applyPage.locator(`label[for="${taId}"]`)
          questionText = await label.innerText().catch(() => '')
        }
        if (!questionText) {
          // Try parent/sibling label (works for Indeed + company sites)
          questionText = await ta.evaluate(el => {
            const parent = el.closest('.ia-BasePage-component, .ia-Questions-item, fieldset, .css-kyg8or, .form-group, .field, [class*="field"], [class*="question"], div')
            return parent?.querySelector('label, legend, .ia-Questions-label, h3, h4, span.label, p')?.textContent || el.getAttribute('placeholder') || ''
          }).catch(() => '')
        }

        console.log(`  📝 Question: "${questionText.slice(0, 80)}..."`)
        const answer = answerQuestion(questionText, job.cover_letter)
        await ta.fill(answer)
        console.log(`  ✍️ Answered (${answer.length} chars)`)
      }

      // ─── Handle select dropdowns ───
      const selects = applyPage.locator('select:visible')
      const selectCount = await selects.count()
      for (let i = 0; i < selectCount; i++) {
        const sel = selects.nth(i)
        const currentVal = await sel.inputValue().catch(() => '')
        if (currentVal) continue

        // Try to select a reasonable option
        const options = await sel.locator('option').allTextContents()
        const labelText = await sel.evaluate(el => {
          const id = el.getAttribute('id')
          if (id) { const lbl = document.querySelector(`label[for="${id}"]`); if (lbl) return lbl.textContent || '' }
          const label = el.closest('.ia-BasePage-component, fieldset, .form-group, .field, div')?.querySelector('label, legend, span')
          return label?.textContent || el.getAttribute('name') || ''
        }).catch(() => '')

        const labelLower = (labelText || '').toLowerCase()
        console.log(`  📋 Select: "${(labelText || '').slice(0, 50)}" — options: ${options.length}`)
        if (labelLower.includes('country')) {
          const phOption = options.find(o => o.toLowerCase().includes('philippines'))
          if (phOption) await sel.selectOption({ label: phOption })
        } else if (labelLower.includes('experience') || labelLower.includes('years')) {
          const expOption = options.find(o => o.includes('8') || o.includes('5') || o.includes('7') || o.includes('6+') || o.includes('5+'))
          if (expOption) await sel.selectOption({ label: expOption })
        } else if (labelLower.includes('gender') || labelLower.includes('sex')) {
          const maleOption = options.find(o => o.toLowerCase().includes('male') && !o.toLowerCase().includes('female'))
          if (maleOption) await sel.selectOption({ label: maleOption })
        } else if (labelLower.includes('source') || labelLower.includes('how did you') || labelLower.includes('hear about')) {
          const opt = options.find(o => o.toLowerCase().includes('indeed') || o.toLowerCase().includes('job board') || o.toLowerCase().includes('online'))
          if (opt) await sel.selectOption({ label: opt })
          else if (options.length > 1) await sel.selectOption({ index: 1 })
        } else if (options.length > 1) {
          // Generic: select first non-empty option
          await sel.selectOption({ index: 1 }).catch(() => {})
        }
      }

      // ─── Handle radio buttons (Yes/No questions) ───
      const radioGroups = applyPage.locator('fieldset:has(input[type="radio"]):visible')
      const radioCount = await radioGroups.count()
      for (let i = 0; i < radioCount; i++) {
        const group = radioGroups.nth(i)
        const legend = await group.locator('legend, label').first().innerText().catch(() => '')
        if (!legend) continue

        const answer = answerQuestion(legend, job.cover_letter)
        const isYes = answer.toLowerCase().startsWith('yes') || answer === 'Yes'
        const targetLabel = isYes ? 'Yes' : 'No'

        const radioOption = group.locator(`label:has-text("${targetLabel}"), input[value="${targetLabel}"]`).first()
        if (await radioOption.count() > 0) {
          await radioOption.click().catch(() => {})
        }
      }

      // ─── Handle number inputs ───
      const numberInputs = applyPage.locator('input[type="number"]:visible')
      const numCount = await numberInputs.count()
      for (let i = 0; i < numCount; i++) {
        const input = numberInputs.nth(i)
        const value = await input.inputValue().catch(() => '')
        if (value) continue
        const label = await input.getAttribute('aria-label') || await input.getAttribute('name') || ''
        const labelText = await input.evaluate(el => {
          const parent = el.closest('fieldset, .ia-BasePage-component, label, [class*="question"]')
          return parent?.querySelector('label, legend, span')?.textContent || ''
        }).catch(() => '')
        const answer = answerQuestion(labelText || label, job.cover_letter)
        // Extract number from answer
        const num = answer.match(/\d+/)?.[0] || String(APPLICANT.experience_years)
        await input.fill(num)
        console.log(`  🔢 Number input "${(labelText || label).slice(0, 40)}": ${num}`)
      }

      // ─── Click Continue / Next / Submit (Indeed + company sites) ───
      const continueBtn = applyPage.locator(
        'button:has-text("Continue"), button:has-text("Next"), button:has-text("Review"), ' +
        'button:has-text("Submit your application"), button:has-text("Submit application"), ' +
        'button:has-text("Submit"), button:has-text("Apply"), button:has-text("Send application"), ' +
        'input[type="submit"]:visible, button[type="submit"]:visible'
      ).first()

      if (await continueBtn.count() > 0) {
        const btnText = await continueBtn.innerText().catch(() => 'Next')

        // Check if button is disabled (required field missing)
        const isDisabled = await continueBtn.isDisabled().catch(() => false)
        if (isDisabled) {
          console.log(`  ⚠️ "${btnText.trim()}" button is disabled — required field may be missing`)
          // Take screenshot for debugging
          await takeScreenshot(applyPage, `disabled-btn-${step}-${job.company.replace(/\s+/g, '_')}`)
          // Try to find and fill any empty required fields
          const emptyRequired = applyPage.locator('input:visible[required]:not([type="hidden"]), textarea:visible[required], select:visible[required]')
          const emptyCount = await emptyRequired.count()
          for (let i = 0; i < emptyCount; i++) {
            const field = emptyRequired.nth(i)
            const val = await field.inputValue().catch(() => '')
            if (!val) {
              const fieldLabel = await field.evaluate(el => {
                const parent = el.closest('fieldset, label, [class*="question"], [class*="field"]')
                return parent?.querySelector('label, legend, span')?.textContent || el.getAttribute('placeholder') || el.getAttribute('name') || ''
              }).catch(() => '')
              const answer = answerQuestion(fieldLabel, job.cover_letter)
              const tagName = await field.evaluate(el => el.tagName.toLowerCase())
              if (tagName === 'select') {
                // Select first non-empty option
                await field.selectOption({ index: 1 }).catch(() => {})
              } else {
                await field.fill(answer).catch(() => {})
              }
              console.log(`  📝 Filled required: "${fieldLabel.slice(0, 50)}"`)
            }
          }
          // Also try clicking any unchecked required checkboxes
          const uncheckedBoxes = applyPage.locator('input[type="checkbox"]:visible:not(:checked)')
          const boxCount = await uncheckedBoxes.count()
          for (let i = 0; i < boxCount; i++) {
            await uncheckedBoxes.nth(i).click().catch(() => {})
          }
          await applyPage.waitForTimeout(1000)
          // Re-check if button is now enabled
          const stillDisabled = await continueBtn.isDisabled().catch(() => true)
          if (stillDisabled) {
            console.log('  ❌ Button still disabled — cannot proceed')
            result.status = 'form_error'
            result.detail = 'Required field unfilled — Next button disabled at step ' + step
            result.screenshot_confirm = await takeScreenshot(applyPage, `form-error-${job.company.replace(/\s+/g, '_')}`)
            return result
          }
        }

        console.log(`  ➡️ Clicking "${btnText.trim()}"...`)

        // Pre-submit screenshot if this is the final submit
        if (btnText.toLowerCase().includes('submit') || btnText.toLowerCase().includes('apply')) {
          result.screenshot_pre = await takeScreenshot(applyPage, `pre-submit-${job.company.replace(/\s+/g, '_')}`)
        }

        await continueBtn.click()
        await applyPage.waitForTimeout(2000)
      } else {
        console.log('  ⚠️ No continue/submit button found — step done')
        break
      }
    }

    // Final check — did we succeed?
    const finalText = await applyPage.innerText('body').catch(() => '')
    if (finalText.includes('submitted') || finalText.includes('successfully') || finalText.includes('sent') ||
        finalText.includes('Thank you') || finalText.includes('received your') || finalText.includes('Thanks for applying')) {
      result.status = 'applied'
      result.detail = `Application submitted via ${isCompanySite ? 'company site (' + (result.applied_url || '').split('/')[2] + ')' : 'Indeed Easy Apply'}`
      result.screenshot_confirm = await takeScreenshot(applyPage, `confirm-${job.company.replace(/\s+/g, '_')}`)
    } else {
      result.status = 'form_error'
      result.detail = `Form did not complete after ${maxSteps} steps${isCompanySite ? ' on company site' : ''}`
      result.screenshot_confirm = await takeScreenshot(applyPage, `incomplete-${job.company.replace(/\s+/g, '_')}`)
    }

    return result
  } catch (err) {
    result.status = 'failed'
    result.error = err instanceof Error ? err.message : String(err)
    result.detail = `Error: ${result.error}`
    console.log(`  ❌ Error: ${result.error}`)
    if (page) {
      result.screenshot_confirm = await takeScreenshot(page, `error-${job.company.replace(/\s+/g, '_')}`).catch(() => undefined)
    }
    return result
  } finally {
    if (page && page !== (await context.pages())[0]) {
      await page.close().catch(() => {})
    }
  }
}

// ─── Callback: report result to MCP server ───

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
        applied_url: result.applied_url,
      }),
    })
    if (res.ok) {
      console.log('  📡 Result reported to MCP server')
    } else {
      console.log(`  ⚠️ MCP callback failed: ${res.status}`)
    }
  } catch (e) {
    console.log(`  ⚠️ MCP callback error: ${e}`)
  }
}

// ─── CLI entry point ───

async function main() {
  const args = process.argv.slice(2)
  const isTest = args.includes('--test')
  const isStdin = args.includes('--stdin')

  let jobs: JobInput[] = []

  if (isTest) {
    console.log('🧪 TEST MODE — will open Indeed and try first recommended job\n')
    jobs = [{
      url: 'https://ph.indeed.com',
      title: 'TEST — First Recommended Job',
      company: 'Indeed Test',
    }]
  } else if (isStdin) {
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
      console.log('  npx tsx scripts/apply-indeed.ts --test')
      console.log('  npx tsx scripts/apply-indeed.ts --job \'{"url":"...","title":"...","company":"..."}\'')
      console.log('  echo \'[{...}]\' | npx tsx scripts/apply-indeed.ts --stdin')
      process.exit(1)
    }
  }

  console.log('🚀 NEURALYX Indeed Auto-Apply Agent')
  console.log(`📧 Profile: ${APPLICANT.email}`)
  console.log(`📋 Jobs to apply: ${jobs.length}\n`)

  // Launch Edge via CDP (avoids Playwright automation markers that trigger Turnstile)
  const useCDP = args.includes('--cdp')
  let context: BrowserContext

  if (useCDP) {
    // CDP mode: launch Edge manually, connect via debug port
    const { execSync, spawn } = await import('child_process')
    const CDP_PORT = 9222

    // Check if Edge is already running with remote debugging
    let edgeRunning = false
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      edgeRunning = res.ok
    } catch { edgeRunning = false }

    if (!edgeRunning) {
      console.log('🌐 Launching Edge with CDP on port ' + CDP_PORT + '...')
      spawn(EDGE_PATH, [
        `--remote-debugging-port=${CDP_PORT}`,
        `--profile-directory=${PROFILE_DIR}`,
        '--no-first-run',
      ], { detached: true, stdio: 'ignore' }).unref()
      // Wait for CDP to be ready
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 1000))
        try {
          const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
          if (res.ok) { edgeRunning = true; break }
        } catch {}
      }
      if (!edgeRunning) throw new Error('Edge CDP did not start')
    }

    console.log('🔗 Connecting to Edge via CDP...')
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    context = browser.contexts()[0] || await browser.newContext()
  } else {
    // Standard mode: Playwright persistent context
    console.log('🌐 Launching Edge Profile 7...')
    context = await chromium.launchPersistentContext(
      join(USER_DATA, PROFILE_DIR),
      {
        executablePath: EDGE_PATH,
        headless: false,
        channel: 'msedge',
        args: [
          '--no-first-run',
          '--disable-blink-features=AutomationControlled',
          `--profile-directory=${PROFILE_DIR}`,
        ],
        viewport: { width: 1400, height: 900 },
        ignoreDefaultArgs: ['--enable-automation'],
      }
    )
  }

  const results: ApplyResult[] = []

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]
    console.log(`\n━━━ Job ${i + 1}/${jobs.length}: ${job.title} @ ${job.company} ━━━`)

    const result = await applyToIndeedJob(context, job)
    results.push(result)

    // Report to MCP server
    await reportToMcpServer(result, job.cover_letter)

    console.log(`  Result: ${result.status} — ${result.detail}`)

    // Throttle between applications
    if (i < jobs.length - 1) {
      console.log('  ⏳ Waiting 30s before next application...')
      await new Promise(r => setTimeout(r, 30000))
    }
  }

  // ─── NODE STATUS REPORT ───
  console.log('\n' + '═'.repeat(60))
  console.log('  NEURALYX AUTO-APPLY PIPELINE REPORT')
  console.log('  ' + new Date().toISOString())
  console.log('═'.repeat(60))

  const applied = results.filter(r => r.status === 'applied').length
  const failed = results.filter(r => r.status === 'failed' || r.status === 'form_error').length
  const captcha = results.filter(r => r.status === 'captcha').length
  const alreadyApplied = results.filter(r => r.status === 'already_applied').length

  console.log(`\n  ✅ Applied:          ${applied}`)
  console.log(`  ❌ Failed:           ${failed}`)
  console.log(`  🤖 CAPTCHA blocked:  ${captcha}`)
  console.log(`  🔁 Already applied:  ${alreadyApplied}`)
  console.log(`  📊 Total processed:  ${results.length}`)

  // Per-job detail
  console.log('\n  ─── Per-Job Results ───')
  for (const r of results) {
    const icon = r.status === 'applied' ? '✅' : r.status === 'captcha' ? '🤖' : r.status === 'already_applied' ? '🔁' : '❌'
    console.log(`  ${icon} ${r.job_title} @ ${r.company}`)
    console.log(`     Method: ${r.method} | Status: ${r.status}`)
    console.log(`     ${r.detail}`)
    if (r.applied_url) console.log(`     URL: ${r.applied_url}`)
    if (r.screenshot_confirm) console.log(`     Screenshot: ${r.screenshot_confirm}`)
  }

  console.log('\n' + '═'.repeat(60))

  // Output JSON results for programmatic consumption
  const output = JSON.stringify(results, null, 2)
  writeFileSync(join(SCREENSHOTS_DIR, 'results.json'), output)
  console.log(`📁 Results saved to screenshots/results.json`)

  // Close browser
  await context.close()

  // Single-line JSON on last stdout line — required for runScript() / adapter pattern
  console.log(JSON.stringify(results.length === 1 ? results[0] : { results, total: results.length }))
  process.exit(0)
}

main().catch(err => {
  console.error('Fatal error:', err)
  console.log(JSON.stringify({ status: 'failed', method: 'indeed_easy_apply', detail: `Fatal: ${err}`, job_title: '', company: '', platform: 'indeed' }))
  process.exit(1)
})

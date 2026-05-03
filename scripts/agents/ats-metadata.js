/**
 * ATS metadata registry (Phase 1d / 1c).
 *
 * Plain JS so edge-relay.js can `require()` it.
 * Owns:
 *   - detectAts(url): classify URL → ATS type
 *   - getAtsSelectorBundle(atsType, buttonType): known-good selectors per ATS
 *   - getAtsQuirks(atsType): human-readable quirk list for vision prompts
 *
 * edge-relay consults this BEFORE selectors_cache so cold domains have a
 * baseline to try. The cache still wins once a selector has real success data.
 */

function safeHostname(u) {
  if (!u) return ''
  try { return new URL(u).hostname.toLowerCase() } catch { return '' }
}

function detectAts(url) {
  const h = safeHostname(url)
  if (!h) return null
  if (h.includes('workday')) return 'workday'
  if (h.includes('greenhouse.io')) return 'greenhouse'
  if (h.includes('lever.co')) return 'lever'
  if (h.includes('ashbyhq')) return 'ashby'
  if (h.includes('smartapply.indeed.com')) return 'smartapply'
  if (h === 'www.linkedin.com' || h === 'linkedin.com') return 'linkedin_easy'
  if (h.includes('kalibrr')) return 'kalibrr'
  if (h.includes('jobslin')) return 'jobslin'
  if (h.includes('onlinejobs.ph')) return 'onlinejobs'
  return null
}

const BUNDLES = {
  workday: {
    continue: [
      '[data-automation-id="formButton-Next"]',
      '[data-automation-id="bottom-navigation-next-button"]',
      'button[data-automation-id*="next" i]',
    ],
    submit: [
      '[data-automation-id="formButton-Submit"]',
      '[data-automation-id="bottom-navigation-submit-button"]',
      'button[data-automation-id*="submit" i]',
    ],
    next: [
      '[data-automation-id="formButton-Next"]',
      'button[data-automation-id*="next" i]',
    ],
    apply: [
      '[data-automation-id="adventureButton"]',
      'a[data-automation-id*="apply" i]',
    ],
  },
  greenhouse: {
    continue: ['button#submit_app', 'button[type="submit"]', 'input[type="submit"]'],
    submit: ['button#submit_app', 'button[type="submit"]'],
    next: ['button[type="submit"]'],
    apply: ['a.btn-apply', 'a[href*="application"]'],
  },
  lever: {
    continue: ['button.posting-btn-submit', 'button[type="submit"]'],
    submit: ['button.posting-btn-submit', 'button[type="submit"]'],
    next: ['button[type="submit"]'],
    apply: ['a.postings-btn', 'a[href*="/apply"]'],
  },
  ashby: {
    continue: ['button[type="submit"]', 'button._button_1cj4d_37'],
    submit: ['button[type="submit"]'],
    next: ['button[type="submit"]'],
    apply: ['a[href*="/application"]'],
  },
  smartapply: {
    continue: [
      'button[data-testid="continue-button"]',
      'button[data-testid="IndeedApplyButton"]',
      'button:has-text("Continue")',
    ],
    submit: [
      'button[data-testid="review-submit-button"]',
      'button:has-text("Submit")',
      'button:has-text("Submit application")',
    ],
    next: ['button[data-testid="continue-button"]'],
    apply: ['button[data-testid="IndeedApplyButton"]'],
  },
  linkedin_easy: {
    continue: ['button[aria-label="Continue to next step"]', 'button:has-text("Next")'],
    submit: ['button[aria-label="Submit application"]', 'button:has-text("Submit application")'],
    next: ['button[aria-label="Continue to next step"]'],
    apply: ['button.jobs-apply-button'],
  },
  kalibrr: {
    continue: ['button[type="submit"]', 'button:has-text("Continue")'],
    submit: ['button[type="submit"]', 'button:has-text("Submit")'],
    next: ['button[type="submit"]'],
    apply: ['a[href*="/apply"]'],
  },
}

const QUIRKS = {
  workday: [
    'Multi-step wizard — each "My Information"/"My Experience"/"Review" is a separate page.',
    'First-name + last-name required even when resume is uploaded.',
    'Uses data-automation-id attributes — prefer those over text matching.',
    'Dropdowns use custom widgets; click to expand then pick, never native <select>.',
  ],
  greenhouse: [
    'Single-page form.',
    '[data-source] field has typeahead — type, wait, click suggestion.',
    'File upload via drag-drop zone; click to open file picker.',
  ],
  lever: [
    'Clean single-page form.',
    'File upload is standard <input type="file">.',
    'Very few screening questions usually.',
  ],
  ashby: [
    'Modern SPA — fields render on scroll; must scroll to surface all.',
    'Sometimes uses its own input components that ignore direct .fill().',
  ],
  smartapply: [
    'Invisible reCAPTCHA silently blocks submit — score fires on button click.',
    'Continue button may appear clickable but form will not advance if score too low.',
    'Use waitForCaptchaScore() before clicking Continue.',
  ],
  linkedin_easy: [
    'Modal overlay — never navigates to a new URL.',
    'Review step shows cover-letter field at the end.',
    '"Review" button on some steps is the progress-advance button, not final submit.',
  ],
}

export function getAtsSelectorBundle(atsType, buttonType) {
  if (!atsType || !BUNDLES[atsType]) return []
  return BUNDLES[atsType][buttonType] || []
}

export function getAtsQuirks(atsType) {
  return QUIRKS[atsType] || []
}

export { detectAts }
export default { detectAts, getAtsSelectorBundle, getAtsQuirks }

"""
NEURALYX Browser Harness — AI-driven apply fallback.

Connects to user's Edge via CDP. When scripted apply fails, MCP calls /apply here
with the job URL + applicant profile. Claude (with vision + DOM tools) navigates,
fills the form, submits, returns evidence.

Endpoints:
  GET  /health
  POST /apply  { platform, job_url, profile, max_steps?, dry_run? }
  POST /goto   { url }                          (debug)
"""
import os
import sys
import json
import time
import base64
import logging
import asyncio
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import httpx

from anthropic import AsyncAnthropic
from openai import AsyncOpenAI
try:
    from google import genai as google_genai
    from google.genai import types as genai_types
except Exception:
    google_genai = None
    genai_types = None
from playwright.async_api import async_playwright, Browser, BrowserContext, Page

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("harness")

CDP_URL = os.getenv("CDP_URL", "http://host.docker.internal:9222")
PORT = int(os.getenv("PORT", "7880"))
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_KEY = os.getenv("OPENAI_API_KEY", "")
GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
PROVIDER_ORDER = [p.strip().lower() for p in os.getenv("HARNESS_PROVIDERS", "anthropic,openai,gemini").split(",") if p.strip()]

claude = AsyncAnthropic(api_key=ANTHROPIC_KEY) if ANTHROPIC_KEY else None
openai_client = AsyncOpenAI(api_key=OPENAI_KEY) if OPENAI_KEY else None
gemini_client = google_genai.Client(api_key=GEMINI_KEY) if (google_genai and GEMINI_KEY) else None

if not claude and not openai_client and not gemini_client:
    log.warning("No AI provider configured — /apply will fail")
else:
    available = []
    if claude: available.append(f"anthropic({ANTHROPIC_MODEL})")
    if openai_client: available.append(f"openai({OPENAI_MODEL})")
    if gemini_client: available.append(f"gemini({GEMINI_MODEL})")
    log.info("Providers ready: %s | order=%s", ", ".join(available), PROVIDER_ORDER)

app = FastAPI(title="NEURALYX Browser Harness")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ─── CDP connection ───────────────────────────────────────────────────────
_pw = None
_browser: Optional[Browser] = None
_context: Optional[BrowserContext] = None


# Chromium CDP requires Host header = IP/localhost (security check).
# Since we go through host.docker.internal:9224 → 127.0.0.1:9222, override Host.
CDP_HEADERS = {"Host": "localhost"}


async def cdp_alive() -> bool:
    try:
        async with httpx.AsyncClient(timeout=3) as c:
            r = await c.get(f"{CDP_URL}/json/version", headers=CDP_HEADERS)
            return r.status_code == 200
    except Exception:
        return False


async def fetch_ws_url() -> str:
    """Fetch the websocket debugger URL from Edge's /json/version, then
    rewrite host:port to point back through our relay (since Edge embeds the
    Host header it received, which is 'localhost' due to its security check)."""
    async with httpx.AsyncClient(timeout=5) as c:
        r = await c.get(f"{CDP_URL}/json/version", headers=CDP_HEADERS)
        r.raise_for_status()
        data = r.json()
    ws = data.get("webSocketDebuggerUrl", "")
    if not ws:
        raise HTTPException(503, "Edge returned no webSocketDebuggerUrl")
    # ws is like ws://localhost/devtools/browser/<guid> — rewrite host part
    # CDP_URL is http://host:port → ws://host:port
    cdp_host_port = CDP_URL.replace("http://", "").replace("https://", "").rstrip("/")
    # Replace whatever ws:// host[:port] Edge gave us with our reachable one
    import re
    return re.sub(r"^ws://[^/]+", f"ws://{cdp_host_port}", ws)


async def _connect_fresh() -> BrowserContext:
    global _pw, _browser, _context
    if not await cdp_alive():
        raise HTTPException(503, f"Edge CDP not reachable at {CDP_URL}")
    if not _pw:
        _pw = await async_playwright().start()
    # Cleanly drop any stale browser before reconnecting
    if _browser:
        try: await _browser.close()
        except Exception: pass
    ws_url = await fetch_ws_url()
    log.info("Connecting to ws %s", ws_url)
    _browser = await _pw.chromium.connect_over_cdp(ws_url, timeout=10_000)
    _context = _browser.contexts[0] if _browser.contexts else await _browser.new_context()
    log.info("Connected to Edge CDP (fresh)")
    return _context


async def get_context() -> BrowserContext:
    """Return a working BrowserContext. Probes the cached connection with a
    cheap op (.pages() then .new_cdp_session) to detect dead transports.
    Reconnects automatically on failure."""
    global _browser, _context
    if _context and _browser and _browser.is_connected():
        # Real liveness probe — .is_connected() can lie when transport died silently
        try:
            _ = _context.pages  # cheap getter, must not throw on live ctx
            # Round-trip probe: open + close a CDP session against the browser
            sess = await _browser.new_browser_cdp_session()
            await sess.send("Browser.getVersion")
            await sess.detach()
            return _context
        except Exception as e:
            log.warning("Cached context dead (%s) — reconnecting", str(e)[:80])
            _context = None
            _browser = None
    return await _connect_fresh()


# ─── Tools exposed to Claude ─────────────────────────────────────────────
TOOLS = [
    {
        "name": "snapshot",
        "description": "Take an accessibility snapshot of the current page. Returns labelled element refs (ref=eN) and text content. Use this to see what's on the page before clicking/typing.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "screenshot",
        "description": "Take a screenshot of the current viewport. Returns base64 PNG. Use this when accessibility snapshot is unclear (e.g. canvas captcha, image-heavy page).",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "click",
        "description": "Click an element by accessibility ref (e.g. 'e3') from the latest snapshot.",
        "input_schema": {"type": "object", "properties": {"ref": {"type": "string"}}, "required": ["ref"]},
    },
    {
        "name": "type",
        "description": "Type text into an element by ref. Clears the field first.",
        "input_schema": {
            "type": "object",
            "properties": {"ref": {"type": "string"}, "text": {"type": "string"}, "submit": {"type": "boolean"}},
            "required": ["ref", "text"],
        },
    },
    {
        "name": "select",
        "description": "Select an option in a <select> dropdown by ref.",
        "input_schema": {
            "type": "object",
            "properties": {"ref": {"type": "string"}, "value": {"type": "string"}},
            "required": ["ref", "value"],
        },
    },
    {
        "name": "navigate",
        "description": "Navigate the page to a URL.",
        "input_schema": {"type": "object", "properties": {"url": {"type": "string"}}, "required": ["url"]},
    },
    {
        "name": "wait",
        "description": "Wait for milliseconds (use sparingly, max 5000).",
        "input_schema": {"type": "object", "properties": {"ms": {"type": "integer"}}, "required": ["ms"]},
    },
    {
        "name": "click_at",
        "description": "Click at viewport pixel coordinates (x, y). Use ONLY for captcha image grids when you can see a tile to click in a screenshot. For all normal page elements use 'click' with a ref.",
        "input_schema": {
            "type": "object",
            "properties": {
                "x": {"type": "integer", "description": "Viewport X coordinate"},
                "y": {"type": "integer", "description": "Viewport Y coordinate"},
                "reason": {"type": "string", "description": "Why you're clicking here (for logs)"},
            },
            "required": ["x", "y"],
        },
    },
    {
        "name": "iframe_screenshot",
        "description": "Take a screenshot of a specific iframe (for captchas that render in iframes). Pass the partial URL match of the iframe src (e.g. 'recaptcha', 'hcaptcha', 'funcaptcha').",
        "input_schema": {
            "type": "object",
            "properties": {
                "iframe_src_match": {"type": "string"},
            },
            "required": ["iframe_src_match"],
        },
    },
    {
        "name": "finish",
        "description": "Call when the application is submitted OR when you cannot proceed. Provide status and evidence.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["applied", "already_applied", "blocked_captcha", "blocked_login", "blocked_unknown", "external_redirect", "skipped"]},
                "reason": {"type": "string"},
                "evidence": {"type": "string", "description": "What you saw confirming the outcome (success banner text, error message, etc.)"},
            },
            "required": ["status"],
        },
    },
]


# ─── Snapshot helper (lightweight a11y tree) ──────────────────────────────
SNAPSHOT_JS = r"""
(() => {
  let counter = 0;
  const refs = new WeakMap();
  function visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    return true;
  }
  function describe(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') || '';
    const aria = el.getAttribute('aria-label') || '';
    const txt = (el.innerText || '').trim().slice(0, 80);
    const placeholder = el.getAttribute('placeholder') || '';
    const name = el.getAttribute('name') || '';
    const type = el.getAttribute('type') || '';
    const label = aria || placeholder || txt || name;
    return `${tag}${role ? `[role=${role}]` : ''}${type ? `[type=${type}]` : ''}${label ? ` "${label}"` : ''}`;
  }
  const out = [];
  const sels = 'a, button, input, textarea, select, [role=button], [role=link], [role=textbox], [role=combobox], [role=checkbox], [role=radio], [contenteditable=true]';
  document.querySelectorAll(sels).forEach((el) => {
    if (!visible(el)) return;
    counter++;
    const ref = `e${counter}`;
    el.setAttribute('data-neuralyx-ref', ref);
    out.push(`${ref}: ${describe(el)}`);
  });
  // Also include important headings + status text
  document.querySelectorAll('h1, h2, h3, [role=alert], [role=status], .error, .success').forEach((el) => {
    if (!visible(el)) return;
    const txt = (el.innerText || '').trim().slice(0, 120);
    if (txt) out.push(`text: ${txt}`);
  });
  return { url: location.href, title: document.title, elements: out.join('\n') };
})()
"""


async def tool_snapshot(page: Page) -> dict:
    return await page.evaluate(SNAPSHOT_JS)


async def find_by_ref(page: Page, ref: str):
    return page.locator(f'[data-neuralyx-ref="{ref}"]').first


async def execute_tool(page: Page, name: str, inp: dict) -> dict:
    try:
        if name == "snapshot":
            snap = await tool_snapshot(page)
            return {"ok": True, "url": snap["url"], "title": snap["title"], "elements": snap["elements"]}
        if name == "screenshot":
            png = await page.screenshot(full_page=False, type="png")
            return {"ok": True, "image_b64": base64.b64encode(png).decode("ascii")}
        if name == "click":
            loc = await find_by_ref(page, inp["ref"])
            await loc.scroll_into_view_if_needed(timeout=3000)
            await loc.click(timeout=8000)
            await page.wait_for_load_state("domcontentloaded", timeout=8000)
            return {"ok": True}
        if name == "type":
            loc = await find_by_ref(page, inp["ref"])
            await loc.click(timeout=5000)
            await loc.fill("", timeout=3000)
            await loc.fill(inp["text"], timeout=8000)
            if inp.get("submit"):
                await loc.press("Enter")
            return {"ok": True}
        if name == "select":
            loc = await find_by_ref(page, inp["ref"])
            await loc.select_option(inp["value"], timeout=5000)
            return {"ok": True}
        if name == "navigate":
            await page.goto(inp["url"], wait_until="domcontentloaded", timeout=25_000)
            return {"ok": True}
        if name == "wait":
            await page.wait_for_timeout(min(int(inp["ms"]), 5000))
            return {"ok": True}
        if name == "click_at":
            x = int(inp["x"]); y = int(inp["y"])
            await page.mouse.click(x, y)
            await page.wait_for_timeout(800)
            return {"ok": True, "clicked_at": [x, y], "reason": inp.get("reason", "")}
        if name == "iframe_screenshot":
            match = inp["iframe_src_match"].lower()
            for fr in page.frames:
                src = (fr.url or "").lower()
                if match in src:
                    try:
                        # Find the iframe element and screenshot just that region
                        # Fall back to full-page if locator fails
                        try:
                            elem = await page.query_selector(f'iframe[src*="{match}"]')
                            if elem:
                                png = await elem.screenshot(type="png")
                                return {"ok": True, "image_b64": base64.b64encode(png).decode("ascii"), "iframe_url": src}
                        except Exception:
                            pass
                    except Exception as e:
                        return {"ok": False, "reason": f"iframe screenshot failed: {e}"}
            png = await page.screenshot(type="png")
            return {"ok": True, "image_b64": base64.b64encode(png).decode("ascii"), "fallback": "full_page"}
        return {"ok": False, "reason": f"unknown tool {name}"}
    except Exception as e:
        return {"ok": False, "reason": f"{name}: {str(e)[:200]}"}


# ─── Apply request ───────────────────────────────────────────────────────
class ApplyReq(BaseModel):
    platform: str
    job_url: str
    profile: dict[str, Any]
    max_steps: int = 30
    dry_run: bool = False
    attach_to_url_match: Optional[str] = None  # If set, find existing tab whose URL contains this substring instead of opening new
    stuck_context: Optional[str] = None  # Optional hint passed to the model about what scripted apply tried before bailing


INDEED_FLOW_PLAYBOOK = """
═══ INDEED SMARTAPPLY FLOW — exact sequence ═══
You're at smartapply.indeed.com (SPA — URL barely changes; track progress by heading + progress %).

ENTRY: Coming from a job page, the user already clicked "Apply with Indeed". You land
       directly inside the wizard. The wizard has 3-5 windows. You walk them one by one.

WINDOW 1 — "Add a resume for the employer"
  - Resume preview shown, already selected (FIX RESUME APRIL UPDATE.pdf).
  - ACTION: Scroll down, click "Continue".

WINDOW 2 — "Relevant experience" (sometimes labeled "Work experience" or "Job title")
  - Form fields: previous job title, company, dates, optional description.
  - ACTION: Fill from profile (title="AI Systems Engineer & Automation Developer",
    company="Wooder Group Pty Ltd", years from profile.experience_years).
    If pre-filled, leave it. Click "Continue".

WINDOW 3 — "Employer questions" (OPTIONAL — only if employer added qualifiers)
  - Radio Yes/No, short text, dropdowns. Examples:
    * "Authorized to work in PH?" → Yes
    * "Years of experience with X?" → use profile values; default 5+ for any tech listed
    * "Salary expectation?" → use profile.salary_php
    * "Willing to work remote?" → Yes
  - ACTION: Answer every required field. Click "Continue".

WINDOW 4 — "Review your application" (always the final window)
  - Summary of everything you filled. NO new fields.
  - ACTION: Click "Submit your application" (or "Submit application").
  - DO NOT click "Save and close" — that quits without submitting.

SUCCESS — "Application submitted" banner OR redirect with "Applied" label
  - ACTION: call finish(status="applied", evidence="<the success text you saw>").

═══ NON-NEGOTIABLE RULES ═══
- Continue button is at BOTTOM. Always scroll down before looking for it.
- Each Continue click MUST advance the progress % (43→57→71→100). If % didn't change, the
  button was blocked — scroll up, look for a red required field, fill it, retry Continue.
- "Save and continue" = Continue. CLICK IT. "Save and close" = quit. NEVER click it.
- "Tell us more" / "Need help?" links at bottom are help links. IGNORE.
- "This site is protected by reCAPTCHA" footer text = invisible v3 background score = NOT
  a challenge. KEEP GOING. Do NOT call finish(blocked_captcha) for this.
- Never call finish() while a Continue/Submit button is visible and reachable. CLICK FIRST.

═══ CAPTCHA SUB-AGENT — when a REAL challenge appears ═══
A real captcha appears when (a) Indeed flags low risk-score after Submit, or (b) reCAPTCHA
v2 explicit checkbox renders. Recognize these patterns:

A) "I'm not a robot" CHECKBOX
   - Visible reCAPTCHA iframe with a clickable checkbox.
   - ACTION: snapshot → find the checkbox iframe → click the checkbox via its ref.
   - If a green check appears, you're done — return to clicking Submit.

B) IMAGE GRID challenge ("Select all images with traffic lights")
   - 3x3 or 4x4 grid of image tiles inside a reCAPTCHA iframe.
   - ACTION: call iframe_screenshot(iframe_src_match="recaptcha") to see the grid.
   - Identify which tiles match the prompt (e.g. tiles with traffic lights).
   - Each tile is roughly the iframe width / N. Compute viewport coordinates of each
     matching tile's CENTER. Use click_at(x, y) to click each one.
   - Then take screenshot to verify, click VERIFY in the captcha, snapshot, retry Submit.

C) SLIDER puzzle (uncommon on Indeed)
   - "Slide right to verify" or piece-fitting puzzle.
   - ACTION: call finish(status=blocked_captcha) — slider auto-solve is too unreliable.

D) hCaptcha / FunCaptcha (rare on Indeed)
   - ACTION: call finish(status=blocked_captcha).

CAPTCHA RULES:
- Only attempt A and B above. C and D → finish.
- After solving (A or B), snapshot to confirm the iframe disappears or shows green check.
- THEN go back to clicking Submit your application.
- Max 2 captcha attempts before giving up and finishing(blocked_captcha).
"""


def system_prompt(req: ApplyReq) -> str:
    p = req.profile
    indeed_block = INDEED_FLOW_PLAYBOOK if req.platform.lower() == "indeed" else ""
    stuck_hint = f"\n\nCONTEXT FROM SCRIPTED APPLY:\n{req.stuck_context}\nThe scripted apply got stuck — your job is to UNSTICK it by clicking the right next button.\n" if req.stuck_context else ""
    return f"""You are an autonomous job-application agent. Your goal: apply to ONE job posting on {req.platform}.{indeed_block}{stuck_hint}

APPLICANT PROFILE (use these exact values when filling forms):
- Name: {p.get('name','')}
- Email: {p.get('email','')}
- Phone: {p.get('phone','')}
- Location: {p.get('location','')}
- Title: {p.get('title','')}
- Years experience: {p.get('experience_years','')}
- Salary expectation: {p.get('salary_php','')} PHP/mo
- LinkedIn: {p.get('linkedin','')}
- Portfolio: {p.get('portfolio','')}
- GitHub: {p.get('github','')}
- Resume URL: {p.get('resume_url','')}
- Work auth: {p.get('work_authorization','')}
- WFH OK: {p.get('willing_wfh','Yes')}
- Start date: {p.get('start_date','Immediately')}

WORKFLOW:
1. Call snapshot to see the page. Find the apply / Easy Apply button.
2. Click it. Snapshot again. You'll see a form.
3. Fill each field with profile data above. For unknown questions, answer professionally as Gabriel.
4. For dropdowns: snapshot first, then `select` with exact option value seen in snapshot.
5. Multi-step forms: click Next/Continue between steps. Always snapshot after each click.
6. When you see Submit / Apply Now (final), {'do NOT click — call finish with status=applied and reason=dry_run' if req.dry_run else 'click it. Wait for confirmation.'}
7. Call finish ONLY when (a) the application is actually submitted (you see a success page/banner), or (b) you are truly blocked.

═══ CRITICAL — DO NOT FINISH PREMATURELY ═══
- "Continue", "Next", "Save and continue", "Review your application" are NEVER final buttons.
  When you see them: CLICK them, then snapshot again. Repeat.
- The "Add a resume for the employer" page with a "Continue" button = CLICK Continue, do NOT finish.
- The "Add a cover letter" / "Add contact info" / "Review" pages = CLICK their Continue/Submit, do NOT finish.
- ONLY the FINAL "Submit application" / "Send application" button completes the apply.
- If you describe a next step in your reasoning ("the next step is to click Continue"), you MUST then call the `click` tool with that button's ref. Do NOT call `finish` describing what should happen — DO IT.
- If the page has a progress bar (e.g. "43%"), the apply is NOT complete. Keep going.
- Saying "the most logical next step is to click X" without then clicking X = WRONG. Click first, finish later.

RULES:
- Max {req.max_steps} tool calls. Be efficient.
- If you see a real CAPTCHA challenge (image grid, slider, "I'm not a robot" checkbox blocked): call finish with status=blocked_captcha.
  "This site is protected by reCAPTCHA" footer text alone is NOT a captcha — it's just a notice. Keep going.
- If login required (sign-in form, "Please log in to continue"): call finish with status=blocked_login.
- If "Already applied" or similar success-style banner: call finish with status=already_applied.
- If apply button leads to external site (URL changed to non-Indeed company site): call finish with status=external_redirect, evidence=URL.
- Do NOT invent data. Use ONLY the profile values above.
- Skim snapshots; don't waste tokens echoing them back."""


# ─── Multi-provider AI router ────────────────────────────────────────────
# Each provider returns: {"tool_uses": [{"id", "name", "input"}], "text": str, "raw_assistant_message": <provider-specific>}
# Each provider also accepts a "results" list to feed tool_results back.

def _anthropic_tools_to_openai(tools: list[dict]) -> list[dict]:
    return [{"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["input_schema"]}} for t in tools]


async def _call_anthropic(messages: list, sys_prompt: str, tools: list[dict]):
    if not claude: raise RuntimeError("anthropic_unavailable")
    resp = await claude.messages.create(
        model=ANTHROPIC_MODEL, max_tokens=2000, system=sys_prompt, tools=tools, messages=messages,
    )
    tool_uses = [{"id": b.id, "name": b.name, "input": b.input} for b in resp.content if b.type == "tool_use"]
    text = "".join(b.text for b in resp.content if b.type == "text")
    return {"tool_uses": tool_uses, "text": text, "assistant_msg": {"role": "assistant", "content": resp.content}}


def _openai_results_to_messages(prev_assistant_msg, tool_results: list[dict]) -> list[dict]:
    # OpenAI expects role:"tool" messages with tool_call_id reference. Image results
    # aren't supported in role:"tool", so we encode images as a user content message instead.
    out = []
    for r in tool_results:
        if r.get("image_b64"):
            # Placeholder text in the tool-result, image goes as separate user message
            out.append({"role": "tool", "tool_call_id": r["tool_use_id"], "content": "[image returned — see next user message]"})
            out.append({"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{r['image_b64']}"}},
                {"type": "text", "text": r.get("text", "Screenshot")},
            ]})
        else:
            out.append({"role": "tool", "tool_call_id": r["tool_use_id"], "content": r.get("content", "")})
    return out


async def _call_openai(messages: list, sys_prompt: str, tools: list[dict]):
    if not openai_client: raise RuntimeError("openai_unavailable")
    # Inject system prompt as first message if not already
    msgs = [{"role": "system", "content": sys_prompt}] + messages
    resp = await openai_client.chat.completions.create(
        model=OPENAI_MODEL, max_tokens=2000, tools=_anthropic_tools_to_openai(tools), messages=msgs,
    )
    msg = resp.choices[0].message
    tool_uses = []
    if msg.tool_calls:
        import json as _json
        for tc in msg.tool_calls:
            try: args = _json.loads(tc.function.arguments)
            except Exception: args = {}
            tool_uses.append({"id": tc.id, "name": tc.function.name, "input": args})
    return {"tool_uses": tool_uses, "text": msg.content or "", "assistant_msg": {"role": "assistant", "content": msg.content or "", "tool_calls": [{"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}} for tc in (msg.tool_calls or [])]}}


PROVIDER_ERRORS_TO_FALLBACK = (
    "credit balance", "billing", "insufficient_quota", "invalid_api_key",
    "authentication", "rate limit", "rate_limit",
)


def _should_fallback(err: Exception) -> bool:
    msg = str(err).lower()
    return any(t in msg for t in PROVIDER_ERRORS_TO_FALLBACK)


def _anthropic_tools_to_gemini(tools: list[dict]):
    if not genai_types: return []
    fns = []
    for t in tools:
        # Gemini schema is a subset of OpenAPI — pass it as-is
        fns.append(genai_types.FunctionDeclaration(name=t["name"], description=t["description"], parameters=t["input_schema"]))
    return [genai_types.Tool(function_declarations=fns)]


def _messages_to_gemini_history(messages: list[dict]):
    """Convert anthropic-shaped messages to gemini contents.
    Image content blocks (from screenshots) become inline_data parts."""
    if not genai_types: return []
    contents = []
    for m in messages:
        role = "user" if m["role"] == "user" else "model"
        parts = []
        c = m.get("content", "")
        if isinstance(c, str):
            parts.append(genai_types.Part(text=c))
        elif isinstance(c, list):
            for item in c:
                if isinstance(item, dict):
                    t = item.get("type")
                    if t == "text":
                        parts.append(genai_types.Part(text=item.get("text", "")))
                    elif t == "image":
                        src = item.get("source", {})
                        if src.get("type") == "base64":
                            parts.append(genai_types.Part(inline_data=genai_types.Blob(
                                mime_type=src.get("media_type", "image/png"),
                                data=base64.b64decode(src["data"]),
                            )))
                    elif t == "tool_result":
                        # Encode as a function_response for Gemini
                        content = item.get("content")
                        if isinstance(content, list):
                            for sub in content:
                                if isinstance(sub, dict) and sub.get("type") == "image":
                                    src = sub.get("source", {})
                                    parts.append(genai_types.Part(inline_data=genai_types.Blob(
                                        mime_type=src.get("media_type", "image/png"),
                                        data=base64.b64decode(src["data"]),
                                    )))
                                elif isinstance(sub, dict) and sub.get("type") == "text":
                                    parts.append(genai_types.Part(text=sub.get("text", "")))
                        else:
                            parts.append(genai_types.Part(text=str(content)))
                    elif t == "tool_use":
                        # Anthropic-style tool_use blocks → Gemini function_call
                        parts.append(genai_types.Part(function_call=genai_types.FunctionCall(
                            name=item.get("name", ""), args=item.get("input", {}),
                        )))
                else:
                    parts.append(genai_types.Part(text=str(item)))
        if parts:
            contents.append(genai_types.Content(role=role, parts=parts))
    return contents


async def _call_gemini(messages: list, sys_prompt: str, tools: list[dict]):
    if not gemini_client: raise RuntimeError("gemini_unavailable")
    contents = _messages_to_gemini_history(messages)
    config = genai_types.GenerateContentConfig(
        system_instruction=sys_prompt,
        tools=_anthropic_tools_to_gemini(tools),
        max_output_tokens=2000,
    )
    resp = await asyncio.to_thread(
        gemini_client.models.generate_content,
        model=GEMINI_MODEL, contents=contents, config=config,
    )
    tool_uses = []
    text_parts = []
    raw_parts = []
    for cand in (resp.candidates or [])[:1]:
        for p in (cand.content.parts or []):
            if getattr(p, "function_call", None):
                fc = p.function_call
                # Generate a stable id since Gemini doesn't provide one
                tool_uses.append({"id": f"gemini_{len(tool_uses)}_{fc.name}", "name": fc.name, "input": dict(fc.args) if fc.args else {}})
                raw_parts.append({"type": "tool_use", "name": fc.name, "input": dict(fc.args) if fc.args else {}})
            elif getattr(p, "text", None):
                text_parts.append(p.text)
                raw_parts.append({"type": "text", "text": p.text})
    return {"tool_uses": tool_uses, "text": "".join(text_parts), "assistant_msg": {"role": "assistant", "content": raw_parts or "".join(text_parts)}}


async def call_ai(messages: list, sys_prompt: str, tools: list[dict]) -> dict:
    """Try providers in order. Auto-fallback on billing/auth/rate errors."""
    last_err = None
    for provider in PROVIDER_ORDER:
        try:
            if provider == "anthropic":
                if not claude: continue
                return {"provider": "anthropic", **await _call_anthropic(messages, sys_prompt, tools)}
            if provider == "openai":
                if not openai_client: continue
                return {"provider": "openai", **await _call_openai(messages, sys_prompt, tools)}
            if provider == "gemini":
                if not gemini_client: continue
                return {"provider": "gemini", **await _call_gemini(messages, sys_prompt, tools)}
        except Exception as e:
            last_err = e
            log.warning("Provider %s failed: %s", provider, str(e)[:160])
            if not _should_fallback(e):
                raise
            log.info("Falling back to next provider")
            continue
    raise RuntimeError(f"All providers failed. Last: {last_err}")


@app.get("/health")
async def health():
    cdp = await cdp_alive()
    return {"ok": True, "cdp_alive": cdp, "cdp_url": CDP_URL,
            "anthropic_ready": claude is not None, "anthropic_model": ANTHROPIC_MODEL,
            "openai_ready": openai_client is not None, "openai_model": OPENAI_MODEL,
            "gemini_ready": gemini_client is not None, "gemini_model": GEMINI_MODEL,
            "provider_order": PROVIDER_ORDER}


@app.post("/goto")
async def goto(body: dict):
    ctx = await get_context()
    page = await ctx.new_page()
    page.on("dialog", lambda d: asyncio.create_task(d.dismiss()))
    await page.goto(body["url"], wait_until="domcontentloaded", timeout=25_000)
    return {"ok": True, "url": page.url, "title": await page.title()}


@app.post("/apply")
async def apply(req: ApplyReq):
    if not claude and not openai_client:
        raise HTTPException(503, "No AI provider configured — set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env and restart harness")
    # Two-attempt connect: first try cached ctx; if new_page errors with
    # "transport closed" / similar, force a fresh connection.
    page = None
    last_err = None
    attached_existing = False
    for attempt in (1, 2):
        try:
            ctx = await get_context() if attempt == 1 else await _connect_fresh()
            # Attach mode: find an existing tab matching the URL substring (so we
            # take over an in-progress smartapply form instead of starting fresh).
            if req.attach_to_url_match:
                match = req.attach_to_url_match.lower()
                for p in ctx.pages:
                    try:
                        if match in (p.url or "").lower():
                            page = p
                            attached_existing = True
                            log.info("Attached to existing tab: %s", p.url)
                            break
                    except Exception:
                        continue
            if page is None:
                page = await ctx.new_page()
            break
        except Exception as e:
            last_err = e
            log.warning("page-acquire attempt %d failed: %s", attempt, str(e)[:120])
    if page is None:
        raise HTTPException(503, f"Could not open page after retry: {last_err}")
    page.on("dialog", lambda d: asyncio.create_task(d.dismiss()))
    transcript: list[dict] = []
    try:
        if not attached_existing:
            await page.goto(req.job_url, wait_until="domcontentloaded", timeout=25_000)
            await page.wait_for_timeout(1500)
        else:
            # Attached to existing tab — give it a moment to render, then bring focus
            await page.wait_for_timeout(500)

        sys_prompt = system_prompt(req)
        messages: list[dict] = [{"role": "user", "content": f"Apply to: {req.job_url}\nPlatform: {req.platform}"}]
        final = None
        provider_used = None

        for step in range(req.max_steps):
            try:
                ai_resp = await call_ai(messages, sys_prompt, TOOLS)
            except Exception as e:
                msg = str(e).lower()
                if "credit balance" in msg or "billing" in msg or "insufficient_quota" in msg:
                    return {"ok": False, "platform": req.platform, "job_url": req.job_url,
                            "result": {"status": "blocked_billing",
                                       "reason": "All AI providers out of credits/quota. Top up Anthropic OR OpenAI.",
                                       "evidence": str(e)[:200]},
                            "steps_used": step, "transcript": transcript}
                if "authentication" in msg or "invalid_api_key" in msg:
                    return {"ok": False, "platform": req.platform, "job_url": req.job_url,
                            "result": {"status": "blocked_auth",
                                       "reason": "All AI provider keys invalid",
                                       "evidence": str(e)[:200]},
                            "steps_used": step, "transcript": transcript}
                if "rate limit" in msg or "rate_limit" in msg:
                    return {"ok": False, "platform": req.platform, "job_url": req.job_url,
                            "result": {"status": "blocked_rate_limit",
                                       "reason": "All AI providers rate-limited — wait 60s",
                                       "evidence": str(e)[:200]},
                            "steps_used": step, "transcript": transcript}
                # Unknown error — bail
                return {"ok": False, "platform": req.platform, "job_url": req.job_url,
                        "result": {"status": "blocked_unknown",
                                   "reason": f"AI provider error: {str(e)[:200]}",
                                   "evidence": ""},
                        "steps_used": step, "transcript": transcript}

            provider_used = ai_resp["provider"]
            messages.append(ai_resp["assistant_msg"])

            tool_uses = ai_resp["tool_uses"]
            if not tool_uses:
                final = {"status": "blocked_unknown", "reason": "agent stopped without finish", "evidence": (ai_resp.get("text") or "")[:500]}
                break

            results = []
            for tu in tool_uses:
                if tu["name"] == "finish":
                    final = tu["input"]
                    transcript.append({"step": step, "tool": "finish", "input": tu["input"]})
                    break
                t0 = time.time()
                out = await execute_tool(page, tu["name"], tu["input"])
                ms = int((time.time() - t0) * 1000)
                transcript.append({"step": step, "tool": tu["name"], "input": tu["input"], "result": {k: v for k, v in out.items() if k != "image_b64"}, "ms": ms, "provider": provider_used})
                results.append({"tool_use_id": tu["id"], "name": tu["name"], "image_b64": out.get("image_b64"), "text": f"Screenshot of {page.url}" if tu["name"] in ("screenshot", "iframe_screenshot") else "", "content": json.dumps({k: v for k, v in out.items() if k != "image_b64"})})

            if final:
                break

            # Encode results in provider-appropriate format
            if provider_used == "anthropic":
                anthropic_results = []
                for r in results:
                    if r.get("image_b64"):
                        anthropic_results.append({
                            "type": "tool_result", "tool_use_id": r["tool_use_id"],
                            "content": [
                                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": r["image_b64"]}},
                                {"type": "text", "text": r.get("text") or "Screenshot"},
                            ],
                        })
                    else:
                        anthropic_results.append({"type": "tool_result", "tool_use_id": r["tool_use_id"], "content": r.get("content", "")})
                messages.append({"role": "user", "content": anthropic_results})
            else:  # openai
                messages.extend(_openai_results_to_messages(ai_resp["assistant_msg"], results))

        if not final:
            final = {"status": "blocked_unknown", "reason": f"max_steps {req.max_steps} reached"}

        return {
            "ok": True,
            "platform": req.platform,
            "job_url": req.job_url,
            "result": final,
            "steps_used": len(transcript),
            "provider_used": provider_used,
            "transcript": transcript,
        }

    finally:
        # If we attached to an existing tab, leave it open so user can see the result
        if not attached_existing:
            await page.close()


if __name__ == "__main__":
    log.info("Starting browser-harness on port %d (CDP=%s, providers=%s)", PORT, CDP_URL, PROVIDER_ORDER)
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")

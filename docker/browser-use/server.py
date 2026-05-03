"""
NEURALYX browser-use sidecar (Tier-3 escalation).
Wraps browser-use 0.11.x — uses BrowserSession + their own LLM classes
(NOT langchain).
"""
import os
import logging
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import httpx

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("bu-sidecar")

CDP_URL = os.getenv("CDP_URL", "http://host.docker.internal:9224")
PORT = int(os.getenv("PORT", "7882"))
BU_PROVIDER = os.getenv("BU_PROVIDER", "gemini").lower()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
OPENAI_KEY = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")

_bu_imports_ok = False
try:
    from browser_use import Agent
    from browser_use.browser import BrowserSession, BrowserProfile
    from browser_use.llm.google import ChatGoogle
    from browser_use.llm.openai.chat import ChatOpenAI
    from browser_use.llm.anthropic.chat import ChatAnthropic
    _bu_imports_ok = True
except Exception as e:
    log.error("browser-use import failed: %s", e)


def make_llm():
    """Pick the LLM provider based on BU_PROVIDER + available keys."""
    if BU_PROVIDER == "gemini" and GEMINI_KEY:
        return ChatGoogle(model=GEMINI_MODEL, api_key=GEMINI_KEY)
    if BU_PROVIDER == "openai" and OPENAI_KEY:
        return ChatOpenAI(model=OPENAI_MODEL, api_key=OPENAI_KEY)
    if BU_PROVIDER == "anthropic" and ANTHROPIC_KEY:
        return ChatAnthropic(model=ANTHROPIC_MODEL, api_key=ANTHROPIC_KEY)
    if GEMINI_KEY: return ChatGoogle(model=GEMINI_MODEL, api_key=GEMINI_KEY)
    if OPENAI_KEY: return ChatOpenAI(model=OPENAI_MODEL, api_key=OPENAI_KEY)
    if ANTHROPIC_KEY: return ChatAnthropic(model=ANTHROPIC_MODEL, api_key=ANTHROPIC_KEY)
    raise HTTPException(503, "No LLM provider key set")


async def cdp_alive() -> bool:
    try:
        async with httpx.AsyncClient(timeout=3) as c:
            r = await c.get(f"{CDP_URL}/json/version", headers={"Host": "localhost"})
            return r.status_code == 200
    except Exception:
        return False


app = FastAPI(title="NEURALYX browser-use sidecar")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class ApplyReq(BaseModel):
    platform: str
    job_url: str
    profile: dict[str, Any]
    max_steps: int = 30
    task_override: Optional[str] = None


def build_task(req: ApplyReq) -> str:
    if req.task_override:
        return req.task_override
    p = req.profile
    return f"""Apply to a job on {req.platform}. Job URL: {req.job_url}

Use these EXACT applicant details when filling forms:
- Name: {p.get('name','')}
- Email: {p.get('email','')}
- Phone: {p.get('phone','')}
- Location: {p.get('location','')}
- Title: {p.get('title','')}
- Years experience: {p.get('experience_years','')}
- Salary expectation: PHP {p.get('salary_php','')}/month
- LinkedIn: {p.get('linkedin','')}
- Portfolio: {p.get('portfolio','')}
- GitHub: {p.get('github','')}
- Resume URL: {p.get('resume_url','')}
- Work auth: {p.get('work_authorization','')}
- WFH: {p.get('willing_wfh','Yes')}
- Start date: {p.get('start_date','Immediately')}

INDEED FLOW (smartapply.indeed.com is a single-page wizard, URL barely changes):
  1. Resume page  → click "Continue" (resume is auto-selected).
  2. Relevant experience → fill from profile + click "Continue".
  3. Employer questions (sometimes) → answer Yes when reasonable, fill text from profile, click "Continue".
  4. Review your application → click "Submit your application".
  5. Confirm a success banner appears.

RULES:
- "Continue" / "Save and continue" = advance step. Always click these.
- NEVER click "Save and close" — that quits without submitting.
- "This site is protected by reCAPTCHA" footer is just a notice, NOT a captcha challenge.
- A REAL captcha is a checkbox or image grid — only then report blocked.
- Don't invent data; only use the profile values above.
- Goal: actually click "Submit your application" and confirm the success banner.

Report the final outcome: applied / blocked_captcha / blocked_login / external_redirect / failed."""


@app.get("/health")
async def health():
    cdp = await cdp_alive()
    return {
        "ok": True, "service": "browser-use", "cdp_alive": cdp, "cdp_url": CDP_URL,
        "browser_use_loaded": _bu_imports_ok, "active_provider": BU_PROVIDER,
        "keys_present": {"gemini": bool(GEMINI_KEY), "openai": bool(OPENAI_KEY), "anthropic": bool(ANTHROPIC_KEY)},
    }


@app.post("/apply")
async def apply(req: ApplyReq):
    if not _bu_imports_ok:
        raise HTTPException(500, "browser-use library not imported in container")
    if not await cdp_alive():
        raise HTTPException(503, f"Edge CDP not reachable at {CDP_URL}")

    llm = make_llm()
    task = build_task(req)
    log.info("Starting browser-use agent: %s on %s", req.platform, req.job_url[:80])

    # 0.11.x: BrowserSession with cdp_url attaches to existing browser
    session = BrowserSession(cdp_url=CDP_URL, keep_alive=True)
    try:
        agent = Agent(task=task, llm=llm, browser_session=session, max_actions_per_step=3,
                      use_vision=True, max_failures=3)
        history = await agent.run(max_steps=req.max_steps)

        final_result = ""
        try: final_result = str(history.final_result() or "")
        except Exception: pass

        all_text = ""
        try:
            all_text = " ".join(history.urls() or []) + " " + " ".join(history.action_names() or [])
            for r in (history.results() or []):
                ec = getattr(r, "extracted_content", "")
                if ec: all_text += " " + str(ec)[:1000]
        except Exception:
            pass
        all_text += " " + final_result

        lower = all_text.lower()
        if "applied" in lower and ("submit" in lower or "submitted" in lower):
            status = "applied"
        elif "captcha" in lower or "i'm not a robot" in lower:
            status = "blocked_captcha"
        elif "sign in" in lower or "log in" in lower:
            status = "blocked_login"
        elif "already applied" in lower:
            status = "already_applied"
        else:
            status = "blocked_unknown"

        steps_used = 0
        try: steps_used = len(history.history or [])
        except Exception: pass

        return {
            "ok": True, "service": "browser-use",
            "platform": req.platform, "job_url": req.job_url,
            "result": {"status": status, "reason": final_result[:300] or "agent finished", "evidence": all_text[:500]},
            "steps_used": steps_used,
            "provider_used": BU_PROVIDER,
        }
    except Exception as e:
        msg = str(e)
        log.exception("browser-use agent error")
        lower = msg.lower()
        if "credit balance" in lower or "billing" in lower or "insufficient_quota" in lower:
            return {"ok": False, "service": "browser-use", "result": {"status": "blocked_billing", "reason": "LLM out of credits", "evidence": msg[:200]}}
        if "rate limit" in lower or "rate_limit" in lower or "429" in lower:
            return {"ok": False, "service": "browser-use", "result": {"status": "blocked_rate_limit", "reason": "LLM rate-limited", "evidence": msg[:200]}}
        return {"ok": False, "service": "browser-use", "result": {"status": "blocked_unknown", "reason": "agent error", "evidence": msg[:300]}}
    finally:
        try: await session.kill()
        except Exception: pass


if __name__ == "__main__":
    log.info("browser-use sidecar on port %d (CDP=%s, provider=%s, lib_ok=%s)",
             PORT, CDP_URL, BU_PROVIDER, _bu_imports_ok)
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")

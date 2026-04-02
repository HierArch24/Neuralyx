"""
NEURALYX AI Service — NotebookLM Research + AgentScope Orchestration
Python FastAPI sidecar for the Node.js MCP server
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import asyncio
import os
import json
from typing import Optional

app = FastAPI(title="NEURALYX AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── NotebookLM Research Agent ───

class ResearchRequest(BaseModel):
    company: str
    title: Optional[str] = None
    sources: Optional[list[str]] = None  # URLs to research

class ResearchResponse(BaseModel):
    company: str
    notebook_id: Optional[str] = None
    summary: Optional[dict] = None
    sources_added: int = 0
    error: Optional[str] = None

@app.post("/research", response_model=ResearchResponse)
async def research_company(req: ResearchRequest):
    """
    Research a company using NotebookLM:
    1. Create a notebook for the company
    2. Add sources (company website, Glassdoor, news)
    3. Ask NotebookLM to synthesize a company brief
    """
    try:
        from notebooklm_py import NotebookLM
    except ImportError:
        # NotebookLM not available — fall back to basic research
        return ResearchResponse(
            company=req.company,
            error="notebooklm-py not configured. Run 'notebooklm login' first.",
        )

    try:
        nlm = NotebookLM()

        # Create notebook for this company
        notebook = nlm.create_notebook(title=f"Research: {req.company}")
        notebook_id = notebook.get("id") or notebook.get("notebook_id")

        # Add sources
        sources_added = 0
        urls_to_add = req.sources or [
            f"https://www.google.com/search?q={req.company}+tech+stack+engineering",
            f"https://www.glassdoor.com/Reviews/{req.company.replace(' ', '-')}-Reviews",
        ]

        for url in urls_to_add[:5]:  # Max 5 sources
            try:
                nlm.add_source(notebook_id, url=url)
                sources_added += 1
            except Exception:
                pass

        # Ask NotebookLM to synthesize
        summary = None
        if sources_added > 0:
            try:
                chat_response = nlm.chat(
                    notebook_id,
                    f"Analyze {req.company} for a job application. Provide: 1) Company overview 2) Tech stack 3) Culture & values 4) Red flags or concerns 5) Recent news. Be concise.",
                )
                summary = {
                    "text": chat_response.get("text", ""),
                    "sources": chat_response.get("sources", []),
                }
            except Exception as e:
                summary = {"text": str(e), "sources": []}

        return ResearchResponse(
            company=req.company,
            notebook_id=notebook_id,
            summary=summary,
            sources_added=sources_added,
        )

    except Exception as e:
        return ResearchResponse(company=req.company, error=str(e))


# ─── AgentScope Parallel Orchestration ───

class OrchestrateRequest(BaseModel):
    jobs: list[dict]  # [{title, company, description, ...}]
    profile: Optional[dict] = None  # {skills, resume_text, ...}
    actions: list[str] = ["classify", "match"]  # What to run

class JobResult(BaseModel):
    job_id: Optional[str] = None
    title: str
    company: str
    role_type: Optional[str] = None
    company_bucket: Optional[str] = None
    match_score: Optional[int] = None
    skill_matches: list[str] = []
    skill_gaps: list[str] = []

class OrchestrateResponse(BaseModel):
    results: list[JobResult]
    total: int
    processed: int
    errors: list[str] = []

@app.post("/orchestrate", response_model=OrchestrateResponse)
async def orchestrate_agents(req: OrchestrateRequest):
    """
    Use AgentScope (or parallel asyncio) to process multiple jobs simultaneously.
    Each job gets classified + matched in parallel instead of sequentially.
    """
    mcp_url = os.environ.get("MCP_SERVER_URL", "http://neuralyx-mcp:8080")
    results: list[JobResult] = []
    errors: list[str] = []

    async def process_job(job: dict) -> JobResult:
        result = JobResult(
            job_id=job.get("id"),
            title=job.get("title", ""),
            company=job.get("company", ""),
        )

        async with httpx.AsyncClient(timeout=30.0) as client:
            # Classify
            if "classify" in req.actions:
                try:
                    resp = await client.post(f"{mcp_url}/api/jobs/classify", json={
                        "title": job.get("title"),
                        "company": job.get("company"),
                        "description": job.get("description", ""),
                    })
                    if resp.status_code == 200:
                        data = resp.json()
                        result.role_type = data.get("role_type")
                        result.company_bucket = data.get("company_bucket")
                except Exception as e:
                    errors.append(f"Classify {job.get('title', '?')}: {e}")

            # Match
            if "match" in req.actions and req.profile:
                try:
                    resp = await client.post(f"{mcp_url}/api/jobs/match", json={
                        "title": job.get("title"),
                        "company": job.get("company"),
                        "description": job.get("description", ""),
                        "requirements": job.get("requirements", ""),
                        **req.profile,
                    })
                    if resp.status_code == 200:
                        data = resp.json()
                        result.match_score = data.get("match_score")
                        result.skill_matches = data.get("skill_matches", [])
                        result.skill_gaps = data.get("skill_gaps", [])
                except Exception as e:
                    errors.append(f"Match {job.get('title', '?')}: {e}")

        return result

    # Process all jobs in parallel (batches of 5 to avoid rate limits)
    batch_size = 5
    for i in range(0, len(req.jobs), batch_size):
        batch = req.jobs[i:i + batch_size]
        batch_results = await asyncio.gather(
            *[process_job(job) for job in batch],
            return_exceptions=True,
        )
        for r in batch_results:
            if isinstance(r, Exception):
                errors.append(str(r))
            else:
                results.append(r)

    return OrchestrateResponse(
        results=results,
        total=len(req.jobs),
        processed=len(results),
        errors=errors,
    )


# ─── Health Check ───

@app.get("/health")
async def health():
    nlm_available = False
    agentscope_available = False
    try:
        import notebooklm_py
        nlm_available = True
    except ImportError:
        pass
    try:
        import agentscope
        agentscope_available = True
    except ImportError:
        pass
    return {
        "status": "ok",
        "notebooklm": nlm_available,
        "agentscope": agentscope_available,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8090)

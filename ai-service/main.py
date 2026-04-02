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

# ─── FAISS Semantic Matching Engine ───

import numpy as np
from typing import Optional as Opt

# Global FAISS state
faiss_index = None
faiss_job_ids: list[str] = []
embedding_model = None
resume_embedding = None

def get_embedding_model():
    global embedding_model
    if embedding_model is None:
        try:
            from sentence_transformers import SentenceTransformer
            embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
        except ImportError:
            return None
    return embedding_model

def embed_text(text: str) -> np.ndarray:
    model = get_embedding_model()
    if model is None:
        raise ValueError("Embedding model not available")
    return model.encode([text], normalize_embeddings=True)[0]

def chunk_text(text: str, chunk_size: int = 200, overlap: int = 30) -> list[str]:
    """Split text into overlapping chunks by words"""
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size - overlap):
        chunk = ' '.join(words[i:i + chunk_size])
        if chunk.strip():
            chunks.append(chunk)
    return chunks if chunks else [text[:1000]]


class IndexResumeRequest(BaseModel):
    resume_text: str
    skills: list[str] = []

class IndexResumeResponse(BaseModel):
    embedded: bool
    dimensions: int = 0
    chunks: int = 0

@app.post("/semantic/index-resume", response_model=IndexResumeResponse)
async def index_resume(req: IndexResumeRequest):
    """Embed and index the user's resume for matching"""
    global resume_embedding
    try:
        # Combine resume + skills into one rich text
        full_text = req.resume_text + "\n\nKey Skills: " + ", ".join(req.skills)
        chunks = chunk_text(full_text, chunk_size=150, overlap=20)
        # Embed all chunks and average
        model = get_embedding_model()
        if model is None:
            return IndexResumeResponse(embedded=False)
        embeddings = model.encode(chunks, normalize_embeddings=True)
        resume_embedding = np.mean(embeddings, axis=0).astype('float32')
        resume_embedding = resume_embedding / np.linalg.norm(resume_embedding)
        return IndexResumeResponse(embedded=True, dimensions=len(resume_embedding), chunks=len(chunks))
    except Exception as e:
        return IndexResumeResponse(embedded=False)


class IndexJobsRequest(BaseModel):
    jobs: list[dict]  # [{id, title, company, description, requirements, location}]

class IndexJobsResponse(BaseModel):
    indexed: int
    total: int
    dimensions: int = 0

@app.post("/semantic/index-jobs", response_model=IndexJobsResponse)
async def index_jobs(req: IndexJobsRequest):
    """Build FAISS index from job descriptions"""
    global faiss_index, faiss_job_ids
    try:
        import faiss
        model = get_embedding_model()
        if model is None:
            return IndexJobsResponse(indexed=0, total=len(req.jobs))

        texts = []
        ids = []
        for j in req.jobs:
            text = f"{j.get('title','')} at {j.get('company','')}. {j.get('description','')[:500]} {j.get('requirements','')[:300]}"
            texts.append(text)
            ids.append(j['id'])

        if not texts:
            return IndexJobsResponse(indexed=0, total=0)

        embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        embeddings = np.array(embeddings).astype('float32')

        dim = embeddings.shape[1]
        faiss_index = faiss.IndexFlatIP(dim)  # Inner product = cosine similarity (normalized)
        faiss_index.add(embeddings)
        faiss_job_ids = ids

        return IndexJobsResponse(indexed=len(ids), total=len(req.jobs), dimensions=dim)
    except Exception as e:
        return IndexJobsResponse(indexed=0, total=len(req.jobs))


class MatchRequest(BaseModel):
    top_k: int = 50
    min_score: float = 0.3

class MatchResult(BaseModel):
    id: str
    score: float  # 0-100

class MatchResponse(BaseModel):
    matches: list[MatchResult]
    total_indexed: int = 0
    resume_indexed: bool = False

@app.post("/semantic/match", response_model=MatchResponse)
async def semantic_match(req: MatchRequest):
    """Find top matching jobs using FAISS cosine similarity"""
    global faiss_index, faiss_job_ids, resume_embedding
    if faiss_index is None or resume_embedding is None:
        return MatchResponse(matches=[], resume_indexed=resume_embedding is not None, total_indexed=len(faiss_job_ids))

    try:
        import faiss
        query = resume_embedding.reshape(1, -1).astype('float32')
        scores, indices = faiss_index.search(query, min(req.top_k, len(faiss_job_ids)))

        matches = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(faiss_job_ids):
                continue
            pct = round(float(score) * 100, 1)  # cosine similarity → percentage
            if pct >= req.min_score * 100:
                matches.append(MatchResult(id=faiss_job_ids[idx], score=pct))

        return MatchResponse(matches=matches, total_indexed=len(faiss_job_ids), resume_indexed=True)
    except Exception as e:
        return MatchResponse(matches=[], total_indexed=len(faiss_job_ids), resume_indexed=True)


class ScoreOneRequest(BaseModel):
    title: str
    company: str
    description: Opt[str] = None
    requirements: Opt[str] = None

class ScoreOneResponse(BaseModel):
    score: float  # 0-100
    method: str = "faiss"

@app.post("/semantic/score-one", response_model=ScoreOneResponse)
async def score_one_job(req: ScoreOneRequest):
    """Score a single job against the resume using FAISS"""
    global resume_embedding
    if resume_embedding is None:
        return ScoreOneResponse(score=0, method="no_resume")
    try:
        text = f"{req.title} at {req.company}. {(req.description or '')[:500]} {(req.requirements or '')[:300]}"
        job_emb = embed_text(text)
        score = float(np.dot(resume_embedding, job_emb)) * 100
        return ScoreOneResponse(score=round(max(0, min(100, score)), 1), method="faiss")
    except:
        return ScoreOneResponse(score=0, method="error")


@app.get("/health")
async def health():
    nlm_available = False
    agentscope_available = False
    faiss_available = False
    st_available = False
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
    try:
        import faiss
        faiss_available = True
    except ImportError:
        pass
    try:
        import sentence_transformers
        st_available = True
    except ImportError:
        pass
    return {
        "status": "ok",
        "notebooklm": nlm_available,
        "agentscope": agentscope_available,
        "faiss": faiss_available,
        "sentence_transformers": st_available,
        "resume_indexed": resume_embedding is not None,
        "jobs_indexed": len(faiss_job_ids),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8090)

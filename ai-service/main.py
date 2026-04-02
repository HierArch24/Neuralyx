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


domain_embeddings: dict[str, np.ndarray] = {}
exclude_embedding: np.ndarray | None = None

# Your expertise domains — each gets its own embedding vector
DEFAULT_DOMAINS = {
    "ai_automation": "AI automation engineer, workflow automation, n8n, Zapier, Make, AI pipelines, intelligent automation, RPA, process automation",
    "business_automation": "Business automation, CRM integration, ERP, GoHighLevel, business process optimization, SaaS automation, API integration",
    "marketing_automation": "Marketing automation, SEO, content generation, lead generation, email marketing, social media automation, analytics, campaign optimization",
    "fullstack_dev": "Full stack developer, Vue.js, TypeScript, Node.js, Python, FastAPI, React, PostgreSQL, Supabase, Docker, REST API, web application development",
    "devops_mlops": "DevOps engineer, MLOps, Docker, Kubernetes, CI/CD, GitHub Actions, AWS, cloud infrastructure, deployment automation, nginx",
    "ai_ml": "AI engineer, machine learning, deep learning, PyTorch, TensorFlow, LangChain, CrewAI, OpenAI, LLM, NLP, RAG, vector databases, embeddings",
    "ai_chatbot": "AI chatbot development, conversational AI, chatbot design, NLU, dialogue systems, Claude API, OpenAI API, virtual assistant",
    "system_integration": "System integration, MCP servers, API design, microservices, Supabase, database design, PostgreSQL, middleware, data pipelines",
    "data_analytics": "Data analytics, data science, Python, pandas, SQL, business intelligence, dashboard development, data visualization, reporting",
}

# Skills to EXCLUDE — jobs heavily requiring these get penalized
DEFAULT_EXCLUDES = ".NET, ASP.NET, C# backend, Windows Forms, WPF, Blazor, Entity Framework, MAUI, Xamarin, Java Spring Boot, Angular (not React/Vue), SAP, Oracle DBA, COBOL, Fortran, receptionist, data entry clerk, customer service representative, call center agent, cashier, driver, janitor, security guard"

class IndexResumeRequest(BaseModel):
    resume_text: str
    skills: list[str] = []
    domains: dict[str, str] = {}
    exclude_skills: str = ""

class IndexResumeResponse(BaseModel):
    embedded: bool
    dimensions: int = 0
    domains_indexed: int = 0

@app.post("/semantic/index-resume", response_model=IndexResumeResponse)
async def index_resume(req: IndexResumeRequest):
    """Embed resume as domain-specific vectors for targeted matching"""
    global resume_embedding, domain_embeddings, exclude_embedding
    try:
        model = get_embedding_model()
        if model is None:
            return IndexResumeResponse(embedded=False)

        # Use provided domains or defaults
        domains = req.domains if req.domains else DEFAULT_DOMAINS
        excludes = req.exclude_skills if req.exclude_skills else DEFAULT_EXCLUDES

        # Embed each domain separately
        domain_embeddings = {}
        for key, description in domains.items():
            emb = model.encode([description], normalize_embeddings=True)[0]
            domain_embeddings[key] = emb.astype('float32')

        # Embed exclusion terms
        exclude_embedding = model.encode([excludes], normalize_embeddings=True)[0].astype('float32')

        # Also create combined resume embedding (weighted average of domains)
        all_domain_embs = np.array(list(domain_embeddings.values()))
        resume_embedding = np.mean(all_domain_embs, axis=0).astype('float32')
        resume_embedding = resume_embedding / np.linalg.norm(resume_embedding)

        return IndexResumeResponse(embedded=True, dimensions=len(resume_embedding), domains_indexed=len(domain_embeddings))
    except Exception as e:
        return IndexResumeResponse(embedded=False)


class IndexJobsRequest(BaseModel):
    jobs: list[dict]  # [{id, title, company, description, requirements, location}]

class IndexJobsResponse(BaseModel):
    indexed: int
    total: int
    dimensions: int = 0

## Old index_jobs replaced by index_jobs_v2 below (with embedding cache for domain matching)


class MatchRequest(BaseModel):
    top_k: int = 50
    min_score: float = 0.3

class MatchResult(BaseModel):
    id: str
    score: float  # 0-100
    best_domain: str = ""
    domain_scores: dict[str, float] = {}
    excluded: bool = False

class MatchResponse(BaseModel):
    matches: list[MatchResult]
    excluded_count: int = 0
    total_indexed: int = 0
    resume_indexed: bool = False

# Store job embeddings for domain matching
job_embeddings_cache: dict[str, np.ndarray] = {}

@app.post("/semantic/index-jobs", response_model=IndexJobsResponse)
async def index_jobs_v2(req: IndexJobsRequest):
    """Build FAISS index + cache individual embeddings for domain matching"""
    global faiss_index, faiss_job_ids, job_embeddings_cache
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

        # Cache individual embeddings
        for i, job_id in enumerate(ids):
            job_embeddings_cache[job_id] = embeddings[i]

        dim = embeddings.shape[1]
        faiss_index = faiss.IndexFlatIP(dim)
        faiss_index.add(embeddings)
        faiss_job_ids = ids

        return IndexJobsResponse(indexed=len(ids), total=len(req.jobs), dimensions=dim)
    except Exception as e:
        return IndexJobsResponse(indexed=0, total=len(req.jobs))

@app.post("/semantic/match", response_model=MatchResponse)
async def semantic_match(req: MatchRequest):
    """Domain-weighted semantic matching with exclusion filtering"""
    global faiss_index, faiss_job_ids, domain_embeddings, exclude_embedding, job_embeddings_cache

    if not faiss_job_ids or not domain_embeddings:
        return MatchResponse(matches=[], resume_indexed=bool(domain_embeddings), total_indexed=len(faiss_job_ids))

    try:
        matches = []
        excluded_count = 0

        for job_id in faiss_job_ids:
            job_emb = job_embeddings_cache.get(job_id)
            if job_emb is None:
                continue

            # Check exclusion — if job matches excluded skills more than any domain, skip
            if exclude_embedding is not None:
                exclude_score = float(np.dot(job_emb, exclude_embedding))
                # Score all domains first to compare
                best_domain_score = max(float(np.dot(job_emb, d_emb)) for d_emb in domain_embeddings.values()) if domain_embeddings else 0
                # Exclude if: exclusion score > 0.40 AND exclusion > best domain match
                if exclude_score > 0.40 and exclude_score > best_domain_score:
                    excluded_count += 1
                    continue

            # Score against each domain
            domain_scores = {}
            for domain_name, domain_emb in domain_embeddings.items():
                score = float(np.dot(job_emb, domain_emb)) * 100
                domain_scores[domain_name] = round(max(0, score), 1)

            # Final score = highest domain match (you only need ONE domain to be relevant)
            best_domain = max(domain_scores, key=domain_scores.get) if domain_scores else ""
            best_score = max(domain_scores.values()) if domain_scores else 0

            # Only include jobs scoring above threshold AND above 50% absolute minimum
            if best_score >= max(req.min_score * 100, 50):
                matches.append(MatchResult(
                    id=job_id, score=round(best_score, 1),
                    best_domain=best_domain,
                    domain_scores=domain_scores,
                ))

        # Sort by score descending
        matches.sort(key=lambda m: m.score, reverse=True)
        matches = matches[:req.top_k]

        return MatchResponse(
            matches=matches, excluded_count=excluded_count,
            total_indexed=len(faiss_job_ids), resume_indexed=True,
        )
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

class ScoreOneResponse(BaseModel):
    score: float  # 0-100
    best_domain: str = ""
    domain_scores: dict[str, float] = {}
    excluded: bool = False
    method: str = "faiss"

@app.post("/semantic/score-one", response_model=ScoreOneResponse)
async def score_one_job(req: ScoreOneRequest):
    """Score a single job using domain-weighted matching with exclusion"""
    global domain_embeddings, exclude_embedding
    if not domain_embeddings:
        return ScoreOneResponse(score=0, method="no_domains")
    try:
        text = f"{req.title} at {req.company}. {(req.description or '')[:500]} {(req.requirements or '')[:300]}"
        job_emb = embed_text(text)

        # Check exclusion
        if exclude_embedding is not None:
            exclude_score = float(np.dot(job_emb, exclude_embedding))
            best_d = max(float(np.dot(job_emb, d)) for d in domain_embeddings.values()) if domain_embeddings else 0
            if exclude_score > 0.40 and exclude_score > best_d:
                return ScoreOneResponse(score=0, excluded=True, method="excluded")

        # Score against each domain
        domain_scores = {}
        for name, d_emb in domain_embeddings.items():
            score = float(np.dot(job_emb, d_emb)) * 100
            domain_scores[name] = round(max(0, score), 1)

        best_domain = max(domain_scores, key=domain_scores.get) if domain_scores else ""
        best_score = max(domain_scores.values()) if domain_scores else 0

        return ScoreOneResponse(score=round(best_score, 1), best_domain=best_domain, domain_scores=domain_scores, method="faiss_domains")
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

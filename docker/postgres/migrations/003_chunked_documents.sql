-- Migration 003: RAG chunking store for long documents
-- Episodes (apply_episodes) stay atomic — don't chunk.
-- This table holds JDs, cover letters, company research, long confirmation
-- pages, and any arbitrary text that exceeds a single embedding window.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS chunked_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type TEXT NOT NULL,              -- job_description | cover_letter | company_research | confirmation_page | arbitrary
    source_id UUID,                         -- loose FK to job_listings / apply_episodes / etc.
    source_domain TEXT,
    chunk_index INTEGER NOT NULL,           -- 0-based position within the document
    chunk_count INTEGER NOT NULL,           -- total chunks for this source_id (denormalised for convenience)
    chunk_text TEXT NOT NULL,
    chunk_token_estimate INTEGER,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (source_type, source_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_chunked_docs_source
    ON chunked_documents(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_chunked_docs_domain
    ON chunked_documents(source_domain, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chunked_docs_embedding
    ON chunked_documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

GRANT ALL ON chunked_documents TO CURRENT_USER;

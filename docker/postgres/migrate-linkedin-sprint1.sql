-- ============================================================
-- NEURALYX LinkedIn Sprint 1 Migration
-- Run once against local Docker PostgreSQL + Supabase
-- ============================================================

-- 1. pgvector extension (for embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. ALTER job_listings — add LinkedIn-specific columns
ALTER TABLE job_listings
  ADD COLUMN IF NOT EXISTS easy_apply        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS poster_name       TEXT,
  ADD COLUMN IF NOT EXISTS poster_linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS applicant_count   INTEGER,
  ADD COLUMN IF NOT EXISTS ats_type          TEXT,
  ADD COLUMN IF NOT EXISTS vector_indexed    BOOLEAN DEFAULT false;

-- 3. recruiter_contacts — discovered recruiters/hiring managers
CREATE TABLE IF NOT EXISTS recruiter_contacts (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                 TEXT NOT NULL,
  first_name           TEXT,
  title                TEXT,
  company              TEXT NOT NULL,
  company_domain       TEXT,
  platform             TEXT,
  linkedin_url         TEXT,
  email                TEXT,
  email_confidence     TEXT DEFAULT 'none',   -- 'confirmed' | 'guessed' | 'none'
  connection_status    TEXT DEFAULT 'none',   -- 'none' | 'queued' | 'pending' | 'connected'
  connection_sent_at   TIMESTAMPTZ,
  email_sent_at        TIMESTAMPTZ,
  response_received    BOOLEAN DEFAULT false,
  response_at          TIMESTAMPTZ,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE(linkedin_url),
  UNIQUE(email)
);

-- 4. screening_qa_pairs — learned Q&A from past applications
CREATE TABLE IF NOT EXISTS screening_qa_pairs (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_listing_id       UUID REFERENCES job_listings(id) ON DELETE SET NULL,
  question_text        TEXT NOT NULL,
  question_embedding   vector(1536),          -- for semantic question matching
  question_type        TEXT,                  -- 'text' | 'select' | 'radio' | 'scale'
  answer_text          TEXT NOT NULL,
  answer_confidence    TEXT,                  -- 'high' | 'medium' | 'low'
  platform             TEXT,
  company              TEXT,
  used_count           INTEGER DEFAULT 1,
  created_at           TIMESTAMPTZ DEFAULT now()
);

-- 5. job_embeddings — pgvector store for semantic search
CREATE TABLE IF NOT EXISTS job_embeddings (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_listing_id            UUID REFERENCES job_listings(id) ON DELETE CASCADE UNIQUE,
  embedding                 vector(1536),     -- job description embedding
  cover_letter              TEXT,
  cover_letter_embedding    vector(1536),     -- cover letter embedding (for reuse)
  embedding_model           TEXT DEFAULT 'text-embedding-3-small',
  created_at                TIMESTAMPTZ DEFAULT now()
);

-- Vector similarity index (IVFFlat — fast approximate search)
CREATE INDEX IF NOT EXISTS job_embeddings_vec_idx
  ON job_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS job_embeddings_cl_idx
  ON job_embeddings USING ivfflat (cover_letter_embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS screening_qa_vec_idx
  ON screening_qa_pairs USING ivfflat (question_embedding vector_cosine_ops)
  WITH (lists = 50);

-- 6. chat_conversations — RAG chatbot message history
CREATE TABLE IF NOT EXISTS chat_conversations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id TEXT NOT NULL,
  role            TEXT NOT NULL,              -- 'user' | 'assistant' | 'tool'
  content         TEXT NOT NULL,
  tool_calls      JSONB,
  tool_results    JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chat_conversations_idx ON chat_conversations(conversation_id, created_at);

-- 7. news_articles — if not already exists (used for company research RAG)
CREATE TABLE IF NOT EXISTS news_articles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  summary         TEXT,
  content         TEXT,
  image_url       TEXT,
  video_url       TEXT,
  link_url        TEXT,
  category        TEXT DEFAULT 'general',
  tags            TEXT[] DEFAULT '{}',
  companies       TEXT[] DEFAULT '{}',        -- companies mentioned (for lookup)
  embedding       vector(1536),               -- for semantic company research
  is_published    BOOLEAN DEFAULT true,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_articles_vec_idx
  ON news_articles USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- 8. Add recruiter_id FK to job_listings (after recruiter_contacts created)
ALTER TABLE job_listings
  ADD COLUMN IF NOT EXISTS recruiter_id UUID REFERENCES recruiter_contacts(id) ON DELETE SET NULL;

-- 9. connection_request_queue — drip 5/day max
CREATE TABLE IF NOT EXISTS connection_request_queue (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recruiter_id        UUID REFERENCES recruiter_contacts(id) ON DELETE CASCADE,
  note_text           TEXT NOT NULL,
  status              TEXT DEFAULT 'queued',  -- 'queued' | 'sent' | 'failed' | 'skipped'
  scheduled_for       TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,
  error_detail        TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Done
SELECT 'LinkedIn Sprint 1 migration complete' AS status;

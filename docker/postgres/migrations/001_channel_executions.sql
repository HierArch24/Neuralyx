-- Migration 001: Per-channel execution tracking
-- Tracks each application channel attempt separately (platform, email, company portal, recruiter outreach)

CREATE TABLE IF NOT EXISTS channel_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES job_applications(id) ON DELETE CASCADE,
    job_listing_id UUID REFERENCES job_listings(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,              -- 'job_board' | 'email' | 'company_portal' | 'form' | 'cold_outreach' | 'recruiter'
    status TEXT DEFAULT 'pending',      -- 'pending' | 'scheduled' | 'in_progress' | 'applied' | 'failed' | 'skipped'
    tone TEXT,                          -- 'formal' | 'concise' | 'conversational'
    cover_letter_variant TEXT,          -- Channel-specific cover letter text
    target TEXT,                        -- Email address, URL, LinkedIn profile, etc.
    platform TEXT,                      -- Platform name (indeed, onlinejobs, linkedin, etc.)
    method TEXT,                        -- Apply method used (indeed_easy_apply, onlinejobs_apply, direct_email, etc.)
    scheduled_at TIMESTAMPTZ,           -- When to execute (NULL = immediate, future = delayed secondary)
    executed_at TIMESTAMPTZ,            -- When it actually ran
    attempt_count INTEGER DEFAULT 0,    -- Number of attempts
    error_detail TEXT,                  -- Failure reason
    screenshot_url TEXT,                -- Confirmation screenshot path
    apply_log JSONB DEFAULT '[]',       -- Step-by-step audit trail
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_channel_exec_app ON channel_executions(application_id);
CREATE INDEX IF NOT EXISTS idx_channel_exec_job ON channel_executions(job_listing_id);
CREATE INDEX IF NOT EXISTS idx_channel_exec_status ON channel_executions(status);
CREATE INDEX IF NOT EXISTS idx_channel_exec_scheduled ON channel_executions(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_channel_exec_channel ON channel_executions(channel);

-- Add strategy_plan column to job_applications if not exists
DO $$ BEGIN
    ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS strategy_plan JSONB;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

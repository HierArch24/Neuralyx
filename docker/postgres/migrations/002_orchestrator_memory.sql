-- Migration 002: Agentic Orchestrator memory + chatbot substrate
-- Adds 6 tables backing the Orchestrator / Pre-Flight Gate / RecoveryAgent / CaptchaAgent stack.
-- Also doubles as chatbot context store (apply_episodes + chatbot_messages are embedded + searchable).

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================
-- Design note: application_id / job_listing_id are UUIDs without FK constraints.
-- This DB is the dedicated orchestrator + chatbot memory store, separate from
-- the main Supabase job tables. Loose coupling by UUID allows cross-DB use.
-- =============================================================

-- =============================================================
-- 1. orchestrator_state — live step-by-step state (hot path)
-- =============================================================
CREATE TABLE IF NOT EXISTS orchestrator_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL,
    channel TEXT NOT NULL,                  -- job_board | company_portal | external_ats | generic_form | email | cold_outreach
    sub_agent TEXT NOT NULL,                -- DirectApplyAgent | PHPlatformAgent | ExternalAtsAgent | GenericFormAgent | EmailApplyAgent | ColdOutreachAgent
    ats_type TEXT,                          -- workday | greenhouse | lever | ashby | smartapply | linkedin_easy | kalibrr | generic | null
    current_step TEXT,                      -- resume_selection | screening | submit | form_analyzed | email_drafted | email_sent | awaiting_delivery
    step_name TEXT,                         -- human-readable
    step_attempts INTEGER DEFAULT 0,
    last_url TEXT,
    last_title TEXT,
    last_screenshot TEXT,                   -- supabase storage path
    failed_strategies JSONB DEFAULT '[]',   -- [{strategy, reason, at}]
    last_decision TEXT,                     -- RETRY_SAME | VISION_CLICK | ABORT_CHANNEL | PRE_FLIGHT_PASS | PRE_FLIGHT_BLOCKED
    decision_conf INTEGER,                  -- 0-100
    first_try_in_progress BOOLEAN DEFAULT TRUE,  -- flips to false on first fix-loop or RecoveryAgent call
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (application_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_orch_state_app ON orchestrator_state(application_id);
CREATE INDEX IF NOT EXISTS idx_orch_state_updated ON orchestrator_state(updated_at DESC);

-- =============================================================
-- 2. apply_episodes — immutable episode log (chatbot memory + learning)
-- =============================================================
CREATE TABLE IF NOT EXISTS apply_episodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID,
    job_listing_id UUID,
    domain TEXT,                            -- smartapply.indeed.com, workday.com, ...
    episode_type TEXT NOT NULL,             -- step_attempt | pre_flight_check | captcha_presolve | recovery_action | captcha_solve | email_sent | email_bounced | email_delivered | cold_outreach | abort | success
    channel TEXT,                           -- mirrors orchestrator_state.channel
    sub_agent TEXT,                         -- which sub-agent wrote this
    observation JSONB,                      -- {url, title, visible_buttons, body_text_hash, pre_flight_result, ...}
    action TEXT,                            -- "clicked Continue with selector .btn-submit"
    outcome TEXT,                           -- advanced | stuck | error | succeeded | delivered | bounced | skipped
    reasoning TEXT,                         -- LLM-generated (chatbot-readable)
    vision_summary TEXT,                    -- human-readable summary for chatbot queries
    confidence INTEGER,
    first_try_success BOOLEAN,              -- KPI: true only if URL advanced within 8s of first click, no fix-loop, no RecoveryAgent
    pre_flight_blockers JSONB,              -- [{type, severity, fix_action}]
    embedding vector(1536),                 -- pgvector — semantic recall for chatbot
    screenshot_path TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apply_episodes_app ON apply_episodes(application_id);
CREATE INDEX IF NOT EXISTS idx_apply_episodes_domain ON apply_episodes(domain, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_apply_episodes_type ON apply_episodes(episode_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_apply_episodes_first_try ON apply_episodes(first_try_success) WHERE first_try_success IS NOT NULL;
-- ivfflat requires a trained index; create without list param first, optimize later on data volume
CREATE INDEX IF NOT EXISTS idx_apply_episodes_embedding ON apply_episodes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- =============================================================
-- 3. selectors_cache — learned per-domain selectors
-- =============================================================
CREATE TABLE IF NOT EXISTS selectors_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain TEXT NOT NULL,
    button_type TEXT NOT NULL,              -- continue | submit | next | apply | upload_resume | dismiss_modal
    visual_description TEXT,                -- "blue rounded, bottom-right, 'Continue'"
    working_selector TEXT NOT NULL,
    success_count INTEGER DEFAULT 1,
    failure_count INTEGER DEFAULT 0,
    last_used TIMESTAMPTZ DEFAULT now(),
    first_learned_from_episode UUID REFERENCES apply_episodes(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (domain, button_type, working_selector)
);

CREATE INDEX IF NOT EXISTS idx_selectors_cache_domain ON selectors_cache(domain, button_type, success_count DESC);
CREATE INDEX IF NOT EXISTS idx_selectors_cache_last_used ON selectors_cache(last_used DESC);

-- =============================================================
-- 4. success_embeddings — semantic success-page patterns
-- =============================================================
CREATE TABLE IF NOT EXISTS success_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id UUID REFERENCES apply_episodes(id) ON DELETE CASCADE,
    page_text TEXT NOT NULL,                -- raw confirmation text captured (trimmed to 2000 chars)
    embedding vector(1536) NOT NULL,
    source_domain TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_success_embeddings_vec ON success_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX IF NOT EXISTS idx_success_embeddings_domain ON success_embeddings(source_domain);

-- =============================================================
-- 5. recovery_screenshots — indexed screenshot archive
-- =============================================================
CREATE TABLE IF NOT EXISTS recovery_screenshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID,
    episode_id UUID REFERENCES apply_episodes(id) ON DELETE CASCADE,
    supabase_storage_path TEXT,             -- bucket: orchestrator/<app_id>/<timestamp>.png
    local_path TEXT,                        -- fallback when Supabase Storage not configured
    dom_snapshot TEXT,                      -- pruned HTML (~10KB)
    url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recovery_screenshots_app ON recovery_screenshots(application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_screenshots_episode ON recovery_screenshots(episode_id);

-- =============================================================
-- 6. chatbot_messages — future chatbot conversation history
-- =============================================================
-- Schema ready now so no refactor later. Table populated when chat UI ships.
CREATE TABLE IF NOT EXISTS chatbot_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    role TEXT NOT NULL,                     -- user | assistant | system
    content TEXT NOT NULL,
    referenced_episode_ids UUID[],          -- which apply_episodes were retrieved for this turn
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_messages_session ON chatbot_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_embedding ON chatbot_messages USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- =============================================================
-- Helpers
-- =============================================================
-- Trigger: bump updated_at on orchestrator_state updates
CREATE OR REPLACE FUNCTION touch_orchestrator_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orchestrator_state_updated ON orchestrator_state;
CREATE TRIGGER trg_orchestrator_state_updated
    BEFORE UPDATE ON orchestrator_state
    FOR EACH ROW EXECUTE FUNCTION touch_orchestrator_state_updated_at();

-- Trigger: auto-decay selectors_cache.last_used on read-hit (optional; keep manual for now)

-- =============================================================
-- Grants — mirror pattern used in 001
-- =============================================================
-- (Assumes same service role as existing tables)
GRANT ALL ON orchestrator_state, apply_episodes, selectors_cache,
              success_embeddings, recovery_screenshots, chatbot_messages
TO CURRENT_USER;

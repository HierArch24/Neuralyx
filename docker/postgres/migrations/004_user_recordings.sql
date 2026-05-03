-- 004_user_recordings.sql
-- Persistent storage for videos captured via the Record tab of the Video
-- Creation Studio. Objects are stored in Supabase Storage bucket `recordings`
-- (authenticated-read); this table holds only metadata + pointers.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS user_recordings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner                    TEXT NOT NULL,
  title                    TEXT NOT NULL,
  duration_ms              INT  NOT NULL,
  size_bytes               BIGINT NOT NULL,
  mime_type                TEXT NOT NULL,
  storage_path             TEXT NOT NULL,
  thumbnail_path           TEXT,
  background_type          TEXT CHECK (background_type IN ('none','blur','color','image')),
  background_meta          JSONB,
  gaze_correction_enabled  BOOLEAN DEFAULT false,
  created_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_recordings_owner_created_idx
  ON user_recordings(owner, created_at DESC);

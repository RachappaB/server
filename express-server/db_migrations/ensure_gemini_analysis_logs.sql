-- Migration: ensure_gemini_analysis_logs
-- Creates table if missing and adds any new columns required by Llama3 output

-- Create table if it does not exist
CREATE TABLE IF NOT EXISTS gemini_analysis_logs (
  id BIGSERIAL PRIMARY KEY,
  activity_date DATE,
  bucket_index INT,
  morning_plan JSONB,
  sent_input_data JSONB,
  bad_review TEXT,
  suggestion TEXT,
  guidance TEXT,
  remark TEXT,
  problem TEXT,
  motion TEXT,
  health TEXT,
  roadmap TEXT,
  topics_to_address JSONB,
  followed_previous_advice BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add missing columns safely (no-op if already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gemini_analysis_logs' AND column_name = 'motion'
  ) THEN
    ALTER TABLE gemini_analysis_logs ADD COLUMN motion TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gemini_analysis_logs' AND column_name = 'health'
  ) THEN
    ALTER TABLE gemini_analysis_logs ADD COLUMN health TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gemini_analysis_logs' AND column_name = 'roadmap'
  ) THEN
    ALTER TABLE gemini_analysis_logs ADD COLUMN roadmap TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gemini_analysis_logs' AND column_name = 'topics_to_address'
  ) THEN
    ALTER TABLE gemini_analysis_logs ADD COLUMN topics_to_address JSONB;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gemini_analysis_logs' AND column_name = 'sent_input_data'
  ) THEN
    ALTER TABLE gemini_analysis_logs ADD COLUMN sent_input_data JSONB;
  END IF;

  -- Ensure created_at exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'gemini_analysis_logs' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE gemini_analysis_logs ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
  END IF;

END$$;

-- Indexes for quick querying
CREATE INDEX IF NOT EXISTS idx_gemini_activity_date ON gemini_analysis_logs(activity_date);
CREATE INDEX IF NOT EXISTS idx_gemini_created_at ON gemini_analysis_logs(created_at);

-- Done
SELECT 'gemini_analysis_logs ready' AS status;

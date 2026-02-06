-- Migration: add_full_response_column
-- Adds a full_response JSONB column to gemini_analysis_logs for storing raw AI output

ALTER TABLE IF EXISTS gemini_analysis_logs
  ADD COLUMN IF NOT EXISTS full_response JSONB;

-- Ensure topics_to_address is JSONB (migration earlier should have added it but be safe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gemini_analysis_logs' AND column_name = 'topics_to_address'
  ) THEN
    ALTER TABLE gemini_analysis_logs ADD COLUMN topics_to_address JSONB;
  END IF;
END$$;

-- Index for activity_date if not present
CREATE INDEX IF NOT EXISTS idx_gemini_activity_date ON gemini_analysis_logs(activity_date);

SELECT 'add_full_response_column applied' AS status;

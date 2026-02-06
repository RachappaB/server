-- Migration: Add raw_motion_data column to fitband_activity_logs
-- Stores the original device payload as JSONB to preserve raw samples
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitband_activity_logs' AND column_name = 'raw_motion_data'
  ) THEN
    ALTER TABLE fitband_activity_logs ADD COLUMN raw_motion_data JSONB;
  END IF;
END$$;

SELECT 'raw_motion_data column ensured' AS status;

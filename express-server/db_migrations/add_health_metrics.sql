-- Migration: Add health metrics columns to fitband_bucket_insights
-- Adds detailed health metrics for enhanced insights

-- Add new columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitband_bucket_insights' AND column_name = 'standing_minutes'
  ) THEN
    ALTER TABLE fitband_bucket_insights ADD COLUMN standing_minutes INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitband_bucket_insights' AND column_name = 'posture_stability'
  ) THEN
    ALTER TABLE fitband_bucket_insights ADD COLUMN posture_stability INT DEFAULT 50;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitband_bucket_insights' AND column_name = 'health_insights'
  ) THEN
    ALTER TABLE fitband_bucket_insights ADD COLUMN health_insights TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitband_bucket_insights' AND column_name = 'time_sleep'
  ) THEN
    ALTER TABLE fitband_bucket_insights ADD COLUMN time_sleep INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitband_bucket_insights' AND column_name = 'time_sit'
  ) THEN
    ALTER TABLE fitband_bucket_insights ADD COLUMN time_sit INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitband_bucket_insights' AND column_name = 'time_stand'
  ) THEN
    ALTER TABLE fitband_bucket_insights ADD COLUMN time_stand INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitband_bucket_insights' AND column_name = 'time_walk'
  ) THEN
    ALTER TABLE fitband_bucket_insights ADD COLUMN time_walk INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitband_bucket_insights' AND column_name = 'time_run'
  ) THEN
    ALTER TABLE fitband_bucket_insights ADD COLUMN time_run INT DEFAULT 0;
  END IF;
END$$;

-- Done
SELECT 'Health metrics columns added' AS status;

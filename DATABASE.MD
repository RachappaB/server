psql -U rachappa -d usage_db













DROP TABLE IF EXISTS usage_buckets CASCADE;
DROP TABLE IF EXISTS usage_days CASCADE;








CREATE TABLE usage_days (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  usage_date DATE NOT NULL,
  timezone TEXT,
  bucket_minutes INT NOT NULL DEFAULT 15,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(device_id, usage_date)
);

CREATE TABLE usage_buckets (
  id BIGSERIAL PRIMARY KEY,
  day_id BIGINT NOT NULL REFERENCES usage_days(id) ON DELETE CASCADE,
  bucket_index INT NOT NULL CHECK (bucket_index >= 0 AND bucket_index <= 95),
  apps JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(day_id, bucket_index)
);

CREATE INDEX idx_usage_days_device_date
  ON usage_days(device_id, usage_date);

CREATE INDEX idx_usage_buckets_day_bucket
  ON usage_buckets(day_id, bucket_index);



\dt

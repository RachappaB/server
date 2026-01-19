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



=======================
==============



CREATE TABLE extension_devices (

  id SERIAL PRIMARY KEY,

  email TEXT NOT NULL,

  device_id TEXT UNIQUE NOT NULL,

  device_name TEXT,

  user_agent TEXT,

  created_at TIMESTAMP DEFAULT NOW(),

  last_seen TIMESTAMP DEFAULT NOW()
);




CREATE TABLE extension_usage_stream (

  id SERIAL PRIMARY KEY,

  device_id TEXT NOT NULL,

  usage_date DATE NOT NULL,

  bucket_index INTEGER NOT NULL,

  domains JSONB NOT NULL,

  received_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(device_id, usage_date, bucket_index)
);



CREATE INDEX idx_ext_stream_device_date
ON extension_usage_stream(device_id, usage_date);

CREATE INDEX idx_ext_stream_domains
ON extension_usage_stream USING GIN(domains);
















==============================
emdeded system 
===========================




DROP TABLE IF EXISTS embedded_data;

CREATE TABLE embedded_data (

  id BIGSERIAL PRIMARY KEY,

  device_id TEXT NOT NULL,

  -- Packed arrays
  mpu SMALLINT[],
  gps DOUBLE PRECISION[],
  bio REAL[],

  -- Server generated
  server_time TIMESTAMPTZ DEFAULT NOW(),
  bucket_15min SMALLINT,
  bucket_date DATE DEFAULT CURRENT_DATE
);

-- Performance indexes
CREATE INDEX idx_embedded_time
ON embedded_data(server_time DESC);

CREATE INDEX idx_embedded_bucket
ON embedded_data(bucket_date, bucket_15min);







============================
laptop 
==============================

CREATE TABLE laptop_activity_15m (
    id SERIAL PRIMARY KEY,

    timestamp TIMESTAMPTZ NOT NULL,

    device_name TEXT,
    username TEXT,
    os TEXT,
    time_bucket TEXT,

    keys_count INTEGER,
    mouse_count INTEGER,

    active_seconds INTEGER,
    idle_seconds INTEGER,
    locked_seconds INTEGER,

    app_switch_count INTEGER,
    max_focus_streak_seconds INTEGER,

    background_media BOOLEAN,
    background_media_seconds INTEGER,
    background_media_source TEXT,
    background_media_title TEXT,

    apps JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_laptop_time ON laptop_activity_15m(timestamp);
CREATE INDEX idx_laptop_device ON laptop_activity_15m(device_name);
CREATE INDEX idx_laptop_user ON laptop_activity_15m(username);


\dt

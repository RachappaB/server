CREATE TABLE gps_data (

  id SERIAL PRIMARY KEY,

  device_id TEXT NOT NULL,

  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  altitude DOUBLE PRECISION,

  satellites INTEGER,
  hdop DOUBLE PRECISION,

  gps_time TIMESTAMP,      -- GPS UTC converted to IST
  server_time TIMESTAMP DEFAULT NOW(),

  bucket_15min INTEGER,   -- 1 to 96
  bucket_date DATE        -- IST date

);

CREATE TABLE gps_last_location (

  device_id TEXT PRIMARY KEY,

  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  altitude DOUBLE PRECISION,

  satellites INTEGER,
  hdop DOUBLE PRECISION,

  gps_time TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()

);

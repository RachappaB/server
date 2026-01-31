
DROP TABLE IF EXISTS mpu_ai_dataset;


CREATE TABLE mpu_ai_dataset (

  id BIGSERIAL PRIMARY KEY,

  device_id TEXT NOT NULL,

  ax REAL[] NOT NULL,
  ay REAL[] NOT NULL,
  az REAL[] NOT NULL,

  gx REAL[] NOT NULL,
  gy REAL[] NOT NULL,
  gz REAL[] NOT NULL,

  label SMALLINT NOT NULL,

  server_time TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata'),

  bucket_date DATE
);



CREATE OR REPLACE FUNCTION mpu_ai_set_bucket()
RETURNS TRIGGER AS $$
BEGIN
  NEW.bucket_date := (NEW.server_time)::date;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_mpu_ai_bucket
BEFORE INSERT ON mpu_ai_dataset
FOR EACH ROW
EXECUTE FUNCTION mpu_ai_set_bucket();

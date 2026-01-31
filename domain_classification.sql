-- ============================================
-- DOMAIN CLASSIFICATION SYSTEM
-- FOR EXTENSION BUCKET DATA
-- ============================================

BEGIN;

-- ============================================
-- CLEAN OLD TABLES
-- ============================================

DROP TABLE IF EXISTS domain_interest_map CASCADE;
DROP TABLE IF EXISTS domain_productivity_map CASCADE;
DROP TABLE IF EXISTS domain_category_map CASCADE;

DROP TABLE IF EXISTS interest_tags CASCADE;
DROP TABLE IF EXISTS productivity_types CASCADE;
DROP TABLE IF EXISTS domain_categories CASCADE;
DROP TABLE IF EXISTS domains_master CASCADE;

-- ============================================
-- MASTER DOMAIN TABLE
-- ============================================

CREATE TABLE domains_master (

  id SERIAL PRIMARY KEY,

  -- raw domain from extension
  domain TEXT UNIQUE NOT NULL,

  -- normalized root domain
  master_domain TEXT NOT NULL,

  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_domains_domain
ON domains_master(domain);

CREATE INDEX idx_domains_master
ON domains_master(master_domain);

-- ============================================
-- CATEGORY TABLE
-- ============================================

CREATE TABLE domain_categories (

  id SERIAL PRIMARY KEY,

  name TEXT UNIQUE NOT NULL,

  description TEXT
);

-- ============================================
-- PRODUCTIVITY TYPES
-- ============================================

CREATE TABLE productivity_types (

  id SERIAL PRIMARY KEY,

  name TEXT UNIQUE NOT NULL,

  score SMALLINT NOT NULL
);

-- ============================================
-- INTEREST TAGS
-- ============================================

CREATE TABLE interest_tags (

  id SERIAL PRIMARY KEY,

  name TEXT UNIQUE NOT NULL,

  description TEXT
);

-- ============================================
-- DOMAIN → CATEGORY MAP
-- ============================================

DROP TABLE IF EXISTS domain_category_map;

CREATE TABLE domain_category_map (

  domain_id INT REFERENCES domains_master(id) ON DELETE CASCADE,

  category_id INT REFERENCES domain_categories(id),

  weight SMALLINT DEFAULT 100,

  PRIMARY KEY(domain_id, category_id)
);


-- ============================================
-- DOMAIN → PRODUCTIVITY MAP
-- ============================================

CREATE TABLE domain_productivity_map (

  domain_id INT REFERENCES domains_master(id) ON DELETE CASCADE,

  productivity_id INT REFERENCES productivity_types(id),

  PRIMARY KEY (domain_id)
);

-- ============================================
-- DOMAIN → INTEREST MAP
-- ============================================

CREATE TABLE domain_interest_map (

  domain_id INT REFERENCES domains_master(id) ON DELETE CASCADE,

  interest_id INT REFERENCES interest_tags(id),

  weight SMALLINT DEFAULT 100,

  PRIMARY KEY (domain_id, interest_id)
);

-- ============================================
-- INSERT BASE CATEGORIES
-- ============================================

INSERT INTO domain_categories (name) VALUES
('Development'),
('Education'),
('Entertainment'),
('Social'),
('Communication'),
('Search'),
('Cloud'),
('Tools'),
('Adult'),
('Malware'),
('Productivity Platform')
ON CONFLICT DO NOTHING;

-- ============================================
-- INSERT PRODUCTIVITY TYPES
-- ============================================

INSERT INTO productivity_types (name, score) VALUES
('Productive', 80),
('Neutral', 0),
('Distracting', -40),
('Adult', -100),
('Malware', -120)
ON CONFLICT DO NOTHING;

-- ============================================
-- INSERT INTEREST TAGS (BASED ON YOUR DATA)
-- ============================================

INSERT INTO interest_tags (name) VALUES
('AI'),
('Programming'),
('Cybersecurity'),
('DevOps'),
('Cloud'),
('Video'),
('Music'),
('Social Media'),
('Linux'),
('IoT')
ON CONFLICT DO NOTHING;

-- ============================================
-- AUTO EXTRACT DOMAINS FROM BUCKET DATA
-- (YOUR 4 JSON FILES ALREADY IN DB)
-- ============================================

INSERT INTO domains_master(domain, master_domain)

SELECT DISTINCT
  d.key AS domain,

  -- remove www. prefix only
  regexp_replace(d.key, '^www\.', '') AS master_domain

FROM extension_usage_stream eus,
jsonb_each(eus.domains) d

ON CONFLICT (domain) DO NOTHING;

-- ============================================
-- VERIFY DOMAIN COUNT
-- ============================================

-- You can run later:
-- SELECT COUNT(*) FROM domains_master;

COMMIT;

-- ============================================
-- DONE
-- ============================================

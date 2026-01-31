const pool = require("../db");

/* =========================
 GET ALL DOMAINS
========================= */

async function getAllDomains(req, res) {

  const result = await pool.query(`
    SELECT
      dm.id,
      dm.domain,
      dm.master_domain,

      ARRAY_REMOVE(ARRAY_AGG(DISTINCT dc.name), NULL) AS categories,

      pt.name AS productivity

    FROM domains_master dm

    LEFT JOIN domain_category_map dcm
      ON dcm.domain_id = dm.id

    LEFT JOIN domain_categories dc
      ON dc.id = dcm.category_id

    LEFT JOIN domain_productivity_map dpm
      ON dpm.domain_id = dm.id

    LEFT JOIN productivity_types pt
      ON pt.id = dpm.productivity_id

    GROUP BY dm.id, pt.name
    ORDER BY dm.domain
  `);

  res.json(result.rows);
}


/* =========================
 CREATE DOMAIN
========================= */

async function createDomain(req, res) {

  const { domain, master_domain } = req.body;

  const result = await pool.query(`
    INSERT INTO domains_master(domain, master_domain)
    VALUES($1,$2)
    RETURNING *
  `,[domain, master_domain]);

  res.json(result.rows[0]);
}

/* =========================
 UPDATE DOMAIN
========================= */

async function updateDomain(req, res) {

  const { id } = req.params;
  const { domain, master_domain } = req.body;

  const result = await pool.query(`
    UPDATE domains_master
    SET domain=$1, master_domain=$2
    WHERE id=$3
    RETURNING *
  `,[domain, master_domain, id]);

  res.json(result.rows[0]);
}

/* =========================
 DELETE DOMAIN
========================= */

async function deleteDomain(req, res) {

  const { id } = req.params;

  await pool.query(`
    DELETE FROM domains_master WHERE id=$1
  `,[id]);

  res.json({ ok: true });
}

/* =========================
 LOOKUPS
========================= */

async function getCategories(req,res) {
  const r = await pool.query(`SELECT * FROM domain_categories ORDER BY name`);
  res.json(r.rows);
}

async function getProductivityTypes(req,res) {
  const r = await pool.query(`SELECT * FROM productivity_types ORDER BY name`);
  res.json(r.rows);
}

async function getInterests(req,res) {
  const r = await pool.query(`SELECT * FROM interest_tags ORDER BY name`);
  res.json(r.rows);
}

/* =========================
 ASSIGN MAPPINGS
========================= */

async function assignCategory(req,res){

  const { domain_id, category_id } = req.body;

  await pool.query(`
    INSERT INTO domain_category_map(domain_id, category_id)
    VALUES($1,$2)
    ON CONFLICT DO NOTHING
  `,[domain_id, category_id]);

  res.json({ ok:true });
}


async function assignProductivity(req,res){

  const { domain_id, productivity_id } = req.body;

  await pool.query(`
    INSERT INTO domain_productivity_map(domain_id, productivity_id)
    VALUES($1,$2)
    ON CONFLICT(domain_id)
    DO UPDATE SET productivity_id=$2
  `,[domain_id, productivity_id]);

  res.json({ ok:true });
}

async function assignInterest(req,res){

  const { domain_id, interest_id } = req.body;

  await pool.query(`
    INSERT INTO domain_interest_map(domain_id, interest_id)
    VALUES($1,$2)
    ON CONFLICT DO NOTHING
  `,[domain_id, interest_id]);

  res.json({ ok:true });
}


async function classifyDomain(req,res){

 const { domain, categories } = req.body;

 // Insert domain if not exists
 const domainResult = await pool.query(`
  INSERT INTO domains_master(domain, master_domain)
  VALUES($1,$2)
  ON CONFLICT(domain) DO UPDATE SET domain=EXCLUDED.domain
  RETURNING id
 `,[domain, domain]);

 const domainId = domainResult.rows[0].id;

 // Insert category mappings
 for(const cat of categories){

  const catRow = await pool.query(`
    SELECT id FROM domain_categories WHERE name=$1
  `,[cat]);

  if(catRow.rowCount === 0) continue;

  await pool.query(`
    INSERT INTO domain_category_map(domain_id, category_id)
    VALUES($1,$2)
    ON CONFLICT DO NOTHING
  `,[domainId, catRow.rows[0].id]);
 }

 res.json({ ok:true });
}



module.exports = {

  getAllDomains,
  createDomain,
  updateDomain,
  deleteDomain,

  getCategories,
  getProductivityTypes,
  getInterests,

  assignCategory,
  assignProductivity,
  assignInterest,
  classifyDomain
};

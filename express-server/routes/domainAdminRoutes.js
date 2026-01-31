const express = require("express");
const router = express.Router();

const {
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
} = require("../controllers/domainAdminController");

/* =========================
 DOMAIN CRUD
========================= */

router.get("/domains", getAllDomains);
router.post("/domains", createDomain);
router.put("/domains/:id", updateDomain);
router.delete("/domains/:id", deleteDomain);
router.post("/domain/classify", classifyDomain);

/* =========================
 LOOKUP DATA
========================= */

router.get("/categories", getCategories);
router.get("/productivity", getProductivityTypes);
router.get("/interests", getInterests);

/* =========================
 MAPPING
========================= */

router.post("/assign/category", assignCategory);
router.post("/assign/productivity", assignProductivity);
router.post("/assign/interest", assignInterest);

module.exports = router;

const pool = require("../db");

// ================= MORNING =================

async function saveMorning(req,res){

 try{

 const {
  primary_goal,
  secondary_goal,
  distraction_risk,
  expected_energy
 } = req.body;

 await pool.query(
  `INSERT INTO morning_plans
   (primary_goal,secondary_goal,distraction_risk,expected_energy)
   VALUES($1,$2,$3,$4)`,
   [primary_goal,secondary_goal,distraction_risk,expected_energy]
 );

 res.json({ ok:true });

 }catch(err){
  console.error(err);
  res.status(500).json({ error:"Morning insert failed" });
 }
}

// ================= NIGHT =================

async function saveNight(req,res){

 try{

 const {
  went_wrong,
  went_well,
  time_waste,
  tomorrow_correction
 } = req.body;

 await pool.query(
  `INSERT INTO night_reviews
   (went_wrong,went_well,time_waste,tomorrow_correction)
   VALUES($1,$2,$3,$4)`,
   [went_wrong,went_well,time_waste,tomorrow_correction]
 );

 res.json({ ok:true });

 }catch(err){
  console.error(err);
  res.status(500).json({ error:"Night insert failed" });
 }
}

// ================= EMOTION =================

async function saveEmotion(req,res){

 try{

 const {
  mood,
  intensity,
  reason,
  context
 } = req.body;

 await pool.query(
  `INSERT INTO emotional_logs
   (mood,intensity,reason,context)
   VALUES($1,$2,$3,$4)`,
   [mood,intensity,reason,context]
 );

 res.json({ ok:true });

 }catch(err){
  console.error(err);
  res.status(500).json({ error:"Emotion insert failed" });
 }
}

module.exports = {
 saveMorning,
 saveNight,
 saveEmotion
};

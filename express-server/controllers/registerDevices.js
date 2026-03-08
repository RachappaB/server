const pool = require("../db");

async function registerDevice(req,res){
    console.log("adding device id with email ");
    console.log(req.body)
  const { email, device_id } = req.body;

  if(!email || !device_id){
    return res.status(400).json({
      ok:false,
      error:"email and device_id required"
    });
  }

  try{

    await pool.query(`
      INSERT INTO user_devices (email,device_id)
      VALUES ($1,$2)
      ON CONFLICT DO NOTHING
    `,[email,device_id]);

    res.json({
      ok:true,
      message:"device linked"
    });

  }catch(err){

    console.error(err);

    res.status(500).json({
      ok:false,
      error:"server error"
    });

  }

}

module.exports = { registerDevice };
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const admin = require("firebase-admin");
const serviceAccount = require("./firebase-admin.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

async function sendUploadNowToTopic() {
  const message = {
    topic: "usage-sync",
    data: {
      action: "UPLOAD_NOW",
    },
  };

  const resp = await admin.messaging().send(message);
  return resp;
}

module.exports = { sendUploadNowToTopic };

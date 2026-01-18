const cron = require("node-cron");
const { sendUploadNowToTopic } = require("./fcm");

// Every 5 hours at minute 0
// 0 */5 * * *  -> 00:00, 05:00, 10:00, 15:00, 20:00
function startFcmScheduler() {
  cron.schedule("0 */5 * * *", async () => {
    try {
      const msgId = await sendUploadNowToTopic();
      console.log("✅ FCM auto trigger sent:", msgId);
    } catch (err) {
      console.error("❌ FCM auto trigger failed:", err.message);
    }
  });

  console.log("✅ FCM scheduler started: every 5 hours");
}

module.exports = { startFcmScheduler };

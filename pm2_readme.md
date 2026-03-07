# Express Server Deployment with PM2

This guide documents how to run an Express.js server using **PM2 cluster mode**, scale the workers, and ensure the server **automatically starts after reboot**.

---

# 1. Navigate to Project Directory

```bash
cd ~/server/express-server
```

---

# 2. Stop Any Existing PM2 Processes

```bash
pm2 stop all
```

---

# 3. Remove Old PM2 Processes

```bash
pm2 delete all
```

Verify no processes remain:

```bash
pm2 list
```

---

# 4. Start the Server in Cluster Mode

Run the server with **2 worker instances**.

```bash
pm2 start server.js -i 2 --name usage-api
```

Explanation:

* `server.js` → main Express server file
* `-i 2` → run 2 instances (cluster mode)
* `--name usage-api` → process name in PM2

Check status:

```bash
pm2 list
```

---

# 5. Monitor Running Processes

```bash
pm2 monit
```

Shows:

* CPU usage
* Memory usage
* Logs
* Worker status

---

# 6. Save PM2 Process List

This saves the current running configuration.

```bash
pm2 save
```

PM2 stores it in:

```
~/.pm2/dump.pm2
```

---

# 7. Enable Auto Start on System Boot

Run:

```bash
pm2 startup
```

PM2 will output a command like:

```bash
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u racha --hp /home/racha
```

Run that command to install the startup service.

---

# 8. Save Configuration Again

```bash
pm2 save
```

This ensures the process list loads automatically after reboot.

---

# 9. Test Automatic Restart

Reboot the server:

```bash
sudo reboot
```

Reconnect and verify:

```bash
pm2 list
```

Your processes should start automatically.

---

# 10. Useful PM2 Commands

### View running apps

```bash
pm2 list
```

### Monitor processes

```bash
pm2 monit
```

### View logs

```bash
pm2 logs
```

### Restart the API

```bash
pm2 restart usage-api
```

### Stop the API

```bash
pm2 stop usage-api
```

### Scale instances

```bash
pm2 scale usage-api 2
```

---

# 11. Optional: Protect Against Memory Leaks

Restart process automatically if memory exceeds limit.

```bash
pm2 restart usage-api --max-memory-restart 300M
```

---

# Final Setup

Server architecture:

```
Internet
   ↓
Cloudflare Tunnel
   ↓
Nginx
   ↓
PM2 Cluster (2 workers)
   ↓
Express API
   ↓
PostgreSQL
```

This setup provides:

* load balancing across CPU cores
* automatic restart on crash
* automatic start after system reboot
* monitoring with PM2

# Data Sunita Server Architecture

This document explains the **final system architecture**, why each component was introduced, and the steps taken to evolve the system from a simple Node.js server into a more resilient production-style infrastructure.

---

# 1. Project Overview

**Data Sunita** is a personal telemetry and productivity platform designed to collect and analyze:

* IoT device data
* mobile usage logs
* sensor telemetry
* productivity metrics

Devices periodically send data to the server. The system must handle **burst traffic**, where many devices send data at the same moment (for example every 15 minutes).

---

# 2. Original Architecture (Initial Setup)

Initially the system was very simple.

```
Internet
   ↓
Cloudflare
   ↓
Node.js (single process)
   ↓
PostgreSQL
```

## Characteristics

* One Node.js process
* No connection buffering
* No load balancing
* Database writes handled directly

## Problems

1. Only **one CPU core** used.
2. Node handled **all incoming connections directly**.
3. Burst traffic from IoT devices could overwhelm the server.
4. No process supervision if Node crashed.

This setup works for small testing workloads but becomes fragile under burst traffic.

---

# 3. Improved Architecture (Final System)

The current architecture introduces several layers to increase reliability and scalability.

```
Internet
   ↓
Cloudflare CDN + Security
   ↓
Cloudflare Tunnel
   ↓
Nginx Reverse Proxy
   ↓
PM2 Node.js Cluster
   ↓
Express API
   ↓
PostgreSQL Database
   ↓
SSD Storage
```

Each component has a specific purpose.

---

# 4. Cloudflare (Edge Network)

Cloudflare sits at the edge of the system.

### Responsibilities

* DNS resolution
* TLS / HTTPS termination
* DDoS protection
* CDN caching
* global edge routing

### Benefits

* hides the real server IP
* protects the server from direct internet exposure
* reduces traffic spikes

---

# 5. Cloudflare Tunnel

Instead of opening firewall ports, the server establishes an **outbound tunnel** to Cloudflare.

```
Server → Cloudflare
```

### Advantages

* no open ports required
* prevents direct attacks
* secure encrypted connection
* easier remote hosting from home network

### Tunnel Configuration

File:

```
/etc/cloudflared/config.yml
```

Example:

```
protocol: http2

tunnel: <tunnel-id>

ingress:
  - hostname: data.sunita.space
    service: http://localhost:80

  - hostname: sunita.space
    service: http://localhost:80

  - service: http_status:404
```

---

# 6. Domain Structure

Two domains are used.

### Website

```
sunita.space
```

Used for:

* main website
* landing pages
* documentation

### API

```
data.sunita.space
```

Used for:

* device telemetry
* sensor data
* analytics APIs

Separating API and website keeps the system organized.

---

# 7. Nginx Reverse Proxy

Nginx acts as the **entry point on the server**.

```
Cloudflare Tunnel
        ↓
      Nginx
```

### Responsibilities

* manage thousands of connections
* buffer slow clients
* protect backend services
* route traffic to Node.js

### Nginx Configuration

File:

```
/etc/nginx/sites-available/usage-api
```

Example:

```
server {
    listen 80;

    server_name sunita.space data.sunita.space;

    location / {
        proxy_pass http://127.0.0.1:3000;

        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

### Why Nginx was added

Without Nginx:

* Node handles every connection
* slow clients consume resources

With Nginx:

* connections buffered efficiently
* Node only handles application logic

---

# 8. PM2 Process Manager

Node.js normally runs **a single process**.

That means only **one CPU core** is used.

PM2 allows us to run multiple workers.

```
PM2
 ├ Node Worker 1
 ├ Node Worker 2
 ├ Node Worker 3
 └ Node Worker 4
```

### Benefits

* uses all CPU cores
* automatic restart if a process crashes
* monitoring and logging
* load balancing between workers

### Example Start Command

```
pm2 start server.js -i max --name usage-api
```

### Startup Persistence

```
pm2 startup
pm2 save
```

This ensures the server starts automatically after reboot.

---

# 9. Express API Server

The Node.js application is built using **Express.js**.

Responsibilities:

* receive device telemetry
* validate incoming data
* write records into PostgreSQL
* serve API endpoints

Example endpoints:

```
POST /device/log
POST /sensor/data
GET /dashboard
```

---

# 10. PostgreSQL Database

PostgreSQL stores:

* telemetry logs
* device activity
* productivity analytics
* usage data

### Example Table

```
device_logs
-----------
id
device_id
timestamp
data
```

### Why PostgreSQL

* strong reliability
* good indexing
* handles large datasets
* ACID transactions

---

# 11. Storage

The server uses a **256GB SSD**.

SSD performance dramatically improves database writes compared to HDD.

Typical performance:

```
HDD  → ~100 inserts/sec
SSD  → 1000+ inserts/sec
```

This allows the system to handle burst telemetry traffic.

---

# 12. Traffic Pattern

Devices send telemetry periodically.

Example behavior:

```
15 minutes idle
↓
All devices send data simultaneously
↓
3 write requests per device
```

This creates a **burst workload**.

Example:

```
10,000 devices
× 3 writes
= 30,000 requests
```

Nginx buffers connections and PM2 distributes work across workers.

---

# 13. Performance Characteristics

Approximate capacity of this server:

```
Concurrent connections: 2000–4000
API requests/sec:       500–1200
DB inserts/sec:         800–2000
```

Burst telemetry from tens of thousands of devices can be processed safely.

---

# 14. Monitoring Tools

Useful commands for monitoring the system:

### Process monitoring

```
pm2 monit
```

### CPU / memory

```
top
htop
```

### Network traffic

```
nethogs
```

### Nginx logs

```
sudo tail -f /var/log/nginx/access.log
```

---

# 15. Security Benefits

This architecture improves security.

Protection layers:

```
Cloudflare
↓
Cloudflare Tunnel
↓
Nginx
↓
Node API
```

Advantages:

* server IP hidden
* no open ports
* Cloudflare firewall
* DDoS mitigation

---

# 16. Why This Architecture Was Chosen

Goals:

* run reliably on a **home laptop server**
* handle **burst telemetry traffic**
* keep system **simple and maintainable**
* avoid expensive cloud infrastructure

By combining open-source tools the system achieves good scalability while remaining lightweight.

---

# 17. Final Architecture Summary

```
Users / Devices
       ↓
   Cloudflare
       ↓
 Cloudflare Tunnel
       ↓
       Nginx
       ↓
    PM2 Cluster
       ↓
     Express
       ↓
   PostgreSQL
       ↓
       SSD
```

This architecture provides:

* reliability
* scalability
* security
* efficient resource usage

while running on modest hardware.

---

# Author

**Rachappa Biradar**

Creator of the **Data Sunita Platform**.

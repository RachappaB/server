Below is a **complete problem report (PR / incident report)** describing what happened with your server, the root cause, investigation steps, and the final fix. You can use this for **documentation, blog, or system notes**.

---

# Incident Report: Cloudflare Tunnel Outage on Ubuntu Server

## Overview

On **March 4, 2026**, the server hosting services through a **Cloudflare Tunnel** experienced a service outage. The hosted website became unreachable despite the `cloudflared` service appearing to run normally.

The root cause was traced to a **DNS resolution failure on the Ubuntu server**, which prevented the Cloudflare tunnel from connecting to Cloudflare edge servers.

---

# System Environment

| Component          | Value                      |
| ------------------ | -------------------------- |
| OS                 | Ubuntu Linux               |
| Tunnel Service     | cloudflared                |
| Hosting method     | Cloudflare Tunnel          |
| Network            | Home network with DHCP DNS |
| Service Manager    | systemd                    |
| Tunnel connections | HTTP2                      |

---

# Symptoms Observed

Users could not access the hosted website.

The server logs showed repeated connection failures.

Example log messages:

```
ERR Failed to register connection
ERR Connection
ERR no more connections active
```

Despite this, the service appeared active:

```
cloudflared.service loaded active running
```

This created a **false healthy state**, where the service process was running but not connected to the Cloudflare edge network.

---

# Initial Troubleshooting

The following checks were performed.

### 1. Restart Cloudflare Tunnel

Commands executed:

```bash
sudo systemctl stop cloudflared
sudo systemctl restart cloudflared
sudo systemctl start cloudflared
```

Service status:

```
cloudflared.service loaded active running
```

Result:
Service restarted but tunnel remained disconnected.

---

### 2. Inspect Tunnel Logs

Command:

```bash
sudo journalctl -u cloudflared -n 50
```

Logs indicated repeated failures to register a tunnel connection.

This suggested either:

* network connectivity issue
* authentication issue
* DNS resolution failure

---

# Network Diagnostics

### 1. Test raw connectivity

```
ping 1.1.1.1
```

Result:

```
64 bytes from 1.1.1.1
```

Conclusion:

Internet connectivity was working.

---

### 2. Test DNS resolution

```
ping google.com
```

Result:

No response.

This confirmed **DNS resolution failure**.

---

### 3. Test HTTP connectivity

```
curl https://api.cloudflare.com
```

Result:

Request hung indefinitely.

This confirmed the server could not resolve domain names.

---

# DNS Configuration Investigation

The system resolver configuration was inspected.

```
cat /etc/resolv.conf
```

Output showed multiple private DNS servers:

```
nameserver 192.168.254.1
nameserver 192.168.3.5
nameserver 192.168.31.36
nameserver 8.8.8.8
nameserver 1.1.1.1
```

These private DNS servers were provided by DHCP.

However, they were **unreachable or unresponsive**, causing DNS queries to stall before reaching the public resolvers.

Because DNS queries stalled, the server could not resolve Cloudflare endpoints such as:

```
api.cloudflare.com
*.cfargotunnel.com
```

---

# Root Cause

The root cause was **misconfigured DNS resolvers provided via DHCP**.

The resolver attempted several non-responsive local DNS servers before attempting public DNS servers.

This caused DNS lookups to hang.

Since Cloudflare Tunnel requires DNS to resolve edge servers, the tunnel failed to connect.

---

# Resolution

DNS was reconfigured to use reliable public DNS servers.

### Modify systemd-resolved configuration

File edited:

```
/etc/systemd/resolved.conf
```

Updated configuration:

```
DNS=1.1.1.1 8.8.8.8
FallbackDNS=1.0.0.1 8.8.4.4
```

---

### Restart resolver

```
sudo systemctl restart systemd-resolved
```

---

# Verification

### DNS test

```
ping google.com
```

Result:

```
64 bytes from google.com
```

DNS resolution restored.

---

### Cloudflare API test

```
curl https://api.cloudflare.com
```

Request returned successfully.

---

### Restart tunnel

```
sudo systemctl restart cloudflared
```

---

# Successful Tunnel Connection

Logs confirmed successful tunnel registration:

```
Registered tunnel connection connIndex=0 location=bom11
Registered tunnel connection connIndex=1 location=maa03
Registered tunnel connection connIndex=2 location=bom08
Registered tunnel connection connIndex=3 location=maa03
```

This indicates:

* multiple active connections
* geographic redundancy
* successful connection to Cloudflare edge network

---

# Final System State

| Component         | Status     |
| ----------------- | ---------- |
| DNS               | Working    |
| Cloudflare Tunnel | Connected  |
| Edge connections  | 4 active   |
| Website           | Accessible |

---

# Lessons Learned

### 1. Service running ≠ service functional

A systemd service may appear **active** even if the application inside it cannot connect to its dependencies.

---

### 2. DNS failures can break many services

Cloudflare Tunnel, APIs, package managers, and monitoring tools all rely on DNS.

---

### 3. Avoid unreliable DHCP DNS servers

Using public DNS servers such as:

* 1.1.1.1
* 8.8.8.8

provides more consistent behavior for servers.

---

# Preventive Measures

To prevent recurrence:

1. Configure permanent DNS in `systemd-resolved`.
2. Add monitoring for tunnel connectivity.
3. Implement health checks for the hosted service.
4. Monitor DNS resolution latency.

---

# Useful Diagnostic Commands

Check tunnel logs:

```
sudo journalctl -u cloudflared -f
```

Test DNS:

```
ping google.com
```

Test Cloudflare API:

```
curl https://api.cloudflare.com
```

Restart tunnel:

```
sudo systemctl restart cloudflared
```

---

If you want, I can also convert this into a **clean Medium-style story post** about how your **old laptop server failed at night and how you debugged it step by step** — that would fit nicely with the article you mentioned earlier about turning your laptop into a server.

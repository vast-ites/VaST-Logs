# DataVast User Guide

**Version:** 2.2.0 (Phase 19)
**Date:** February 2026

## Table of Contents
1. [Overview](#1-overview)
2. [Installation](#2-installation)
    - [Server Deployment](#21-server-deployment)
    - [Agent Deployment](#22-agent-deployment)
3. [Configuration](#3-configuration)
    - [Agent Configuration (`agent-config.json`)](#31-agent-configuration)
    - [Log Collection Strategies](#32-log-collection-strategies)
    - [Database & Service Monitoring](#33-database--service-monitoring)
    - [Server Environment Variables (`.env`)](#35-server-environment-variables-env)
4. [Features](#4-features)
    - [Dashboard & Infrastructure](#41-dashboard--infrastructure)
    - [Live Connection Tracking](#42-live-connection-tracking)
    - [Log Explorer & Filtering](#43-log-explorer--filtering)
    - [Alerting System](#44-alerting-system)
    - [Historical Network Metrics](#45-historical-network-metrics)
5. [Troubleshooting](#5-troubleshooting)

---

## 1. Overview

**DataVast** is a real-time observability platform designed for modern Linux infrastructure. It provides a unified view of your servers, containers, applications, and network traffic without the complexity of traditional monitoring stacks.

**Key Capabilities:**
- **Zero-Config Agent**: Auto-discovers logs, processes, and docker containers.
- **Real-Time metrics**: 1-second resolution for CPU, Memory, and Network.
- **Live Forensics**: See every active network connection and open port.
- **Smart Log Aggregation**: Centralized logs from Nginx, Apache, MySQL, Systemd, and more.

---

## 2. Installation

### 2.1 Server Deployment

The DataVast Server is the central brain. It requires **ClickHouse** (Logs/Traces) and **InfluxDB** (Metrics).

**Prerequisites:**
- Linux Server (Ubuntu 20.04+ recommended)
- Docker & Docker Compose

**Steps:**
1.  **Clone/Download Registry**:
    ```bash
    git clone https://github.com/datavast/platform.git /opt/datavast
    cd /opt/datavast/deployment
    ```

2.  **Start Databases**:
    ```bash
    docker-compose up -d
    # Verifying running containers: datavast-clickhouse, datavast-influxdb
    ```

3.  **Start Server**:
    ```bash
    # Ensure binary is in /opt/datavast/server/bin
    ./datavast-server
    ```
    *The server listens on port `8080` by default.*

### 2.2 Agent Deployment

The DataVast Agent must be installed on **every** host you want to monitor.

1.  **Installation**:
    Copy the `datavast-agent` binary to the target host (e.g., via SCP).
    ```bash
    scp datavast-agent root@target-ip:/usr/local/bin/
    ssh root@target-ip "chmod +x /usr/local/bin/datavast-agent"
    ```

2.  **Create Service**:
    Create a systemd unit file at `/etc/systemd/system/datavast-agent.service`:
    ```ini
    [Unit]
    Description=DataVast Agent
    After=network.target

    [Service]
    ExecStart=/usr/local/bin/datavast-agent
    Restart=always
    User=root
    # Environment Variables (Optional override)
    # Environment="SERVER_URL=http://<YOUR_SERVER_IP>:8080"
    # Environment="HOSTNAME=my-web-server"

    [Install]
    WantedBy=multi-user.target
    ```

3.  **Start Agent**:
    ```bash
    systemctl daemon-reload
    systemctl enable --now datavast-agent
    ```

---

## 3. Configuration

The agent creates a default configuration on first run. You can customize it by editing `/opt/datavast/agent-config.json` (or `/etc/datavast/agent.yaml`).

### 3.1 Agent Configuration

**File Path:** `/opt/datavast/agent-config.json`

**Structure:**
```json
{
  "server_url": "http://<SERVER_IP>:8080",
  "agent_id": "production-db-1",
  "agent_secret": "auto-generated-secret",
  "collectors": {
    "system": true,       // CPU, RAM, Disk
    "docker": true,       // Container Stats & Logs
    "nginx": true,        // Nginx Access/Error Logs
    "apache": false,      // Apache Access/Error Logs
    "mysql": true,        // MySQL Metrics
    "pm2": false          // PM2 Process Manager
  },
  "log_config": {
    "mode": "all"         // "all", "selected", or "none"
  }
}
```

### 3.2 Log Collection Strategies

The `log_config.mode` setting controls how the agent finds logs.

#### Option A: Auto-Discovery (`mode: "all"`)
The agent scans common paths (`/var/log/*`, `/home/*/.pm2/logs`) and open file descriptors of running processes.
- **Pros**: Zero configuration. Finds logs even if they are in non-standard locations (if open).
- **Cons**: Can be noisy.

#### Option B: Selected Logs (`mode: "selected"`)
Only collect specific files defined in `selected_logs`.
```json
"log_config": {
  "mode": "selected",
  "selected_logs": [
    "/var/log/nginx/access.log",
    "/var/log/my-app/error.log",
    "/opt/custom/app.log"
  ]
}
```
*Note: Service-specific collectors (like `collectors.nginx = true`) will still function even in "selected" mode if the paths match standard locations.*

### 3.3 Database & Service Monitoring

DataVast has specialized collectors that go beyond simple log tailing. To enable them, set the corresponding flag to `true` in `collectors`.

| Service | Config Flag | Requirements | Metrics Collected |
| :--- | :--- | :--- | :--- |
| **Nginx** | `"nginx": true` | Logs at `/var/log/nginx` | throughput, status codes, latency |
| **Apache** | `"apache": true` | Logs at `/var/log/apache2` | throughput, status codes |
| **MySQL** | `"mysql": true` | User `datavast` with READ access | QPS, Connections, Slow Queries, Buffer Pool |
| **Postgres** | `"postgresql": true` | User `datavast` | TPS, Locks, Cache Hit Ratio |
| **Redis** | `"redis": true` | Auth via Env Var | Ops/sec, Memory, Evictions |
| **MongoDB** | `"mongodb": true` | User `datavast` | Ops/sec, Connections, Replication Lag |
| **PM2** | `"pm2": true` | `pm2` command in PATH | Process status, Restarts, CPU/Mem per proc |

---

### 3.4 Advanced Database Diagnostics

To unlock deep performance insights (slow queries, index usage, I/O stats), specific database configurations are required.

#### MySQL / MariaDB
Enable `performance_schema` to track index usage and I/O latency.
1.  Edit `my.cnf` (or `mysqld.cnf`):
    ```ini
    [mysqld]
    performance_schema=ON
    ```
2.  Restart MySQL: `sudo systemctl restart mysql`

#### PostgreSQL
Enable `pg_stat_statements` to track slow queries and execution statistics.
1.  Edit `postgresql.conf`:
    ```ini
    shared_preload_libraries = 'pg_stat_statements'
    pg_stat_statements.track = all
    ```
2.  Restart PostgreSQL: `sudo systemctl restart postgresql`
3.  Enable extension in your database:
    ```sql
    CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
    ```

#### MongoDB
Enable the Database Profiler to track slow operations.
1.  Connect to your MongoDB instance.
2.  Run the following command (enables profiling for all operations > 100ms):
    ```javascript
    db.setProfilingLevel(2, { slowms: 100 })
    ```
    *Note: Level 2 profiles all operations. Use Level 1 to profile only slow operations.*

### 3.5 Server Environment Variables (`.env`)

The DataVast server reads its configuration from a `.env` file located in the working directory (typically `/opt/datavast/.env`).

**Example `.env` file:**
```bash
# Authentication
AUTH_ENABLED=true
ADMIN_PASSWORD=your-secure-password
JWT_SECRET=$(openssl rand -hex 32)

# Database
INFLUX_TOKEN=your-influxdb-token

# CORS — Allowed Origins (comma-separated)
# REQUIRED in production. Without this, browsers block cross-origin API requests.
CORS_ORIGINS=https://your-domain.com,https://your-server-ip:8080
```

#### CORS Configuration

The `CORS_ORIGINS` variable controls which frontend domains are allowed to make API requests to the DataVast server. This is a **required** setting in production.

| Scenario | Value |
| :--- | :--- |
| **Local development** | Not set (defaults to `http://localhost:5173`) |
| **Single domain** | `CORS_ORIGINS=https://datavast.example.com` |
| **IP + domain access** | `CORS_ORIGINS=https://datavast.example.com,https://10.0.0.5:8080` |
| **HTTP + HTTPS** | `CORS_ORIGINS=https://example.com,http://example.com:8080` |

> **Notes:**
> - Multiple origins are separated by commas. Spaces around commas are automatically trimmed.
> - Each origin must include the protocol (`http://` or `https://`) and port (if non-standard).
> - Do **not** use wildcard (`*`) — it is not supported when credentials are enabled.
> - After changing `.env`, restart the server: `systemctl restart datavast-server`

---

## 4. Features

### 4.1 Dashboard & Infrastructure
- **Global Overview**: Real-time aggregate metrics for your entire fleet.
- **Drill-down**: Click on any host to see per-core CPU usage, disk I/O latency, and individual process resource consumption.

### 4.2 Live Connection Tracking
**New in v2.2:** Real-time visibility into network traffic.
- **Navigate to**: Sidebar > **Connection Tracking**.
- **Cards View**: See every active listening port (e.g., `:80`, `:443`, `:22`) and the number of active connections.
- **Drill-down**: Click a port card to see a list of remote IPs connected to that port, their state (`ESTABLISHED`, `TIME_WAIT`), and the process owning the socket.

### 4.3 Log Explorer & Filtering
- **Centralized Logs**: View logs from all hosts in one stream.
- **Service Filtering**: Use the sidebar to filter by `Service` (e.g., "nginx", "mysql") instead of just file paths.
- **Search**: Full-text search support. Use `host:fusionpbx error` to find errors on a specific host.

### 4.4 Alerting System
Configure rules to get notified via Email, Slack, or Webhook.
- **Resource Alerts**: CPU > 90%, Disk < 10% Free.
- **Log Alerts**: Trigger on regex match (e.g., "Panic", "Fatal error").
- **Network Alerts**: Trigger on high bandwidth usage or connection spikes.
- **Configuration**: Sidebar > **Alerts**.

### 4.5 Historical Network Metrics
Analyze network trends over time (1h, 24h, 7d).
- Toggle between "Live" and "History" on the Network tab.
- Filter by specific network interface (`eth0`, `docker0`).

---

## 5. Troubleshooting

**Q: Logs are not showing up in "Services" view.**
A: Ensure the specific collector is enabled in `agent-config.json` (e.g., `"nginx": true`). If the logs are being collected but labeled generic (e.g., "filesystem_scan"), the Services view might filter them out. Enabling the specific collector properly tags them.

**Q: "No active connections" on Connection Tracking page.**
A: Check if the agent is running as root (required to see all sockets). Also ensure your browser can reach the API (check Console for 401 errors if Auth is enabled).

**Q: Agent is not registering.**
A: Check the `SERVER_URL` in `agent-config.json`. Ensure port `8080` is open on the server firewall. Check agent logs: `journalctl -u datavast-agent -f`.

# DataVAST Observability Platform

**DataVAST** is a modern, zero-config observability platform for Linux infrastructure. Built with Go, React, ClickHouse, and InfluxDB, it provides real-time monitoring, log aggregation, and intelligent alerting across your entire fleet — served over **HTTPS** with self-signed TLS support.

## ✨ Features

### 🔍 **Comprehensive Monitoring**
- **Real-Time Metrics**: CPU, Memory, Disk I/O, Network traffic (1s resolution)
- **Historical Analysis**: Custom date and time range selectors to instantly retrieve past database and system metrics.
- **Container Monitoring**: Auto-discovery and streaming logs from Docker containers
- **Process Tracking**: Monitor individual processes with resource usage
- **Multi-Host Dashboard**: Centralized view of all connected agents

### 📊 **Advanced Log Management**
- **Smart Log Discovery**: Automatic detection of system, application, and service logs
- **Full-Text Search**: Regex-based search with advanced filtering
- **Service Categorization**: Auto-categorize logs by service (Apache, Nginx, Caddy, Traefik, MySQL, PostgreSQL, Redis, MongoDB, etc.)
- **Real-Time Streaming**: Live log tailing with configurable refresh rates
- **Export Capabilities**: Download filtered logs in JSON format

### 🎯 **Services & Integrations Hub**
- **Service Discovery**: Automatic detection of running services across all hosts
- **Integration Wizard**: Quick setup for Apache, Nginx, Caddy, Traefik, PM2, and custom log files
- **Deep-Linking**: Click services to view filtered logs instantly
- **Multi-Host Aggregation**: Services from all agents in one unified view

### 🚨 **Intelligent Alerting**
- **Multi-Channel Notifications**: Email (SMTP), Webhook, and **Browser Push Notifications**
- **Paginated Alert Timeline**: Scroll back through up to 1,000 historical firing events directly inside the Alert dashboard via a highly-optimized paginated database view.
- **DDoS Detection**: Automatic threat detection and alerting
- **Resource Thresholds**: Alert on CPU, Memory, Disk usage
- **Customizable Rules**: Define your own alert conditions
- **In-App Notification Bell**: Real-time alert feed with unread badge
- **Browser Notifications**: Push alerts via the Notification API (requires HTTPS)

### 🎨 **Modern UI/UX**
- **Sci-Fi Themed Dashboard**: Sleek, dark-mode interface
- **Global Host Context**: Seamless navigation across pages
- **Live Data Visualization**: Real-time charts and metrics
- **Responsive Design**: Works on desktop and tablet

---

## 🚀 Quick Start

### Prerequisites
- **Docker & Docker Compose** (for databases)
- **Go 1.21+** (for agent/server)
- **Node.js 18+** (for frontend)

### 1. Start Infrastructure (Databases)
Initialize ClickHouse and InfluxDB containers.
```bash
cd deployment
docker-compose up -d
```
*Wait ~15 seconds for databases to be ready.*

### 2. Configure Environment
Create a `.env` file in the project root with your credentials.
```bash
nano .env
```

**Required environment variables:**
```bash
# Authentication
AUTH_ENABLED=true
ADMIN_PASSWORD=your-secure-password-here
JWT_SECRET=your-random-secret-key-here

# Database
INFLUX_TOKEN=your-influxdb-token
# CLICKHOUSE_DSN=clickhouse://localhost:9000  (optional, uses default if unset)

# CORS — Comma-separated list of allowed origins for cross-origin requests
# Required in production to allow your frontend domain to access the API
CORS_ORIGINS=https://your-domain.com,https://your-server-ip:8080
```

> **Note:** Passwords are automatically hashed with bcrypt on first startup. The `JWT_SECRET` is used to sign authentication tokens — if not set, a random one is generated (tokens won't survive server restarts).

**Default credentials:**
- **Username:** `admin`
- **Password:** (whatever you set in `ADMIN_PASSWORD`)

### 3. Start Backend Server
Runs on port `8080`. Automatically serves HTTPS if certificates are found, otherwise falls back to HTTP.
```bash
cd server
go mod tidy
go build -o datavast-server
./datavast-server
```

> **HTTPS:** To enable TLS, place `server.crt` and `server.key` in a `certs/` directory next to the binary. See the [HTTPS/TLS Setup](#-httpstls-setup) section for details.

**✅ Server will automatically load credentials from `.env` file**

### 4. Start Agent
Runs as `root` to discover logs and metrics. Sends data to Server.
```bash
cd agent
go mod tidy
go build -o datavast-agent
sudo ./datavast-agent
```

### 5. Start Frontend Dashboard
Runs on port `5173`.
```bash
cd web
npm install
npm run dev
```

### 6. Access the Platform
Open your browser and navigate to:
- **Development:** `http://localhost:5173`
- **Production (HTTP):** `http://your-server:8080`
- **Production (HTTPS):** `https://your-server:8080`

**Login with the credentials you set in Step 2:**
- **Username:** `admin`
- **Password:** (the one you set in `.env` file)

> **Note:** With self-signed certificates, your browser will show a security warning. Click **"Advanced" → "Proceed"** to continue. This is expected behavior for self-signed certs.

---

## 🏗️ Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Agent (Go)     │─────▶│  Server (Go)    │─────▶│  Frontend       │
│  - Log Tailing  │      │  - API Gateway  │      │  (React + Vite) │
│  - Metrics      │      │  - ClickHouse   │      │  - Dashboard    │
│  - Discovery    │      │  - InfluxDB     │      │  - Charts       │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

### Components

**Agent**:
- Multi-strategy log discovery (filesystem, /proc, manual)
- Smart service tagging (Apache, Nginx, Caddy, Traefik, MySQL, PostgreSQL, Redis, MongoDB, PM2)
- Docker log streaming
- System metric collection (CPU, RAM, Disk, Network)
- Container metric collection

**Server**:
- RESTful API (Gin framework)
- ClickHouse for log storage (high-throughput writes)
- InfluxDB for time-series metrics
- HTTPS with self-signed TLS certificates (auto-fallback to HTTP)
- JWT-based authentication with session management

**Frontend**:
- React 18 with Vite
- Redux Toolkit for state management
- Recharts for visualizations
- Lucide React for icons
- Tailwind CSS for styling
- Browser Notification API integration (secure context aware)

**Security**:
- **TLS/HTTPS**: Self-signed certificate support with automatic fallback to HTTP.
- **Authentication**: JWT-based auth with bcrypt password hashing.
- **Agent Auth**: API key authentication (`X-Agent-Secret`) for all ingestion endpoints.
- **Default State**: Secure by default (`AUTH_ENABLED=true`).
- **Authorization**: Role-based access control (RBAC) with scoped user accounts.
- **CORS**: Strict origin allowlisting (no wildcard), supports both HTTP and HTTPS origins.
- **Secrets**: JWT secret and database tokens loaded from environment variables.
- **Randomness**: Cryptographically secure random generation (`crypto/rand`).
- **Frontend Security**: Automatic token injection and session management.
- **Agent TLS**: Agents use `InsecureSkipVerify` for self-signed cert connections.

---

## 🔐 Authentication & Security

The platform uses a secure-by-default approach:
- **Password Hashing**: All passwords (admin and user) are hashed with **bcrypt** (cost factor 12). Plaintext passwords are automatically migrated to bcrypt on first startup.
- **JWT Tokens**: Signed with a secret loaded from the `JWT_SECRET` environment variable.
- **Agent Authentication**: All ingestion endpoints require a valid `X-Agent-Secret` header. Secrets are generated during agent enrollment.
- **IP Intelligence**: Block/unblock and IP analysis routes require admin authentication.
- **Enforcement**: API endpoints require a valid JWT token when `AUTH_ENABLED=true` (default).
- **Disable Auth**: Set `AUTH_ENABLED=false` in `.env` (NOT recommended for production).
- **User Accounts**: Create scoped viewer accounts with access limited to specific hosts.
- **Frontend**: Automatically handles token storage and injection in `HostContext`.

**To change password:**
1. Edit the `.env` file: update `ADMIN_PASSWORD=your-new-password`
2. Restart the server (the new password is automatically bcrypt-hashed)

---

## 🔒 HTTPS/TLS Setup

DataVAST supports serving over **HTTPS** using self-signed (or CA-signed) TLS certificates. The server automatically detects certificates and enables TLS, falling back to plain HTTP if no certificates are found.

### Generate Self-Signed Certificates

```bash
sudo mkdir -p /opt/datavast/certs
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /opt/datavast/certs/server.key \
  -out /opt/datavast/certs/server.crt \
  -subj "/CN=your-server-ip" \
  -addext "subjectAltName=IP:your-server-ip"
sudo chmod 600 /opt/datavast/certs/server.key
```

The server looks for certificates at `certs/server.crt` and `certs/server.key` relative to its working directory. If found, it starts with `RunTLS`; otherwise, it uses `Run` (HTTP).

### Agent Configuration for HTTPS

When using self-signed certificates, agents automatically skip TLS verification (`InsecureSkipVerify: true`). Update the agent config to use the `https://` scheme:

```json
{
  "server_url": "https://your-server-ip:8080"
}
```

### CORS

The server automatically allows both `http://` and `https://` origins for the configured server IP.

---

## 📦 Deployment

### Production Setup

1. **Deploy Databases**:
   ```bash
   cd deployment
   docker-compose -f docker-compose.yml up -d
   ```

2. **Configure Environment**:
   ```bash
   sudo mkdir -p /opt/datavast
   sudo tee /opt/datavast/.env << 'EOF'
   AUTH_ENABLED=true
   JWT_SECRET=$(openssl rand -hex 32)
   INFLUX_TOKEN=your-influxdb-token
   ADMIN_PASSWORD=your-secure-password
   EOF
   sudo chmod 600 /opt/datavast/.env
   ```

3. **Build & Deploy Server**:
   ```bash
   cd server
   go build -o datavast-server
   sudo cp datavast-server /opt/datavast/
   ```

   Create the server systemd service:
   ```bash
   sudo tee /etc/systemd/system/datavast-server.service << 'EOF'
   [Unit]
   Description=DataVast Server
   After=network.target

   [Service]
   Type=simple
   User=root
   WorkingDirectory=/opt/datavast
   EnvironmentFile=/opt/datavast/.env
   Environment=GIN_MODE=release
   ExecStart=/opt/datavast/datavast-server
   Restart=always
   RestartSec=10

   [Install]
   WantedBy=multi-user.target
   EOF
   
   sudo systemctl daemon-reload
   sudo systemctl enable --now datavast-server
   ```

4. **Build Frontend**:
   ```bash
   cd web
   npm run build
   # The built-in server serves the frontend via gin-contrib/static
   # Copy dist/ to the server's web/dist/ directory
   ```

5. **Deploy Agent** (on each monitored host):
   ```bash
   cd agent
   go build -o datavast-agent
   
   # Copy binary
   sudo mkdir -p /opt/datavast
   sudo cp datavast-agent /opt/datavast/
   
   # Create systemd service
   sudo tee /etc/systemd/system/datavast-agent.service << 'EOF'
   [Unit]
   Description=DataVast Agent
   After=network.target

   [Service]
   Type=simple
   User=root
   WorkingDirectory=/opt/datavast
   ExecStart=/opt/datavast/datavast-agent
   Restart=always
   RestartSec=10

   [Install]
   WantedBy=multi-user.target
   EOF
   
   # Enable and start service
   sudo systemctl daemon-reload
   sudo systemctl enable --now datavast-agent
   ```

### Agent Configuration
Create `/opt/datavast/agent-config.json`:
```json
{
  "server_url": "https://your-server:8080",
  "agent_id": "production-web-1",
  "agent_secret": "your-agent-secret-key",
  "collectors": {
    "system": true,
    "docker": true,
    "apache": true
  },
  "log_config": {
    "mode": "all"
  }
}
```

> **Note:** Use `https://` for the `server_url` when TLS is enabled. The agent automatically handles self-signed certificate verification.

---

## 🔧 Configuration

### Environment Variables

**Server (Required)**:
| Variable | Description | Default |
|----------|-------------|--------|
| `INFLUX_TOKEN` | InfluxDB authentication token | *(required, fatal if missing)* |
| `AUTH_ENABLED` | Enable JWT authentication | `true` |
| `ADMIN_PASSWORD` | Admin account password | *(auto-generated if unset)* |
| `JWT_SECRET` | JWT signing key | *(random per restart if unset)* |

**Server (Optional)**:
| Variable | Description | Default |
|----------|-------------|--------|
| `CORS_ORIGINS` | Comma-separated list of allowed CORS origins | `http://localhost:5173` |
| `INFLUX_URL` | InfluxDB URL | `http://localhost:8086` |
| `CLICKHOUSE_DSN` | ClickHouse connection string | `clickhouse://localhost:9000` |
| `GIN_MODE` | Gin framework mode | `debug` (use `release` in prod) |

> **⚠️ CORS Note:** In production, you **must** set `CORS_ORIGINS` to the domain(s) your frontend is served from. Without this, browsers will block API requests. Example:
> ```bash
> CORS_ORIGINS=https://datavast.example.com,https://10.0.0.5:8080
> ```
> Multiple origins are separated by commas. Spaces around commas are trimmed automatically.

**Agent**:
| Variable | Description | Default |
|----------|-------------|--------|
| `SERVER_URL` | Backend server URL | `http://localhost:8080` |
| `AGENT_ID` | Unique agent identifier | *(required)* |

---

## 🎯 Use Cases

### Web Application Monitoring
Monitor Apache/Nginx/Caddy/Traefik access logs, error logs, and application logs in real-time. Set alerts for HTTP 500 errors or traffic spikes.

### Infrastructure Monitoring
Track CPU, memory, disk usage across multiple servers. Get alerted when thresholds are exceeded.

### Container Orchestration
Auto-discover and monitor Docker containers. Stream logs from all containers in one centralized view.

### Security Monitoring
Monitor auth.log for failed login attempts. Detect DDoS attacks based on traffic patterns.

---

## 📚 Documentation

- **API Reference**: `/server/api/` - REST endpoints
- **Agent Discovery**: `/agent/discovery/` - Log & metric collection strategies
- **Frontend Components**: `/web/src/components/` - Reusable UI components

---

## 🛠️ Development

### Tech Stack
- **Backend**: Go, Gin, ClickHouse, InfluxDB
- **Frontend**: React 18, Vite, Redux Toolkit, Tailwind CSS
- **Agent**: Go (privileged execution)
- **Deployment**: Docker, Systemd

### Running Tests
```bash
# Backend
cd server
go test ./...

# Frontend
cd web
npm test
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is proprietary software. All rights reserved.

---

## 🚧 Roadmap

### Completed Phases

<details>
<summary><strong>🏗️ Foundation (Phases 1–7)</strong></summary>

#### Phase 1: Production Hardening & Settings ✅
- [x] Settings module with JSON-backed persistence (retention policies, alert thresholds)
- [x] JWT-based authentication & secrets management (env vars for DB tokens)
- [x] Per-interface network breakdown with InfluxDB derivatives

#### Phase 2: Network Telemetry ✅
- [x] Per-interface traffic analysis with stacked area charts
- [x] Live interface throughput HUD

#### Phase 3: Security Framework ✅
- [x] JWT auth, RBAC foundation, frontend token injection

#### Phase 4: Agent Enrollment & MFA ✅
- [x] Interactive agent handshake with System API Keys
- [x] TOTP-based MFA for admin actions
- [x] Authenticated agent sessions

#### Phase 5: Modular Agent Configuration ✅
- [x] Togglable collectors (System, Docker, Kubernetes, Nginx, Apache, PM2)
- [x] Permission-aware discovery for non-root execution
- [x] Persistent config via `agent-config.json`

#### Phase 6: Production Deployment ✅
- [x] Single-binary backend serving React frontend via `gin-contrib/static`
- [x] Remote provisioning automation (SSH/SCP)
- [x] Security hardening (localhost-bound databases, random admin password)

#### Phase 7: Multi-Node Architecture ✅
- [x] Global host selector with reactive UI pivoting
- [x] Dynamic node discovery via InfluxDB/ClickHouse tagging
- [x] Agent self-identification and persistence

</details>

<details>
<summary><strong>🔍 Core Features (Phases 8–19)</strong></summary>

#### Phase 8: UX Enhancements ✅
- [x] Configurable refresh rates (1s–60s), log export (CSV/JSON), advanced filtering

#### Phase 9: UI Refinements & Pagination ✅
- [x] Client-side pagination for 5000+ log results, universal refresh controls

#### Phase 10: Integrated Agent Enrollment ✅
- [x] In-HUD "Connect Agent" modal with auto-generated install commands

#### Phase 11: UI Stability & Bug Fixes ✅
- [x] Host selection persistence via `localStorage`, regex search stability

#### Phase 12: Advanced Search ✅
- [x] Omnibox syntax (`host:`, `level:`, `service:`, `before:`, `after:`, `order:`)
- [x] Dynamic ClickHouse query engine with structured filtering

#### Phase 13: Enhanced Node Insight ✅
- [x] Real-time process monitoring, firewall rule auditing (iptables/ufw)

#### Phase 14: UI Overhaul & Migration ✅
- [x] High-fidelity UI migration from `vast-pulse` repository

#### Phase 15: Detailed Resource Monitoring ✅
- [x] Specialized CPU, Memory, Disk, Network pages with `StatCard` and `ResourceChart` widgets

#### Phase 16: Capacity, Discovery & Stabilization ✅
- [x] Auto-detection of CPU model, Swap, partitions, network interfaces
- [x] Fixed OFFLINE false positives and 0% display bugs

#### Phase 17: Dashboard UI Overhaul ✅
- [x] High-density OverviewCard row (Uptime, Load, RAM, Disk), dark-card neon aesthetic

#### Phase 18: Live Terminal View ✅
- [x] Real-time `top -b` stream with ANSI-aware rendering

#### Phase 19: Real-Time Storage Analytics ✅
- [x] Kernel I/O counters, dynamic GB/TB scaling, ClickHouse TTL maintenance

</details>

<details>
<summary><strong>⚡ Scale & Reliability (Phases 20–29)</strong></summary>

#### Phase 20: Schema & UI Resilience ✅
- [x] API schema standardization, VFS filtering (overlay/snap), React purity enforcement

#### Phase 21: Performance Optimization ✅
- [x] Tiered metric collection (1s volatile / 10s hardware), `atomic.Value` decoupling, cache busting

#### Phase 22: Fleet Hardening ✅
- [x] Fleet-wide systemd migration, `SERVER_URL` standardization, self-monitoring hub

#### Phase 23: UI Metadata & Orchestration ✅
- [x] Source selector shows `Hostname (IP)`, real-time Online/Offline status, node removal

#### Phase 24: High-Frequency Monitoring ✅
- [x] Container network I/O delta rates, enhanced log discovery, global refresh state

#### Phase 25: Reliability & Resource Governance ✅
- [x] CPU/RAM limits for databases, feedback loop protection, emergency space recovery

#### Phase 26: Advanced Alerting & Notification Hub ✅
- [x] Webhook integration (Slack/Discord/PagerDuty), email notifications, threshold evaluation

#### Phase 27: Docker Log Streaming ✅
- [x] Native Docker SDK log streaming with `stdcopy`, auto container-name tagging

#### Phase 28: Services & Integrations Hub ✅
- [x] Categorized service dashboard, integration wizard, cross-page deep-linking

#### Phase 29: Optional API Authentication ✅
- [x] Environment-driven JWT enforcement (`AUTH_ENABLED`), role-based access, open ingestion paths

</details>

<details>
<summary><strong>🔬 Deep Monitoring (Phases 30–31)</strong></summary>

#### Phase 30: Per-Service Deep Monitoring ✅
- [x] Apache/Nginx/Caddy/Traefik access log forensics with GeoIP enrichment
- [x] MySQL/MariaDB connection & slow query auditing
- [x] PostgreSQL performance introspection (`pg_stat_activity`)
- [x] Redis memory & hit-rate analysis
- [x] MongoDB document statistics

#### Phase 31: Production Hardening & Remediation ✅
- [x] SQL injection mitigation (type-safe integer casting)
- [x] Git history sanitization (multi-branch `git-filter-repo` cleanup)
- [x] GeoIP deployment (`GeoLite2-City.mmdb`)
- [x] Connection retry logic with exponential backoff
- [x] 10-test automated API health suite (100% pass rate)

</details>

<details>
<summary><strong>🚀 Advanced Platform (Phases 32–40)</strong></summary>

#### Phase 32: Historical Network Analytics ✅
- [x] InfluxDB derivative rate calculation (B/s)
- [x] Multi-tier downsampling (10s, 1m, 5m, 1h) for time ranges
- [x] Dual-mode UI (Live real-time vs. Historical aggregated views)
- [x] Strict host-context isolation in multi-agent queries

#### Phase 33: User-Configurable Alerting Engine ✅
- [x] Generic rule engine for all telemetry metrics
- [x] CRUD API for rules, channels, and silencing
- [x] Pluggable notifications (Email, Webhooks, Slack)
- [x] Alert silencing with duration controls (15m–3d)
- [x] Rule editing, toggling, and network metric expansion

#### Phase 34: Dynamic Theme System ✅
- [x] Full Light/Dark mode with RGB-channel CSS variables
- [x] Theme persistence via `localStorage` + system preference detection

#### Phase 35: Dark Mode Contrast Hardening ✅
- [x] Boosted `--text-muted` contrast, semantic token migration, native dropdown fixes

#### Phase 36: Per-Container Log Discovery ✅
- [x] Docker container name tagging in Log Explorer
- [x] `<optgroup>` categorization separating containers from host services

#### Phase 37: L4 Connection Tracking ✅
- [x] ClickHouse `datavast.connections` table with TTL
- [x] Backend ingest, summary, and detail API handlers
- [x] High-frequency (1s) agent collector with process resolution
- [x] Frontend connection monitoring UI with per-port cards and detail modals
- [x] Configurable connection thresholds with visual alarms and alert rule deep-linking

#### Phase 38: Dependency Security Hardening ✅
- [x] Upgraded `golang.org/x/crypto` to v0.45.0 (SSH handshake CVE fix)
- [x] Upgraded `github.com/quic-go/quic-go` to v0.57.0 (QUIC vulnerability fix)
- [x] 3 moderate-severity Dependabot alerts resolved
- [x] Full fleet redeployment with MD5 integrity verification

#### Phase 39: Application Security Hardening ✅
- [x] Bcrypt password hashing (cost 12) with automatic plaintext migration
- [x] JWT secret loaded from `JWT_SECRET` environment variable
- [x] API key authentication (`X-Agent-Secret`) for all ingestion endpoints
- [x] IP Intelligence routes secured with admin authentication
- [x] CORS hardened: removed wildcard origin, added `DELETE` method and `X-Agent-Secret` header
- [x] `crypto/rand` replaces `math/rand` for all security-sensitive random generation
- [x] Hardcoded InfluxDB token fallback removed (fatal if `INFLUX_TOKEN` unset)
- [x] Production `.env` file with `600` permissions and `EnvironmentFile` in systemd

#### Phase 40: Service Auto-Discovery & Multi-Format Log Parsing ✅
- [x] Path-based service type inference (`inferServiceType()`) for auto-discovered logs
- [x] Caddy JSON access log parser in server ingestion handler
- [x] Traefik CLF access log parsing with web service detection
- [x] Web server detail pages verified (Nginx, Caddy, Traefik, Apache — 9,475+ access log entries)
- [x] Service categorization UI support for Caddy/Traefik (Web Servers) and ClickHouse/InfluxDB (Databases)
- [x] MySQL detail page metrics (Active Connections, QPS, Slow Queries, I/O Stats)
- [x] PostgreSQL detail page metrics (TPS, Cache Hit Ratio, Index Usage, Slow Queries)
- [x] MongoDB detail page metrics (Ops/sec, Connections, Profiling, Collection Stats)
- [x] MySQL `performance_schema` integration for index usage and I/O analysis
- [x] PostgreSQL `pg_stat_statements` integration for slow query analysis
- [x] MongoDB Database Profiler integration for operation analysis
- [x] Agent-side payload enhancement to support diagnostic flags
- [x] Frontend diagnostic sections (`TablesWithoutIndexes`, `HighIOTables`, `SlowQueries`)
- [x] Redis detail page metrics (fixed host parameter passing & ghost dashboard)
- [x] ClickHouse dedicated detail page with system metrics (`ClickHouseDetail.jsx`)
  - HTTP-based collector with Basic Auth, querying `system.metrics`, `system.events`, `system.parts`
  - Verified: 714M rows, 23 GB storage, 337K inserts, 15K selects tracked
- [x] InfluxDB dedicated detail page with internal metrics (`InfluxDBDetail.jsx`)
  - Prometheus `/metrics` parser with NaN/Inf safety guards
  - Verified: 154K queries, 1,227 goroutines, 5h uptime tracked
- [x] PM2 process monitoring collector and frontend (`PM2Detail.jsx`)
  - Agent collector parses `pm2 jlist` for CPU, memory, uptime, restarts
  - Route registered in `ServiceDetail.jsx`

#### Phase 41: Observability & Security Enhancements ✅
<details>
<summary>Phase 41 — Observability & Security Enhancements</summary>

- [x] Resource speedometer gauges (CPU, RAM, DISK)
  - Custom SVG-based `SpeedometerGauge.jsx` component with animated needle, color-coded zones (green/amber/red), glow effects
  - Integrated into Dashboard (System Vitals panel), CPU, Memory, and Storage pages
  - Smooth cubic easing animations on value transitions
- [x] Webhook URL masking (click-to-reveal) in Settings
  - URLs masked by default (showing only domain + first path segment)
  - Eye icon toggle to reveal/hide full URL, plus copy-to-clipboard button
- [x] Browser notification system
  - `NotificationContext` provider with browser Notification API integration
  - `NotificationBell` dropdown in TopBar with unread badge, notification feed, severity badges
  - Backend `GET /api/v1/alerts/fired` endpoint querying ClickHouse `alerts` table
  - Polls `/api/v1/alerts/fired` every 15 seconds for new alert events
  - In-app notification feed (max 50 items) with mark-as-read, clear all
  - Settings panel with separate controls for in-app vs. browser push notifications
  - Secure context awareness: browser push requires HTTPS, in-app bell works on HTTP
  - Test notification button in Settings → Browser Notifications
- [x] HTTPS/TLS support
  - Self-signed certificate generation with SAN (Subject Alternative Name) for IP
  - Server auto-detects `certs/server.crt` and `certs/server.key`, falls back to HTTP
  - `r.RunTLS()` with graceful fallback to `r.Run()`
  - Agent HTTP clients configured with `InsecureSkipVerify` for self-signed certs
  - CORS updated to allow both `http://` and `https://` origins
  - Full fleet migration: all agents updated to `https://` server URLs
- [x] Mobile-native dashboard (PWA)
  - Progressive Web App: `manifest.json`, service worker with offline caching, app icons (192/512)
  - `index.html` with PWA meta tags: `viewport-fit=cover`, `apple-mobile-web-app-capable`, theme-color
  - Responsive Layout: slide-in sidebar drawer with hamburger menu on mobile
  - Mobile bottom navigation bar with 5 key pages (Home, Servers, Logs, Alerts, Settings)
  - Glassmorphism bottom nav with backdrop blur, safe-area inset support for notched devices
  - Touch-optimized CSS: larger tap targets, `-webkit-overflow-scrolling`, active states instead of hover
  - Responsive speedometer gauges using `viewBox` scaling
  - Responsive grid system for metric cards (2-column on mobile)
  - Server-side PWA asset routes: manifest.json, sw.js, icons served as explicit static files
  - Standalone display mode with iOS status bar handling

</details>

#### Phase 42: Custom Historical Date/Time Filtering & Paginated Alert History ✅
- [x] Introduced a universal `TimeRangeSelector` component to handle custom historical boundaries
- [x] Integrated the Custom Time Range selector across all service detail views and system metrics
- [x] Built a native Alert History tab on the primary Alerts Dashboard
- [x] Implemented high-performance frontend pagination matching a 1000-limit fetch from ClickHouse
- [x] Added `ParseTimeRange` utility in the Go backend
- [x] Wrapped Alert History list in a fixed-height scrollable container

#### Phase 43: Service Detail Pages (Enhancements) ✅
- [x] ClickHouse: query log analysis, mutation tracking, replica lag alerts
- [x] InfluxDB: per-bucket write rates, cardinality tracking
- [x] PM2: live testing on Node.js host, restart alerting

### Upcoming

#### Architecture
- [ ] Extensible agent module loading
- [ ] SSH brute-force detection
- [ ] Automated IP blocking remediation

#### Integrations
- [ ] Kubernetes support
- [ ] Cloud provider metrics (AWS, GCP, Azure)

---

## 🙏 Acknowledgments

Built with ❤️ using:
- [ClickHouse](https://clickhouse.com/) - Fast columnar database
- [InfluxDB](https://www.influxdata.com/) - Time-series database
- [React](https://react.dev/) - UI library
- [Gin](https://gin-gonic.com/) - Go web framework

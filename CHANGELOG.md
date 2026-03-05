# Changelog

## [2.21.0] - 2026-02-17
### Added
- **Advanced Database Diagnostics**: Full support for deep monitoring of MySQL, PostgreSQL, MongoDB, and Redis.
    - **MySQL**: Performance Schema integration, slow query analysis, index usage stats.
    - **PostgreSQL**: `pg_stat_statements` integration, lock analysis, cache hit ratios.
    - **MongoDB**: Profiler integration, slow operation tracking, collection stats.
    - **Redis**: Key space analysis, slow log integration, largest keys detection.
- **Diagnostic UI**: New "Performance Diagnostics" section in service detail pages with dedicated visualizations.
- **Setup Guidance**: Interactive setup banners in the UI guiding users to enable necessary database configurations.

### Fixed
- **Redis Agent Payload**: Resolved a critical bug where `largest_keys` and `expensive_commands` were not being sent to the server.
- **UI Layout Stability**: Fixed sidebar scrolling issues and profile dropdown clipping bugs.
- **Documentation**: Comprehensive updates to README and User Guide for setting up database diagnostics.

## [2.20.2] - 2026-02-06
### Added
- **Log Dual-Write Persistence**: Updated the backend ingestion logic to ensure web logs (Apache/Nginx) are stored in both the structured metrics table (`access_logs`) and the searchable Log Explorer table (`logs`).
- **UI Service Normalization**: Implemented filters in both the Log Explorer dropdown and the Services Dashboard to hide legacy/duplicate service tags (e.g., `apache2`), standardizing on the canonical `apache` label.


### Fixed
- **Stale Production Assets**: Resolved an issue where UI changes were not appearing in production due to an outdated static asset bundle. Standardized the deployment protocol to require a full `dist/` rebuild and sync.
- **Backend Deployment Staleness**: Fixed a binary mismatch bug where the production server was running stale logic; implemented MD5-based verification for agent/server updates.


## [2.20.1] - 2026-02-06
### Fixed
- **Dark Mode Visibility**: Boosted `--text-muted` contrast (Slate-400 -> Slate-300) to improve secondary text legibility in ultra-dark environments.
- **Component Theming**: Refactored `Cpu.jsx` to use semantic theme tokens, eliminating hardcoded color classes.
- **Form UI Fix**: Corrected "white-on-white" text in Alerts and Silence modals by enforcing explicit dark backgrounds on native `<select>` options.
- **Chart Rendering**: Increased area chart fill opacity to 40% for better visibility against absolute black backgrounds.

## [2.20.0] - 2026-02-05
### Added
- **Dynamic Theme System (Phase 98)**: Launched fully dynamic Light/Dark mode support. The system uses RGB-channel CSS variables to allow Tailwind's opacity modifiers to work across themes.
- **Theme Selection Persistence**: Integrated `ThemeContext` with `localStorage` and system preference detection.
- **Visual Token Engine**: Replaced all hardcoded color classes (`text-white`, `bg-black/40`) with theme-aware tokens (`text-cyber-text`, `glass-panel`).

### Fixed
- **Light Mode Visibility**: Refactored `StatCard`, `Services`, `Logs`, and `Dashboard` to ensure readability and contrast in the new light theme, resolving multiple "white-on-white" regressions.

## [2.19.11] - 2026-02-03
### Added
- **SQL Injection Remediation**: Hardened the `/api/v1/services/:service/access-logs` endpoint by implementing strict integer validation and sanitization for the `limit` parameter.
- **ClickHouse Connection Resilience**: Implemented exponential backoff retry logic in the backend to handle database container startup races during system reboots.
- **GeoIP Integration**: Fully deployed the `GeoLite2-City.mmdb` forensic engine, enabling geographic enrichment for Apache access logs.
- **Hybrid Log Monitoring**: Updated the Agent to support concurrent monitoring of system logs (`auth.log`, `kern.log`) and secondary Apache virtual host logs.

### Fixed
- **Git History Sanitization**: Successfully scrubbed all legacy credentials and sensitive configuration files from the repository's history across all 4 production branches.
- **Log Duplication (Process Overlap)**: Resolved the 2x log count bug by identifying and terminating orphaned manual agent processes that conflicted with the managed `systemd` service.
- **Auto-Schema Provisioning**: Added automatic creation of the `access_logs` table on server startup to resolve "invisible service" bugs on fresh deployments.

## [2.19.10] - 2026-02-05
### Added
- **Per-Interface Network Metrics**: Updated the Agent to collect granular traffic statistics (`BytesSent`, `BytesRecv`) for all detected network interfaces using `gnet.IOCounters(true)`.
- **Interface History Ingestion**: Enabled the Server to persist individual interface metrics into the InfluxDB `network_interface` measurement, allowing for high-fidelity historical bandwidth charting.
- **Fleet-Wide Deployment**: Successfully deployed the updated telemetry engine across the production fleet (`<SERVER_IP>`, `77.42.84.21`, `77.42.67.214`).

### Fixed
- **Empty Network Charts**: Resolved the structural issue where the "Bandwidth History" graph remained blank due to missing agent-side counter telemetry.
- **UI Data Formatting**: Implemented a decimal precision formatter in the Recharts tooltip, rounding bandwidth rates to two decimal places (e.g., `886.78 KB/s`) for improved readability.
- **X-Axis Time Visibility**: Enabled the X-Axis on the network bandwidth chart with a locale-aware `tickFormatter` to display timestamps (HH:MM:SS AM/PM).
- **Chart Date Consistency**: Standardized all telemetry timestamps on **ISO 8601** strings across both Live and Historical modes, fixing the "Invalid Date" bug in the live graph view.
- **Repository Hygiene**: Scrubbed the Git history to remove accidental binary and archive commits (`dist.tar.gz`), ensuring a lean repository state.

## [2.19.9] - 2026-02-04
### Fixed
- **Alert Threshold Scaling**: Fixed a unit mismatch where Network and Disk rates were being evaluated in MB/s against Byte-based thresholds. All rates are now normalized to Bytes/s before rule evaluation.

## [2.19.8] - 2026-02-04
### Added
- **Expanded Network Alerting**: Added support for monitoring "Net Upload" and "Net Total" bandwidth rates in the Rule Engine. 
- **Bandwidth Aggregation**: Backend now automatically calculates aggregate throughput (Total = Recv + Sent) for threshold matching.

## [2.19.7] - 2026-02-04
### Added
- **Alert Rule Editing**: Implemented full CRUD support for alert rules. Operators can now modify existing rule thresholds, metrics, and notification channel assignments using the new "Edit" interface.
- **Update API Endpoint**: Added `PUT /api/v1/alerts/rules/:id` to support granular rule modifications.

## [2.19.6] - 2026-02-04
### Fixed
- **Alert Silencing Hardening**: Implemented normalization (trimming) and wildcard defaulting for hostname inputs in both backend and frontend handlers to prevent silencing bypasses caused by whitespace or empty fields.

## [2.19.5] - 2026-02-04
### Added
- **Alert Context Enrichment**: Alert messages now include the server's Public and Private IP addresses to facilitate immediate host identification.
- **Optimized Rate Limiting**: Reduced the alert cooldown from 5 minutes to 1 minute to provide more timely updates while still preventing notification flooding.

## [2.19.4] - 2026-02-04
### Added
- **Alert Rate Limiting**: Implemented a 5-minute cooldown period per rule/host combination to prevent alert flooding during sustained threshold breaches.
- **Rich Message Formatting**: Transitioned to structured, multi-line alert messages including Rule name, Server, Metric value, and Threshold details for improved readability.

### Fixed
- **Silencing Logic Refinement**: Hardened the suppression engine to correctly handle both host-specific and wildcard ("*") silence expirations.
- **Service Stability**: Restored legacy compatibility methods in the Alert Service to prevent ingestion-path regressions.

## [2.19.3] - 2026-02-04
### Fixed
- **Webhook Compatibility**: Implemented a universal payload format supporting Discord (`content`), Slack, and MS Teams (`text`).
- **Alert Dispatch Logging**: Added detailed error reporting for failed webhook deliveries, including capture of remote API error messages.
- **Import Resolution**: Fixed a binary compilation issue by adding the missing `io` import required for webhook response reading.

## [2.19.2] - 2026-02-04
### Added
- **Alert Rule Toggling**: Implemented a state-flip mechanism for alert rules, allowing operators to temporarily disable/enable monitoring without deleting rules.
- **Toggle API Endpoint**: Added a new administrative endpoint `POST /api/v1/alerts/rules/:id/toggle` to safely update rule states.

### Fixed
- **Alert Creation Logic**: Resolved the "New Rule Disabled" bug where newly created alerts were defaulting to a disabled state. New rules are now explicitly enabled upon creation to ensure immediate monitoring.
- **Interactive Badge Controls**: Refactored the Alerts HUD status badges into clickable toggle buttons for improved operational efficiency.

## [2.19.1] - 2026-02-04
### Fixed
- **Startup Stability**: Resolved a critical server panic caused by a duplicate route definition for the MFA disable endpoint in the routing table.

## [2.19.0] - 2026-02-04
### Added
- **Extensible Alerting Engine**: Transitioned from hardcoded monitoring to a generic, user-configurable rule engine for all telemetry metrics.
- **Pluggable Notification Channels**: Implemented a modular backend for routing alerts to heterogeneous destinations including Webhooks (Discord/Slack) and SMTP Email.
- **Host-Specific Silencing**: Introduced a sophisticated alert suppression system allowing operators to "Silence" specific rules per host for defined durations (15m to 3 days).
- **Alert Management Dashboard**: Launched `Alerts.jsx`, a high-fidelity HUD for CRUD operations on rules and channels with integrated silencing controls.
- **Asynchronous Dispatch**: Notification delivery is execution in background Goroutines to ensure ingestion API performance remains consistent under high alert volume.

## [2.18.40] - 2026-02-04
### Added
- **Historical Network Analytics**: Implemented multi-tier historical visualization for the infrastructure network dashboard supporting ranges from 1 hour to 7 days.
- **Dynamic Influx Aggregation**: Introduced an auto-scaling aggregation window (10s to 1h) in the backend to ensure interactive performance across large time ranges.
- **Dual-Mode Dashboard**: Updated `Network.jsx` to support seamless switching between "Live" real-time polling and "Historical" aggregated trends.

### Fixed
- **Multi-Agent Metric Blending**: Strictly enforced host-context isolation in network history queries, resolving the issue where metrics from different nodes were interleaved in the chart.
- **Historical Scaling**: Implemented correct unit conversion for InfluxDB-sourced rates (B/s to KB/s) for consistent display with real-time telemetry.
    
## [2.18.35] - 2026-02-04
### Fixed
- **Log Duplication Finality**: Identified and documented the root cause of persistent 2x log duplication as process overlap between systemd-managed agent and manual nohup instances. Established a service-centric deployment protocol.

## [2.18.34] - 2026-02-04
### Fixed
- **Startup Display**: Removed duplicate "Targeting X log sources" print statement in `agent/main.go`.
- **Log Duplication Analysis**: Documented the "Logical Duplication" edge case where Apache logs to multiple distinct files.
- **Troubleshooting Instrumentation**: Added a debug trace to the log sender loop in `main.go` to explicitly monitor log-send frequency across the agent-server boundary. This enables diagnostic isolation between agent-side double-reading and server-side double-ingestion.

## [2.18.33] - 2026-02-04
### Added
- **Docker Path Exclusion**: Implemented explicit exclusion of `/var/lib/docker` and `.json.log` directory/file patterns in the agent's discovery engine to prevent 2x duplication of containerized logs.

## [2.18.32] - 2026-02-04
### Added
- **Docker Log De-duplication**: Identified and implemented a fix for the 2x log count duplication caused by overlapping Docker Engine API streaming and host-side JSON log tailing.
- **Cross-Host Identity Verification**: Enhanced deployment procedures to include `hostname` and `IP` verification for multi-agent environments.

## [2.18.31] - 2026-02-04
### Added
- **Deployment Integrity Audit**: Introduced MD5/Checksum verification protocols to detect mismatches between local patched source code and remote running binaries.
- **Binary Staleness Detection**: Documented diagnostic patterns for identifying when deployment failures (e.g. "Text file busy") cause the agent to run outdated logic despite source-level fixes.

## [2.18.30] - 2026-02-04
### Added
- **Verbose Log Discovery**: Removed log truncation (5-line limit) during agent startup to allow auditing of all targeted sources.
- **Clean Startup Protocol**: Implemented procedures for clearing log pollution (heartbeat/connection errors) to improve visibility of system initialization.

## [2.18.29] - 2026-02-04
### Added
- **Canonical Path Deduplication**: Transitioned Agent log tailing to use `filepath.EvalSymlinks`, preventing duplicate tailers for symlinked log files (e.g., vhost overlaps).

## [2.18.28] - 2026-02-04
### Added
- **Alert History Ingestion**: Introduced persistent storage for all system and security alerts. Events are now saved to the `vastlogs.alerts` ClickHouse table with a 30-day retention policy.
- **DDL Validation**: Implemented automatic schema provisioning for the Alerts table on server startup.

## [2.18.27] - 2026-02-04
### Added
- **Global Mutex Serialization**: Protected ClickHouse driver operations with `sync.Mutex` to eliminate concurrent-access segmentation faults.
- **Unit Scaling Correction (Network)**: Implemented proper conversion between Agent (MB/s) and Frontend (B/s, KB/s) for accurate bandwidth reporting.

### Fixed
- **Infrastructure Auth Gaps**: Added missing Authorization headers to CPU, Memory, Storage, and Network detail pages, resolving 401 Unauthorized errors.
- **Apache Service Discovery**: Refactored the discovery query to include `access_logs`, restoring visibility for web services in the filter dropdown.

## [2.18.26] - 2026-02-04
### Added
- **Database Thread Safety (sync.Mutex)**: Implemented global mutex serialization in the `LogStore` to prevent segmentation faults (`SEGV`) caused by concurrent access to the ClickHouse Go v2 driver.
- **Hybrid Service Discovery (Parallel Query Path)**: Refactored `GetUniqueServices` to execute independent queries for `vastlogs.logs` and `vastlogs.access_logs`, ensuring reliable discovery of Apache/Nginx services even when driver-level SQL binding for `UNION` fails.
- **ClickHouse Health Diagnostics**: Documented recovery procedures for `TOO_MANY_PARTS` (Code 252) and `MEMORY_LIMIT_EXCEEDED` (Code 241) errors.

### Fixed
- **Zombie Process Conflict**: Resolved "Phantom API" issues by implementing precision process termination during deployment.
- **Deployment Resilience**: Added safeguards against "Text file busy" errors by ensuring services are fully stopped before binary replacement.

## [2.18.25] - 2026-02-03
### Added
- **Database Connection Resilience**: Implemented exponential backoff retry logic (5 attempts) for ClickHouse connections to handle container startup races.
- **Auto-Schema Provisioning**: Added automatic creation of the `access_logs` table during server initialization to fix "invisible service" bugs.
- **Timezone-Aware Queries (UTC Pattern)**: Hardened the `HandleGetAccessLogs` and related handlers to use `time.Now().UTC()` when calculating duration-based search ranges, eliminating discrepancies between server/database timezones.
- **Multi-Site Discovery (Port 8016)**: Explicitly enabled monitoring for custom Apache virtual host logs (`void-runner-access.log`) to provide visibility for non-standard port traffic.
- **Professional QA Framework**: Transitioned from bash-based tests to a structured Go testing framework using `testify` and `suite` for robust API validation.
- **Comprehensive API Test Suite**: Implemented 10 automated test cases covering authentication, metrics, logs, service stats, and security (SQL injection protection).
- **Manual UI Testing Governance**: Established a 44-point manual checklist for high-fidelity frontend verification.
- **Local Test Execution**: Optimized the testing pipeline for local execution with colorful, formatted reporting via `./run-tests.sh`.

### Fixed
- **Critical SQL Injection**: Sanitized the `limit` parameter in the Access Logs API by implementing integer validation and safe formatting.
- **Credential Stewardship**: Replaced hardcoded secrets in `docker-compose.yml`, `server-config.json`, and `.env` with environment variables.
- **Git History Sanitization**: Successfully scrubbed legacy credentials from the repository history.

## [2.17.12-alpha] - 2026-02-02
### Added
- **Granular Location Forensics**: Exposed City and Region (State) data in the "Top Client IPs" dashboard.
- **Enhanced Ingestion API**: Updated the `service/top-ips` endpoint to aggregate and return city/region metadata alongside request counts.

### Fixed
- **IP Context Gap**: Resolved the issue where operators could see the country of origin but not the specific city or state for high-volume traffic.
- **Geo-Flickering**: Resolved a non-deterministic aggregation bug where geographic data would toggle between a name and "Unknown". Specifically, switched ClickHouse aggregation from `any()` to `max()` to prioritize non-empty metadata fields.

## [2.17.11-alpha] - 2026-02-02
### Added
- **Production GeoIP Enrichment**: Fully integrated the `geoip` module into the log parsing pipeline. Incoming web logs are now automatically enriched with Country, City, and GPS coordinates.
- **Dynamic Schema Evolution**: Updated the `access_logs` ingestion struct and ClickHouse storage layer to support forensic geographic metadata.
- **MMDB Auto-Provisioning**: Established a remote deployment routine for `GeoLite2-City.mmdb` ensuring the forensic engine has access to high-fidelity IP intelligence.

### Fixed
- **Missing Geo-Analytics**: Resolved the "Unknown Country" bug where IPs were ingested without geographic resolution due to missing fields in the storage struct.
- **Startup Sequence**: Ensured `geoip.Initialize` is called in the main application entry point to prevent silent lookup failures.

## [2.17.10-alpha] - 2026-02-02
### Added
- **Structured Log Parsing**: Implemented regex-based ingestion for Apache/Nginx logs, promoting generic text logs to the structured `access_logs` table.
- **Improved Regex Engine**: Deployed a production-hardened regex for Common Log Format, handling protocol quotes and preventing "greediness" match failures.
- **Mission-Critical Refresh (1s)**: Added a "1s" refresh option to the global `RefreshRateSelector`, enabling true real-time service monitoring.
- **Enhanced GeoIP Enrichment**: Verified that public IPs (8.8.8.8, etc.) are correctly mapped to geographic metadata in the forensic dashboards.

### Fixed
- **Type-Safe ClickHouse Scanning**: Resolved a critical "Unsupported conversion" bug where `UInt64` database columns failed to scan into Go `int64` variables. This fix covers Service Stats, Top IPs, and Geographic distribution endpoints.
- **Regex Off-by-One Logic**: Corrected an indexing error in the log parser where checking for 7 matches instead of 8 (including the full match) caused silent ingestion failures.
- **Cascading Disk Recovery**: Resolved a "No space left on device" failure in the InfluxDB WAL engine on the production host, restoring full metrics ingestion.
- **Backend Syntax Sanitization**: Cleaned up stray top-level declarations in the API handlers caused by rapid iterative patching.

## [2.17.2-alpha] - 2026-02-01
### Added
- **Service Detail Analytics**: Launched the first comprehensive monitoring dashboard for Apache/Nginx web servers (`ApacheDetail.jsx`).
- **Interactive Visualization Suite**: Implemented real-time charts for HTTP status distribution, request rates, and bandwidth throughput using Recharts.
- **Geographic Traffic Auditing**: Connected frontend visualizations to the GeoIP service, enabling localized traffic analysis by country and city.
- **Analytics API Layer**: Developed specialized backend handlers for service-specific stats, access logs, and client ranking forensics.
- **Dynamic Time Pivoting**: Introduced frontend time-range selectors (5m to 24h) to explore historical service behavior.

### Phase 3: MySQL Database Monitoring - 2026-02-01
- **Deep Observability Hub**: Launched `MySQLDetail.jsx` featuring real-time connection usage gauges, QPS trends, and slow query forensics.
- **Connection Auditing**: Implemented IP-based session tracking to identify top database consumers and potential security anomalies.
- **Forensic Query Tailing**: Added a multi-line parser for MySQL slow logs, capturing execution time, lock overhead, and rows examined.
- **Replication Tracing**: Introduced live monitoring for replication lag and master/slave role detection.
- **Engine Performance Widgets**: Developed new glassmorphic metrics for InnoDB buffer pool utilization and Query Cache hit rates.

### Phase 4-5: Expanded Database & Cache Support - 2026-02-01
- **Multi-Engine Dashboards**: Launched `PostgreSQLDetail.jsx`, `RedisDetail.jsx`, and `MongoDBDetail.jsx` with specialized glassmorphic widgets.
- **Relational Forensics**: Implemented `PostgreSQL` monitoring with `pg_stat_activity` introspection and transaction lock auditing.
- **Memory Intelligence**: Introduced `Redis` telemetry for fragmentation ratios, keyspace hit rates, and forensic slowlog extraction.
- **NoSQL Insights**: Launched `MongoDB` observability featuring document density counters and operation-type breakdown (Queries vs Updates).
- **Backend Collector Suite**: Completed the Go-based collector library with optimized drivers for `Postgres`, `Redis`, and `MongoDB`.

## [2.17.1-alpha] - 2026-02-01
### Added
- **Deep Service Monitoring (Phase 2)**: Initiated the "Deepest Implementation" strategy starting with Web Server engines.
- **Log-Based Forensics Engine**: Developed a specialized `WebServerCollector` in Go capable of parsing Combined Log formats and calculating real-time bandwidth/status-code distributions.
- **Geographic Enrichment Service**: Introduced a server-side `GeoIPService` powered by MaxMind, allowing the platform to correlate log events (Access logs, SSH logins) with global geographic metadata (Country, City, Lat/Long).
- **Service Analytics Collectors**: Established a new modular directory `agent/collector/services/` for engine-specific collection logic.
- **Private IP Guard**: Integrated RFC 1918 awareness into the GeoIP service to accurately identify "Local" traffic and prevent API noise from internal network lookups.

## [2.17.0-alpha] - 2026-02-01
### Added
- **Per-Service Detail Framework**: Established the foundation for deep-dive monitoring of specific application services (MySQL, Postgres, Nginx, etc.).
- **Dynamic Detail Routing**: Implemented `/services/:serviceName` route and a modular `ServiceDetail.jsx` dashboard shell.
- **Analytical Storage Layer**: Created 8 specialized ClickHouse tables (with monthly partitioning and TTL) for structured service telemetry.
- **Monitoring UI Kit**: Developed a reusable component library for service analytics:
    - **`StatCard`**: High-density metric display with neon utilization bars and trend arrows.
    - **`ChartPanel`**: Uniform container for time-series service charts.
    - **`TimeRangeSelector`**: Standardized period filtering (5m to 7d).
    - **`RefreshRateSelector`**: Real-time polling control for service dashboards.
- **Service Navigation Hub**: Updated the global Services page to drill down into engine-specific monitoring views.

## [2.16.3-alpha] - 2026-02-01
### Fixed
- **Firewall Parser Precision**: Refined the `iptables` parser to filter out generic Docker isolation rules (0.0.0.0/0 targets).
- **Accurate IP Categorization**: Blocked/Allowed IP tabs now only display rules targeting specific/non-generic IP addresses, eliminating "count bloat" and false positives.
- **Source Tracking**: Added support for extracting source and destination IP columns from raw `iptables` output.

## [2.16.2-alpha] - 2026-02-01
### Fixed
- **Multi-Stack Firewall Fallback**: Updated the agent to check `iptables` rules when UFW is installed but reported as "inactive".
- **Rule Detection Accuracy**: Verified that manual IP blocks (DROP) are correctly captured and categorized on systems with disabled UFW.

## [2.16.1-alpha] - 2026-02-01
### Fixed
- **Firewall Parser (Iptables)**: Resolved an issue where Chain/Header lines were causing massive rule counts (5000+).
- **Rule Extraction**: Improved port detection for `dpt` and `dpts` patterns and added protocol mapping.

## [2.16.0-alpha] - 2026-02-01
### Added
- **Firewall Intelligence Hub**: Refactored the Security page with an interactive firewall auditing interface.
- **Rule Normalization Parser**: Implemented a frontend parser to structure telemetry from UFW and Iptables shell output into an interactive data model.
- **Categorised Rule Filtering**: Introduced filter tabs for Blocked IPs, Allowed IPs, Allowed Ports, and Blocked Ports with real-time count badges.
- **Security Action Badges**: Added color-coded status indicators (ALLOW/DENY) for rapid threat assessment.

## [2.15.1-alpha] - 2026-02-01
### Changed
- **Services Page UX Refinement**: Separated Infrastructure (hosts) from application Services. Removed the "Infrastructure" category from the Services dashboard to eliminate redundancy with the TopBar host selector and improve UI professionalism.
- **Host Source Filtering**: Integrated `HostContext` into the Services dashboard. The UI now respects the global SOURCE selector, filtering displayed services to match the selected host (or displaying all when "ALL SYSTEMS" is selected).
- **Categorization Tuning**: Updated log discovery heuristics to focus exclusively on Web Servers, Databases, and custom application services.
### Added
- **Optional API Authentication**: Implemented a backward-compatible security middleware controlled by the `AUTH_ENABLED` environment variable.
- **Role-Based Middlewares**: Introduced `user` and `admin` API routes with optional JWT enforcement.
- **Backend API Protection**: Secured all user-facing data retrieval and administrative endpoints against direct API scraping.

## [2.14.4-alpha] - 2026-01-29
### Added
- **Multi-Virtual-Host Monitoring**: Expanded the agent's Apache collector to support monitoring for `void-runner` and other virtual host logs.
- **Enhanced Log Filtering**: Implemented UI-level filtering for internal discovery tags (`filesystem_scan`, `process_open_file`) to provide a cleaner dashboard experience.
- **Service Filter Fix**: Resolved a critical race condition in the Log Explorer that caused deep-linked filters to reset during host switching.

## [2.14.0-alpha] - 2026-01-29
### Added
- **Cross-Page Deep-Linking**: Implemented URL parameter parsing in the Log Explorer to allow instant drill-down from the Services Dashboard.
- **Smart Log Tagging**: Added heuristic tagging for manually selected logs in the agent, ensuring correct service categorization.
- **Service Tag Propagation**: Fixed a core agent bug where service names were not correctly passed to the log tailing engine.

## [2.13.0-alpha] - 2026-01-28
### Added
- **Services & Integrations Hub**: A new dashboard module for high-level monitoring of detected services categorized by role (Database, Web, Infrastructure).
- **Integration Wizard**: An interactive UI for generating agent configurations for Nginx, Apache, PM2, and custom logs.
- **Hybrid Service Discovery**: Backend optimization that merges log-providing services with live container metrics to ensure 100% fleet visibility.

## [2.12.0-alpha] - 2026-01-27
### Added
- **Administrative Host Removal**: Implemented a `DELETE /api/v1/hosts` endpoint and persistent `IgnoredHosts` list in backend storage to allow administrators to hide decommissioned nodes.
- **Real-Time Offline Detection**: Enriched Discovery API with `LastSeen` timestamps. The UI now renders a 🔴 status and "[OFFLINE]" label for nodes inactive for >60 seconds.
- **Frontend Management UI**: Added a removal (Trash) icon to the Infrastructure grid and integrated color-coded status indicators into the global Source Selector.

## [2.11.0-alpha] - 2026-01-27
### Added
- **Enriched Host Discovery**: Upgraded the Discovery API and storage layer to retrieve and parse primary IP addresses from interface telemetry. The frontend now displays `Hostname (IP)` in the source selector for improved fleet visibility.
- **Improved Context Initialization**: Optimized the `HostContext` auto-selection logic to handle structured host objects and ensure reliable default host assignment on first load.
- **Mass Agent Synchronization**: Rebuilt and redeployed the latest optimized agent binary to all nodes in the fleet (`<SERVER_IP>`, `77.42.84.21`, `77.42.67.214`), ensuring 100% version parity across monitored clusters.
- **Backend Service Migration**: Established `vastlogs-server.service` on the main hub for managed persistence and automatic recovery.
- **Disk I/O Bug Fix**: Resolved a critical telemetry regression where `disk_write_rate` and `disk_read_rate` were reporting 0 due to incorrect JSON tag mapping in the `DiskIOCounters` collector.

## [2.10.0-alpha] - 2026-01-27
### Added
- **Asynchronous Data Decoupling**: Fully decoupled `CollectRaw` (top binary) from the 1s agent heartbeat using `atomic.Value` storage. This ensures 1s telemetry rigor even on heavily loaded systems where `top` execution might exceed the loop interval.
- **Deployment Resilience**: Established mandatory post-SCP delays to resolve "Text file busy" race conditions during automated fleet updates.
- **Environment Configuration**: Standardized `SERVER_URL` via environment variables/systemd units to reliably direct remote agents to the central ingestion hub.
- **Service Standardization**: Successfully migrated the entire fleet (`fusionpbx`, `worker-node-1`, and the `VaSTLogs-server`) to managed `systemd` services. This ensures persistent observability and automatic recovery across all monitored infrastructure.
- **Fleet Verification**: Confirmed 1s-accurate terminal refreshes and consistent environment-driven routing (`SERVER_URL`) across all active nodes as of Jan 27.

## [2.9.0-alpha] - 2026-01-25
### Added
- **Tiered Metric Collection**: Optimized the Go Agent to maintain 1s dashboard responsiveness by caching heavy hardware scans (Partitions, Interfaces) and refreshing them only every 10 ticks (10s).
- **Frontend Cache Busting (v2.8.1)**: Finalized deployment of timestamp-based URL parameters to eliminate stale metrics caused by browser GET caching.
- **Performance HUD**: Verified the "Live Terminal" (top) now updates with sub-second latency on the distributed fleet.
- **Fleet-Wide Deployment**: Initiated rollout of optimized agent binaries across the multi-node infrastructure (`<SERVER_IP>`, `77.42.84.21`, `77.42.67.214`).

## [2.8.0-alpha] - 2026-01-25
### Fixed
- **Telemetry Refresh Rate**: Removed the legacy 5-second minimum refresh clamp in `Dashboard.jsx`, allowing true "1s Realtime" updates.
- **Cache-Busting Phase**: Implemented mandatory timestamp parameters (`_t=...`) for all frontend `fetch` calls to block browser GET caching of high-frequency telemetry data.

## [2.7.0-alpha] - 2026-01-25
### Fixed
- **UI Resilience**: Updated all resource monitoring pages (`Cpu.jsx`, `Storage.jsx`, `Memory.jsx`, `Servers.jsx`, `Security.jsx`) to use standardized JSON keys, resolving a total UI failure caused by recent API naming changes.
- **Security Dashboard**: Refined the `Security.jsx` threat-score logic and traffic history mapping to correctly handle the telemetry pipeline updates.
- **Deterministic Rendering**: Resolved build failures in `Cpu.jsx` by replacing impure `Math.random()` calls with deterministic generators, satisfying React purity requirements.
- **Code Integrity**: Fixed syntax errors and component corruption in `Servers.jsx` caused during the mass-standardization phase.

## [2.6.0-alpha] - 2026-01-25
### Changed
- **API Standardization**: Renamed core telemetry JSON keys in the backend (`cpu` -> `cpu_percent`, `mem` -> `memory_usage`, `disk` -> `disk_usage`) to establish a consistent schema between the Agent, Backend, and Frontend.

## [2.5.0-alpha] - 2026-01-25
### Fixed
- **Dashboard Accuracy**: Resolved "104GB Disk" over-counting bug by implementing a blacklist for virtual filesystems (`overlay`, `tmpfs`, `snap`) in the agent collector.
- **System Uptime**: Replaced hardcoded "2.8h" UI fallback with real kernel-sourced uptime telemetry from `gopsutil/host`.
- **Capacity Parity**: Corrected "Memory (Est)" and "Disk (Est)" labels in `Dashboard.jsx` to reflect actual total hardware capacities instead of hardcoded 16GB/200GB averages.

## [2.4.0-alpha] - 2026-01-24

### Added
- **Phase 23: Real-Time Storage Analytics (Completed)**:
    - **Agent**: Implemented `disk.IOCounters` collection for precise Read/Write IOPS and Throughput monitoring.
    - **Backend**: Updated InfluxDB schema and API handlers to persist and serve granular disk rates (MB/s).
    - **Frontend**: 
        - Replaced mock I/O graphs with a **Live Throughput Visualizer** powered by 15-minute telemetry history.
        - Implemented **Dynamic Unit Scaling** (GB/TB) for storage metrics to handle smaller cloud volumes accurately.
        - Connected "Read/Write IOPS" cards to real-time kernel metrics.
- **Phase 22: Live Terminal HUD (Completed)**:
    - Integrated direct `top -b` stream into the secondary HUD module.
    - Implemented robust unescaping logic on the frontend to handle double-escaped newline characters in JSON payloads.
    - Updated Dashboard layout with neon-accented system metrics (Uptime, CPU, Mem, Disk).

### Fixed
- **Emergency Disk Recovery**: Resolved a critical "0B Available" condition caused by ClickHouse `system.trace_log` bloat (31GB) and identified subsequent InfluxDB WAL write failures due to "ghost" disk exhaustion from leftover load test artifacts (~10GB).
- **Database Maintenance**: Applied a permanent **2-day Retention Policy (TTL)** to internal ClickHouse system logs and established a routine for purging stress-test files from `/root/`.
- **Frontend Formatting**: Fixed "Waiting for terminal output" stuck state by adding helper logic to unescape `\n` and `\\n` sequences.
- **History Data Integrity**: Fixed "Empty Graph" issue by assigning the `Timestamp` field in the backend Flux query response loop.
- **Chart Precision**: Corrected frontend slicing logic in `Storage.jsx` to ensure the most recent 60 telemetry points are visualized (fixing the "Zero-Load" stale view).
- **Deployment Safety**: Standardized build-exit-code verification and added mandatory synchronization delays (`sleep`) to resolve "Text file busy" race conditions during rapid updates.
- **Multi-Node Rollout**: Successfully verified the real-time telemetry pipeline across the distributed fleet (`<SERVER_IP>`, `77.42.67.214`, `77.42.84.21`), standardizing on `/opt/vastlogs` deployment paths and explicit `SERVER_URL` connection strings.
- **Connection Reliability**: Fixed a "Connection Refused" loop where remote agents defaulted to `localhost:8080`; implemented verified `SERVER_URL` environment injection.
- **Data Transit Diagnostics**: Identified silent metric loss between Agent and Server caused by both JSON tag mismatches and manual mapping omissions in the sender client; established payload instrumentation as a standard debugging procedure.
- **Storage Resilience**: Documented "Persistent Ghost Fullness" where InfluxDB WAL writes fail due to intermittent I/O pressure or inode exhaustion despite free disk space.
- **Code Optimization**: Successfully removed all instrumentation and debug logic (`fmt.Printf`) from the production agent and backend after verifying 1.3 GB/s throughput handling.

## [2.3.0-alpha] - 2026-01-22

### Added
- **Phase 15: Enhanced Telemetry (Completed)**:
    - **Active Process Monitoring**: Integrated `ProcessCollector` (gopsutil) for real-time pid/user/cpu/mem snapshots.
    - **Security Firewall Auditing**: Added `FirewallCollector` for UFW/Iptables rule transparency.
    - **ClickHouse Schema Expansion**: Implemented `ReplacingMergeTree` for process snapshots and `MergeTree` for firewall logs.
    - **Precision Logs**: Updated UI to display full Date and Time in log entries for better forensic correlation.
- **Phase 14: Advanced Search (Completed)**:
    - Backend: Refactored `QueryLogs` to `QueryLogsAdvanced` with a robust `LogFilter` struct.
    - Frontend: Implemented client-side query string parser and UI syntax helper tooltip.
    - Verified filter coverage: `host:`, `level:`, `service:`, `before:`, `after:`, `order:`.
- **Repository Maintenance**: Pruned non-standard binary artifacts (`vastlogs-agent`, `vastlogs-server-bin`) from git tracking.
- **Phase 17: Specialized Resource Monitoring (Phase 1)**:
    - Ported high-fidelity UI from `vast-pulse` for dedicated CPU, Memory, Storage, and Network modules.
    - Implemented reusable glassmorphic widgets: `StatCard` and `ResourceChart`.
    - Integrated multi-node polling with `useHost` context across all resource sub-pages.
    - Added comprehensive Infrastructure/Servers overview with auto-deployment modal triggers.
- **Security**: Added zero-config password recovery instructions and verified authentication bootstrap.

### Fixed
- **Log Suppression (Refined)**: Transitioned from periodic logging to "Once per Session" suppression for Docker connection errors, ensuring total silence on non-Docker hosts while preserving the initial warning.
- **Deployment Locking**: Resolved "Text file busy" errors during SCP by implementing remote `pkill` checks prior to binary transfer.
- **Environment Variable Syntax**: Fixed `nohup` startup issues over SSH by using `export VAR=VAL;` syntax to ensure variables are correctly passed to background processes.
- **Multi-Node Deployment Verification**: Implemented MD5 checksum comparison between local and remote binaries to verify successful updates on worker nodes:
    - `77.42.84.21` (root) - Verified.
    - `77.42.67.214` (vastlogs) - Verified.

## [2.2.0-alpha] - 2026-01-19

### Added
- **Phase 14: Advanced Search (Drafted)**:
    - Designed unified search syntax (`host:`, `level:`, `service:`, `before:`, `after:`) inspired by Gmail.
    - Initiated backend refactoring for structured ClickHouse log queries.
- **Phase 13: UI Stability & Bug Fixes**:
    - Implemented `localStorage` persistence for host selection.
    - Resolved "Stale Closure" bugs in `HostContext.jsx` by decoupling fetch and selection logic.
    - Silenced interactive agent log spam (CPU/Mem heartbeat) for cleaner system logs.
    - **Deployment**: Verified agent updates on remote nodes (`77.42.84.21`, etc.) using `/proc` binary discovery.
- **Phase 12: Integrated Agent Enrollment**:
    - Created a "Connect Agent" modal with dynamic installation commands.
    - Integrated API keys into the onboarding flow for zero-manual-config node attachment.
- **Phase 11: Production Hardening & UX Polish**:
    - Implemented Client-Side Pagination for large log sets (5000+ entries).
    - Ported universal refresh rate controls to the Log Explorer.
- **Phase 10: UX Enhancements & Log Intelligence**:
    - Added Log Export engine (CSV/JSON).
    - Implemented dynamic result limits (100-5000) for log queries.
    - Updated backend search to include host-based log filtering.

## [2.0.0-alpha] - 2026-01-19

### Added
- **Phase 9: Multi-Node Architecture**: 
    - Full support for distributed telemetry fleets.
    - Integrated Host Selector with reactive UI pivoting across all modules.
    - Multi-dimensional data isolation at the storage level (host tagging).

## [1.9.0-alpha] - 2026-01-18

### Added
- **Phase 8: Production Deployment**: Successfully deployed VaSTLogs to a remote Hetzner Cloud instance.
- **Single-Binary Backend**: Updated Go server to serve the React frontend directly via `gin-contrib/static`.
- **Remote Provisioning**: Automated server setup including Docker installation and directory initialization via SSH.
- **Artifact Sync**: Implemented release-build workflow and SCP-based deployment.
- **Security Hardening**: Hard-bound database dependencies (ClickHouse, InfluxDB) to `localhost` via Docker and implemented random admin password injection.
- **Frontend Connectivity Fix**: Refactored API client calls to use relative paths, resolving "Server Unreachable" errors in remote production environments.

## [1.8.0-alpha] - 2026-01-18

### Added
- **Phase 7: Modular Agent Configuration**: Implemented granular control over data collection. Users can now toggle System, Docker, Kubernetes, and App-specific (Nginx, PM2, Apache) collectors.
- **Permission-Aware Discovery**: Integrated `canRead` safety checks to filter out inaccessible log files, enabling stable non-root agent execution.
- **Service Detection Presets**: Added auto-discovery patterns for PM2, Nginx, and Apache configuration paths.
- **Enhanced Setup CLI**: Upgraded the `--setup` flow with an interactive configuration wizard for selective monitoring and manual log whitelisting.
- **Verificative Testing**: Added `agent/discovery/discovery_test.go` for robust validation of permission filtering and service detection logic.
- **Phase 6: Multi-Factor Authentication (MFA)**: Implemented TOTP integration on the backend and a QR-code based setup UI on the frontend.
- **Phase 6: Agent Enrollment Handshake**: Implemented interactive agent setup CLI (`--setup`) and server-side secret issuance.
- **Agent Configuration**: Introduced `agent-config.json` for persisting the `AgentSecret` and `ServerURL`.
- **Config Hardening**: Expanded `server-config.json` to support `AgentSecrets` map and `SystemAPIKey`.
- **Multi-Node Deployment Documentation**: Created a guide for connecting remote agents to the central VaSTLogs server.

## [1.6.0-alpha] - 2026-01-18

### Added
- **Authentication Framework**: Introduced `server/auth` package with JWT token generation and password hashing.
- **Middleware Integration**: Added `AuthRequired` middleware to secure sensitive API endpoints like `/settings` (POST).
- **Secrets Management**: Refactored the backend to support environment variables for sensitive configuration (InfluxDB URL/Token, ClickHouse DSN).
- **Auto-generated Admin Pass**: Server now generates a unique admin password on first run and persists it in `server-config.json`.
- **Full HUD Protection**: Elevated security by wrapping all sidebar modules (Dashboard, Logs, etc.) in `PrivateRoute` guards, ensuring 100% Zero-Trust for the operator interface.
- **Secure Login Portal**: Implemented a standalone sci-fi themed login interface with JWT storage and session handling.
- **Bearer Token Integration**: Updated frontend modules to inject Authorization headers for sensitive state-changing operations.

### Fixed
- **React Routing Regression**: Resolved a "Blank Screen" bug caused by a mismatch between nested routes and the `Layout` component's rendering logic (implemented `<Outlet />` support).

## [1.5.0-alpha] - 2026-01-18

### Added
- **Advanced Network Breakdown**: Completed the per-interface visualization feature. The platform now supports multi-series throughput graphs using InfluxDB derivatives for rate calculation and client-side data pivoting.
- **Stacked Area Visualization**: Implemented a stacked chart in Recharts to show both aggregate and granular traffic flow.
- **Live Interface HUD**: Added a real-time table for monitoring individual interface MB/s speeds.

## [1.4.0-alpha] - 2026-01-18

### Added
- **Branch Synchronization**: Successfully merged `feat/phase-5-settings` into `main` and initialized the Next-Gen Network Telemetry branch (`feat/phase-5-network`).
- **Phase 6 Roadmap Kickoff**: Transitioned focus to Advanced Telemetry (per-interface breakdown).

## [1.3.0-alpha] - 2026-01-18

### Added
- **Settings Module & Persistence**: Developed the Tactical Configuration UI and implemented a JSON-backed `ConfigStore` in the Go backend for persisting retention and security policies.
- **Feature Branch Workflow**: Adopted an isolated branching strategy (`feat/*`) for modular development, ensuring stability on the `main` branch.
- **Enhanced HUD Routing**: Fully integrated the Settings engine into the React Router configuration.
- **System Verification & Stability**: Formulated an End-to-End verification suite; identified and documented critical "Suspended Agent" edge cases related to background `sudo` execution.

## [1.2.0-alpha] - 2026-01-15

### Added
- **Repository Synchronization**: Synchronized the monorepo with the official remote repository (`git@git.vastites.com:vastites/Log-management-platform.git`).
- **Platform Stabilization**: Formalized startup procedures and created a root-level `README.md` for simplified multi-service orchestration.
- **Git Hardening**: Implemented a comprehensive `.gitignore` to protect sensitive local artifacts (SSH keys, database binaries, local logs).

## [1.1.0-alpha] - 2026-01-13

### Added
- **Full Module Implementation**
    - **Logs Module**: Implemented Log Search API with ClickHouse `ILIKE` support and a debounced React search interface.
    - **Infrastructure Module**: Designed and implemented a Grid-based Container Monitor with real-time hardware stats.
    - **Network & Security Modules**: Integrated `recharts` for time-series visualization and implemented the SOC threat-analysis dashboard.
- **Backend Time-Series Support**: Added `/api/v1/metrics/history` endpoint with Flux `aggregateWindow` downsampling for historical metrics.
- **Fixed Network Graph Data Flow**: Resolved a Flux query crash caused by string/numeric type mismatch during `mean` aggregation by implementing explicit numeric field filtering.
- **Modular UI Architecture**: Integrated `react-router-dom` and refactored navigation to support dedicated module pages.

## [1.0.0-alpha] - 2026-01-13

### Added
- **Core Infrastructure**
    - Initialized Monorepo structure (Agent, Server, Web).
    - Docker Compose setup for InfluxDB (Metrics) and ClickHouse (Logs).
    - Environment variable configuration system.
- **Backend (Go)**
    - InfluxDB V2 adapter for batch metric ingestion.
    - ClickHouse adapter for high-performance log storage.
    - REST API for ingestion hooks.
    - Query API for frontend consumption (pivot-based Flux queries).
- **Agent (Go)**
    - Zero-config startup with auto-discovery.
    - `/proc` filesystem walker for identifying active log files.
    - Recursive log tailer with file rotation support.
    - `gopsutil` integration for host telemetry.
    - **Log Auto-Categorization**: Regex-based parser for log levels.
    - **Container Monitoring**: Docker Socket integration for live container stats.
    - **DDoS Detection**: Heuristic engine for network spike detection (>50MB/s).
- **Frontend (React)**
    - Sci-Fi / Cyberpunk themed dashboard.
    - Real-time "Live Log Stream" and "Active Containers" widgets.
    - **Security Alert System**: Visual Red Alert banner for DDoS events.

### Fixed
- **Container Metric Deduplication**: Fixed Flux query grouping to handle state transitions correctly.
- **Missing Container Metadata**: Resolved regression in pivot logic that dropped name/image tags.

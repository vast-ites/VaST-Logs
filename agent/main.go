package main

import (
	"flag"
	"os"
    "fmt"
    "log"
    "time"
	"bufio"
    "path/filepath"
    "strconv"
	"strings"
	"encoding/json"
    "net/http"
    "net"
    "bytes"
    "sync/atomic"
    "context"
    "os/exec"

	"github.com/datavast/datavast/agent/collector"
	"github.com/datavast/datavast/agent/collector/services"
	"github.com/datavast/datavast/agent/discovery"
	"github.com/datavast/datavast/agent/sender"
    "github.com/datavast/datavast/agent/config"

    "github.com/datavast/datavast/agent/modules"
    _ "github.com/datavast/datavast/agent/modules/ssh_bruteforce"
)

func main() {
    setupMode := flag.Bool("setup", false, "Run interactive setup")
    hostFlag := flag.String("host", "", "Override Hostname")
    flag.Parse()

	fmt.Println("🚀 DataVast Agent Starting... [Sci-Fi Mode]")
    log.Println(">> DataVast Agent v2.21.0 (Phase 40 - Service Detection & Advanced Diagnostics)")
    
    // Load Config
    cfg, err := config.LoadConfig()
    if err != nil {
        // No config
        if *setupMode {
            runSetup()
            return
        }
        
        // Legacy/Env Fallback
        serverURL := os.Getenv("SERVER_URL")
        if serverURL == "" {
            serverURL = "http://localhost:8080"
        }
        fmt.Println(">> No config found. Using Fallback/Env URL:", serverURL)
        fmt.Println(">> Tip: Run './datavast-agent --setup' for secure enrollment.")
        
        cfg = &config.AgentConfig{
             ServerURL: serverURL,
        }
    } else {
        fmt.Println(">> Loaded Config for Agent:", cfg.AgentID)
    }

    // Hostname Override / Fallback
    if *hostFlag != "" {
        cfg.AgentID = *hostFlag
        fmt.Println(">> Hostname Overridden via Flag:", cfg.AgentID)
    } else if cfg.AgentID == "" {
        // Fallback to OS hostname if no config and no flag
        h, _ := os.Hostname()
        cfg.AgentID = h
        fmt.Println(">> Using OS Hostname:", cfg.AgentID)
    }

	// Default to enabled if not set (first run or legacy config)
    if cfg.Collectors == (config.CollectorConfig{}) {
        cfg.Collectors.System = true
        cfg.Collectors.Docker = true
        cfg.LogConfig.Mode = "all"
    }

	fmt.Println(">> Initializing Log Discovery...")
    var logs []discovery.DiscoveredLog
    
    if cfg.LogConfig.Mode != "none" {
        if cfg.LogConfig.Mode == "selected" {
            for _, path := range cfg.LogConfig.SelectedLogs {
                sourceType := "manual_selection"
                if strings.Contains(path, "apache") || strings.Contains(path, "httpd") { sourceType = "apache" }
                if strings.Contains(path, "nginx") { sourceType = "nginx" }
                if strings.Contains(path, "caddy") { sourceType = "caddy" }
                if strings.Contains(path, "traefik") { sourceType = "traefik" }
                if strings.Contains(path, "pm2") { sourceType = "pm2" }
                if strings.Contains(path, "mysql") { sourceType = "mysql" }
                if strings.Contains(path, "redis") { sourceType = "redis" }
                if strings.Contains(path, "mongodb") || strings.Contains(path, "mongod") { sourceType = "mongodb" }
                if strings.Contains(path, "postgresql") || strings.Contains(path, "postgres") { sourceType = "postgresql" }
                
                logs = append(logs, discovery.DiscoveredLog{Path: path, SourceType: sourceType})
            }
        } else {
            // 1. Add Enabled Service Logs (Priority)
            // specific sources come first so they win dedup race against generic scanners
            if cfg.Collectors.Apache { logs = append(logs, discovery.FindServiceLogs("apache")...) }
            if cfg.Collectors.Nginx { logs = append(logs, discovery.FindServiceLogs("nginx")...) }
            if cfg.Collectors.PM2 { logs = append(logs, discovery.FindServiceLogs("pm2")...) }

            // 2. Auto Discover "all" (Fallbacks)
            dLogs, err := discovery.FindLogs()
            if err != nil {
                log.Printf("Error discovering logs: %v", err)
            }
            logs = append(logs, dLogs...)
        }
    }
    
    // Always append manually selected logs (Custom Paths)
    for _, path := range cfg.LogConfig.SelectedLogs {
        sourceType := "manual_selection"
        if strings.Contains(path, "apache") || strings.Contains(path, "httpd") { sourceType = "apache" }
        if strings.Contains(path, "nginx") { sourceType = "nginx" }
        if strings.Contains(path, "caddy") { sourceType = "caddy" }
        if strings.Contains(path, "traefik") { sourceType = "traefik" }
        if strings.Contains(path, "mysql") { sourceType = "mysql" }
        if strings.Contains(path, "redis") { sourceType = "redis" }
        if strings.Contains(path, "mongodb") || strings.Contains(path, "mongod") { sourceType = "mongodb" }
        if strings.Contains(path, "postgresql") || strings.Contains(path, "postgres") { sourceType = "postgresql" }

        logs = append(logs, discovery.DiscoveredLog{Path: path, SourceType: sourceType})
    }
        
        // Dedup with Canonical Paths (Resolve Symlinks)
        seen := make(map[string]bool)
        var unique []discovery.DiscoveredLog
        for _, l := range logs {
            // Resolve Symlinks to catch /var/log/apache2 vs /etc/apache2/logs duplicates
            realPath, err := filepath.EvalSymlinks(l.Path)
            if err != nil {
                realPath = l.Path // Fallback
            }
            realPath = filepath.Clean(realPath)
            
            if !seen[realPath] {
                unique = append(unique, l) // Keep original struct but check unique realPath
                seen[realPath] = true
            }
        }
        logs = unique
    
    	fmt.Printf(">> Targeting %d log sources:\n", len(logs))
    	for _, l := range logs {
    		fmt.Printf("   [%s] %s\n", l.SourceType, l.Path)
    	}
    
    	// 2. Start Log Tailers
    	logChan := make(chan collector.LogLine, 100)
    	// Use Config URL/Secret
    	senderClient := sender.NewClient(strings.TrimSuffix(cfg.ServerURL, "/")+"/api/v1", cfg.AgentSecret, cfg.AgentID)
    
    	fmt.Println(">> Starting Log Tailers...")
    	for _, l := range logs {
    		go collector.TailFile(l.Path, l.SourceType, logChan)
    	}
    
    	// Log Sender Routine
    	go func() {
    		for l := range logChan {
    			if err := senderClient.SendLog(&l); err != nil {
    			}
    		}
    	}()
        
        // Keep definition of senderClient visible for below





	// 3. Start Metric Loop
    
    // Initialize Docker Collector
    var dockerCol *collector.DockerCollector
    if cfg.Collectors.Docker {
        dCol, err := collector.NewDockerCollector()
        if err != nil {
            log.Printf("Warning: Failed to initialize Docker Collector: %v", err)
        } else {
            fmt.Println(">> Docker Collector Initialized")
            dockerCol = dCol

            // --- Docker Log Streaming ---
            activeStreams := make(map[string]context.CancelFunc)
            go func() {
                for {
                    containers, err := dockerCol.ListRunningContainers()
                    if err != nil {
                        // Silent fail or debug log
                    } else {
                        seen := make(map[string]bool)
                        for _, c := range containers {
                            // Use Full ID for API, Short ID for Map
                            fullID := c.ID
                            shortID := fullID[:12]
                            seen[shortID] = true
                            
                            if _, ok := activeStreams[shortID]; !ok {
                                // New container
                                ctx, cancel := context.WithCancel(context.Background())
                                activeStreams[shortID] = cancel
                                
                                // Clean name
                                name := shortID
                                if len(c.Names) > 0 {
                                    name = strings.TrimPrefix(c.Names[0], "/")
                                }
                                
                                fmt.Printf(">> Starting Log Streamer for %s (%s)\n", name, shortID)
                                go func(cid, cname string) {
                                    dockerCol.StreamLogs(ctx, cid, cname, logChan)
                                }(fullID, name) 
                            }
                        }
                        
                        // Cleanup stopped
                        for id, cancel := range activeStreams {
                            if !seen[id] {
                                cancel()
                                delete(activeStreams, id)
                            }
                        }
                    }
                    time.Sleep(10 * time.Second)
                }
            }()
        }
    }

    // Initialize System Collector
    var sysCol *collector.SystemCollector
    if cfg.Collectors.System {
        sysCol = collector.NewSystemCollector()
        fmt.Println(">> Starting System Metrics Collector (1s interval)...")
    }

    // Initialize Connection Collector
    connCol := collector.NewConnectionCollector(strings.TrimSuffix(cfg.ServerURL, "/"), cfg.AgentID, cfg.AgentSecret)
    go connCol.Start()
    fmt.Println(">> Starting Connection Tracking (1s interval)...")
    
    // Initialize Enhanced Collectors (Process/Firewall)
    procCol := collector.NewProcessCollector()
    fwCol := collector.NewFirewallCollector()
    fmt.Println(">> Starting Enhanced Telemetry (30s interval)...")

	ticker := time.NewTicker(1 * time.Second)
    slowTicker := time.NewTicker(30 * time.Second) // For heavy tasks
	defer ticker.Stop()
    defer slowTicker.Stop()

    // Initial hydration
    go func() {
        if procs, err := procCol.Collect(); err == nil { senderClient.SendProcesses(procs) }
        if fw, err := fwCol.Collect(); err == nil { senderClient.SendFirewall(fw) }
    }()

    go func() {
        for range slowTicker.C {
            // Collect Processes
            if procs, err := procCol.Collect(); err == nil {
                if err := senderClient.SendProcesses(procs); err != nil {
                     log.Printf("Failed to send processes: %v", err)
                }
            }
            
            // Collect Firewall Rules (existing raw text)
            if fw, err := fwCol.Collect(); err == nil {
                if err := senderClient.SendFirewall(fw); err != nil {
                    log.Printf("Failed to send firewall: %v", err)
                }
            }

            // Firewall Sync: Parse actual blocked IPs from iptables and sync to server
            if blockedIPs, err := fwCol.CollectBlockedIPs(); err == nil {
                if err := senderClient.SendFirewallSync(blockedIPs); err != nil {
                    log.Printf("Failed to sync blocked IPs: %v", err)
                } else if len(blockedIPs) > 0 {
                    log.Printf(">> Synced %d blocked IPs to server", len(blockedIPs))
                }
            } else {
                log.Printf("Failed to collect blocked IPs: %v", err)
            }
        }
    }()

    // Start Service Collectors (MySQL, Redis, PostgreSQL, MongoDB, ClickHouse, InfluxDB)
    go startServiceCollectors(senderClient, cfg)

    // Start PM2 Collector (CLI-based, not TCP-probed)
    if cfg.Collectors.PM2 {
        go startPM2Collector(senderClient)
    }

    // Command Poll: Check for pending commands from server every 10s
    cmdTicker := time.NewTicker(10 * time.Second)
    defer cmdTicker.Stop()

    go func() {
        for range cmdTicker.C {
            cmds, err := senderClient.FetchCommands()
            if err != nil {
                // Silent fail - server may be unreachable
                continue
            }

            for _, cmd := range cmds {
                log.Printf(">> Executing command: %s on IP %s", cmd.Action, cmd.TargetIP)
                output, execErr := fwCol.ExecuteIPTablesCommand(cmd.Action, cmd.TargetIP)
                
                status := "completed"
                if execErr != nil {
                    status = "failed"
                    output = execErr.Error()
                    log.Printf(">> Command FAILED: %s", output)
                } else {
                    log.Printf(">> Command SUCCESS: %s %s", cmd.Action, cmd.TargetIP)
                }

                // Acknowledge
                if err := senderClient.AckCommand(cmd.ID, status, output); err != nil {
                    log.Printf("Failed to ack command %s: %v", cmd.ID, err)
                }
            }
        }
    }()

	// Start Extensible Modules
    fmt.Println(">> Initializing Extensible Module Plugins...")
    modCtx, modCancel := context.WithCancel(context.Background())
    defer modCancel()
    modules.StartAll(modCtx, cfg, senderClient)

	// 4. Async Process Raw Collection (Decoupled from Main Loop to prevent lag)
    var atomicProcessRaw atomic.Value
    atomicProcessRaw.Store("")

    go func() {
        if procCol == nil { return }
        for {
            // Run as fast as possible, but don't hog CPU. 
            // If top takes 0.2s, this runs ~5Hz. If it takes 1.5s, it runs ~0.6Hz.
            // Main loop will always pick up the latest available.
            raw, err := procCol.CollectRaw()
            if err == nil {
                atomicProcessRaw.Store(raw)
            } else {
               // Log error occasionally?
               atomicProcessRaw.Store("Error collecting raw process data: " + err.Error()) 
            }
            time.Sleep(500 * time.Millisecond) // Slight pause to be polite
        }
    }()

	var dockerErrorCount int
	for range ticker.C {
        var metrics *collector.SystemMetrics
        if sysCol != nil {
            // This is now fast (cached)
    		m, err := sysCol.Collect()
    		if err != nil {
    			log.Printf("Error collecting metrics: %v", err)
    		} else {
                metrics = m
            }
        }
        
        var containerMetrics []collector.ContainerMetric
        if dockerCol != nil {
            cMetrics, err := dockerCol.GetContainerMetrics()
            if err != nil {
                // Suppress Spam: Only log connection errors ONCE per session
				if dockerErrorCount == 0 {
                	log.Printf("Warning: Error collecting container metrics: %v (silencing future errors)", err)
				}
				dockerErrorCount++
            } else {
                containerMetrics = cMetrics
				dockerErrorCount = 0 // Reset on success
            }
        }
        
        // Only send if we have data or need heartbeat
        if metrics != nil || len(containerMetrics) > 0 {
    		// Send to Backend
            if metrics == nil { metrics = &collector.SystemMetrics{} }
            
            // Retrieve latest async raw data
            processRaw := atomicProcessRaw.Load().(string)
            
    		if err := senderClient.SendMetrics(metrics, containerMetrics, processRaw); err != nil {
    			log.Printf("Failed to send metrics: %v", err)
    		}
        }
	}
}

func runSetup() {
    reader := bufio.NewReader(os.Stdin)
    fmt.Println("\n=== DataVast Agent Enrollment ===")
    
    // 1. Server URL
    fmt.Print("Enter Server URL [http://localhost:8080]: ")
    url, _ := reader.ReadString('\n')
    url = strings.TrimSpace(url)
    if url == "" {
        url = "http://localhost:8080"
    }
    
    // 2. Hostname
    hostname, _ := os.Hostname()
    fmt.Printf("Agent Hostname [%s]: ", hostname)
    hostInput, _ := reader.ReadString('\n')
    hostInput = strings.TrimSpace(hostInput)
    if hostInput != "" {
        hostname = hostInput
    }

    // 3. System API Key
    fmt.Print("Enter System API Key: ")
    apiKey, _ := reader.ReadString('\n')
    apiKey = strings.TrimSpace(apiKey)
    
    // 4. Register
    fmt.Println("\n>> Contacting Server...")
    
    // Register Request
    reqPayload := map[string]string{
        "api_key": apiKey,
        "hostname": hostname,
    }
    
    resp, err := postRegister(url, reqPayload)
    if err != nil {
        log.Fatal("Registration Failed: ", err)
    }
    
    // Handle MFA
    if resp.StatusCode == http.StatusUnauthorized {
         // MFA Required
         fmt.Println(">> MFA REQUIRED: Please enter the code from your authenticator app.")
         fmt.Print("MFA Code: ")
         mfaCode, _ := reader.ReadString('\n')
         mfaCode = strings.TrimSpace(mfaCode)
         
         reqPayload["mfa_code"] = mfaCode
         resp, err = postRegister(url, reqPayload)
         if err != nil {
             log.Fatal("Registration Failed: ", err)
         }
    }
    
    if resp.StatusCode != http.StatusOK {
        log.Fatalf("Registration Failed: Status %s", resp.Status)
    }
    
    // Success
    var result struct {
        AgentID string `json:"agent_id"`
        Secret  string `json:"secret"`
    }
    json.NewDecoder(resp.Body).Decode(&result)
    
    fmt.Println(">> SUCCESS! Agent Enrolled.")
    
    // --- Modular Configuration ---
    fmt.Println("\n=== Data Collection Configuration ===")
    
    collectors := config.CollectorConfig{}
    
    collectors.System = askBool(reader, "Enable System Metrics (CPU/RAM/Disk)?", true)
    collectors.Docker = askBool(reader, "Enable Docker Monitoring?", true)
    
    fmt.Println("\n--- Service Integrations ---")
    collectors.Kubernetes = askBool(reader, "Enable Kubernetes?", false)
    collectors.Nginx = askBool(reader, "Enable Nginx Logs?", false)
    collectors.Apache = askBool(reader, "Enable Apache Logs?", false)
    collectors.PM2 = askBool(reader, "Enable PM2 Process Manager?", false)
    
    fmt.Println("\n--- Log Collection Strategy ---")
    fmt.Println("1) Auto-Discover & Tail ALL (Standard)")
    fmt.Println("2) Select Specific Logs")
    fmt.Println("3) Disable Log Collection")
    fmt.Print("Select Mode [1]: ")
    
    modeStr, _ := reader.ReadString('\n')
    modeStr = strings.TrimSpace(modeStr)
    
    logStrategy := config.LogStrategy{Mode: "all"}
    if modeStr == "2" {
        logStrategy.Mode = "selected"
        // Run discovery to show options
        fmt.Println(">> Discovering available logs...")
        candidates, _ := discovery.FindLogs()
        
        // Add service logs if enabled
        if collectors.Nginx { candidates = append(candidates, discovery.FindServiceLogs("nginx")...) }
        if collectors.Apache { candidates = append(candidates, discovery.FindServiceLogs("apache")...) }
        if collectors.PM2 { candidates = append(candidates, discovery.FindServiceLogs("pm2")...) }
        
        seen := make(map[string]bool)
        var unique []discovery.DiscoveredLog
        for _, l := range candidates {
            if !seen[l.Path] {
                unique = append(unique, l)
                seen[l.Path] = true
            }
        }
        candidates = unique

        if len(candidates) == 0 {
            fmt.Println("No logs found. Disabling log collection.")
            logStrategy.Mode = "none"
        } else {
            fmt.Println("\nAvailable Logs:")
            for i, l := range candidates {
                fmt.Printf("[%d] %s (%s)\n", i+1, l.Path, l.SourceType)
            }
            fmt.Print("\nEnter comma-separated IDs to tail (e.g. 1,3,5): ")
            selection, _ := reader.ReadString('\n')
            ids := strings.Split(strings.TrimSpace(selection), ",")
            for _, id := range ids {
                 if idx, err := strconv.Atoi(strings.TrimSpace(id)); err == nil && idx > 0 && idx <= len(candidates) {
                     logStrategy.SelectedLogs = append(logStrategy.SelectedLogs, candidates[idx-1].Path)
                 }
            }
            fmt.Printf(">> Selected %d logs.\n", len(logStrategy.SelectedLogs))
        }
    } else if modeStr == "3" {
        logStrategy.Mode = "none"
    }
    
    // Save Config
    cfg := &config.AgentConfig{
        ServerURL: url,
        AgentID: result.AgentID,
        AgentSecret: result.Secret,
        Collectors: collectors,
        LogConfig: logStrategy,
    }
    if err := config.SaveConfig(cfg); err != nil {
        log.Fatal("Failed to save config:", err)
    }
    fmt.Println(">> Configuration saved to agent-config.json")
    fmt.Println(">> You can now start the agent normally.")
}

func askBool(r *bufio.Reader, prompt string, def bool) bool {
    defStr := "Y/n"
    if !def { defStr = "y/N" }
    fmt.Printf("%s [%s]: ", prompt, defStr)
    ans, _ := r.ReadString('\n')
    ans = strings.TrimSpace(strings.ToLower(ans))
    if ans == "" { return def }
    return ans == "y" || ans == "yes"
}

func postRegister(url string, payload interface{}) (*http.Response, error) {
    data, _ := json.Marshal(payload)
    return http.Post(url+"/api/v1/agent/register", "application/json", bytes.NewBuffer(data))
}

// dbProbe represents a database service to detect and collect metrics from.
type dbProbe struct {
    name    string
    address string
    port    string
}

// startServiceCollectors auto-detects running database services and periodically collects their metrics.
func startServiceCollectors(client *sender.Client, cfg *config.AgentConfig) {
    probes := []dbProbe{
        {"mysql", "127.0.0.1:3306", "3306"},
        {"redis", "127.0.0.1:6379", "6379"},
        {"postgresql", "127.0.0.1:5432", "5432"},
        {"mongodb", "127.0.0.1:27017", "27017"},
        {"clickhouse", "127.0.0.1:8123", "8123"},
        {"influxdb", "127.0.0.1:8086", "8086"},
    }

    // Check which services are running
    var activeServices []dbProbe
    for _, p := range probes {
        conn, err := net.DialTimeout("tcp", p.address, 2*time.Second)
        if err == nil {
            conn.Close()
            activeServices = append(activeServices, p)
            fmt.Printf(">> Service Detected: %s on port %s\n", p.name, p.port)
        }
    }

    if len(activeServices) == 0 {
        log.Println(">> No database services detected on localhost")
        return
    }

    fmt.Printf(">> Starting DB metrics collection for %d services (30s interval)\n", len(activeServices))

    // Collect immediately, then every 30s
    collectDBStats(client, activeServices, cfg)

    ticker := time.NewTicker(30 * time.Second)
    defer ticker.Stop()

    for range ticker.C {
        collectDBStats(client, activeServices, cfg)
    }
}

func collectDBStats(client *sender.Client, activeServices []dbProbe, cfg *config.AgentConfig) {
    for _, svc := range activeServices {
        var statsJSON string
        var err error

        switch svc.name {
        case "mysql":
            statsJSON, err = collectMySQLStats(cfg)
        case "redis":
            statsJSON, err = collectRedisStats()
        case "postgresql":
            statsJSON, err = collectPostgreSQLStats(cfg)
        case "mongodb":
            statsJSON, err = collectMongoDBStats()
        case "clickhouse":
            statsJSON, err = collectClickHouseStats(cfg)
        case "influxdb":
            statsJSON, err = collectInfluxDBStats()
        }

        if err != nil {
            log.Printf("[%s] Failed to collect stats: %v", svc.name, err)
            continue
        }

        if err := client.SendServiceStats(svc.name, statsJSON); err != nil {
            log.Printf("[%s] Failed to send stats: %v", svc.name, err)
        }
    }
}

func collectMySQLStats(cfg *config.AgentConfig) (string, error) {
    user := "root"
    if cfg.MySQLUser != "" { user = cfg.MySQLUser }
    pass := ""
    if cfg.MySQLPassword != "" { pass = ":" + cfg.MySQLPassword }
    
    dsn := fmt.Sprintf("%s%s@tcp(127.0.0.1:3306)/", user, pass)
    col, err := services.NewMySQLCollector(dsn)
    if err != nil {
        return "", err
    }
    defer col.Close()

    stats, err := col.GetStats()
    if err != nil {
        return "", err
    }

    // Get process list for active queries
    processList, _ := col.GetProcessList()

    result := map[string]interface{}{
        "total_connections":      stats.TotalConnections,
        "max_connections":        stats.MaxConnections,
        "threads_connected":      stats.ThreadsConnected,
        "threads_running":        stats.ThreadsRunning,
        "slow_queries":           stats.SlowQueries,
        "queries_per_second":     stats.QueriesPerSecond,
        "is_master":              stats.IsMaster,
        "replication_lag":        stats.ReplicationLag,
        "query_cache_hit_rate":   stats.QueryCacheHitRate,
        "innodb_buffer_pool_size": stats.InnoDBBufferPoolSize,
        "aborted_connections":    stats.AbortedConnections,
        "uptime":                 stats.Uptime,
        "process_list":           processList,
        "performance_schema":     stats.PerformanceSchema,
        "tables_without_indexes": stats.TablesWithoutIndexes,
        "high_io_tables":         stats.HighIOTables,
        "slow_queries_perf":      stats.SlowQueriesFromPerfSchema,
    }

    data, err := json.Marshal(result)
    return string(data), err
}

func collectRedisStats() (string, error) {
    col, err := services.NewRedisCollector("127.0.0.1:6379", "")
    if err != nil {
        return "", err
    }
    defer col.Close()

    stats, err := col.GetStats()
    if err != nil {
        return "", err
    }

    keyspace, _ := col.GetKeyspaceInfo()
    slowLog, _ := col.GetSlowLog(10)

    result := map[string]interface{}{
        "version":              stats.Version,
        "uptime_seconds":       stats.UptimeSeconds,
        "connected_clients":    stats.ConnectedClients,
        "blocked_clients":      stats.BlockedClients,
        "used_memory":          stats.UsedMemory,
        "max_memory":           stats.MaxMemory,
        "memory_fragmentation": stats.MemoryFragmentation,
        "total_commands":       stats.TotalCommands,
        "ops_per_sec":          stats.OpsPerSec,
        "keyspace_hits":        stats.KeyspaceHits,
        "keyspace_misses":      stats.KeyspaceMisses,
        "hit_rate":             stats.HitRate,
        "evicted_keys":         stats.EvictedKeys,
        "expired_keys":         stats.ExpiredKeys,
        "role":                 stats.Role,
        "replication_lag":      stats.ReplicationLag,
        "keyspace":             keyspace,
        "slow_log":             slowLog,
        "largest_keys":         stats.LargestKeys,
        "expensive_commands":   stats.ExpensiveCommands,
        "eviction_rate_per_sec": stats.EvictionRate,
    }

    data, err := json.Marshal(result)
    return string(data), err
}

func collectPostgreSQLStats(cfg *config.AgentConfig) (string, error) {
    user := "postgres"
    if cfg.PostgresUser != "" { user = cfg.PostgresUser }
    pass := ""
    if cfg.PostgresPassword != "" { pass = ":" + cfg.PostgresPassword }
    
    dsn := fmt.Sprintf("postgres://%s%s@127.0.0.1:5432/postgres?sslmode=disable", user, pass)
    col, err := services.NewPostgreSQLCollector(dsn)
    if err != nil {
        return "", err
    }
    defer col.Close()

    stats, err := col.GetStats()
    if err != nil {
        return "", err
    }

    activity, _ := col.GetActivity()
    locks, _ := col.GetLocks()
    tableStats, _ := col.GetTableStats()

    result := map[string]interface{}{
        "total_connections":    stats.TotalConnections,
        "max_connections":      stats.MaxConnections,
        "active_connections":   stats.ActiveConnections,
        "idle_connections":     stats.IdleConnections,
        "database_size":        stats.DatabaseSize,
        "dead_tuples":          stats.DeadTuples,
        "cache_hit_ratio":      stats.CacheHitRatio,
        "transactions_per_sec": stats.TransactionsPerSec,
        "replication_lag":      stats.ReplicationLag,
        "locks_count":          stats.LocksCount,
        "long_running_queries": stats.LongRunningQueries,
        "activity":             activity,
        "locks":                locks,
        "table_stats":          tableStats,
        "pg_stat_statements":   stats.PgStatStatements,
        "tables_without_indexes": stats.TablesWithoutIndexes,
        "high_io_tables":       stats.HighIOTables,
        "slow_queries":         stats.SlowQueries,
    }

    data, err := json.Marshal(result)
    return string(data), err
}

func collectMongoDBStats() (string, error) {
    col, err := services.NewMongoDBCollector("mongodb://127.0.0.1:27017")
    if err != nil {
        return "", err
    }
    defer col.Close()

    stats, err := col.GetStats()
    if err != nil {
        return "", err
    }

    currentOps, _ := col.GetCurrentOps()

    result := map[string]interface{}{
        "version":          stats.Version,
        "uptime":           stats.Uptime,
        "connections":      stats.Connections,
        "max_connections":  stats.MaxConnections,
        "memory_used":      stats.MemoryUsed,
        "op_counters":      stats.OpCounters,
        "replication_lag":  stats.ReplicationLag,
        "role":             stats.Role,
        "replica_set_name": stats.ReplicaSetName,
        "doc_count":        stats.DocCount,
        "data_size":        stats.DataSize,
        "storage_size":     stats.StorageSize,
        "index_size":       stats.IndexSize,
        "current_ops":      currentOps,
        "profiling_enabled": stats.ProfilingEnabled,
        "collections_without_indexes": stats.CollectionsWithoutIndexes,
        "slow_operations":  stats.SlowOperations,
        "collection_stats": stats.CollectionStats,
    }

    data, err := json.Marshal(result)
    return string(data), err
}

func collectClickHouseStats(cfg *config.AgentConfig) (string, error) {
    user := cfg.ClickHouseUser
    pass := cfg.ClickHousePass
    if user == "" {
        user = "default"
    }
    col := services.NewClickHouseCollector("127.0.0.1", 8123, user, pass)
    stats, err := col.GetStats()
    if err != nil {
        return "", err
    }
    data, err := json.Marshal(stats)
    return string(data), err
}

func collectInfluxDBStats() (string, error) {
    col := services.NewInfluxDBCollector("127.0.0.1", 8086)
    stats, err := col.GetStats()
    if err != nil {
        return "", err
    }
    data, err := json.Marshal(stats)
    return string(data), err
}

// startPM2Collector runs PM2 metric collection on a 30s interval
func startPM2Collector(client *sender.Client) {
    // Check if pm2 is available
    if _, err := exec.LookPath("pm2"); err != nil {
        log.Println(">> PM2 not found in PATH, skipping PM2 collector")
        return
    }
    fmt.Println(">> PM2 Detected: Starting PM2 metrics collection (30s interval)")

    // Collect immediately
    collectPM2Stats(client)

    ticker := time.NewTicker(30 * time.Second)
    defer ticker.Stop()

    for range ticker.C {
        collectPM2Stats(client)
    }
}

func collectPM2Stats(client *sender.Client) {
    col := services.NewPM2Collector()
    stats, err := col.GetStats()
    if err != nil {
        log.Printf("[pm2] Failed to collect stats: %v", err)
        return
    }
    data, err := json.Marshal(stats)
    if err != nil {
        log.Printf("[pm2] Failed to marshal stats: %v", err)
        return
    }
    if err := client.SendServiceStats("pm2", string(data)); err != nil {
        log.Printf("[pm2] Failed to send stats: %v", err)
    }
}

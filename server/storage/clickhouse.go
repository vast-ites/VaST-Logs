package storage

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

type LogStore struct {
	conn driver.Conn
	mu   sync.Mutex
}

type LogEntry struct {
	Timestamp  time.Time `json:"timestamp"`
	Host       string    `json:"host"`
	Service    string    `json:"service"`
	Level      string    `json:"level"`
	Message    string    `json:"message"`
	SourcePath string    `json:"source_path"`
}

func NewLogStore(dsn string) (*LogStore, error) {
	var opts *clickhouse.Options
	var err error

	if dsn != "" {
		opts, err = clickhouse.ParseDSN(dsn)
		if err != nil {
			return nil, fmt.Errorf("invalid dsn: %w", err)
		}
	} else {
		opts = &clickhouse.Options{
			Addr: []string{"127.0.0.1:9000"},
			Auth: clickhouse.Auth{
				Database: "default",
				Username: "datavast",
				Password: "securepass",
			},
		}
	}

	conn, err := clickhouse.Open(opts)
	if err != nil {
		return nil, err
	}

	if err := conn.Ping(context.Background()); err != nil {
		return nil, err
	}

	// Create Database
	err = conn.Exec(context.Background(), `CREATE DATABASE IF NOT EXISTS datavast`)
	if err != nil {
		return nil, fmt.Errorf("failed to create db: %w", err)
	}

	// Create table
	err = conn.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS datavast.logs (
			timestamp DateTime,
			host String,
			service String,
			level String,
			message String,
			source_path String
		) ENGINE = MergeTree()
		ORDER BY (timestamp, service)
	`)
	if err != nil {
		return nil, err
	}

	// Create Process Table
	err = conn.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS datavast.processes (
			timestamp DateTime,
			host String,
			pid Int32,
			name String,
			username String,
			cpu_percent Float64,
			memory_percent Float64,
			cmdline String
		) ENGINE = MergeTree()
		ORDER BY (timestamp, host)
		TTL timestamp + INTERVAL 1 DAY
	`)
	if err != nil {
		return nil, err
	}

	// Create Firewall Table
	err = conn.Exec(context.Background(), `
        CREATE TABLE IF NOT EXISTS datavast.firewall (
            timestamp DateTime,
            host String,
            rules String
        ) ENGINE = MergeTree()
        ORDER BY (timestamp, host)
        TTL timestamp + INTERVAL 1 DAY
    `)
	if err != nil {
		return nil, err
	}

	// Create Access Logs Table (for Apache/Nginx web traffic)
	err = conn.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS datavast.access_logs (
			timestamp DateTime,
			service String,
			host String,
			ip String,
			method String,
			path String,
			status_code UInt16,
			bytes_sent UInt64,
			user_agent String,
			country String,
			region String,
			city String,
			latitude Float32,
			longitude Float32,
			domain String
		) ENGINE = MergeTree()
		ORDER BY (timestamp, service, host)
	`)
	if err != nil {
		return nil, err
	}

	// -------------------------------------------------------------------------
	// PERFORMANCE OPTIMIZATIONS (Phase 42)
	// -------------------------------------------------------------------------

	// 1. Skip Index for Log Messages (Accelerates text search 10x-50x)
	_ = conn.Exec(context.Background(), `
        ALTER TABLE datavast.logs 
        ADD INDEX IF NOT EXISTS idx_message message TYPE tokenbf_v1(10240, 2, 0) GRANULARITY 4
    `)

	// 2. Materialized View for Metric Aggregation (Pre-calculate 1m, 1h stats)
	// First, target table for aggregated stats
	_ = conn.Exec(context.Background(), `
        CREATE TABLE IF NOT EXISTS datavast.access_logs_1m (
            timestamp DateTime,
            service String,
            host String,
            total_requests UInt64,
            total_bytes UInt64,
            avg_latency Float64
        ) ENGINE = SummingMergeTree()
        ORDER BY (timestamp, service, host)
        TTL timestamp + INTERVAL 90 DAY
    `)

	// Second, the MV trigger
	_ = conn.Exec(context.Background(), `
        CREATE MATERIALIZED VIEW IF NOT EXISTS datavast.access_logs_mv TO datavast.access_logs_1m AS
        SELECT
            toStartOfMinute(timestamp) as timestamp,
            service,
            host,
            count() as total_requests,
            sum(bytes_sent) as total_bytes,
            0.0 as avg_latency
        FROM datavast.access_logs
        GROUP BY timestamp, service, host
    `)

	// 3. Skip Index for Source Path (File filtering)
	_ = conn.Exec(context.Background(), `
        ALTER TABLE datavast.logs 
        ADD INDEX IF NOT EXISTS idx_source source_path TYPE set(100) GRANULARITY 2
    `)

	// -------------------------------------------------------------------------

	// Create Alerts Table
	err = conn.Exec(context.Background(), `
        CREATE TABLE IF NOT EXISTS datavast.alerts (
            timestamp DateTime,
            host String,
            type String,
            severity String,
            message String,
            resolved UInt8
        ) ENGINE = MergeTree()
        ORDER BY (timestamp, host)
        TTL timestamp + INTERVAL 30 DAY
    `)
	if err != nil {
		return nil, err
	}

	// Create Connections Table (High Frequency)
	err = conn.Exec(context.Background(), `
        CREATE TABLE IF NOT EXISTS datavast.connections (
            timestamp DateTime,
            host String,
            local_ip String,
            local_port UInt16,
            remote_ip String,
            remote_port UInt16,
            status String,
            pid Int32,
            process_name String
        ) ENGINE = MergeTree()
        ORDER BY (timestamp, host, local_port)
        TTL timestamp + INTERVAL 3 DAY
    `)
	if err != nil {
		return nil, err
	}

	// -------------------------------------------------------------------------
	// PHASE 43: IP INTELLIGENCE TABLES
	// -------------------------------------------------------------------------

	// 1. IP Geo Cache (Optimized for frequent lookups)
	err = conn.Exec(context.Background(), `
        CREATE TABLE IF NOT EXISTS datavast.ip_geo_cache (
            ip_address String,
            country String,
            state String,
            city String,
            last_updated DateTime DEFAULT now()
        ) ENGINE = MergeTree()
        ORDER BY ip_address
        TTL last_updated + INTERVAL 30 DAY
    `)
	if err != nil {
		return nil, fmt.Errorf("failed to create ip_geo_cache: %w", err)
	}

	// 2. Blocked IPs (Source-Aware)
	err = conn.Exec(context.Background(), `
        CREATE TABLE IF NOT EXISTS datavast.blocked_ips (
            ip_address String,
            agent_id String,
            blocked_at DateTime DEFAULT now(),
            blocked_by String,
            reason String
        ) ENGINE = ReplacingMergeTree()
        ORDER BY (agent_id, ip_address)
    `)
	if err != nil {
		return nil, fmt.Errorf("failed to create blocked_ips: %w", err)
	}

	// 2b. Agent Commands Queue
	err = conn.Exec(context.Background(), `
        CREATE TABLE IF NOT EXISTS datavast.agent_commands (
            id String DEFAULT generateUUIDv4(),
            agent_id String,
            action String,
            target_ip String,
            status String DEFAULT 'pending',
            output String DEFAULT '',
            created_at DateTime DEFAULT now(),
            executed_at DateTime DEFAULT now()
        ) ENGINE = MergeTree()
        ORDER BY (agent_id, created_at)
        TTL created_at + INTERVAL 7 DAY
    `)
	if err != nil {
		return nil, fmt.Errorf("failed to create agent_commands: %w", err)
	}

	// 3. IP Activity Aggregation (Materialized View Target)
	err = conn.Exec(context.Background(), `
        CREATE TABLE IF NOT EXISTS datavast.ip_activity_daily (
            day Date,
            agent_id String,
            ip_address String,
            service_type String,
            total_requests UInt64,
            first_seen DateTime,
            last_seen DateTime
        ) ENGINE = SummingMergeTree(total_requests)
        ORDER BY (day, agent_id, ip_address, service_type)
    `)
	if err != nil {
		return nil, fmt.Errorf("failed to create ip_activity_daily: %w", err)
	}

	// 4. IP Activity MV (Feed from access_logs)
	err = conn.Exec(context.Background(), `
        CREATE MATERIALIZED VIEW IF NOT EXISTS datavast.ip_activity_mv TO datavast.ip_activity_daily AS
        SELECT
            toDate(timestamp) as day,
            host as agent_id,
            ip as ip_address,
            service as service_type,
            count() as total_requests,
            min(timestamp) as first_seen,
            max(timestamp) as last_seen
        FROM datavast.access_logs
        GROUP BY day, agent_id, ip_address, service_type
    `)
	if err != nil {
		return nil, fmt.Errorf("failed to create ip_activity_mv: %w", err)
	}

	// Create Service Stats Table (for DB metrics from agents)
	err = conn.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS datavast.service_stats (
			timestamp DateTime,
			host String,
			service String,
			stats String
		) ENGINE = MergeTree()
		ORDER BY (host, service, timestamp)
		TTL timestamp + INTERVAL 7 DAY
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to create service_stats: %w", err)
	}

	store := &LogStore{conn: conn}

	// Apply retention policy at startup (default 7 days for app tables, 3 days for system tables)
	store.ApplyRetentionPolicy(7)

	return store, nil
}

// ApplyRetentionPolicy applies TTL-based data retention to both application and system tables.
// `days` controls app table retention (logs, connections, etc.).
// System tables always get a 3-day TTL to prevent disk exhaustion.
// This is called at startup and whenever the user changes the Data Retention setting in the UI.
func (s *LogStore) ApplyRetentionPolicy(days int) {
	if days < 1 {
		days = 7 // Safety fallback
	}

	log.Printf("[RETENTION] Applying data retention policy: %d days for app tables, 3 days for system tables", days)

	// 1. Application tables — use configured retention_days
	appTables := []struct {
		Table  string
		Column string
	}{
		{"datavast.logs", "timestamp"},
		{"datavast.connections", "timestamp"},
		{"datavast.processes", "timestamp"},
		{"datavast.firewall", "timestamp"},
		{"datavast.access_logs", "timestamp"},
		{"datavast.service_stats", "timestamp"},
	}
	for _, t := range appTables {
		err := s.conn.Exec(context.Background(), fmt.Sprintf(
			"ALTER TABLE %s MODIFY TTL %s + INTERVAL %d DAY", t.Table, t.Column, days))
		if err != nil {
			log.Printf("[RETENTION] Warning: could not set TTL on %s: %v", t.Table, err)
		} else {
			log.Printf("[RETENTION] ✅ %s → %d day retention", t.Table, days)
		}
	}

	// 2. ClickHouse system tables — fixed 3-day TTL to prevent disk exhaustion
	systemTables := []string{
		"text_log", "trace_log", "metric_log", "query_log", "part_log",
		"processors_profile_log", "asynchronous_metric_log",
		"background_schedule_pool_log", "error_log",
	}
	for _, table := range systemTables {
		_ = s.conn.Exec(context.Background(), fmt.Sprintf(
			"ALTER TABLE system.%s MODIFY TTL event_time + INTERVAL 3 DAY", table))
	}
	log.Printf("[RETENTION] ✅ System tables → 3 day retention")
}

// Query executes a query with parameters
func (s *LogStore) Query(query string, args ...interface{}) (driver.Rows, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.conn.Query(context.Background(), query, args...)
}

// ... InsertLog ...

type ProcessEntry struct {
	Timestamp     time.Time `json:"timestamp"`
	Host          string    `json:"host"`
	PID           int32     `json:"pid"`
	Name          string    `json:"name"`
	Username      string    `json:"username"`
	CPUPercent    float64   `json:"cpu_percent"`
	MemoryPercent float64   `json:"memory_percent"`
	Cmdline       string    `json:"cmdline"`
}

func (s *LogStore) InsertProcesses(entries []ProcessEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	batch, err := s.conn.PrepareBatch(context.Background(), "INSERT INTO datavast.processes")
	if err != nil {
		return err
	}
	for _, e := range entries {
		err := batch.Append(
			e.Timestamp, e.Host, e.PID, e.Name, e.Username,
			e.CPUPercent, e.MemoryPercent, e.Cmdline,
		)
		if err != nil {
			return err
		}
	}
	return batch.Send()
}

func (s *LogStore) GetLatestProcesses(host string) ([]ProcessEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	// efficient latest query
	query := `
        SELECT timestamp, host, pid, name, username, cpu_percent, memory_percent, cmdline
        FROM datavast.processes
        WHERE host = ? AND timestamp > now() - INTERVAL 5 MINUTE
        ORDER BY timestamp DESC
        LIMIT 50
    `
	// Actually we want the full list from the *latest snapshot*.
	// Assuming agent sends all in one go or batches closely.
	// Better approach: Select * where timestamp = (select max(timestamp) from processes where host=?)

	query = `
        SELECT timestamp, host, pid, name, username, cpu_percent, memory_percent, cmdline
        FROM datavast.processes
        WHERE host = ? AND timestamp = (
            SELECT max(timestamp) FROM datavast.processes WHERE host = ?
        )
        ORDER BY cpu_percent DESC
        LIMIT 50
    `

	rows, err := s.conn.Query(context.Background(), query, host, host)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var procs []ProcessEntry
	for rows.Next() {
		var p ProcessEntry
		if err := rows.Scan(&p.Timestamp, &p.Host, &p.PID, &p.Name, &p.Username, &p.CPUPercent, &p.MemoryPercent, &p.Cmdline); err != nil {
			return nil, err
		}
		procs = append(procs, p)
	}
	return procs, nil
}

func (s *LogStore) InsertFirewall(timestamp time.Time, host, rules string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.conn.Exec(context.Background(), `
        INSERT INTO datavast.firewall (timestamp, host, rules) VALUES (?, ?, ?)
     `, timestamp, host, rules)
}

func (s *LogStore) GetLatestFirewall(host string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var rules string
	err := s.conn.QueryRow(context.Background(), `
        SELECT rules FROM datavast.firewall 
        WHERE host = ? ORDER BY timestamp DESC LIMIT 1
    `, host).Scan(&rules)
	if err != nil {
		return "", err
	}
	return rules, nil
}

type AlertEntry struct {
	Timestamp DateTime `json:"timestamp"`
	Host      string   `json:"host"`
	Type      string   `json:"type"`
	Severity  string   `json:"severity"`
	Message   string   `json:"message"`
	Resolved  bool     `json:"resolved"` // stored as UInt8
}

// DateTime alias to standard time.Time for JSON
type DateTime = time.Time

func (s *LogStore) InsertAlert(entry AlertEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	resolvedInt := uint8(0)
	if entry.Resolved {
		resolvedInt = 1
	}

	return s.conn.Exec(context.Background(), `
        INSERT INTO datavast.alerts (timestamp, host, type, severity, message, resolved)
        VALUES (?, ?, ?, ?, ?, ?)
    `, entry.Timestamp, entry.Host, entry.Type, entry.Severity, entry.Message, resolvedInt)
}

func (s *LogStore) GetRecentAlerts(limit int) ([]AlertEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if limit <= 0 {
		limit = 50
	}

	rows, err := s.conn.Query(context.Background(), fmt.Sprintf(`
        SELECT timestamp, host, type, severity, message, resolved 
        FROM datavast.alerts
        ORDER BY timestamp DESC
        LIMIT %d
    `, limit))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var alerts []AlertEntry
	for rows.Next() {
		var a AlertEntry
		var res uint8
		if err := rows.Scan(&a.Timestamp, &a.Host, &a.Type, &a.Severity, &a.Message, &res); err != nil {
			return nil, err
		}
		a.Resolved = (res == 1)
		alerts = append(alerts, a)
	}
	return alerts, nil
}

type AccessLogEntry struct {
	Timestamp  time.Time `json:"timestamp"`
	Service    string    `json:"service"`
	Host       string    `json:"host"`
	IP         string    `json:"ip"`
	Method     string    `json:"method"`
	Path       string    `json:"path"`
	StatusCode uint16    `json:"status_code"`
	BytesSent  uint64    `json:"bytes_sent"`
	UserAgent  string    `json:"user_agent"`
	Country    string    `json:"country"`
	Region     string    `json:"region"`
	City       string    `json:"city"`
	Latitude   float64   `json:"latitude"`
	Longitude  float64   `json:"longitude"`
	Domain     string    `json:"domain"`
}

func (s *LogStore) InsertAccessLog(entry AccessLogEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.conn.Exec(context.Background(), `
		INSERT INTO datavast.access_logs (timestamp, service, host, ip, method, path, status_code, bytes_sent, user_agent, country, region, city, latitude, longitude, domain)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, entry.Timestamp, entry.Service, entry.Host, entry.IP, entry.Method, entry.Path, entry.StatusCode, entry.BytesSent, entry.UserAgent, entry.Country, entry.Region, entry.City, entry.Latitude, entry.Longitude, entry.Domain)
}

func (s *LogStore) InsertLog(entry LogEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.conn.Exec(context.Background(), `
		INSERT INTO datavast.logs (timestamp, host, service, level, message, source_path)
		VALUES (?, ?, ?, ?, ?, ?)
	`, entry.Timestamp, entry.Host, entry.Service, entry.Level, entry.Message, entry.SourcePath)
}

func (s *LogStore) GetRecentLogs(limit int) ([]LogEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if limit <= 0 {
		limit = 50
	}
	rows, err := s.conn.Query(context.Background(), fmt.Sprintf(`
		SELECT timestamp, host, service, level, message, source_path
		FROM datavast.logs
		ORDER BY timestamp DESC
		LIMIT %d
	`, limit))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []LogEntry
	for rows.Next() {
		var l LogEntry
		if err := rows.Scan(&l.Timestamp, &l.Host, &l.Service, &l.Level, &l.Message, &l.SourcePath); err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}
	return logs, nil
}

type LogFilter struct {
	Limit      int
	Level      string
	Host       string
	Service    string
	SearchTerm string
	Before     time.Time
	After      time.Time
	Order      string // "DESC" or "ASC"
}

func (s *LogStore) QueryLogs(filter LogFilter) ([]LogEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if filter.Limit <= 0 {
		filter.Limit = 100
	}

	query := "SELECT timestamp, host, service, level, message, source_path FROM datavast.logs WHERE 1=1"
	var args []interface{}

	if filter.Host != "" {
		query += " AND host = ?"
		args = append(args, filter.Host)
	}

	if filter.Level != "" && filter.Level != "ALL" {
		query += " AND level = ?"
		args = append(args, filter.Level)
	}

	if filter.Service != "" {
		query += " AND (service ILIKE ? OR source_path ILIKE ?)"
		pattern := "%" + filter.Service + "%"
		args = append(args, pattern, pattern)
	}

	if !filter.Before.IsZero() {
		query += " AND timestamp < ?"
		args = append(args, filter.Before)
	}

	if !filter.After.IsZero() {
		query += " AND timestamp > ?"
		args = append(args, filter.After)
	}

	if filter.SearchTerm != "" {
		query += " AND (message ILIKE ? OR source_path ILIKE ? OR host ILIKE ?)"
		// ILIKE is case insensitive in ClickHouse
		pattern := "%" + filter.SearchTerm + "%"
		args = append(args, pattern, pattern, pattern)
	}

	order := "DESC"
	if filter.Order == "ASC" {
		order = "ASC"
	}

	query += fmt.Sprintf(" ORDER BY timestamp %s LIMIT %d", order, filter.Limit)

	rows, err := s.conn.Query(context.Background(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []LogEntry
	for rows.Next() {
		var l LogEntry
		if err := rows.Scan(&l.Timestamp, &l.Host, &l.Service, &l.Level, &l.Message, &l.SourcePath); err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}
	return logs, nil
}

func (s *LogStore) GetUniqueServices(host string) ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var services []string
	seen := make(map[string]bool)

	// Helper function to query a table
	queryTable := func(table string) error {
		var query string
		var args []interface{}

		if host != "" {
			query = fmt.Sprintf("SELECT DISTINCT service FROM %s WHERE host = ?", table)
			args = append(args, host)
		} else {
			query = fmt.Sprintf("SELECT DISTINCT service FROM %s", table)
		}

		rows, err := s.conn.Query(context.Background(), query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var svc string
			if err := rows.Scan(&svc); err != nil {
				return err
			}
			if svc != "" && !seen[svc] {
				services = append(services, svc)
				seen[svc] = true
			}
		}
		return nil
	}

	// 1. Query generic logs
	if err := queryTable("datavast.logs"); err != nil {
		fmt.Printf("[ERROR] Failed to query datavast.logs services: %v\n", err)
		// Continue to next table even if this fails? better to Log and continue
	}

	// 2. Query access logs
	if err := queryTable("datavast.access_logs"); err != nil {
		fmt.Printf("[ERROR] Failed to query datavast.access_logs services: %v\n", err)
	}

	return services, nil
}

type ConnectionEntry struct {
	Timestamp   time.Time `json:"timestamp"`
	Host        string    `json:"host"`
	LocalIP     string    `json:"local_ip"`
	LocalPort   uint16    `json:"local_port"`
	RemoteIP    string    `json:"remote_ip"`
	RemotePort  uint16    `json:"remote_port"`
	Status      string    `json:"status"`
	PID         int32     `json:"pid"`
	ProcessName string    `json:"process_name"`
}

func (s *LogStore) InsertConnections(entries []ConnectionEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	batch, err := s.conn.PrepareBatch(context.Background(), "INSERT INTO datavast.connections")
	if err != nil {
		return err
	}
	for _, e := range entries {
		err := batch.Append(
			e.Timestamp, e.Host, e.LocalIP, e.LocalPort,
			e.RemoteIP, e.RemotePort, e.Status, e.PID, e.ProcessName,
		)
		if err != nil {
			return err
		}
	}
	return batch.Send()
}

type ConnectionSummary struct {
	LocalPort   uint16 `json:"local_port"`
	ProcessName string `json:"process_name"`
	Count       uint64 `json:"count"`
}

// GetConnectionSummary returns the latest count of connections per port for a host
func (s *LogStore) GetConnectionSummary(host string) ([]ConnectionSummary, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Optimized: bound the scan to last 30 seconds so ClickHouse skips older data
	// using the MergeTree's timestamp-first index. Then find max(timestamp) within
	// that narrow window instead of scanning the entire table.
	query := `
        SELECT local_port, any(process_name), countIf(status != 'LISTEN') as active
        FROM datavast.connections
        WHERE host = ?
          AND timestamp > now() - INTERVAL 30 SECOND
          AND timestamp = (
              SELECT max(timestamp) FROM datavast.connections
              WHERE host = ? AND timestamp > now() - INTERVAL 30 SECOND
          )
        GROUP BY local_port
        ORDER BY active DESC
    `

	rows, err := s.conn.Query(context.Background(), query, host, host)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var summary []ConnectionSummary
	for rows.Next() {
		var c ConnectionSummary
		if err := rows.Scan(&c.LocalPort, &c.ProcessName, &c.Count); err != nil {
			return nil, err
		}
		summary = append(summary, c)
	}
	return summary, nil
}

func (s *LogStore) GetConnectionDetails(host string, port uint16) ([]ConnectionEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	rows, err := s.conn.Query(context.Background(), `
        SELECT timestamp, host, local_ip, local_port, remote_ip, remote_port, status, pid, process_name
        FROM datavast.connections
        WHERE host = ? 
          AND local_port = ?
          AND timestamp > now() - INTERVAL 30 SECOND
          AND timestamp = (
              SELECT max(timestamp) FROM datavast.connections
              WHERE host = ? AND timestamp > now() - INTERVAL 30 SECOND
          )
          AND status != 'LISTEN'
        ORDER BY status, remote_ip
    `, host, port, host)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []ConnectionEntry
	for rows.Next() {
		var e ConnectionEntry
		if err := rows.Scan(&e.Timestamp, &e.Host, &e.LocalIP, &e.LocalPort, &e.RemoteIP, &e.RemotePort, &e.Status, &e.PID, &e.ProcessName); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, nil
}

// Phase 43: IP Intelligence Methods

func (s *LogStore) IsIPBlocked(ip, agentID string) (bool, error) {
	// FINAL is required because we use lightweight deletes (ALTER TABLE DELETE)
	// which are async — without FINAL, deleted rows may still be counted
	query := `SELECT count() FROM datavast.blocked_ips FINAL WHERE ip_address = ?`
	args := []interface{}{ip}

	if agentID != "" && agentID != "all" {
		query += ` AND agent_id = ?`
		args = append(args, agentID)
	}

	rows, err := s.Query(query, args...)
	if err != nil {
		return false, err
	}
	defer rows.Close()

	var count uint64
	if rows.Next() {
		if err := rows.Scan(&count); err != nil {
			return false, err
		}
	}
	return count > 0, nil
}

// GetBlockedIPs returns all currently blocked IPs for a given agent.
func (s *LogStore) GetBlockedIPs(agentID string) ([]map[string]interface{}, error) {
	query := `SELECT ip_address, blocked_at, blocked_by, reason 
		FROM datavast.blocked_ips FINAL 
		WHERE agent_id = ? 
		ORDER BY blocked_at DESC`

	rows, err := s.Query(query, agentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var ip, blockedBy, reason string
		var blockedAt time.Time
		if err := rows.Scan(&ip, &blockedAt, &blockedBy, &reason); err != nil {
			return nil, err
		}
		results = append(results, map[string]interface{}{
			"ip":         ip,
			"blocked_at": blockedAt,
			"blocked_by": blockedBy,
			"reason":     reason,
		})
	}
	return results, nil
}

func (s *LogStore) BlockIP(ip, agentID, reason string) error {
	// Insert into blocked_ips
	query := `INSERT INTO datavast.blocked_ips (ip_address, agent_id, blocked_at, blocked_by, reason) VALUES (?, ?, now(), 'admin', ?)`
	if err := s.conn.Exec(context.Background(), query, ip, agentID, reason); err != nil {
		return err
	}
	// Queue iptables command for agent
	return s.InsertCommand(agentID, "block_ip", ip)
}

func (s *LogStore) UnblockIP(ip, agentID string) error {
	// Lightweight delete
	query := `ALTER TABLE datavast.blocked_ips DELETE WHERE ip_address = ? AND agent_id = ?`
	if err := s.conn.Exec(context.Background(), query, ip, agentID); err != nil {
		return err
	}
	// Queue iptables command for agent
	return s.InsertCommand(agentID, "unblock_ip", ip)
}

// --- Agent Command Queue ---

type AgentCommand struct {
	ID       string `json:"id"`
	AgentID  string `json:"agent_id"`
	Action   string `json:"action"`
	TargetIP string `json:"target_ip"`
	Status   string `json:"status"`
}

func (s *LogStore) InsertCommand(agentID, action, targetIP string) error {
	query := `INSERT INTO datavast.agent_commands (agent_id, action, target_ip, status, created_at) VALUES (?, ?, ?, 'pending', now())`
	return s.conn.Exec(context.Background(), query, agentID, action, targetIP)
}

func (s *LogStore) GetPendingCommands(agentID string) ([]AgentCommand, error) {
	query := `SELECT id, agent_id, action, target_ip, status FROM datavast.agent_commands WHERE agent_id = ? AND status = 'pending' ORDER BY created_at ASC`
	rows, err := s.conn.Query(context.Background(), query, agentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cmds []AgentCommand
	for rows.Next() {
		var c AgentCommand
		if err := rows.Scan(&c.ID, &c.AgentID, &c.Action, &c.TargetIP, &c.Status); err != nil {
			return nil, err
		}
		cmds = append(cmds, c)
	}
	return cmds, nil
}

func (s *LogStore) AckCommand(id, status, output string) error {
	// Use ALTER UPDATE (lightweight) to mark command as done
	query := `ALTER TABLE datavast.agent_commands UPDATE status = ?, output = ?, executed_at = now() WHERE id = ?`
	return s.conn.Exec(context.Background(), query, status, output, id)
}

func (s *LogStore) SyncBlockedIPs(agentID string, blockedIPs []string) error {
	// 1. Delete all existing records for this agent
	delQuery := `ALTER TABLE datavast.blocked_ips DELETE WHERE agent_id = ?`
	if err := s.conn.Exec(context.Background(), delQuery, agentID); err != nil {
		return fmt.Errorf("failed to clear old blocked IPs: %w", err)
	}

	// 2. Insert current state from firewall using batch insert for efficiency
	if len(blockedIPs) == 0 {
		return nil
	}

	batch, err := s.conn.PrepareBatch(context.Background(), "INSERT INTO datavast.blocked_ips (ip_address, agent_id, blocked_at, blocked_by, reason)")
	if err != nil {
		return fmt.Errorf("failed to prepare batch: %w", err)
	}

	now := time.Now()
	for _, ip := range blockedIPs {
		if err := batch.Append(ip, agentID, now, "firewall_sync", "Detected in iptables"); err != nil {
			log.Printf("[WARN] Failed to append blocked IP %s: %v", ip, err)
		}
	}

	if err := batch.Send(); err != nil {
		return fmt.Errorf("failed to send batch: %w", err)
	}
	return nil
}

type IPActivityStats struct {
	Service       string    `json:"service"`
	TotalRequests uint64    `json:"total_requests"`
	FirstSeen     time.Time `json:"first_seen"`
	LastSeen      time.Time `json:"last_seen"`
}

func (s *LogStore) GetIPActivity(ip, agentID string) ([]IPActivityStats, error) {
	// 1. Get stats from Web Access Logs (via Materialized View)
	queryWeb := `
        SELECT service_type, sum(total_requests), min(first_seen), max(last_seen)
        FROM datavast.ip_activity_daily
        WHERE ip_address = ?
    `
	argsWeb := []interface{}{ip}

	if agentID != "" && agentID != "all" {
		queryWeb += ` AND agent_id = ?`
		argsWeb = append(argsWeb, agentID)
	}
	queryWeb += ` GROUP BY service_type`

	// 2. Get stats from System/SSH Logs (Raw Search)
	// Note: We use ilike for case-insensitive search, assuming IP format matches.
	// Skip index on message helps here.
	querySys := `
        SELECT service, count(), min(timestamp), max(timestamp)
        FROM datavast.logs
        WHERE message ILIKE ? 
    `
	argsSys := []interface{}{"%" + ip + "%"}

	if agentID != "" && agentID != "all" {
		querySys += ` AND host = ?`
		argsSys = append(argsSys, agentID)
	}
	querySys += ` GROUP BY service`

	// Execute Web Query
	var results []IPActivityStats
	rowsWeb, err := s.Query(queryWeb, argsWeb...)
	if err == nil {
		defer rowsWeb.Close()
		for rowsWeb.Next() {
			var stat IPActivityStats
			_ = rowsWeb.Scan(&stat.Service, &stat.TotalRequests, &stat.FirstSeen, &stat.LastSeen)
			results = append(results, stat)
		}
	}

	// Execute System Query
	rowsSys, err := s.Query(querySys, argsSys...)
	if err == nil {
		defer rowsSys.Close()
		for rowsSys.Next() {
			var stat IPActivityStats
			_ = rowsSys.Scan(&stat.Service, &stat.TotalRequests, &stat.FirstSeen, &stat.LastSeen)
			results = append(results, stat)
		}
	}

	return results, nil
}

func (s *LogStore) GetComprehensiveLogsForIP(ip, agentID string, limit, offset int) ([]LogEntry, error) {
	// UNION ALL query to fetch both System Logs and Web Access Logs
	// We map Access Log fields to match the generic LogEntry structure
	query := `
        SELECT timestamp, host, service, level, message, source_path FROM (
            SELECT 
                timestamp, 
                host, 
                service, 
                level, 
                message, 
                source_path
            FROM datavast.logs
            WHERE message ILIKE ?
            ` + (func() string { if agentID != "" && agentID != "all" { return " AND host = ? " } else { return "" } })() + `
            
            UNION ALL
            
            SELECT 
                timestamp, 
                host, 
                service, 
                multiIf(status_code >= 500, 'ERROR', status_code >= 400, 'WARN', 'INFO') as level,
                concat(method, ' ', path, ' [', toString(status_code), '] - ', toString(bytes_sent), ' bytes') as message,
                'access_log' as source_path
            FROM datavast.access_logs
            WHERE ip = ?
            ` + (func() string { if agentID != "" && agentID != "all" { return " AND host = ? " } else { return "" } })() + `
        )
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
    `

	var args []interface{}
	
	// Args for first part (System Logs)
	args = append(args, "%"+ip+"%")
	if agentID != "" && agentID != "all" {
		args = append(args, agentID)
	}

	// Args for second part (Access Logs)
	args = append(args, ip)
	if agentID != "" && agentID != "all" {
		args = append(args, agentID)
	}

	// Args for Limit/Offset
	args = append(args, limit, offset)

	rows, err := s.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []LogEntry
	for rows.Next() {
		var l LogEntry
		if err := rows.Scan(&l.Timestamp, &l.Host, &l.Service, &l.Level, &l.Message, &l.SourcePath); err != nil {
			continue
		}
		logs = append(logs, l)
	}
	return logs, nil
}

func (s *LogStore) CountSSHEventsForIP(ip, agentID string) (int, error) {
	query := `
		SELECT count() FROM datavast.logs
		WHERE (service = 'sshd' OR message ILIKE '%sshd[%') AND message ILIKE ?
	`
	args := []interface{}{"%" + ip + "%"}

	if agentID != "" && agentID != "all" {
		query += ` AND host = ?`
		args = append(args, agentID)
	}

	var count uint64
	err := s.conn.QueryRow(context.Background(), query, args...).Scan(&count)
	if err != nil {
		return 0, err
	}
	return int(count), nil
}

func (s *LogStore) CountAuthFailuresForIP(ip, agentID string) (int, error) {
	query := `
		SELECT count() FROM datavast.logs
		WHERE (
			(
				(message ILIKE '%sshd[%' OR service = 'sshd') AND message ILIKE '%Failed password%'
			) OR (
				(message ILIKE '%su:%' OR message ILIKE '%sudo:%' OR service = 'auth') AND message ILIKE '%authentication failure%'
			)
		) AND message ILIKE ?
	`
	args := []interface{}{"%" + ip + "%"}

	if agentID != "" && agentID != "all" {
		query += ` AND host = ?`
		args = append(args, agentID)
	}

	var count uint64
	err := s.conn.QueryRow(context.Background(), query, args...).Scan(&count)
	if err != nil {
		return 0, err
	}
	return int(count), nil
}

// Service Stats methods

type ServiceStatsEntry struct {
	Timestamp time.Time `json:"timestamp"`
	Host      string    `json:"host"`
	Service   string    `json:"service"`
	Stats     string    `json:"stats"`
}

func (s *LogStore) InsertServiceStats(entry ServiceStatsEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.conn.Exec(context.Background(), `
		INSERT INTO datavast.service_stats (timestamp, host, service, stats)
		VALUES (?, ?, ?, ?)
	`, entry.Timestamp, entry.Host, entry.Service, entry.Stats)
}

func (s *LogStore) GetLatestServiceStats(host, service string, start, end time.Time) (string, time.Time, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	query := `SELECT stats, timestamp FROM datavast.service_stats WHERE service = ?`
	args := []interface{}{service}

	if host != "" {
		query += " AND host = ?"
		args = append(args, host)
	}

	if !start.IsZero() {
		query += " AND timestamp >= ?"
		args = append(args, start)
	}
	if !end.IsZero() {
		query += " AND timestamp <= ?"
		args = append(args, end)
	}

	query += " ORDER BY timestamp DESC LIMIT 1"

	var stats string
	var ts time.Time
	err := s.conn.QueryRow(context.Background(), query, args...).Scan(&stats, &ts)
	if err != nil {
		return "", time.Time{}, err
	}
	return stats, ts, nil
}

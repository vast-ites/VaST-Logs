package services

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ClickHouseCollector collects metrics from ClickHouse via HTTP interface
type ClickHouseCollector struct {
	BaseURL  string // e.g., "http://localhost:8123"
	Username string
	Password string
	Client   *http.Client
}

// ClickHouseStats represents the collected metrics
type ClickHouseStats struct {
	Timestamp            time.Time              `json:"timestamp"`
	Uptime               int64                  `json:"uptime"`
	QueryCount           int64                  `json:"query_count,omitempty"`
	InsertQuery          int64                  `json:"insert_query,omitempty"`
	SelectQuery          int64                  `json:"select_query,omitempty"`
	MemoryTracking       int64                  `json:"memory_tracking,omitempty"`
	BackgroundPoolTask   int64                  `json:"background_pool_task,omitempty"`
	ActiveParts          int64                  `json:"active_parts,omitempty"`
	TotalRows            int64                  `json:"total_rows,omitempty"`
	TotalBytes           int64                  `json:"total_bytes,omitempty"`
	ReplicasMaxAbsDelay  int64                  `json:"replicas_max_absolute_delay,omitempty"`
	MaxPartCount         int64                  `json:"max_part_count_for_partition,omitempty"`
	SystemMetrics        map[string]interface{} `json:"system_metrics,omitempty"`
	SystemEvents         map[string]interface{} `json:"system_events,omitempty"`
	SystemAsync          map[string]interface{} `json:"system_async,omitempty"`
	SlowQueries          []map[string]interface{} `json:"slow_queries,omitempty"`
	Mutations            []map[string]interface{} `json:"mutations,omitempty"`
}

// NewClickHouseCollector creates a new collector with optional auth
func NewClickHouseCollector(host string, port int, user, password string) *ClickHouseCollector {
	if port == 0 {
		port = 8123
	}
	// Sanitize host
	host = strings.TrimPrefix(host, "http://")
	host = strings.TrimPrefix(host, "https://")
	
	return &ClickHouseCollector{
		BaseURL:  fmt.Sprintf("http://%s:%d", host, port),
		Username: user,
		Password: password,
		Client:   &http.Client{Timeout: 5 * time.Second},
	}
}

// GetStats collects all metrics
func (c *ClickHouseCollector) GetStats() (*ClickHouseStats, error) {
	stats := &ClickHouseStats{
		Timestamp:    time.Now(),
		SystemMetrics: make(map[string]interface{}),
		SystemEvents:  make(map[string]interface{}),
		SystemAsync:   make(map[string]interface{}),
	}

	// 1. Get Uptime
	uptime, err := c.querySingleInt("SELECT uptime()")
	if err == nil {
		stats.Uptime = uptime
	}

	// 2. Query system.metrics (gauges)
	// Query, BackgroundPoolTask, MemoryTracking, etc.
	metrics, err := c.queryMap("SELECT metric, value FROM system.metrics WHERE metric IN ('Query', 'BackgroundPoolTask', 'MemoryTracking', 'ActiveParts', 'ContextLockWait')")
	if err == nil {
		stats.SystemMetrics = metrics
		stats.QueryCount = getInt64(metrics, "Query")
		stats.BackgroundPoolTask = getInt64(metrics, "BackgroundPoolTask")
		stats.MemoryTracking = getInt64(metrics, "MemoryTracking")
		stats.ActiveParts = getInt64(metrics, "ActiveParts")
	}

	// 3. Query system.events (counters)
	// SelectQuery, InsertQuery
	events, err := c.queryMap("SELECT event, value FROM system.events WHERE event IN ('SelectQuery', 'InsertQuery', 'FailedQuery', 'QueryTimeMicroseconds')")
	if err == nil {
		stats.SystemEvents = events
		stats.SelectQuery = getInt64(events, "SelectQuery")
		stats.InsertQuery = getInt64(events, "InsertQuery")
	}

	// 4. Query system.asynchronous_metrics (background stats)
	// ReplicasMaxAbsoluteDelay, MaxPartCountForPartition
	async, err := c.queryMap("SELECT metric, value FROM system.asynchronous_metrics WHERE metric IN ('ReplicasMaxAbsoluteDelay', 'MaxPartCountForPartition')")
	if err == nil {
		stats.SystemAsync = async
		stats.ReplicasMaxAbsDelay = getInt64(async, "ReplicasMaxAbsoluteDelay")
		stats.MaxPartCount = getInt64(async, "MaxPartCountForPartition")
	}

	// 5. Query system.parts (storage)
	// Create a simple custom query to get total storage
	storageStats, err := c.queryRow("SELECT sum(rows), sum(bytes_on_disk) FROM system.parts WHERE active = 1")
    if err == nil && len(storageStats) >= 2 {
        if rows, ok := storageStats[0].(float64); ok {
            stats.TotalRows = int64(rows)
        }
        if bytes, ok := storageStats[1].(float64); ok {
            stats.TotalBytes = int64(bytes)
        }
    }

	// 6. Query log analysis (Slow queries from system.query_log)
	slowQueries, err := c.queryMapArray("SELECT query, query_duration_ms, user, memory_usage FROM system.query_log WHERE type = 'QueryFinish' ORDER BY query_duration_ms DESC LIMIT 5")
	if err == nil {
		stats.SlowQueries = slowQueries
	}

	// 7. Mutation tracking (from system.mutations)
	mutations, err := c.queryMapArray("SELECT database, table, mutation_id, command, is_done, parts_to_do FROM system.mutations WHERE is_done = 0")
	if err == nil {
		stats.Mutations = mutations
	}

	return stats, nil
}

// Helper to execute query and return map[string]interface{}
func (c *ClickHouseCollector) queryMap(sql string) (map[string]interface{}, error) {
	// Format=JSONCompact is arrays, JSON is objects
	// We use JSON to get "data": [{"metric": "Query", "value": "1"}]
	resp, err := c.execQuery(sql + " FORMAT JSON")
	if err != nil {
		return nil, err
	}

	// Parse generic JSON response
	var result struct {
		Data []map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return nil, err
	}

	// Flatten to map
	out := make(map[string]interface{})
	for _, row := range result.Data {
		// Assuming first column is key, second is value
		// Maps in Go iterate randomly, but JSON unmarshal to map keeps keys
		// We expect keys like "metric" and "value"
		
		var key string
		var val interface{}
		
		// Heuristic to find Name/Value
		for k, v := range row {
			if k == "metric" || k == "event" {
				key = fmt.Sprintf("%v", v)
			} else if k == "value" {
				val = v
			}
		}
		
		if key != "" && val != nil {
			out[key] = val
		}
	}
	return out, nil
}

// Helper to execute query and return []map[string]interface{}
func (c *ClickHouseCollector) queryMapArray(sql string) ([]map[string]interface{}, error) {
	resp, err := c.execQuery(sql + " FORMAT JSON")
	if err != nil {
		return nil, err
	}

	var result struct {
		Data []map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return nil, err
	}

	return result.Data, nil
}

// Helper query single int
func (c *ClickHouseCollector) querySingleInt(sql string) (int64, error) {
	resp, err := c.execQuery(sql + " FORMAT JSONCompact")
	if err != nil {
		return 0, err
	}
	
	var result struct {
		Data [][]interface{} `json:"data"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return 0, err
	}
	
	if len(result.Data) > 0 && len(result.Data[0]) > 0 {
		val := result.Data[0][0]
		// JSON numbers are float64 in Go
		if f, ok := val.(float64); ok {
			return int64(f), nil
		}
		if s, ok := val.(string); ok {
            // ClickHouse might return Int64 as string in JSON
            // although usually not in JSONCompact unless config set
            var i int64
            fmt.Sscanf(s, "%d", &i)
            return i, nil
        }
	}
	return 0, fmt.Errorf("no data")
}

// Helper query single row
func (c *ClickHouseCollector) queryRow(sql string) ([]interface{}, error) {
	resp, err := c.execQuery(sql + " FORMAT JSONCompact")
	if err != nil {
		return nil, err
	}
	
	var result struct {
		Data [][]interface{} `json:"data"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return nil, err
	}
	
	if len(result.Data) > 0 {
		return result.Data[0], nil
	}
	return nil, fmt.Errorf("no data")
}

func (c *ClickHouseCollector) execQuery(sqlQuery string) ([]byte, error) {
	req, err := http.NewRequest("POST", c.BaseURL, strings.NewReader(sqlQuery))
	if err != nil {
		return nil, err
	}
	if c.Username != "" {
		req.SetBasicAuth(c.Username, c.Password)
	}
	
	resp, err := c.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("clickhouse error %d: %s", resp.StatusCode, string(body))
	}

	return io.ReadAll(resp.Body)
}

func getInt64(m map[string]interface{}, key string) int64 {
	if v, ok := m[key]; ok {
		if f, ok := v.(float64); ok {
			return int64(f)
		}
        // Handle uint64 strings if necessary
        if s, ok := v.(string); ok {
            var i int64
            fmt.Sscanf(s, "%d", &i)
            return i
        }
	}
	return 0
}

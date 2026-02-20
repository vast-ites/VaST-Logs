package services

import (
	"bufio"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// InfluxDBCollector collects internal metrics from InfluxDB /metrics endpoint
type InfluxDBCollector struct {
	BaseURL string // e.g., "http://localhost:8086"
	Client  *http.Client
}

// InfluxDBStats represents the collected metrics
type InfluxDBStats struct {
	Timestamp      time.Time `json:"timestamp"`
	Uptime         int64     `json:"uptime"` // Approximated
	WritesTotal    int64     `json:"writes_total"`
	QueryTotal     int64     `json:"query_total"`
	WritesPerSec   float64   `json:"writes_per_sec"` // Calculated if we kept state, but here we just get raw counter
	QueryDuration  float64   `json:"query_duration_ns"` // sum
	SeriesCreated  int64     `json:"series_created"`
	HeapUsage      int64     `json:"heap_usage"`
	Goroutines     int64     `json:"goroutines"`
    
    // Per-bucket tracking and cardinality
    BucketWrites   map[string]int64 `json:"bucket_writes,omitempty"`
    Cardinality    int64            `json:"cardinality"`
    
    // Raw compatibility
    Metrics map[string]float64 `json:"metrics,omitempty"`
}

// NewInfluxDBCollector creates a new collector
func NewInfluxDBCollector(host string, port int) *InfluxDBCollector {
	if port == 0 {
		port = 8086
	}
	host = strings.TrimPrefix(host, "http://")
	host = strings.TrimPrefix(host, "https://")
	
	return &InfluxDBCollector{
		BaseURL: fmt.Sprintf("http://%s:%d/metrics", host, port),
		Client:  &http.Client{Timeout: 5 * time.Second},
	}
}

// GetStats collects metrics
func (c *InfluxDBCollector) GetStats() (*InfluxDBStats, error) {
	resp, err := c.Client.Get(c.BaseURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("influxdb metrics error: %d", resp.StatusCode)
	}

	stats := &InfluxDBStats{
		Timestamp:    time.Now(),
		Metrics:      make(map[string]float64),
		BucketWrites: make(map[string]int64),
	}

	// Simple Prometheus format parser
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		
		// Skip comments
		if strings.HasPrefix(line, "#") || line == "" {
			continue
		}

		// Split metric_name{labels} value timestamp
		// We just care about name and value for now
		
		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}

		name := parts[0] // potentially has labels inside {}
		valueStr := parts[1]

		// Extract base name
		baseName := name
		if idx := strings.Index(name, "{"); idx != -1 {
			baseName = name[:idx]
		}
        
        // We only care about specific metrics to keep payload light
        // http_api_request_duration_seconds_count
        // storage_wal_writes_total
        // influxdb_info
        // process_resident_memory_bytes
        // go_goroutines

        val, err := strconv.ParseFloat(valueStr, 64)
        if err != nil || math.IsNaN(val) || math.IsInf(val, 0) {
            continue
        }

        switch baseName {
        case "http_api_request_duration_seconds_count":
            stats.QueryTotal += int64(val)
        case "storage_wal_writes_total":
            stats.WritesTotal += int64(val)
        case "process_resident_memory_bytes":
            stats.HeapUsage = int64(val)
        case "go_goroutines":
            stats.Goroutines = int64(val)
        case "influxdb_uptime_seconds":
             stats.Uptime = int64(val)
        case "storage_series_count", "storage_tsi_series_count":
             stats.Cardinality += int64(val)
        }
        
        // Track per-bucket write requests
        if strings.HasPrefix(baseName, "http_api_requests_total") && strings.Contains(name, "path=\"/api/v2/write\"") {
            // Extract bucket name from label if present e.g., bucket="my-bucket"
            if strings.Contains(name, "bucket=\"") {
                start := strings.Index(name, "bucket=\"") + 8
                end := start + strings.Index(name[start:], "\"")
                if start > 7 && end > start {
                    bucket := name[start:end]
                    stats.BucketWrites[bucket] += int64(val)
                }
            } else {
                // Generic write request without specific bucket label in some versions
                stats.BucketWrites["system"] += int64(val)
            }
        }
        
        // Store interesting fields (skip NaN/Inf already filtered above)
        stats.Metrics[baseName] = val
	}
    
    // Fill specific fields from parsed map if not caught in switch/aggregates
    // Note: Prom metrics are cumulative counters.
    // Rate calculation usually happens in backend or frontend by comparing prev value.
    // We send raw counters.
    
	return stats, nil
}

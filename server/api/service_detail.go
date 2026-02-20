package api

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/datavast/datavast/server/storage"
	"github.com/gin-gonic/gin"
)

// Service detail endpoints

// HandleGetServiceStats returns comprehensive stats for a service
func (h *IngestionHandler) HandleGetServiceStats(c *gin.Context) {
	serviceName := c.Param("service")
	host := c.Query("host")
	duration := c.DefaultQuery("duration", "1h")
	fromStr := c.Query("from")
	toStr := c.Query("to")

	_, startTime, endTime, _, err := ParseTimeRange(duration, fromStr, toStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid time range"})
		return
	}

	// Debug logging
	fmt.Printf("[DEBUG] Service: %s, Duration: %s, StartTime: %v, EndTime: %v\n", serviceName, duration, startTime, endTime)

	// Query access logs for stats
	query := `
		SELECT 
			count() as total_requests,
			sum(bytes_sent) as total_bytes,
			countIf(status_code >= 200 AND status_code < 300) as status_2xx,
			countIf(status_code >= 300 AND status_code < 400) as status_3xx,
			countIf(status_code >= 400 AND status_code < 500) as status_4xx,
			countIf(status_code >= 500 AND status_code < 600) as status_5xx
		FROM datavast.access_logs
		WHERE service = ? AND timestamp >= ? AND timestamp <= ?
	`

	args := []interface{}{serviceName, startTime, endTime}
	fmt.Printf("[DEBUG] Query args: %v\n", args)
	if host != "" {
		query += " AND host = ?"
		args = append(args, host)
	}

	rows, err := h.Logs.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed"})
		return
	}
	defer rows.Close()

	stats := gin.H{
		"service":       serviceName,
		"host":          host,
		"period":        duration,
		"total_requests": 0,
		"total_bytes":   0,
		"status_2xx":    0,
		"status_3xx":    0,
		"status_4xx":    0,
		"status_5xx":    0,
	}

	if rows.Next() {
		var totalReq, totalBytes, s2xx, s3xx, s4xx, s5xx uint64
		if err := rows.Scan(&totalReq, &totalBytes, &s2xx, &s3xx, &s4xx, &s5xx); err == nil {
			fmt.Printf("[DEBUG] Scanned results: req=%d, bytes=%d, 2xx=%d, 4xx=%d, 5xx=%d\n", totalReq, totalBytes, s2xx, s4xx, s5xx)
			stats["total_requests"] = totalReq
			stats["total_bytes"] = totalBytes
			stats["status_2xx"] = s2xx
			stats["status_3xx"] = s3xx
			stats["status_4xx"] = s4xx
			stats["status_5xx"] = s5xx
			
			// Calculate requests per second
			durSeconds := endTime.Sub(startTime).Seconds()
			if durSeconds > 0 {
				stats["requests_per_second"] = float64(totalReq) / durSeconds
			}
		} else {
			fmt.Printf("[DEBUG] Scan error: %v\n", err)
		}
	} else {
		fmt.Printf("[DEBUG] No rows returned from query\n")
	}

	c.JSON(http.StatusOK, stats)
}

// HandleGetAccessLogs returns recent access logs for web servers
func (h *IngestionHandler) HandleGetAccessLogs(c *gin.Context) {
	serviceName := c.Param("service")
	host := c.Query("host")
	limit := c.DefaultQuery("limit", "100")
	duration := c.DefaultQuery("duration", "1h")
	fromStr := c.Query("from")
	toStr := c.Query("to")

	_, startTime, endTime, _, err := ParseTimeRange(duration, fromStr, toStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid time range"})
		return
	}

	query := `
		SELECT timestamp, ip, method, path, status_code, bytes_sent, country, city
		FROM datavast.access_logs
		WHERE service = ? AND timestamp >= ? AND timestamp <= ?
	`

	args := []interface{}{serviceName, startTime, endTime}
	if host != "" {
		query += " AND host = ?"
		args = append(args, host)
	}

	// Validate limit to prevent SQL injection
	limitInt, err := strconv.Atoi(limit)
	if err != nil || limitInt < 1 || limitInt > 1000 {
		limitInt = 50
	}
	query += fmt.Sprintf(" ORDER BY timestamp DESC LIMIT %d", limitInt)

	rows, err := h.Logs.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"logs": []gin.H{}, "count": 0})
		return
	}
	defer rows.Close()

	var logs []gin.H
	for rows.Next() {
		var timestamp time.Time
		var ip, method, path, country, city string
		var statusCode int
		var bytesSent int64

		if err := rows.Scan(&timestamp, &ip, &method, &path, &statusCode, &bytesSent, &country, &city); err == nil {
			logs = append(logs, gin.H{
				"timestamp":   timestamp,
				"ip":          ip,
				"method":      method,
				"path":        path,
				"status_code": statusCode,
				"bytes_sent":  bytesSent,
				"country":     country,
				"city":        city,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"logs":  logs,
		"count": len(logs),
	})
}

// HandleGetGeoStats returns geographic distribution for a service
func (h *IngestionHandler) HandleGetGeoStats(c *gin.Context) {
	serviceName := c.Param("service")
	host := c.Query("host")
	duration := c.DefaultQuery("duration", "1h")
	fromStr := c.Query("from")
	toStr := c.Query("to")

	_, startTime, endTime, _, err := ParseTimeRange(duration, fromStr, toStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid time range"})
		return
	}

	// Query for top countries
	countryQuery := `
		SELECT country, count() as count
		FROM datavast.access_logs
		WHERE service = ? AND timestamp >= ? AND timestamp <= ? AND country != ''
	`

	args := []interface{}{serviceName, startTime, endTime}
	if host != "" {
		countryQuery += " AND host = ?"
		args = append(args, host)
	}

	countryQuery += " GROUP BY country ORDER BY count DESC LIMIT 10"

	rows, err := h.Logs.Query(countryQuery, args...)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"top_countries": []gin.H{}, "top_cities": []gin.H{}})
		return
	}
	defer rows.Close()

	var countries []gin.H
	for rows.Next() {
		var country string
		var count uint64
		if err := rows.Scan(&country, &count); err == nil {
			countries = append(countries, gin.H{
				"country": country,
				"count":   count,
			})
		}
	}

	// Query for top cities
	cityQuery := `
		SELECT city, country, count() as count
		FROM datavast.access_logs
		WHERE service = ? AND timestamp >= ? AND timestamp <= ? AND city != ''
	`

	cityArgs := []interface{}{serviceName, startTime, endTime}
	if host != "" {
		cityQuery += " AND host = ?"
		cityArgs = append(cityArgs, host)
	}

	cityQuery += " GROUP BY city, country ORDER BY count DESC LIMIT 10"

	cityRows, err := h.Logs.Query(cityQuery, cityArgs...)
	if err == nil {
		defer cityRows.Close()
		var cities []gin.H
		for cityRows.Next() {
			var city, country string
			var count uint64
			if err := cityRows.Scan(&city, &country, &count); err == nil {
				cities = append(cities, gin.H{
					"city":    city,
					"country": country,
					"count":   count,
				})
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"top_countries": countries,
			"top_cities":    cities,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"top_countries": countries,
		"top_cities":    []gin.H{},
	})
}

// HandleGetTopIPs returns top IPs by requests or bandwidth
func (h *IngestionHandler) HandleGetTopIPs(c *gin.Context) {
	serviceName := c.Param("service")
	host := c.Query("host")
	limit := c.DefaultQuery("limit", "10")
	duration := c.DefaultQuery("duration", "1h")
	fromStr := c.Query("from")
	toStr := c.Query("to")

	_, startTime, endTime, _, err := ParseTimeRange(duration, fromStr, toStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid time range"})
		return
	}

	// Query for top IPs by request count
	// Use argMax to get the LATEST domain and path for that IP
	query := `
		SELECT ip, count() as requests, sum(bytes_sent) as bytes, max(country) as country, max(city) as city, max(region) as region, argMax(domain, timestamp) as domain, argMax(path, timestamp) as path
		FROM datavast.access_logs
		WHERE service = ? AND timestamp >= ? AND timestamp <= ?

	`

	args := []interface{}{serviceName, startTime, endTime}
	if host != "" {
		query += " AND host = ?"
		args = append(args, host)
	}

	// Validate limit to prevent SQL injection
	limitInt, err := strconv.Atoi(limit)
	if err != nil || limitInt < 1 || limitInt > 1000 {
		limitInt = 50
	}
	query += fmt.Sprintf(" GROUP BY ip ORDER BY requests DESC LIMIT %d", limitInt)

	rows, err := h.Logs.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"by_requests": []gin.H{}})
		return
	}
	defer rows.Close()

	var topIPs []gin.H
	for rows.Next() {
	var ip, country, city, region, domain, path string
		var requests uint64
		var bytes uint64

		if err := rows.Scan(&ip, &requests, &bytes, &country, &city, &region, &domain, &path); err == nil {
			topIPs = append(topIPs, gin.H{
				"ip":       ip,
				"requests": requests,
				"bytes":    bytes,
				"country":  country,
				"city":     city,
				"region":   region,
				"domain":   domain,
                "path":     path,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"by_requests": topIPs,
	})
}

// HandleIngestServiceStats accepts DB metrics from the agent
func (h *IngestionHandler) HandleIngestServiceStats(c *gin.Context) {
	var entry storage.ServiceStatsEntry
	if err := c.BindJSON(&entry); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if entry.Timestamp.IsZero() {
		entry.Timestamp = time.Now()
	}

	if err := h.Logs.InsertServiceStats(entry); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to store service stats"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// HandleGetServiceDBStats returns the latest stats for any database service
// Used for MySQL, Redis, PostgreSQL, MongoDB
func (h *IngestionHandler) HandleGetServiceDBStats(c *gin.Context) {
	service := c.Param("service")
	host := c.Query("host")
	duration := c.DefaultQuery("duration", "5m")
	fromStr := c.Query("from")
	toStr := c.Query("to")

	_, startTime, endTime, _, err := ParseTimeRange(duration, fromStr, toStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid time range"})
		return
	}

	statsJSON, ts, err := h.Logs.GetLatestServiceStats(host, service, startTime, endTime)
	if err != nil || statsJSON == "" {
		c.JSON(http.StatusOK, gin.H{"stats": nil, "timestamp": nil})
		return
	}

	// Return raw JSON to frontend
	c.Data(http.StatusOK, "application/json", []byte(fmt.Sprintf(
		`{"stats":%s,"timestamp":"%s"}`, statsJSON, ts.Format(time.RFC3339))))
}


package api

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/vastlogs/vastlogs/server/storage"
)

// HandleGetMonitors lists all configured monitors with their active status
func (h *IngestionHandler) HandleGetMonitors(c *gin.Context) {
	cfg := h.Config.Get()
	
	type MonitorWithState struct {
		storage.MonitorConfig
		Status    string    `json:"status"`
		LastCheck time.Time `json:"last_check"`
	}
	
	var result []MonitorWithState
	for _, m := range cfg.Monitors {
		status, lastCheck := h.Monitor.GetState(m.ID)
		result = append(result, MonitorWithState{
			MonitorConfig: m,
			Status:        status,
			LastCheck:     lastCheck,
		})
	}
	
	c.JSON(http.StatusOK, result)
}

// HandleCreateMonitor creates a new monitor
func (h *IngestionHandler) HandleCreateMonitor(c *gin.Context) {
	var req storage.MonitorConfig
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid monitor payload"})
		return
	}
	
	if req.ID == "" {
		req.ID = fmt.Sprintf("monitor_%d", time.Now().UnixNano())
	}
	
	cfg := h.Config.Get()
	cfg.Monitors = append(cfg.Monitors, req)
	
	if err := h.Config.Save(cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save monitor"})
		return
	}
	c.JSON(http.StatusCreated, req)
}

// HandleUpdateMonitor updates an existing monitor
func (h *IngestionHandler) HandleUpdateMonitor(c *gin.Context) {
	id := c.Param("id")
	var req storage.MonitorConfig
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid monitor payload"})
		return
	}
	
	cfg := h.Config.Get()
	found := false
	for i, m := range cfg.Monitors {
		if m.ID == id {
			req.ID = id // ensure ID is not mutated
			cfg.Monitors[i] = req
			found = true
			break
		}
	}
	
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "Monitor not found"})
		return
	}
	
	if err := h.Config.Save(cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save monitor"})
		return
	}
	c.JSON(http.StatusOK, req)
}

// HandleDeleteMonitor deletes a monitor
func (h *IngestionHandler) HandleDeleteMonitor(c *gin.Context) {
	id := c.Param("id")
	
	cfg := h.Config.Get()
	var updated []storage.MonitorConfig
	found := false
	for _, m := range cfg.Monitors {
		if m.ID == id {
			found = true
			continue
		}
		updated = append(updated, m)
	}
	
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "Monitor not found"})
		return
	}
	
	cfg.Monitors = updated
	if err := h.Config.Save(cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save monitor config"})
		return
	}
	c.Status(http.StatusNoContent)
}

// HandleGetMonitorHistory fetches heartbeat history
func (h *IngestionHandler) HandleGetMonitorHistory(c *gin.Context) {
	id := c.Param("id")
	history, err := h.Logs.GetMonitorHistory(id, 100)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch history"})
		return
	}
	c.JSON(http.StatusOK, history)
}

// HandleMonitorHeartbeat allows external scripts to ping the cron monitor
func (h *IngestionHandler) HandleMonitorHeartbeat(c *gin.Context) {
	id := c.Param("id")
	if err := h.Monitor.ReceiveHeartbeat(id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

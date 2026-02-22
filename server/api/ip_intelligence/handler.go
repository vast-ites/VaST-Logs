package ip_intelligence

import (
	"net/http"
	"strconv"

	"github.com/datavast/datavast/server/geoip"
	"github.com/datavast/datavast/server/storage"
	"github.com/gin-gonic/gin"
)

type IPHandler struct {
	Logs *storage.LogStore
}

func NewIPHandler(store *storage.LogStore) *IPHandler {
	return &IPHandler{Logs: store}
}

const (
	logPageSize = 100
)

// GetIPDetails returns aggregated info about an IP
func (h *IPHandler) GetIPDetails(c *gin.Context) {
	ip := c.Param("ip")
	agentID := c.Query("agent_id") // Optional filter
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	offset := (page - 1) * logPageSize

	// 1. Get Geo Info
	geo, _ := geoip.GetInstance().Lookup(ip)

	// 2. Check Block Status
	blocked, err := h.Logs.IsIPBlocked(ip, agentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check block status"})
		return
	}

	// 3. Get Security Stats
	sshAttempts, _ := h.Logs.CountSSHEventsForIP(ip, agentID)
	authFailures, _ := h.Logs.CountAuthFailuresForIP(ip, agentID)


	// 4. Get Comprehensive Logs Context with pagination
	recentLogs, err := h.Logs.GetComprehensiveLogsForIP(ip, agentID, logPageSize, offset)
    if err != nil {
        // Fallback or log error, but don't fail the whole request
        recentLogs = []storage.LogEntry{}
    }
    hasMoreLogs := len(recentLogs) == logPageSize

	c.JSON(http.StatusOK, gin.H{
		"ip":             ip,
		"geo":            geo,
		"blocked":        blocked,
		"ssh_attempts":   sshAttempts,
		"auth_failures":  authFailures,
		"recent_logs":    recentLogs,
		"has_more_logs": hasMoreLogs,
	})
}

// GetBlockedIPs returns all blocked IPs for a specific agent
func (h *IPHandler) GetBlockedIPs(c *gin.Context) {
	agentID := c.Query("agent_id")
	if agentID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "agent_id required"})
		return
	}

	ips, err := h.Logs.GetBlockedIPs(agentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if ips == nil {
		ips = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"blocked_ips": ips, "count": len(ips)})
}

// BlockIP blocks an IP for a specific agent
func (h *IPHandler) BlockIP(c *gin.Context) {
	var req struct {
		IP      string `json:"ip"`
		AgentID string `json:"agent_id"`
		Reason  string `json:"reason"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if req.AgentID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "AgentID is required for blocking"})
		return
	}

	if err := h.Logs.BlockIP(req.IP, req.AgentID, req.Reason); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Block command queued. The firewall rule will be applied on the agent within ~30 seconds.",
		"status":  "queued",
	})
}

// UnblockIP removes a block
func (h *IPHandler) UnblockIP(c *gin.Context) {
	var req struct {
		IP      string `json:"ip"`
		AgentID string `json:"agent_id"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if err := h.Logs.UnblockIP(req.IP, req.AgentID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Unblock command queued. The firewall rule will be removed on the agent within ~30 seconds.",
		"status":  "queued",
	})
}

// GetPendingCommands returns pending commands for an agent
func (h *IPHandler) GetPendingCommands(c *gin.Context) {
	agentID := c.Query("agent_id")
	if agentID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "agent_id required"})
		return
	}

    // Security Check: Prevent commands spoofing
    if authAgent, exists := c.Get("agent_id"); exists {
        if agentID != authAgent.(string) {
            c.JSON(http.StatusForbidden, gin.H{"error": "Spoofing detected: payload host does not match authenticated agent ID"})
            return
        }
    }

	cmds, err := h.Logs.GetPendingCommands(agentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if cmds == nil {
		cmds = []storage.AgentCommand{}
	}
	c.JSON(http.StatusOK, gin.H{"commands": cmds})
}

// AckCommand marks a command as completed/failed
func (h *IPHandler) AckCommand(c *gin.Context) {
	var req struct {
		ID     string `json:"id"`
		Status string `json:"status"`
		Output string `json:"output"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if err := h.Logs.AckCommand(req.ID, req.Status, req.Output); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Status(http.StatusOK)
}


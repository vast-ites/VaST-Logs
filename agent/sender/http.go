package sender

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/datavast/datavast/agent/collector"
)

type Client struct {
	BackendURL  string
    AgentSecret string
    Hostname    string
	client      *http.Client
}

func NewClient(backendURL, agentSecret, hostname string) *Client {
	t := &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 100, // Critical for reusing connections to backend
		IdleConnTimeout:     90 * time.Second,
		TLSClientConfig:     &tls.Config{InsecureSkipVerify: true},
	}
	return &Client{
		BackendURL:  backendURL,
		AgentSecret: agentSecret,
		Hostname:    hostname,
		client:      &http.Client{
			Timeout:   5 * time.Second,
			Transport: t,
		},
	}
}

func (c *Client) post(endpoint string, data []byte) error {
    req, err := http.NewRequest("POST", c.BackendURL+endpoint, bytes.NewBuffer(data))
    if err != nil {
        return err
    }
    req.Header.Set("Content-Type", "application/json")
    if c.AgentSecret != "" {
        req.Header.Set("X-Agent-Secret", c.AgentSecret)
    }

    resp, err := c.client.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()

    if resp.StatusCode >= 300 {
        // Read body for error details
        buf := new(bytes.Buffer)
        buf.ReadFrom(resp.Body)
        return fmt.Errorf("HTTP %d: %s", resp.StatusCode, buf.String())
    }

    return nil
}

func (c *Client) SendMetrics(m *collector.SystemMetrics, containers []collector.ContainerMetric, processRaw string) error {
	payload := map[string]interface{}{
        "host":          c.Hostname,
        "process_raw":   processRaw,
		"cpu_percent":   m.CPUPercent,
		"cpu_count":     m.CPUCount,
        "cpu_physical":  m.CPUPhysical,
        "cpu_model":     m.CPUModel,
        "cpu_freq":      m.CPUFreq,
		"memory_usage":  m.MemoryUsage,
		"memory_total":  m.MemoryTotal,
        "swap_usage":    m.SwapUsage,
        "swap_total":    m.SwapTotal,
		"disk_usage":    m.DiskUsage,
		"disk_total":    m.DiskTotal,
        "partitions":    m.Partitions,
        "disk_read_rate": m.DiskReadRate,
        "disk_write_rate": m.DiskWriteRate,
        "disk_read_iops": m.DiskReadIOPS,
        "disk_write_iops": m.DiskWriteIOPS,
		"bytes_sent":    m.BytesSent,
		"bytes_recv":    m.BytesRecv,
        "net_recv_rate": m.NetRecvRate,
        "net_sent_rate": m.NetSentRate,
        "interfaces":    m.Interfaces,
        "uptime":        m.Uptime,
		"ddos_status":   m.DDoSStatus,
        "containers":    containers,
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	return c.post("/ingest/metrics", data)
}

func (c *Client) SendLog(l *collector.LogLine) error {
    service := l.Service
    if service == "" {
        service = "agent"
    }
	payload := map[string]interface{}{
		"source_path": l.Path,
		"message":     l.Content,
		"timestamp":   l.Timestamp,
		"host":        c.Hostname,
		"service":     service,     
		"level":       l.Level,
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return c.post("/ingest/logs", data)
}

func (c *Client) SendProcesses(procs []collector.ProcessInfo) error {
    payload := map[string]interface{}{
        "host":      c.Hostname,
        "processes": procs,
    }
    data, err := json.Marshal(payload)
    if err != nil {
        return err
    }
    return c.post("/ingest/processes", data)
}

func (c *Client) SendFirewall(rules string) error {
    payload := map[string]interface{}{
        "host":  c.Hostname,
        "rules": rules,
    }
    data, err := json.Marshal(payload)
    if err != nil {
        return err
    }
    return c.post("/ingest/firewall", data)
}

// --- Agent Command System ---

type Command struct {
    ID       string `json:"id"`
    AgentID  string `json:"agent_id"`
    Action   string `json:"action"`
    TargetIP string `json:"target_ip"`
    Status   string `json:"status"`
}

func (c *Client) get(endpoint string) (*http.Response, error) {
    req, err := http.NewRequest("GET", c.BackendURL+endpoint, nil)
    if err != nil {
        return nil, err
    }
    req.Header.Set("Content-Type", "application/json")
    if c.AgentSecret != "" {
        req.Header.Set("X-Agent-Secret", c.AgentSecret)
    }
    return c.client.Do(req)
}

// FetchCommands polls the server for pending commands assigned to this agent.
func (c *Client) FetchCommands() ([]Command, error) {
    resp, err := c.get("/agent/commands?agent_id=" + c.Hostname)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    var result struct {
        Commands []Command `json:"commands"`
    }
    if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
        return nil, err
    }
    return result.Commands, nil
}

// AckCommand reports command execution result back to the server.
func (c *Client) AckCommand(id, status, output string) error {
    payload := map[string]interface{}{
        "id":     id,
        "status": status,
        "output": output,
    }
    data, err := json.Marshal(payload)
    if err != nil {
        return err
    }
    return c.post("/agent/commands/ack", data)
}

// SendFirewallSync sends the list of actually-blocked IPs from iptables to the server.
func (c *Client) SendFirewallSync(blockedIPs []string) error {
    if blockedIPs == nil {
        blockedIPs = []string{}
    }
    payload := map[string]interface{}{
        "host":        c.Hostname,
        "blocked_ips": blockedIPs,
    }
    data, err := json.Marshal(payload)
    if err != nil {
        return err
    }
    return c.post("/ingest/firewall-sync", data)
}

// SendServiceStats sends database service metrics to the server.
func (c *Client) SendServiceStats(service, statsJSON string) error {
    payload := map[string]interface{}{
        "host":    c.Hostname,
        "service": service,
        "stats":   statsJSON,
    }
    data, err := json.Marshal(payload)
    if err != nil {
        return err
    }
    return c.post("/ingest/service-stats", data)
}

// SendSecurityEvent pushes a security event (e.g. SSH brute-force block) to the server
// so it can be evaluated against alert rules and appear in alert history.
func (c *Client) SendSecurityEvent(eventType string, details map[string]interface{}) error {
    payload := map[string]interface{}{
        "host":       c.Hostname,
        "event_type": eventType,
        "details":    details,
    }
    data, err := json.Marshal(payload)
    if err != nil {
        return err
    }
    return c.post("/ingest/security-event", data)
}

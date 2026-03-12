package monitor

import (
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/vastlogs/vastlogs/server/alert"
	"github.com/vastlogs/vastlogs/server/storage"
	"github.com/vastlogs/vastlogs/server/telemetry"
)

type MonitorState struct {
	Status           string    // "UP", "DOWN", "PENDING"
	ConsecutiveFails int
	LastCheck        time.Time
}

type MonitorService struct {
	Config  *storage.ConfigStore
	Logs    *storage.LogStore
	Alerts  *alert.AlertService
	
	states  map[string]*MonitorState
	mu      sync.RWMutex
}

func NewMonitorService(cfg *storage.ConfigStore, logs *storage.LogStore, alerts *alert.AlertService) *MonitorService {
	s := &MonitorService{
		Config: cfg,
		Logs:   logs,
		Alerts: alerts,
		states: make(map[string]*MonitorState),
	}
	go s.runScheduler()
	return s
}

func (s *MonitorService) runScheduler() {
	ticker := time.NewTicker(5 * time.Second)
	for range ticker.C {
		cfg := s.Config.Get()
		now := time.Now()

		for _, m := range cfg.Monitors {
			if !m.Enabled {
				continue
			}
			
			// Heartbeat monitors are passive (agents push to us)
			if m.Type == "heartbeat" {
				// We just need to check if we haven't received a heartbeat within interval
				s.mu.RLock()
				state, ok := s.states[m.ID]
				s.mu.RUnlock()
				
				if ok {
					interval := m.Interval
					if interval <= 0 { interval = 60 }
					if now.Sub(state.LastCheck) > time.Duration(interval)*time.Second {
						s.processResult(m, false, 0, "Heartbeat is offline")
					}
				} else {
				    // Initialize Heartbeat state to DOWN if no hearbeat received yet
				    s.mu.Lock()
				    s.states[m.ID] = &MonitorState{Status: "DOWN", LastCheck: now.Add(-time.Hour)}
				    s.mu.Unlock()
				}
				continue
			}

			s.mu.RLock()
			state, ok := s.states[m.ID]
			s.mu.RUnlock()

			if !ok {
				state = &MonitorState{Status: "PENDING"}
				s.mu.Lock()
				s.states[m.ID] = state
				s.mu.Unlock()
			}

			interval := m.Interval
			if interval <= 0 { interval = 60 }

			if now.Sub(state.LastCheck) >= time.Duration(interval)*time.Second {
				state.LastCheck = now
				go s.runProbe(m)
			}
		}
	}
}

// ReceiveHeartbeat is called by the API endpoint when a cron/job pings it
func (s *MonitorService) ReceiveHeartbeat(id string) error {
	cfg := s.Config.Get()
	var monitor *storage.MonitorConfig
	for _, m := range cfg.Monitors {
		if m.ID == id {
			monitor = &m
			break
		}
	}
	
	if monitor == nil || !monitor.Enabled || monitor.Type != "heartbeat" {
		return fmt.Errorf("invalid or disabled heartbeat monitor")
	}

	s.processResult(*monitor, true, 0, "Heartbeat received")
	return nil
}

func (s *MonitorService) runProbe(m storage.MonitorConfig) {
	var up bool
	var rtt int32
	var msg string

	switch m.Type {
	case "http", "api":
		up, rtt, msg = probeHTTP(m)
	case "ping":
		up, rtt, msg = probePing(m)
	case "tcp":
		up, rtt, msg = probeTCP(m)
	case "ssl":
		up, rtt, msg = probeSSL(m)
	case "dns":
		up, rtt, msg = probeDNS(m)
	default:
		return // Unsupported
	}

	s.processResult(m, up, rtt, msg)
}

func (s *MonitorService) processResult(m storage.MonitorConfig, up bool, rtt int32, msg string) {
	s.mu.Lock()
	state, ok := s.states[m.ID]
	if !ok {
		state = &MonitorState{Status: "PENDING"}
		s.states[m.ID] = state
	}
	
	if m.Type == "heartbeat" && up {
	    state.LastCheck = time.Now()
	}

	prevStatus := state.Status

	if up {
		state.ConsecutiveFails = 0
		state.Status = "UP"
	} else {
		state.ConsecutiveFails++
		failuresNeeded := m.ThresholdFailures
		if failuresNeeded <= 0 { failuresNeeded = 1 }

		if state.ConsecutiveFails >= failuresNeeded {
			state.Status = "DOWN"
		}
	}
	s.mu.Unlock()

	// Insert heartbeat history
	s.Logs.InsertMonitorHeartbeat(storage.MonitorHeartbeat{
		Timestamp:      time.Now(),
		MonitorID:      m.ID,
		Status:         state.Status,
		ResponseTimeMs: rtt,
		Message:        msg,
	})

	// Dispatch Alert if status changed
	if prevStatus != "PENDING" && prevStatus != state.Status {
		if s.Alerts != nil {
			var sev, text string
			if state.Status == "DOWN" {
				sev = "CRITICAL"
				text = fmt.Sprintf("Monitor [%s] is DOWN. Reason: %s", m.Name, msg)
			} else {
				sev = "INFO"
				text = fmt.Sprintf("Monitor [%s] is back UP.", m.Name)
			}
			
			// Use the existing Alert rule engine structure loosely, 
			// though monitor alerts may not necessarily be bound to a "rule"
			// To leverage DispatchRule, we can construct a dummy rule or use legacy dispatcher.
			// The feature req asks for alerts via channels. 
			
			// We will just invoke sendWebhook/Email directly via a helper if AlertRules don't perfectly fit.
			// Actually, let's use global Disaptch for now or create a pseudo-rule to dispatch nicely.
			s.Logs.InsertAlert(storage.AlertEntry{
				Timestamp: time.Now(),
				Host:      "System",
				Type:      "Monitor: " + m.Name,
				Severity:  sev,
				Message:   text,
				Resolved:  state.Status == "UP",
			})
			
			// For notification channels, let's just trigger global ones for simplicity 
			// unless we bind channels to monitors. (Adding Channels to MonitorConfig is better in the future, 
			// but for now let's just use Dispatch).
			s.Alerts.Dispatch(text)
		}
		
		telemetry.Track("monitor", "status_change", 1.0)
	}

	// Check response time threshold
	if up && m.ThresholdResponseTime > 0 && rtt > int32(m.ThresholdResponseTime) {
		if s.Alerts != nil {
			msg := fmt.Sprintf("Monitor [%s] response time is high: %d ms (Threshold: %d ms)", m.Name, rtt, m.ThresholdResponseTime)
			s.Logs.InsertAlert(storage.AlertEntry{
				Timestamp: time.Now(),
				Host:      "System",
				Type:      "Monitor: " + m.Name,
				Severity:  "WARNING",
				Message:   msg,
				Resolved:  false,
			})
			s.Alerts.Dispatch(msg)
		}
	}
}

// ----------------------------------------------------------------------------
// Probers
// ----------------------------------------------------------------------------

func probeHTTP(m storage.MonitorConfig) (bool, int32, string) {
	tout := m.Timeout
	if tout <= 0 { tout = 10 }
	client := &http.Client{
		Timeout: time.Duration(tout) * time.Second,
	}
	if m.IgnoreSSL {
		client.Transport = &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		}
	}
	start := time.Now()
	
	// Create request
	req, err := http.NewRequest("GET", m.Target, nil)
	if err != nil {
		return false, 0, err.Error()
	}
	// Add user agent
	req.Header.Set("User-Agent", "VaSTLogs-Monitor/1.0")

	resp, err := client.Do(req)
	
	elapsed := time.Since(start).Milliseconds()
	if err != nil {
		return false, int32(elapsed), err.Error()
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return false, int32(elapsed), fmt.Sprintf("HTTP %d", resp.StatusCode)
	}

	if m.Keyword != "" {
		bodyBytes, _ := io.ReadAll(resp.Body)
		if !strings.Contains(string(bodyBytes), m.Keyword) {
			return false, int32(elapsed), fmt.Sprintf("Keyword '%s' not found", m.Keyword)
		}
	}

	return true, int32(elapsed), fmt.Sprintf("HTTP %d OK", resp.StatusCode)
}

func probePing(m storage.MonitorConfig) (bool, int32, string) {
	start := time.Now()
	tout := m.Timeout
	if tout <= 0 { tout = 5 }

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("ping", "-n", "1", "-w", fmt.Sprintf("%d", tout*1000), m.Target)
	} else {
		cmd = exec.Command("ping", "-c", "1", "-W", fmt.Sprintf("%d", tout), m.Target)
	}
	
	err := cmd.Run()
	elapsed := time.Since(start).Milliseconds()
	
	if err != nil {
		return false, int32(elapsed), "Ping failed or timeout"
	}
	return true, int32(elapsed), "OK"
}

func probeTCP(m storage.MonitorConfig) (bool, int32, string) {
	start := time.Now()
	tout := m.Timeout
	if tout <= 0 { tout = 5 }
	
	addr := fmt.Sprintf("%s:%d", m.Target, m.Port)
	conn, err := net.DialTimeout("tcp", addr, time.Duration(tout)*time.Second)
	
	elapsed := int32(time.Since(start).Milliseconds())
	if err != nil {
		return false, elapsed, err.Error()
	}
	conn.Close()
	return true, elapsed, "OK"
}

func probeSSL(m storage.MonitorConfig) (bool, int32, string) {
	start := time.Now()
	tout := m.Timeout
	if tout <= 0 { tout = 10 }
	
	addr := m.Target
	if !strings.Contains(addr, ":") {
		addr = addr + ":443"
	}
	
	dialer := &net.Dialer{Timeout: time.Duration(tout) * time.Second}
	conn, err := tls.DialWithDialer(dialer, "tcp", addr, &tls.Config{InsecureSkipVerify: m.IgnoreSSL})
	
	elapsed := int32(time.Since(start).Milliseconds())
	if err != nil {
		return false, elapsed, err.Error()
	}
	defer conn.Close()

	var certs = conn.ConnectionState().PeerCertificates
	if len(certs) == 0 {
		return false, elapsed, "No certificates found"
	}

	expiry := certs[0].NotAfter
	daysRemaining := int(time.Until(expiry).Hours() / 24)

	// Assume alert threshold for SSL is 14 days
	if daysRemaining < 14 {
		return false, elapsed, fmt.Sprintf("SSL Expires in %d days", daysRemaining)
	}

	return true, elapsed, fmt.Sprintf("SSL Valid (%d days remaining)", daysRemaining)
}

func probeDNS(m storage.MonitorConfig) (bool, int32, string) {
	start := time.Now()
	ips, err := net.LookupHost(m.Target)
	elapsed := int32(time.Since(start).Milliseconds())
	
	if err != nil {
		return false, elapsed, err.Error()
	}
	
	if m.ExpectedDNS != "" {
		found := false
		for _, ip := range ips {
			if ip == m.ExpectedDNS {
				found = true
				break
			}
		}
		if !found {
			return false, elapsed, fmt.Sprintf("Expected IP %s not found. Got: %v", m.ExpectedDNS, ips)
		}
	}
	return true, elapsed, "OK"
}

// GetState returns the current in-memory status of the monitor
func (s *MonitorService) GetState(monitorID string) (string, time.Time) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	state, ok := s.states[monitorID]
	if !ok {
		return "UNKNOWN", time.Time{}
	}
	return state.Status, state.LastCheck
}

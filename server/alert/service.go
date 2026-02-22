package alert

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
    "net/smtp"
    "strings"
    "time"
    "log"
    "io"
    "sync"

    "github.com/datavast/datavast/server/storage"
)

type AlertService struct {
    Config  *storage.ConfigStore
    Logs    *storage.LogStore
    Metrics *storage.MetricsStore
    
    // Rate Limiting
    mu            sync.RWMutex
    lastTriggered map[string]time.Time // Key: ruleID|host -> timestamp
}

func NewAlertService(cfg *storage.ConfigStore, logs *storage.LogStore, metrics *storage.MetricsStore) *AlertService {
    s := &AlertService{
        Config:        cfg, 
        Logs:          logs,
        Metrics:       metrics,
        lastTriggered: make(map[string]time.Time),
    }
    go s.startAgentMonitor()
    return s
}

func (s *AlertService) CheckAndAlert(host string, netReceiveRate float64, ddosStatus string) {
    // Legacy generic check for DDoS
    s.EvaluateRules(host, map[string]float64{
        "net_recv_rate": netReceiveRate,
        "ddos_status": func() float64 {
            if ddosStatus == "DDoS" { return 1.0 }
            return 0.0
        }(),
    }, "")
}

func (s *AlertService) startAgentMonitor() {
    ticker := time.NewTicker(30 * time.Second)
    for range ticker.C {
        if s.Metrics == nil { continue }
        
        hosts, err := s.Metrics.GetHosts()
        if err != nil || hosts == nil { continue }
        
        now := time.Now()
        for _, h := range hosts {
            diff := now.Sub(h.LastSeen)
            // 60 seconds threshold (1 minute) matches frontend isOffline logic
            isOffline := diff > 60*time.Second 
            
            offlineStatus := 0.0
            if isOffline {
                offlineStatus = 1.0
            }
            
            // Pass into evaluate rules, just like generic metrics
            s.EvaluateRules(h.Hostname, map[string]float64{
                "agent_offline": offlineStatus,
            }, h.IP)
        }
    }
}

// EvaluateRules checks all active rules against the provided metrics
func (s *AlertService) EvaluateRules(host string, metrics map[string]float64, hostInfo string) {
    cfg := s.Config.Get()
    cooldown := 1 * time.Minute // 1 Minute Rate Limit
    
    // Create lookup map for channels
    channels := make(map[string]storage.NotificationChannel)
    for _, ch := range cfg.NotificationChannels {
        channels[ch.ID] = ch
    }

    for _, rule := range cfg.AlertRules {
        if !rule.Enabled { continue }
        
        // 1. Host Filter
        if rule.Host != "" && rule.Host != "*" && rule.Host != host {
            continue
        }

        // 2. Check Silence
        // Check specific host silence
        if expiry, ok := rule.Silenced[host]; ok {
            if time.Now().Before(expiry) {
                // fmt.Printf("DEBUG: Rule %s silenced on %s until %v\n", rule.Name, host, expiry)
                continue 
            }
        }
        // Check wildcard silence (if user silenced "*")
        if expiry, ok := rule.Silenced["*"]; ok {
            if time.Now().Before(expiry) { continue }
        }

        // 3. Check Metric
        val, ok := metrics[rule.Metric]
        if !ok { continue }

        triggered := false
        switch rule.Operator {
        case ">":
            triggered = val > rule.Threshold
        case "<":
            triggered = val < rule.Threshold
        case ">=":
            triggered = val >= rule.Threshold
        case "<=":
            triggered = val <= rule.Threshold
        }

        // DEBUG: Print ALL rules to see what's happening
        // fmt.Printf("DEBUG_ALERT: Rule='%s' Metric='%s' Host='%s' Val=%.2f Threshold=%.2f Triggered=%v\n", rule.Name, rule.Metric, host, val, rule.Threshold, triggered)

        if triggered {
            // 4. Rate Limiting Check
            triggerKey := fmt.Sprintf("%s|%s", rule.ID, host)
            s.mu.RLock()
            last, exists := s.lastTriggered[triggerKey]
            s.mu.RUnlock()
            
            if exists && time.Since(last) < cooldown {
                continue // Suppress (Flood Control)
            }
            
            // Mark triggered
            s.mu.Lock()
            s.lastTriggered[triggerKey] = time.Now()
            s.mu.Unlock()

            // Construct Rich Message
            msg := fmt.Sprintf(
                "🚨 **Alert Triggered**\n" +
                "**Rule:** %s\n" +
                "**Server:** %s\n" +
                "**IPs:** %s\n" +
                "**Metric:** %s\n" +
                "**Value:** %.2f (Threshold: %s %.2f)\n" +
                "**Time:** %s",
                rule.Name, host, hostInfo, rule.Metric, val, rule.Operator, rule.Threshold, time.Now().Format(time.RFC1123),
            )
            
            // Log to DB
            if s.Logs != nil {
                s.Logs.InsertAlert(storage.AlertEntry{
                    Timestamp: time.Now(),
                    Host:      host,
                    Type:      "Rule: " + rule.Name,
                    Severity:  "WARNING",
                    Message:   msg,
                    Resolved:  false,
                })
            }

            // Dispatch
            s.DispatchRule(rule, channels, msg)
        }
    }
}

func (s *AlertService) DispatchRule(rule storage.AlertRule, channels map[string]storage.NotificationChannel, message string) {
    // 1. Rule Specific Channels
    for _, chID := range rule.Channels {
        if ch, ok := channels[chID]; ok {
            switch ch.Type {
            case "webhook":
                go s.sendWebhook(ch.Config["url"], message)
            case "email":
                go s.sendEmail([]string{ch.Config["email"]}, message)
            }
        }
    }
    
    // 2. Global Legacy Channels (if configured to fallback? Or just migrated?)
    // For now, we respect the Rule definition strictly.
}

// Dispatch Legacy (for backward compat if needed, or migration)
func (s *AlertService) Dispatch(message string) {
    cfg := s.Config.Get()
    for _, url := range cfg.WebhookURLs {
        go s.sendWebhook(url, message)
    }
    if len(cfg.AlertEmails) > 0 {
        go s.sendEmail(cfg.AlertEmails, message)
    }
}

func (s *AlertService) sendWebhook(url, message string) {
    if url == "" { return }
    // Support multiple formats (Discord uses 'content', Slack/Teams use 'text')
    payload := map[string]interface{}{
        "content": message,
        "text":    message,
    }
    data, _ := json.Marshal(payload)
    resp, err := http.Post(url, "application/json", bytes.NewBuffer(data))
    if err != nil {
        log.Printf("Webhook failed: %v", err)
        return
    }
    defer resp.Body.Close()
    
    if resp.StatusCode >= 400 {
        body, _ := io.ReadAll(resp.Body)
        log.Printf("Webhook Error %d: %s (URL: %s)", resp.StatusCode, string(body), url)
    }
}

func (s *AlertService) sendEmail(to []string, message string) {
    cfg := s.Config.Get()
    if cfg.SMTPServer == "" || len(to) == 0 { return }
    
    auth := smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPassword, cfg.SMTPServer)
    msg := []byte(fmt.Sprintf("To: %s\r\nSubject: DataVast Alert\r\n\r\n%s\r\n", strings.Join(to, ","), message))
    addr := fmt.Sprintf("%s:%d", cfg.SMTPServer, cfg.SMTPPort)
    if err := smtp.SendMail(addr, auth, cfg.SMTPUser, to, msg); err != nil {
        log.Printf("Email failed: %v", err)
    }
}

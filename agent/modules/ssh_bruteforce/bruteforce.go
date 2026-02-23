package ssh_bruteforce

import (
	"context"
	"fmt"
	"log"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/datavast/datavast/agent/collector"
	"github.com/datavast/datavast/agent/config"
	"github.com/datavast/datavast/agent/modules"
	"github.com/datavast/datavast/agent/sender"
	"github.com/hpcloud/tail"
)

type BruteforceModule struct {
	client *sender.Client
	config *config.AgentConfig
	fwCol  *collector.FirewallCollector
}

func init() {
	modules.Register(&BruteforceModule{})
}

func (m *BruteforceModule) Name() string {
	return "SSH Brute-Force & IP Remediation"
}

func (m *BruteforceModule) ShouldEnable(cfg *config.AgentConfig) bool {
	// Auto-detect: only activate if an auth log file exists on this host
	for _, p := range logFilePaths {
		if _, err := os.Stat(p); err == nil {
			return true
		}
	}
	return false
}

func (m *BruteforceModule) Init(cfg *config.AgentConfig, client *sender.Client) error {
	m.config = cfg
	m.client = client
	m.fwCol = collector.NewFirewallCollector()
	return nil
}

var ipPattern = `(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})`
// e.g. "Failed password for root from X.X.X.X port 1000 ssh2"
var failedPwdRegex = regexp.MustCompile(`Failed password for .* from ` + ipPattern)

// e.g. "Invalid user admin from X.X.X.X port 1000"
var invalidUserRegex = regexp.MustCompile(`Invalid user .* from ` + ipPattern)

var logFilePaths = []string{
	"/var/log/auth.log", 
	"/var/log/secure",
}

type failureRecord struct {
	count     int
	lastSeen time.Time
}

func (m *BruteforceModule) Start(ctx context.Context) error {
	var targetLog string
	for _, p := range logFilePaths {
		if _, err := os.Stat(p); err == nil {
			targetLog = p
			break
		}
	}

	if targetLog == "" {
		log.Println("[SSH Brute-Force Module] No supported auth log found (/var/log/auth.log or /var/log/secure). Skipping module.")
		return nil
	}

	log.Printf("[SSH Brute-Force Module] Tailing %s for failed authentications...", targetLog)

	t, err := tail.TailFile(targetLog, tail.Config{
		Follow:   true,
		ReOpen:   true,
		Location: &tail.SeekInfo{Offset: 0, Whence: 2},
		Logger:   tail.DiscardingLogger,
	})
	if err != nil {
		return err
	}

	failures := make(map[string]*failureRecord)
	var mu sync.Mutex

	// Cleanup old failures
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				now := time.Now()
				mu.Lock()
				for ip, record := range failures {
					if now.Sub(record.lastSeen) > 10*time.Minute {
						delete(failures, ip)
					}
				}
				mu.Unlock()
			}
		}
	}()

	for {
		select {
		case <-ctx.Done():
			t.Cleanup()
			return nil
		case line, ok := <-t.Lines:
			if !ok {
				continue
			}

			var ip string
			if matches := failedPwdRegex.FindStringSubmatch(line.Text); len(matches) > 1 {
				ip = matches[1]
			} else if matches := invalidUserRegex.FindStringSubmatch(line.Text); len(matches) > 1 {
				ip = matches[1]
			}

			if ip != "" {
				mu.Lock()
				record, exists := failures[ip]
				if !exists {
					record = &failureRecord{}
					failures[ip] = record
				}
				record.count++
				record.lastSeen = time.Now()

				// Threat Threshold: 5 failed attempts in 10 minutes from a single IP
				if record.count == 5 {
					log.Printf("⚠️ [Threat Detected] SSH Brute-Force from %s (%d attempts). Initiating automated IP remediation...", ip, record.count)
					out, cmdErr := m.fwCol.ExecuteIPTablesCommand("block_ip", ip)
					if cmdErr != nil {
						log.Printf("❌ [Remediation Failed] Could not dynamically block %s via iptables: %v", ip, cmdErr)
					} else {
						log.Printf("🛡️ [Remediation Success] Auto-blocked malicious IP %s directly at network edge: %s", ip, strings.TrimSpace(out))
						
						// Dispatch alert to backend logs so UI user knows
						go m.client.SendLog(&collector.LogLine{
							Path:      "agent_security",
							Content:   fmt.Sprintf("[Threat Remediation] Auto-blocked malicious IP %s directly at network edge after 5 failed SSH attempts.", ip),
							Timestamp: time.Now(),
							Service:   "security",
							Level:     "CRITICAL",
						})

						// Optionally reset the counter to prevent duplicate firewall additions 
						// if the attacker continues spamming the logs before iptables drops the socket completely
                        record.count = 0
					}
				}
				mu.Unlock()
			}
		}
	}
}

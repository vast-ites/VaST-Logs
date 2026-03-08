package storage

import (
	"encoding/json"
    "math/rand"
	"os"
	"sync"
    "time"
)

type AlertRule struct {
    ID        string               `json:"id"`
    Name      string               `json:"name"`
    Enabled   bool                 `json:"enabled"`
    Metric    string               `json:"metric"`      // e.g. "cpu_percent", "net_recv_rate"
    Host      string               `json:"host"`        // "*" or specific host
    Operator  string               `json:"operator"`    // ">", "<"
    Threshold float64              `json:"threshold"`
    Channels  []string             `json:"channels"`    // List of Channel IDs
    Silenced  map[string]time.Time `json:"silenced"`    // Host -> ExpiryTime
}

type NotificationChannel struct {
    ID     string            `json:"id"`
    Name   string            `json:"name"`
    Type   string            `json:"type"`   // "email", "webhook"
    Config map[string]string `json:"config"` // URL, Email Address, etc.
}

type SSOProvider struct {
    ID           string `json:"id"`
    Name         string `json:"name"` // E.g., "Google", "Okta", "Keycloak"
    Type         string `json:"type"` // "oauth2", "oidc", "saml"
    Enabled      bool   `json:"enabled"`
    
    // OAuth2 / OIDC fields
    ClientID     string `json:"client_id"`
    ClientSecret string `json:"client_secret"`
    IssuerURL    string `json:"issuer_url"`
    AuthURL      string `json:"auth_url"`
    TokenURL     string `json:"token_url"`
    Scopes       string `json:"scopes"` // Comma-separated

    // SAML specific fields
    IDPMetadataURL string `json:"idp_metadata_url"`
    SPCert         string `json:"sp_cert"` // Optional if needed for signed requests
    SPKey          string `json:"sp_key"`
}

type SystemConfig struct {
	RetentionDays  int     `json:"retention_days"`
	DDoSThreshold  float64 `json:"ddos_threshold"`
	EmailAlerts    bool      `json:"email_alerts"`
    AlertEmails    []string  `json:"alert_emails"`  // Legacy
    WebhookURLs    []string  `json:"webhook_urls"`  // Legacy
    
    AlertRules           []AlertRule           `json:"alert_rules"`
    NotificationChannels []NotificationChannel `json:"notification_channels"`
    SSOProviders         []SSOProvider         `json:"sso_providers"`

    SMTPServer     string    `json:"smtp_server"`
    SMTPPort       int       `json:"smtp_port"`
    SMTPUser       string    `json:"smtp_user"`
    SMTPPassword   string    `json:"smtp_password"`

    AdminPassword  string    `json:"admin_password"`
    SystemAPIKey   string    `json:"system_api_key"` 
    MFAEnabled     bool      `json:"mfa_enabled"`
    MFASecret      string    `json:"mfa_secret"`     
    AgentSecrets   map[string]string `json:"agent_secrets"` 
    IgnoredHosts   []string `json:"ignored_hosts"` 

    TelemetryEnabled *bool  `json:"telemetry_enabled"`
    InstanceID       string `json:"instance_id"`

    Users  []User        `json:"users"`
    Groups []ServerGroup `json:"groups"`
}

type User struct {
    Username     string   `json:"username"`
    Password     string   `json:"password"` // Plain or Hashed
    Role         string   `json:"role"`     // "admin", "viewer"
    AllowedHosts []string `json:"allowed_hosts"`
    Groups       []string `json:"groups"`   // Group IDs
}

type ServerGroup struct {
    ID    string   `json:"id"`
    Name  string   `json:"name"`
    Role  string   `json:"role"`
    Hosts []string `json:"hosts"`
}

type ConfigStore struct {
	FilePath string
	mu       sync.RWMutex
	Config   SystemConfig
}

func NewConfigStore(path string) *ConfigStore {
	// Default config
	defaults := SystemConfig{
		RetentionDays:  7,
		DDoSThreshold:  50.0,
		EmailAlerts:    true,
	}
	
	store := &ConfigStore{
		FilePath: path,
		Config:   defaults,
	}
	
	// Load existing if available
	store.Load()
	return store
}

func (s *ConfigStore) Load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.FilePath)
	if err != nil {
		if os.IsNotExist(err) {
			return s.saveInternal() // Create default
		}
		return err
	}

	if err := json.Unmarshal(data, &s.Config); err != nil {
        return err
    }
    
    // Ensure System API Key exists
    if s.Config.SystemAPIKey == "" {
        s.Config.SystemAPIKey = generateRandomKey(32)
        s.saveInternal() // Save back to file
    }
    
    // Ensure AgentSecrets map is initialized
    if s.Config.AgentSecrets == nil {
        s.Config.AgentSecrets = make(map[string]string)
    }

    // Initialize Telemetry Instance ID if not set
    if s.Config.InstanceID == "" {
        s.Config.InstanceID = generateRandomKey(32)
        s.saveInternal() // Save back to file
    }

    return nil
}

func (s *ConfigStore) Save(config SystemConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Config = config
	return s.saveInternal()
}

func (s *ConfigStore) saveInternal() error {
	data, err := json.MarshalIndent(s.Config, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.FilePath, data, 0644)
}

func (s *ConfigStore) Get() SystemConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.Config
}
func generateRandomKey(n int) string {
    const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    b := make([]byte, n)
    for i := range b {
        b[i] = letters[rand.Intn(len(letters))]
    }
    return string(b)
}

package config

import (
    "encoding/json"
    "os"
)

type AgentConfig struct {
    ServerURL   string          `json:"server_url"`
    AgentID     string          `json:"agent_id"`
    AgentSecret string          `json:"agent_secret"`
    MySQLUser        string          `json:"mysql_user,omitempty"`
    MySQLPassword    string          `json:"mysql_password,omitempty"`
    PostgresUser     string          `json:"postgres_user,omitempty"`
    PostgresPassword string          `json:"postgres_password,omitempty"`
    PostgresPort     string          `json:"postgres_port,omitempty"`
    PostgresDB       string          `json:"postgres_db,omitempty"`
    ClickHouseUser   string          `json:"clickhouse_user,omitempty"`
    ClickHousePass   string          `json:"clickhouse_password,omitempty"`
    Collectors  CollectorConfig `json:"collectors"`
    LogConfig   LogStrategy     `json:"log_config"`
}

type CollectorConfig struct {
    System     bool `json:"system"`
    Docker     bool `json:"docker"`
    Kubernetes bool `json:"kubernetes"`
    PM2        bool `json:"pm2"`
    Nginx      bool `json:"nginx"`
    Apache     bool `json:"apache"`
}

type LogStrategy struct {
    Mode         string   `json:"mode"` // "all", "selected", "none"
    SelectedLogs []string `json:"selected_logs"`
}

func LoadConfig() (*AgentConfig, error) {
    data, err := os.ReadFile("agent-config.json")
    if err != nil {
        return nil, err
    }
    var cfg AgentConfig
    if err := json.Unmarshal(data, &cfg); err != nil {
        return nil, err
    }
    return &cfg, nil
}

func SaveConfig(cfg *AgentConfig) error {
    data, err := json.MarshalIndent(cfg, "", "  ")
    if err != nil {
        return err
    }
    return os.WriteFile("agent-config.json", data, 0644)
}

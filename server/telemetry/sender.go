package telemetry

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"runtime"
	"time"

	"github.com/vastlogs/vastlogs/server/storage"
)

// Default endpoint, can be overridden by env variable
var TelemetryEndpoint = "http://datavast.restreamer.in:8081/api/events"

func init() {
	if envEndpoint := os.Getenv("TELEMETRY_ENDPOINT"); envEndpoint != "" {
		TelemetryEndpoint = envEndpoint
	}
}

type Event struct {
	Type      string    `json:"type"`
	Property  string    `json:"property"`
	Value     float64   `json:"value"`
	Timestamp time.Time `json:"timestamp"`
}

type Payload struct {
	InstanceID string  `json:"instance_id"`
	Version    string  `json:"version"`
	OS         string  `json:"os"`
	Arch       string  `json:"arch"`
	Events     []Event `json:"events"`
}

var (
	eventQueue = make(chan Event, 1000)
	config     *storage.ConfigStore
)

// Initialize sets up the global config store reference and starts the background sender
func Initialize(store *storage.ConfigStore) {
	config = store
	go senderLoop()
	go dailyPing()
}

// Track logs an anonymous event if telemetry is enabled
func Track(eventType, property string, value float64) {
	cfg := config.Get()
	if cfg.TelemetryEnabled == nil || !*cfg.TelemetryEnabled {
		return // Do not track if opted out or unset
	}

	select {
	case eventQueue <- Event{
		Type:      eventType,
		Property:  property,
		Value:     value,
		Timestamp: time.Now(),
	}:
	default:
		// Queue full, silently drop to avoid blocking main application
	}
}

func senderLoop() {
	ticker := time.NewTicker(time.Minute * 5) // Flush every 5 minutes
	defer ticker.Stop()

	var batch []Event

	for {
		select {
		case event := <-eventQueue:
			batch = append(batch, event)
			if len(batch) >= 100 {
				flushEvents(batch)
				batch = nil
			}
		case <-ticker.C:
			if len(batch) > 0 {
				flushEvents(batch)
				batch = nil
			}
		}
	}
}

func flushEvents(events []Event) {
	cfg := config.Get()
	if cfg.TelemetryEnabled == nil || !*cfg.TelemetryEnabled {
		return
	}

	payload := Payload{
		InstanceID: cfg.InstanceID,
		Version:    "1.0.0", // TODO: Read from build info
		OS:         runtime.GOOS,
		Arch:       runtime.GOARCH,
		Events:     events,
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return
	}

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("POST", TelemetryEndpoint, bytes.NewBuffer(data))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[telemetry] Failed to send telemetry batch: %v", err)
		return
	}
	defer resp.Body.Close()
}

// dailyPing sends a heartbeat event every 24 hours to track active installations
func dailyPing() {
	// Send initial ping on startup
	Track("system", "startup", 1.0)

	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	for range ticker.C {
		Track("system", "ping", 1.0)
	}
}

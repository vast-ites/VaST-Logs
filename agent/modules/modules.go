package modules

import (
	"context"
	"fmt"
	"log"

	"github.com/datavast/datavast/agent/config"
	"github.com/datavast/datavast/agent/sender"
)

// AgentModule is the interface that all extensible agent capabilities must implement.
// To add a new module:
//   1. Create a new package under agent/modules/<name>/
//   2. Implement this interface
//   3. Call modules.Register() in your package's init() function
//   4. Add a blank import in agent/modules/loader.go
//
// That's it. main.go never needs to change.
type AgentModule interface {
	// Name returns a human-readable name for this module (used in logs)
	Name() string

	// ShouldEnable checks whether this module should activate based on config/environment.
	// Return false to silently skip this module (e.g. if a required service isn't installed).
	ShouldEnable(cfg *config.AgentConfig) bool

	// Init performs one-time setup. Called before Start.
	Init(cfg *config.AgentConfig, client *sender.Client) error

	// Start begins the module's main loop. Runs in its own goroutine.
	// Must respect ctx cancellation for clean shutdown.
	Start(ctx context.Context) error
}

// registry holds all registered modules (populated by init() calls in module packages)
var registry []AgentModule

// Register adds a module to the global registry. Called from each module's init().
func Register(m AgentModule) {
	registry = append(registry, m)
}

// List returns the names of all registered modules (for diagnostics).
func List() []string {
	names := make([]string, len(registry))
	for i, m := range registry {
		names[i] = m.Name()
	}
	return names
}

// StartAll initializes and launches all registered modules that pass their ShouldEnable check.
func StartAll(ctx context.Context, cfg *config.AgentConfig, client *sender.Client) {
	if len(registry) == 0 {
		log.Println(">> No extensible modules registered.")
		return
	}

	fmt.Printf(">> %d module(s) registered: %v\n", len(registry), List())

	enabled := 0
	for _, m := range registry {
		// Check if module wants to run in this environment
		if !m.ShouldEnable(cfg) {
			log.Printf("   [%s] Skipped (not enabled or prerequisites not met)", m.Name())
			continue
		}

		log.Printf(">> Loading Module: %s...", m.Name())
		if err := m.Init(cfg, client); err != nil {
			log.Printf("[Module:%s] Initialization failed: %v", m.Name(), err)
			continue
		}

		enabled++
		go func(mod AgentModule) {
			if err := mod.Start(ctx); err != nil {
				log.Printf("[Module:%s] Exited with error: %v", mod.Name(), err)
			}
		}(m)
	}

	fmt.Printf(">> %d/%d module(s) active.\n", enabled, len(registry))
}

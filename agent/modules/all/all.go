// Package all is the SINGLE import hub for all agent modules.
//
// HOW TO ADD A NEW MODULE:
//   1. Create your module package under agent/modules/<your_module>/
//   2. Implement the modules.AgentModule interface (Name, ShouldEnable, Init, Start)
//   3. Call modules.Register(&YourModule{}) in your package's init()
//   4. Add ONE blank import line below
//
// main.go only imports this package. It NEVER needs to change for new modules.

package all

import (
	// ─── Active Modules ───────────────────────────────────────
	_ "github.com/vastlogs/vastlogs/agent/modules/ssh_bruteforce"

	// ─── Add new modules here ─────────────────────────────────
	// _ "github.com/vastlogs/vastlogs/agent/modules/log_anomaly"
	// _ "github.com/vastlogs/vastlogs/agent/modules/certificate_monitor"
	// _ "github.com/vastlogs/vastlogs/agent/modules/disk_predictor"
)

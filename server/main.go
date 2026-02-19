package main

import (
	"fmt"
	"log"
	"math"
	"os"
	"strings"
	"time"

	"github.com/datavast/datavast/server/alert"
	"github.com/datavast/datavast/server/api"
	"github.com/datavast/datavast/server/api/ip_intelligence"
	"github.com/datavast/datavast/server/auth"
	"github.com/datavast/datavast/server/geoip"
	"github.com/datavast/datavast/server/storage"
	"github.com/gin-contrib/cors"
	// "github.com/gin-contrib/gzip"
	// "github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func connectWithRetry(dsn string, maxRetries int) (*storage.LogStore, error) {
	var store *storage.LogStore
	var err error

	for i := 0; i < maxRetries; i++ {
		store, err = storage.NewLogStore(dsn)
		if err == nil {
			log.Println("✅ ClickHouse Connected!")
			return store, nil
		}

		if i < maxRetries-1 {
			backoff := time.Duration(math.Pow(2, float64(i))) * time.Second
			log.Printf("⚠️  Connection attempt %d/%d failed: %v", i+1, maxRetries, err)
			log.Printf("   Retrying in %v...", backoff)
			time.Sleep(backoff)
		}
	}

	return nil, fmt.Errorf("failed after %d retries: %w", maxRetries, err)
}

func main() {
	// Load .env file from parent directory (../.env) if it exists
	if err := godotenv.Load("../.env"); err != nil {
		// Try loading from current directory
		if err := godotenv.Load(".env"); err != nil {
			log.Println("⚠️  No .env file found (this is OK if using environment variables)")
		}
	}

	log.Println("🚀 DataVast Backend Starting...")

	// Security warnings
	if os.Getenv("AUTH_ENABLED") != "true" {
		log.Println("")
		log.Println("⚠️  ============== SECURITY WARNING ==============")
		log.Println("⚠️  Authentication is DISABLED!")
		log.Println("⚠️  All data is publicly accessible.")
		log.Println("⚠️  Set AUTH_ENABLED=true in production!")
		log.Println("⚠️  =============================================")
		log.Println("")
	}

	// 1. Secrets & Config
	influxURL := os.Getenv("INFLUX_URL")
	if influxURL == "" {
		influxURL = "http://localhost:8086"
	}
	influxToken := os.Getenv("INFLUX_TOKEN")
	if influxToken == "" {
		log.Fatal("INFLUX_TOKEN environment variable is required")
	}
	clickhouseDSN := os.Getenv("CLICKHOUSE_DSN")

	// 2. Storage with retry
	influx := storage.NewMetricsStore(influxURL, influxToken, "datavast", "metrics")
	defer influx.Close()

	log.Println("🔌 Connecting to ClickHouse...")
	clickh, err := connectWithRetry(clickhouseDSN, 5)
	if err != nil {
		log.Fatalf("❌ ClickHouse connection failed: %v", err)
	}

	// 3. Load Persistent Config
	config := storage.NewConfigStore("server-config.json")
	authMgr := auth.NewAuthManager(config)
	alertMgr := alert.NewAlertService(config, clickh)

	// Apply configured retention policy to ClickHouse
	if retDays := config.Get().RetentionDays; retDays > 0 {
		clickh.ApplyRetentionPolicy(retDays)
	}

	// Initialize GeoIP
	if err := geoip.GetInstance().Initialize("GeoLite2-City.mmdb"); err != nil {
		log.Printf("[WARNING] GeoIP init failed (maps will be empty): %v", err)
	} else {
		log.Println("🌍 GeoIP Service Initialized")
	}

	// 3. API Setup
	r := gin.Default()

	// Enable Gzip compression
	// r.Use(gzip.Gzip(gzip.DefaultCompression))

	// CORS origins from environment (comma-separated), fallback to localhost for dev
	corsOrigins := []string{"http://localhost:5173"}
	if envOrigins := os.Getenv("CORS_ORIGINS"); envOrigins != "" {
		corsOrigins = strings.Split(envOrigins, ",")
		for i := range corsOrigins {
			corsOrigins[i] = strings.TrimSpace(corsOrigins[i])
		}
		log.Printf("🌐 CORS Origins: %v", corsOrigins)
	}

	r.Use(cors.New(cors.Config{
		AllowOrigins:     corsOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "X-Agent-Secret"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	handler := &api.IngestionHandler{
		Metrics: influx,
		Logs:    clickh,
		Config:  config,
		Auth:    authMgr,
		Alerts:  alertMgr,
	}
	api.SetupRoutes(r, handler)

	// Phase 43: IP Intelligence Routes
	ipHandler := ip_intelligence.NewIPHandler(clickh)
	v1 := r.Group("/api/v1")
	ipRoutes := v1.Group("/ip")
	ipRoutes.Use(api.OptionalAuth("admin"))
	{
		// Specific routes MUST come before wildcard /:ip route
		ipRoutes.POST("/block", ipHandler.BlockIP)
		ipRoutes.POST("/unblock", ipHandler.UnblockIP)
		ipRoutes.GET("/:ip", ipHandler.GetIPDetails)
	}

	// Agent Command Dispatch (agents poll these — requires agent secret)
	agentRoutes := v1.Group("/agent")
	agentRoutes.Use(api.AgentSecretAuth(config))
	agentRoutes.GET("/commands", ipHandler.GetPendingCommands)
	agentRoutes.POST("/commands/ack", ipHandler.AckCommand)

	// Firewall Sync (agent pushes actual iptables state — requires agent secret)
	fwSyncGroup := v1.Group("/")
	fwSyncGroup.Use(api.AgentSecretAuth(config))
	fwSyncGroup.POST("/ingest/firewall-sync", handler.HandleIngestFirewallSync)

	// Cache-Control: prevent browsers from caching index.html (stale frontend builds)
	// r.Use(func(c *gin.Context) {
	// 	path := c.Request.URL.Path
	// 	// Hashed assets (js/css with hash in filename) can be cached forever
	// 	// Everything else (HTML, SPA routes) must not be cached
	// 	if path == "/" || path == "/index.html" || !strings.Contains(path, ".") {
	// 		c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
	// 		c.Header("Pragma", "no-cache")
	// 		c.Header("Expires", "0")
	// 	}
	// 	c.Next()
	// })

	// Serve Frontend (Static Files) - EXPLICIT ROUTES ONLY
	// Avoid using wildcard static.Serve("/") as it interferes with API routes
	r.Static("/assets", "./dist/assets")
	r.StaticFile("/vite.svg", "./dist/vite.svg")
	r.StaticFile("/index.html", "./dist/index.html")

	// PWA Assets
	r.StaticFile("/manifest.json", "./dist/manifest.json")
	r.StaticFile("/sw.js", "./dist/sw.js")
	r.StaticFile("/icon-192.png", "./dist/icon-192.png")
	r.StaticFile("/icon-512.png", "./dist/icon-512.png")
	r.StaticFile("/apple-touch-icon.png", "./dist/apple-touch-icon.png")
    
    // Serve favicon if it exists (optional)
    if _, err := os.Stat("./dist/favicon.ico"); err == nil {
        r.StaticFile("/favicon.ico", "./dist/favicon.ico")
    }

	// SPA Fallback: For React Router paths that don't match API or static files
	r.NoRoute(func(c *gin.Context) {
		c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
		c.File("./dist/index.html")
	})

	// 3. Start
	certFile := "./certs/server.crt"
	keyFile := "./certs/server.key"
	if _, err := os.Stat(certFile); err == nil {
		log.Println(">> Ingestion API listening on :8080 (HTTPS)")
		if err := r.RunTLS(":8080", certFile, keyFile); err != nil {
			log.Fatal(err)
		}
	} else {
		log.Println(">> Ingestion API listening on :8080 (HTTP - no certs found)")
		if err := r.Run(":8080"); err != nil {
			log.Fatal(err)
		}
	}
}

package auth

import (
    "crypto/rand"
    "log"
    "math/big"
    "os"
    "time"

    "github.com/golang-jwt/jwt/v5"
    "github.com/vastlogs/vastlogs/server/storage"
    "golang.org/x/crypto/bcrypt"
)

// JwtSecret is loaded from JWT_SECRET env var; random fallback if not set (tokens won't survive restarts)
var JwtSecret []byte

func init() {
    if s := os.Getenv("JWT_SECRET"); s != "" {
        JwtSecret = []byte(s)
    } else {
        JwtSecret = []byte(GenerateRandomString(32))
        log.Println("⚠️  JWT_SECRET not set — using random key (tokens won't survive restarts)")
    }
}

type Claims struct {
    Username string   `json:"username"`
    Role     string   `json:"role"`
    Allowed  []string `json:"allowed"` // List of allowed hosts ("*" for all)
    jwt.RegisteredClaims
}

type AuthParams struct {
    Username string `json:"username"`
    Password string `json:"password"`
}

type AuthManager struct {
    Config *storage.ConfigStore
}

func NewAuthManager(cfg *storage.ConfigStore) *AuthManager {
    mgr := &AuthManager{Config: cfg}
    c := cfg.Get()

    // Priority 1: Use environment variable if set
    if envPass := os.Getenv("ADMIN_PASSWORD"); envPass != "" {
        // Hash the env password and store the hash
        hash, err := bcrypt.GenerateFromPassword([]byte(envPass), 12)
        if err == nil {
            if c.AdminPassword != string(hash) {
                // Only update if the env password changed (check by verifying against stored hash)
                if bcrypt.CompareHashAndPassword([]byte(c.AdminPassword), []byte(envPass)) != nil {
                    c.AdminPassword = string(hash)
                    cfg.Save(c)
                    log.Println("[SECURITY] ✅ Admin password loaded from env and hashed with bcrypt")
                }
            }
        }
    } else if c.AdminPassword == "" {
        // Priority 2: Generate random password if not in env or config
        newPass := GenerateRandomString(16)
        hash, _ := bcrypt.GenerateFromPassword([]byte(newPass), 12)
        c.AdminPassword = string(hash)
        cfg.Save(c)
        log.Println("")
        log.Println("[SECURITY] ---------------------------------------------------")
        log.Println("[SECURITY] Admin Password Generated: " + newPass)
        log.Println("[SECURITY] Please save this password to log in.")
        log.Println("[SECURITY] ---------------------------------------------------")
        log.Println("")
    } else {
        // Check if existing password is plaintext (migration from old format)
        if bcrypt.CompareHashAndPassword([]byte(c.AdminPassword), []byte("test")) != nil && 
           len(c.AdminPassword) < 55 {
            // Likely plaintext — hash it in place
            hash, err := bcrypt.GenerateFromPassword([]byte(c.AdminPassword), 12)
            if err == nil {
                plaintext := c.AdminPassword
                c.AdminPassword = string(hash)
                cfg.Save(c)
                log.Printf("[SECURITY] ⚠️ Migrated plaintext admin password to bcrypt hash")
                // Keep the plaintext in memory briefly for the first login, but store hash
                _ = plaintext
            }
        }
    }

    // Migrate any plaintext user passwords to bcrypt
    migrated := false
    for i, user := range c.Users {
        if len(user.Password) < 55 {
            hash, err := bcrypt.GenerateFromPassword([]byte(user.Password), 12)
            if err == nil {
                c.Users[i].Password = string(hash)
                migrated = true
            }
        }
    }
    if migrated {
        cfg.Save(c)
        log.Println("[SECURITY] ✅ Migrated plaintext user passwords to bcrypt hashes")
    }

    return mgr
}

func (m *AuthManager) ValidateUser(u, p string) (string, []string, bool) {
    cfg := m.Config.Get()

    // 1. Check Admin
    if u == "admin" {
        if bcrypt.CompareHashAndPassword([]byte(cfg.AdminPassword), []byte(p)) == nil {
            return "admin", []string{"*"}, true
        }
        return "", nil, false
    }

    // 2. Check Users
    for _, user := range cfg.Users {
        if user.Username == u && bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(p)) == nil {
            // Calculate Allowed Hosts
            allowed := []string{}
            allowed = append(allowed, user.AllowedHosts...)

            // Resolve Groups
            for _, gID := range user.Groups {
                for _, grp := range cfg.Groups {
                    if grp.ID == gID {
                        allowed = append(allowed, grp.Hosts...)
                    }
                }
            }

            return user.Role, allowed, true
        }
    }

    return "", nil, false
}

func (m *AuthManager) GenerateToken(username, role string, allowed []string) (string, error) {
    expirationTime := time.Now().Add(24 * time.Hour)
    claims := &Claims{
        Username: username,
        Role:     role,
        Allowed:  allowed,
        RegisteredClaims: jwt.RegisteredClaims{
            ExpiresAt: jwt.NewNumericDate(expirationTime),
        },
    }
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString(JwtSecret)
}

// GenerateRandomString generates a cryptographically secure random string
func GenerateRandomString(n int) string {
    const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
    b := make([]byte, n)
    for i := range b {
        idx, _ := rand.Int(rand.Reader, big.NewInt(int64(len(letters))))
        b[i] = letters[idx.Int64()]
    }
    return string(b)
}

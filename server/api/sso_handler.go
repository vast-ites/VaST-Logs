package api

import (
	"context"
	"fmt"
	"net/http"
	"os"

    "github.com/coreos/go-oidc/v3/oidc"
	"github.com/gin-gonic/gin"
	"github.com/vastlogs/vastlogs/server/auth"
	"github.com/vastlogs/vastlogs/server/storage"
    "golang.org/x/oauth2"
)

// -- SSO Configuration Management (Admin) --

func (h *IngestionHandler) HandleGetSSOProviders(c *gin.Context) {
    c.JSON(http.StatusOK, h.Config.Get().SSOProviders)
}

func (h *IngestionHandler) HandleCreateSSOProvider(c *gin.Context) {
    var p storage.SSOProvider
    if err := c.BindJSON(&p); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    if p.ID == "" {
        p.ID = "sso_" + auth.GenerateRandomString(6)
    }

    cfg := h.Config.Get()
    cfg.SSOProviders = append(cfg.SSOProviders, p)
    if err := h.Config.Save(cfg); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save SSO provider"})
        return
    }

    c.JSON(http.StatusCreated, p)
}

func (h *IngestionHandler) HandleUpdateSSOProvider(c *gin.Context) {
    id := c.Param("id")
    var p storage.SSOProvider
    if err := c.BindJSON(&p); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    cfg := h.Config.Get()
    found := false
    for i, existing := range cfg.SSOProviders {
        if existing.ID == id {
            p.ID = id // Ensure ID isn't changed
            cfg.SSOProviders[i] = p
            found = true
            break
        }
    }

    if !found {
        c.JSON(http.StatusNotFound, gin.H{"error": "SSO Provider not found"})
        return
    }

    if err := h.Config.Save(cfg); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save SSO provider"})
        return
    }
    c.Status(http.StatusOK)
}

func (h *IngestionHandler) HandleDeleteSSOProvider(c *gin.Context) {
    id := c.Param("id")
    cfg := h.Config.Get()
    
    var newProviders []storage.SSOProvider
    for _, p := range cfg.SSOProviders {
        if p.ID != id {
            newProviders = append(newProviders, p)
        }
    }

    cfg.SSOProviders = newProviders
    h.Config.Save(cfg)
    c.Status(http.StatusOK)
}

// -- SSO Auth Flow (Public) --

// HandleGetPublicSSOProviders returns only the enabled providers (for the login page)
func (h *IngestionHandler) HandleGetPublicSSOProviders(c *gin.Context) {
    var publicProviders []map[string]interface{}
    for _, p := range h.Config.Get().SSOProviders {
        if p.Enabled {
            publicProviders = append(publicProviders, map[string]interface{}{
                "id":   p.ID,
                "name": p.Name,
                "type": p.Type,
            })
        }
    }
    c.JSON(http.StatusOK, publicProviders)
}

// HandleSSOLogin initiates the SSO login redirect
func (h *IngestionHandler) HandleSSOLogin(c *gin.Context) {
    id := c.Param("id")
    ssoMgr := auth.NewSSOManager(h.Config)
    p := ssoMgr.GetProvider(id)
    if p == nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "SSO Provider not found or disabled"})
        return
    }

    // Build Callback URL 
    baseURL := os.Getenv("BASE_URL")
    if baseURL == "" {
        // Fallback for dev - typically UI handles this but for auth redirect we need absolute url
        baseURL = "http://localhost:5173" 
    }
    
    // In production we should use the domain configured
    // For now we assume React router handles the callback and forwards it or backend handles it
    // The safest is backend handling the callback and redirecting to frontend with token
    callbackURL := fmt.Sprintf("%s/api/v1/auth/sso/callback/%s", baseURL, p.ID)
    
    // In local dev the frontend calls /api over proxy but browser redirect happens against api direct
    // To ensure exact match with IDP, the `BASE_URL` MUST be set correctly in production
    // e.g. https://datavast.restreamer.in:8080
    host := c.Request.Host
    scheme := "http"
    if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
        scheme = "https"
    }
    
    if os.Getenv("BASE_URL") == "" {
        callbackURL = fmt.Sprintf("%s://%s/api/v1/auth/sso/callback/%s", scheme, host, p.ID)
    }

    // Handle by Type
    if p.Type == "oauth2" || p.Type == "oidc" {
        // Build base config
        var conf *oauth2.Config
        if p.Type == "oidc" {
             // For OIDC, we try to discover endpoints
             provider, err := oidc.NewProvider(c.Request.Context(), p.IssuerURL)
             if err != nil {
                 c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to init OIDC provider: %v", err)})
                 return
             }
             conf = &oauth2.Config{
                 ClientID:     p.ClientID,
                 ClientSecret: p.ClientSecret,
                 Endpoint:     provider.Endpoint(),
                 RedirectURL:  callbackURL,
                 Scopes:       []string{oidc.ScopeOpenID, "profile", "email"},
             }
        } else {
             conf = auth.BuildOAuth2Config(p, callbackURL)
        }
        
        // Generate state (should be signed/stored securely in a real app, simplified here)
        state := auth.GenerateRandomString(32)
        c.SetCookie("oauthstate", state, 300, "/", "", scheme == "https", true)

        url := conf.AuthCodeURL(state)
        c.Redirect(http.StatusFound, url)
        return
    }

    // SAML requires a full SP implementation involving middleware, simplified or error for now
    if p.Type == "saml" {
        c.JSON(http.StatusNotImplemented, gin.H{"error": "SAML Flow is complex and depends heavily on middleware initialization. Use OIDC for now or implement Crewjam SAML SP natively."})
        return
    }

    c.JSON(http.StatusBadRequest, gin.H{"error": "Unknown SSO type"})
}

// HandleSSOCallback processes the redirect from the IdP
func (h *IngestionHandler) HandleSSOCallback(c *gin.Context) {
    id := c.Param("id")
    ssoMgr := auth.NewSSOManager(h.Config)
    p := ssoMgr.GetProvider(id)
    if p == nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "SSO Provider not found"})
        return
    }

    state := c.Query("state")
    cookieState, err := c.Cookie("oauthstate")
    if err != nil || state != cookieState {
         c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid oauth state"})
         return
    }

    code := c.Query("code")
    if code == "" {
         c.JSON(http.StatusBadRequest, gin.H{"error": "Code not provided"})
         return
    }

    host := c.Request.Host
    scheme := "http"
    if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
        scheme = "https"
    }
    
    callbackURL := fmt.Sprintf("%s://%s/api/v1/auth/sso/callback/%s", scheme, host, p.ID)
    if os.Getenv("BASE_URL") != "" {
        callbackURL = fmt.Sprintf("%s/api/v1/auth/sso/callback/%s", os.Getenv("BASE_URL"), p.ID)
    }

    ctx := context.Background()
    var email string

    if p.Type == "oauth2" || p.Type == "oidc" {
         var conf *oauth2.Config
         if p.Type == "oidc" {
             provider, err := oidc.NewProvider(ctx, p.IssuerURL)
             if err != nil {
                 c.JSON(http.StatusInternalServerError, gin.H{"error": "OIDC Config err"})
                 return
             }
             conf = &oauth2.Config{
                 ClientID:     p.ClientID,
                 ClientSecret: p.ClientSecret,
                 Endpoint:     provider.Endpoint(),
                 RedirectURL:  callbackURL,
                 Scopes:       []string{oidc.ScopeOpenID, "profile", "email"},
             }
         } else {
             conf = auth.BuildOAuth2Config(p, callbackURL)
         }

         oauth2Token, err := conf.Exchange(ctx, code)
         if err != nil {
             c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to exchange token: %v", err)})
             return
         }

         if p.Type == "oidc" {
             rawIDToken, ok := oauth2Token.Extra("id_token").(string)
             if !ok {
                 c.JSON(http.StatusInternalServerError, gin.H{"error": "No id_token field in oauth2 token."})
                 return
             }
             idToken, err := auth.VerifyOIDC(ctx, p, rawIDToken)
             if err != nil {
                 c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to verify ID Token: %v", err)})
                 return
             }
             var claims struct {
                 Email string `json:"email"`
             }
             if err := idToken.Claims(&claims); err != nil {
                 c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse claims"})
                 return
             }
             email = claims.Email
         } else {
             // Standard OAuth2 - usually requires fetching /userinfo endpoint
             // Implementation depends on the provider. For simplicity, we assume OIDC is primarily used.
             c.JSON(http.StatusNotImplemented, gin.H{"error": "Raw OAuth2 requires custom user profile fetching. Use OIDC."})
             return
         }
    }

    if email == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Email not found in SSO claims"})
        return
    }

    // 3. User mapping / provisioning
    role, allowed, err := ssoMgr.EnsureUser(email)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to provision user"})
        return
    }

    // 4. Generate VaSTLogs JWT 
    token, err := h.Auth.GenerateToken(email, role, allowed)
    if err != nil {
         c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate local auth token"})
         return
    }

    // 5. Redirect back to frontend with Token (via hash or cookie)
    // We redirect to frontend root with hash so it can grab it
    frontendURL := "/"
    if os.Getenv("FRONTEND_URL") != "" {
        frontendURL = os.Getenv("FRONTEND_URL")
    }
    
    url := fmt.Sprintf("%s#token=%s", frontendURL, token)
    c.Redirect(http.StatusFound, url)
}

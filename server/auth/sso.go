package auth

import (
    "context"
    "fmt"
    "log"

    "github.com/coreos/go-oidc/v3/oidc"
    "github.com/vastlogs/vastlogs/server/storage"
    "golang.org/x/oauth2"
)

// SSODetials holds parsed attribute info
type SSODetails struct {
    Email    string
    Name     string
    Role     string
    Groups   []string
}

type SSOManager struct {
    Config *storage.ConfigStore
}

func NewSSOManager(cfg *storage.ConfigStore) *SSOManager {
    return &SSOManager{Config: cfg}
}

// GetProvider finds an active provider config by ID
func (s *SSOManager) GetProvider(id string) *storage.SSOProvider {
    cfg := s.Config.Get()
    for _, p := range cfg.SSOProviders {
        if p.ID == id && p.Enabled {
            return &p
        }
    }
    return nil
}

// EnsureUser provision user on the fly or updates them if they don't exist
func (s *SSOManager) EnsureUser(email string) (string, []string, error) {
    if email == "" {
        return "", nil, fmt.Errorf("email is required for SSO user mapping")
    }

    cfg := s.Config.Get()

    // 1. Check if user already exists
    for _, u := range cfg.Users {
        if u.Username == email {
             // Calculate Allowed Hosts
             allowed := []string{}
             allowed = append(allowed, u.AllowedHosts...)
 
             // Resolve Groups
             for _, gID := range u.Groups {
                 for _, grp := range cfg.Groups {
                     if grp.ID == gID {
                         allowed = append(allowed, grp.Hosts...)
                     }
                 }
             }
             return u.Role, allowed, nil
        }
    }

    // 2. User does not exist, provision them
    newUser := storage.User{
        Username:     email,
        Password:     GenerateRandomString(32), // Random password, essentially unusable for basic auth
        Role:         "viewer", // Default role
        AllowedHosts: []string{"*"}, // Default to all hosts view, or can be restricted
        Groups:       []string{},
    }

    // Add user and save config
    cfg.Users = append(cfg.Users, newUser)
    s.Config.Save(cfg)
    log.Printf("[SECURITY] Provisioned new SSO user: %s", email)

    return newUser.Role, newUser.AllowedHosts, nil
}

// BuildOAuth2Config constructs an oauth2 config from the provider settings
func BuildOAuth2Config(p *storage.SSOProvider, callbackURL string) *oauth2.Config {
    return &oauth2.Config{
        ClientID:     p.ClientID,
        ClientSecret: p.ClientSecret,
        Endpoint: oauth2.Endpoint{
            AuthURL:  p.AuthURL,
            TokenURL: p.TokenURL,
        },
        RedirectURL: callbackURL,
        Scopes:      []string{"openid", "email", "profile"}, // Default scopes if user doesn't specify
    }
}

// VerifyOIDC verifies the OIDC token wrapper from OAuth2
func VerifyOIDC(ctx context.Context, p *storage.SSOProvider, rawIDToken string) (*oidc.IDToken, error) {
    provider, err := oidc.NewProvider(ctx, p.IssuerURL)
    if err != nil {
        return nil, fmt.Errorf("failed to get provider: %v", err)
    }

    verifier := provider.Verifier(&oidc.Config{ClientID: p.ClientID})
    idToken, err := verifier.Verify(ctx, rawIDToken)
    if err != nil {
        return nil, fmt.Errorf("could not verify id_token: %v", err)
    }

    return idToken, nil
}

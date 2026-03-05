package auth

import (
    "time"
    "github.com/pquerna/otp/totp"
)

// GenerateMFA generates a new TOTP secret and QR code URL
func GenerateMFA(accountName string) (secret string, url string, err error) {
    key, err := totp.Generate(totp.GenerateOpts{
        Issuer:      "VaSTLogs",
        AccountName: accountName,
    })
    if err != nil {
        return "", "", err
    }
    return key.Secret(), key.URL(), nil
}

// ValidateMFA validates a TOTP code against a secret
func ValidateMFA(code string, secret string) bool {
    // Validate with a small skew (backward/forward 1 period)
    valid, _ := totp.ValidateCustom(code, secret, time.Now(), totp.ValidateOpts{
        Period:    30,
        Skew:      1,
        Digits:    6, // otp.DigitsSix
        Algorithm: 0, // otp.AlgorithmSHA1 (0 is default/SHA1)
    })
    return valid
}

#!/bin/bash
set -e

echo "======================================"
echo "  DataVAST Agent Quick Installer"
echo "======================================"

API_KEY=""
HOST=""
SERVER_URL=""
MFA_CODE=""

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --api-key=*) API_KEY="${1#*=}" ;;
        --api-key) API_KEY="$2"; shift ;;
        --host=*) HOST="${1#*=}" ;;
        --host) HOST="$2"; shift ;;
        --server-url=*) SERVER_URL="${1#*=}" ;;
        --server-url) SERVER_URL="$2"; shift ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

if [ -z "$API_KEY" ]; then
    echo "❌ Error: --api-key is required."
    exit 1
fi

if [ -z "$HOST" ]; then
    HOST=$(hostname)
    echo "⚠️  Warning: --host not provided. Defaulting to system hostname: $HOST"
fi

if [ -z "$SERVER_URL" ]; then
    SERVER_URL="https://your-domain.com:8080"
fi

echo "🚀 Installing DataVAST Agent for host: $HOST"
echo "🌐 Connecting to server: $SERVER_URL"

# 1. Register the Agent
echo "🔑 Registering Agent..."
RESPONSE=$(curl -sk -X POST "$SERVER_URL/api/v1/agent/register" \
    -H "Content-Type: application/json" \
    -d "{\"api_key\":\"$API_KEY\", \"hostname\":\"$HOST\"}")

if [[ "$RESPONSE" == *"MFA_REQUIRED"* ]]; then
    echo "🔐 MFA is enabled on the server."
    if [ -t 0 ]; then
        read -p "Please enter your 6-digit MFA code: " MFA_CODE
    else
        read -p "Please enter your 6-digit MFA code: " MFA_CODE </dev/tty
    fi
    RESPONSE=$(curl -sk -X POST "$SERVER_URL/api/v1/agent/register" \
        -H "Content-Type: application/json" \
        -d "{\"api_key\":\"$API_KEY\", \"hostname\":\"$HOST\", \"mfa_code\":\"$MFA_CODE\"}")
fi

if [[ "$RESPONSE" == *"error"* ]]; then
    ERROR_MSG=$(echo "$RESPONSE" | grep -o 'error":"[^"]*' | cut -d'"' -f3)
    echo "❌ Registration failed: $ERROR_MSG"
    exit 1
fi

SECRET=$(echo "$RESPONSE" | grep -o '"secret":"[^"]*' | cut -d'"' -f4)
if [ -z "$SECRET" ]; then
    echo "❌ Registration failed: No secret returned."
    echo "Server Response: $RESPONSE"
    exit 1
fi
echo "✅ Registration successful!"

# 2. Download the agent binary
echo "⬇️  Downloading agent binary..."
curl -sLk "$SERVER_URL/agent/download" -o /usr/local/bin/datavast-agent
chmod +x /usr/local/bin/datavast-agent

# 3. Create config
echo "⚙️  Configuring agent..."
mkdir -p /etc/datavast

cat << EOF > /etc/datavast/agent-config.json
{
  "server_url": "$SERVER_URL",
  "agent_id": "$HOST",
  "agent_secret": "$SECRET",
  "collectors": {
    "system": true,
    "docker": true,
    "kubernetes": false,
    "nginx": false,
    "apache": false,
    "pm2": false
  },
  "log_config": {
    "mode": "all"
  }
}
EOF

# 4. Create systemd service
echo "📝 Creating systemd service..."
cat << 'EOF' > /etc/systemd/system/datavast-agent.service
[Unit]
Description=DataVAST Observability Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/etc/datavast
ExecStart=/usr/local/bin/datavast-agent
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 5. Enable and start
echo "🔄 Starting service..."
systemctl daemon-reload
systemctl enable datavast-agent
systemctl restart datavast-agent

echo "✅ DataVAST Agent installed and started successfully on $HOST!"

#!/bin/bash
set -e

echo "======================================"
echo "  DataVAST Agent Quick Installer"
echo "======================================"

API_KEY=""
HOST=""

# Determine server URL dynamically from where the script was downloaded
# Or fallback to hardcoded if not passed conceptually
# But better to parse the URL. Actually we can use a fixed one or pass it as an argument.
# But let's assume the user curl from window.location.origin
# We can inject SERVER_URL from the command line, but the UI is sending: curl -sL https://...:8080/install.sh

# Let's assume SERVER_URL is extracted from the argument if we pass it, otherwise hardcoded to https://your-domain.com:8080 or we extract it from another argument.
SERVER_URL=""

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
    # We fallback to the currently hardcoded domain in UI if not provided
    SERVER_URL="https://your-domain.com:8080"
fi

echo "🚀 Installing DataVAST Agent for host: $HOST"
echo "🌐 Connecting to server: $SERVER_URL"

# 1. Download the agent binary
echo "⬇️  Downloading agent binary..."
curl -sLk "$SERVER_URL/agent/download" -o /usr/local/bin/datavast-agent
chmod +x /usr/local/bin/datavast-agent

# 2. Create config
echo "⚙️  Configuring agent..."
mkdir -p /etc/datavast

# The UI uses system_api_key in the config? Let's check config format in Go.
cat << EOF > /etc/datavast/agent-config.json
{
  "server_url": "$SERVER_URL",
  "system_api_key": "$API_KEY",
  "hostname": "$HOST"
}
EOF

# 3. Create systemd service
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

# 4. Enable and start
echo "🔄 Starting service..."
systemctl daemon-reload
systemctl enable datavast-agent
systemctl restart datavast-agent

echo "✅ DataVAST Agent installed and started successfully!"

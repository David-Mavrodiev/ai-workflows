#!/usr/bin/env bash
# chmod +x start-server.sh
# Start the Memories server on port 3466 (foreground)

set -e
cd "$(dirname "$0")"

export PORT="${PORT:-3466}"

if lsof -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "Error: Port $PORT is already in use."
  echo "Run ./stop-server.sh to stop the existing server."
  exit 1
fi

echo "Starting Memories server on port $PORT..."
cd src && npm start

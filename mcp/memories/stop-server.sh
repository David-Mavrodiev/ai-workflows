#!/usr/bin/env bash
# chmod +x stop-server.sh
# Stop the Memories server running on port 3466

cd "$(dirname "$0")"

PORT="${PORT:-3466}"

PIDS=$(lsof -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null)

if [ -z "$PIDS" ]; then
  echo "Server is not running (nothing listening on port $PORT)."
  exit 0
fi

echo "Stopping process(es) on port $PORT: $PIDS"
kill $PIDS 2>/dev/null
echo "Server stopped."

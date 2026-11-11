#!/bin/sh
# Start the Vetro root supervisor in the background.
#
# It listens for the TV reverse root shell on 4445 and keeps the Vetro root
# daemon running whenever a root shell is available. Nothing is installed on
# the TV by this script.
set -u

HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
STATE=${VETRO_STATE_DIR:-$HERE/../state}
PIDFILE="$STATE/supervisor.pid"
mkdir -p "$STATE"

if [ -f "$PIDFILE" ]; then
    PID=$(cat "$PIDFILE" 2>/dev/null)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        echo "vetro-supervisor already running pid=$PID"
        exit 0
    fi
fi

if command -v setsid >/dev/null 2>&1; then
    setsid python3 "$HERE/vetro_supervisor.py" --state-dir "$STATE" "$@" \
        >>"$STATE/supervisor.out" 2>&1 &
else
    nohup python3 "$HERE/vetro_supervisor.py" --state-dir "$STATE" "$@" \
        >>"$STATE/supervisor.out" 2>&1 &
fi
echo $! > "$PIDFILE"
echo "vetro-supervisor started pid=$!"
echo "log:    $STATE/supervisor.log"
echo "health: http://127.0.0.1:4450/health"

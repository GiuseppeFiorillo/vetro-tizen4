#!/bin/sh
# Stop the Vetro root supervisor. The TV-side daemon is not touched.
set -u

HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
STATE=${VETRO_STATE_DIR:-$HERE/../state}
PIDFILE="$STATE/supervisor.pid"

if [ ! -f "$PIDFILE" ]; then
    echo "vetro-supervisor not running (no pid file)"
    exit 0
fi

PID=$(cat "$PIDFILE" 2>/dev/null)
if [ -z "$PID" ] || ! kill -0 "$PID" 2>/dev/null; then
    echo "vetro-supervisor not running (stale pid file)"
    rm -f "$PIDFILE"
    exit 0
fi

kill "$PID" 2>/dev/null
i=0
while [ $i -lt 20 ]; do
    kill -0 "$PID" 2>/dev/null || break
    sleep 0.2
    i=$((i + 1))
done
kill -9 "$PID" 2>/dev/null || true
rm -f "$PIDFILE"
echo "vetro-supervisor stopped pid=$PID"

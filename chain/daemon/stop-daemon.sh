#!/bin/sh
# Stop the Kant-M2 root daemon by the pid it published. Only a numeric pid is
# ever passed to kill; a missing or malformed file is ignored.
set -u

PIDFILE=${VETRO_ROOT_PID:-/tmp/vetro-root-daemon.pid}
if [ ! -f "$PIDFILE" ]; then
    echo "no pid file: $PIDFILE"
    exit 0
fi
p=$(cat "$PIDFILE" 2>/dev/null)
case "$p" in
    ''|*[!0-9]*) echo "invalid pid: $p"; exit 1 ;;
esac
if kill "$p" 2>/dev/null; then
    echo "stopped $p"
else
    echo "pid $p is not running"
fi
rm -f "$PIDFILE"

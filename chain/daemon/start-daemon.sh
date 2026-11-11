#!/bin/sh
# Start the Kant-M2 root daemon with setsid. RAM-only by default:
#   VETRO_CHAIN_DIR=/tmp/vetro-chain
# For a persistent copy use a writable persistent directory such as
# /opt/usr/home/owner/share/vetro-root and set VETRO_CHAIN_DIR accordingly.
set -u

BASE=${VETRO_CHAIN_DIR:-/tmp/vetro-chain}
PIDFILE=${VETRO_ROOT_PID:-/tmp/vetro-root-daemon.pid}
LOCKFILE=${VETRO_ROOT_LOCK:-/tmp/vetro-root-daemon.lock}
LOGFILE=${VETRO_ROOT_LOG:-/tmp/vetro-root-daemon.log}
REQUEST=${VETRO_ROOT_REQUEST:-/tmp/vetro-root-request.json}

if [ ! -f "$BASE/root-daemon.js" ]; then
    echo "missing $BASE/root-daemon.js" >&2
    exit 1
fi

# A stale request from an earlier server must not point the daemon at a dead
# port; Vetro writes a fresh one when its service starts.
rm -f "$REQUEST" "$LOCKFILE"

export VETRO_ROOT_REQUEST VETRO_ROOT_PID VETRO_ROOT_LOCK VETRO_ROOT_LOG VETRO_CHAIN_DIR
export VETRO_ROOT_REQUEST="$REQUEST"
export VETRO_ROOT_PID="$PIDFILE"
export VETRO_ROOT_LOCK="$LOCKFILE"
export VETRO_ROOT_LOG="$LOGFILE"
export VETRO_CHAIN_DIR="$BASE"

exec /usr/bin/node -e "require('$BASE/root-daemon.js')"

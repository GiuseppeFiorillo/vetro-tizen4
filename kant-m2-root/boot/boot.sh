#!/bin/sh
# Vetro root daemon boot hook.
#
# Generic on purpose: it starts the Vetro root daemon whenever it is executed
# with root privileges. It does not look for the USB stick, a specific device
# or a specific exploit. The vendor AT-HUB.service runs /opt/etc/parseinfo.sh
# as root at every boot, and that script runs this file through a marked
# block, so the same hook also works once root is persistent.
#
# Important: AT-HUB.service is short-lived. A daemon merely backgrounded from
# this script stays in AT-HUB's systemd cgroup and is killed when the unit
# exits. The daemon is therefore started as its own transient unit under
# /run/systemd/system (supervised, Restart=on-failure), with setsid only as a
# fallback when systemd is unavailable.
#
# Manual use:  /opt/vetro-root/boot.sh
# Status:      /opt/vetro-root/boot.sh --status
set -u

BASE=${VETRO_ROOT_DIR:-/opt/vetro-root}
if [ -f "$BASE/env" ]; then
    . "$BASE/env"
fi

# Diagnostic trail readable after a boot without USB. This lives in $BASE
# (persistent /opt) rather than /tmp, because /tmp is cleared later in boot.
BOOT_LOG=${VETRO_BOOT_LOG:-$BASE/boot.log}
boot_log() {
    printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S' 2>/dev/null)" "$*" >> "$BOOT_LOG" 2>/dev/null || true
}
boot_log "start uid=$(id -u 2>/dev/null) label=$(cat /proc/self/attr/current 2>/dev/null) arg=${1:-}"

DAEMON=${VETRO_DAEMON:-/opt/usr/apps/vetrotvapp/res/wgt/root-daemon/root-daemon.js}
[ -f "$DAEMON" ] || DAEMON="$BASE/root-daemon.js"
NODE=${VETRO_NODE:-/usr/bin/node}
PID_FILE=${VETRO_ROOT_PID:-/tmp/vetro-root-daemon.pid}
LOCK_FILE=${VETRO_ROOT_LOCK:-/tmp/vetro-root-daemon.lock}
LOG_FILE=${VETRO_ROOT_LOG:-$BASE/daemon.log}
OUT_FILE=${VETRO_ROOT_OUT:-$BASE/daemon.out}
UNIT_DIR=${VETRO_UNIT_DIR:-/run/systemd/system}
UNIT_NAME=${VETRO_UNIT_NAME:-vetro-rootd.service}

running_pid() {
    [ -f "$PID_FILE" ] || return 1
    pid=$(cat "$PID_FILE" 2>/dev/null)
    [ -n "$pid" ] || return 1
    kill -0 "$pid" 2>/dev/null || return 1
    # Guard against pid reuse: the daemon must actually be our node process.
    if [ -r "/proc/$pid/cmdline" ]; then
        grep -q root-daemon "/proc/$pid/cmdline" 2>/dev/null || return 1
    else
        ps -p "$pid" -o command= 2>/dev/null | grep -q root-daemon || return 1
    fi
    printf '%s' "$pid"
}

# Start the daemon as a transient systemd unit so it survives AT-HUB.service's
# cgroup teardown and is restarted if it crashes. Returns non-zero when the
# unit cannot be used, so the caller can fall back to setsid.
start_systemd() {
    command -v systemctl >/dev/null 2>&1 || { boot_log "systemd: systemctl missing"; return 1; }
    mkdir -p "$UNIT_DIR" 2>/dev/null || { boot_log "systemd: cannot create $UNIT_DIR"; return 1; }
    cat > "$UNIT_DIR/$UNIT_NAME" <<EOF || { boot_log "systemd: cannot write $UNIT_DIR/$UNIT_NAME"; return 1; }
[Unit]
Description=Vetro root daemon
After=local-fs.target
ConditionPathExists=$DAEMON

[Service]
Type=simple
Environment=VETRO_ROOT_PID=$PID_FILE
Environment=VETRO_ROOT_LOCK=$LOCK_FILE
Environment=VETRO_ROOT_LOG=$LOG_FILE
# Tizen's node is UEP-patched: `node script.js` is refused for unsigned
# files. Passing the same code through -e/require() is accepted and is how
# the supervisor starts the daemon too.
ExecStart=$NODE -e "require('$DAEMON')"
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload >/dev/null 2>&1 || true
    # AT-HUB runs very early in boot (before systemd's bus is necessarily
    # usable), so retry instead of giving up on the first failure.
    i=0
    while [ "$i" -lt 30 ]; do
        if systemctl start "$UNIT_NAME" >/dev/null 2>&1; then
            boot_log "systemd: $UNIT_NAME started after ${i}s"
            return 0
        fi
        if systemctl is-active "$UNIT_NAME" >/dev/null 2>&1; then
            boot_log "systemd: $UNIT_NAME already active"
            return 0
        fi
        i=$((i + 1))
        sleep 1
    done
    boot_log "systemd: $UNIT_NAME did not start within 30s"
    return 1
}

# Fallback for the very early boot window: a daemon started from AT-HUB lives
# in AT-HUB's cgroup and is killed when that unit exits. Moving it to the root
# of the systemd hierarchy detaches it from the unit, so it survives.
escape_cgroup() {
    pid=$1
    [ -n "$pid" ] || return 1
    for f in /sys/fs/cgroup/systemd/cgroup.procs /sys/fs/cgroup/systemd/tasks; do
        [ -w "$f" ] || continue
        if printf '%s\n' "$pid" > "$f" 2>/dev/null; then
            boot_log "fallback: moved pid=$pid out of the service cgroup ($f)"
            return 0
        fi
    done
    boot_log "fallback: could not move pid=$pid out of the service cgroup"
    return 1
}

if [ "${1:-}" = "--status" ]; then
    if pid=$(running_pid); then
        echo "vetro-boot: running pid=$pid daemon=$DAEMON"
        exit 0
    fi
    echo "vetro-boot: not running daemon=$DAEMON"
    exit 1
fi

if [ "$(id -u)" != "0" ]; then
    boot_log "skip: not root"
    echo "vetro-boot: not root, skipping" >&2
    exit 0
fi

if [ ! -f "$DAEMON" ]; then
    boot_log "skip: daemon missing $DAEMON"
    echo "vetro-boot: daemon not found: $DAEMON" >&2
    exit 0
fi
if [ ! -x "$NODE" ]; then
    boot_log "skip: node missing $NODE"
    echo "vetro-boot: node not found: $NODE" >&2
    exit 0
fi

if pid=$(running_pid); then
    boot_log "already running pid=$pid"
    echo "vetro-boot: already running pid=$pid" >&2
    exit 0
fi

mkdir -p "$BASE" 2>/dev/null
umask 077

if start_systemd; then
    boot_log "started via systemd unit $UNIT_NAME"
    echo "vetro-boot: started via systemd unit $UNIT_NAME" >&2
    exit 0
fi

# Fallback when systemd is unavailable or refuses the transient unit.
# A stale lock with a dead pid is reclaimed by the daemon itself.
if command -v setsid >/dev/null 2>&1; then
    setsid /usr/bin/env \
        VETRO_ROOT_LOCK="$LOCK_FILE" \
        VETRO_ROOT_PID="$PID_FILE" \
        VETRO_ROOT_LOG="$LOG_FILE" \
        "$NODE" -e "require('$DAEMON')" </dev/null >>"$OUT_FILE" 2>&1 &
else
    /usr/bin/env \
        VETRO_ROOT_LOCK="$LOCK_FILE" \
        VETRO_ROOT_PID="$PID_FILE" \
        VETRO_ROOT_LOG="$LOG_FILE" \
        nohup "$NODE" -e "require('$DAEMON')" </dev/null >>"$OUT_FILE" 2>&1 &
fi

child=$!
printf '%s\n' "$child" > "$PID_FILE" 2>/dev/null || true
escape_cgroup "$child"
boot_log "started via fallback pid=$child"
echo "vetro-boot: started pid=$child" >&2
exit 0

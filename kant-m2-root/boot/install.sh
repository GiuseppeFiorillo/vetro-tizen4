#!/bin/sh
# Vetro root boot-hook installer.
#
# Run on the TV from a root shell. It writes the daemon and a boot hook to the
# persistent /opt partition and replaces the vendor boot script
# (/opt/etc/parseinfo.sh, run by AT-HUB.service at every boot) with an
# equivalent gawk hook. No USB stick is required after the first install.
#
# Why replace instead of append a block: Tizen's bash and node are UEP-patched
# and refuse any unsigned script file, so editing the signed vendor script
# (even after its ##UEP signature) makes AT-HUB fail with "the file is NOT
# signed". gawk is not UEP-linked, and `cat boot.sh | /bin/sh` runs shell
# content without a file check, so a gawk parseinfo.sh keeps working.
#
# This is the opt-in "persistent root" path. The host supervisor
# (supervisor/vetro_supervisor.py) covers the USB-only case without writing
# anything to /opt.
#
# Reversible: boot/install.sh --uninstall restores the signed vendor script
# from parseinfo.sh.vetro-orig. --purge also deletes /opt/vetro-root.
set -u

PREFIX=""
PAYLOAD=""
DAEMON=""
NO_START=0
FORCE=0
DRY=0
UNINSTALL=0
PURGE=0
QUIET=0

usage() {
    cat <<'EOF'
Usage: install.sh [options]

  --prefix DIR      install under DIR (offline tests only)
  --payload DIR     directory containing boot.sh and root-daemon.js
  --daemon PATH     daemon path on the TV (default: installed Vetro app copy)
  --no-start        install the hook but do not start the daemon now
  --dry-run         print what would change, write nothing
  --uninstall       remove the marked hook block
  --purge           with --uninstall, also delete the install directory
  --force           skip firmware sanity checks
  --quiet           print only the final status
  --help            show this help
EOF
}

while [ $# -gt 0 ]; do
    case "$1" in
        --prefix)    [ $# -ge 2 ] || { echo "missing value for --prefix" >&2; exit 2; }; PREFIX=$2; shift 2 ;;
        --payload)   [ $# -ge 2 ] || { echo "missing value for --payload" >&2; exit 2; }; PAYLOAD=$2; shift 2 ;;
        --daemon)    [ $# -ge 2 ] || { echo "missing value for --daemon" >&2; exit 2; }; DAEMON=$2; shift 2 ;;
        --no-start)  NO_START=1; shift ;;
        --dry-run)   DRY=1; shift ;;
        --uninstall) UNINSTALL=1; shift ;;
        --purge)     PURGE=1; shift ;;
        --force)     FORCE=1; shift ;;
        --quiet)     QUIET=1; shift ;;
        --help|-h)   usage; exit 0 ;;
        *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
    esac
done

ROOT="$PREFIX/opt/vetro-root"
HOOK="$PREFIX/opt/etc/parseinfo.sh"
BACKUP="$HOOK.vetro-orig"
HOOK_MARK="# vetro-root-hook: gawk boot hook (replaces the signed vendor parseinfo.sh)"
DEFAULT_DAEMON="/opt/usr/apps/vetrotvapp/res/wgt/root-daemon/root-daemon.js"

say() { [ "$QUIET" = "1" ] || echo "$@"; }
die() { echo "vetro-install: $*" >&2; exit 1; }

is_our_hook() {
    [ -f "$HOOK" ] && grep -qF "$HOOK_MARK" "$HOOK" 2>/dev/null
}

# Run boot.sh without executing it as a script file. On this firmware, bash's
# script-file path can block when the caller inherited a file descriptor on a
# stale USB mount; sourcing in a subshell avoids that path and keeps boot.sh's
# own "exit 0" from ending the installer.
run_boot() {
    ( set -- "$@"; . "$ROOT/boot.sh" )
}

if [ -z "$PREFIX" ] && [ "$(id -u)" != "0" ]; then
    die "must run as root on the TV"
fi

# --- payload discovery -----------------------------------------------------
SELF_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd) || SELF_DIR="."
BOOT_SRC=""
DAEMON_SRC=""
for d in "$PAYLOAD" "$SELF_DIR" "$SELF_DIR/.." "$SELF_DIR/../../chain/daemon" "$SELF_DIR/daemon"; do
    [ -n "$d" ] || continue
    [ -n "$BOOT_SRC" ]   || { [ -f "$d/boot.sh" ]        && BOOT_SRC="$d/boot.sh"; }
    [ -n "$DAEMON_SRC" ] || { [ -f "$d/root-daemon.js" ] && DAEMON_SRC="$d/root-daemon.js"; }
done
[ -n "$BOOT_SRC" ]   || die "boot.sh not found (use --payload DIR)"
[ -n "$DAEMON_SRC" ] || die "root-daemon.js not found (use --payload DIR)"

restore_vendor_hook() {
    [ -f "$BACKUP" ] || return 1
    cat "$BACKUP" > "$HOOK" || return 1
    chmod 755 "$HOOK" 2>/dev/null || true
    if command -v chsmack >/dev/null 2>&1; then
        chsmack -a _ "$HOOK" >/dev/null 2>&1 || true
    fi
    return 0
}

if [ "$UNINSTALL" = "1" ]; then
    if [ "$DRY" = "1" ]; then
        say "would restore the vendor script from $BACKUP"
        [ "$PURGE" = "1" ] && say "would delete $ROOT"
        exit 0
    fi
    if is_our_hook; then
        restore_vendor_hook || die "cannot restore $HOOK: $BACKUP is missing"
    fi
    if [ "$PURGE" = "1" ]; then
        rm -rf "$ROOT"
        say "removed $ROOT"
    fi
    say "VETRO-BOOT-UNINSTALL-OK"
    say "hook: $HOOK"
    exit 0
fi

# --- sanity checks ---------------------------------------------------------
if [ "$FORCE" != "1" ]; then
    [ -x /usr/bin/node ] || [ -x "$PREFIX/usr/bin/node" ] || \
        die "no /usr/bin/node on this firmware; the daemon needs the signed Node runtime"
    [ -x /usr/bin/gawk ] || [ -x "$PREFIX/usr/bin/gawk" ] || \
        die "no /usr/bin/gawk on this firmware; the boot hook needs it (bash/node script files are UEP-blocked)"
    if [ -f "$HOOK" ] && [ -s "$HOOK" ] && ! is_our_hook && ! head -n 1 "$HOOK" | grep -q '^#!'; then
        die "$HOOK does not start with a shebang; inspect it before installing"
    fi
    AT_HUB="$PREFIX/usr/lib/systemd/system/AT-HUB.service"
    if [ -f "$AT_HUB" ] && ! grep -q "/opt/etc/parseinfo.sh" "$AT_HUB"; then
        die "AT-HUB.service does not run /opt/etc/parseinfo.sh; the hook would never run (use --force to override)"
    fi
fi

if [ "$DRY" = "1" ]; then
    say "would install:"
    say "  $ROOT/boot.sh"
    say "  $ROOT/root-daemon.js"
    say "  $ROOT/env"
    say "  gawk hook in $HOOK (vendor backup: $BACKUP)"
    [ "$NO_START" = "1" ] || say "  start the daemon now"
    exit 0
fi

# --- install files ---------------------------------------------------------
mkdir -p "$ROOT" "$PREFIX/opt/etc" || die "could not create $ROOT"
chmod 700 "$ROOT" 2>/dev/null || true
umask 077

cp "$BOOT_SRC" "$ROOT/boot.sh" || die "could not copy boot.sh"
chmod 700 "$ROOT/boot.sh" || die "could not chmod boot.sh"
cp "$DAEMON_SRC" "$ROOT/root-daemon.js" || die "could not copy root-daemon.js"
chmod 600 "$ROOT/root-daemon.js" || true

if [ -z "$DAEMON" ]; then
    DAEMON="$ROOT/root-daemon.js"
fi
printf "VETRO_DAEMON='%s'\n" "$DAEMON" > "$ROOT/env"
cat >> "$ROOT/env" <<EOF
VETRO_ROOT_DIR='$ROOT'
VETRO_ROOT_PID='/tmp/vetro-root-daemon.pid'
VETRO_ROOT_LOCK='/tmp/vetro-root-daemon.lock'
VETRO_ROOT_LOG='$ROOT/daemon.log'
VETRO_ROOT_OUT='$ROOT/daemon.out'
VETRO_BOOT_LOG='$ROOT/boot.log'
EOF
chmod 600 "$ROOT/env" || true

# --- Smack labels ----------------------------------------------------------
# AT-HUB.service runs parseinfo.sh with the "_" label and reads files with that
# label. Files created by a System::Privileged root shell default to that
# label instead, so relabel everything AT-HUB must read. chsmack exists on
# this firmware; skip quietly elsewhere (tests).
if command -v chsmack >/dev/null 2>&1; then
    chsmack -a _ "$ROOT" "$ROOT/boot.sh" "$ROOT/env" "$ROOT/root-daemon.js" >/dev/null 2>&1 || \
        say "vetro-install: warning: chsmack failed; AT-HUB may not read the hook"
fi

# --- gawk boot hook --------------------------------------------------------
# Replace the vendor script instead of editing it: any change to the signed
# bash script invalidates its ##UEP signature and AT-HUB refuses to run it.
# Keep the vendor's target_version write and run boot.sh through a pipe.
if [ -f "$HOOK" ] && ! is_our_hook; then
    [ -f "$BACKUP" ] || cp -p "$HOOK" "$BACKUP" 2>/dev/null || die "could not back up $HOOK"
fi
tmp="$HOOK.vetro-install.$$"
cat > "$tmp" <<'EOF_GAWK'
#!/usr/bin/gawk -f
# vetro-root-hook: gawk boot hook (replaces the signed vendor parseinfo.sh)
# bash and node are UEP-patched and refuse unsigned script files; gawk is not
# linked against libkUEPUser. `cat boot.sh | /bin/sh` runs shell content
# without a script-file signature check.
BEGIN {
    # install.sh uses this to parse-check the hook without running it.
    if (ENVIRON["VETRO_HOOK_CHECK"] == "1") exit 0
    logfile = "@ROOT@/parseinfo.log"
    system("echo \"parseinfo-gawk $(date '+%Y-%m-%dT%H:%M:%S') uid=$(id -u) label=$(cat /proc/self/attr/current 2>/dev/null)\" >> " logfile " 2>/dev/null")

    repo = ""; model = ""
    while ((getline line < "/etc/prd_info.ini") > 0) {
        if (line ~ /^Build=/) { split(line, a, "="); repo = a[2]; sub(/;.*/, "", repo) }
        else if (line ~ /^Model=/) { split(line, a, "="); model = a[2]; sub(/;.*/, "", model) }
    }
    close("/etc/prd_info.ini")
    gsub(/[^A-Za-z0-9_.-]/, "", repo)
    gsub(/[^A-Za-z0-9_.-]/, "", model)
    system("echo \"__" repo "__" model "\" > /proc/target_version 2>/dev/null")

    system("cat @ROOT@/boot.sh | /bin/sh")
    # AT-HUB passes a literal "&" argument (ExecStart=...parseinfo.sh &).
    # Exit from BEGIN so gawk does not try to open it as an input file.
    exit 0
}
EOF_GAWK
sed "s|@ROOT@|$ROOT|g" "$tmp" > "$HOOK" || { rm -f "$tmp"; die "could not write $HOOK"; }
rm -f "$tmp"
chmod 755 "$HOOK" || true
if [ -n "$PREFIX" ]; then
    VETRO_HOOK_CHECK=1 gawk -f "$HOOK" </dev/null >/dev/null 2>&1 || say "vetro-install: warning: hook syntax check failed"
fi
if command -v chsmack >/dev/null 2>&1; then
    chsmack -a _ "$HOOK" >/dev/null 2>&1 || true
    [ -f "$BACKUP" ] && chsmack -a _ "$BACKUP" >/dev/null 2>&1 || true
fi

# --- start now -------------------------------------------------------------
STARTED=0
if [ "$NO_START" != "1" ]; then
    run_boot >/dev/null 2>&1 || true
    i=0
    while [ $i -lt 8 ]; do
        if run_boot --status >/dev/null 2>&1; then STARTED=1; break; fi
        sleep 1
        i=$((i + 1))
    done
fi

say "VETRO-BOOT-INSTALL-OK"
say "root:  $ROOT"
say "hook:  $HOOK"
say "daemon: ${DAEMON:-$DEFAULT_DAEMON}"
if [ "$NO_START" = "1" ]; then
    say "start: skipped (--no-start)"
elif [ "$STARTED" = "1" ]; then
    say "start: running"
else
    say "start: pending; inspect $ROOT/daemon.log and $ROOT/daemon.out"
fi
exit 0

#!/usr/bin/env python3
"""Small CLI for the Vetro root supervisor and the TV daemon.

Examples
--------
    python3 supervisor/vetroctl.py health
    python3 supervisor/vetroctl.py status --tv-ip TV_IP
    python3 supervisor/vetroctl.py send 'ps -ef | grep [r]oot-daemon'
    python3 supervisor/vetroctl.py ensure

``send`` and ``ensure`` append to ``state/cmds.txt``; the supervisor forwards
only bytes appended after the current shell connection, so commands are never
replayed on reconnect.
"""

import argparse
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.abspath(os.path.join(HERE, "..", "state"))
ENSURE = (
    "P=$(cat /tmp/vetro-root-daemon.pid 2>/dev/null); "
    "if [ -n \"$P\" ] && kill -0 \"$P\" 2>/dev/null; then echo VETRO-ALREADY-RUNNING pid=$P; "
    "else setsid /usr/bin/env VETRO_ROOT_LOCK=/tmp/vetro-root-daemon.lock "
    "VETRO_ROOT_PID=/tmp/vetro-root-daemon.pid VETRO_ROOT_LOG=/tmp/vetro-root-daemon.log "
    "/usr/bin/node -e 'require(\"/opt/usr/apps/vetrotvapp/res/wgt/root-daemon/root-daemon.js\")' "
    "</dev/null >>/tmp/vetro-root-daemon.out 2>&1 & echo VETRO-STARTED pid=$!; fi\n"
)


def http_json(url, timeout=5.0):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", "replace"))


def main(argv=None):
    ap = argparse.ArgumentParser(description="Vetro root CLI")
    ap.add_argument("--state-dir", default=STATE)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_health = sub.add_parser("health", help="supervisor health (host side)")
    p_health.add_argument("--port", type=int, default=4450)

    p_status = sub.add_parser("status", help="Vetro service /status (TV side)")
    p_status.add_argument("--tv-ip", default="", help="TV IPv4 address (required unless --url is set)")
    p_status.add_argument("--url", default="")

    p_send = sub.add_parser("send", help="queue a shell command for the next/current root shell")
    p_send.add_argument("command", nargs="+")

    sub.add_parser("ensure", help="queue the idempotent daemon start")

    args = ap.parse_args(argv)

    if args.cmd == "health":
        print(json.dumps(http_json("http://127.0.0.1:%d/health" % args.port), indent=2))
        return 0

    if args.cmd == "status":
        if not args.tv_ip and not args.url:
            ap.error("status requires --tv-ip or --url")
        url = args.url or ("http://%s:8099/status" % args.tv_ip)
        status = http_json(url)
        agent = status.get("agent") or {}
        print(json.dumps(status, indent=2))
        print(
            "\nsummary: running=%r agent.connected=%r pid=%r uid=%r"
            % (status.get("running"), agent.get("connected"), agent.get("pid"), agent.get("uid")),
            file=sys.stderr,
        )
        return 0 if agent.get("connected") else 1

    cmds = os.path.join(os.path.abspath(args.state_dir), "cmds.txt")
    os.makedirs(os.path.dirname(cmds), exist_ok=True)
    if args.cmd == "ensure":
        text = ENSURE
    else:
        text = " ".join(args.command) + "\n"
    with open(cmds, "a") as f:
        f.write(text)
    print("queued in %s" % cmds)
    return 0


if __name__ == "__main__":
    sys.exit(main())

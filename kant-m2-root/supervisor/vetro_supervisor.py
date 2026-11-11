#!/usr/bin/env python3
"""Vetro root supervisor.

Listens for the TV's reverse root shell, and makes sure the Vetro root daemon
is running whenever root access is available. It does not care how root was
obtained (USB chain, persistent hook, manual shell): the only trigger is a
root shell connecting.

What it does
------------
1. Accepts the TV reverse shell on TCP 4445 (the TV connects out to us).
2. On every new connection, sends one idempotent "ensure" snippet. The daemon
   owns a lock file, so a second start exits harmlessly.
3. Polls the Vetro service ``/status`` endpoint. If the service is up but the
   root agent is disconnected, it first retries "ensure", then restarts the
   daemon after repeated failures (with a cooldown).
4. Never replays old commands on reconnect: the manual command queue starts at
   the end of the file for each new shell.

The supervisor itself needs no root and no TV-side install. It is the
"root available -> daemon active" path that works while the USB chain is the
source of root. The persistent boot hook in ``boot/`` covers the case where
root exists without the host computer being online.
"""

import argparse
import json
import os
import socket
import sys
import threading
import time
import urllib.error
import urllib.request

DEFAULT_DAEMON = "/opt/usr/apps/vetrotvapp/res/wgt/root-daemon/root-daemon.js"
PID_FILE = "/tmp/vetro-root-daemon.pid"
LOCK_FILE = "/tmp/vetro-root-daemon.lock"
LOG_FILE = "/tmp/vetro-root-daemon.log"
OUT_FILE = "/tmp/vetro-root-daemon.out"

ENSURE = r"""echo VETRO-ENSURE-BEGIN
if [ "$(id -u)" != "0" ]; then
  echo VETRO-SKIP-NOT-ROOT
else
  D="__DAEMON__"
  if [ ! -f "$D" ]; then
    echo VETRO-SKIP-NO-DAEMON
  else
    P=$(cat __PID__ 2>/dev/null)
    if [ -n "$P" ] && kill -0 "$P" 2>/dev/null && grep -q root-daemon "/proc/$P/cmdline" 2>/dev/null; then
      echo "VETRO-ALREADY-RUNNING pid=$P"
    else
      setsid /usr/bin/env VETRO_ROOT_LOCK=__LOCK__ VETRO_ROOT_PID=__PID__ VETRO_ROOT_LOG=__LOG__ /usr/bin/node -e "require('$D')" </dev/null >>__OUT__ 2>&1 &
      echo "VETRO-STARTED pid=$!"
    fi
  fi
fi
echo VETRO-ENSURE-END
"""

RESTART = r"""echo VETRO-RESTART-BEGIN
if [ "$(id -u)" != "0" ]; then
  echo VETRO-SKIP-NOT-ROOT
else
  P=$(cat __PID__ 2>/dev/null)
  [ -n "$P" ] && kill "$P" 2>/dev/null
  sleep 1
  [ -n "$P" ] && kill -9 "$P" 2>/dev/null
  # The lock is intentionally kept: the daemon takes it over exclusively when
  # the old pid is gone, so a failed kill cannot produce a second daemon.
  D="__DAEMON__"
  if [ -f "$D" ]; then
    setsid /usr/bin/env VETRO_ROOT_LOCK=__LOCK__ VETRO_ROOT_PID=__PID__ VETRO_ROOT_LOG=__LOG__ /usr/bin/node -e "require('$D')" </dev/null >>__OUT__ 2>&1 &
    echo "VETRO-RESTARTED pid=$!"
  else
    echo VETRO-SKIP-NO-DAEMON
  fi
fi
echo VETRO-RESTART-END
"""


def render(template, daemon):
    return (
        template.replace("__DAEMON__", daemon)
        .replace("__PID__", PID_FILE)
        .replace("__LOCK__", LOCK_FILE)
        .replace("__LOG__", LOG_FILE)
        .replace("__OUT__", OUT_FILE)
    )


class Supervisor:
    def __init__(self, args):
        self.args = args
        self.lock = threading.Lock()
        self.conn = None
        self.peer_ip = None
        self.connected_at = None
        self.bytes_in = 0
        self.last_status = None
        self.last_status_at = None
        self.last_error = None
        self.fail_count = 0
        self.last_restart = 0.0
        self.last_action = "none"
        self.last_action_at = None
        self.stop = threading.Event()

        self.state_dir = os.path.abspath(args.state_dir)
        os.makedirs(self.state_dir, exist_ok=True)
        self.log_path = os.path.join(self.state_dir, "supervisor.log")
        self.shell_log = os.path.join(self.state_dir, "root_shell.log")
        self.cmds_path = os.path.join(self.state_dir, "cmds.txt")
        if not os.path.exists(self.cmds_path):
            open(self.cmds_path, "a").close()

    # ---------------------------------------------------------------- logging
    def log(self, message):
        line = "%s %s\n" % (time.strftime("%Y-%m-%dT%H:%M:%S"), message)
        try:
            with open(self.log_path, "a") as f:
                f.write(line)
        except OSError:
            pass
        sys.stderr.write(line)
        sys.stderr.flush()

    def set_action(self, action):
        self.last_action = action
        self.last_action_at = time.strftime("%Y-%m-%dT%H:%M:%S")

    # --------------------------------------------------------------- commands
    def send(self, text):
        data = text.encode("utf-8") if isinstance(text, str) else text
        with self.lock:
            conn = self.conn
        if conn is None:
            return False
        try:
            conn.sendall(data)
            return True
        except OSError as exc:
            self.log("send failed: %s" % exc)
            return False

    def send_ensure(self, reason):
        self.log("ensure daemon (%s)" % reason)
        self.set_action("ensure")
        self.send(render(ENSURE, self.args.daemon))

    def send_restart(self, reason):
        self.log("restart daemon (%s)" % reason)
        self.set_action("restart")
        self.send(render(RESTART, self.args.daemon))
        self.last_restart = time.time()

    # ---------------------------------------------------------------- status
    def status_host(self):
        """Return an address the Vetro service accepts in the Host header.

        The service rejects hostnames (hostOk allows IPs and localhost only),
        so a configured name is resolved once per poll.
        """
        host = self.args.tv_ip or self.peer_ip
        if not host:
            return None
        try:
            socket.inet_aton(host)
            return host
        except OSError:
            try:
                return socket.gethostbyname(host)
            except OSError:
                return host

    def fetch_status(self):
        if self.args.status_url:
            url = self.args.status_url
        else:
            ip = self.status_host()
            if not ip:
                return None, "no TV address yet"
            url = "http://%s:8099/status" % ip
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=self.args.timeout) as resp:
                body = resp.read()
            return json.loads(body.decode("utf-8", "replace")), None
        except (urllib.error.URLError, OSError, ValueError) as exc:
            return None, "%s: %s" % (type(exc).__name__, exc)

    def healthy(self, status):
        if not status:
            return False
        agent = status.get("agent") or {}
        return bool(agent.get("connected")) and status.get("running", True) is not False

    def poll_once(self):
        status, error = self.fetch_status()
        with self.lock:
            self.last_status = status
            self.last_status_at = time.strftime("%Y-%m-%dT%H:%M:%S")
            self.last_error = error
            connected = self.conn is not None

        if error:
            # The Vetro service itself is unreachable. Restarting the root
            # daemon cannot help, so only report it.
            self.log("status unreachable: %s" % error)
            self.fail_count = 0
            return

        if self.healthy(status):
            if self.fail_count:
                self.log("status healthy again (agent connected)")
            self.fail_count = 0
            return

        # A restart needs a moment to take effect. Sending "ensure" in that
        # window races the new daemon and can leave two of them behind.
        settle = time.time() - self.last_restart
        if self.last_restart and settle < 5:
            self.log("waiting for restarted daemon (%.1fs)" % settle)
            return

        self.fail_count += 1
        agent = (status or {}).get("agent") or {}
        self.log(
            "status unhealthy (attempt %d): agent.connected=%r pid=%r"
            % (self.fail_count, agent.get("connected"), agent.get("pid"))
        )
        if not connected:
            self.log("no root shell connected; cannot start or restart the daemon")
            return

        cooldown = time.time() - self.last_restart
        if self.fail_count >= self.args.restart_after and cooldown >= self.args.restart_cooldown:
            self.send_restart("agent disconnected for %d polls" % self.fail_count)
            self.fail_count = 0
        elif self.fail_count in (1, self.args.restart_after - 1):
            self.send_ensure("agent disconnected, attempt %d" % self.fail_count)

    def poll_loop(self):
        while not self.stop.is_set():
            try:
                self.poll_once()
            except Exception as exc:  # keep the supervisor alive
                self.log("poll error: %s: %s" % (type(exc).__name__, exc))
            self.stop.wait(self.args.poll_interval)

    # ---------------------------------------------------------------- shell
    def read_loop(self, conn):
        conn.settimeout(2.0)
        while not self.stop.is_set():
            try:
                data = conn.recv(65536)
            except socket.timeout:
                continue
            except OSError as exc:
                self.log("shell recv error: %s" % exc)
                break
            if not data:
                break
            self.bytes_in += len(data)
            try:
                with open(self.shell_log, "ab") as f:
                    f.write(data)
                    f.flush()
                    os.fsync(f.fileno())
            except OSError:
                pass
        with self.lock:
            if self.conn is conn:
                self.conn = None
        self.log("root shell closed (%d bytes this session)" % self.bytes_in)

    def handle(self, conn, addr):
        with self.lock:
            previous = self.conn
            self.conn = conn
            self.peer_ip = addr[0]
            self.connected_at = time.strftime("%Y-%m-%dT%H:%M:%S")
            self.bytes_in = 0
        if previous is not None:
            try:
                previous.close()
            except OSError:
                pass
        self.log("root shell connected from %s:%s" % addr)

        reader = threading.Thread(target=self.read_loop, args=(conn,), daemon=True)
        reader.start()

        # Manual command injection: capture the queue position before sending
        # anything, so a command appended right after the shell connects is not
        # skipped. Old commands are still never replayed.
        try:
            pos = os.path.getsize(self.cmds_path)
        except OSError:
            pos = 0

        # The TV shell is interactive; give it a moment before typing.
        time.sleep(0.4)
        self.send("export PS1='vetro-root# '\n")
        self.send_ensure("root shell connected")

        while not self.stop.is_set():
            with self.lock:
                if self.conn is not conn:
                    break
            try:
                size = os.path.getsize(self.cmds_path)
            except OSError:
                size = pos
            if size > pos:
                try:
                    with open(self.cmds_path, "rb") as f:
                        f.seek(pos)
                        chunk = f.read()
                except OSError:
                    chunk = b""
                pos += len(chunk)
                if chunk:
                    self.log("forward %d manual command bytes" % len(chunk))
                    if not self.send(chunk):
                        break
            self.stop.wait(0.25)

    # ---------------------------------------------------------------- health
    def snapshot(self):
        with self.lock:
            return {
                "connected": self.conn is not None,
                "peer": self.peer_ip,
                "connected_at": self.connected_at,
                "bytes_in": self.bytes_in,
                "status_at": self.last_status_at,
                "status_error": self.last_error,
                "agent": ((self.last_status or {}).get("agent") or {}),
                "fail_count": self.fail_count,
                "last_action": self.last_action,
                "last_action_at": self.last_action_at,
                "daemon": self.args.daemon,
                "port": self.args.port,
            }

    def health_loop(self):
        srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            srv.bind((self.args.health_bind, self.args.health_port))
            srv.listen(8)
        except OSError as exc:
            self.log("health endpoint disabled: %s" % exc)
            return
        self.log("health endpoint on http://%s:%d/health" % (self.args.health_bind, self.args.health_port))
        srv.settimeout(1.0)
        while not self.stop.is_set():
            try:
                conn, _ = srv.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            try:
                conn.settimeout(2.0)
                conn.recv(4096)
                body = json.dumps(self.snapshot(), indent=2).encode("utf-8")
                conn.sendall(
                    b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n"
                    b"Content-Length: " + str(len(body)).encode() + b"\r\nConnection: close\r\n\r\n" + body
                )
            except OSError:
                pass
            finally:
                try:
                    conn.close()
                except OSError:
                    pass
        srv.close()

    # ----------------------------------------------------------------- serve
    def serve(self):
        srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        srv.bind((self.args.bind, self.args.port))
        srv.listen(4)
        self.log("supervisor listening on %s:%d (daemon %s)" % (self.args.bind, self.args.port, self.args.daemon))

        threading.Thread(target=self.poll_loop, daemon=True).start()
        if self.args.health_port:
            threading.Thread(target=self.health_loop, daemon=True).start()

        try:
            while not self.stop.is_set():
                try:
                    conn, addr = srv.accept()
                except OSError:
                    break
                threading.Thread(target=self.handle, args=(conn, addr), daemon=True).start()
        finally:
            srv.close()


def parse_args(argv):
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description="Vetro root supervisor")
    ap.add_argument("--bind", default="0.0.0.0", help="listen address for the TV reverse shell")
    ap.add_argument("--port", type=int, default=4445, help="TV reverse shell port (default 4445)")
    ap.add_argument("--health-port", type=int, default=4450, help="local /health port (0 disables)")
    ap.add_argument("--health-bind", default="127.0.0.1", help="health listen address")
    ap.add_argument("--tv-ip", default="", help="TV address for /status (default: peer address)")
    ap.add_argument("--status-url", default="", help="override the full /status URL")
    ap.add_argument("--daemon", default=DEFAULT_DAEMON, help="root-daemon.js path on the TV")
    ap.add_argument("--state-dir", default=os.path.join(here, "..", "state"), help="logs and manual queue")
    ap.add_argument("--poll-interval", type=float, default=10.0, help="seconds between /status polls")
    ap.add_argument("--timeout", type=float, default=5.0, help="HTTP timeout")
    ap.add_argument("--restart-after", type=int, default=4, help="failed polls before a restart")
    ap.add_argument("--restart-cooldown", type=float, default=60.0, help="minimum seconds between restarts")
    return ap.parse_args(argv)


def main(argv=None):
    args = parse_args(argv if argv is not None else sys.argv[1:])
    sup = Supervisor(args)
    try:
        sup.serve()
    except KeyboardInterrupt:
        sup.stop.set()
        sup.log("stopped by user")
    return 0


if __name__ == "__main__":
    sys.exit(main())

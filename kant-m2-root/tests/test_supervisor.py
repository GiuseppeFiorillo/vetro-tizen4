#!/usr/bin/env python3
"""Integration tests for the host-side Vetro root supervisor.

A fake TV shell connects to the supervisor, and a fake Vetro /status endpoint
drives the health logic. No TV and no root are involved.
"""

import http.server
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
SUPERVISOR = os.path.join(PROJECT, "supervisor", "vetro_supervisor.py")


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def wait_port(port, timeout=5.0):
    end = time.time() + timeout
    while time.time() < end:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.3):
                return True
        except OSError:
            time.sleep(0.05)
    return False


def recv_until(sock, marker, timeout=6.0):
    sock.settimeout(0.2)
    buf = b""
    end = time.time() + timeout
    while time.time() < end:
        try:
            chunk = sock.recv(65536)
        except socket.timeout:
            continue
        except OSError:
            break
        if not chunk:
            break
        buf += chunk
        if marker in buf:
            return buf
    return buf


def recv_window(sock, seconds=1.0):
    sock.settimeout(0.2)
    buf = b""
    end = time.time() + seconds
    while time.time() < end:
        try:
            chunk = sock.recv(65536)
        except socket.timeout:
            continue
        except OSError:
            break
        if not chunk:
            break
        buf += chunk
    return buf


class StatusState:
    def __init__(self):
        self.payload = {
            "running": True,
            "rooting": {"phase": "connected"},
            "agent": {"connected": True, "pid": 4242, "uid": 0},
        }
        self.lock = threading.Lock()

    def set(self, **kw):
        with self.lock:
            self.payload.update(kw)

    def get(self):
        with self.lock:
            return dict(self.payload)


class Handler(http.server.BaseHTTPRequestHandler):
    state = None

    def do_GET(self):
        body = json.dumps(self.state.get()).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


class SupervisorTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="vetro-sup-test-")
        self.addCleanup(shutil.rmtree, self.tmp, True)

        self.state = StatusState()
        Handler.state = self.state
        self.http = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.http_port = self.http.server_address[1]
        threading.Thread(target=self.http.serve_forever, daemon=True).start()
        self.addCleanup(self._stop_http)

        self.port = free_port()
        self.health_port = free_port()
        self.proc = subprocess.Popen(
            [
                sys.executable, SUPERVISOR,
                "--bind", "127.0.0.1",
                "--port", str(self.port),
                "--health-port", str(self.health_port),
                "--state-dir", self.tmp,
                "--status-url", "http://127.0.0.1:%d/status" % self.http_port,
                "--poll-interval", "0.2",
                "--timeout", "1",
                "--restart-after", "3",
                "--restart-cooldown", "0",
                "--daemon", "/fake/root-daemon.js",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.addCleanup(self._stop)
        self.assertTrue(wait_port(self.port), "supervisor did not start")

    def _stop(self):
        self.proc.terminate()
        try:
            self.proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.proc.kill()

    def _stop_http(self):
        try:
            self.http.shutdown()
        except Exception:
            pass
        try:
            self.http.server_close()
        except Exception:
            pass

    def connect(self):
        sock = socket.create_connection(("127.0.0.1", self.port), timeout=3)
        self.addCleanup(sock.close)
        return sock

    def test_ensure_on_connect(self):
        sock = self.connect()
        data = recv_until(sock, b"VETRO-ENSURE-END")
        self.assertIn(b"VETRO-ENSURE-BEGIN", data)
        self.assertIn(b"/fake/root-daemon.js", data)
        self.assertIn(b'id -u', data)

    def test_restart_after_repeated_disconnects(self):
        self.state.set(agent={"connected": False, "pid": None, "uid": 0})
        sock = self.connect()
        recv_until(sock, b"VETRO-ENSURE-END")
        data = recv_until(sock, b"VETRO-RESTART-END", timeout=8.0)
        self.assertIn(b"VETRO-RESTART-BEGIN", data)
        self.assertIn(b"kill", data)

    def test_healthy_status_does_not_restart(self):
        sock = self.connect()
        recv_until(sock, b"VETRO-ENSURE-END")
        data = recv_window(sock, 1.5)
        self.assertNotIn(b"VETRO-RESTART", data)

    def test_no_ensure_during_restart_settle(self):
        # Right after a restart the supervisor must wait for the new daemon
        # instead of racing it with another "ensure".
        self.state.set(agent={"connected": False, "pid": None, "uid": 0})
        sock = self.connect()
        recv_until(sock, b"VETRO-ENSURE-END")
        recv_until(sock, b"VETRO-RESTART-END", timeout=8.0)
        data = recv_window(sock, 2.0)
        self.assertNotIn(b"VETRO-ENSURE", data)

    def test_no_replay_on_reconnect(self):
        sock = self.connect()
        recv_until(sock, b"VETRO-ENSURE-END")
        cmds = os.path.join(self.tmp, "cmds.txt")
        with open(cmds, "a") as f:
            f.write("echo MANUAL-ONE\n")
        first = recv_until(sock, b"MANUAL-ONE", timeout=5.0)
        self.assertIn(b"MANUAL-ONE", first)
        sock.close()
        time.sleep(0.4)

        sock2 = self.connect()
        data = recv_until(sock2, b"VETRO-ENSURE-END")
        self.assertIn(b"VETRO-ENSURE-BEGIN", data)
        tail = recv_window(sock2, 1.0)
        self.assertNotIn(b"MANUAL-ONE", data + tail)

    def test_health_endpoint(self):
        sock = self.connect()
        recv_until(sock, b"VETRO-ENSURE-END")
        body = b""
        for _ in range(20):
            try:
                s = socket.create_connection(("127.0.0.1", self.health_port), timeout=2)
                s.sendall(b"GET /health HTTP/1.0\r\n\r\n")
                while True:
                    chunk = s.recv(4096)
                    if not chunk:
                        break
                    body += chunk
                s.close()
                break
            except OSError:
                time.sleep(0.1)
        payload = json.loads(body.split(b"\r\n\r\n", 1)[1])
        self.assertTrue(payload["connected"])
        self.assertEqual(payload["peer"], "127.0.0.1")

    def test_no_shell_no_restart(self):
        self.state.set(agent={"connected": False, "pid": None, "uid": 0})
        time.sleep(1.2)
        # Supervisor must stay alive and report no shell.
        body = b""
        s = socket.create_connection(("127.0.0.1", self.health_port), timeout=2)
        s.sendall(b"GET /health HTTP/1.0\r\n\r\n")
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            body += chunk
        s.close()
        payload = json.loads(body.split(b"\r\n\r\n", 1)[1])
        self.assertFalse(payload["connected"])

    def test_unreachable_status_does_not_restart(self):
        self._stop_http()
        sock = self.connect()
        recv_until(sock, b"VETRO-ENSURE-END")
        data = recv_window(sock, 1.5)
        self.assertNotIn(b"VETRO-RESTART", data)


if __name__ == "__main__":
    unittest.main(verbosity=2)

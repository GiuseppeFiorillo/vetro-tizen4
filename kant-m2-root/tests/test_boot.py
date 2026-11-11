#!/usr/bin/env python3
"""Offline tests for the Vetro root boot hook.

Everything runs under a temporary --prefix; nothing touches /opt.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
INSTALL = os.path.join(PROJECT, "boot", "install.sh")
BOOT = os.path.join(PROJECT, "boot", "boot.sh")
BUILD = os.path.join(PROJECT, "tools", "build_bundle.py")

VENDOR_HOOK = """#!/bin/sh
# vendor boot script
echo vendor-start
/usr/bin/true
"""


def run(args, **kw):
    return subprocess.run(args, capture_output=True, text=True, **kw)


def read(path):
    with open(path) as f:
        return f.read()


class BootInstallTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="vetro-boot-test-")
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def prefix(self, name="root"):
        return os.path.join(self.tmp, name)

    def install(self, prefix, *extra):
        return run(["/bin/sh", INSTALL, "--prefix", prefix, "--force", "--no-start", *extra])

    def hook_path(self, prefix):
        return os.path.join(prefix, "opt", "etc", "parseinfo.sh")

    def write_vendor_hook(self, prefix):
        path = self.hook_path(prefix)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write(VENDOR_HOOK)

    def test_installs_files_and_gawk_hook(self):
        p = self.prefix()
        self.write_vendor_hook(p)
        res = self.install(p)
        self.assertEqual(res.returncode, 0, res.stderr)

        root = os.path.join(p, "opt", "vetro-root")
        for name in ("boot.sh", "root-daemon.js", "env"):
            self.assertTrue(os.path.isfile(os.path.join(root, name)), name)

        hook = read(self.hook_path(p))
        self.assertTrue(hook.startswith("#!/usr/bin/gawk -f\n"))
        self.assertIn("# vetro-root-hook", hook)
        self.assertIn("cat %s/boot.sh | /bin/sh" % root, hook)
        self.assertIn("/proc/target_version", hook)
        # The gawk hook replaces the vendor script; it must not be edited in.
        self.assertNotIn("echo vendor-start", hook)

        # untouched backup of the signed vendor script
        self.assertTrue(os.path.isfile(self.hook_path(p) + ".vetro-orig"))
        self.assertEqual(read(self.hook_path(p) + ".vetro-orig"), VENDOR_HOOK)

        # daemon source is the copied fallback, not the app path
        self.assertEqual(
            read(os.path.join(root, "root-daemon.js")),
            read(os.path.join(os.path.dirname(PROJECT), "chain", "daemon", "root-daemon.js")),
        )

    def test_idempotent_hook(self):
        p = self.prefix()
        self.write_vendor_hook(p)
        self.assertEqual(self.install(p).returncode, 0)
        self.assertEqual(self.install(p).returncode, 0)
        hook = read(self.hook_path(p))
        self.assertEqual(hook.count("# vetro-root-hook"), 1)
        # Reinstalling must not overwrite the vendor backup with our hook.
        self.assertEqual(read(self.hook_path(p) + ".vetro-orig"), VENDOR_HOOK)

    def test_uninstall_restores_vendor_hook(self):
        p = self.prefix()
        self.write_vendor_hook(p)
        self.assertEqual(self.install(p).returncode, 0)
        res = run(["/bin/sh", INSTALL, "--prefix", p, "--uninstall"])
        self.assertEqual(res.returncode, 0, res.stderr)
        hook = read(self.hook_path(p))
        self.assertNotIn("vetro-root", hook)
        self.assertEqual(hook, VENDOR_HOOK)
        # files stay unless --purge
        self.assertTrue(os.path.isdir(os.path.join(p, "opt", "vetro-root")))

    def test_uninstall_purge(self):
        p = self.prefix()
        self.write_vendor_hook(p)
        self.assertEqual(self.install(p).returncode, 0)
        res = run(["/bin/sh", INSTALL, "--prefix", p, "--uninstall", "--purge"])
        self.assertEqual(res.returncode, 0, res.stderr)
        self.assertFalse(os.path.exists(os.path.join(p, "opt", "vetro-root")))
        self.assertEqual(read(self.hook_path(p)), VENDOR_HOOK)

    def test_dry_run_writes_nothing(self):
        p = self.prefix()
        self.write_vendor_hook(p)
        before = read(self.hook_path(p))
        res = run(["/bin/sh", INSTALL, "--prefix", p, "--force", "--dry-run"])
        self.assertEqual(res.returncode, 0, res.stderr)
        self.assertIn("gawk hook", res.stdout)
        self.assertEqual(read(self.hook_path(p)), before)
        self.assertFalse(os.path.exists(os.path.join(p, "opt", "vetro-root")))

    def test_creates_missing_hook(self):
        p = self.prefix()
        res = self.install(p)
        self.assertEqual(res.returncode, 0, res.stderr)
        hook = read(self.hook_path(p))
        self.assertTrue(hook.startswith("#!/usr/bin/gawk -f\n"))
        self.assertIn("# vetro-root-hook", hook)
        self.assertFalse(os.path.exists(self.hook_path(p) + ".vetro-orig"))

    def test_env_points_at_install_dir(self):
        p = self.prefix()
        self.assertEqual(self.install(p).returncode, 0)
        env = read(os.path.join(p, "opt", "vetro-root", "env"))
        self.assertIn("VETRO_ROOT_DIR='%s'" % os.path.join(p, "opt", "vetro-root"), env)
        self.assertIn("VETRO_ROOT_PID='/tmp/vetro-root-daemon.pid'", env)
        # The hook must run the installed copy, not a stale app copy, so the
        # daemon fixes in this folder take effect.
        self.assertIn(
            "VETRO_DAEMON='%s'" % os.path.join(p, "opt", "vetro-root", "root-daemon.js"),
            env,
        )
        self.assertIn(
            "VETRO_BOOT_LOG='%s'" % os.path.join(p, "opt", "vetro-root", "boot.log"),
            env,
        )

    def _fake_tools(self, p):
        for name, body in (("node", "#!/bin/sh\n"), ("gawk", "#!/bin/sh\n")):
            path = os.path.join(p, "usr", "bin", name)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w") as f:
                f.write(body)
            os.chmod(path, 0o755)

    def test_refuses_hook_not_wired(self):
        p = self.prefix()
        at_hub = os.path.join(p, "usr", "lib", "systemd", "system", "AT-HUB.service")
        os.makedirs(os.path.dirname(at_hub), exist_ok=True)
        with open(at_hub, "w") as f:
            f.write("[Service]\nExecStart=/bin/true\n")
        self._fake_tools(p)
        res = run(["/bin/sh", INSTALL, "--prefix", p, "--no-start"])
        self.assertNotEqual(res.returncode, 0)
        self.assertIn("parseinfo", res.stderr)

    def test_accepts_wired_hook(self):
        p = self.prefix()
        at_hub = os.path.join(p, "usr", "lib", "systemd", "system", "AT-HUB.service")
        os.makedirs(os.path.dirname(at_hub), exist_ok=True)
        with open(at_hub, "w") as f:
            f.write("[Service]\nExecStart=/opt/etc/parseinfo.sh &\n")
        self._fake_tools(p)
        res = run(["/bin/sh", INSTALL, "--prefix", p, "--no-start"])
        self.assertEqual(res.returncode, 0, res.stderr)

    def test_bundle_is_self_contained(self):
        out = os.path.join(self.tmp, "out")
        res = run([sys.executable, BUILD, "--out", out])
        self.assertEqual(res.returncode, 0, res.stderr)
        bundle = os.path.join(out, "vetro-boot-install.sh")
        self.assertTrue(os.path.isfile(bundle))
        manifest = json.loads(read(os.path.join(out, "vetro-boot-install.manifest.json")))
        self.assertEqual(len(manifest["sha256"]), 64)

        p = self.prefix("bundle")
        self.write_vendor_hook(p)
        res = run(["/bin/sh", bundle, "--prefix", p, "--force", "--no-start"])
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        hook = read(self.hook_path(p))
        self.assertIn("# vetro-root-hook", hook)
        self.assertTrue(os.path.isfile(os.path.join(p, "opt", "vetro-root", "root-daemon.js")))


class BootScriptTest(unittest.TestCase):
    def test_status_when_not_running(self):
        tmp = tempfile.mkdtemp(prefix="vetro-boot-status-")
        self.addCleanup(shutil.rmtree, tmp, True)
        env = dict(os.environ)
        env["VETRO_ROOT_DIR"] = tmp
        env["VETRO_ROOT_PID"] = os.path.join(tmp, "none.pid")
        res = subprocess.run(
            ["/bin/sh", os.path.join(PROJECT, "boot", "boot.sh"), "--status"],
            capture_output=True, text=True, env=env,
        )
        self.assertEqual(res.returncode, 1)
        self.assertIn("not running", res.stdout)

    def test_refuses_without_root(self):
        if os.geteuid() == 0:
            self.skipTest("running as root")
        tmp = tempfile.mkdtemp(prefix="vetro-boot-nonroot-")
        self.addCleanup(shutil.rmtree, tmp, True)
        env = dict(os.environ)
        env["VETRO_ROOT_DIR"] = tmp
        res = subprocess.run(
            ["/bin/sh", os.path.join(PROJECT, "boot", "boot.sh")],
            capture_output=True, text=True, env=env,
        )
        self.assertEqual(res.returncode, 0)
        self.assertIn("not root", res.stderr)


class BootStartTest(unittest.TestCase):
    """Exercise the start path with a fake node and a fake root id."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="vetro-boot-start-")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.pids = []
        self.addCleanup(self._kill)

    def _kill(self):
        for pid in self.pids:
            try:
                os.kill(pid, 15)
            except OSError:
                pass

    def _env(self):
        bindir = os.path.join(self.tmp, "bin")
        os.makedirs(bindir, exist_ok=True)
        fake_id = os.path.join(bindir, "id")
        with open(fake_id, "w") as f:
            f.write('#!/bin/sh\nif [ "$1" = "-u" ]; then echo 0; exit 0; fi\nexec /usr/bin/id "$@"\n')
        os.chmod(fake_id, 0o755)

        node = os.path.join(self.tmp, "node")
        with open(node, "w") as f:
            f.write("#!/bin/sh\nsleep 30\n")
        os.chmod(node, 0o755)

        daemon = os.path.join(self.tmp, "root-daemon.js")
        with open(daemon, "w") as f:
            f.write("// fake daemon\n")

        env = dict(os.environ)
        env["PATH"] = bindir + ":" + env.get("PATH", "")
        env.update({
            "VETRO_ROOT_DIR": self.tmp,
            "VETRO_NODE": node,
            "VETRO_DAEMON": daemon,
            "VETRO_ROOT_PID": os.path.join(self.tmp, "daemon.pid"),
            "VETRO_ROOT_LOCK": os.path.join(self.tmp, "daemon.lock"),
            "VETRO_ROOT_LOG": os.path.join(self.tmp, "daemon.log"),
            "VETRO_ROOT_OUT": os.path.join(self.tmp, "daemon.out"),
            "VETRO_BOOT_LOG": os.path.join(self.tmp, "boot.log"),
        })
        return env

    def test_starts_then_detects_running(self):
        env = self._env()
        res = subprocess.run(["/bin/sh", BOOT], capture_output=True, text=True, env=env)
        self.assertEqual(res.returncode, 0, res.stderr)
        self.assertIn("started pid=", res.stderr)

        pid = int(read(env["VETRO_ROOT_PID"]).strip())
        self.pids.append(pid)

        status = None
        for _ in range(40):
            status = subprocess.run(["/bin/sh", BOOT, "--status"], capture_output=True, text=True, env=env)
            if status.returncode == 0:
                break
            time.sleep(0.1)
        self.assertEqual(status.returncode, 0, status.stdout)
        self.assertIn("running pid=%d" % pid, status.stdout)

        again = subprocess.run(["/bin/sh", BOOT], capture_output=True, text=True, env=env)
        self.assertEqual(again.returncode, 0)
        self.assertIn("already running", again.stderr)

    def test_prefers_systemd_unit(self):
        env = self._env()
        bindir = os.path.join(self.tmp, "bin")
        calls = os.path.join(self.tmp, "systemctl.log")
        fake = os.path.join(bindir, "systemctl")
        with open(fake, "w") as f:
            f.write('#!/bin/sh\necho "$@" >> %s\nexit 0\n' % calls)
        os.chmod(fake, 0o755)
        units = os.path.join(self.tmp, "units")
        env["VETRO_UNIT_DIR"] = units

        res = subprocess.run(["/bin/sh", BOOT], capture_output=True, text=True, env=env)
        self.assertEqual(res.returncode, 0, res.stderr)
        self.assertIn("systemd unit", res.stderr)

        unit = os.path.join(units, "vetro-rootd.service")
        self.assertTrue(os.path.isfile(unit))
        body = read(unit)
        self.assertIn(
            'ExecStart=%s -e "require(\'%s\')"' % (env["VETRO_NODE"], env["VETRO_DAEMON"]),
            body,
        )
        self.assertIn("Restart=on-failure", body)
        self.assertIn("Environment=VETRO_ROOT_PID=" + env["VETRO_ROOT_PID"], body)
        self.assertIn("ConditionPathExists=" + env["VETRO_DAEMON"], body)

        logged = read(calls)
        self.assertIn("daemon-reload", logged)
        self.assertIn("start vetro-rootd.service", logged)
        # The unit path must not also spawn the fallback process.
        self.assertFalse(os.path.exists(env["VETRO_ROOT_PID"]))

    def test_stale_pid_is_not_running(self):
        env = self._env()
        with open(env["VETRO_ROOT_PID"], "w") as f:
            f.write("999999\n")
        status = subprocess.run(["/bin/sh", BOOT, "--status"], capture_output=True, text=True, env=env)
        self.assertEqual(status.returncode, 1)
        self.assertIn("not running", status.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)

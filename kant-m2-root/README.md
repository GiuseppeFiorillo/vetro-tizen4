# Automatic root-daemon startup

[Back to Vetro](../README.md) · [Installation guide](../app/docs/INSTALLATION.md)

This optional add-on starts Vetro's root daemon from an existing root context. It does not provide the initial root exploit. On the tested Kant-M2 TV, the boot hook starts the daemon after a cold boot without the USB stick; other firmware is untested.

## Choose a startup method

| Method | Trigger | Host required after installation | TV changes |
| --- | --- | --- | --- |
| Boot hook | Vendor boot script runs as root | No | `/opt/vetro-root/` and `/opt/etc/parseinfo.sh` |
| Supervisor | TV reverse root shell connects to the host | Yes | No persistent installation |

The supervisor uses Python's standard library and POSIX shell tools. It is intended for Linux and macOS; hardware validation used macOS. The boot hook runs on the TV, independently of the host OS.

## Boot hook

Build and test on the host, from this directory:

```sh
./check.sh
python3 -m http.server 8000 --bind 0.0.0.0 --directory out
```

From an existing root shell on the TV, replacing `HOST_LAN_IP` with the host's LAN address:

```sh
curl -fsS http://HOST_LAN_IP:8000/vetro-boot-install.sh -o /tmp/vetro-boot-install.sh
cat /tmp/vetro-boot-install.sh | /bin/sh
```

Install Vetro before installing this hook. The installer preserves the signed vendor script as `/opt/etc/parseinfo.sh.vetro-orig`, replaces it with a gawk hook, and places the daemon and startup files in `/opt/vetro-root/`. The daemon runs as `vetro-rootd.service`, with a fallback for early boot. Its Smack label is adjusted so the app service can authenticate it.

Tizen's UEP checks reject modified unsigned shell script files. The gawk hook and stdin-based shell invocation account for that restriction; do not append commands to the signed vendor script. Do not combine this hook with another tool that replaces the same vendor script.

Verify from the host:

```sh
python3 supervisor/vetroctl.py status --tv-ip TV_IP
```

Look for `agent.connected: true` and `uid: 0`. On the TV, logs are in `/opt/vetro-root/boot.log` and `/opt/vetro-root/daemon.log`.

### Uninstall

From a root shell on the TV, restore the original vendor script:

```sh
cat /tmp/vetro-boot-install.sh | /bin/sh -s -- --uninstall
```

Download the installer again if `/tmp` has been cleared. Add `--purge` to remove `/opt/vetro-root/` as well. `--dry-run` previews changes. Removing the hook removes this daemon startup path; keep a separate root-recovery method available.

## Host supervisor

From this directory:

```sh
supervisor/run.sh --tv-ip TV_IP
python3 supervisor/vetroctl.py health
python3 supervisor/vetroctl.py status --tv-ip TV_IP
supervisor/stop.sh
```

The TV must connect to the host's reverse-shell listener on port 4445. Configure the external root method to use the correct host address. The supervisor listens on `0.0.0.0:4445`; its health endpoint is local-only at `127.0.0.1:4450`. Start it before the TV connects; replacing an existing listener can lose the current shell.

State and logs are generated under `state/` and are excluded from Git. The supervisor starts the daemon on shell connection, checks Vetro's status, and retries with bounded restart backoff if the agent disconnects. It does not install the boot hook.

## Offline tests

`./check.sh` runs the boot installer tests and a supervisor integration suite using a fake TV shell and HTTP endpoint, then builds `out/vetro-boot-install.sh`. Tests use temporary directories and do not require root or a TV. Generated installers and logs are not source files.

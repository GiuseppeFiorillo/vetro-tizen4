# Install Vetro on a Tizen 4 Kant-M2 TV

[Back to Vetro](../../README.md) · [Compatibility](../../README.md#compatibility)

## One way, and why

This fork has **one validated installation path**:

```text
USB root chain  →  root shell on the TV  →  build this fork  →  install from the root shell  →  optional boot hook
```

The other routes that upstream documents do **not** work on these TVs:

- **Apps2Samsung / the community catalog** installs the upstream Vetro 0.5.0 package. Upstream has no Tizen 4 port, so the launcher and the privileged features do not start on a Kant-M2 set. The package is not broken; it is the wrong build.
- **The prebuilt signed packages** are signed by someone else and, again, contain the upstream build.
- **The coding-agent route** only automates one of the routes above.

So: root first with the USB stick, then install the package you build here from the root shell.

**Good to know before you start**

- Use only a TV you own or are allowed to manage. Check the [compatibility table](../../README.md#compatibility) first.
- The only target validated for this fork is a **QE49Q6FNA, firmware `T-KTM2DEUC-1400.2`**. The USB exploit is tied to the Kant-M2 kernel; another firmware needs its own port.
- **Developer Mode and Host PC IP are not part of this route.** Vetro talks to a root daemon on the TV's loopback, not to the TV's SDB service.
- Keep one computer on the same trusted LAN for the whole procedure: it builds the stick, runs the listener and serves the package.
- **Never install both persistence mechanisms.** The USB repository has its own persistent daemon and this fork has its own boot hook. Both edit `/opt/etc/parseinfo.sh`. Use one; this guide uses the Vetro one.
- Root changes the TV at a privileged level. Read each step before running it, and keep the USB stick: it is the recovery route.

**What you need**

| Component | Why |
| --- | --- |
| Python 3.11+ with `pyelftools==0.33`, `capstone==5.0.9` | builds the USB image |
| Clang with the ARM integrated assembler | assembles the USB stages |
| A USB stick of at least 128 MB | is erased completely |
| Node.js 22 | builds and signs the package |
| .NET SDK 8 | builds the launcher for both Tizen 4 runtimes |
| Tizen Studio 6.1 + Samsung Certificate Extension | your own author and distributor certificate |
| `curl` on the TV | already present on the tested firmware |

## 1. Root the TV with the USB chain

Obtain initial root with [`samsung-tv-usb-root-kant-m2`](https://github.com/GiuseppeFiorillo/samsung-tv-usb-root-kant-m2). Read its README before flashing; the short version follows.

### 1.1 Build the stick

```sh
git clone https://github.com/GiuseppeFiorillo/samsung-tv-usb-root-kant-m2
cd samsung-tv-usb-root-kant-m2
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v          # optional, offline
```

Build the image with the address the TV can reach. `LISTENER_IP` is **your computer's LAN address**, not the TV's:

```sh
python tools/build.py --variant umh-boot --beacon HOST_LAN_IP:4444
```

The output is `out/umh-boot/usb.img`, plus a `manifest.json` with the size and SHA-256 of every file. The port 4444 is the beacon; the root shell comes back on **4445**.

### 1.2 Flash the stick

**This erases the whole USB device.** Check twice which disk it is.

```sh
diskutil list                          # macOS: find the USB disk, for example disk8
sudo CONFIRM_WRITE=YES bash tools/write_usb.sh out/umh-boot/usb.img disk8
```

On Linux:

```sh
sudo dd if=out/umh-boot/usb.img of=/dev/sdX bs=4M conv=fsync status=progress
sync
```

`write_usb.sh` refuses internal disks, partial disks and a missing confirmation.

### 1.3 Start the listener before the TV boots

The TV opens a **reverse** shell: it connects out to your computer. You cannot connect to the TV on 4445.

```sh
python lab/relay_shell_4445.py --bind 0.0.0.0 --port 4445 \
  --log out/root_shell.log --commands out/cmds.txt
```

Allow incoming connections on 4444 and 4445 in the computer's firewall. Commands are sent by **appending** them to `out/cmds.txt`; output appears in `out/root_shell.log`. Append only after the connection is reported, because bytes written earlier are skipped on reconnect.

### 1.4 Boot the TV with the stick inserted

1. Turn the TV off and unplug it for 30 seconds.
2. Insert the USB stick.
3. Power the TV on and leave it alone. The chain parks the boot thread and the watchdog restarts the set about 20 seconds later. The shell connects after that restart.
4. When the relay prints a connection, check the log for `uid=0(root)`. The listener must already be running: the TV tries once per cold boot and does not retry.

**Remove the stick as soon as the shell is up.** Leaving it in across several boots produced a reboot loop on the tested set. The shell survives the removal, so keep it: **do not reboot the TV until step 3.4**.

From here on, every "run on the TV" command is appended to `out/cmds.txt`, in the `samsung-tv-usb-root-kant-m2` folder.

## 2. Build Vetro for Tizen 4

Do this on the computer while the root shell is alive.

### 2.1 Get the fork

Clone this fork from its GitHub page or download its source archive, then enter the repository root:

```sh
cd /path/to/your/vetro-checkout
```

### 2.2 Build the launcher

The dock is built twice: `netcoreapp3.1` for TVs with `/usr/bin/dotnet`, and `netcoreapp2.0` for the `corerun` that the Kant-M2 firmware ships. The package chooses at runtime.

```sh
cd dock
DOTNET=/path/to/dotnet ./build.sh
cd ..
```

This copies four files into `app/native/dock/`. The package build fails later if they are missing.

### 2.3 Assemble and sign the package

The signing dependencies are declared in `rooting/on-boot-probe`:

```sh
cd rooting/on-boot-probe
npm ci
cd ../..
```

Build the unsigned package, then sign it with **your own** author and distributor certificates. Do not reuse someone else's package or certificates.

```sh
cd chain
node build.cjs
AUTHOR_P12=/path/to/author.p12 \
DIST_P12=/path/to/distributor.p12 \
AUTHOR_PW=... DIST_PW=... \
node sign.cjs
cd ..
```

Output: `chain/dist/vetro-chain-signed.wgt`. The signing script sets both signature files the TV checks (`author-signature.xml`, `signature1.xml`). Tizen Studio's Certificate Manager keeps the exported `.p12` files under `~/tizen-studio-data/keystore/`; export your profile there and pass those paths.

The package is **one** install: dashboard, background service, root agent, launcher, plus the Tizen 4 runtime pieces.

**Port clash** (for example with tizen-youtube): Vetro uses 8099. Rebuild with `VETRO_PORT=9000` in front of `node build.cjs` if another app already uses it. The dashboard then moves to `http://TV_IP:9000/`.

### 2.4 Build the optional root boot hook

This is the part that keeps root and the Vetro daemon across cold boots. It is built and installed from the root shell you already have.

```sh
cd kant-m2-root
python3 tools/build_bundle.py
./check.sh          # optional: runs the offline tests and rebuilds the bundle
cd ..
```

`python3 tools/build_bundle.py` writes `out/vetro-boot-install.sh`, a single self-contained installer.

### 2.5 Serve both files to the TV

```sh
mkdir -p /tmp/vetro-install
cp chain/dist/vetro-chain-signed.wgt kant-m2-root/out/vetro-boot-install.sh /tmp/vetro-install/
cd /tmp/vetro-install
python3 -m http.server 8000 --bind 0.0.0.0
```

Note your computer's LAN address: the TV downloads from `http://HOST_LAN_IP:8000/`.

## 3. Install from the root shell

### 3.1 Install the package

In the `samsung-tv-usb-root-kant-m2` folder, append:

```sh
printf 'curl -fsSL http://HOST_LAN_IP:8000/vetro-chain-signed.wgt -o /tmp/vetro.wgt\n' >> out/cmds.txt
printf '/usr/bin/pkgcmd -i -t wgt -p /tmp/vetro.wgt --global 2>&1; echo INSTALL_EXIT=$?\n' >> out/cmds.txt
```

Wait in `out/root_shell.log` for `INSTALL_EXIT=0`. Then confirm the package is registered:

```sh
printf '/usr/bin/pkgcmd -l | grep -i vetro\n' >> out/cmds.txt
```

`vetrotvapp` must be in the list. If it is not, stop here: do not install the boot hook on a TV without Vetro.

If `pkgcmd` refuses the package, the TV did not accept the certificate. Re-sign with your own profile (**not** a copy downloaded from someone else) and check that the distributor certificate is the one your Samsung account issued. This fork was developed with a partner-level profile; a public-level distributor certificate has not been tried on these sets, and signing level does not change what the app can do once the daemon is attached, because the privileges come from the root daemon, not from the package.

### 3.2 Start Vetro once

Open **Vetro** on the TV from **Apps**. This is required: the service only switches on its boot-start and auto-restart flags after the app has run once.

Alternatively, from the same root shell:

```sh
printf 'uid=$(/usr/bin/id -u owner 2>/dev/null); [ -n "$uid" ] || uid=5001; /usr/bin/app_launcher -s vetrotvapp.app -u "$uid"\n' >> out/cmds.txt
```

Wait about 20 seconds, then open `http://TV_IP:8099/` in a browser on the same network. The dashboard should load. At this point the root agent is still disconnected, because nothing has started the daemon yet.

### 3.3 Install the boot hook

From the same root shell:

```sh
printf 'curl -fsSL http://HOST_LAN_IP:8000/vetro-boot-install.sh -o /tmp/vetro-boot.sh\n' >> out/cmds.txt
printf 'cat /tmp/vetro-boot.sh | /bin/sh\n' >> out/cmds.txt
```

Wait for `VETRO-BOOT-INSTALL-OK`. The installer:

- writes `/opt/vetro-root/{boot.sh, root-daemon.js, env}`;
- replaces `/opt/etc/parseinfo.sh` with an equivalent **gawk** hook and keeps the signed vendor original as `parseinfo.sh.vetro-orig`;
- starts the daemon now, through a transient systemd unit, and checks it.

`bash` and `node` on this firmware are UEP-patched and refuse unsigned script files, which is why the hook is gawk and why it runs the shell script through `/bin/sh` on stdin. Do not try to edit the signed vendor script instead.

Then check the connection: `http://TV_IP:8099/status` should report

```json
{ "mode": "tv-integration", "agent": { "connected": true, "uid": 0 } }
```

If it does not, see [troubleshooting](#if-the-root-agent-is-not-connected). Do not reboot yet.

### 3.4 Remove the stick and prove the boot hook

1. Remove the USB stick if it is still inserted.
2. Unplug the TV for 30 seconds and power it on **without** the stick.
3. Wait up to 90 seconds.
4. Open `http://TV_IP:8099/status` without opening Vetro first.

If `agent.connected` is `true` with uid 0, root now comes back at every boot without the USB stick. That is the whole point of the add-on.

If it is `false`, the hook did not run. Plug the stick back in, cold-boot with it, and read `/opt/vetro-root/boot.log` and `/opt/vetro-root/daemon.log` from the root shell. A restored or replaced `parseinfo.sh` is the usual cause.

> **The first root always needs the USB.** The hook can only be installed from an existing root shell, and it does not create root by itself. Without the hook, the stick is required at every cold boot.

## 4. First run

- **The launcher is off by default.** Turn it on in the **Launcher** tab if you want it; Vetro starts and stops it from there.
- Quick settings and the Task manager work from the dashboard. Every switch records what it changed; **Maintenance → Restore the TV** puts it back.
- Read what a switch does before turning it on. Some of them stop background services that the TV expects.

## Updating

**Do not use the in-dashboard updater on this fork.** Its update source and signing key belong to upstream, so an update replaces the Tizen 4 service files with the stock ones and the fork stops working.

Update by repeating [2.2](#22-build-the-launcher), [2.3](#23-assemble-and-sign-the-package) and [3.1](#31-install-the-package). The package id is unchanged, so this is an in-place update and your settings stay. The boot hook does not need to be reinstalled unless you moved `/opt/vetro-root`.

## Uninstalling

Restore first: a package uninstall leaves the debloating changes and the domain filter behind.

1. **Restore the TV.** Dashboard → *Quick settings* → *Maintenance* → **Restore the TV**, then confirm. Read the report: uninstalled apps and values written in the TV's own settings need manual recovery.
2. **Remove Vetro's saved data.** *Remove Vetro* → *Remove Vetro's saved data*. It is offered only when nothing is left to restore, because those files hold the values used to roll back.
3. **Remove the boot hook first.** Serve the installer again as in [2.5](#25-serve-both-files-to-the-tv) and run it from a root shell; if the TV has been rebooted since the install, cold-boot it with the USB stick to get that shell. Add `--purge` to delete `/opt/vetro-root` too:

   ```sh
   curl -fsSL http://HOST_LAN_IP:8000/vetro-boot-install.sh -o /tmp/vetro-boot.sh
   cat /tmp/vetro-boot.sh | /bin/sh -s -- --uninstall --purge
   ```

   This restores the signed vendor `parseinfo.sh` byte-for-byte. If you skip this step, the root daemon keeps starting at every boot with no Vetro service to talk to.
4. **Remove the app.** From a root shell: `/usr/bin/pkgcmd -u -n vetrotvapp`. Or on the TV: **Apps** → settings icon → **Vetro** → **Delete**. Menu names vary by model.
5. **Restart the TV.** Without the boot hook, this boot has no root unless the USB stick is inserted.
6. **Home Assistant.** If you used the MQTT bridge, delete the TV device there; its entities stay until you do.

## If the root agent is not connected

Open `http://TV_IP:8099/status` and read these fields:

| What you see | What it means | What to do |
| --- | --- | --- |
| `"mode": "app-only"` | The installed package has no Tizen 4 integration: it is the upstream or prebuilt build. | Install the package you built in [2.3](#23-assemble-and-sign-the-package). Apps2Samsung cannot install this fork. |
| `"mode": "tv-integration"`, `"agent": {"connected": false}` | Vetro is running but the root daemon is not. | Install the boot hook ([3.3](#33-install-the-boot-hook)), or start the daemon from a root shell. Check `/opt/vetro-root/daemon.log`. |
| The page does not load at all | The background service is not running. | Open **Vetro** on the TV once, wait 10 seconds, reload. Confirm `vetrotvapp` with `pkgcmd -l`. |
| `agent.connected` is true after a cold boot with no USB | The boot hook works. | Nothing to do. |
| `agent.connected` is false after a cold boot with no USB | The hook did not run, or `parseinfo.sh` was replaced. | Cold-boot with the USB stick and read `/opt/vetro-root/boot.log`; reinstall the hook if needed. |
| `pkgcmd` returns a certificate or signature error | The TV does not trust the signing profile. | Re-sign with your own author/distributor certificate; do not reuse a downloaded package. |
| Install succeeds but the dashboard is unreachable | The port changed or another app owns it. | Rebuild with `VETRO_PORT=9000` and try `http://TV_IP:9000/`. |
| The launcher says it is not in this package | The package was built without the dock files. | Run `dock/build.sh` before `chain/build.cjs`, then reinstall. |

## Safety and rollback

- The USB chain writes nothing to the TV firmware. Removing the stick and rebooting clears the injected stage.
- The boot hook writes only `/opt/vetro-root/` and replaces `/opt/etc/parseinfo.sh`, keeping the signed original as `parseinfo.sh.vetro-orig`.
- `sh /tmp/vetro-boot.sh --uninstall` restores the original byte-for-byte.
- Vetro records every change it makes. **Restore the TV** is the rollback for the debloating switches.
- Root is root: a bug in the daemon or in a plugin runs with full privileges. Do not expose port 8099 or the root loopback outside your LAN.

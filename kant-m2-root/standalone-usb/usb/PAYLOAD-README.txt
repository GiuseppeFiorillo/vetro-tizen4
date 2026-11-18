Vetro USB installer -- UE65NU7100 / T-KTM2LDEUC-1400.2

STATUS: fresh-install candidate. The underlying USB root method and installed
standalone/root/recovery components were tested on the owner's TV. This new
autonomous installer has NOT been tested end-to-end on an unmodified TV.
The working TV and existing recovery stick were not changed to build this bundle.

SUPPORTED TARGET ONLY
Samsung UE65NU7100, T-KTM2LDEUC-1400.2, exact BUILD_ID
T-KTM2LDEUC-REL-202606052034 and Linux4.1.10; matching supplied firmware kernel
SHA25693d90c660cae6a871c8c5226f0a5227ec5fd12690ba83a75038005c6f275bd1c.
The trigger uses fixed kernel addresses BEFORE software checks can run. Never
try another model/firmware just to see if it works. Removing the installer USB
and a full power cycle is the recovery from the temporary USB trigger.

WHAT IS INCLUDED
INSTALL.img:80MiB raw disk image, crafted initial-root partition plus ordinary
FAT32 payload partition. Signed system Bash/Node bootstrap installs root and
standalone locally; no PC listener, network callback, SDB, certificate or
Developer Mode required. Pairing starts ON with fresh per-TV credentials.
RECOVERY.img:64MiB ordinary FAT32 data image with the exact tested recovery
marker. No crafted filesystem or executable recovery code. Keep this available.
Write-Usb.ps1: explicit target selection, hardware/system-disk guards, image
checksum and full read-back verification. Listing disks does not erase them.
Source/ and licenses accompany the package. See VALIDATION.json for actual checks.
Fresh-install adaptation: recovery leaves the paired dashboard/root agent on
port18100 running while stopping the dock. It also starts that maintenance-only
mode after a reboot with the recovery-disable flag set. This differs from the
current TV's old-dash-backed recovery and needs fresh-target hardware validation.

FRESH INSTALL ONLY
The installer refuses existing root/standalone folders, altered startup hooks,
administrator disable markers, malformed payloads, and incompatible firmware.
It does NOT upgrade or reinstall the already-working TV. A failed partial
installation also refuses automatic retry; RESULT.JSON records its last phase.
It never uninstalls apps or changes streaming accounts. Its five default tiles
are YouTube, Netflix, Disney+, Prime Video and NPO Start; apps must already exist.

INSTALLATION PROCEDURE -- controlled fresh-target testing is still required
1. Extract the bundle. Keep a separate recovery USB if possible. Flash
   RECOVERY.img first and keep it out of the TV during installation.
2. Use an erasable spare USB and the included writer to flash INSTALL.img.
   Windows may offer to format/repair the crafted first partition: CANCEL.
3. Keep Developer Mode OFF. Disconnect other USB storage. Unplug the TV, insert
   only the installation USB, then power on. The stage assumes this is /dev/sda.
4. This candidate has no verified on-screen completion indicator. For its first
   controlled test, remove the installer USB within60seconds, sooner if the TV
   starts restarting. Power off, disconnect USB, then boot normally. Do not leave
   the installer stick inserted or repeatedly reboot with it connected.
5. Reconnect USB to the PC and read RESULT.JSON on VETROSETUP. Proceed only if
   phase is installed-remove-usb. A partial/failed/missing result is NOT success.
6. On the next USB-free boot, open http://TV_IP:18100 and pair using the code
   shown on that TV. Home should open Vetro. Verify root and repeat cold startup.
   A final USB recovery test on the fresh installation is still required.

RECOVERY
Flash RECOVERY.img to a second stick, or reflash the installer stick AFTER
saving RESULT.JSON. This overwrites its crafted trigger. Insert the ordinary
recovery stick into the running TV: standalone stops, its saved launcher
preference is restored, and native Samsung Home opens. Root remains enabled.
Recovery persists across boots; removing the stick does not re-enable Vetro.
The paired dashboard remains available for maintenance. To re-enable after
removing the recovery USB, use Node18+ on the PC:
  node maintenance.cjs TV_IP resume
It pairs with a visible on-TV code and holds its token only for that run.
The ordinary recovery marker needs a running recovery
supervisor; it cannot repair a TV that never starts that supervisor.

WINDOWS WRITER (Administrator PowerShell)
  .\Write-Usb.ps1 -List
  .\Write-Usb.ps1 -Mode Recovery -DiskNumber N -ExpectedUniqueId 'EXACT_ID' -Erase
  .\Write-Usb.ps1 -Mode Install -DiskNumber N -ExpectedUniqueId 'EXACT_ID' -Erase
Use the number and UniqueId from your own spare USB, never a system/data disk.
The installer and recovery images are distinct modes; do not put the recovery
marker at the root of the installation payload volume.

This package does not flash Samsung firmware. Permanent startup uses the tested
guarded /opt/etc/parseinfo.sh hook, restoring Samsung's original bytes before
each startup and rearming after root health checks. A changed firmware build
is intentionally unsupported. Keep the firmware version fixed for this package.

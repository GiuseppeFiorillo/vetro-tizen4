# Security and responsible reports

Vetro can execute privileged commands. Use it only on devices you own or are
authorized to administer, on a trusted LAN. Do not expose its HTTP service to the
Internet. Traffic is HTTP, not TLS.

Dashboard pairing and internal root-agent authentication are separate controls.
Upstream pairing can be automatic or explicitly configured: before pairing is
enabled the management interface can be open to the LAN. Enable and verify
pairing during setup. Each browser/client then needs its own TV-displayed code.
The tested standalone setup rejects unpaired status and root execution with 401.
Never publish tokens, paired state, account information or certificates.

The root agent uses a local authenticated protocol. Keep its request files,
credentials and root-owned startup configuration private. Do not bypass firmware,
ownership or integrity checks to run an unreviewed profile.

Plugins run inside the service and are not sandboxed. Permission labels are
descriptions, not isolation. Install only trusted plugins. Update catalogs and
manifests have separate signatures; a version number alone does not make an
original Vetro binary compatible with this port.

Use GitHub private vulnerability reporting if enabled. Otherwise request a private
channel without posting credentials, personal diagnostics or sensitive details.
Preserve upstream security notices when reporting issues that affect Vetro itself.

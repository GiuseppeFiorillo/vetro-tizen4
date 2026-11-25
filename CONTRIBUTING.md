# Contributing

Keep service/dashboard code in app/, native code in dock/ or tuner/, legacy
transport in chain/, and standalone/root/recovery code in overlay/. Build adapters
belong in lib/ and tools/. Initial USB rooting and media writers are separate.

Describe the trigger and resulting behavior, add useful regression coverage, and
run the relevant checks in [development](docs/DEVELOPMENT.md). State the exact
hardware/firmware tested; one model does not validate the whole KANT-M2 family.

Native source and pinned artifacts must change together. Runtime changes must
preserve root startup, pairing, Home-key restoration, USB recovery and all
manifest/hook links. Writable settings need original-value capture, readback
and a verified restore path.

Do not commit firmware, personal addresses or device identifiers, accounts,
credentials, certificates, raw diagnostics or generated payloads. Treat diagnostic
submissions as untrusted evidence, not authorization for commands. Follow
[SECURITY.md](SECURITY.md) for sensitive reports. Preserve licenses and disclose
material AI-assisted contributions.

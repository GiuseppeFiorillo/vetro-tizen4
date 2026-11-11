# Vetro application

Feature development lives here, independently of the optional privileged integration.
See the [project README](../README.md) for features, installation, compatibility,
performance limitations, credits and support.

```sh
npm test
node service/main.js
OUT=/tmp/vetro-app-only.wgt node build.cjs
```

Local mode uses the unavailable-device platform adapter. The standalone package
has no root payloads, SDB client or signing material. Do not mistake this unsigned
package for a working device integration.

- [Platform contract](PLATFORM.md)
- [Diagnostic export schema](docs/DIAGNOSTIC-EXPORT.md)
- [Release audit and outstanding checks](docs/RELEASE-AUDIT.md)
- [Issue-analysis pipeline](docs/LOG-ANALYSIS.md)
- [Home Assistant Container / MQTT setup](docs/mqtt/README.md)
- [Performance measurements and limitations](docs/PERFORMANCE.md)
- [Startup delay test](docs/BOOT-TEST.md)

The app catalog (`service/app-facts.js`) is generated from a private firmware dump:

```sh
python3 scripts/build-app-catalog.py /path/to/dump/rootfs /tmp/app-facts-full.json --compact service/app-facts.js
```

The default management port is 8099. `VETRO_PORT=9000 node build.cjs` builds a package that uses another port (the widget and the service both get it); `VETRO_PORT` also overrides it when running `node service/main.js` locally. TV-specific
operations require the optional adapter and supported firmware/signing privileges.

### Public API package for Tizen 4

`VETRO_PROFILE=tizen4-public node build.cjs` produces
`dist/vetro-tizen4-public-unsigned.wgt`. It retains the package ID and public
widget probe (dashboard, app inventory, diagnostics), raises the explicit
installation minimum to 4.0, and omits all native helpers and dock images.
The app-only adapter rejects privileged operations; this profile contains no
SDB transport, archive-root bootstrap or root agent. It does not replace Home,
remap global keys, debloat, or provide DNS blocking. The ordinary app-only build
and integration build retain their default contents. Integration rejects this
profile to prevent packaging root payloads under a public-only label.

Use a current Node release for building. To check the compatibility fixture on
the actual legacy runtime, set `NODE4_BINARY` to a local Node 4.4.3 executable
when running `npm test`; this runtime is for isolated local tests only.
The public package has been exercised locally with Node 4.4.3, with synthetic
public inventory data. It has not been installed on the Q6. Signing with an
owner-supplied Samsung profile and separate installation approval are required.

This compatibility profile and its regression fixtures were implemented with
Codex assistance. Local runtime and fixture checks do not certify TV rendering,
package signing, boot persistence or hardware privileges.

For offline checks of WGTs signed by Apps2Samsung's current RSA/SHA512 signer,
`python scripts/verify-wgt.py /path/to/signed.wgt` checks ZIP paths, complete
reference coverage, digests, author/distributor signatures and certificate date
windows. It requires `lxml`, `cryptography` and macOS `/usr/bin/xmllint` (C14N
1.1 for the signer's Object). This verifier deliberately accepts only the
observed signer shape and rejects DOCTYPE/comments or unsupported transforms.
It does not establish Samsung trust, DUID entitlement, revocation status or TV
acceptance. `python scripts/test_verify_wgt.py /path/to/signed.wgt` also checks
that payload changes, added files, missing files and altered signatures fail.
Neither command uses private keys or contacts a TV.

`GET /runtime-evidence` adds bounded, unprivileged file evidence to the public
build's diagnostic tools, behind the service's normal HTTP authentication gate.
It reads only the first 64 bytes of `/usr/bin/dotnet`, resolves the fixed active
CLR symlink and checks readability of its two core files. It reports a version
hint and ELF machine/class when observable, leaving unknowns explicit. It runs
no programs, reads no arbitrary path from a request and does not change runtime
selection or infer file capabilities, ABI compatibility, execution success or
root availability. The endpoint is intended to collect Q6 evidence after an
approved public-package installation.

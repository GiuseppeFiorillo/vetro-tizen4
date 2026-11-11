# Development

[Back to Vetro](../README.md)

## Host requirements

- Node.js 22 for application tests, package building and signing.
- Python 3.11+ and a POSIX shell for the optional boot-hook tools and offline tests.
- .NET SDK 8 to build the launcher. Its desktop test project targets .NET 10; install SDK 10 to run it as configured.
- Your own Samsung author and distributor certificates for TV installation.

The scripts use the repository's relative paths. Linux and macOS hosts are intended to work; the physical TV validation used macOS. No personal SDK installation paths or signing profiles are required.

## Tests

From the repository root:

```sh
node app/tests/run.cjs
node rooting/tests/run.cjs
node --test chain/tests/*.test.cjs
python3 .github/scripts/test_parse_log.py
python3 .github/scripts/audit_release.py
(cd kant-m2-root && ./check.sh)
dotnet run -c Release --project dock/tests
```

The Python integration tests and launcher desktop tests use temporary files and fake services. They do not connect to a TV. Hardware results must be reported separately from offline test results.

## Build the Tizen 4 package

```sh
sh dock/build.sh
node chain/build.cjs
(cd rooting/on-boot-probe && npm ci)
AUTHOR_P12=/path/to/author.p12 DIST_P12=/path/to/distributor.p12 \
AUTHOR_PW='your-author-password' DIST_PW='your-distributor-password' \
node chain/sign.cjs
```

Use a local secret-management workflow for actual passwords. Do not commit certificates, passwords or signed packages. The signing script requires all four environment variables and makes no assumptions about the host's certificate directory.

`dock/build.sh` updates the launcher assemblies in `app/native/dock/`; rebuild them after changing C# sources. `chain/build.cjs` produces `chain/dist/vetro-chain-unsigned.wgt`, while `chain/sign.cjs` produces the signed package. Existing native payloads under `app/native/` and `rooting/payload/` are packaging inputs; SDK `bin/` and `obj/` directories are generated outputs.

For installation, boot-hook setup and removal, see the [installation guide](../app/docs/INSTALLATION.md). Building or testing does not install anything on a TV.

## Publication

Use a source checkout for GitHub, rather than an archive containing runtime state. `.gitignore` excludes generated packages, signing material, host logs and add-on state. Before initializing Git, run `python3 .github/scripts/audit_release.py --source-tree`. In a Git checkout, the same audit without that flag checks tracked files. Check `git status --short` and review staged changes before publishing. Keep personal TV reports and raw logs out of commits, and retain upstream attribution and third-party licenses.

The root README describes this fork. Upstream integration and research documentation under `rooting/` may describe other TV generations; it does not extend the validated compatibility of the Tizen 4 port.

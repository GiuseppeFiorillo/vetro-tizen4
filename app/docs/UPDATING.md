# Updates for the Tizen 4 fork

[Back to Vetro](../../README.md) · [Package installation](INSTALLATION.md#updating)

## For TV owners

**Quick settings → General → Software update** checks only this fork’s release channel:

`https://raw.githubusercontent.com/GiuseppeFiorillo/vetro-tizen4/updates/`

The dashboard checks when you press **Check for update**. It offers newer compatible versions, asks for confirmation, and the service verifies the bundle against this fork’s public key before applying it. Updates signed by upstream or any other key are rejected, including direct API submissions. A missing release index means no update has been published yet.

**Existing installations need one package reinstall.** Builds that still trust upstream have the old public key. Install a package built from this fixed source with the same Samsung signing identity to switch them to the fork’s channel. Updating the GitHub repository alone does not change an installed TV.

Update settings and the existing recovery/rollback mechanism are preserved. If a release changes `config.xml`, increase `shell` and distribute a new WGT instead of relying on a file swap.

## Signing key

This fork has its own update public key in `app/service/update-key.js`. Its private key is stored outside the repository. On the maintainer’s current computer:

```text
~/.config/vetro-tizen4/update-keys/update-private.pem
```

Back up this private key securely outside Git. It is different from Samsung’s author/distributor certificates. Keeping the same public key lets installed TVs accept future signed releases; losing the private key requires a new package installation to change the trusted key.

For a new independent fork, generate your own pair with `node rooting/release.cjs keygen /path/outside/the/repository`, then put only its public PEM into `app/service/update-key.js`. Do not replace an existing production key casually.

## Build an update

From the repository root:

1. Run the tests. If C# sources changed, run `sh dock/build.sh` first.
2. Increase the version consistently in `app/config.xml`, `app/package.json`, and `app/service/build-info.js`. The next version after `0.5.0` can be `0.5.1`.
3. Build the signed update with your private key:

```sh
VETRO_UPDATE_KEY="$HOME/.config/vetro-tizen4/update-keys/update-private.pem"   node rooting/release.cjs build out/updates
```

The builder uses `chain/build.cjs`, preserving the Tizen 4 adapter and launcher. It verifies its output and refuses a key that does not match the public key in the package. It writes two public files:

- `vetro-update-VERSION.json`: signed bundle.
- `update-index.json`: version, filename, size and SHA-256.

No Samsung certificate or private update key is included in these files.

## Publish on GitHub

Publish **both generated JSON files at the root of the `updates` branch** in `GiuseppeFiorillo/vetro-tizen4`. Create that branch the first time; subsequent releases use the same branch. GitHub’s **Add file → Upload files** can be used on that branch. Upload the versioned bundle before, or in the same commit as, the new index. A GitHub Release attachment alone is not the configured update feed.

Keep older versioned bundles available. Never upload `update-private.pem`. Source commits on `main` do not publish a dashboard update: only the signed files in `updates` do.

The version must be newer than the installed version. A higher `shell` requires a WGT reinstall; the updater cannot change package privileges or service declarations. The persistent root daemon in `/opt/vetro-root/` and the boot hook are not replaced by the dashboard update: releases changing those components need their separate installation procedure.

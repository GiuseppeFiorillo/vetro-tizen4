<p align="center"><img src="app/icon.png" alt="Vetro" width="96"></p>

# Vetro for Tizen 4

A fork of [Vetro](https://github.com/andrearicci93/vetro) for Samsung's 2018 Kant-M2 TVs. Manage installed apps, privacy settings and remote shortcuts from a browser, with an optional lightweight launcher and a root daemon that can start automatically with the TV.

This fork has been tested on **Samsung QE49Q6FNA, Tizen 4, firmware T-KTM2DEUC-1400.2**. Other Tizen 4 models and firmware versions have not been validated. For newer TVs, start with the [upstream project](https://github.com/andrearicci93/vetro).

[Installation](app/docs/INSTALLATION.md) · [Root persistence](kant-m2-root/README.md) · [Development](docs/DEVELOPMENT.md) · [Security](SECURITY.md)

## Features

- **Browser dashboard:** installed apps, processes, memory and storage, with diagnostic exports.
- **Launcher:** a minimal dock with apps and inputs, built for the older .NET runtime on Tizen 4.
- **Privacy and app management:** reversible switches for supported services and settings, plus app startup controls.
- **Remote shortcuts:** app launches and key mappings, with optional MQTT and Home Assistant integration.
- **Automatic root-daemon startup:** an optional TV boot hook; a host-side supervisor is available for reverse-shell sessions.

Privileged features need an existing root context. Installing the Vetro package does not itself root the TV. Review each setting before applying it; a service switch can also remove the feature it provides.

<p align="center"><img src="app/docs/images/quick-settings-0.5.jpg" alt="Vetro dashboard" width="1000"></p>

## Compatibility and limits

The Tizen 4 port adds Node 4 compatibility, older registry and filesystem layouts, a `netcoreapp2.0` launcher running through Samsung's `corerun`, and legacy tuner/input actions. The `netcoreapp3.1` launcher build is retained for firmware that provides `dotnet`.

The launcher can start on the tested TV, but its **Samsung Home button is not reliable on Tizen 4**. Experimental workarounds have been removed; it uses the original upstream launch command. Keep the launcher disabled if you require the normal Home-key behavior. HbbTV is a separate, optional setting and does not need to be disabled to install or run Vetro.

The boot hook has been observed starting the root daemon after a cold boot without the USB stick on the tested TV. This is a result for that device and firmware, not a guarantee for other sets. Memory figures and compatibility reports in inherited upstream documents refer to their stated hardware; they are not performance claims for this port.

## Installation

The supported route for the tested Kant-M2 TV is:

1. Obtain a root shell using the [Kant-M2 USB root project](https://github.com/GiuseppeFiorillo/samsung-tv-usb-root-kant-m2).
2. Build this fork and sign the package with your own Samsung certificates.
3. Install the package from the root shell and open Vetro on the TV.
4. Optionally install the [boot hook](kant-m2-root/README.md) to start the daemon on subsequent boots.

Follow the [complete installation and recovery guide](app/docs/INSTALLATION.md). Update this fork by rebuilding and reinstalling your package; the dashboard updater points to upstream and can overwrite the Tizen 4 port. Upstream catalog packages do not include this port. Keep Vetro on a trusted LAN; its dashboard uses HTTP and must not be exposed to the Internet.

The Python and shell host tools are intended for **Linux and macOS**. USB flashing commands differ by host OS and are documented separately. The hardware validation was performed using macOS; Linux host execution has not yet been independently validated. Host operating system and TV compatibility are separate requirements.

## Repository layout

| Directory | Purpose |
| --- | --- |
| `app/` | Dashboard, background service, shared app code and tests |
| `dock/` | Native launcher source and desktop tests |
| `chain/` | Tizen 4 package builder, loopback adapter and Node root daemon |
| `kant-m2-root/` | Optional boot hook, host supervisor and offline tests |
| `rooting/` | Upstream integration, runtime payloads and signing dependencies |
| `docs/` | Development and release documentation |

## Development

Start with [development and checks](docs/DEVELOPMENT.md). The host supervisor and boot installer can be tested without a TV:

```sh
cd kant-m2-root
./check.sh
```

Application checks, from the repository root:

```sh
node app/tests/run.cjs
node rooting/tests/run.cjs
```

[Contributing](CONTRIBUTING.md) · [App architecture](app/README.md) · [Plugin guide](app/docs/plugins.md) · [Changelog](CHANGELOG.md)

## Contributors

Thanks to the people who contributed code and documentation to Vetro (including adapted work whose PR is still open):

- [zerodevb](https://github.com/zerodevb): dashboard and API pairing sign-in ([#9](https://github.com/andrearicci93/vetro/pull/9)).
- [Firaenix](https://github.com/Firaenix): CoBA multi-app Home guard, still selection, raw navigation and delayed Home echoes, adapted into the bundled launcher ([#23](https://github.com/andrearicci93/vetro/pull/23), [#24](https://github.com/andrearicci93/vetro/pull/24)).
- [pponce](https://github.com/pponce/vetro): remote input and queued actions are cancelled when the service stops ([#138](https://github.com/andrearicci93/vetro/issues/138)).
- [zabique](https://github.com/zabique/vetro) (branch `fork/extras`): the ideas and first implementations of Keep removed apps removed, Disable AirPlay, the restart check after a snapshot boot and stopping the HbbTV service app, re-written for Vetro.
- [skjnldsv](https://github.com/skjnldsv): measured that The Frame 2025 (Tizen 9) blocks loopback for apps and proposed reaching the service through the TV's own address ([#122](https://github.com/andrearicci93/vetro/issues/122), [#123](https://github.com/andrearicci93/vetro/pull/123)); adapted for the sign-in. Not tried on a TV yet.
- [Merennor](https://github.com/Merennor): Node 4.4 compatibility for the integration adapter and unsupported-root fallback on Tizen 4 ([#75](https://github.com/andrearicci93/vetro/pull/75)).

- [tomcraft](https://github.com/tomcraft): direct TV-tuner key, and the remote found again after a restart ([#31](https://github.com/andrearicci93/vetro/pull/31), [#32](https://github.com/andrearicci93/vetro/pull/32)).
- [SalustLab](https://github.com/SalustLab): the service on Node 4.4, app-only ([#33](https://github.com/andrearicci93/vetro/pull/33)).
- [domenix](https://github.com/domenix): start at boot when the installer ignores the package flags, S90C compatibility details, app IDs for repeated names ([#27](https://github.com/andrearicci93/vetro/pull/27), [#29](https://github.com/andrearicci93/vetro/pull/29), [#52](https://github.com/andrearicci93/vetro/pull/52)).
- [bertrandom](https://github.com/bertrandom): Tizen Studio links in the installation guide ([#47](https://github.com/andrearicci93/vetro/pull/47)).
- [PatrickSt1991](https://github.com/PatrickSt1991): Apps2Samsung credit ([#21](https://github.com/andrearicci93/vetro/pull/21)).

People who reported problems or shared results from their TVs are credited in the [changelog](CHANGELOG.md).

## Credits & license

Vetro builds on [Chris Ritsen and contributors' Samsung TV root research](https://github.com/chris-ritsen/samsung-tv-root), including runtime detection and compatibility checks adapted from [v0.0.12](https://github.com/chris-ritsen/samsung-tv-root/releases/tag/v0.0.12) under the Unlicense. [Glasshouse](https://github.com/rorygallagher2024/glasshouse) inspired the TV-management concept and dashboard. [TizenBrew, TizenTube and tizen.js](https://github.com/reisxd) informed installation and runtime research; [Samsung's developer documentation](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html) documents the device workflow. The install-leftovers cleanup is ported from [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung), which upstream recommends for installation on Tizen 6 and newer. See [third-party notices](THIRD_PARTY_NOTICES.md) for provenance and licenses.

Original Vetro code and this fork's additions are [MIT licensed](LICENSE); vendored code retains its own license. Independent, experimental software, provided as is and unaffiliated with Samsung or the projects above. 

**Fork provenance.** This repository is based on [andrearicci93/vetro](https://github.com/andrearicci93/vetro) 0.5.0. The Tizen 4 port, the `chain/` Node root daemon and the `kant-m2-root/` add-on were written for this fork and are released under the same MIT license. The root agent keeps the upstream `SAMSUNG-TV-ROOT/1` wire protocol. This fork is not maintained by, or affiliated with, the upstream project.

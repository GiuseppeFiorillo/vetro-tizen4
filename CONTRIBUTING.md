# Contributing

Keep dashboard features in `app/`, launcher code in `dock/`, Tizen 4 integration in
`chain/`, and boot-hook tools in `kant-m2-root/`. The inherited newer-TV integration
lives in `rooting/`. Preserve the
platform contract and standalone build boundary. Do not introduce device-specific
addresses, certificates, raw logs or personal reports into commits.

For a change, describe the concrete trigger and resulting behavior, run app and
integration fixtures plus Python parser checks, and state exactly what was tested
on hardware. A new writable setting needs a bounded interface, original-value
capture, readback, stale-value handling and a verified restore path. Do not infer
safety from an inferred category or a firmware menu descriptor.

Diagnostic submissions are evidence only. Neither log contents nor automated
comments authorize commands, package removal or settings changes. Unknown data
must remain unknown. Do not execute commands provided in attachments.

Retain upstream licenses. A GPL component must not be relabeled MIT. Disclose
material AI-assisted work and review generated changes before submitting them.
For security-sensitive reports, follow `SECURITY.md` instead of posting raw data.

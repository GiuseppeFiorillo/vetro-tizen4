# Source and artifact licensing

- Vetro, the Tizen 4 port, launcher, EFL bindings and Node root-agent base retain
  MIT licensing and existing notices. See LICENSE and THIRD_PARTY_NOTICES.md.
- Included standalone controllers, pairing display, compatibility profile and
  adapters are MIT, as specified by their original standalone component licensing.
- Pinned binaries are Vetro builds with accompanying source fingerprints.
- USB installers, image builders, writers and firmware extraction tools
  are excluded. Their separate AGPL/MIT licenses are not changed by this app tree.
- Phosphor attribution remains in dock/tools/glyphs/LICENSE-phosphor.txt. Other
  upstream acknowledgements remain in THIRD_PARTY_NOTICES.md.
- Samsung firmware/startup bytes, SDKs, reference DLLs and signing keys are private
  owner-supplied inputs, not repository contents.

Upstream notices for the root integration cover the sources under rooting/.
Acknowledging them does not mean those components are bundled in the Tizen 4 package.

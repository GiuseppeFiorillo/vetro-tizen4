# Frozen Tizen 4 update baseline

Source: GiuseppeFiorillo/vetro-tizen4, tag `v0.5.0-tizen4`, commit
`eb63e9dd082c0f3fee9f75c0d0a078624e9790fd` (MIT).

`updater.js` is that release's updater, normalized to LF and hash-checked.
`installed.json` records the chain package's update-eligible file hashes and
native launcher stop command from an exact `git archive` of that source snapshot.
Create the archive with `git -c core.autocrlf=false -c core.eol=lf archive
v0.5.0-tizen4`; Git's archive conversion must not inherit Windows CRLF settings.
Never generate these hashes from a Windows-converted checkout. Build metadata was
generated with the pinned source revision. Its installed version is `0.5.0`,
package revision (`shell`) 1; the tag suffix is not part of the numeric version.

The directories are a stable measurement profile, not data captured from a TV.
The generated command size can vary with installation paths. This fixture
measures 63,254 bytes for the current 0.7 port, within the 65,536 limit. A previous
67,010-byte measurement incorrectly counted unchanged runtime JSON/TSV files as
changed because their checkout bytes were CRLF rather than the committed LF.
The current JSON and TSV inputs also use LF, pinned by `.gitattributes`.

Upstream Vetro's old 0.5 variants are not the compatibility baseline for this
fork's signing channel. Keep immutable updater fixtures when adding a newly
published package baseline; do not substitute the current updater. Add the 0.7
package's own baseline when publishing it, so future same-shell migrations are
measured from that installed package too.

# Third-party notices

The root MIT license covers original Tabwise material owned by its named
contributors. Third-party components retain their own copyright and license
terms. Preserve their notices when distributing code, binaries or assets.

| Component | Notice and scope |
| --- | --- |
| Vendored Guidepup 0.36.4 R1 closure | MIT, copyright 2023 Craig Morten. The original [LICENSE](vendor/guidepup-0.36.4-r1/LICENSE), upstream file hashes and modifications in [VENDORED.md](vendor/guidepup-0.36.4-r1/VENDORED.md) remain authoritative. |
| Guidepup and Guidepup setup | MIT; installed package notices apply. |
| Playwright and Chromium runtime | Playwright is Apache-2.0; downloaded Chromium has its own third-party notices. Browser binaries are not relicensed by Tabwise. |
| axe-core and its Playwright integration | MPL-2.0; preserve the installed packages' notices and applicable source terms. |
| NVDA and its runtime/controller assets | Separately installed screen reader; GPL-2.0-or-later and component-specific exceptions/controller terms recorded in the provenance ledger. Not covered by Tabwise's MIT grant. |
| Next.js, React, Supabase clients and Tailwind | Their own MIT notices apply. |
| TypeScript | Apache-2.0; type packages have separate notices. |
| Sharp/libvips platform packages | LGPL-3.0-or-later and combined Apache-2.0/LGPL/MIT terms appear in the web lockfile. Preserve the licenses/source notices of any platform binaries actually distributed. |
| `caniuse-lite` | CC-BY-4.0 browser compatibility data; retain its installed upstream attribution and license when distributing that data. |
| `ffmpeg-static` | GPL-3.0-or-later is recorded in the root lockfile. Its installer/downloaded runtime payload is separate from Tabwise's original MIT material. |
| GitHub Actions | Build tools with notices at their pinned revisions; see provenance. |

[PROVENANCE.md](docs/ledger/PROVENANCE.md) records dependencies, fixtures,
runtime assets and event-time work. [The web dependency inventory](docs/engineering/Tabwise-dependencies.json)
and each lockfile record versions and license metadata; this short table is
not an exhaustive transitive-license inventory. Installed package license files
take precedence over this summary. There is no claim that every runtime asset
or dependency is MIT licensed.

The synthetic Fernway and R1/R2 fixture sources are project-authored. Historical
native evidence retains its recorded provenance and classification. Screenshots,
speech and logs do not establish third-party rights or independent accessibility
qualification. Do not substitute customer or private-site data for these fixtures.

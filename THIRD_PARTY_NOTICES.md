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
| NVDA and its runtime/controller assets | Separately installed screen reader; GPL-2.0-or-later and component-specific exceptions and controller terms listed below. Not covered by Tabwise's MIT grant. |
| Next.js, React, Supabase clients and Tailwind | Their own MIT notices apply. |
| TypeScript | Apache-2.0; type packages have separate notices. |
| Sharp/libvips platform packages | LGPL-3.0-or-later and combined Apache-2.0/LGPL/MIT terms appear in the web lockfile. Preserve the licenses/source notices of any platform binaries actually distributed. |
| `caniuse-lite` | CC-BY-4.0 browser compatibility data; retain its installed upstream attribution and license when distributing that data. |
| `ffmpeg-static` | GPL-3.0-or-later is recorded in the root lockfile. Its installer/downloaded runtime payload is separate from Tabwise's original MIT material. |
| GitHub Actions | Build tools with notices at their pinned revisions; see the component inventory below. |

The [dependency inventory](docs/dependency-licenses.json) and package lockfiles
list versions and license metadata. Installed package notices take precedence.

## Runtime and CI components

| Component | Type | Version or upstream source | License | Use | Project record |
| --- | --- | --- | --- | --- | --- |
| NVDA | external tool (not shipped) | Guidepup portable build 0.2.1-2026.2: `guidepup-nvda-0.2.1-2026.2.zip` from github.com/guidepup/nvda releases (sha256 7df0ca3c1c9e8c6521bc7553486ca360ed6f0b4f9bdbd6603131e38b5c1497a1, matches @guidepup/guidepup 0.36.4 manifest.json); nvda.exe sha256 d239fd2be81fc7d97f62616a6acdfb08010b92de6df65ca314e19f2d8c03c8b0; per-user in %LOCALAPPDATA%/guidepup; upstream github.com/nvaccess/nvda @ 6e38e89 | GPL-2.0-or-later, two exceptions; controllerClient LGPL-2.1 | Real screen reader | 2026-10-27, F-01 (installed by the user) |
| GitHub Actions: actions/checkout, actions/setup-node, actions/upload-artifact | CI tools, not shipped | pinned to commit SHAs (D-37, S-01): checkout v7.0.1 `3d3c42e5aac5ba805825da76410c181273ba90b1`, setup-node v7.1.0 `949feb2413d6458794dcd2491c4babbbce0c15c1`, upload-artifact v7.0.2 `cf430e030ddbb5b0abf93d22962f4752f3646cd9` | MIT (LICENSE at each pinned SHA, raw.githubusercontent.com, read 2026-10-27) | R1 workflow (D-36, D-37) | 2026-10-27, F-02 (proposed, not yet run) |
| GitHub Actions: actions/attest, actions/download-artifact | CI tools, not shipped | pinned to commit SHAs (D-86): attest v4.2.2 `1e69f48acb82d1966a394da916b4c1698aa569d6` (release marked immutable; commit with GitHub verified signature), download-artifact v8.0.2 `9000827ccba6bdab643e8b6fd33ac0654aef8333` (GitHub verified signature; `digest-mismatch` default `error`) | MIT (LICENSE at each pinned SHA, github.com via WebFetch, read 2026-10-31) | R2 S7 `tabwise-r2.yml` job `attest` | 2026-10-31, F-03/S7 (not yet run) |

The synthetic Fernway and R1/R2 fixture sources are project-authored. Historical
native evidence retains its recorded provenance and classification. Screenshots,
speech and logs do not establish third-party rights or independent accessibility
qualification. Do not substitute customer or private-site data for these fixtures.

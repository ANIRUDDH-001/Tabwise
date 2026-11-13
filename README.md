# Tabwise

Tabwise is a web accessibility regression testing project for developers and QA teams working on forms, dialogs, and other keyboard-driven workflows. Use it to record the sequence of key presses that reproduces a problem and inspect what the browser and screen reader reported at each step.

A static rule scan can find missing labels and other markup problems. Tabwise focuses on behavior across interactions, such as where focus returns after a dialog closes or whether a status update is announced.

## What you can do

- Record, reorder, and save keyboard journeys in your browser using Fernway, the included synthetic rail-booking app.
- Inspect archived NVDA speech and browser observations from a separate sign-up fixture. The demo includes a successful capture and a failed run for comparison.
- Explore the code for authenticated workspaces, evidence ingestion, diagnosis, and reviewed repair comparison. These paths have separate admission and configuration requirements.

The public demo supports the included fixtures and a defined keyboard palette. Journeys saved without an account are stored per browser and origin. Public live NVDA dispatch, live model diagnosis, and production-qualified patch verification are gated. Archived traces cover specific fixtures and screen-reader settings. Tabwise is a development-stage project and does not provide accessibility certification.

## Run locally

Use Git, Node.js **24.22.1**, npm, and a browser. The local demo uses bundled fixtures and archived evidence and runs without a database, account, model key, or Windows screen reader.

```sh
git clone https://github.com/ANIRUDDH-001/Tabwise.git
cd Tabwise
npm ci --ignore-scripts
npm --prefix packages/contracts ci --ignore-scripts
npm --prefix web ci --ignore-scripts
npm --prefix web run dev
```

Open `http://127.0.0.1:3000/w/demo`. Choose a Fernway journey, record or edit its keyboard steps, and save a local version. Select **Read the R1 transcript** in the demo to inspect recorded speech from the sign-up fixture.

## How it works

| Area | Implementation |
| --- | --- |
| Web workspace | Next.js, React, and TypeScript in [web](web/) |
| Journey and evidence formats | Shared schemas and limits in [packages/contracts](packages/contracts/) |
| Screen-reader capture | Playwright, Guidepup, and NVDA record speech and page events on an isolated Windows runner. axe-core provides static rule checks. See [fixtures](fixtures/) and [workflows](.github/workflows/). |
| Accounts and persistence | Supabase Auth, PostgreSQL, and private artifact storage. See [database migrations](supabase/migrations/). |
| Diagnosis and repair | The [model client](src/meta/) uses bounded evidence and budget reservations. The [repair code](src/repair/) binds reviewed patches to exact source versions and compares candidate reruns against registered expectations. |

### Configuration

The demo is the default local setup. For an authenticated deployment, [web/.env.example](web/.env.example) lists the Supabase URL, publishable key, server-only service-role key, and OAuth configuration flag. The server currently pins the project's backend identity. A fork using its own backend needs to review that pin, the SQL migrations, and the ownership policies. Apply migrations in filename order to a dedicated Supabase environment with Auth and Storage.

The separate [root environment example](.env.example) describes the model credential. Live calls and isolated native capture require their existing budget, source, and operator checks. Run the Windows capture only through the appropriate [hosted workflow](.github/workflows/). Keep credentials in ignored environment files or server secrets.

## Test and build

```sh
npm test
npm --prefix packages/contracts test
npm --prefix web test
npm --prefix web run typecheck
npm --prefix web run build
node web/test/product-trace.check.mjs
node scripts/check-r1-baseline.mjs
node scripts/preflight.mjs --clean
```

Run the trace check after the web build. The clean preflight also checks for uncommitted files. Browser scenarios and disposable-database integration checks are opt-in. The ordinary suites exercise contracts and local behavior without launching a screen reader or calling the model service.

To serve the production build locally, run `npm --prefix web run start`. For Vercel, use `web/` as the project root and retain the source files included by the checked-in trace configuration.

## Contributing and license

Use the included fixtures for reproducible reports. Include the commands you ran and distinguish archived, synthetic, and fresh screen-reader observations. The [frozen R1 test specification](docs/ledger/PLAN.md) is an input to the fixture lock and preflight.

Original Tabwise code is [MIT licensed](LICENSE). See the [third-party notices](THIRD_PARTY_NOTICES.md) for vendored and separately installed components.

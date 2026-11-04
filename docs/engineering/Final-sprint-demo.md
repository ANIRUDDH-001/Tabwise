# Submission demo: recording, evidence and a reviewed repair

Evidence boundary: public recording and saved local versions are working product features. R1 trace is historical genuine capture from its displayed source run. Current signed-in request is a measured local PostgreSQL/production-route integration with a controlled authentication provider. Repair continuation is a labelled deterministic replay, with a distinct pending rerun. Fresh native R2, repaired native R3 and independent R7 remain unaccepted.

15-second value proposition:
“Tabwise turns a keyboard journey into an accessibility regression case. It keeps what the screen reader actually said beside the steps, helps explain the barrier, and puts a proposed repair through human review and a separate verification run.”

Two-to-three-minute storyboard:

| Time | Screen/action | Narration and evidence |
|---|---|---|
| 0:00–0:15 | Journeys picker | Value proposition; owned Fernway sample, defined keyboard task. |
| 0:15–0:45 | Passenger editor | Record three browser Tab steps, reload/restore, save two immutable local versions. This records browser events, not NVDA speech. |
| 0:45–1:10 | Public demo R1 trace | Open historical failed/successful R1 evidence; point to source/run identity. Say explicitly “historical genuine capture; fresh R2 is pending.” |
| 1:10–1:35 | Local signed-in request screenshot/live controlled environment | Actual production route and PostgreSQL persist PREPARED request. No execution button or fabricated capture. Authentication provider is controlled; no hosted OAuth claim. |
| 1:35–2:05 | Repair replay evidence and source diff | Label “CONTROLLED REPLAY”. Show persisted finding, human-review/application boundaries, rejected wrong patch and distinct pending rerun IDs from actual-product-chain-replay.json. No model call or native acceptance is implied. |
| 2:05–2:30 | Evidence/readiness screen or handoff | Show real hosted G1 deadline failure, measured local replacement, and next source-bound hosted diagnostic. Native verification stays pending. |
| 2:30–2:45 | Return to journey | “The product keeps uncertainty visible: a completed worker is not a verified repair.” |

Fallback: run only public recording, version restoration and historical R1 trace if provider/DB setup is unavailable. Use the captured signed-in screenshot with the LOCAL/CONTROLLED label, rather than a fake live backend. Omit the replay segment if its classification cannot remain visible. No new paid call is required.

Repeatable public environment, using already installed dependencies:

    cd "D:\Projects\Meta AI\app-final-integration\web"
    npm run build
    node node_modules/next/dist/bin/next start --hostname localhost --port 31381

Open http://localhost:31381/journeys. Select Passenger details; clear the draft, record three Tab steps inside the fixture, reload/restore, save a local version, toggle a checkpoint, save another version. Open /w/demo for source-labelled historical R1. Use localhost consistently: the first127.0.0.1 HTTP test origin disagreed with Next's canonical origin and was correctly refused403.

Automation/evidence (local, isolated Chromium; server/browser are closed afterwards):

    cd "D:\Projects\Meta AI\app-final-integration"
    node cache/final-sprint/browser.mjs

This reuses deterministic browser checks and captures demo.png, journeys.png and editor.png. Forensic logs should go to a fresh directory on another run; preserve the current packet unchanged.

The database seed/route/repair replay procedure is cache/final-sprint/postgres.py: it creates a NEW ephemeral PostgreSQL cluster, applies12 local migrations, runs8 SQL suites, exercises production routes and a controlled replay, and stops it. It uses only installed PostgreSQL18 binaries and refuses nonfixture external traffic. It never connects to the hosted database. Preserve the current cache/final-sprint outputs; use a copied fresh output directory for another run.

cache/final-sprint/signed-in-browser-db.py reopens only the recorded disposable cluster, clears test-only active capacity, uses a controlled provider session in a fresh isolated browser, creates a new prepared request through the actual route, captures signed-in-prepared-request.png, then stops the cluster. This is not a general sign-in provider or a production seed script. Its fixture keys are noncredentials.

MEASURED current walkthrough:17 browser tests PASS;6 signed-in browser assertions PASS. Screenshot manually inspected: PREPARED request, incomplete evidence, native unavailable, no misleading success state. Video recording, submission upload and hosted product acceptance have not occurred.

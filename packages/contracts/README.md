# Tabwise contracts 0.1.0

Runtime-dependency-free ESM. Internal JSON Schemas use Draft 2020-12 and reject unknown fields. `validateContract` evaluates the authored keyword vocabulary and adds cross-field checks; it is not a general schema validator. Ajv 8.17.1 is a development oracle.

Import schemas/palette/limits directly in browser components. `index.mjs` provides Node-side hashing, spec encoding, validation and manifest integrity checks for server routes, workers and offline evaluation. Tests use synthetic examples only.

Timeline: keys, focus, speech, app events, screenshots. Axe is supporting evidence outside those lanes. Separate clocks preserve observation-window association; contracts do not certify guarded execution or physical quiescence.

`encodeSpec` hashes the exact JSON UTF-8 bytes, then checks the serialized `{run_id,spec_b64,spec_sha256}` envelope against 65,535 characters. Decode enforces canonical base64, input size, hash, schema and matching run ID. Typed text can only come from `palette.mjs`.

`metaDiagnosisSchema` is a distinct narrow provider schema. Every object property is required, optional values use nested nullable `anyOf`, and no internal validation keyword is passed to Meta. Provider acceptance remains unqualified until the separately approved probe; no live call has been made.

Schema validation alone does not establish trusted provenance. Ingest must also authenticate GitHub identity, bind the stored spec hash, verify artifact hashes, reject incomplete capture, and enforce the independent worker review gate. A model diagnosis is never a verification verdict.

Run: `npm --prefix packages/contracts test`. New source and synthetic fixtures authored during the event; no external fixture data.

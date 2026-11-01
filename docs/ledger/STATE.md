# STATE - D-98 addendum 2: hosted A-5 attempt failed; authorization consumed; BLOCK restored
Recorded UTC: 2026-11-01T18:55:16Z (date -u).
Anchor: R 5568eecbdead6f9c1467ac534fe1a358b94856c8 (parent A ae1e7624dd97841658344b3d273024a465cce31b).
## Now
- Run 41331887185 attempt 1 (job 124923539423) FAILED/incomplete: "NVDA start: timed out after 10000 ms".
- Sends 0; no accessibility finding; no attestation; genuine_evidence:false; validation-broken not launched.
- Evidence verified: ZIP 31384f97; run manifest 8eced046; page manifest 7f7f1f70; 9/9 entries; verifyR2Run ok.
- Custody: Tabwise-R2-Audit/hosted-A5/41331887185/ (artifact, job-log archive e4a9aea1, ChatGPT bundle 3ae42507).
- Reviews: RCA 6bee7867 (original, unchanged); supplement 1 45479ac1 (MODEL output).
- R2 disabled/BLOCK (blob c6183c837b50bdd4c139568129f6bb5a736458af); qualification BLOCK (blob ab6df1e1).
- R2 digest 9d3f194f; qualification digest 6972c311; plan digest 8bb82898 (A->R diff is the status file only).
## Blocked / limits
- D-98 single attempt consumed; no rerun, retry or second D-98 attempt is authorized.
- Dispatch authorization NOT DOCUMENTED / UNVERIFIED: open documentation exception, not a finding of absence.
- The recorded reconciliation text is ChatGPT-drafted and retrospective, not recovered dispatch authorization.
- Immediate cause CONFIRMED (10 s compose bound < 27 s + 3 s internal budget); underlying cause UNKNOWN.
- Inference: the vendored relay-owner query stalled; a longer bound alone may give a startup failure, not a pass.
- MEASURED: NVDA start#1 was still pending when compose stopped NVDA and sealed; the page child stayed alive after the seal (custody samples:6).
- When and how start#1 settled is not recorded; post-seal cleanup effects are possible (source), not measured.
- Concurrent stop/start cleanup is untested.
- TW-P0-W1-GOV HOLD; B-9/B-12 HOLD; D-95/D-96 cannot authorize; no model calls or spending.
- Local commit 07d026fa (Codex HOLD) is superseded by this entry; unpublished, kept as review evidence.
- LOG dev "us" follows D26; PROTOCOLS section 3 still shows "A|B" (divergence recorded, protocol unchanged).
- Previous STATE archived at 5568eec:docs/ledger/STATE.md, blob f415b23c205ceef5e63e969c605c1e58e3f33c11.
## Next / handoff (each step needs separate owner approval)
- If dispatch-authorization evidence is recovered: a new dated append-only clarification (wording, time, source, hash).
- Remediation planning (not authorized): timeout hierarchy, unsettled-startup ordering, phase diagnostics.
- Optional: a diagnostic-only hosted NVDA start/stop latency probe, separately authorized; R2 stays BLOCK.
- Any future hosted A-5 needs a new decision, a new review and a new status; D-98 cannot be reused.
- Optional, separately authorized governance edit: align the PROTOCOLS section 3 dev template with D26.
- Preserve the artifact and job log before the 30-day retention ends (about 2026-12-01).

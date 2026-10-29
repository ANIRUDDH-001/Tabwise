# D-59 worker binding — architecture blocker, no live execution

R1 must remain byte-identical. `scripts/tabwise/review-status.json` remains BLOCK. The new workflow is a refusal scaffold, not a completed live worker. No safety PASS is claimed.

Source constraints found during implementation:

1. `src/speech/sendguard.mjs:pageKeyOf` maps page acknowledgements only for Tab, Space and Enter, plus individually supported `sendkeys` characters. Escape, arrows, Home and End return an unconfirmable key. `judgeKeys` can compare them, but the actual frozen physical-send gate refuses them. Broadening the contract does not broaden the gate.
2. The frozen vendored `sendKeys` allows one character from `[A-Za-z0-9@.]`. The palette includes `invalid-email` and `Asha Test`, whose hyphen/space cannot be passed directly to that method. Space could be a separately guarded Space press; hyphen cannot silently bypass the frozen acknowledgement mapper.
3. Vendored `NVDAClient.spokenPhraseLog()` awaits all pending actions. A naive provider using it during a captured action can block until Guidepup's capture/silence wait finishes. The R2 adapter's conservative acknowledgement observation deadline is 1,000 ms from executor request; it cannot safely be extended to hide this mismatch.
4. R2's untagged cumulative speech log establishes observation-window association, not an atomic physical-send boundary. Promise settlement or an abort request does not establish physical quiescence.
5. The frozen `NVDAClient` phrase journal is populated by `#processQueue` from action-scoped speech aggregation. `capture:false` appends an empty action result; it does not expose a continuous raw speech stream. The client owned by `NVDA` is private. Therefore switching off action capture does not supply the R2 provider contract, and patching prototypes or exports would bypass the frozen integrity boundary. A separately reviewed, genuine observation interface is required.

Required independent architecture/safety ruling: reconcile the conservative R2 observation interface with the unchanged guard and Guidepup collection semantics. Prefer an initial supported-key subset and explicit rejection of unsupported steps. A live loader must retain foreground freshness, page pre-read and exact acknowledgement, vendored integrity, persisted intent, continuous speech checks, loopback isolation and bounded teardown. No invented guard receipt or weakened deadline is acceptable.

The offline worker, exact-context patch applier, loopback predicate, contract and deterministic-verdict tests can be reviewed now. They are synthetic development checks, not NVDA evidence. The completed live workflow, artifact ingestion/reconciliation, patch-approval dispatch and genuine Fernway/Spark reports remain outstanding.

## D-63 correction and current disposition

Claude completed the read-only architecture review; its conditional second-client observer candidate replaces the earlier unavailable-review state. The old palette examples above describe the original hazard; current values are AshaTest and invalid.email, and only Tab/Shift+Tab/Enter/Space presses are admitted. All worker typing remains refused. Current changes and remaining blockers are in [Tabwise-Claude-reconciliation.md](Tabwise-Claude-reconciliation.md). Observer/press executor candidates have fake-boundary tests; a complete production loader and real relay/foreground/acknowledgement/physical-quiescence qualification remain absent. The narrow observer protocol is prepared but is not authorized for dispatch. Original R1 files and the conservative R2 deadline remain unchanged.

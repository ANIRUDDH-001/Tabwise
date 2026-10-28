# F-02 engineering experiment record (D-43)

All entries distinguish deterministic/simulated behavior from real NVDA. No live GUI/Meta/Actions execution is authorized by this record.

| ID | Hypothesis / experiment | Result | Evidence class and practical limit |
|---|---|---|---|
| records-01 | Inspect exact five approved files and outgoing history, then independently review staged blobs | APPROVE; e09a068 published to main; only five Markdown files, 508 inserted lines. Temporary remote branch removed after main fast-forward. | MEASURED Git outputs plus independent reviewer. No product/workflow publication. |
| audit-01 | Independent review of actual safety contracts rather than green tests | New probes reproduce null/contradictory acknowledgements, late cleanup keys, split/coalesced TLS message loss, and failed quit status acceptance. | MEASURED by fresh read-only reviewer with fake built-ins; needs regression tests in this worktree. |

Root causes to challenge: timestamp completion instead of observation lower bound; optional verification capabilities and unvalidated result classes; terminal observation before producers finish; treating stream chunks as frames; treating resolved lifecycle calls as evidence of reset.

| gate-01 | Delayed page pre-read and full foreground IPC/evidence delay; missing/replaced before capability; invalid ack classes/reasons | Red on previous implementation; repaired cases green. Gate capabilities and admission metadata protected. | MEASURED deterministic fake clocks/gate; engineering-red.tap, engineering-final.tap, contracts-final.tap. No native focus measurement. |
| helper-01 | Wrong/stale helper replies and request timing | Correlated replies retain request start; wrong reply poisons helper. | MEASURED fake child streams; foreground-red/green.tap. No real PowerShell started. |
| terminal-01 | Inject unexplained key during raw-log collection | Old path accepted; terminal check now fails before target closure. | MEASURED fake full runner; terminal-red/green.tap. |
| transport-01 | Split/coalesced speech, cancel, malformed/truncated stream | Exact framing/order maintained; invalid data stops gate. | MEASURED actual vendored methods with fake socket; engineering-stream.tap. |
| lifecycle-01 | Nonzero quit, persisting listener, live child without port, foreign relay PID, stop during ownership | Reject reset/start claims; return and validate owned PID/relay PID/reset evidence. | MEASURED fake processes/listeners, actual helper/class methods; lifecycle-red.tap, process-red.tap, ownership-red.tap, engineering-owner.tap. Exact PID behavior on Windows is UNMEASURED. |
| intent-01 | Intent journal EACCES | Refuse before physical send. | MEASURED fake writer/full runner; intent-red.tap and full-final-03.tap. |
| review-01 | Independent final-speech socket error/close false-PASS probe | Reproduced; unexpected loss now stops gate even without another key. | MEASURED reviewer actual sandboxed client + summary probe; disconnect-red/green.tap. |
| review-02 | Page read returns matching key after ack deadline | Reproduced; exact deadline checked before accepting events. Preserve missing-key diagnostics. | MEASURED delayed fake read; ack-deadline-red.tap and contracts-final.tap. |
| lifetime-01 | Engine signal defaults and exact script epilogue | Fake signal cannot close target; completion enters only awaited teardown. | MEASURED actual adapter and exact completion-block execution with fake dependencies; browser-behavior.tap. |
| full-01 | Full post-repair suite | 191 pass, 0 fail, 0 cancelled. | MEASURED 2026-10-28T02:30:33Z; npm test -- --test-reporter=tap; full-final-03.tap. Simulated software contracts, not R1 PASS. |

Existing-test changes: fake acknowledgements now supply required before and key-class results; fake startup supplies owned process evidence; fake TLS uses protocol newlines; helper echoes request IDs. Existing semantic assertions were retained. Runner source-order checks follow the extracted adapter and are supplemented by executed fake lifetime/epilogue and runtime pin-expression checks. Initial whole-suite 189/190 result exposed a diagnostic-only regression; the refusal now retains the original saw-0 reason, then full suite passed.

In progress: mutation suite and final hash/independent byte review. No safety-critical code commit/push and no real R1 execution yet.

| mutations-01 | Original 23 cases plus 9 D-43 faults, each in scratch with an independent OS/TLS denial preload | Baseline191/191; 32/32 valid faults detected, zero syntax/whole-process-timeout outcomes. Case10 cancelled6,14b cancelled7,14c cancelled1 individual tests while processes completed with assertions. | MEASURED F-02-mutation-results.json; first preload over-blocked loopback baseline, corrected before mutations. Final mutation17 re-run after assertion reorder fails on runtime expression, not regex. |
| hash-01 | Independent normalized file/spec, raw dependency, vendor tree, frozen gate and original checkout comparisons | 12 file/spec hashes,10 pins,40 vendor files,8 changed+2 added; no mismatch/vendor/original-drift errors; gates unchanged. | MEASURED F-02-verification.json; final source manifest and independent review. |
| review-final | Fresh independent technical audit and probe repeat on exact final bytes | APPROVE;61manifest matches; no remaining material blocker found. | MODEL/L1 source assessment, MACHINE/L3 scoped measurements; same model/vendor correlation disclosed. Native behavior remains unmeasured. |

D-46: user approved publication of the exact reviewed manual workflow/bundle to main, explicitly no run. This supersedes the in-progress publication note above. All real execution restrictions remain; source approval is not R1 PASS.

| shipped-01 | Export committed a628cd1, attach only existing dependencies, run offline suite on committed text/vendor bytes |191 pass,0 fail,0 cancelled; no installation. | MEASURED committed-archive-test.txt, F-02-verification.json. Main remote SHA confirmed after push. |

Published code: a628cd1 on main. Earlier records-only publications: e09a068 and0932f68. Final independent staged check covered60paths:40vendor blobs exact and20text blobs after Git EOL normalization; no source drift. No runtime execution or R1 PASS is implied.

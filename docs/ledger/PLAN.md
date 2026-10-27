# PLAN — the day plan and one section per approved task (format: PROTOCOLS §2, §3)

Any agent resumes a task from its section alone, without the chat. Copy the approved spec in verbatim; keep each task to 25 lines or fewer.

Product (provisional, D22): **sharpened C3**, accessibility regression testing for dynamic web forms and dialogs. A journey goes in. We capture real NVDA speech, focus and app events as one timeline, locate the barrier, propose a source patch, rerun, and keep the run as a regression test. Wrong patches are negative controls. Source: research 13 §4 and §8, plus the user's pasted refinement (LEDGER, 2026-10-27).

## Pre-registered Day-1 tests (frozen D23; source 13 §8; do not renegotiate, PROTOCOLS §6)
| Test | Hours / credit cap | What can pass today | What must not be claimed |
|---|---|---|---|
| R0 prerequisites | 0.5 h / $0 | Installed versions recorded (NVDA, Guidepup, Node, Playwright, axe-core). Fixture rights: our own pages only. Broker reservation and payload logging are working before any metered call | That a dependency works without running it |
| R1 real speech | 1.5 h / $0 | NVDA + Guidepup on this Windows 11 Home laptop, a local page, a keyboard-only 10-step task. A complete fresh speech log in 3 of 3 reset attempts. No screenshots or DOM in the speech-agent payload | Reliable navigation of unseen sites |
| R2 causal smoke | 2 h / $1.50 | Healthy/broken pairs, labelled by someone other than the runner: silent validation error, focus lost after a dialog closes, an unannounced update. Same Spark version as visual and speech control; axe-core baseline. At least one barrier that axe misses is located correctly, and no barrier is claimed on a healthy page | General recall or precision; certified accessibility |
| R3 repair | 0.5 h / $0.50 | A human-reviewed patch rescues the withheld task on rerun. A deliberately wrong patch is not marked solved | A verified automatic repair product from one success |
| R7 independent check | 1 h / $0 | Someone who did not run the tests checks the results without tuning them (the user assigns who). Failures and abstentions are recorded | External user validation |
| Reserve | 0.25 h / $0.50 | Setup and retry only | Hiding a failed gate |

Totals: 5.75 h and $2.50. Every run is logged, aborts included. Once a failure has been inspected and a prompt tuned, that fixture is development data, and new withheld fixtures are needed. Keyboard-only operation is tested directly; a mouse replay is not evidence of keyboard access.

## Decision rule (13 §8, adapted to one candidate)
| Observation | Decision |
|---|---|
| Rights, eligibility or safety boundary breached | FAIL for that scope; scores cannot override it |
| A test cannot run, or would exceed its cap | NOT RUN / INSUFFICIENT EVIDENCE: neither FAIL nor PASS |
| Some essential properties pass | PARTIAL; user-assisted and automatic routes named separately |
| R1–R3 pass and R7 agrees | C3 provisionally confirmed; the dated kill checks below apply |
| R1 fails (no speech capture on this host) | C3 as specified stops. User MCQ: another host, or reduced scope. Guidepup's virtual reader is not NVDA evidence (13 §10) |
| R2 or R3 fails | Drop the causal or repair claim, or stop. Any fallback (e.g. C4) needs its own approved test; nothing inherits a pass |

## Dated kill checks (IST; budgets approved separately)
| Date | Required evidence |
|---|---|
| 2026-10-28 end of day | Planning checkpoint: PASS / FAIL / NOT RUN / PARTIAL per test, versions, fixture hashes, measured cost. The user may choose a risk knowingly; time passing is not consent |
| 2026-10-29 | New withheld flows with same-model controls, independent outcome and localization, mandatory fix and retest. If the controls explain the divergence, or fixes break healthy tasks, remove the causal or repair claim |
| 2026-10-30 | Ground-truth and negative-control review per fixture |
| 2026-10-31 | Claim scope freezes to what has been shown; otherwise the product becomes explicit reviewer assistance |
| 2026-11-02 23:59 | Exact demo inputs run through acceptance checks; replay and known misses disclosed |

## Day plan
| Day | Date (IST) | Goal | Tasks |
|---|---|---|---|
| 1 | 2026-10-27 | Governance in `app/` (D24) → R0, R1 → R2, R3 → R7 → record results | R0–R3, R7 |
| 2–9 | 2026-10-28 → 11-04 | Filled in after the Oct 28 checkpoint. Feature freeze 2026-11-02 23:59 IST; internal submit 2026-11-04 22:00 IST | — |

The user divides work within the team (D26). This plan lists work for "us", with no per-developer split.

## Tasks
<!-- One section per approved spec:
### F-xx <title> — status: approved | in progress | done | blocked
Spec: (verbatim from the MCQ answer: ID, Goal, Files, Acceptance, Cost ceiling, Out of scope, Rollback)
Approved: D-xx, <UTC timestamp>
Owner: agent claude|codex · Branch: feat/<id>-<slug>
Progress: what is done, with LOG.jsonl timestamps
Next step: the single next action
-->

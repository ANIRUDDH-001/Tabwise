# F-02 engineering ownership plan (D-43)

Goal: repair the actual R1 execution path without changing the frozen ten steps, 3/3 rule, speech expectations, credit limits or personal-desktop prohibition. The user's ownership delegation approves routine design and iteration; publication requires an independent technical review, and real execution requires separate approval.

Architecture: retain the narrow vendored NVDA transport while repairing its contracts. A send must carry a mandatory page pre-read and a foreground request-start freshness bound, then synchronously commit. Strict acknowledgements and terminal evidence checks prevent degraded verification from yielding PASS. Stream framing and bounded process reset make the real transport testable. Use installed Node 24.22.1 and existing dependencies; no installs.

Working copy: managed local worktree, copied from the preserved mixed checkout without secrets/cache/evidence. All remote publications go to main only (user clarification); local working branches provide isolation only. The original checkout remains untouched except the authorized records commit and delegation record.

## Hypotheses and falsifiable checks
1. D42-B01 is caused by stamping the combined promise's completion. A delayed page read or foreground reply must never yield a key whose request-start bound is older than 100 ms.
2. D42-M01 is caused by optional/incomplete verification. Removing before, returning null for a page key, or returning success plus failure reasons must refuse/fail rather than produce PASS.
3. A final check before raw collection leaves an evidence gap. Injecting an unexplained key during raw collection must fail before browser closure.
4. TLS chunks are not protocol frames. Split/coalesced newline-delimited join/cancel/speech data must preserve the exact message sequence; malformed, oversized or truncated data must stop the run.
5. A resolved start does not establish reset. Failed quit exit codes, an old listener, failed/late child creation or cleanup timeouts must not claim a fresh NVDA process or successful cleanup.

## Incremental execution
- [x] Privacy-review, explicitly stage, independently review and publish only the five approved historical records. Commit e09a068; main only after user clarification; temporary remote branch removed.
- [x] Read historical decisions/reviews/protocols and current runtime; commission fresh read-only architecture review.
- [x] Add deterministic regression tests for the two latest findings and newly reproduced defects. Run them red on the preserved current implementation.
- [x] Make verification mandatory, bound freshness from request start through IPC/evidence/commit, and validate acknowledgement class/reasons. Preserve all existing semantic assertions; adapt fake capabilities explicitly.
- [x] Correlate foreground helper requests/replies, reject stale/unsolicited replies, and retain safe read-only behavior. Exercise only fake helper streams locally.
- [x] Check the terminal page log after quiescence/raw capture and before closure; retain failure classification and original errors.
- [x] Frame the actual TLS stream; bound/validate transport data. Test actual vendored methods with fake built-ins.
- [x] Reject unsuccessful reset operations; make quit asynchronous/bounded and establish listener disappearance plus owned process identity before claiming a fresh start.
- [x] Run full offline suite with bounded execution, deterministic concurrency/fault tests, meaningful mutation checks, independent vendor/lock/frozen-gate hashes and original-checkout isolation checks.
- [x] Request independent technical review of all final changes. Fix/rebut findings with evidence. Only independently cleared, modular components may be committed and pushed to main; workflow publication remains blocked until corresponding safety review clears it.
- [x] Produce a concrete isolated-run preflight/handoff. Never trigger Actions/NVDA/Meta automatically; simulated success never changes R1 to PASS.

Review focus: stale IPC replies, event-loop/evidence-write delays, changing/missing reader capabilities, child launch/exit races, protocol chunk boundaries, late page events, failed summary writes, and unresolved send/browser lifetimes. Native delivery and indistinguishable identical-key limits remain disclosed.

Reference: Node 24 timing documentation fetched through cached Context7 CLI: https://nodejs.org/docs/latest-v24.x/api/perf_hooks.html and https://nodejs.org/docs/latest-v24.x/api/process.html. Use a same-process monotonic clock for elapsed bounds, not wall-clock time.

Publication checkpoint: a628cd1 safety bundle is on main after D-46 approval. The exported commit passed191/191. No real workflow dispatch; operations handoff is F-02-operations.md. Original mixed checkout preserved; this worktree contains the reviewed implementation.

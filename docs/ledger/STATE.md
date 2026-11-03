# STATE - native attempt2 observability/verifier fixes; no rerun authorized
Updated: 2026-11-03T02:56:29Z
Producer: e1651678198383be08ffe0ea6bc9016acd0d120d; worktree app-r2-native-causes
## Now
- Actual native41519094642/2 and verifier artifacts retained; startup41514466149 compared.
- Precise underlying startup cause UNKNOWN: uploaded message omitted nested causes.
- Added diagnostic-only redacted cause/stack/code capture; original error still thrown.
- Verifier accepts valid incomplete bytes and checks actual sealed manifest when capture absent.
- Explicit integrity-only Ubuntu step cannot mark native interaction or qualification passed.
## Verification MEASURED native-attempt2-causes
- Original artifact CLI RED: ENOENT capture.json; corrected GREEN integrity:true/native:false.
- Page/run remain incomplete; changed-source/missing-source/forged-pass rejected.
- Final diagnostics34/34; prior combined diagnostics/binding101/101; final serializer-only fix covered.
- Frozen R1 ok:true/errors:[]; syntax/diff checks PASS.
- Approval variable listing[] confirmed after failed run and before commit.
## Handoff / blocked
- docs/engineering/R2-native-attempt2-causes.md: exact artifacts, facts, hypotheses and limits.
- Other session handed off native ownership; its dirty checkout untouched.
- Push diagnostic branch only; main untouched. No attempt3 or new approval packet/variable.
- New native run requires fresh exact approval and explicit user authorization.
- No underlying NVDA timing/sequence fix justified; no vendor, timeout or gate relaxation.

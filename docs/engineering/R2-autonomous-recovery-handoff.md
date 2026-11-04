# R2 native recovery: observed runtime passes; product qualification blocked

Recorded 2026-11-04T08:48:40Z. Owner-directed sole-agent recovery; incremental paid AI spend ₹0, external AI API calls 0. Branch fix/F-03-r2-native-runtime. Runtime-tested revision **90c13f402edf778ec6f25bc5eba469bbeefd7847**; source digest **879af4bb6a32e0bc9e2a11b8359d4fe90b23556fbafb945ecd3019a1138ccfa2**. Later documentation/evidence-only commits do not claim native execution at their revision.

## Measured outcomes

- A: Windows process identity fixed without widening 5-second operation deadlines. Hosted run41795725412 isolated a ConvertTo-Json serialization stall beyond25 seconds after process identity/liveness completed in1976ms. Typed decimal/hex serialization removes that module-autoload dependency. Hosted41795994791 identity14/14 passed; cold2982ms/warm279ms. Current hosted gate includes harmless real identity and negative/security checks.
- B: real zero-key NVDA startup/identity/relay receipt/teardown passed at dc3ad3146eab0ab7a9bfe9ee761b02b7ec07cee3, run41797208434/2, artifact13306111472. Earlier native log identified missing PROCESSOR_ARCHITECTURE; the sanitized startup worker now preserves only the needed architecture metadata, excluding credentials/injection variables.
- C native path: run41801278982/2 at90c13f4 passed checks/native/separate verification. Isolated pinned validation fixture; approved Tab,Tab,Enter executed; sends3, refused0, misdeliveredfalse. All3 independent page key acknowledgements and speech records retained. Runtime/fixture/journey/session/run identities are preserved in original artifacts. Product projection contains13 source pointers; no observation/identity was fabricated.
- Foreground: run41799310732 measured Add-Type stalled past25 seconds. R2 prepends disabled automatic module loading plus an exact trusted system Utility-module import to the unchanged frozen helper script. Original2-second foreground request bound retained. Hosted probe41799749130 completed in3779ms; no local desktop/native interaction was performed.
- Speech: fast Subscribe output arrived within a polling interval spanning gate release. The existing native observer already timestamped speak callbacks; capture now validates/preserves that receipt journal, refreshes the validated release receipt, and binds timestamps to the sealed speech lane. Poll-only conservative behavior and strict post-release/observation-window requirements remain. Future/wrong-clock/backdated/rewritten/mismatched/missing journals and pre-release speech refuse. No emission time is inferred from text, no window is widened, and source verification remains false without provenance authority.
- Import boundary: the full suite caught an eager resolver/node:net import in the foreground change. Resolver loading was moved behind initial runtime integrity; original refusal-before-capability test passes unchanged.
- Cleanup: final native artifact records exact independent root custody,5 samples,0 sample failures, no residue/errors/terminations, NVDA stopped, post census quiescent, no listener/NVDA/helper residue. Existing physical_quiescence_verified:false and execution UNVERIFIED markers are preserved; this is bounded OS custody evidence, no W2a/production qualification.

## Actual screen-reader observations (OBSERVED, L4)

| Step | Approved action | Associated NVDA speech |
|---|---|---|
| to-email | Tab | main landmark; form landmark; Email, edit, blank |
| to-submit | Tab | Subscribe, button |
| submit | Enter | Enter your email address, for example name at example dot com |

The final observer journal also retains one later unassociated phrase, document, blank. It is excluded from step speech. The pure speech-payload consistency check passed with source_verified:false and late_phrases:1; no model call occurred.

## Preserved originals and integrity (MEASURED, L3)

| Artifact | GitHub artifact ID | Original ZIP SHA256 |
|---|---|---|
| startup41797208434/2 |13306111472|9c4e4313e2b90cf6ebae4be5b0d3358da03c6c0fa3b17525c09f91d92f12d743|
| native41801278982/2 |13306859138|6ee3042549f9cc3f8be77208b2f631e9fd56ba5d006f79211e354ce976c5c42f|
| separate verification41801278982/2 |13307932535|d7da34322ae10f993283e46d49345ee3a28d3ed00745503073a836af7da670de|

Original ZIPs and derived summary are preserved in docs/evidence/r2-recovery/. ZIP hashes were checked against authenticated GitHub artifact metadata; extracted per-file index hashes passed. The separate Ubuntu verifier recomputed native_interaction_pass:true and integrity_pass:true; changed-source, missing-source and forged-pass negatives all refused. Local exact-source verification and the same3 tamper negatives also passed before the evidence-only handoff commit.

## Product boundary: full R2 is INCOMPLETE

Observed native interaction is successful. **The sealed page/run class remains synthetic** under the existing conservative provenance design; genuine_evidence:false, w2a_qualified:false, production_qualified:false are unchanged. These are real NVDA observations in an explicitly NONQUALIFYING artifact, not a qualified product artifact.

Actual exporter result: accepted:false, reason bridge fields. The diagnostic has no product-owned run/journey/spec identity contract and does not invent one. Actual native product opening: accepted:false, reason native qualification disabled. Product evidence ingestion/readback was not performed and is not PASS.

The distinct authority requirements are in src/r2/product-bridge.mjs (internally loaded enabled policy, trusted Ed25519 signature and qualification binding), scripts/tabwise/r2-product-policy.json (public_key/review_ref/qualification/source scope currently null), scripts/tabwise/qualification-status.json and scripts/tabwise/r2-status.json (disabled/BLOCK), plus scripts/tabwise/r2-policy.mjs (independent reviewer must differ from dispatching actor). S3 currently refuses authenticity promotion pending legitimate runtime/hosted provenance. A general engineering authorization does not supply that independent qualification, signature or product-owned run binding. Generating a new self-trusted key, inventing a reviewer, changing a success flag or relabelling this sealed diagnostic would bypass those requirements.

Owner/external dependency: obtain an independent exact-source/native qualification and trusted signing authority, and provide the real product-owned run/journey/spec identity through the existing admission/producer contract. That source-bound authority is required before genuine producer/export activation and product ingestion/readback can be qualified. No paid API, production migration/deployment, credential provisioning or independent attestation has been fabricated. R3/R7 remain separate and unqualified.

## Validation and handoff

- Full root at final runtime source:1199/1199 PASS (cache/r2-recovery/journal-root.tap); final qualification rerun recorded in STATE/LOG.
- Capture/payload/observer/evidence focused264/264 PASS; hosted final focused547/547 PASS, no skipped tests.
- Final complete diagnostic suite174/174 PASS; runtime pins/frozen integrity, clean preflight and diff checks PASS.
- Earlier c5e098c hosted root1191/web127/contracts21/browserAPI15/build/types/frozen/preflight PASS; no web/DB/Preview changes since those checks. These do not establish product-native readback.
- Consumed approval variables were revoked after observed admission and authenticated listings confirmed absence. No native run is pending. No main merge, release or deployment.
- Failed attempts and intermediate root failure remain recorded in append-only LOG and ignored cache logs; no failed artifact was converted to a pass. Frozen R1/vendor files are byte-unchanged from6850f08.

Next work is the independent qualification/product authority boundary above, using these original artifacts and this exact runtime source. The final status is INCOMPLETE WITH EXTERNAL BLOCKER, not R2 COMPLETE.

# G1 owner-query V2 source candidate

Separate branch from published c9ee495b; original G1, startup-only workflow, frozen vendor and all product source remain unchanged.

Selected method: one absolute System32 netstat.exe -a -n -o query. Numeric addresses avoid resolution; no -b, shell, interval, credentials, retry or native input. IPv4 and IPv6 come from one table, reducing cross-snapshot inconsistency. English Windows header/state formats are allowlisted; unsupported/localized formats fail closed. Unknown/malformed rows invalidate the table. PID0 is never an owner; valid non-listening TIME_WAIT PID0 rows do not invent a listener. Multiple rows deduplicate by PID; distinct PIDs remain ambiguous.

Process identity is a separate observation: fixed PowerShell script uses a process handle, creation FILETIME and executable-path digest. The local test compares that identity before/after discovery against its self-owned current process; PID reuse/path changes refuse authentication. This is a temporal consistency check, not a guarantee that the port cannot change after observation. A real NVDA receipt, expected executable and process lifetime must be bound at every future native admission boundary. No running NVDA identity was measured here.

GetExtendedTcpTable was evaluated from Microsoft documentation, not implemented: it needs separate IPv4/IPv6 structures, bounded allocation/resizing, overflow checks, error handling and a controlled native interop lifetime. The measured built-in executable avoids adding that FFI surface. It is not claimed to be independent of the underlying Windows TCP tables.

Budgets: netstat five seconds; total hosted diagnostic ten seconds; cleanup wait one second; stdout1MiB/stderr8KiB. Identity output4KiB. Absolute deadlines do not reset on cancellation/error. Partial output is discarded from results; raw address tables and stderr are not persisted. Every created child's close is recorded separately. Physical quiescence remains false and containment_required true even after close. Timers cannot preempt synchronous spawn; external fifteen-second local supervisor measures worker completion, but does not establish descendant containment. Hosted job timeout/VM disposal is an outer lifetime limit, not process-tree proof. No unsafe legacy WMI query was rerun locally without a Windows Job object.

Tests: resolver.test.mjs, policy.test.mjs, real-child.test.mjs plus all six published diagnostic suites. measure.mjs uses ephemeral self-owned loopback listeners only and reads6837 without binding or connecting to it. No NVDA or keyboard/mouse action.

Publication procedure (OWNER ONLY; nothing dispatched here):
1. Independent review of exact new commit, diff, source inventory, measured failures/results and command/script digests.
2. Create-only publish that exact commit to refs/heads/fix/F-03-g1-netstat-v2; require absent remote or exact identical SHA. Never overwrite the published V1 execution branch. Register only the inert new tabwise-owner-query-v2.yml filename on protected main through a one-file owner PR with current-head preflight and actual required reviews/rules.
3. Separately authorize a new attempt1 on this new ref. Attempt1 runs tests and prints a NON-AUTHORIZING future attempt2 packet; it never launches the probe.
4. Review actual run/revision/workflow SHA/source digest/commands/script/limits and approve that exact future packet via TABWISE_OWNER_QUERY_V2_APPROVAL. Rerun same run as attempt2 only. V1 consumed run41767459754/attempt2 and its deleted approval are invalid for this source.
5. Preserve all artifacts/results including failures; delete the new approval after the attempt. Do not retry/run attempt3/reuse a packet. No native startup, input or qualification is authorized by a successful read-only table measurement.

Future production integration: frozen NVDA.start internally calls its frozen relayOwnerPid, and custody/pre/post scripts have separate CIM/NetTCPConnection paths. Replacing only an external R2 observer callback would leave the internal blocker. Preserve R1; design/review an independently pinned R2-specific runtime adapter after this resolver's hosted measurement. Do not monkeypatch frozen exports or relabel source integrity.

References: https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/netstat
https://learn.microsoft.com/en-us/windows/win32/api/iphlpapi/nf-iphlpapi-getextendedtcptable

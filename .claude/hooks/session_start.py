"""SessionStart hook: print the ledger handoff; Claude Code adds plain stdout to context."""
import os
import pathlib
import sys

sys.stdout.reconfigure(encoding="utf-8")
ledger = pathlib.Path(os.environ.get("CLAUDE_PROJECT_DIR", ".")) / "docs" / "ledger"

state = ledger / "STATE.md"
if state.exists():
    print("\n".join(state.read_text(encoding="utf-8").splitlines()[:40]))

log = ledger / "LOG.jsonl"
if log.exists():
    tail = log.read_text(encoding="utf-8").splitlines()[-20:]
    if tail:
        print("\nLast LOG.jsonl lines:")
        print("\n".join(tail))

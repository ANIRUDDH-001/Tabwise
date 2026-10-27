@AGENTS.md

## Claude Code only
- When a task touches more than two files, use plan mode. Ask for spec approval with AskUserQuestion, recommended option first.
- Hand broad searches to an Explore subagent, so the main context holds only decisions and diffs.
- Before saying something is done, fixed or passing, run its verification command and quote the output.
- Between unrelated tasks, update `STATE.md` and then `/clear`. `STATE.md` is the handoff, not the chat history.
- The `SessionStart` hook prints `STATE.md` into context. Don't read it again unless it has changed.
- A permission rule or hook blocked an action: report it to the user. Don't retry it in a different form.
- Git writes (including `add`, `checkout`, `switch`, `branch`, `worktree`, `--output`, `--ext-diff`, `--textconv`), `gh`, the GitHub API, shell fetches of GitHub and the GitHub MCP are denied by pattern rules in `.claude/settings.json`. Local read-only git (D15) and WebFetch reads of public GitHub pages (D20) are allowed.
- These rules are guardrails, not tested enforcement (13 CX30). Python, Node or file tools could still write Git metadata. The rule binds anyway.
- Deny rules miss `sh -c`, full-path calls and other shells, and the sandbox does not run on native Windows (S-CC-SANDBOX). The rule still applies there. A PreToolUse hook that allows only read-only git is drafted at governance install.
- End with the `STATE.md` handoff (PROTOCOLS §12).
- Scoped rules live in `.claude/rules/*.md` with `paths:` frontmatter and load only for matching files. Add one only after the user approves it.

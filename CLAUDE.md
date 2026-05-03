# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm test` — runs `node --test tests/*.test.js` (82 tests, ~1s).
- `npm run check:version` — verifies `package.json`, `.claude-plugin/plugin.json`, and `.claude-plugin/marketplace.json` all carry the same version. CI gate before tagging.
- `npm run prerelease` — `check:version` + full test suite. Run before any `git tag v*`.
- `npm run tokens` (or `bun run tokens` if `bun` is available) — prints `gpt-tokenizer` BPE counts for representative `[timing]` payloads. Used as a proxy for Anthropic's tokenizer.
- `claude plugin validate .` — validates the `.claude-plugin/` manifest.
- `claude --plugin-dir .` — runs Claude Code with this repo as a local plugin source (development).
- `/reload-plugins` (inside Claude Code) — picks up changes after editing scripts in this repo without restarting Claude Code.

To run a single test, target the file directly: `node --test tests/state.test.js` (or whichever).

## Architecture

The plugin gives Claude Code a sense of wall-clock time and idle gaps. It ships **three modes** coordinated through a single per-session state file at `${CLAUDE_PLUGIN_DATA}/sessions/<sanitized-session-id>.json`:

- **Passive** — `scripts/user-prompt-submit.js` injects a hidden `[timing]` block via the hook's `additionalContext`. Also emits a visible `systemMessage` (`[after 5m 2s]`) when idle exceeds 10s.
- **Active** — `servers/time-server.js` is an MCP server (`get_time`, `time_diff`, `mark_event`, `get_timeline`) registered via `.mcp.json`. Hand-rolled JSON-RPC 2.0 over stdio — zero runtime dependencies, no `@modelcontextprotocol/sdk`.
- **Retrospective** — `commands/timestamps.md` is a slash command that shells out to `scripts/parse-transcript.py` to render a wall-clock timeline of the current session's `.jsonl` transcript.

Plus a statusline fragment (`scripts/statusline-fragment.js`) and a PostToolUse auto-timeline log (`scripts/post-tool-use.js`).

### Hook lifecycle

The state file's `lastStopAt` field is the load-bearing signal:

1. `UserPromptSubmit` (`scripts/user-prompt-submit.js`) — sets `lastUserPromptAt`, **nulls `lastStopAt`** (signal: model is generating). Reads existing state to compute `idle_for` for the timing block before nulling.
2. `Stop` (`scripts/stop.js`) — sets `lastStopAt = now`, computes `lastTurnExecMs` from `lastUserPromptAt`. Only computes `lastTurnExecMs` if `session.lastStopAt` was previously falsy (avoids recompute on Stop re-fires within the same turn).
3. `PreCompact` (`scripts/pre-compact.js`) — advances `lastStopAt`/`lastAssistantMessageAt` to `now` (clock advance, not reset) and nulls `modelAtLastStop` markers, so the statusline fragment counts elapsed time from the compaction event rather than the pre-compact final reply.
4. `PostToolUse` (`scripts/post-tool-use.js`) — appends a `{timestamp, tool, event}` line to `${CLAUDE_PLUGIN_DATA}/timelines/<session-id>.jsonl`. Deliberately omits tool inputs/outputs for privacy.

### Two non-obvious invariants

**Hooks must fail-soft.** Every hook script ends with `main().catch(...) { process.exit(0); }` — never exit 1, even on error. A non-zero exit from `UserPromptSubmit` can be treated as a hook failure by Claude Code and **block the user's prompt**. Telemetry must never block the user. Stderr is fine for diagnosis; exit 0.

**Statusline runs outside hook context.** `scripts/statusline-fragment.js` is invoked by the user's statusline shell script, not by a hook dispatcher — so `CLAUDE_PLUGIN_DATA` is **not** set. The fragment exits silently when the env var is missing. Callers (the user's statusline script, e.g. `~/.claude/statusline-command.sh`) must set `CLAUDE_PLUGIN_DATA="$HOME/.claude/plugins/data/idle-timing-idle-info"` explicitly when invoking. The `/idle-time-setup` slash command prints the paste-ready snippet but does not auto-edit.

### State file safety

`src/state.js`:

- File path keyed by sanitized `session_id` (`getSessionFilePath`). Sanitization replaces `[^A-Za-z0-9._-]` with `_`; path traversal is bounded inside the `sessions/` subdirectory.
- Writes are atomic via `writeFile` to `<file>.tmp` + `rename` (POSIX-atomic on local FS; not strictly atomic on NFS).
- `loadSessionState` returns `{ sessionId }` on `ENOENT` (new session) **and** on `SyntaxError` (corrupt JSON). On `SyntaxError`, the bad file is renamed to `<file>.json.corrupt` for forensics, then fresh state is returned. Single mid-write crash will not permanently disable the plugin.

### Format/clock contract

`src/time.js` exposes `getNowIso(env, nowFactory)` with a deterministic test override: setting `CLAUDE_TIMING_NOW_ISO` in env returns that value verbatim. All hook tests use this; production code never sets it. Timestamps render as **local time with explicit UTC offset** (`2026-04-17T16:04:19+10:00`), not `Z` UTC. `[timing]` block strips milliseconds from the displayed value but state files keep ms precision.

`src/format.js` `formatTimingBlock` accepts only fields it actually emits (`userMessageTime`, `idleSinceLastStopMs`, `lastTurnExecMs`). The previous `idleSinceLastAssistantMs` argument was dead code and was removed in 0.3.1 — don't add it back without a corresponding emit line, or it'll get re-flagged in review.

## Releasing

The version string lives in three files and **must** stay in sync (enforced by `npm run check:version`): `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`. Bumping requires editing all three plus moving the `[Unreleased]` section in `CHANGELOG.md` to a dated entry. See `RELEASING.md` for the full checklist; pushing a `v*` tag pointing at `origin/master` triggers `.github/workflows/release.yml` which re-runs `prerelease` and publishes a GitHub release with the matching CHANGELOG section.

## Marketplace integration notes

This repo is a fork of `clankercode/claude-inject-idle-time` combined with the retrospective `/timestamps` work originally from `s-a-s-k-i-a/claude-code-timestamps`. The user-facing install path uses the upstream marketplace (`clankercode/claude-inject-idle-time`); this repo is the development home and the source for the GSD integration proposal at `docs/proposals/gsd-integration.md`.

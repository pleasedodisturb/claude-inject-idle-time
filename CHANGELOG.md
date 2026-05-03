# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.1] - 2026-05-03

### Fixed
- Hooks no longer block the user's prompt on internal failure. `UserPromptSubmit`, `Stop`, `PreCompact`, and `PostToolUse` now exit 0 (fail-soft) on missing env vars, malformed stdin, disk errors, etc. — they still log to stderr for diagnosis but never propagate failure to Claude Code.
- `loadSessionState` recovers from a corrupt state file (truncated/malformed JSON). The bad file is renamed to `.json.corrupt` for forensics and a fresh state is returned, so a single mid-write crash no longer breaks every subsequent prompt forever.
- `formatTimingBlock` no longer accepts a dead `idleSinceLastAssistantMs` argument from `user-prompt-submit.js`. The field was passed but never used; cleanup only.

## [0.3.0] - 2026-04-17

### Changed
- Timing block is now a multiline `[timing]` tag with `key=value` fields on their own lines, cutting token usage by ~25% (40t vs 53t on a typical block, via `gpt-tokenizer`).
- Timestamp renders in local time with an explicit UTC offset (e.g. `2026-04-17T16:04:19+10:00`) instead of UTC `Z`, and milliseconds are dropped from the displayed value (state still keeps ms precision).
- Field renames: `user_message_utc` → `time`, `idle_since_last_stop_seconds` → `idle_for` (with `s` suffix on the value), `last_turn_exec_seconds` → `last_turn`.
- Idle system message now appears after 10 seconds of idle time (was 60 seconds), providing faster visibility into resumed conversations.

### Added
- `bun run tokens` / `npm run tokens` script (`scripts/token-benchmark.js`) that prints token counts for representative timing payloads using `gpt-tokenizer`.

## [0.2.0] - 2026-04-17

### Added
- `scripts/statusline-fragment.js` — composable statusline fragment printing elapsed time since the model's last reply (`45s`, `3m 21s`, `17m`, `1h 23m`).
- `/idle-time-setup` slash command prints a paste-ready snippet and settings change to wire the fragment into an existing statusline.
- `PreCompact` hook resets the idle timer on context compaction, so the fragment counts from the compaction event rather than the pre-compact final reply.
- Fragment tracks the active model and prints `---` when the current model differs from the one that produced the last reply (e.g. after `/model`), resuming the elapsed count if the user switches back.
- Fragment accepts `--model-id <id>` flag and reads `model.id` from stdin statusline JSON.

## [0.1.3] - 2026-04-17

### Added
- Dual Unlicense/CC0 license
- Full plugin.json metadata (author, homepage, repository, license, keywords)
- Marketplace packaging as `idle-info` (was `idle-timing-local`)
- Marketplace install instructions in README
- RELEASING.md with release checklist and version-match pre-release check

## [0.1.2] - 2026-04-16

### Added
- Visible `[after Xm Ys]` system message when idle exceeds 60 seconds

## [0.1.1] - 2026-04-15

### Added
- `Stop` hook persists per-session timing state (last stop timestamp, exec duration)
- `UserPromptSubmit` hook injects hidden `[message_timing]` block with structured fields:
  - `user_message_utc` — ISO 8601 UTC timestamp
  - `idle_since_last_stop_seconds` — seconds since last `Stop` hook fired
  - `last_turn_exec_seconds` — duration of the previous turn
- Atomic state writes via temp-file rename (safe on Linux/macOS)
- Session ID sanitization to prevent path traversal
- Test-injectable clock via `CLAUDE_TIMING_NOW_ISO` env var
- 28 automated tests covering unit, integration, and installability checks

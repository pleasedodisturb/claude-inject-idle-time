# Statusline fragment for time-since-last-response

## Goal

Give the user an always-visible, self-ticking display of "time since the model last responded" in their Claude Code statusline — composable into an existing statusline, not a replacement for one.

## Why

Users working alongside Claude lose track of how long the current turn has been running or how long ago the last reply landed. The `message_timing` block already records this on each `UserPromptSubmit`, but the signal is hidden until the next prompt. A statusline display makes it ambient.

## Constraints (verified against Claude Code docs)

- Statusline is event-driven by default; `refreshInterval` (seconds, min 1) in settings enables periodic refresh.
- Statusline command receives JSON on stdin (includes `session_id`) and prints text to stdout.
- Users typically already have a statusline — this plugin must not clobber it.

## Design

### Output

Just the elapsed time, no prefix or label. The user's statusline script adds any prefix/emoji.

| Elapsed | Output |
| --- | --- |
| `< 60s` | `45s` |
| `60s` – `drop-seconds-after` (default 900s / 15m) | `3m 21s` |
| `>= drop-seconds-after` and `< 60m` | `17m` |
| `>= 60m` | `1h 23m` |

Edge cases (all print empty string, exit 0):

- No `Stop` has fired this session → no state file
- State file missing/corrupt
- `session_id` not resolvable from stdin or `--session-id`

### Semantic

`now - last_stop_iso` from the existing per-session state file written by `scripts/stop.js`. Keeps ticking during a subsequent turn (still answers "how long since model last responded" — honest semantic).

### CLI

`scripts/statusline-fragment.js`

- Reads stdin: if it's JSON with a `session_id` field, use it.
- `--session-id <id>`: override / fallback when stdin unavailable.
- `--drop-seconds-after <seconds>`: threshold for dropping seconds (default `900`).
- `CLAUDE_TIMING_NOW_ISO`: test-injected clock (same pattern as existing hooks).

### Quick-install: `/idle-time-setup` slash command

Prints a paste-ready snippet for the user's existing statusline script plus the required `refreshInterval` setting. Does not auto-edit settings.

Snippet shape (appended to an existing bash statusline that has already done `input=$(cat)`):

```bash
session_id=$(echo "$input" | jq -r '.session_id // empty')
if [ -n "$session_id" ]; then
  idle=$(node "${CLAUDE_PLUGIN_ROOT:-/path/to/plugin}/scripts/statusline-fragment.js" \
    --session-id "$session_id" 2>/dev/null || true)
  [ -n "$idle" ] && parts+=("$idle")
fi
```

And the settings change:

```json
{ "statusLine": { "refreshInterval": 1, ... } }
```

### Testing

- Unit: format function across all four ranges + threshold boundaries + zero-padding.
- Unit: fragment outputs empty on missing state, missing session_id, malformed JSON.
- Integration: fragment against a seeded state file + `CLAUDE_TIMING_NOW_ISO` produces exact strings.
- Installability: fragment script and slash command file exist; slash command references fragment path correctly.

### Non-goals

- Showing anything else (last-turn duration, branch, model) — the user's statusline already does that.
- Auto-editing `~/.claude/settings.json` — too easy to clobber.
- Multi-session awareness beyond `session_id` from stdin — one statusline instance = one session.

## Rollout

1. Implement + test fragment.
2. Add `/idle-time-setup` slash command.
3. Manually integrate into the author's `~/.claude/statusline-command.sh` as smoke test.
4. README section.
5. CHANGELOG entry under `[Unreleased]`.
6. Version bump + release.

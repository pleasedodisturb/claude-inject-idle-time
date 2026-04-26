# Proposal: temporal context as a first-class signal for GSD

## Context

Claude Code has no native time/idle awareness — a recurring upstream request:
[anthropics/claude-code#44763](https://github.com/anthropics/claude-code/issues/44763),
[#47160](https://github.com/anthropics/claude-code/issues/47160). For
[GSD](https://github.com/gsd-build/get-shit-done) — where waves run for tens of
minutes and sessions resume from `HANDOFF.json` — this gap matters more than
for ad-hoc chat.

[`pleasedodisturb/claude-inject-idle-time`](https://github.com/pleasedodisturb/claude-inject-idle-time)
is a community plugin that closes it. It is a fork combining two prior
projects:

- [`clankercode/claude-inject-idle-time`](https://github.com/clankercode/claude-inject-idle-time) — passive injection via hooks
- [`s-a-s-k-i-a/claude-code-timestamps`](https://github.com/s-a-s-k-i-a/claude-code-timestamps) (MIT) — retrospective transcript parsing

…and exposes time to the model three ways:

- **Passive** — hidden `[timing]` block (`time`, `idle_for`, `last_turn`) on every prompt via `UserPromptSubmit`. ~42 tokens/turn.
- **Active** — MCP server: `get_time`, `time_diff`, `mark_event`, `get_timeline`.
- **Retrospective** — `/timestamps [count]` slash command renders a wall-clock timeline from the session transcript.

This is a proposal to recommend it alongside GSD and discuss tighter
integration.

## Why each mode fits GSD

**Passive** — fights context rot at the cheapest possible price. Every agent
turn (research, plan, execute, verifier) gets temporal grounding without
prompting effort. `PreCompact` resets the idle clock so the signal survives
GSD's frequent compactions.

**Active** — fits GSD's wave model directly. An execution agent can
`mark_event("plan_3a_started")` at wave entry and `time_diff` at exit to
produce honest per-task wall-clock cost — better than guessing from
`last_turn` alone. Verifier and debug agents can query `get_timeline` for
retro context without re-reading transcripts.

**Retrospective** — `/timestamps` is exactly the artifact `/gsd-verify-work`
and post-wave summaries want: "plan executed in 12m, two retries at 14:32 and
14:38." Currently GSD has to reconstruct that from git timestamps + commit
messages.

## Value for users

- **Visible progress on long waves** via the statusline fragment.
- **Re-entry signal** in the TUI (`[after 5m 2s]`) so a 4h gap is obvious when you come back.
- **Compaction-aware clock** stays meaningful across phase boundaries.
- **Model-change indicator (`---`)** matches GSD's quality/balanced/budget profiles switching Opus↔Sonnet — elapsed-since isn't misleading after a profile switch.
- **No prompt noise** — passive block delivered via `additionalContext`, not visible text.

## Integration options (low → high effort)

1. **Doc-only.** List as a recommended companion in GSD setup docs.
2. **Skill-bridge.** `agent_skills` entry teaching subagents to *read* `[timing]` and call the MCP tools (currently transparent unless told).
3. **HANDOFF.json fields.** Persist `last_user_time`, `idle_at_handoff`, `last_turn_seconds`, last `mark_event` so resumed sessions have continuity even without the plugin; plugin populates when present.
4. **Spawn-time propagation.** GSD subagents get fresh `session_id`s, so per-session storage doesn't reach children. A small helper (parent injects last-known timing into child's initial prompt) closes the gap — needs design discussion.

## Open questions

- **Token cost vs. the 40% budget.** Passive block is ~42 tokens/turn (measured by author). Repo ships `bun run tokens` for representative payloads.
- **Privacy.** Timing reveals activity patterns. Opt-in install; worth flagging if recommended.
- **Subagent session model.** Without option (4), spawned execution agents see no idle history — acceptable for v1?
- **`gsd-prompt-guard` interaction.** `[timing]…[/timing]` envelope is structured/predictable; should be safelisted as trusted metadata. MCP tools fall under normal tool-use guardrails.

## Links

- Combined plugin: <https://github.com/pleasedodisturb/claude-inject-idle-time>
- Sources: [clankercode/claude-inject-idle-time](https://github.com/clankercode/claude-inject-idle-time), [s-a-s-k-i-a/claude-code-timestamps](https://github.com/s-a-s-k-i-a/claude-code-timestamps)
- GSD: <https://github.com/gsd-build/get-shit-done>
- Upstream issues: [anthropics/claude-code#44763](https://github.com/anthropics/claude-code/issues/44763), [#47160](https://github.com/anthropics/claude-code/issues/47160)

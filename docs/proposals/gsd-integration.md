# Proposal: temporal context as a first-class signal for GSD

## What this is

[`pleasedodisturb/claude-inject-idle-time`](https://github.com/pleasedodisturb/claude-inject-idle-time)
is a community Claude Code plugin that gives the model a sense of
wall-clock time and user-idle gaps — something Claude Code does not
expose natively today.

It works in three modes:

- **Passive** — hidden `[timing]` block (`time`, `idle_for`, `last_turn`) injected on every prompt via `UserPromptSubmit`. ~42 tokens/turn.
- **Active** — MCP server with `get_time`, `time_diff`, `mark_event`, `get_timeline` tools.
- **Retrospective** — `/timestamps [count]` slash command renders a wall-clock timeline from the session transcript.

It also ships a statusline fragment (live elapsed-since-last-reply) and a
TUI re-entry note (`[after 5m 2s]`).

This is a proposal to recommend it alongside [GSD](https://github.com/gsd-build/get-shit-done)
and discuss tighter integration. It is **not** a request to merge code into
GSD — minimum ask is a one-line mention in setup docs.

## Value for users

- **Visible progress on long waves** via the statusline fragment — no spinner-watching while a phase runs for 20 minutes.
- **Re-entry signal** in the TUI (`[after 5m 2s]`) so a 4h gap is obvious when you come back to a planning session.
- **Compaction-aware clock** — `PreCompact` resets the timer, so the displayed elapsed time stays meaningful across GSD's frequent compactions.
- **Model-change indicator (`---`)** — matches GSD's quality/balanced/budget profiles switching Opus↔Sonnet, so the elapsed-since reading isn't misleading after a profile flip.
- **No prompt noise** — passive block is delivered via `additionalContext`, not visible text.
- **`/timestamps` for honest summaries** — "plan executed in 12m, two retries at 14:32 and 14:38" without reconstructing from git.

## Value for agents

- **Re-entry awareness on long waves.** Distinguishes "user idle 30s, still watching" from "idle 4h, walked away" — gates re-orientation and confirmation on destructive ops.
- **Wave instrumentation.** An execution agent can `mark_event("plan_3a_started")` at wave entry and `time_diff` at exit to produce honest per-task wall-clock cost — better than guessing from `last_turn` alone.
- **HANDOFF.json continuity.** Persisting `last_user_time` / `idle_at_handoff` gives resumed `/gsd-execute-phase` and verifier sessions immediate temporal grounding.
- **Verifier cadence.** `/gsd-verify-work` can tell active UAT from a stalled tester and prompt accordingly.
- **Discuss-phase recaps.** Auto-recap when idle gap is large so decision-threads survive coffee breaks.
- **Context-rot defense at near-zero cost.** Passive block is the cheapest possible temporal grounding — every research/plan/execute/verifier turn gets it without prompt-engineering effort.

## What we combined

The plugin is a fork that combines two prior community projects, adds an
active-query layer on top, and bundles the result.

| Source | What we took |
| --- | --- |
| [`clankercode/claude-inject-idle-time`](https://github.com/clankercode/claude-inject-idle-time) | The passive `[timing]` block injected via `UserPromptSubmit`, the `Stop` and `PreCompact` hooks, and the statusline fragment with model-change handling. |
| [`s-a-s-k-i-a/claude-code-timestamps`](https://github.com/s-a-s-k-i-a/claude-code-timestamps) (MIT) | The retrospective `/timestamps` slash command — reads `.jsonl` session transcripts and renders a wall-clock timeline. |

On top of those, [clankercode/claude-inject-idle-time#1](https://github.com/clankercode/claude-inject-idle-time/pull/1)
adds the **active** mode: an MCP server exposing `get_time`, `time_diff`,
`mark_event`, and `get_timeline`, plus automatic session-timeline logging via
a `PostToolUse` hook.

## Integration options (low → high effort)

1. **Doc-only.** List as a recommended companion in GSD setup docs.
2. **Skill-bridge.** `agent_skills` entry teaching subagents to *read* `[timing]` and call the MCP tools (currently transparent unless told).
3. **HANDOFF.json fields.** Persist `last_user_time`, `idle_at_handoff`, `last_turn_seconds`, last `mark_event` so resumed sessions have continuity even without the plugin; plugin populates when present.
4. **Spawn-time propagation.** GSD subagents get fresh `session_id`s, so per-session storage doesn't reach children. A small helper (parent injects last-known timing into the child's initial prompt) closes the gap — needs design discussion.

## Open questions

- **Token cost vs. the 40% budget.** Passive block is ~42 tokens/turn (measured by author). Repo ships `bun run tokens` for representative payloads.
- **Privacy.** Timing reveals activity patterns. Opt-in install; worth flagging in GSD docs if recommended.
- **Subagent session model.** Without option (4), spawned execution agents see no idle history — acceptable for v1?
- **`gsd-prompt-guard` interaction.** `[timing]…[/timing]` envelope is structured/predictable; should be safelisted as trusted metadata. MCP tools fall under normal tool-use guardrails.

## Related prior work in this repo

Adjacent threads — covered for completeness, not duplicates. They address
*continuity / handoff state*; this proposal is about *temporal signal*. The
two are complementary.

- Discussion [#2178](https://github.com/gsd-build/get-shit-done/discussions/2178) — *How to best resume work after token exhaustion.* Resumption is harder when the model has no idea how long the gap was; integration option (3) directly feeds that.
- Discussion [#1961](https://github.com/gsd-build/get-shit-done/discussions/1961) — *Resumable research with checkpointing.* Pairs naturally with `mark_event` / `get_timeline` for checkpoint annotation.
- Discussion [#535](https://github.com/gsd-build/get-shit-done/discussions/535) — *Coming back after a milestone is done.* Same gap on a longer horizon.
- Issue [#2473](https://github.com/gsd-build/get-shit-done/issues/2473) — *`/gsd-ship` should refuse to open a PR when HANDOFF.json declares in-progress work.* Reinforces HANDOFF.json as a load-bearing surface; option (3) extends it with temporal fields.
- Issue [#2006](https://github.com/gsd-build/get-shit-done/issues/2006) — *Planner agent loses critical detail at handoff boundaries.* Different lossage (semantic, not temporal), but the proposed timing fields are cheap context to carry across the same boundary.

Not a duplicate of [#2410](https://github.com/gsd-build/get-shit-done/issues/2410) — `Stream idle timeout` is a Claude Code stream-level timeout, unrelated to model-side idle awareness. Keyword overlap only.

## Links

### Repos

- Combined plugin (this proposal): <https://github.com/pleasedodisturb/claude-inject-idle-time>
- Source — passive injection: <https://github.com/clankercode/claude-inject-idle-time>
- Source — retrospective transcript parsing (MIT): <https://github.com/s-a-s-k-i-a/claude-code-timestamps>
- GSD: <https://github.com/gsd-build/get-shit-done>

### Code proposal

- Active + retrospective modes: <https://github.com/clankercode/claude-inject-idle-time/pull/1>

### Anthropic issues this addresses

- [anthropics/claude-code#44763](https://github.com/anthropics/claude-code/issues/44763) — Add timestamps to conversation messages.
- [anthropics/claude-code#47160](https://github.com/anthropics/claude-code/issues/47160) — Expose message timestamps to the model.

### Adjacent GSD threads

- Discussions: [#2178](https://github.com/gsd-build/get-shit-done/discussions/2178), [#1961](https://github.com/gsd-build/get-shit-done/discussions/1961), [#535](https://github.com/gsd-build/get-shit-done/discussions/535)
- Issues: [#2473](https://github.com/gsd-build/get-shit-done/issues/2473), [#2006](https://github.com/gsd-build/get-shit-done/issues/2006)

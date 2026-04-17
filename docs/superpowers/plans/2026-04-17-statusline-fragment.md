# Statusline Fragment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a composable `scripts/statusline-fragment.js` that prints the elapsed time since the model last responded, plus a `/idle-time-setup` slash command that tells the user how to wire it into their existing statusline.

**Architecture:** A pure formatter (`src/duration.js`) + a thin CLI wrapper that reads the existing per-session state file written by `scripts/stop.js`. The fragment accepts the same stdin JSON Claude Code passes to statusline commands, with `--session-id` as a fallback. Emits just the elapsed-time string (e.g. `45s`, `3m 21s`, `17m`, `1h 23m`) so the user's own statusline can add any prefix/emoji.

**Tech Stack:** Node.js built-ins only (`node:test`, `node:fs/promises`, `node:child_process`). Matches the existing plugin's zero-dependency style.

---

## File Structure

- Create: `src/duration.js` — pure function `formatElapsed(ms, { dropSecondsAfterSeconds })` returning string or `null`.
- Create: `scripts/statusline-fragment.js` — CLI: read stdin JSON + args, load session state via existing `src/state.js`, compute elapsed from `lastStopAt` via `src/time.js`, print with `formatElapsed`. Always exits 0; prints empty string on missing/unresolvable state.
- Create: `tests/duration.test.js` — unit tests for `formatElapsed` covering all four ranges + threshold boundaries + null handling.
- Create: `tests/statusline-fragment.test.js` — integration tests spawning the fragment as a child process (mirrors `tests/integration.test.js`).
- Create: `commands/idle-time-setup.md` — slash command instructing the assistant to inspect the user's statusline config and print a paste-ready snippet.
- Modify: `tests/installability.test.js` — assert `scripts/statusline-fragment.js` and `commands/idle-time-setup.md` exist.
- Modify: `README.md` — add "Statusline integration" section after "Install via Marketplace".
- Modify: `CHANGELOG.md` — add bullets under `[Unreleased]`.

---

## Task 1: Duration formatter (pure function)

**Files:**
- Create: `src/duration.js`
- Test: `tests/duration.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/duration.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { formatElapsed } = require('../src/duration');

const DEFAULT_OPTS = { dropSecondsAfterSeconds: 900 };

test('formatElapsed returns null for null or non-finite input', () => {
  assert.equal(formatElapsed(null, DEFAULT_OPTS), null);
  assert.equal(formatElapsed(undefined, DEFAULT_OPTS), null);
  assert.equal(formatElapsed(Number.NaN, DEFAULT_OPTS), null);
  assert.equal(formatElapsed(Number.POSITIVE_INFINITY, DEFAULT_OPTS), null);
});

test('formatElapsed returns null for negative elapsed (clock skew)', () => {
  assert.equal(formatElapsed(-1, DEFAULT_OPTS), null);
});

test('formatElapsed under 60 seconds shows seconds only', () => {
  assert.equal(formatElapsed(0, DEFAULT_OPTS), '0s');
  assert.equal(formatElapsed(999, DEFAULT_OPTS), '0s');
  assert.equal(formatElapsed(1000, DEFAULT_OPTS), '1s');
  assert.equal(formatElapsed(45_000, DEFAULT_OPTS), '45s');
  assert.equal(formatElapsed(59_999, DEFAULT_OPTS), '59s');
});

test('formatElapsed between 60s and drop-seconds-after shows minutes and seconds', () => {
  assert.equal(formatElapsed(60_000, DEFAULT_OPTS), '1m 0s');
  assert.equal(formatElapsed(201_500, DEFAULT_OPTS), '3m 21s');
  assert.equal(formatElapsed(899_000, DEFAULT_OPTS), '14m 59s');
});

test('formatElapsed at or above drop-seconds-after under an hour drops seconds', () => {
  assert.equal(formatElapsed(900_000, DEFAULT_OPTS), '15m');
  assert.equal(formatElapsed(1_020_000, DEFAULT_OPTS), '17m');
  assert.equal(formatElapsed(3_599_000, DEFAULT_OPTS), '59m');
});

test('formatElapsed at or above one hour shows hours and minutes only', () => {
  assert.equal(formatElapsed(3_600_000, DEFAULT_OPTS), '1h 0m');
  assert.equal(formatElapsed(5_000_000, DEFAULT_OPTS), '1h 23m');
  assert.equal(formatElapsed(36_060_000, DEFAULT_OPTS), '10h 1m');
});

test('formatElapsed honors a custom dropSecondsAfterSeconds threshold', () => {
  // sub-60s always formats as seconds, regardless of threshold
  assert.equal(formatElapsed(30_000, { dropSecondsAfterSeconds: 10 }), '30s');
  // at/above threshold (and >= 60s) drops seconds
  assert.equal(formatElapsed(60_000, { dropSecondsAfterSeconds: 30 }), '1m');
  assert.equal(formatElapsed(120_000, { dropSecondsAfterSeconds: 30 }), '2m');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/duration.test.js`
Expected: FAIL with `Cannot find module '../src/duration'`

- [ ] **Step 3: Implement `src/duration.js`**

```javascript
function formatElapsed(valueMs, { dropSecondsAfterSeconds }) {
  if (
    typeof valueMs !== 'number' ||
    !Number.isFinite(valueMs) ||
    valueMs < 0
  ) {
    return null;
  }

  const totalSeconds = Math.floor(valueMs / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);

  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  }

  if (totalSeconds >= dropSecondsAfterSeconds) {
    return `${totalMinutes}m`;
  }

  const seconds = totalSeconds % 60;
  return `${totalMinutes}m ${seconds}s`;
}

module.exports = { formatElapsed };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/duration.test.js`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/duration.js tests/duration.test.js
git commit -m "feat: add formatElapsed duration formatter"
```

---

## Task 2: Statusline fragment CLI — happy path

**Files:**
- Create: `scripts/statusline-fragment.js`
- Test: `tests/statusline-fragment.test.js`

- [ ] **Step 1: Write the failing integration test (happy path only)**

```javascript
// tests/statusline-fragment.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const fragmentScriptPath = path.join(rootDir, 'scripts', 'statusline-fragment.js');
const DEFAULT_TIMEOUT_MS = 5000;

function runFragment({ input = '', args = [], dataDir, nowIso, extraEnv = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fragmentScriptPath, ...args], {
      cwd: rootDir,
      env: {
        ...process.env,
        CLAUDE_PLUGIN_DATA: dataDir,
        CLAUDE_TIMING_NOW_ISO: nowIso,
        ...extraEnv
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`fragment timed out after ${DEFAULT_TIMEOUT_MS}ms`));
    }, DEFAULT_TIMEOUT_MS);

    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });

    child.stdin.end(input);
  });
}

function seedSessionState(dataDir, sessionId, state) {
  const sessionsDir = path.join(dataDir, 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  const filePath = path.join(sessionsDir, `${sessionId}.json`);
  fs.writeFileSync(filePath, JSON.stringify({ sessionId, ...state }, null, 2));
}

test('fragment prints elapsed time since lastStopAt from stdin session_id', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-fragment-'));
  const sessionId = 'session-1';

  seedSessionState(dataDir, sessionId, {
    lastStopAt: '2026-04-12T19:00:00.000Z'
  });

  const result = await runFragment({
    input: JSON.stringify({ session_id: sessionId }),
    dataDir,
    nowIso: '2026-04-12T19:00:45.000Z'
  });

  assert.equal(result.code, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, '45s');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/statusline-fragment.test.js`
Expected: FAIL — fragment script missing.

- [ ] **Step 3: Implement `scripts/statusline-fragment.js` (happy path)**

```javascript
#!/usr/bin/env node

const { loadSessionState } = require('../src/state');
const { getNowIso, diffMs } = require('../src/time');
const { formatElapsed } = require('../src/duration');

const DEFAULT_DROP_SECONDS_AFTER = 900;

async function readStdin() {
  if (process.stdin.isTTY) {
    return '';
  }

  let input = '';

  for await (const chunk of process.stdin) {
    input += chunk;
  }

  return input;
}

function parseArgs(argv) {
  const args = { sessionId: null, dropSecondsAfterSeconds: DEFAULT_DROP_SECONDS_AFTER };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--session-id') {
      args.sessionId = argv[i + 1] || null;
      i += 1;
    } else if (arg.startsWith('--session-id=')) {
      args.sessionId = arg.slice('--session-id='.length) || null;
    } else if (arg === '--drop-seconds-after') {
      args.dropSecondsAfterSeconds = Number(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith('--drop-seconds-after=')) {
      args.dropSecondsAfterSeconds = Number(arg.slice('--drop-seconds-after='.length));
    }
  }

  if (!Number.isFinite(args.dropSecondsAfterSeconds) || args.dropSecondsAfterSeconds < 0) {
    args.dropSecondsAfterSeconds = DEFAULT_DROP_SECONDS_AFTER;
  }

  return args;
}

function resolveSessionId(stdinRaw, argSessionId) {
  if (argSessionId) {
    return argSessionId;
  }

  if (!stdinRaw) {
    return null;
  }

  try {
    const parsed = JSON.parse(stdinRaw);
    if (parsed && typeof parsed.session_id === 'string' && parsed.session_id) {
      return parsed.session_id;
    }
  } catch {
    return null;
  }

  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;

  if (!dataDir) {
    return;
  }

  const rawInput = await readStdin();
  const sessionId = resolveSessionId(rawInput, args.sessionId);

  if (!sessionId) {
    return;
  }

  const session = await loadSessionState({ dataDir, sessionId });

  if (!session || !session.lastStopAt) {
    return;
  }

  const elapsedMs = diffMs(getNowIso(), session.lastStopAt);
  const formatted = formatElapsed(elapsedMs, {
    dropSecondsAfterSeconds: args.dropSecondsAfterSeconds
  });

  if (formatted) {
    process.stdout.write(formatted);
  }
}

main().catch(() => {
  process.exit(0);
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/statusline-fragment.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/statusline-fragment.js tests/statusline-fragment.test.js
git commit -m "feat: add statusline fragment cli happy path"
```

---

## Task 3: Statusline fragment edge cases

**Files:**
- Modify: `tests/statusline-fragment.test.js` (add tests)
- Modify: `scripts/statusline-fragment.js` only if a new test exposes a gap

- [ ] **Step 1: Add failing tests covering each edge case**

Append to `tests/statusline-fragment.test.js`:

```javascript
test('fragment prints empty when session has no lastStopAt yet', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-fragment-'));
  const sessionId = 'session-1';

  seedSessionState(dataDir, sessionId, {
    lastUserPromptAt: '2026-04-12T19:00:00.000Z'
  });

  const result = await runFragment({
    input: JSON.stringify({ session_id: sessionId }),
    dataDir,
    nowIso: '2026-04-12T19:00:05.000Z'
  });

  assert.equal(result.code, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, '');
});

test('fragment prints empty when no state file exists for the session', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-fragment-'));

  const result = await runFragment({
    input: JSON.stringify({ session_id: 'never-seen' }),
    dataDir,
    nowIso: '2026-04-12T19:00:05.000Z'
  });

  assert.equal(result.code, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, '');
});

test('fragment prints empty when stdin is not valid JSON and no --session-id', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-fragment-'));

  const result = await runFragment({
    input: 'not json',
    dataDir,
    nowIso: '2026-04-12T19:00:05.000Z'
  });

  assert.equal(result.code, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, '');
});

test('fragment uses --session-id when stdin is empty', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-fragment-'));
  const sessionId = 'session-2';

  seedSessionState(dataDir, sessionId, {
    lastStopAt: '2026-04-12T19:00:00.000Z'
  });

  const result = await runFragment({
    input: '',
    args: ['--session-id', sessionId],
    dataDir,
    nowIso: '2026-04-12T19:03:30.000Z'
  });

  assert.equal(result.code, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, '3m 30s');
});

test('fragment --session-id overrides stdin session_id', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-fragment-'));

  seedSessionState(dataDir, 'from-arg', {
    lastStopAt: '2026-04-12T19:00:00.000Z'
  });
  seedSessionState(dataDir, 'from-stdin', {
    lastStopAt: '2026-04-12T18:00:00.000Z'
  });

  const result = await runFragment({
    input: JSON.stringify({ session_id: 'from-stdin' }),
    args: ['--session-id', 'from-arg'],
    dataDir,
    nowIso: '2026-04-12T19:00:10.000Z'
  });

  assert.equal(result.code, 0);
  assert.equal(result.stdout, '10s');
});

test('fragment honors --drop-seconds-after flag', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-fragment-'));
  const sessionId = 'session-1';

  seedSessionState(dataDir, sessionId, {
    lastStopAt: '2026-04-12T19:00:00.000Z'
  });

  // 60s elapsed, default threshold 900s keeps seconds visible
  const withDefault = await runFragment({
    input: JSON.stringify({ session_id: sessionId }),
    dataDir,
    nowIso: '2026-04-12T19:01:00.000Z'
  });
  assert.equal(withDefault.stdout, '1m 0s');

  // Same 60s elapsed, threshold lowered to 30s drops the seconds
  const withLowerThreshold = await runFragment({
    input: JSON.stringify({ session_id: sessionId }),
    args: ['--drop-seconds-after', '30'],
    dataDir,
    nowIso: '2026-04-12T19:01:00.000Z'
  });
  assert.equal(withLowerThreshold.stdout, '1m');
});

test('fragment prints empty when CLAUDE_PLUGIN_DATA is not set', async () => {
  const result = await runFragment({
    input: JSON.stringify({ session_id: 'session-1' }),
    dataDir: undefined,
    nowIso: '2026-04-12T19:00:05.000Z',
    extraEnv: { CLAUDE_PLUGIN_DATA: '' }
  });

  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
});
```

- [ ] **Step 2: Run the tests**

Run: `node --test tests/statusline-fragment.test.js`
Expected: PASS (all edge cases should already be covered by the Task 2 implementation).

If any test fails, read the output carefully and patch `scripts/statusline-fragment.js` minimally. Do not change happy-path behavior.

- [ ] **Step 3: Commit**

```bash
git add tests/statusline-fragment.test.js scripts/statusline-fragment.js
git commit -m "test: cover statusline fragment edge cases"
```

---

## Task 4: Slash command `/idle-time-setup`

**Files:**
- Create: `commands/idle-time-setup.md`

- [ ] **Step 1: Create the slash command markdown**

```markdown
---
description: Show paste-ready snippet to wire the idle-timing fragment into your existing statusline
allowed-tools: [Read, Bash]
---

# Idle-time statusline setup

Goal: help the user add the `statusline-fragment` to their existing statusline script and enable periodic refresh.

Steps:

1. Locate the user's current statusline configuration. Read `~/.claude/settings.json` (may not exist; may be named `settings.local.json`; project-scoped settings may be at `.claude/settings.json` in the working directory). Extract the `statusLine.command` string and any existing `statusLine.refreshInterval` value.

2. If a `statusLine.command` is set, read the script it points to (handle leading `bash `, `sh `, env substitutions like `${HOME}` or `$HOME`, and `~`). Confirm it reads stdin once into a variable (look for `$(cat)` or an equivalent) — the snippet assumes that.

3. Print a short summary:
    - The path of the statusline script being patched
    - Whether `refreshInterval` is already set and its current value
    - The plugin root path: `${CLAUDE_PLUGIN_ROOT}` (let the user substitute for their actual plugin install path)

4. Print the paste-ready snippet the user can drop into their statusline script. If the script already assigns stdin to a variable named `input`, use that name; otherwise suggest renaming. Example snippet:

    ```bash
    # --- idle-timing fragment ---
    session_id=$(echo "$input" | jq -r '.session_id // empty')
    if [ -n "$session_id" ]; then
      idle=$(node "${CLAUDE_PLUGIN_ROOT:-/path/to/idle-timing/plugin}/scripts/statusline-fragment.js" \
        --session-id "$session_id" 2>/dev/null || true)
      [ -n "$idle" ] && parts+=("$idle")
    fi
    # --- /idle-timing fragment ---
    ```

    Tell the user to place the snippet just before the final `parts`-to-output assembly in their statusline script. If their script does not use a `parts` bash array, show a variant that appends directly to the output string instead.

5. Print the settings change to enable periodic refresh:

    ```json
    {
      "statusLine": {
        "command": "<existing command>",
        "refreshInterval": 1
      }
    }
    ```

    Tell the user to add `refreshInterval: 1` (seconds) to their `statusLine` object. Note that without it, the fragment still updates on every event (new message, tool result) but will not tick while idle.

6. Do NOT modify any files. This command prints instructions only.

7. Close with a one-line test hint: `start a new Claude Code session, wait a few seconds after Claude replies, and you should see the elapsed time appear on the right-hand side of the statusline`.
```

- [ ] **Step 2: Commit**

```bash
git add commands/idle-time-setup.md
git commit -m "feat: add /idle-time-setup slash command"
```

---

## Task 5: Installability test updates

**Files:**
- Modify: `tests/installability.test.js`

- [ ] **Step 1: Add failing assertions**

Append to `tests/installability.test.js`:

```javascript
test('statusline fragment script exists and is directly invocable', () => {
  const fragmentPath = path.join(rootDir, 'scripts', 'statusline-fragment.js');
  assert.ok(fs.existsSync(fragmentPath), 'expected statusline fragment script to exist');

  const source = fs.readFileSync(fragmentPath, 'utf8');
  assert.match(source, /loadSessionState/);
  assert.match(source, /formatElapsed/);
});

test('/idle-time-setup slash command is registered', () => {
  const commandPath = path.join(rootDir, 'commands', 'idle-time-setup.md');
  assert.ok(fs.existsSync(commandPath), 'expected slash command to exist');

  const contents = fs.readFileSync(commandPath, 'utf8');
  assert.match(contents, /^---/, 'expected frontmatter');
  assert.match(contents, /description:/);
  assert.match(contents, /statusline-fragment\.js/);
  assert.match(contents, /refreshInterval/);
});
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS (all previous tests + the two new installability assertions).

- [ ] **Step 3: Commit**

```bash
git add tests/installability.test.js
git commit -m "test: assert statusline fragment and slash command exist"
```

---

## Task 6: README + CHANGELOG

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update `CHANGELOG.md`**

Change the `[Unreleased]` section from:

```markdown
## [Unreleased]
```

To:

```markdown
## [Unreleased]

### Added
- `scripts/statusline-fragment.js` — composable statusline fragment printing elapsed time since the model's last reply (`45s`, `3m 21s`, `17m`, `1h 23m`).
- `/idle-time-setup` slash command prints a paste-ready snippet and settings change to wire the fragment into an existing statusline.
```

- [ ] **Step 2: Update `README.md`**

After the existing "Install via Marketplace" section and before "Local Usage" (or wherever usage sections sit — read the file first to confirm placement), insert:

```markdown
## Statusline integration (optional)

This plugin ships a composable fragment that prints the elapsed time since the model's last reply. It's meant to be dropped into your existing statusline script, not to replace one.

Run the slash command for a guided paste-ready snippet tailored to your current statusline:

```
/idle-time-setup
```

At a minimum you will need to:

1. Enable periodic refresh in `~/.claude/settings.json`:

    ```json
    { "statusLine": { "refreshInterval": 1 } }
    ```

2. In your statusline script, after you read stdin into a variable (e.g. `input=$(cat)`), call the fragment and append its output:

    ```bash
    session_id=$(echo "$input" | jq -r '.session_id // empty')
    if [ -n "$session_id" ]; then
      idle=$(node "${CLAUDE_PLUGIN_ROOT:-/path/to/plugin}/scripts/statusline-fragment.js" \
        --session-id "$session_id" 2>/dev/null || true)
      [ -n "$idle" ] && parts+=("$idle")
    fi
    ```

The fragment prints just the elapsed time (e.g. `45s`, `3m 21s`, `17m`). Add any prefix or emoji in your own script.

Flags:

- `--session-id <id>` — explicit session id; overrides stdin.
- `--drop-seconds-after <seconds>` — switch to minute-only formatting at this threshold (default `900`, i.e. 15 minutes).
```

- [ ] **Step 3: Run tests once more to confirm nothing broke**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: document statusline fragment and slash command"
```

---

## Task 7: Smoke test against the author's real statusline

**Files:**
- Modify: `/home/xertrov/.claude/statusline-command.sh`
- Modify: `/home/xertrov/.claude/settings.json`

This task runs the fragment through the actual statusline. Confirm each mutation with the user before applying — files in `~/.claude/` are shared state.

- [ ] **Step 1: Back up the current statusline script and settings**

```bash
cp ~/.claude/statusline-command.sh ~/.claude/statusline-command.sh.bak.$(date +%Y%m%dT%H%M%S)
cp ~/.claude/settings.json ~/.claude/settings.json.bak.$(date +%Y%m%dT%H%M%S)
```

- [ ] **Step 2: Patch `~/.claude/statusline-command.sh`**

Insert the snippet between the existing `parts+=("$display_cwd")` line and the `# Join with " | "` line. The script already assigns stdin to `input` on line 5.

Exact edit (find this two-line block):

```bash
parts+=("$display_cwd")

# Join with " | "
```

Replace with:

```bash
parts+=("$display_cwd")

# --- idle-timing fragment ---
session_id=$(echo "$input" | jq -r '.session_id // empty')
if [ -n "$session_id" ]; then
  idle=$(node "/home/xertrov/src/claude-inject-idle-time/scripts/statusline-fragment.js" \
    --session-id "$session_id" 2>/dev/null || true)
  [ -n "$idle" ] && parts+=("$idle")
fi
# --- /idle-timing fragment ---

# Join with " | "
```

(Hardcode the plugin path since the user's statusline script runs outside the plugin hook environment, where `CLAUDE_PLUGIN_ROOT` is not set.)

- [ ] **Step 3: Patch `~/.claude/settings.json` to add `refreshInterval`**

Current `statusLine` block:

```json
"statusLine": {
  "type": "command",
  "command": "bash ~/.claude/statusline-command.sh"
},
```

Replace with:

```json
"statusLine": {
  "type": "command",
  "command": "bash ~/.claude/statusline-command.sh",
  "refreshInterval": 1
},
```

- [ ] **Step 4: Dry-run the patched statusline script**

```bash
echo '{"session_id":"smoke-test","cwd":"/tmp","model":{"id":"claude-opus-4","display_name":"Opus"},"context_window":{"current_usage":{"input_tokens":100}}}' \
  | bash ~/.claude/statusline-command.sh
```

Expected: prints the composed statusline line. Idle fragment will be empty (no state file for `smoke-test`), which is correct. The important assertion is that the command succeeds and prints something — i.e. the snippet didn't break the existing script.

- [ ] **Step 5: Tell the user**

Once the patch is applied, tell the user to start a fresh Claude Code session in any directory and wait a moment after the first reply — they should see the elapsed timer appear on the right-hand side of the statusline and tick each second (because `refreshInterval: 1` is now set).

- [ ] **Step 6: Do not commit these changes.**

`~/.claude/` is the user's personal config, not this repo. No git action for this task.

---

## Notes for the implementer

- **No new dependencies.** Only Node built-ins plus the plugin's existing `src/*.js` modules.
- **Always exit 0.** The fragment is invoked on every statusline refresh. A non-zero exit would make the user's statusline script die or leak noise into the TUI. Swallow errors silently — missing state = empty output.
- **No stderr output on normal operation.** Any stderr the user sees could end up in their terminal scrollback.
- **Do not modify `hooks/hooks.json`.** The fragment is not a hook — it is a stand-alone CLI the user invokes from their own statusline.
- **Version bump is out of scope for this plan.** Treat all CHANGELOG additions as `[Unreleased]`. A separate release pass (RELEASING.md) cuts a new version.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const scriptPath = path.join(rootDir, 'scripts', 'user-prompt-submit.js');

function runUserPromptSubmit({ input, dataDir, nowIso }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: rootDir,
      env: {
        ...process.env,
        CLAUDE_PLUGIN_DATA: dataDir,
        CLAUDE_TIMING_NOW_ISO: nowIso
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    child.stdin.end(JSON.stringify(input));
  });
}

test('first prompt injects only the UTC timestamp block and persists lastUserPromptAt', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-user-prompt-'));
  const nowIso = '2026-04-12T19:00:00.000Z';

  const result = await runUserPromptSubmit({
    input: { session_id: 'session-1' },
    dataDir,
    nowIso
  });

  assert.equal(result.code, 0, `expected success, stderr was: ${result.stderr}`);
  assert.equal(result.stderr, '');

  assert.deepEqual(JSON.parse(result.stdout), {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: [
        '[message_timing]',
        `user_message_utc: ${nowIso}`,
        '[/message_timing]'
      ].join('\n')
    }
  });

  const statePath = path.join(dataDir, 'sessions', 'session-1.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath, 'utf8')), {
    sessionId: 'session-1',
    lastUserPromptAt: nowIso,
    lastStopAt: null
  });
});

test('later prompts include idle and previous execution timings from state', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-user-prompt-'));
  const nowIso = '2026-04-12T19:00:10.000Z';

  fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, 'sessions', 'session-1.json'),
    JSON.stringify(
      {
        sessionId: 'session-1',
        lastAssistantMessageAt: '2026-04-12T19:00:03.000Z',
        lastStopAt: '2026-04-12T19:00:04.500Z',
        lastTurnExecMs: 4321,
        lastUserPromptAt: '2026-04-12T18:59:00.000Z'
      },
      null,
      2
    )
  );

  const result = await runUserPromptSubmit({
    input: { session_id: 'session-1' },
    dataDir,
    nowIso
  });

  assert.equal(result.code, 0, `expected success, stderr was: ${result.stderr}`);
  assert.equal(result.stderr, '');

  assert.deepEqual(JSON.parse(result.stdout), {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: [
        '[message_timing]',
        `user_message_utc: ${nowIso}`,
        'idle_since_last_assistant_ms: 7000',
        'idle_since_last_stop_ms: 5500',
        'last_turn_exec_ms: 4321',
        '[/message_timing]'
      ].join('\n')
    }
  });

  const statePath = path.join(dataDir, 'sessions', 'session-1.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath, 'utf8')), {
    sessionId: 'session-1',
    lastAssistantMessageAt: '2026-04-12T19:00:03.000Z',
    lastStopAt: null,
    lastTurnExecMs: 4321,
    lastUserPromptAt: nowIso
  });
});

test('missing session_id fails before any state access', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-user-prompt-'));

  const result = await runUserPromptSubmit({
    input: {},
    dataDir,
    nowIso: '2026-04-12T19:00:10.000Z'
  });

  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /session_id is required/);
  assert.equal(fs.existsSync(path.join(dataDir, 'sessions')), false);
});

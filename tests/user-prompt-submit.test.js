const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const scriptPath = path.join(rootDir, 'scripts', 'user-prompt-submit.js');

function parseHookOutput(stdout) {
  return JSON.parse(stdout);
}

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

test('first prompt injects only the timestamp block and persists lastUserPromptAt', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-user-prompt-'));
  const nowIso = '2026-04-13T05:00:00.000+10:00';

  const result = await runUserPromptSubmit({
    input: { session_id: 'session-1' },
    dataDir,
    nowIso
  });

  assert.equal(result.code, 0, `expected success, stderr was: ${result.stderr}`);
  assert.equal(result.stderr, '');
  assert.deepEqual(parseHookOutput(result.stdout), {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: ['[timing]', 'time=2026-04-13T05:00:00+10:00', '[/timing]'].join('\n')
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
  const nowIso = '2026-04-13T05:00:10.000+10:00';

  fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, 'sessions', 'session-1.json'),
    JSON.stringify(
      {
        sessionId: 'session-1',
        lastAssistantMessageAt: '2026-04-13T05:00:03.000+10:00',
        lastStopAt: '2026-04-13T05:00:04.500+10:00',
        lastTurnExecMs: 4321,
        lastUserPromptAt: '2026-04-13T04:59:00.000+10:00'
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
  assert.deepEqual(parseHookOutput(result.stdout), {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: [
        '[timing]',
        'time=2026-04-13T05:00:10+10:00',
        'idle_for=5.5s',
        'last_turn=4.3s',
        '[/timing]'
      ].join('\n')
    }
  });

  const statePath = path.join(dataDir, 'sessions', 'session-1.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath, 'utf8')), {
    sessionId: 'session-1',
    lastAssistantMessageAt: '2026-04-13T05:00:03.000+10:00',
    lastStopAt: null,
    lastTurnExecMs: 4321,
    lastUserPromptAt: nowIso
  });
});

test('idle gaps over one minute are shown to the user without adding the note to additionalContext', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-user-prompt-'));
  const nowIso = '2026-04-13T05:05:06.000+10:00';

  fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, 'sessions', 'session-1.json'),
    JSON.stringify(
      {
        sessionId: 'session-1',
        lastStopAt: '2026-04-13T05:00:04.000+10:00',
        lastTurnExecMs: 4321,
        lastUserPromptAt: '2026-04-13T04:59:00.000+10:00'
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
  assert.deepEqual(parseHookOutput(result.stdout), {
    systemMessage: '[after 5m 2s]',
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: [
        '[timing]',
        'time=2026-04-13T05:05:06+10:00',
        'idle_for=302.0s',
        'last_turn=4.3s',
        '[/timing]'
      ].join('\n')
    }
  });
});

test('missing session_id exits 0 fail-soft with stderr and no state access', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-user-prompt-'));

  const result = await runUserPromptSubmit({
    input: {},
    dataDir,
    nowIso: '2026-04-13T05:00:10.000+10:00'
  });

  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /session_id is required/);
  assert.equal(fs.existsSync(path.join(dataDir, 'sessions')), false);
});

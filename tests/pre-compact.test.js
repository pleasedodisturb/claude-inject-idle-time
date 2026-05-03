const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const scriptPath = path.join(rootDir, 'scripts', 'pre-compact.js');

function runPreCompact({ input, dataDir, nowIso }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: rootDir,
      env: {
        ...process.env,
        ...(dataDir ? { CLAUDE_PLUGIN_DATA: dataDir } : {}),
        CLAUDE_TIMING_NOW_ISO: nowIso
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    child.stdin.end(JSON.stringify(input));
  });
}

test('pre-compact resets lastStopAt to now and clears captured model', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-precompact-'));
  const nowIso = '2026-04-17T12:00:00.000Z';

  fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, 'sessions', 'session-1.json'),
    JSON.stringify(
      {
        sessionId: 'session-1',
        lastStopAt: '2026-04-17T11:00:00.000Z',
        lastAssistantMessageAt: '2026-04-17T11:00:00.000Z',
        lastTurnExecMs: 1234,
        lastUserPromptAt: '2026-04-17T10:59:50.000Z',
        modelAtLastStop: 'claude-sonnet-4-6',
        modelAtLastStopAt: '2026-04-17T11:00:00.000Z'
      },
      null,
      2
    )
  );

  const result = await runPreCompact({
    input: { session_id: 'session-1' },
    dataDir,
    nowIso
  });

  assert.equal(result.code, 0, `expected success, stderr was: ${result.stderr}`);
  assert.equal(result.stdout, '');

  const statePath = path.join(dataDir, 'sessions', 'session-1.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath, 'utf8')), {
    sessionId: 'session-1',
    lastStopAt: nowIso,
    lastAssistantMessageAt: nowIso,
    lastTurnExecMs: 1234,
    lastUserPromptAt: '2026-04-17T10:59:50.000Z',
    modelAtLastStop: null,
    modelAtLastStopAt: null
  });
});

test('pre-compact creates session state when none exists', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-precompact-'));
  const nowIso = '2026-04-17T12:00:00.000Z';

  const result = await runPreCompact({
    input: { session_id: 'fresh-session' },
    dataDir,
    nowIso
  });

  assert.equal(result.code, 0, `expected success, stderr was: ${result.stderr}`);

  const statePath = path.join(dataDir, 'sessions', 'fresh-session.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath, 'utf8')), {
    sessionId: 'fresh-session',
    lastStopAt: nowIso,
    lastAssistantMessageAt: nowIso,
    modelAtLastStop: null,
    modelAtLastStopAt: null
  });
});

test('pre-compact exits 0 fail-soft when session_id is missing', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-precompact-'));

  const result = await runPreCompact({
    input: {},
    dataDir,
    nowIso: '2026-04-17T12:00:00.000Z'
  });

  assert.equal(result.code, 0);
  assert.match(result.stderr, /session_id is required/);
});

test('pre-compact exits 0 fail-soft when CLAUDE_PLUGIN_DATA is not set', async () => {
  const result = await runPreCompact({
    input: { session_id: 'session-1' },
    nowIso: '2026-04-17T12:00:00.000Z'
  });

  assert.equal(result.code, 0);
  assert.match(result.stderr, /CLAUDE_PLUGIN_DATA is required/);
});

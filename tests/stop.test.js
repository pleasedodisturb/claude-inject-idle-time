const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const scriptPath = path.join(rootDir, 'scripts', 'stop.js');

function runStop({ input, dataDir, nowIso }) {
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

test('stop records stop time, assistant time, and previous execution duration when lastUserPromptAt exists', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-stop-'));
  const nowIso = '2026-04-12T19:00:10.000Z';

  fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, 'sessions', 'session-1.json'),
    JSON.stringify(
      {
        sessionId: 'session-1',
        lastUserPromptAt: '2026-04-12T19:00:03.500Z',
        lastTurnExecMs: 1234
      },
      null,
      2
    )
  );

  const result = await runStop({
    input: { session_id: 'session-1' },
    dataDir,
    nowIso
  });

  assert.equal(result.code, 0, `expected success, stderr was: ${result.stderr}`);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');

  const statePath = path.join(dataDir, 'sessions', 'session-1.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath, 'utf8')), {
    sessionId: 'session-1',
    lastUserPromptAt: '2026-04-12T19:00:03.500Z',
    lastTurnExecMs: 6500,
    lastStopAt: nowIso,
    lastAssistantMessageAt: nowIso
  });
});

test('stop still records stop time and assistant time when no last prompt timestamp exists', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-stop-'));
  const nowIso = '2026-04-12T19:05:00.000Z';

  fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, 'sessions', 'session-1.json'),
    JSON.stringify(
      {
        sessionId: 'session-1',
        lastTurnExecMs: 1234
      },
      null,
      2
    )
  );

  const result = await runStop({
    input: { session_id: 'session-1' },
    dataDir,
    nowIso
  });

  assert.equal(result.code, 0, `expected success, stderr was: ${result.stderr}`);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');

  const statePath = path.join(dataDir, 'sessions', 'session-1.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath, 'utf8')), {
    sessionId: 'session-1',
    lastTurnExecMs: 1234,
    lastStopAt: nowIso,
    lastAssistantMessageAt: nowIso
  });
});

test('repeat stop for the same turn preserves the existing execution duration', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-stop-'));
  const firstStopIso = '2026-04-12T19:00:10.000Z';
  const secondStopIso = '2026-04-12T19:00:12.000Z';

  fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, 'sessions', 'session-1.json'),
    JSON.stringify(
      {
        sessionId: 'session-1',
        lastUserPromptAt: '2026-04-12T19:00:03.500Z'
      },
      null,
      2
    )
  );

  const firstResult = await runStop({
    input: { session_id: 'session-1' },
    dataDir,
    nowIso: firstStopIso
  });

  assert.equal(firstResult.code, 0, `expected success, stderr was: ${firstResult.stderr}`);
  assert.equal(firstResult.stdout, '');
  assert.equal(firstResult.stderr, '');

  const secondResult = await runStop({
    input: { session_id: 'session-1' },
    dataDir,
    nowIso: secondStopIso
  });

  assert.equal(secondResult.code, 0, `expected success, stderr was: ${secondResult.stderr}`);
  assert.equal(secondResult.stdout, '');
  assert.equal(secondResult.stderr, '');

  const statePath = path.join(dataDir, 'sessions', 'session-1.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath, 'utf8')), {
    sessionId: 'session-1',
    lastUserPromptAt: '2026-04-12T19:00:03.500Z',
    lastTurnExecMs: 6500,
    lastStopAt: secondStopIso,
    lastAssistantMessageAt: secondStopIso
  });
});

test('missing or falsy session_id fails with stderr and exit code 1', async () => {
  const cases = [{}, { session_id: '' }, { session_id: null }];

  for (const input of cases) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-stop-'));
    const result = await runStop({
      input,
      dataDir,
      nowIso: '2026-04-12T19:10:00.000Z'
    });

    assert.equal(result.code, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /session_id is required/);
    assert.equal(fs.existsSync(path.join(dataDir, 'sessions')), false);
  }
});

test('missing CLAUDE_PLUGIN_DATA fails with stderr and exit code 1', async () => {
  const result = await runStop({
    input: { session_id: 'session-1' },
    nowIso: '2026-04-12T19:10:00.000Z'
  });

  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /CLAUDE_PLUGIN_DATA is required/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { toIsoUtc, getNowIso, diffMs } = require('../src/time');
const { formatTimingBlock } = require('../src/format');
const { getSessionFilePath, loadSessionState, saveSessionState } = require('../src/state');

test('toIsoUtc normalizes a date-like value to UTC ISO 8601', () => {
  assert.equal(toIsoUtc('2026-04-12T18:34:56.789Z'), '2026-04-12T18:34:56.789Z');
});

test('getNowIso prefers the deterministic test override', () => {
  assert.equal(
    getNowIso({ CLAUDE_TIMING_NOW_ISO: '2026-04-12T18:34:56.789Z' }),
    '2026-04-12T18:34:56.789Z'
  );
});

test('diffMs returns null when either side is unavailable', () => {
  assert.equal(diffMs('2026-04-12T18:34:56.789Z', undefined), null);
  assert.equal(diffMs(undefined, '2026-04-12T18:34:56.789Z'), null);
});

test('diffMs returns whole millisecond deltas', () => {
  assert.equal(
    diffMs('2026-04-12T18:34:56.789Z', '2026-04-12T18:34:40.000Z'),
    16789
  );
});

test('diffMs returns null for malformed timestamps', () => {
  assert.equal(diffMs('not-a-timestamp', '2026-04-12T18:34:40.000Z'), null);
  assert.equal(diffMs('2026-04-12T18:34:56.789Z', 'not-a-timestamp'), null);
});

test('formatTimingBlock includes only available numeric fields', () => {
  const block = formatTimingBlock({
    userMessageUtc: '2026-04-12T18:34:56.789Z',
    idleSinceLastAssistantMs: null,
    idleSinceLastStopMs: 14890,
    lastTurnExecMs: 4321
  });

  assert.equal(
    block,
    [
      '[message_timing]',
      'user_message_utc: 2026-04-12T18:34:56.789Z',
      'idle_since_last_stop_ms: 14890',
      'last_turn_exec_ms: 4321',
      '[/message_timing]'
    ].join('\n')
  );
});

test('formatTimingBlock omits non-finite numeric fields', () => {
  const block = formatTimingBlock({
    userMessageUtc: '2026-04-12T18:34:56.789Z',
    idleSinceLastAssistantMs: Number.NaN,
    idleSinceLastStopMs: Number.POSITIVE_INFINITY,
    lastTurnExecMs: 4321
  });

  assert.equal(
    block,
    [
      '[message_timing]',
      'user_message_utc: 2026-04-12T18:34:56.789Z',
      'last_turn_exec_ms: 4321',
      '[/message_timing]'
    ].join('\n')
  );
});

test('loadSessionState returns a default object when the session is new', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-core-'));

  const state = await loadSessionState({ dataDir, sessionId: 'session-1' });

  assert.deepEqual(state, { sessionId: 'session-1' });
});

test('getSessionFilePath keeps session files inside the sessions directory', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-core-'));
  const filePath = getSessionFilePath(dataDir, '../session-1');

  assert.equal(path.dirname(filePath), path.join(dataDir, 'sessions'));
  assert.equal(filePath, path.join(dataDir, 'sessions', '.._session-1.json'));
});

test('saveSessionState persists a session record that can be loaded again', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-core-'));

  await saveSessionState({
    dataDir,
    sessionId: 'session-1',
    state: {
      lastUserPromptAt: '2026-04-12T18:34:56.789Z',
      lastTurnExecMs: 4321
    }
  });

  const filePath = getSessionFilePath(dataDir, 'session-1');
  assert.ok(fs.existsSync(filePath), 'expected persisted state file to exist');

  const reloaded = await loadSessionState({ dataDir, sessionId: 'session-1' });
  assert.deepEqual(reloaded, {
    sessionId: 'session-1',
    lastUserPromptAt: '2026-04-12T18:34:56.789Z',
    lastTurnExecMs: 4321
  });

  const sessionDirEntries = fs.readdirSync(path.join(dataDir, 'sessions'));
  assert.deepEqual(sessionDirEntries, ['session-1.json']);
});

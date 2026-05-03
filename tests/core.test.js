const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { toIsoUtc, toLocalIso, getNowIso, stripMs, diffMs } = require('../src/time');
const { formatIdleSystemMessage, formatTimingBlock } = require('../src/format');
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
    userMessageTime: '2026-04-13T04:34:56.789+10:00',
    idleSinceLastAssistantMs: null,
    idleSinceLastStopMs: 14890,
    lastTurnExecMs: 4321
  });

  assert.equal(
    block,
    [
      '[timing]',
      'time=2026-04-13T04:34:56+10:00',
      'idle_for=14.9s',
      'last_turn=4.3s',
      '[/timing]'
    ].join('\n')
  );
});

test('formatTimingBlock omits non-finite numeric fields', () => {
  const block = formatTimingBlock({
    userMessageTime: '2026-04-13T04:34:56.789+10:00',
    idleSinceLastAssistantMs: Number.NaN,
    idleSinceLastStopMs: Number.POSITIVE_INFINITY,
    lastTurnExecMs: 4321
  });

  assert.equal(
    block,
    [
      '[timing]',
      'time=2026-04-13T04:34:56+10:00',
      'last_turn=4.3s',
      '[/timing]'
    ].join('\n')
  );
});

test('stripMs drops fractional seconds while preserving Z or offset suffix', () => {
  assert.equal(stripMs('2026-04-13T04:34:56.789+10:00'), '2026-04-13T04:34:56+10:00');
  assert.equal(stripMs('2026-04-13T04:34:56.789Z'), '2026-04-13T04:34:56Z');
  assert.equal(stripMs('2026-04-13T04:34:56+10:00'), '2026-04-13T04:34:56+10:00');
});

test('toLocalIso emits explicit offset and millisecond precision', () => {
  const fakeDate = {
    getFullYear: () => 2026,
    getMonth: () => 3,
    getDate: () => 13,
    getHours: () => 4,
    getMinutes: () => 34,
    getSeconds: () => 56,
    getMilliseconds: () => 789,
    getTimezoneOffset: () => -600
  };
  assert.equal(toLocalIso(fakeDate), '2026-04-13T04:34:56.789+10:00');

  const negativeOffset = { ...fakeDate, getTimezoneOffset: () => 300 };
  assert.equal(toLocalIso(negativeOffset), '2026-04-13T04:34:56.789-05:00');
});

test('formatIdleSystemMessage returns a minimal bracketed note after 10 seconds', () => {
  assert.equal(formatIdleSystemMessage(11000), '[after 11s]');
  assert.equal(formatIdleSystemMessage(63000), '[after 1m 3s]');
  assert.equal(formatIdleSystemMessage(302000), '[after 5m 2s]');
});

test('formatIdleSystemMessage omits short or unavailable idle gaps', () => {
  assert.equal(formatIdleSystemMessage(10000), null);
  assert.equal(formatIdleSystemMessage(9999), null);
  assert.equal(formatIdleSystemMessage(null), null);
  assert.equal(formatIdleSystemMessage(Number.NaN), null);
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

test('loadSessionState recovers from a corrupt JSON file by quarantining it and returning fresh state', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-core-'));
  const filePath = getSessionFilePath(dataDir, 'session-1');

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '{"sessionId": "session-1", "lastStopAt": "2026-04-12');

  const state = await loadSessionState({ dataDir, sessionId: 'session-1' });

  assert.deepEqual(state, { sessionId: 'session-1' });
  assert.equal(fs.existsSync(filePath), false);
  assert.equal(fs.existsSync(`${filePath}.corrupt`), true);
});

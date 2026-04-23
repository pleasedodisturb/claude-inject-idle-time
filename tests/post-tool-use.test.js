const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'post-tool-use.js');

function runHook(dataDir, sessionId, toolName) {
  const input = JSON.stringify({ session_id: sessionId, tool_name: toolName });

  execFileSync('node', [SCRIPT_PATH], {
    input,
    env: {
      ...process.env,
      CLAUDE_PLUGIN_DATA: dataDir,
      CLAUDE_TIMING_NOW_ISO: '2026-04-20T10:30:00.000+02:00'
    },
    timeout: 5000
  });
}

test('post-tool-use creates timeline JSONL on first call', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-ptu-'));

  runHook(dataDir, 'session-1', 'Bash');

  const timelineFile = path.join(dataDir, 'timelines', 'session-1.jsonl');
  assert.ok(fs.existsSync(timelineFile), 'timeline file should exist');

  const lines = fs.readFileSync(timelineFile, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);

  const event = JSON.parse(lines[0]);
  assert.equal(event.tool, 'Bash');
  assert.equal(event.event, 'tool_complete');
  assert.ok(event.timestamp);
});

test('post-tool-use appends multiple events to same session', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-ptu-'));

  runHook(dataDir, 'session-2', 'Read');
  runHook(dataDir, 'session-2', 'Edit');
  runHook(dataDir, 'session-2', 'Bash');

  const timelineFile = path.join(dataDir, 'timelines', 'session-2.jsonl');
  const lines = fs.readFileSync(timelineFile, 'utf8').trim().split('\n');
  assert.equal(lines.length, 3);

  const tools = lines.map((l) => JSON.parse(l).tool);
  assert.deepEqual(tools, ['Read', 'Edit', 'Bash']);
});

test('post-tool-use isolates sessions into separate files', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-ptu-'));

  runHook(dataDir, 'session-a', 'Bash');
  runHook(dataDir, 'session-b', 'Read');

  const fileA = path.join(dataDir, 'timelines', 'session-a.jsonl');
  const fileB = path.join(dataDir, 'timelines', 'session-b.jsonl');

  assert.ok(fs.existsSync(fileA));
  assert.ok(fs.existsSync(fileB));

  assert.equal(JSON.parse(fs.readFileSync(fileA, 'utf8').trim()).tool, 'Bash');
  assert.equal(JSON.parse(fs.readFileSync(fileB, 'utf8').trim()).tool, 'Read');
});

test('post-tool-use sanitizes session IDs in filenames', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-ptu-'));

  runHook(dataDir, '../evil-session', 'Bash');

  const timelineFile = path.join(dataDir, 'timelines', '.._evil-session.jsonl');
  assert.ok(fs.existsSync(timelineFile), 'sanitized filename should exist');
});

test('post-tool-use defaults tool name to unknown', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-timing-ptu-'));
  const input = JSON.stringify({ session_id: 'session-x' });

  execFileSync('node', [SCRIPT_PATH], {
    input,
    env: { ...process.env, CLAUDE_PLUGIN_DATA: dataDir },
    timeout: 5000
  });

  const timelineFile = path.join(dataDir, 'timelines', 'session-x.jsonl');
  const event = JSON.parse(fs.readFileSync(timelineFile, 'utf8').trim());
  assert.equal(event.tool, 'unknown');
});

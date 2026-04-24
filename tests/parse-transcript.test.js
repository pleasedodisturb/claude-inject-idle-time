const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'parse-transcript.py');

function createFakeTranscript(lines) {
  // Create inside ~/.claude/projects/ so validation passes
  const claudeProjects = path.join(os.homedir(), '.claude', 'projects');
  const testDir = path.join(claudeProjects, 'test-parse-transcript');

  fs.mkdirSync(testDir, { recursive: true });

  const filePath = path.join(testDir, 'test-session.jsonl');

  fs.writeFileSync(filePath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');

  return filePath;
}

function runParser(transcriptPath, count) {
  const args = [SCRIPT_PATH, transcriptPath];

  if (count !== undefined) {
    args.push(String(count));
  }

  return execFileSync('python3', args, {
    encoding: 'utf8',
    timeout: 5000
  });
}

test('parse-transcript shows user and assistant messages with timestamps', () => {
  const transcriptPath = createFakeTranscript([
    {
      type: 'user',
      timestamp: '2026-04-23T18:00:00Z',
      message: { content: [{ type: 'text', text: 'Hello Claude' }] }
    },
    {
      type: 'assistant',
      timestamp: '2026-04-23T18:00:05Z',
      message: { content: [{ type: 'text', text: 'Hi there!' }] }
    }
  ]);

  const output = runParser(transcriptPath);

  assert.match(output, /Message Timeline/);
  assert.match(output, /You.*Hello Claude/);
  assert.match(output, /Claude.*Hi there!/);
  assert.match(output, /Showing 2 of 2 messages/);

  fs.unlinkSync(transcriptPath);
});

test('parse-transcript respects count argument', () => {
  const transcriptPath = createFakeTranscript([
    { type: 'user', timestamp: '2026-04-23T18:00:00Z', message: { content: [{ type: 'text', text: 'msg 1' }] } },
    { type: 'user', timestamp: '2026-04-23T18:01:00Z', message: { content: [{ type: 'text', text: 'msg 2' }] } },
    { type: 'user', timestamp: '2026-04-23T18:02:00Z', message: { content: [{ type: 'text', text: 'msg 3' }] } }
  ]);

  const output = runParser(transcriptPath, 2);

  assert.match(output, /Showing 2 of 3 messages/);
  assert.match(output, /msg 2/);
  assert.match(output, /msg 3/);
  assert.ok(!output.includes('msg 1'), 'should not include oldest message');

  fs.unlinkSync(transcriptPath);
});

test('parse-transcript shows tool use entries', () => {
  const transcriptPath = createFakeTranscript([
    {
      type: 'assistant',
      timestamp: '2026-04-23T18:00:00Z',
      message: { content: [{ type: 'tool_use', name: 'Read' }] }
    }
  ]);

  const output = runParser(transcriptPath);

  assert.match(output, /\[tool: Read\]/);

  fs.unlinkSync(transcriptPath);
});

test('parse-transcript skips non-message entries', () => {
  const transcriptPath = createFakeTranscript([
    { type: 'system', timestamp: '2026-04-23T18:00:00Z', message: { content: 'system msg' } },
    { type: 'user', timestamp: '2026-04-23T18:00:01Z', message: { content: [{ type: 'text', text: 'real msg' }] } }
  ]);

  const output = runParser(transcriptPath);

  assert.match(output, /Showing 1 of 1 messages/);

  fs.unlinkSync(transcriptPath);
});

test('parse-transcript rejects paths outside ~/.claude/projects/', () => {
  const tmpFile = path.join(os.tmpdir(), 'fake.jsonl');

  fs.writeFileSync(tmpFile, '{}');

  assert.throws(() => runParser(tmpFile), /Error/);

  fs.unlinkSync(tmpFile);
});

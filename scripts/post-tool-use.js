#!/usr/bin/env node

/**
 * PostToolUse hook — logs every tool call to a per-session JSONL timeline.
 *
 * Claude can read this file to reconstruct a complete history of what
 * happened during the session, with timestamps and durations.
 */

'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { getNowIso } = require('../src/time');

async function readStdin() {
  let input = '';

  for await (const chunk of process.stdin) {
    input += chunk;
  }

  return input;
}

function sanitizeSessionId(sessionId) {
  return String(sessionId).replace(/[^A-Za-z0-9._-]/g, '_');
}

async function main() {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;

  if (!dataDir) {
    throw new Error('CLAUDE_PLUGIN_DATA is required');
  }

  const rawInput = await readStdin();
  const hookInput = JSON.parse(rawInput || '{}');
  const sessionId = hookInput.session_id;

  if (!sessionId) {
    throw new Error('session_id is required');
  }

  const toolName = hookInput.tool_name || 'unknown';
  const now = getNowIso();
  const timelineDir = path.join(dataDir, 'timelines');

  await fs.mkdir(timelineDir, { recursive: true });

  const timelineFile = path.join(
    timelineDir,
    `${sanitizeSessionId(sessionId)}.jsonl`
  );
  const event = {
    timestamp: now,
    tool: toolName,
    event: 'tool_complete'
  };

  await fs.appendFile(timelineFile, JSON.stringify(event) + '\n');
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error.message}\n`);
  process.exit(1);
});

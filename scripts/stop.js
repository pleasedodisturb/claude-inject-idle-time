#!/usr/bin/env node

const { loadSessionState, saveSessionState } = require('../src/state');
const { getNowIso, diffMs } = require('../src/time');

async function readStdin() {
  let input = '';

  for await (const chunk of process.stdin) {
    input += chunk;
  }

  return input;
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

  const lastStopAt = getNowIso();
  const session = await loadSessionState({ dataDir, sessionId });
  const lastTurnExecMs = session.lastStopAt ? null : diffMs(lastStopAt, session.lastUserPromptAt);

  const nextState = {
    ...session,
    lastStopAt,
    lastAssistantMessageAt: lastStopAt
  };

  if (typeof lastTurnExecMs === 'number') {
    nextState.lastTurnExecMs = lastTurnExecMs;
  }

  await saveSessionState({
    dataDir,
    sessionId,
    state: nextState
  });
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error.message}\n`);
  process.exit(0);
});

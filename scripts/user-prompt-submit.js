#!/usr/bin/env node

const { formatTimingBlock } = require('../src/format');
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

  const userMessageUtc = getNowIso();
  const session = await loadSessionState({ dataDir, sessionId });

  await saveSessionState({
    dataDir,
    sessionId,
    state: {
      ...session,
      lastUserPromptAt: userMessageUtc,
      lastStopAt: null
    }
  });

  const additionalContext = formatTimingBlock({
    userMessageUtc,
    idleSinceLastAssistantMs: diffMs(userMessageUtc, session.lastAssistantMessageAt),
    idleSinceLastStopMs: diffMs(userMessageUtc, session.lastStopAt),
    lastTurnExecMs: session.lastTurnExecMs
  });

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext
      }
    })
  );
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error.message}\n`);
  process.exit(1);
});

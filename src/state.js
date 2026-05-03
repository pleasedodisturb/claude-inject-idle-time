const fs = require('node:fs/promises');
const path = require('node:path');

function sanitizeSessionId(sessionId) {
  return String(sessionId).replace(/[^A-Za-z0-9._-]/g, '_');
}

function getSessionFilePath(dataDir, sessionId) {
  return path.join(dataDir, 'sessions', `${sanitizeSessionId(sessionId)}.json`);
}

async function loadSessionState({ dataDir, sessionId }) {
  const filePath = getSessionFilePath(dataDir, sessionId);

  let raw;

  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { sessionId };
    }

    throw error;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      try {
        await fs.rename(filePath, `${filePath}.corrupt`);
      } catch (renameError) {
        // best-effort: ignore failure to quarantine the corrupt file
      }
      return { sessionId };
    }

    throw error;
  }
}

async function saveSessionState({ dataDir, sessionId, state }) {
  const filePath = getSessionFilePath(dataDir, sessionId);
  const nextState = { sessionId, ...state };
  const tempFilePath = `${filePath}.tmp`;

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tempFilePath, JSON.stringify(nextState, null, 2));
  await fs.rename(tempFilePath, filePath);

  return nextState;
}

module.exports = {
  getSessionFilePath,
  loadSessionState,
  saveSessionState
};

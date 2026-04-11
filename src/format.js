function appendNumberLine(lines, name, value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    lines.push(`${name}: ${value}`);
  }
}

function formatTimingBlock({
  userMessageUtc,
  idleSinceLastAssistantMs,
  idleSinceLastStopMs,
  lastTurnExecMs
}) {
  const lines = ['[message_timing]', `user_message_utc: ${userMessageUtc}`];

  appendNumberLine(lines, 'idle_since_last_assistant_ms', idleSinceLastAssistantMs);
  appendNumberLine(lines, 'idle_since_last_stop_ms', idleSinceLastStopMs);
  appendNumberLine(lines, 'last_turn_exec_ms', lastTurnExecMs);

  lines.push('[/message_timing]');
  return lines.join('\n');
}

module.exports = {
  formatTimingBlock
};

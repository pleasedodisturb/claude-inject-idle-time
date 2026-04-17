function formatElapsed(valueMs, { dropSecondsAfterSeconds }) {
  if (
    typeof valueMs !== 'number' ||
    !Number.isFinite(valueMs) ||
    valueMs < 0
  ) {
    return null;
  }

  const totalSeconds = Math.floor(valueMs / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);

  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  }

  if (totalSeconds >= dropSecondsAfterSeconds) {
    return `${totalMinutes}m`;
  }

  const seconds = totalSeconds % 60;
  return `${totalMinutes}m ${seconds}s`;
}

module.exports = { formatElapsed };

function toIsoUtc(value) {
  return new Date(value).toISOString();
}

function getNowIso(env = process.env, nowFactory = () => new Date()) {
  return env.CLAUDE_TIMING_NOW_ISO || nowFactory().toISOString();
}

function diffMs(laterIso, earlierIso) {
  if (!laterIso || !earlierIso) {
    return null;
  }

  const laterMs = Date.parse(laterIso);
  const earlierMs = Date.parse(earlierIso);

  if (!Number.isFinite(laterMs) || !Number.isFinite(earlierMs)) {
    return null;
  }

  return laterMs - earlierMs;
}

module.exports = {
  toIsoUtc,
  getNowIso,
  diffMs
};

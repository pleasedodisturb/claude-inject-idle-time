const test = require('node:test');
const assert = require('node:assert/strict');

const { formatElapsed } = require('../src/duration');

const DEFAULT_OPTS = { dropSecondsAfterSeconds: 900 };

test('formatElapsed returns null for null or non-finite input', () => {
  assert.equal(formatElapsed(null, DEFAULT_OPTS), null);
  assert.equal(formatElapsed(undefined, DEFAULT_OPTS), null);
  assert.equal(formatElapsed(Number.NaN, DEFAULT_OPTS), null);
  assert.equal(formatElapsed(Number.POSITIVE_INFINITY, DEFAULT_OPTS), null);
});

test('formatElapsed returns null for negative elapsed (clock skew)', () => {
  assert.equal(formatElapsed(-1, DEFAULT_OPTS), null);
});

test('formatElapsed under 60 seconds shows seconds only', () => {
  assert.equal(formatElapsed(0, DEFAULT_OPTS), '0s');
  assert.equal(formatElapsed(999, DEFAULT_OPTS), '0s');
  assert.equal(formatElapsed(1000, DEFAULT_OPTS), '1s');
  assert.equal(formatElapsed(45_000, DEFAULT_OPTS), '45s');
  assert.equal(formatElapsed(59_999, DEFAULT_OPTS), '59s');
});

test('formatElapsed between 60s and drop-seconds-after shows minutes and seconds', () => {
  assert.equal(formatElapsed(60_000, DEFAULT_OPTS), '1m 0s');
  assert.equal(formatElapsed(201_500, DEFAULT_OPTS), '3m 21s');
  assert.equal(formatElapsed(899_000, DEFAULT_OPTS), '14m 59s');
});

test('formatElapsed at or above drop-seconds-after under an hour drops seconds', () => {
  assert.equal(formatElapsed(900_000, DEFAULT_OPTS), '15m');
  assert.equal(formatElapsed(1_020_000, DEFAULT_OPTS), '17m');
  assert.equal(formatElapsed(3_599_000, DEFAULT_OPTS), '59m');
});

test('formatElapsed at or above one hour shows hours and minutes only', () => {
  assert.equal(formatElapsed(3_600_000, DEFAULT_OPTS), '1h 0m');
  assert.equal(formatElapsed(5_000_000, DEFAULT_OPTS), '1h 23m');
  assert.equal(formatElapsed(36_060_000, DEFAULT_OPTS), '10h 1m');
});

test('formatElapsed honors a custom dropSecondsAfterSeconds threshold', () => {
  // sub-60s always formats as seconds, regardless of threshold
  assert.equal(formatElapsed(30_000, { dropSecondsAfterSeconds: 10 }), '30s');
  // at/above threshold (and >= 60s) drops seconds
  assert.equal(formatElapsed(60_000, { dropSecondsAfterSeconds: 30 }), '1m');
  assert.equal(formatElapsed(120_000, { dropSecondsAfterSeconds: 30 }), '2m');
});

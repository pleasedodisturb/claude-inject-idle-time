#!/usr/bin/env node

/**
 * MCP time-awareness server — exposes active time query tools.
 *
 * Complements the plugin's passive hook-based timing injection with tools
 * Claude can call on demand: get current time, compute durations, mark
 * named events, and retrieve a session timeline.
 *
 * Zero runtime dependencies — hand-rolled JSON-RPC 2.0 over stdio.
 */

'use strict';

const { getNowIso, diffMs, toLocalIso } = require('../src/time');
const { formatElapsed } = require('../src/duration');

const SERVER_INFO = { name: 'idle-timing-time-server', version: '0.4.0' };
const DROP_SECONDS_AFTER = 900;

// In-memory event log (session-scoped, resets on server restart)
const eventLog = [];

// --- Tool definitions ---

const TOOLS = [
  {
    name: 'get_time',
    description: 'Get the current time as structured data — ISO timestamp, unix epoch, and timezone.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'time_diff',
    description: 'Compute the duration between two ISO timestamps. Returns human-readable and machine-readable durations.',
    inputSchema: {
      type: 'object',
      properties: {
        start: { type: 'string', description: 'ISO 8601 timestamp (start)' },
        end: { type: 'string', description: 'ISO 8601 timestamp (end)' }
      },
      required: ['start', 'end']
    }
  },
  {
    name: 'mark_event',
    description: 'Record a named event with the current timestamp. Use to build a session timeline.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "Event name, e.g. 'build_started' or 'tests_passed'" }
      },
      required: ['name']
    }
  },
  {
    name: 'get_timeline',
    description: 'Get all recorded events with durations between them.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  }
];

// --- Tool handlers ---

function handleGetTime() {
  const now = new Date();

  return JSON.stringify({
    iso: toLocalIso(now),
    utc: now.toISOString(),
    unix_ms: now.getTime(),
    unix_s: Math.floor(now.getTime() / 1000),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    offset_minutes: now.getTimezoneOffset()
  });
}

function handleTimeDiff({ start, end }) {
  const diffResult = diffMs(end, start);

  if (diffResult === null) {
    return JSON.stringify({ error: 'Invalid timestamp(s)' });
  }

  return JSON.stringify({
    start,
    end,
    diff_ms: diffResult,
    diff_seconds: diffResult / 1000,
    human: formatElapsed(Math.abs(diffResult), { dropSecondsAfterSeconds: DROP_SECONDS_AFTER }) || '0s',
    direction: diffResult >= 0 ? 'forward' : 'backward'
  });
}

function handleMarkEvent({ name }) {
  const now = new Date();
  const event = {
    name,
    iso: toLocalIso(now),
    unix_ms: now.getTime(),
    index: eventLog.length
  };

  eventLog.push(event);

  const prev = eventLog.length > 1 ? eventLog[eventLog.length - 2] : null;
  const sincePrevMs = prev ? now.getTime() - prev.unix_ms : null;

  return JSON.stringify({
    ...event,
    since_prev_ms: sincePrevMs,
    since_prev_human: sincePrevMs !== null
      ? formatElapsed(sincePrevMs, { dropSecondsAfterSeconds: DROP_SECONDS_AFTER })
      : null,
    total_events: eventLog.length
  });
}

function handleGetTimeline() {
  if (eventLog.length === 0) {
    return JSON.stringify({
      events: [],
      message: 'No events recorded yet. Use mark_event to start tracking.'
    });
  }

  const timeline = eventLog.map((event, i) => {
    const prev = i > 0 ? eventLog[i - 1] : null;
    const sincePrevMs = prev ? event.unix_ms - prev.unix_ms : null;

    return {
      ...event,
      since_prev_ms: sincePrevMs,
      since_prev_human: sincePrevMs !== null
        ? formatElapsed(sincePrevMs, { dropSecondsAfterSeconds: DROP_SECONDS_AFTER })
        : null
    };
  });

  const totalMs = eventLog[eventLog.length - 1].unix_ms - eventLog[0].unix_ms;

  return JSON.stringify({
    events: timeline,
    total_duration_ms: totalMs,
    total_duration_human: formatElapsed(totalMs, { dropSecondsAfterSeconds: DROP_SECONDS_AFTER }) || '0s',
    event_count: eventLog.length
  });
}

const HANDLERS = {
  get_time: handleGetTime,
  time_diff: handleTimeDiff,
  mark_event: handleMarkEvent,
  get_timeline: handleGetTimeline
};

// --- JSON-RPC 2.0 server over stdio ---

function makeResponse(id, result) {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function makeError(id, code, message) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

function handleMessage(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    return makeResponse(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO
    });
  }

  if (method === 'notifications/initialized') {
    return null; // notification, no response
  }

  if (method === 'tools/list') {
    return makeResponse(id, { tools: TOOLS });
  }

  if (method === 'tools/call') {
    const toolName = params && params.name;
    const handler = HANDLERS[toolName];

    if (!handler) {
      return makeResponse(id, {
        content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${toolName}` }) }],
        isError: true
      });
    }

    const text = handler(params.arguments || {});

    return makeResponse(id, {
      content: [{ type: 'text', text }]
    });
  }

  if (method === 'ping') {
    return makeResponse(id, {});
  }

  // Unknown method
  if (id !== undefined) {
    return makeError(id, -32601, `Method not found: ${method}`);
  }

  return null;
}

// --- stdio transport ---

let buffer = '';

process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');

  buffer = lines.pop();

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    try {
      const msg = JSON.parse(line);
      const response = handleMessage(msg);

      if (response !== null) {
        process.stdout.write(response + '\n');
      }
    } catch (err) {
      process.stderr.write(`Parse error: ${err.message}\n`);
    }
  }
});

process.stdin.on('end', () => {
  process.exit(0);
});

process.stderr.write(`${SERVER_INFO.name} v${SERVER_INFO.version} running on stdio\n`);

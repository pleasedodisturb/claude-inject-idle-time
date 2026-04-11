const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

test('plugin manifest describes the idle timing plugin', () => {
  const manifestPath = path.join(rootDir, '.claude-plugin', 'plugin.json');

  assert.ok(fs.existsSync(manifestPath), 'expected plugin manifest to exist');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.name, 'idle-timing');
  assert.match(manifest.description, /timing context/i);
  assert.equal(typeof manifest.version, 'string');
  assert.notEqual(manifest.version, '');
});

test('hook config registers UserPromptSubmit and Stop handlers', () => {
  const hooksPath = path.join(rootDir, 'hooks', 'hooks.json');
  const userPromptScriptPath = path.join(rootDir, 'scripts', 'user-prompt-submit.js');
  const stopScriptPath = path.join(rootDir, 'scripts', 'stop.js');

  assert.ok(fs.existsSync(hooksPath), 'expected hook config to exist');
  assert.ok(fs.existsSync(userPromptScriptPath), 'expected UserPromptSubmit hook script to exist');
  assert.ok(fs.existsSync(stopScriptPath), 'expected Stop hook script to exist');

  const config = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  const userPromptHook = config.hooks.UserPromptSubmit[0].hooks[0];
  const stopHook = config.hooks.Stop[0].hooks[0];

  assert.equal(userPromptHook.type, 'command');
  assert.equal(stopHook.type, 'command');

  assert.equal(
    userPromptHook.command,
    'node ${CLAUDE_PLUGIN_ROOT}/scripts/user-prompt-submit.js'
  );
  assert.equal(stopHook.command, 'node ${CLAUDE_PLUGIN_ROOT}/scripts/stop.js');
});

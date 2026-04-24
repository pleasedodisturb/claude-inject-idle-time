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

test('hook config registers UserPromptSubmit, Stop, and PreCompact handlers', () => {
  const hooksPath = path.join(rootDir, 'hooks', 'hooks.json');
  const userPromptScriptPath = path.join(rootDir, 'scripts', 'user-prompt-submit.js');
  const stopScriptPath = path.join(rootDir, 'scripts', 'stop.js');
  const preCompactScriptPath = path.join(rootDir, 'scripts', 'pre-compact.js');

  assert.ok(fs.existsSync(hooksPath), 'expected hook config to exist');
  assert.ok(fs.existsSync(userPromptScriptPath), 'expected UserPromptSubmit hook script to exist');
  assert.ok(fs.existsSync(stopScriptPath), 'expected Stop hook script to exist');
  assert.ok(fs.existsSync(preCompactScriptPath), 'expected PreCompact hook script to exist');

  const config = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  const userPromptHook = config.hooks.UserPromptSubmit[0].hooks[0];
  const stopHook = config.hooks.Stop[0].hooks[0];
  const preCompactHook = config.hooks.PreCompact[0].hooks[0];

  assert.equal(userPromptHook.type, 'command');
  assert.equal(stopHook.type, 'command');
  assert.equal(preCompactHook.type, 'command');

  assert.equal(
    userPromptHook.command,
    'node ${CLAUDE_PLUGIN_ROOT}/scripts/user-prompt-submit.js'
  );
  assert.equal(stopHook.command, 'node ${CLAUDE_PLUGIN_ROOT}/scripts/stop.js');
  assert.equal(
    preCompactHook.command,
    'node ${CLAUDE_PLUGIN_ROOT}/scripts/pre-compact.js'
  );
});

test('repo can act as a local marketplace for installing this plugin', () => {
  const marketplacePath = path.join(rootDir, '.claude-plugin', 'marketplace.json');

  assert.ok(fs.existsSync(marketplacePath), 'expected marketplace manifest to exist');

  const marketplace = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
  assert.equal(marketplace.name, 'idle-info');
  assert.equal(marketplace.owner.name, 'clankercode');
  assert.ok(marketplace.plugins.length >= 1, 'expected at least one plugin entry');
  const entry = marketplace.plugins[0];
  assert.equal(entry.name, 'idle-timing');
  assert.equal(entry.source, './');
});

test('hook config registers PostToolUse handler for session timeline', () => {
  const hooksPath = path.join(rootDir, 'hooks', 'hooks.json');
  const postToolScriptPath = path.join(rootDir, 'scripts', 'post-tool-use.js');

  assert.ok(fs.existsSync(postToolScriptPath), 'expected PostToolUse hook script to exist');

  const config = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  const postToolHook = config.hooks.PostToolUse[0].hooks[0];

  assert.equal(postToolHook.type, 'command');
  assert.equal(
    postToolHook.command,
    'node ${CLAUDE_PLUGIN_ROOT}/scripts/post-tool-use.js'
  );
});

test('MCP server config and time-server script exist', () => {
  const mcpConfigPath = path.join(rootDir, '.mcp.json');
  const serverPath = path.join(rootDir, 'servers', 'time-server.js');

  assert.ok(fs.existsSync(mcpConfigPath), 'expected .mcp.json to exist');
  assert.ok(fs.existsSync(serverPath), 'expected time-server.js to exist');

  const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
  assert.ok(mcpConfig.mcpServers['time-tools'], 'expected time-tools server entry');
  assert.match(mcpConfig.mcpServers['time-tools'].args[0], /time-server\.js/);
});

test('statusline fragment script exists and is directly invocable', () => {
  const fragmentPath = path.join(rootDir, 'scripts', 'statusline-fragment.js');
  assert.ok(fs.existsSync(fragmentPath), 'expected statusline fragment script to exist');

  const source = fs.readFileSync(fragmentPath, 'utf8');
  assert.match(source, /loadSessionState/);
  assert.match(source, /formatElapsed/);
});

test('/timestamps slash command is registered', () => {
  const commandPath = path.join(rootDir, 'commands', 'timestamps.md');
  assert.ok(fs.existsSync(commandPath), 'expected slash command to exist');

  const contents = fs.readFileSync(commandPath, 'utf8');
  assert.match(contents, /^---/, 'expected frontmatter');
  assert.match(contents, /description:/);
  assert.match(contents, /parse-transcript\.py/);

  const scriptPath = path.join(rootDir, 'scripts', 'parse-transcript.py');
  assert.ok(fs.existsSync(scriptPath), 'expected parser script to exist');
});

test('/idle-time-setup slash command is registered', () => {
  const commandPath = path.join(rootDir, 'commands', 'idle-time-setup.md');
  assert.ok(fs.existsSync(commandPath), 'expected slash command to exist');

  const contents = fs.readFileSync(commandPath, 'utf8');
  assert.match(contents, /^---/, 'expected frontmatter');
  assert.match(contents, /description:/);
  assert.match(contents, /statusline-fragment\.js/);
  assert.match(contents, /refreshInterval/);
});

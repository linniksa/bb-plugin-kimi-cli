import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusCommand } from './cli.ts';
import { diagnosticsSchema } from './contract.ts';
import { pluginUpdateHint } from './diagnostics.ts';

const diagnostic = diagnosticsSchema.parse({
  health: { supported: true, health: { status: 'ready', accountEmail: null, planLabel: null, statusMessage: null, installedVersion: '2.2.0', minimumSupportedVersion: null, canInstall: false, canUpdate: true, loginCommand: 'kimi login', localLoginCommand: 'kimi login' } },
  installation: { executableName: 'kimi', executablePath: '/bin/kimi', installed: true, installSource: 'external', currentVersion: '2.2.0', latestVersion: null, minimumSupportedVersion: null, npmPackageName: null, npmGlobalPackageVersion: null, installAction: null, needsUpdate: false, versionUnsupported: false },
  kind: 'node', manager: 'native', hints: ['No automatic installation.'],
});

test('status CLI validates options and resolves one target host without changing anything', async () => {
  const sdk = {
    hosts: { list: async () => [{ id: 'h1', name: 'One', status: 'connected', type: 'local' }] },
    plugins: { getSource: async () => ({ requested: 'path:/checkout', resolved: 'path:/checkout', engines: {}, history: [] }) },
  } as unknown as Parameters<typeof statusCommand>[0];
  const calls: unknown[] = [];
  const command = statusCommand(sdk, { call: async (...args: unknown[]) => { calls.push(args); return diagnostic; } } as Parameters<typeof statusCommand>[1]);
  assert.equal((await command.run(['status', '--bogus'], {})).exitCode, 1);
  assert.equal(calls.length, 0);
  const result = await command.run(['status', '--machine', 'One', '--check-updates', '--json'], {});
  assert.equal(result.exitCode, 0, result.stderr);
  const output = JSON.parse(result.stdout!);
  assert.equal(output.hostId, 'h1');
  assert.ok(output.hints.some((h: string) => h.includes('local checkout')));
  assert.deepEqual(calls[0], ['inspect', { checkUpdates: true }, { hostId: 'h1', signal: undefined, timeoutMs: 30000 }]);
  const unknown = await command.run(['status', '--machine', 'missing', '--json'], {});
  assert.equal(unknown.exitCode, 1);
  assert.equal(calls.length, 1);
  assert.match(pluginUpdateHint('git:https://example.test/plugin@main'), /on request, not automatically/);
  assert.match(pluginUpdateHint('npm:example@1.0.0'), /pinned versions stay pinned/);
  const help = await command.run(['status', '--help'], {});
  assert.equal(help.exitCode, 0);
  assert.equal(calls.length, 1);
});

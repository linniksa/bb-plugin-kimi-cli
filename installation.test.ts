import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installationCommand, getInstallationStatus, getInstallationRun } from './installation.ts';

test('update commands stay with the original installation manager', () => {
  assert.deepEqual(installationCommand('python', 'brew', '/bin/kimi', '/bin/brew').args, ['upgrade', 'kimi-cli']);
  assert.deepEqual(installationCommand('node', 'brew', '/bin/kimi', '/bin/brew').args, ['upgrade', 'kimi-code']);
  assert.deepEqual(installationCommand('python', 'uv', '/bin/kimi', '/bin/uv').args, ['tool', 'upgrade', 'kimi-cli']);
  assert.deepEqual(installationCommand('node', 'npm', '/bin/kimi', '/bin/npm').args, ['install', '-g', '@moonshot-ai/kimi-code@latest']);
  assert.deepEqual(installationCommand('node', 'native', '/bin/kimi', '/bin/kimi').args, ['upgrade', '--yes']);
});

test('installation discovery, channel version checks, and stale actions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kimi-cli-install-'));
  const savedPath = process.env.PATH;
  const savedFetch = globalThis.fetch;
  const urls: string[] = [];
  const script = async (path: string, body: string) => writeFile(path, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  try {
    process.env.PATH = `${root}:/usr/bin:/bin`;
    globalThis.fetch = async input => { urls.push(String(input)); return Response.json({ version: '2.2.0', versions: { stable: '1.52.0' }, info: { version: '1.52.0' } }); };
    await script(join(root, 'npm'), 'exit 1');
    const missing = await getInstallationStatus(false);
    assert.equal(urls.length, 0);
    assert.equal(missing.installAction?.kind, 'install');
    const install = await getInstallationRun('install');
    assert.equal(install.available, true);
    if (!install.available) assert.fail();
    assert.deepEqual(install.command.args, ['install', '-g', '@moonshot-ai/kimi-code@latest']);

    const prefix = join(root, 'Cellar', 'kimi-cli', '1.50.0');
    await mkdir(join(prefix, 'bin'), { recursive: true });
    await writeFile(join(prefix, 'bin', 'kimi'), '#!/usr/bin/python3\nprint("Kimi Code 1.50.0")\n', { mode: 0o755 });
    await symlink(join(prefix, 'bin', 'kimi'), join(root, 'kimi'));
    const opt = join(root, 'opt');
    await symlink(prefix, opt);
    await script(join(root, 'brew'), `printf '%s\\n' '${opt}'`);
    const brew = await getInstallationStatus();
    assert.equal(brew.currentVersion, '1.50.0');
    assert.equal(brew.latestVersion, '1.52.0');
    assert.equal(brew.needsUpdate, true);
    assert.ok(brew.installAction?.command.endsWith('upgrade kimi-cli'));
    assert.ok(urls.at(-1)?.endsWith('/kimi-cli.json'));
    const update = await getInstallationRun('update');
    assert.equal(update.available, true);
    if (!update.available) assert.fail();
    assert.deepEqual(update.command.args, ['upgrade', 'kimi-cli']);
    assert.deepEqual(update.verification, { kind: 'version_at_least', version: '1.52.0' });
    assert.equal((await getInstallationRun('install')).available, false);
    globalThis.fetch = async () => Response.json({ versions: { stable: '1.50.0' } });
    assert.equal((await getInstallationRun('update')).available, false);
    await rm(join(root, 'brew'));
    assert.equal((await getInstallationStatus()).installAction, null);
    const tools = join(root, 'tools');
    await mkdir(join(tools, 'kimi-cli', 'bin'), { recursive: true });
    await writeFile(join(tools, 'kimi-cli', 'bin', 'kimi'), '#!/usr/bin/python3\nprint("Kimi Code 1.50.0")\n', { mode: 0o755 });
    await rm(join(root, 'kimi'));
    await symlink(join(tools, 'kimi-cli', 'bin', 'kimi'), join(root, 'kimi'));
    await script(join(root, 'uv'), `printf '%s\\n' '${tools}'`);
    globalThis.fetch = async () => Response.json({ info: { version: '1.52.0' } });
    const uv = await getInstallationRun('update');
    assert.equal(uv.available, true);
    if (!uv.available) assert.fail();
    assert.deepEqual(uv.command.args, ['tool', 'upgrade', 'kimi-cli']);

  } finally {
    process.env.PATH = savedPath;
    globalThis.fetch = savedFetch;
    await rm(root, { recursive: true, force: true });
  }
});

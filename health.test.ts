import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getHealth } from './health.ts';
import { inspectInstallation } from './installation.ts';

test('health stays local, read-only and credential-free for both CLI generations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kimi-health-'));
  const saved = { PATH: process.env.PATH, KIMI_CODE_HOME: process.env.KIMI_CODE_HOME, KIMI_SHARE_DIR: process.env.KIMI_SHARE_DIR };
  const fetch = globalThis.fetch;
  try {
    process.env.PATH = `${root}:/usr/bin:/bin`;
    process.env.KIMI_CODE_HOME = process.env.KIMI_SHARE_DIR = join(root, 'home');
    globalThis.fetch = async () => { assert.fail('Health must not contact any network service'); };
    const missing = await getHealth();
    assert.equal(missing.supported && missing.health.status, 'not_installed');
    await writeFile(join(root, 'kimi'), '#!/bin/sh\nprintf "Kimi Code 2.2.0\\n"\n', { mode: 0o755 });
    await mkdir(join(root, 'home', 'credentials'), { recursive: true });
    const found = await inspectInstallation(false);
    for (const kind of ['python', 'node'] as const) {
      const installed = { ...found, kind };
      assert.equal((await getHealth(installed)).supported, true);
      const config = '[providers."managed:kimi-code"]\nbase_url="https://api.kimi.com/coding/v1"\noauth={storage="file",key="oauth/test"}\n';
      await writeFile(join(root, 'home', 'config.toml'), config);
      const state = async () => { const result = await getHealth(installed); return result.supported ? result.health.status : 'unsupported'; };
      await rm(join(root, 'home', 'credentials', 'test.json'), { force: true });
      assert.equal(await state(), 'unauthenticated');
      const credentials = JSON.stringify({ access_token: 'never-emit-this-secret', expires_at: Date.now() / 1000 + 3600 });
      await writeFile(join(root, 'home', 'credentials', 'test.json'), credentials);
      const health = await getHealth(installed);
      assert.equal(health.supported && health.health.status, 'ready');
      assert.equal(JSON.stringify(health).includes('never-emit-this-secret'), false);
      assert.equal(await readFile(join(root, 'home', 'credentials', 'test.json'), 'utf8'), credentials);
      await writeFile(join(root, 'home', 'credentials', 'test.json'), JSON.stringify({ access_token: 'never-emit-this-secret', expires_at: 1 }));
      assert.equal(await state(), 'expired');
      await writeFile(join(root, 'home', 'config.toml'), config.replace('storage="file"', 'storage="keyring"'));
      assert.equal(await state(), kind === 'python' ? 'expired' : 'unknown');
      await rm(join(root, 'home', 'credentials', 'test.json'));
      assert.equal(await state(), 'unknown');
      await writeFile(join(root, 'home', 'config.toml'), config.replace('https://api.kimi.com/coding/v1', 'https://untrusted.example'));
      assert.equal(await state(), 'unknown');
      await writeFile(join(root, 'home', 'config.toml'), '[broken');
      assert.equal(await state(), 'unknown');
    }
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    globalThis.fetch = fetch;
    await rm(root, { recursive: true, force: true });
  }
});

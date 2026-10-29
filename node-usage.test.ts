import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectNodeUsage } from './node-usage.ts';

test('modern credentials stay local and optional profile failures retain quota', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kimi-cli-node-'));
  const savedHome = process.env.KIMI_CODE_HOME;
  const savedFetch = globalThis.fetch;
  const calls: string[] = [];
  const config = '[providers."managed:kimi-code"]\nbase_url = "https://api.kimi.ai/coding/v1"\noauth = { storage = "file", key = "oauth/kimi-code-env-example" }\n';
  const credentials = JSON.stringify({ access_token: 'fixture-token', expires_at: Date.now() / 1000 + 3600 });
  try {
    process.env.KIMI_CODE_HOME = root;
    assert.equal((await collectNodeUsage()).status, 'unauthenticated');
    await mkdir(join(root, 'credentials'));
    await writeFile(join(root, 'config.toml'), config);
    await writeFile(join(root, 'credentials', 'kimi-code-env-example.json'), credentials);
    globalThis.fetch = async (input, init) => {
      calls.push(String(input));
      assert.equal(init?.redirect, 'error');
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer fixture-token');
      return String(input).endsWith('/usages') ? Response.json({ usages: { limit_7d: { used_ratio: 0.37 }, limit_5h: { used_ratio: 0.125 } } }) : new Response('{broken-json');
    };
    const usage = await collectNodeUsage();
    assert.equal(usage.status, 'ok');
    if (usage.status !== 'ok') assert.fail();
    assert.deepEqual(usage.windows.map(w => w.usedPercent), [37, 12.5]);
    assert.equal(usage.accountEmail, null);
    assert.ok(calls.every(url => url.startsWith('https://api.kimi.ai/coding/v1/')));
    assert.equal(await readFile(join(root, 'credentials', 'kimi-code-env-example.json'), 'utf8'), credentials);
    await writeFile(join(root, 'credentials', 'kimi-code-env-example.json'), JSON.stringify({ access_token: 'fixture-token', expires_at: 1 }));
    calls.length = 0;
    assert.equal((await collectNodeUsage()).status, 'expired');
    assert.equal(calls.length, 0);
    await writeFile(join(root, 'config.toml'), config.replace('https://api.kimi.ai/coding/v1', 'https://untrusted.example'));
    assert.equal((await collectNodeUsage()).status, 'error');
    assert.equal(calls.length, 0);
  } finally {
    if (savedHome === undefined) delete process.env.KIMI_CODE_HOME;
    else process.env.KIMI_CODE_HOME = savedHome;
    globalThis.fetch = savedFetch;
    await rm(root, { recursive: true, force: true });
  }
});

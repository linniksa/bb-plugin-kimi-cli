import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadModelMetadata, modelMetadata } from './model-metadata.ts';

test('managed enrichment preserves explicit effort and capability overrides', () => {
  const remote = [{ id: 'k3', reasoning: { type: 'only', effort: { valid: ['low', 'high', 'max'], default: 'high' } } }];
  const models = {
    defaultOnly: { provider: 'managed:kimi-code', model: 'k3', overrides: { defaultEffort: 'low' } },
    subset: { provider: 'managed:kimi-code', model: 'k3', overrides: { supportEfforts: ['low', 'max'] } },
    explicit: { provider: 'managed:kimi-code', model: 'k3', overrides: { supportEfforts: ['low'], defaultEffort: 'low', capabilities: ['thinking'] } },
    unspecified: { provider: 'managed:kimi-code', model: 'k3', overrides: { capabilities: [], supportEfforts: [] } },
  };
  const result = modelMetadata({ models }, remote);
  assert.equal(result.defaultOnly.defaultEffort, 'low');
  assert.deepEqual(result.defaultOnly.efforts, ['low', 'high', 'max']);
  assert.deepEqual(result.subset.efforts, ['low', 'max']);
  assert.equal(result.subset.defaultEffort, null, 'The server default is outside the explicit effort set');
  assert.deepEqual(result.explicit.efforts, ['low']);
  assert.equal(result.explicit.defaultEffort, 'low');
  assert.equal(result.explicit.thinking, 'toggle');
  assert.equal(result.explicit.allowOff, true);
  assert.equal(result.unspecified.thinking, null);
  assert.equal(result.unspecified.allowOff, undefined);
  assert.deepEqual(result.unspecified.efforts, []);
  assert.equal(modelMetadata({ models: { k3: { provider: 'managed:kimi-code', model: 'k3' } } }, [{ id: 'k3', reasoning: { type: 'none' } }]).k3.thinking, 'none');
});

test('managed model enrichment is bounded, cached and read-only; offline metadata still works', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kimi-model-metadata-'));
  const home = process.env.KIMI_SHARE_DIR;
  const fetch = globalThis.fetch;
  const config = '[providers."managed:kimi-code"]\nbase_url="https://api.kimi.com/coding/v1"\napi_key="fixture-secret"\n[models."kimi-code/k3"]\nprovider="managed:kimi-code"\nmodel="k3"\ndisplay_name="Local name"\ncapabilities=["thinking"]\n';
  let calls = 0;
  try {
    process.env.KIMI_SHARE_DIR = root;
    await writeFile(join(root, 'config.toml'), config);
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(String(url), 'https://api.kimi.com/coding/v1/models');
      assert.equal(init?.redirect, 'error');
      assert.ok(init?.signal);
      return Response.json({ data: [{ id: 'k3', display_name: 'K3', reasoning: { type: 'only', effort: { valid: ['low', 'high', 'max'], default: 'high' } } }] });
    };
    const first = await loadModelMetadata('python');
    assert.equal(first['kimi-code/k3'].thinking, 'always');
    assert.equal(first['kimi-code/k3'].label, 'K3');
    assert.equal(JSON.stringify(first).includes('fixture-secret'), false);
    await loadModelMetadata('python');
    assert.equal(calls, 1);
    globalThis.fetch = async () => { calls++; throw new Error('fixture network failure'); };
    const offline = await loadModelMetadata('python', true);
    assert.equal(offline['kimi-code/k3'].label, 'Local name');
    assert.equal(offline['kimi-code/k3'].thinking, 'toggle');
    assert.equal(offline['kimi-code/k3'].efforts, null);
    assert.equal(offline['kimi-code/k3'].allowOff, false);
    assert.equal(await readFile(join(root, 'config.toml'), 'utf8'), config);
    await writeFile(join(root, 'config.toml'), config.replace('api.kimi.com', 'untrusted.example'));
    const before = calls;
    await loadModelMetadata('python', true);
    assert.equal(calls, before);
    await writeFile(join(root, 'config.toml'), '[broken');
    assert.deepEqual(await loadModelMetadata('python', true), {});
  } finally {
    if (home === undefined) delete process.env.KIMI_SHARE_DIR;
    else process.env.KIMI_SHARE_DIR = home;
    globalThis.fetch = fetch;
    await rm(root, { recursive: true, force: true });
  }
});

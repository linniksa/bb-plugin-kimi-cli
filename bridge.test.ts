import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { experimental_createBridgeJsonRpcTestHarness } from '@get-bb/plugin-sdk/provider-bridge/testing';
import { PROVIDER_BRIDGE_PROTOCOL_VERSION, providerHealthResultSchema, providerUsageResultSchema } from '@get-bb/plugin-sdk/provider-bridge';
import { experimental_providerBridge } from './bridge.ts';
import { provider } from './provider.ts';

test('provider bridge keeps ACP handshake and validates Kimi Code maintenance responses', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kimi-cli-provider-test-'));
  const savedPath = process.env.PATH;
  const harness = experimental_createBridgeJsonRpcTestHarness(experimental_providerBridge.handleLine);
  try {
    harness.sendRequest(1, 'initialize', { protocolVersion: PROVIDER_BRIDGE_PROTOCOL_VERSION, client: { name: 'test', version: '1' } });
    assert.ok((await harness.waitForResponse(1)).result);
    harness.sendRequest(2, 'provider/usage', { providerId: 'wrong-provider' });
    assert.equal((await harness.waitForResponse(2)).error?.code, -32602);
    harness.sendRequest(3, 'provider/usage', {});
    assert.equal((await harness.waitForResponse(3)).error?.code, -32602);

    process.env.PATH = `${root}:/usr/bin:/bin`;
    harness.sendRequest(4, 'provider/health', { providerId: provider.id });
    const missing = providerHealthResultSchema.parse((await harness.waitForResponse(4)).result);
    assert.equal(missing.supported && missing.health.status, 'not_installed');
    const output = JSON.stringify({ status: 'ok', payload: { usage: { limit: 100, used: 120 } }, account: { user_id: 'test-user', email: 'test@example.test', user_level_name: 'Moderato' } });
    await writeFile(join(root, 'python'), `#!/bin/sh\nprintf '%s\\n' '${output}'\n`, { mode: 0o755 });
    await writeFile(join(root, 'kimi'), `#!${join(root, 'python')}\n`, { mode: 0o755 });
    harness.sendRequest(5, 'provider/usage', { providerId: provider.id });
    const result = providerUsageResultSchema.parse((await harness.waitForResponse(5)).result);
    assert.equal(result.supported && result.usage.status, 'ok');
    if (!result.supported || result.usage.status !== 'ok') assert.fail();
    assert.equal(result.usage.planLabel, 'Moderato');
    assert.equal(result.usage.accountEmail, 'test@example.test');
    assert.equal(result.usage.windows[0].usedPercent, 100);
    assert.equal(result.usage.windows[0].cost, undefined);
    assert.equal(provider.capabilities.supportsServiceTier, false);
  } finally {
    process.env.PATH = savedPath;
    harness.restore();
    await rm(root, { recursive: true, force: true });
  }
});

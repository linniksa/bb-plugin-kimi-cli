import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUsageSource } from './usage-source.ts';
import { parseUsage, usageBase } from './usage.ts';

const success = () => parseUsage({ usages: { limit_7d: { used_ratio: 0.25 } } }, { user_id: 'account-1', email: 'a@example.test', user_level_name: 'Moderato' });
const machine = { id: 'h1', name: 'Host', status: 'connected', type: 'local' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

test('usage inventory preserves offline machines and measured account identity without fetching', async () => {
  let hosts = [machine, { ...machine, id: 'temporary', type: 'ephemeral' }];
  let calls = 0;
  const source = createUsageSource(async () => hosts, async () => { calls++; return success(); });
  const list = source['provider-usage.v1.listResources'];
  const get = (refresh = false) => source['provider-usage.v1.getResource']({ resourceId: 'h1', refresh });
  assert.equal((await list()).resources.length, 1);
  assert.equal(calls, 0);
  const first = await get();
  assert.equal(first.accountKey, 'moonshot:kimi-code:user:account-1');
  assert.equal((await list()).resources[0].accountKey, first.accountKey);
  await get();
  assert.equal(calls, 1);
  hosts = [{ ...machine, status: 'disconnected' }];
  assert.equal((await list()).resources.length, 1);
  const offline = await get(true);
  assert.equal(offline.usage.status, 'error');
  assert.equal(offline.observedAt, first.observedAt);
  assert.equal(calls, 1);
  hosts = [];
  assert.equal((await list()).resources.length, 0);
  await assert.rejects(get(), /no longer available/);
});

test('explicit refresh waits for an older collection, then performs one fresh shared request', async () => {
  const old = deferred<ReturnType<typeof success>>();
  const started = deferred<void>();
  let calls = 0;
  const source = createUsageSource(async () => [machine], async () => {
    calls++;
    if (calls === 1) { started.resolve(); return old.promise; }
    return success();
  });
  const get = (refresh: boolean) => source['provider-usage.v1.getResource']({ resourceId: 'h1', refresh });
  const a = get(false), b = get(false);
  await started.promise;
  assert.equal(calls, 1);
  const c = get(true), d = get(true);
  old.resolve(success());
  await Promise.all([a, b, c, d]);
  assert.equal(calls, 2);
});

test('failed refresh is a usage state, keeps observation time and does not serve stale success', async () => {
  let calls = 0;
  const source = createUsageSource(async () => [machine], async () => {
    calls++;
    if (calls === 1) return success();
    if (calls === 2) throw new Error('must-not-leak-host-error');
    return { ...usageBase, status: 'expired' };
  });
  const get = (refresh: boolean) => source['provider-usage.v1.getResource']({ resourceId: 'h1', refresh });
  const first = await get(false);
  const failed = await get(true);
  assert.equal(failed.usage.status, 'error');
  assert.equal(failed.observedAt, first.observedAt);
  assert.equal(JSON.stringify(failed).includes('must-not-leak-host-error'), false);
  const expired = await get(false);
  assert.equal(calls, 3);
  assert.equal(expired.usage.status, 'expired');
  assert.equal(expired.accountKey, null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUsage, usageSchema } from './usage.ts';

test('Kimi quota mapping and unavailable data', () => {
  const result = usageSchema.parse(parseUsage({ usage: { limit: '100', used: '58', resetTime: '2026-10-17T13:31:19.635761Z' }, limits: [{ window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' }, detail: { limit: '100', remaining: '87' } }] }));
  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') assert.fail();
  assert.deepEqual(result.windows.map(w => [w.kind, w.usedPercent]), [['weekly', 58], ['five-hour', 13]]);
  assert.equal(result.windows[0].resetsAt, '2026-10-17T13:31:19.635761Z');
  for (const usage of [{ limit: 0, used: 0 }, { limit: 100 }, { limit: 100, used: -1 }, { limit: 100, used: 'NaN' }]) assert.throws(() => parseUsage({ usage }));
  assert.throws(() => parseUsage({}));
  const overage = parseUsage({ usage: { limit: 100, used: 120 } });
  assert.equal(overage.status === 'ok' && overage.windows[0].usedPercent, 120);
});

test('account and subscription come from the Kimi profile, with no guessed tier', () => {
  const quota = { usage: { limit: 100, used: 25 } };
  const profile = { user_id: 'fixture-user', email: 'user@example.test', nickname: 'Test User', user_level_name: 'Moderato' };
  const result = parseUsage(quota, profile);
  assert.equal(result.accountEmail, 'user@example.test');
  assert.equal(result.planLabel, 'Moderato');
  const nickname = parseUsage(quota, { ...profile, email: '', user_level_name: '' });
  assert.equal(nickname.accountEmail, 'Test User');
  assert.equal(nickname.planLabel, null);
  const unavailable = parseUsage(quota, { error: 'unavailable' });
  assert.equal(unavailable.status, 'ok');
  assert.equal(unavailable.accountEmail, null);
  assert.equal(unavailable.planLabel, null);
});

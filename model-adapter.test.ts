import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { modelMetadata } from './model-metadata.ts';
import { presentKimiModel, adaptKimiRequest } from './model-adapter.ts';
import type { AvailableModel } from '@get-bb/plugin-sdk/provider-bridge';

const row = (levels: string[], current = levels[0]): AvailableModel => ({ id: 'kimi-code/k3', model: 'kimi-code/k3', displayName: 'k3', description: '', isDefault: true,
  supportedReasoningEfforts: levels.map(reasoningEffort => ({ reasoningEffort, description: '' })), defaultReasoningEffort: current });

test('model identity uses configuration keys and unique aliases, never labels or highspeed suffixes', () => {
  const result = modelMetadata({ models: {
    'kimi-code/k3': { provider: 'managed:kimi-code', model: 'k3', display_name: 'Old name', capabilities: ['thinking'] },
    'kimi-code/k3-highspeed': { provider: 'managed:kimi-code', model: 'k3-highspeed', display_name: 'Same label' },
    custom: { model: 'k3', display_name: 'Same label' },
  } }, [{ id: 'k3', display_name: 'K3', reasoning: { type: 'only', effort: { valid: ['low', 'high', 'max'], default: 'high' } } }]);
  assert.equal(result['kimi-code/k3'].label, 'K3');
  assert.equal(result['kimi-code/k3'].thinking, 'always');
  assert.deepEqual(result['kimi-code/k3'].efforts, ['low', 'high', 'max']);
  assert.equal(result.k3, undefined);
  assert.equal(result['k3-highspeed'].label, 'Same label');
  assert.equal(result.custom.label, 'Same label');
  assert.notEqual(result['kimi-code/k3'], result['kimi-code/k3-highspeed']);
});

test('Python offers only its binary Thinking modes even when the service supports granular effort', () => {
  const metadata = { label: 'K3', thinking: 'always' as const, efforts: ['low', 'high', 'max'], defaultEffort: 'high' };
  const result = presentKimiModel(row(['off', 'on']), metadata, 'python');
  assert.deepEqual(result.supportedReasoningEfforts.map(e => e.reasoningEffort), ['on']);
  assert.equal(result.defaultReasoningEffort, 'on');
  assert.equal(result.displayName, 'K3');
  assert.equal(result.id, 'kimi-code/k3');
});

test('required binary Thinking has a status label without changing its wire value', () => {
  const required = { label: 'K3', thinking: 'always' as const, efforts: [] as string[], defaultEffort: null };
  const shown = presentKimiModel(row(['on']), required, 'python');
  assert.equal(shown.supportedReasoningEfforts[0].label, 'Always on');
  assert.match(shown.supportedReasoningEfforts[0].description, /fixed high/);
  assert.equal(shown.supportedReasoningEfforts[0].reasoningEffort, 'on');
  assert.equal(shown.defaultReasoningEffort, 'on');
  const unknown = presentKimiModel(row(['off', 'on']), { ...required, thinking: null, allowOff: false }, 'node');
  assert.equal(unknown.supportedReasoningEfforts[0].label, undefined, 'A missing declaration does not prove mandatory Thinking');
});

test('Node removes inherited unsupported effort and chooses a valid per-model default', () => {
  const binary = { label: 'K2.7 Highspeed', thinking: 'always' as const, efforts: [], defaultEffort: null };
  const result = presentKimiModel(row(['on', 'high'], 'high'), binary, 'node');
  assert.deepEqual(result.supportedReasoningEfforts.map(e => e.reasoningEffort), ['on']);
  assert.equal(result.defaultReasoningEffort, 'on');
  const granular = presentKimiModel(row(['off', 'on', 'low', 'high', 'max'], 'on'), { ...binary, efforts: ['low', 'high', 'max'], defaultEffort: 'max' }, 'node');
  assert.deepEqual(granular.supportedReasoningEfforts.map(e => e.reasoningEffort), ['low', 'high', 'max']);
  assert.equal(granular.defaultReasoningEffort, 'max');
});

test('Node preserves engine-derived efforts when local support is unknown', () => {
  const metadata = modelMetadata({ models: { claude: { provider: 'anthro', name: 'claude-sonnet-4-5' } } }).claude;
  const native = row(['off', 'low', 'medium', 'high'], 'high');
  const shown = presentKimiModel(native, metadata, 'node');
  assert.deepEqual(shown.supportedReasoningEfforts, native.supportedReasoningEfforts);
  assert.equal(shown.defaultReasoningEffort, 'high');
});

test('non-thinking capability overrides preserve engine-derived Node Thinking', () => {
  const native = row(['off', 'low', 'medium', 'high'], 'high');
  for (const capabilities of [['image_in'], []]) {
    const metadata = modelMetadata({ models: { claude: { provider: 'anthro', name: 'claude-sonnet-4-5', overrides: { capabilities } } } }).claude;
    const shown = presentKimiModel(native, metadata, 'node');
    assert.equal(metadata.thinking, null);
    assert.deepEqual(shown.supportedReasoningEfforts, native.supportedReasoningEfforts);
    assert.equal(shown.defaultReasoningEffort, 'high');
  }
});

test('a declared binary effort list differs from absent local effort metadata', () => {
  const metadata = modelMetadata({ models: { binary: { model: 'binary', supportEfforts: [], capabilities: ['always_thinking'] } } }).binary;
  assert.deepEqual(metadata.efforts, []);
  const shown = presentKimiModel(row(['on', 'high'], 'high'), metadata, 'node');
  assert.deepEqual(shown.supportedReasoningEfforts.map(e => e.reasoningEffort), ['on']);
  assert.equal(shown.defaultReasoningEffort, 'on');
});

test('offline local metadata supports both config generations without guessing a default', () => {
  const result = modelMetadata({ models: {
    old: { model: 'old-id', display_name: 'Legacy', capabilities: ['thinking'] },
    modern: { name: 'modern-id', displayName: 'Modern', supportEfforts: ['low', 'max'], defaultEffort: 'invalid', capabilities: ['always_thinking'] },
    malformed: { display_name: 12 },
  } });
  assert.equal(result.old.thinking, 'toggle');
  assert.equal(result.modern.thinking, 'always');
  assert.equal(result.modern.defaultEffort, null);
  assert.equal(result['modern-id'], result.modern);
  assert.equal(result.malformed, undefined);
  assert.equal(presentKimiModel(row(['medium']), undefined, 'node').defaultReasoningEffort, 'medium');
});

test('a service declaration without granular effort clears stale local effort metadata', () => {
  const result = modelMetadata({ models: { binary: { provider: 'managed:kimi-code', model: 'binary', supportEfforts: ['high'], defaultEffort: 'high' } } },
    [{ id: 'binary', reasoning: { type: 'only' } }]);
  assert.deepEqual(result.binary.efforts, []);
  assert.equal(result.binary.defaultEffort, null);
  const shown = presentKimiModel({ ...row(['on', 'high'], 'high'), id: 'binary' }, result.binary, 'node');
  assert.deepEqual(shown.supportedReasoningEfforts.map(e => e.reasoningEffort), ['on']);
});

test('explicit display overrides preserve CLI naming without allowing identity overrides', () => {
  const result = modelMetadata({ models: { k3: { provider: 'managed:kimi-code', model: 'k3', overrides: { display_name: 'My model', model: 'other-model' } } } },
    [{ id: 'k3', display_name: 'K3', reasoning: { type: 'only' } }]);
  assert.equal(result.k3.label, 'My model');
  assert.equal(result['other-model'], undefined);
});

test('managed enrichment does not replace an explicit Node effort default', () => {
  const metadata = modelMetadata({ models: { 'kimi-code/k3': { provider: 'managed:kimi-code', model: 'k3', overrides: { defaultEffort: 'low' } } } },
    [{ id: 'k3', reasoning: { type: 'only', effort: { valid: ['low', 'high', 'max'], default: 'high' } } }]);
  const shown = presentKimiModel(row(['low', 'high', 'max'], 'low'), metadata['kimi-code/k3'], 'node');
  assert.equal(shown.defaultReasoningEffort, 'low');
  assert.deepEqual(shown.supportedReasoningEfforts.map(e => e.reasoningEffort), ['low', 'high', 'max']);
});

test('the adapter leaves unrelated launch specifications and protocol responses intact', async () => {
  for (const message of [{ id: 1, result: {} }, { method: 'initialize', params: {} },
    { method: 'thread/start', params: { options: { providerOptions: { acpLaunchSpec: { command: 'other-agent', args: [], env: {}, displayName: 'Other' } } } } }]) {
    assert.equal(await adaptKimiRequest(message), message);
  }
});

test('CLI generation and model metadata follow the request environment without changing the process', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kimi-launch-'));
  const originalPath = process.env.PATH;
  try {
    await writeFile(join(root, 'kimi'), '#!/fixture/bin/python\n', { mode: 0o755 });
    await writeFile(join(root, 'config.toml'), '[models.custom]\nmodel="fixture-model"\ndisplay_name="Request-local model"\n');
    const message = { id: 1, method: 'model/list', params: { envVars: { PATH: root, KIMI_SHARE_DIR: root },
      providerOptions: { acpLaunchSpec: { command: 'kimi', args: ['acp'], env: {}, displayName: 'Kimi' } } } };
    const adapted = await adaptKimiRequest(message) as typeof message;
    const launch = adapted.params.providerOptions.acpLaunchSpec;
    assert.equal(launch.command, '/fixture/bin/python');
    const env = launch.env as Record<string, string>;
    assert.equal(JSON.parse(env.KIMI_BB_MODEL_METADATA).custom.label, 'Request-local model');
    assert.deepEqual(adapted.params.envVars, message.params.envVars);
    assert.equal(process.env.PATH, originalPath);
  } finally { await rm(root, { recursive: true, force: true }); }
});

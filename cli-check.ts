import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { experimental_createBridgeJsonRpcTestHarness } from '@get-bb/plugin-sdk/provider-bridge/testing';
import { PROVIDER_BRIDGE_PROTOCOL_VERSION, THREAD_DELTA_NOTIFICATION_METHOD, type JsonObject } from '@get-bb/plugin-sdk/provider-bridge';
import { experimental_providerBridge as bridge } from './bridge.ts';
import { provider } from './provider.ts';

const kind = process.argv[2];
if (!kind) {
  for (const generation of ['python', 'node']) execFileSync(process.execPath, ['--experimental-strip-types', import.meta.filename, generation], { stdio: 'inherit', timeout: 90000 });
} else {
  assert.ok(kind === 'python' || kind === 'node');
  const executable = process.env[kind === 'python' ? 'KIMI_TEST_PYTHON' : 'KIMI_TEST_NODE'];
  assert.ok(executable, `Set ${kind === 'python' ? 'KIMI_TEST_PYTHON to the Kimi Python interpreter' : 'KIMI_TEST_NODE to the Node Kimi executable'}`);
  const root = await mkdtemp(join(tmpdir(), `kimi-${kind}-check-`));
  const workspace = join(root, 'workspace');
  const calls: { model: string; reasoning_effort?: string }[] = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    calls.push({ model: input.model, reasoning_effort: input.reasoning_effort });
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const item of [
      { choices: [{ index: 0, delta: { role: 'assistant', content: 'LOCAL_FIXTURE_OK' }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } },
    ]) response.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: input.model, ...item })}\n\n`);
    response.end('data: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  await mkdir(join(workspace, '.git'), { recursive: true });
  await mkdir(join(root, 'credentials'));
  await writeFile(join(root, 'credentials', 'kimi-code.json'), JSON.stringify({ access_token: 'isolated-fixture-only', refresh_token: '', expires_at: Date.now() / 1000 + 3600 }));
  let config = kind === 'python' ? `default_model="effort"\ndefault_thinking=true\n[providers.fixture]\ntype="openai_legacy"\nbase_url="${baseUrl}"\napi_key="isolated-fixture-only"\n` : 'defaultModel="effort"\n';
  for (const [id, label, caps] of [
    ['effort', 'Effort Model', ['thinking', 'always_thinking']],
    ['binary', 'Binary Model', ['thinking', 'always_thinking']],
    ['toggle', 'Toggle Model', ['thinking']],
  ] as const) {
    config += kind === 'python'
      ? `\n[models.${id}]\nprovider="fixture"\nmodel="${id}"\nmax_context_size=32768\ndisplay_name="${label}"\ncapabilities=${JSON.stringify(caps)}\n`
      : `\n[models.${id}]\nname="${id}"\nprotocol="openai"\nbaseUrl="${baseUrl}"\napiKey="isolated-fixture-only"\nmaxContextSize=32768\ndisplayName="${label}"\ncapabilities=${JSON.stringify(caps)}\n${id === 'effort' ? 'supportEfforts=["low","high","max"]\ndefaultEffort="high"\n' : id === 'binary' ? 'supportEfforts=["on"]\n' : ''}`;
  }
  if (kind === 'node') config += `\n[providers.anthro]\ntype="anthropic"\nbaseUrl="${baseUrl}"\napiKey="isolated-fixture-only"\n[models.claude]\nprovider="anthro"\nname="claude-sonnet-4-5"\ndisplayName="Derived Profile"\nmaxContextSize=200000\n[models.claude.overrides]\ncapabilities=["image_in"]\n`;
  await writeFile(join(root, 'config.toml'), config);
  if (kind === 'python') {
    const python = execFileSync(executable, ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' }).trim();
    await writeFile(join(root, 'kimi'), `#!${python}\n`, { mode: 0o755 });
  } else await symlink(resolve(executable), join(root, 'kimi'));
  process.env.PATH = `${root}:${process.env.PATH}`;
  process.env.KIMI_SHARE_DIR = process.env.KIMI_CODE_HOME = process.env.HOME = root;
  process.env.KIMI_CLI_NO_AUTO_UPDATE = '1';
  const harness = experimental_createBridgeJsonRpcTestHarness(bridge.handleLine);
  let nextId = 0;
  const request = async (method: string, params: JsonObject) => {
    const id = ++nextId;
    harness.sendRequest(id, method, params);
    const response = await harness.waitForResponse(id);
    assert.equal(response.error, undefined, JSON.stringify(response.error));
    return response.result as Record<string, unknown>;
  };
  const options = (model: string, reasoningLevel: string) => ({ permissionMode: 'full', permissionScope: 'full', approvalReviewer: null, permissionEscalation: null, model, reasoningLevel, providerOptions: provider.experimental_bridgeOptions });
  let providerThreadId: string | undefined;
  let activeThread: string | undefined;
  try {
    await request('initialize', { protocolVersion: PROVIDER_BRIDGE_PROTOCOL_VERSION, client: { name: 'cli-check', version: '1' } });
    const catalog = await request('model/list', { cwd: workspace, providerOptions: provider.experimental_bridgeOptions });
    const models = catalog.models as { id: string; displayName: string; supportedReasoningEfforts: { reasoningEffort: string }[] }[];
    assert.deepEqual(models.map(m => m.displayName).sort(), kind === 'python'
      ? ['Binary Model', 'Effort Model', 'Toggle Model'] : ['Binary Model', 'Derived Profile', 'Effort Model', 'Toggle Model']);
    const levels = (id: string) => models.find(m => m.id === id)!.supportedReasoningEfforts.map(e => e.reasoningEffort);
    assert.deepEqual(levels('effort'), kind === 'python' ? ['on'] : ['low', 'high', 'max']);
    assert.deepEqual(levels('binary'), ['on']);
    assert.ok(levels('toggle').includes('off'));
    assert.ok(levels('toggle').includes('on'));
    if (kind === 'node') {
      assert.ok(levels('claude').length > 2, 'Engine-derived efforts were lost');
      assert.ok(levels('claude').includes('off'));
      assert.ok(levels('claude').includes('high'));
    }
    assert.equal(await readFile(join(root, 'config.toml'), 'utf8'), config, 'Model discovery changed CLI configuration');
    const started = await request('thread/start', { threadId: 'fixture', cwd: workspace, instructionMode: 'append', options: options(kind === 'python' ? 'effort,thinking' : 'effort', kind === 'python' ? 'on' : 'high') });
    providerThreadId = started.providerThreadId as string;
    activeThread = 'fixture';
    const choices = [['effort', kind === 'python' ? 'on' : 'max'], ['binary', 'on'], ['toggle', 'off'], ['toggle', 'on'], ['effort', kind === 'python' ? 'on' : 'low']];
    async function turn(threadId: string, model: string, effort: string, index: number) {
      assert.ok(providerThreadId);
      const before = calls.length;
      const beforeMessages = harness.messages.length;
      await request('turn/start', { threadId, providerThreadId, clientRequestId: `creq_aaaaaaaaa${'bcdefg'[index]}`, input: [{ type: 'text', text: 'Reply with the fixture response.' }], options: options(model, effort) });
      const deadline = Date.now() + 20000;
      while (calls.length === before && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
      assert.ok(calls.length > before, `No local model request for ${model}/${effort}: ${JSON.stringify(harness.messages.slice(beforeMessages))}`);
      assert.equal(calls.at(-1)!.model, model);
      // The next turn must wait for this turn's boundary, not merely its HTTP request.
      const until = Date.now() + 20000;
      const completed = () => harness.messages.slice(beforeMessages).some(m => m.method === THREAD_DELTA_NOTIFICATION_METHOD && JSON.stringify(m).includes('"kind":"turn.boundary","status":"completed"'));
      while (!completed() && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10));
      assert.ok(completed(), 'Turn did not complete');
      const emitted = calls.slice(before);
      assert.ok(emitted.every(call => call.model === model), `Incorrect model for ${model}/${effort}`);
      if (kind === 'python') assert.ok(emitted.every(call => (call.reasoning_effort ?? null) === (effort === 'off' ? null : 'high')), `Incorrect legacy Thinking for ${model}/${effort}`);
      else if (model === 'effort') assert.ok(emitted.every(call => call.reasoning_effort === effort), `Incorrect native effort for ${model}/${effort}`);
    }
    for (const [index, [model, effort]] of choices.entries()) await turn('fixture', model, effort, index);
    await request('thread/stop', { threadId: 'fixture', providerThreadId, intent: 'release', activeTurnId: null });
    activeThread = undefined;
    assert.equal(await readFile(join(root, 'config.toml'), 'utf8'), config, 'Session selection changed CLI configuration');
    const restored = await request('thread/resume', { threadId: 'restored', cwd: workspace, providerThreadId, instructionMode: 'append', options: options('binary', 'on') });
    assert.equal(restored.providerThreadId, providerThreadId, 'Restore unexpectedly started a new session');
    activeThread = 'restored';
    await turn('restored', 'binary', 'on', choices.length);
    await request('thread/stop', { threadId: 'restored', providerThreadId: restored.providerThreadId, intent: 'release', activeTurnId: null });
    activeThread = undefined;
    assert.equal(await readFile(join(root, 'config.toml'), 'utf8'), config, 'Session restore changed CLI configuration');
  } finally {
    if (activeThread && providerThreadId) await request('thread/stop', { threadId: activeThread, providerThreadId, intent: 'release', activeTurnId: null }).catch(() => {});
    harness.restore();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  console.log(`PASS ${kind}: grouped catalog, Thinking selection, model round trip and session restore (${JSON.stringify(calls)})`);
}

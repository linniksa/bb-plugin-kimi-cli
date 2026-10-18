async function test(name: string, run: () => Promise<void>) {
  await run();
  console.log(`PASS ${name}`);
}
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  experimental_captureBridgeJsonRpcOutput,
  experimental_runBridgeConformance,
  experimental_formatConformanceReport,
} from '@get-bb/plugin-sdk/provider-bridge/testing';
import { experimental_providerBridge as bridge } from './bridge.ts';
import { provider } from './provider.ts';

const full = { permissionMode: 'full', permissionScope: 'full', approvalReviewer: null, permissionEscalation: null };
const providerOptions = {
  ...provider.experimental_bridgeOptions,
  acpLaunchSpec: { displayName: 'Kimi Code fixture', command: process.execPath, args: [fileURLToPath(new URL('./test-fixtures/acp-agent.mjs', import.meta.url))], env: {} },
};
const options = { ...full, providerOptions };
const send = (id: number, method: string, params: unknown) => bridge.handleLine(JSON.stringify({ jsonrpc: '2.0', id, method, params }));

await test('shared ACP bridge conforms for session lifecycle', async () => {
  const output = experimental_captureBridgeJsonRpcOutput();
  try {
    const report = await experimental_runBridgeConformance({
      providerId: provider.id,
      transport: { send: bridge.handleLine, takeMessages: output.takeMessages },
      session: { cwd: process.cwd(), promptInput: [{ type: 'text', text: 'hello', mentions: [] }], options },
      timeoutMs: 4000,
    });
    assert.equal(report.passed, true, experimental_formatConformanceReport(report));
  } finally { output.restore(); }
});

await test('Accept Edits forwards allow/deny and Full Access auto-allows ACP permission requests', async () => {
  const output = experimental_captureBridgeJsonRpcOutput();
  async function waitFor(predicate: () => boolean) {
    const deadline = Date.now() + 5000;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(predicate(), `Bridge did not finish within five seconds: ${JSON.stringify(output.messages.slice(-8))}`);
  }
  let id = 100;
  try {
    for (const decision of ['deny', 'allow_once', 'full']) {
      const threadId = `permission-${decision}`;
      const policy = decision === 'full' ? full : { permissionMode: 'accept-edits', permissionScope: 'workspace', approvalReviewer: 'user', permissionEscalation: 'ask' };
      const startId = ++id;
      send(startId, 'thread/start', { threadId, cwd: process.cwd(), instructionMode: 'append', options: { ...policy, providerOptions } });
      await waitFor(() => output.messages.some(m => m.id === startId));
      const start = output.messages.find(m => m.id === startId)!;
      assert.equal(start.error, undefined, JSON.stringify(start));
      const providerThreadId = (start.result as { providerThreadId: string }).providerThreadId;
      const before = output.messages.length;
      const turnId = ++id;
      send(turnId, 'turn/start', { threadId, providerThreadId, input: [{ type: 'text', text: 'permission' }], clientRequestId: `creq_aaaaaaaaa${decision === 'deny' ? 'a' : decision === 'full' ? 'b' : 'c'}`, options: { ...policy, providerOptions } });
      if (decision !== 'full') {
        await waitFor(() => output.messages.slice(before).some(m => m.method === 'interaction/request'));
        const request = output.messages.slice(before).find(m => m.method === 'interaction/request')!;
        const result = decision === 'deny' ? { decision } : { decision, grantedPermissions: null };
        bridge.handleLine(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
      }
      const expected = decision === 'deny' ? 'DENIED' : 'ALLOWED';
      await waitFor(() => JSON.stringify(output.messages.slice(before)).includes(expected));
      if (decision === 'full') assert.ok(!output.messages.slice(before).some(m => m.method === 'interaction/request'));
      const stopId = ++id;
      send(stopId, 'thread/stop', { threadId, providerThreadId, intent: 'release', activeTurnId: null });
      await waitFor(() => output.messages.some(m => m.id === stopId));
    }
  } finally { output.restore(); }
});

import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
let next = 0;
const pending = new Map();
const send = message => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
const reply = (id, result) => send({ id, result });
function complete(id, sessionId, text) {
  send({ method: 'session/update', params: { sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } } });
  reply(id, { stopReason: 'end_turn' });
}
createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line);
  const { id, method, params } = message;
  if (pending.has(id)) {
    const prompt = pending.get(id);
    pending.delete(id);
    complete(prompt.id, prompt.sessionId, message.result?.outcome?.optionId === 'approve' ? 'ALLOWED' : 'DENIED');
    return;
  }
  switch (method) {
    case 'initialize':
      reply(id, { protocolVersion: 1, agentCapabilities: { loadSession: true, sessionCapabilities: { fork: {} } }, authMethods: [] });
      break;
    case 'session/new': case 'session/fork':
      reply(id, { sessionId: `fixture-${randomUUID()}` });
      break;
    case 'session/load': case 'session/set_config_option':
      reply(id, {});
      break;
    case 'session/prompt': {
      if (params.prompt.some(block => block.text === 'permission')) {
        const requestId = `permission-${++next}`;
        pending.set(requestId, { id, sessionId: params.sessionId });
        send({ id: requestId, method: 'session/request_permission', params: {
          sessionId: params.sessionId,
          toolCall: { toolCallId: `tool-${next}`, title: 'Run command', kind: 'execute', rawInput: { command: 'echo fixture' } },
          options: [{ optionId: 'approve', name: 'Approve once', kind: 'allow_once' }, { optionId: 'reject', name: 'Reject', kind: 'reject_once' }],
        } });
      } else complete(id, params.sessionId, 'FIXTURE_OK');
      break;
    }
    case 'session/cancel': break;
    default: if (id !== undefined) send({ id, error: { code: -32601, message: 'Unsupported fixture method' } });
  }
});

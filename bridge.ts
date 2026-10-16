import { experimental_acpProviderBridge } from '@get-bb/plugin-sdk/provider-bridge/acp';
import {
  createBridgeIo, createBridgeLineHandler, runBridgeRequest,
  providerMaintenanceParamsSchema, providerUsageResultSchema, providerHealthResultSchema,
  experimental_readCliVersion,
} from '@get-bb/plugin-sdk/provider-bridge';
import { z } from 'zod';
import { collectUsage } from './collect.ts';

const requestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.enum(['provider/health', 'provider/usage']),
  params: providerMaintenanceParamsSchema,
});
const io = createBridgeIo();

// BB's ACP bridge owns sessions, tools and permissions; Kimi supplies only its account/usage methods.
export const experimental_providerBridge = {
  ...experimental_acpProviderBridge,
  handleLine: createBridgeLineHandler({
    handleParsedMessage(message) {
      const method = typeof message === 'object' && message !== null && 'method' in message ? message.method : null;
      if (method !== 'provider/health' && method !== 'provider/usage') {
        experimental_acpProviderBridge.handleLine(JSON.stringify(message));
        return;
      }
      const parsed = requestSchema.safeParse(message);
      if (!parsed.success) {
        const id = typeof message === 'object' && message !== null && 'id' in message ? message.id : null;
        if (typeof id === 'string' || typeof id === 'number') io.sendError(id, -32602, 'Invalid Kimi maintenance request.');
        return;
      }
      runBridgeRequest({ request: parsed.data, sendError: io.sendError, handleRequest: async request => {
        if (request.params.providerId !== 'acp-kimi') {
          io.sendError(request.id, -32602, 'Unknown Kimi provider.');
          return;
        }
        const usage = await collectUsage(AbortSignal.timeout(30000));
        if (request.method === 'provider/usage') {
          // The bridge contract omits cost when absent; the Provider usage RPC contract uses null.
          const bridgeUsage = usage.status === 'ok' ? { ...usage, windows: usage.windows.map(({ cost, ...window }) => window) } : usage;
          io.sendResult(request.id, providerUsageResultSchema.parse({ supported: true, usage: bridgeUsage }));
          return;
        }
        io.sendResult(request.id, providerHealthResultSchema.parse({ supported: true, health: {
          status: usage.status === 'ok' ? 'ready' : usage.status === 'error' ? 'unknown' : usage.status,
          accountEmail: usage.accountEmail,
          planLabel: usage.planLabel,
          statusMessage: usage.status === 'error' ? usage.message : null,
          installedVersion: usage.status === 'not_installed' ? null : await experimental_readCliVersion('kimi'),
          minimumSupportedVersion: null,
          canInstall: false,
          canUpdate: false,
          loginCommand: 'kimi login',
          localLoginCommand: 'kimi login',
        } }));
      } });
    },
  }),
};

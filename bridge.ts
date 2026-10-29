import { experimental_acpProviderBridge } from '@get-bb/plugin-sdk/provider-bridge/acp';
import {
  createBridgeIo, createBridgeLineHandler, runBridgeRequest,
  providerMaintenanceParamsSchema, providerUsageResultSchema, providerHealthResultSchema, experimental_readCliVersion,
  providerInstallationStatusParamsSchema, providerInstallationStatusSchema,
  providerInstallationRunParamsSchema, providerInstallationRunResultSchema,
} from '@get-bb/plugin-sdk/provider-bridge';
import { z } from 'zod';
import { collectUsage } from './collect.ts';
import { providerId } from './provider.ts';
import { getInstallationStatus, getInstallationRun } from './installation.ts';

const maintenanceRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.enum(['provider/health', 'provider/usage']),
  params: providerMaintenanceParamsSchema,
});
const requestSchema = z.union([maintenanceRequestSchema,
  z.object({ jsonrpc: z.literal('2.0'), id: z.union([z.string(), z.number()]), method: z.literal('provider/installation/status'), params: providerInstallationStatusParamsSchema }),
  z.object({ jsonrpc: z.literal('2.0'), id: z.union([z.string(), z.number()]), method: z.literal('provider/installation/run'), params: providerInstallationRunParamsSchema }),
]);
const io = createBridgeIo();

// BB's ACP bridge owns sessions, tools and permissions; Kimi supplies its maintenance methods.
export const experimental_providerBridge = {
  ...experimental_acpProviderBridge,
  handleLine: createBridgeLineHandler({
    handleParsedMessage(message) {
      const method = typeof message === 'object' && message !== null && 'method' in message ? message.method : null;
      if (method !== 'provider/health' && method !== 'provider/usage' && method !== 'provider/installation/status' && method !== 'provider/installation/run') {
        experimental_acpProviderBridge.handleLine(JSON.stringify(message));
        return;
      }
      const parsed = requestSchema.safeParse(message);
      if (!parsed.success) {
        const id = typeof message === 'object' && message !== null && 'id' in message ? message.id : null;
        if (typeof id === 'string' || typeof id === 'number') io.sendError(id, -32602, 'Invalid Kimi Code maintenance request.');
        return;
      }
      runBridgeRequest({ request: parsed.data, sendError: io.sendError, handleRequest: async request => {
        if (request.params.providerId !== providerId) {
          io.sendError(request.id, -32602, 'Unknown Kimi Code provider.');
          return;
        }
        if (request.method === 'provider/installation/status') {
          io.sendResult(request.id, providerInstallationStatusSchema.parse(await getInstallationStatus(request.params.checkUpdates)));
          return;
        }
        if (request.method === 'provider/installation/run') {
          io.sendResult(request.id, providerInstallationRunResultSchema.parse(await getInstallationRun(request.params.action)));
          return;
        }
        const usage = await collectUsage(AbortSignal.timeout(30000));
        if (request.method === 'provider/usage') {
          // BB's bridge caps percentages at 100 and omits absent cost; quota RPC preserves raw overage.
          const bridgeUsage = usage.status === 'ok' ? { ...usage, windows: usage.windows.map(({ cost, ...window }) => ({ ...window, usedPercent: Math.min(100, window.usedPercent) })) } : usage;
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

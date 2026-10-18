import type { BbPluginApi } from '@get-bb/plugin-sdk';
import type { z } from 'zod';
import { hostContract, usageContract, measurement } from './contract.ts';
import { provider, providerId, providerName } from './provider.ts';

export default function kimiCli(bb: BbPluginApi) {
  const registration = bb.providers.register(provider);
  bb.onDispose(() => registration.dispose());
  const host = bb.hosts.experimental_client({ contract: hostContract });
  const cache = new Map<string, { time: number; value: z.infer<typeof measurement> }>();
  const pending = new Map<string, Promise<z.infer<typeof measurement>>>();
  async function resources() {
    return (await bb.sdk.hosts.list()).filter(h => h.status === 'connected' && h.type !== 'ephemeral').map(h => ({ id: h.id, providerId, accountKey: cache.get(h.id)?.value.accountKey ?? null, label: providerName, scope: { kind: 'host' as const, hostId: h.id, hostName: h.name } }));
  }
  bb.rpc.register(usageContract, {
    'provider-usage.v1.listResources': async () => ({ resources: await resources() }),
    'provider-usage.v1.getResource': async ({ resourceId, refresh }) => {
      if (!(await resources()).some(r => r.id === resourceId)) throw new Error('Kimi usage resource is no longer available.');
      const active = pending.get(resourceId);
      if (active) return active;
      const cached = cache.get(resourceId);
      if (!refresh && cached && Date.now() - cached.time < 60000) return cached.value;
      const request = host.call('collect', {}, { hostId: resourceId }).then(usage => {
        const value = { accountKey: usage.accountKey, observedAt: usage.status === 'ok' ? Date.now() : cached?.value.observedAt ?? null, usage };
        cache.set(resourceId, { time: Date.now(), value });
        return value;
      }).finally(() => pending.delete(resourceId));
      pending.set(resourceId, request);
      return request;
    },
  }, { experimental_discoverable: true, experimental_description: 'Kimi Code quota from host-local credentials. No credentials leave the host.' });
}

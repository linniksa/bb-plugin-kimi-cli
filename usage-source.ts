import type { z } from 'zod';
import { measurement } from './contract.ts';
import { usageBase, usageSchema } from './usage.ts';
import { providerId, providerName } from './provider.ts';

type Machine = { id: string; name: string; status: string; type: string };
export function createUsageSource(listMachines: () => Promise<Machine[]>, collect: (hostId: string, signal: AbortSignal) => Promise<z.infer<typeof usageSchema>>) {
  const cache = new Map<string, z.infer<typeof measurement>>();
  const pending = new Map<string, { refresh: boolean; promise: Promise<z.infer<typeof measurement>> }>();
  const machines = async () => (await listMachines()).filter(h => h.type !== 'ephemeral');
  async function load(resourceId: string, refresh: boolean): Promise<z.infer<typeof measurement>> {
    const active = pending.get(resourceId);
    if (active) {
      if (!refresh || active.refresh) return active.promise;
      await active.promise;
      return load(resourceId, true);
    }
    const promise = Promise.resolve().then(async () => {
      const machine = (await machines()).find(h => h.id === resourceId);
      if (!machine) throw new Error('Kimi Code usage resource is no longer available.');
      const cached = cache.get(resourceId);
      const unavailable = (message: string): z.infer<typeof measurement> => ({ accountKey: cached?.accountKey ?? null, observedAt: cached?.observedAt ?? null, usage: { ...usageBase, status: 'error', message } });
      if (machine.status !== 'connected') return unavailable('Machine is disconnected.');
      if (!refresh && cached?.usage.status === 'ok' && cached.observedAt !== null && Date.now() - cached.observedAt < 60000) return cached;
      try {
        const usage = await collect(resourceId, AbortSignal.timeout(30000));
        const value = { accountKey: usage.accountKey, observedAt: usage.status === 'ok' ? Date.now() : cached?.observedAt ?? null, usage };
        cache.set(resourceId, value);
        return value;
      } catch {
        const value = unavailable('Kimi Code usage could not be collected from this machine.');
        cache.set(resourceId, value);
        return value;
      }
    }).finally(() => pending.delete(resourceId));
    pending.set(resourceId, { refresh, promise });
    return promise;
  }
  return {
    'provider-usage.v1.listResources': async () => {
      const hosts = await machines();
      const ids = new Set(hosts.map(h => h.id));
      for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id);
      return { resources: hosts.map(h => ({ id: h.id, providerId, accountKey: cache.get(h.id)?.accountKey ?? null, label: providerName, scope: { kind: 'host' as const, hostId: h.id, hostName: h.name } })) };
    },
    'provider-usage.v1.getResource': ({ resourceId, refresh }: { resourceId: string; refresh: boolean }) => load(resourceId, refresh),
  };
}

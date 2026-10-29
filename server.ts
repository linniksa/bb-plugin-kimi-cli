import type { BbPluginApi } from '@get-bb/plugin-sdk';
import { hostContract, usageContract } from './contract.ts';
import { provider } from './provider.ts';
import { createUsageSource } from './usage-source.ts';

export default function kimiCli(bb: BbPluginApi) {
  const registration = bb.providers.register(provider);
  bb.onDispose(() => registration.dispose());
  const host = bb.hosts.experimental_client({ contract: hostContract });
  bb.rpc.register(usageContract, createUsageSource(
    () => bb.sdk.hosts.list(),
    (hostId, signal) => host.call('collect', {}, { hostId, signal, timeoutMs: 30000 }),
  ), { experimental_discoverable: true, experimental_description: 'Kimi Code quota from host-local credentials. No credentials leave the host.' });
}

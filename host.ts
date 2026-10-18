import { experimental_defineHostEntry } from '@get-bb/plugin-sdk';
import { hostContract } from './contract.ts';
import { collectUsage } from './collect.ts';
import { inspectHost } from './diagnostics.ts';
import { resolveNativeRoots } from './native-roots.ts';

export { experimental_providerBridge } from './bridge.ts';
export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    collect: async (_, context) => collectUsage(context.signal),
    inspect: async ({ checkUpdates }) => inspectHost(checkUpdates),
    resolveNativeRoots: async input => resolveNativeRoots(input),
  },
});

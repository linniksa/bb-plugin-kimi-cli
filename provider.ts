import type { BbPluginApi } from '@get-bb/plugin-sdk';

export const providerId = 'kimi-cli';
export const providerName = 'Kimi Code';
export const provider = {
  id: providerId,
  displayName: providerName,
  family: 'acp',
  icon: './icons/kimi.svg',
  experimental_bridgeOptions: {
    acpDialect: 'generic',
    acpLaunchSpec: { displayName: providerName, command: 'kimi', args: ['acp'], env: {} },
  },
  maintenance: { health: true, usage: true, installation: true },
  capabilities: {
    supportsServiceTier: false,
    supportsNativeUserQuestion: false,
    fork: 'none',
    supportsManualCompaction: false,
    supportsThreadArchive: false,
    supportsThreadRename: false,
    permissionModes: ['accept-edits', 'full'],
    reasoningLevels: ['medium'],
  },
  composerActions: [],
  models: { scope: 'host' },
  strings: {
    signInHint: 'Run `kimi login` on the machine to sign in.',
    expiredHint: 'Your Kimi Code session expired. Run `kimi login`, then reload.',
    installUrl: 'https://www.kimi.com/code/docs/en/kimi-code-cli/guides/getting-started',
  },
} satisfies Parameters<BbPluginApi['providers']['register']>[0];

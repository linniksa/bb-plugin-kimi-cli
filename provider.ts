import type { BbPluginApi } from '@get-bb/plugin-sdk';

export const providerId = 'acp-kimi';
export const provider = {
  id: providerId,
  displayName: 'Kimi Code',
  family: 'acp',
  icon: './icons/kimi.svg',
  experimental_bridgeOptions: {
    acpDialect: 'generic',
    acpLaunchSpec: { displayName: 'Kimi Code', command: 'kimi', args: ['acp'], env: {} },
  },
  maintenance: { health: true, usage: true, installation: false },
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
    signInHint: 'Run `kimi login` on this machine, then refresh.',
    expiredHint: 'Your Kimi Code login expired. Run `kimi login`, then refresh.',
    installUrl: 'https://github.com/MoonshotAI/kimi-cli',
  },
} satisfies Parameters<BbPluginApi['providers']['register']>[0];

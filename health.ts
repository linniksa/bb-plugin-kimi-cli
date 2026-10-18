import { providerHealthResultSchema } from '@get-bb/plugin-sdk/provider-bridge';
import { inspectInstallation } from './installation.ts';
import { readCredentials } from './credentials.ts';

export async function getHealth(installation?: Awaited<ReturnType<typeof inspectInstallation>>) {
  const found = installation ?? await inspectInstallation(false);
  const auth = found.status.installed ? await readCredentials(found.kind) : { status: 'not_installed' as const };
  return providerHealthResultSchema.parse({ supported: true, health: {
    status: auth.status === 'error' ? 'unknown' : auth.status,
    accountEmail: null, planLabel: null,
    statusMessage: auth.status === 'error' ? auth.message : null,
    installedVersion: found.status.currentVersion, minimumSupportedVersion: null,
    canInstall: !found.status.installed && found.command !== null,
    canUpdate: found.status.installed && found.command !== null,
    loginCommand: 'kimi login', localLoginCommand: 'kimi login',
  } });
}

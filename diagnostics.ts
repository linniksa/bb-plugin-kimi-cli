import { inspectInstallation } from './installation.ts';
import { getHealth } from './health.ts';
import { diagnosticsSchema } from './contract.ts';

export function pluginUpdateHint(source: string): string {
  return source.startsWith('path:')
    ? 'Plugin: local checkout on the BB server; BB does not download updates for path installs. Update the checkout, run `bb plugin build .` from that directory, then `bb plugin reload kimi-cli`.'
    : 'Plugin: run `bb plugin outdated`, then `bb plugin update kimi-cli`. BB applies compatible updates on request, not automatically; pinned versions stay pinned.';
}

export async function inspectHost(checkUpdates: boolean) {
  const found = await inspectInstallation(checkUpdates);
  const health = await getHealth(found);
  const hints: string[] = [];
  if (health.supported && ['unauthenticated', 'expired'].includes(health.health.status)) hints.push('Run `kimi login` on this machine, then refresh Provider usage.');
  if (!checkUpdates) hints.push('CLI updates were not checked. Add --check-updates to query the registry.');
  if (found.status.installAction) hints.push(`CLI: ${found.status.installAction.label} with ${found.status.installAction.command}. BB does not run this command during a status check.`);
  else if (!found.status.installed) hints.push('CLI is not installed and no supported installer is available on this machine. Install Kimi Code using its official installation guide.');
  else if (found.status.installed && !found.manager) hints.push('CLI installation source is unknown. Use its original installer; BB will not replace it automatically.');
  else if (checkUpdates && !found.status.latestVersion) hints.push('The CLI registry could not be checked. No update version was guessed.');
  else if (checkUpdates && !found.status.currentVersion) hints.push('The installed CLI version could not be read. No version comparison was made.');
  else if (checkUpdates) hints.push('CLI is current for its detected installation channel.');
  if (found.kind === 'python' && found.status.installed) {
    hints.push('Legacy Python Kimi Code: package-manager updates stay on Python. Migrating to the Node CLI is separate and requires its own login; sessions and credentials are not migrated by BB.');
    const disabled = /^(1|true|t|yes|y)$/i.test(process.env.KIMI_CLI_NO_AUTO_UPDATE ?? '');
    hints.push(`Python CLI automatic update checks: ${disabled ? 'disabled by KIMI_CLI_NO_AUTO_UPDATE' : 'not disabled by KIMI_CLI_NO_AUTO_UPDATE'}. Interactive startup reminders are not an automatic update service in ACP.`);
  } else if (found.kind === 'node' && found.status.installed) {
    hints.push(found.manager === 'native' ? 'The native CLI updater is available through `kimi upgrade`. BB update actions request it explicitly; this plugin does not enable unattended upgrades.' : 'CLI updates use the detected package manager. This plugin does not schedule unattended package-manager upgrades.');
  }
  return diagnosticsSchema.parse({ health, installation: found.status, kind: found.kind, manager: found.manager, hints });
}

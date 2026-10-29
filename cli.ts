import { cliCommand, defineCli, PluginCliError, type BbPluginApi, type ExperimentalHostClient } from '@get-bb/plugin-sdk';
import { hostContract } from './contract.ts';
import { pluginUpdateHint } from './diagnostics.ts';

export function statusCommand(sdk: BbPluginApi['sdk'], host: ExperimentalHostClient<typeof hostContract>) {
  return defineCli({ name: 'kimi', summary: 'Inspect Kimi Code login, installation and update guidance without changing the machine.', commands: {
    status: cliCommand({
      summary: 'Show local readiness and update hints; registry checks are opt-in.',
      options: {
        machine: { type: 'string', aliases: ['host'], description: 'Machine ID or exact name; otherwise use this thread or the only connected machine.' },
        'check-updates': { type: 'boolean', description: 'Query the CLI registry for the detected package manager; never install an update.' },
        json: { type: 'boolean', description: 'Print structured diagnostics without credentials.' },
      },
      async run(input, ctx) {
        let hostId: string | undefined;
        if (!input.options.machine && ctx.threadId) {
          const thread = await sdk.threads.get({ threadId: ctx.threadId });
          if (thread.environmentId) hostId = (await sdk.environments.get({ environmentId: thread.environmentId })).hostId;
        }
        if (!hostId) {
          const machines = (await sdk.hosts.list()).filter(h => input.options.machine ? h.id === input.options.machine || h.name === input.options.machine : h.status === 'connected' && h.type !== 'ephemeral');
          if (machines.length !== 1) throw new PluginCliError('Select one Kimi Code machine.', { code: 'machine_required', hint: 'Pass --machine <machine-id>; use bb machine list to inspect IDs.' });
          hostId = machines[0].id;
        }
        const [diagnostic, source] = await Promise.all([
          host.call('inspect', { checkUpdates: input.options['check-updates'] === true }, { hostId, signal: ctx.signal, timeoutMs: 30000 }),
          sdk.plugins.getSource({ pluginId: 'kimi-cli', signal: ctx.signal }),
        ]);
        const result = { ...diagnostic, hostId, hints: [...diagnostic.hints, pluginUpdateHint(source.requested)] };
        const status = diagnostic.health.supported ? diagnostic.health.health.status : 'unknown';
        const stdout = input.options.json ? JSON.stringify(result, null, 2) : [
          `Kimi Code: ${status}`, `CLI: ${diagnostic.installation.installed ? diagnostic.installation.currentVersion ?? 'version unknown' : 'not installed'} (${diagnostic.kind}; ${diagnostic.manager ?? 'unknown source'})`,
          ...result.hints.map(h => `- ${h}`),
        ].join('\n');
        return { exitCode: 0, stdout: `${stdout}\n` };
      },
    }),
  } });
}

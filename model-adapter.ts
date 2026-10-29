import { createHash } from 'node:crypto';
import { access, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, resolve } from 'node:path';
import { z } from 'zod';
import { experimental_acpLaunchSpecSchema, experimental_registerAcpDialect } from '@get-bb/plugin-sdk/provider-bridge/acp';
import { experimental_resolveExecutablePath, type AvailableModel } from '@get-bb/plugin-sdk/provider-bridge';
import { dataDirectory } from './credentials.ts';
import { pythonInterpreter, type CliKind } from './installation.ts';
import { loadModelMetadata, type ModelMetadata } from './model-metadata.ts';

export function presentKimiModel(model: AvailableModel, metadata: ModelMetadata | undefined, kind: CliKind): AvailableModel {
  if (!metadata) return model;
  const declared = kind === 'python' || metadata.efforts?.length === 0 ? ['off', 'on'] : metadata.efforts && ['off', ...metadata.efforts];
  const allowed = model.supportedReasoningEfforts.filter(e => (!declared || declared.includes(e.reasoningEffort))
    && !((metadata.thinking === 'always' || metadata.allowOff === false) && e.reasoningEffort === 'off') && !(metadata.thinking === 'none' && e.reasoningEffort !== 'off'));
  if (!allowed.length) return { ...model, displayName: metadata.label };
  const ids = allowed.map(e => e.reasoningEffort);
  const preferred = metadata.defaultEffort && ids.includes(metadata.defaultEffort) ? metadata.defaultEffort : model.defaultReasoningEffort;
  const efforts = allowed.length === 1 && metadata.thinking === 'always'
    ? allowed.map(e => e.reasoningEffort === 'on' ? { ...e, label: 'Always on',
      description: kind === 'python' ? 'Thinking is required; this Python CLI uses fixed high effort.' : 'Thinking is required by this model.' } : e)
    : allowed;
  return { ...model, displayName: metadata.label, supportedReasoningEfforts: efforts,
    defaultReasoningEffort: ids.includes(preferred) ? preferred : ids.includes('on') ? 'on' : ids[0] };
}

const catalogs = new Map<string, Record<string, ModelMetadata>>();
const object = z.record(z.string(), z.unknown());
async function executableInPath(env: NodeJS.ProcessEnv, cwd: string): Promise<string | null> {
  if (env.PATH === process.env.PATH) return experimental_resolveExecutablePath('kimi');
  const names = process.platform === 'win32' ? (env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').map(ext => `kimi${ext}`) : ['kimi'];
  for (const directory of (env.PATH ?? '').split(delimiter)) for (const name of names) {
    const path = resolve(cwd, directory, name);
    try { await access(path, constants.X_OK); if ((await stat(path)).isFile()) return path; }
    catch { /* Continue searching the child process's PATH. */ }
  }
  return null;
}
export async function adaptKimiRequest(message: unknown): Promise<unknown> {
  const envelope = z.object({ method: z.string(), params: object }).passthrough().safeParse(message);
  if (!envelope.success) return message;
  const params = envelope.data.params;
  const options = object.safeParse(params.options);
  const holder = options.success ? options.data : params;
  const providerOptions = object.safeParse(holder.providerOptions);
  if (!providerOptions.success) return message;
  const parsed = experimental_acpLaunchSpecSchema.safeParse(providerOptions.data.acpLaunchSpec);
  if (!parsed.success || parsed.data.command !== 'kimi' || parsed.data.args.length !== 1 || parsed.data.args[0] !== 'acp') return message;
  const vars = z.record(z.string(), z.string()).safeParse(holder.envVars ?? params.envVars ?? {});
  if (!vars.success) return message;
  const env = { ...process.env, ...vars.data, ...parsed.data.env };
  const executable = await executableInPath(env, parsed.data.cwd ?? (typeof params.cwd === 'string' ? params.cwd : process.cwd()));
  if (!executable) return message;
  if (await pythonInterpreter(await realpath(executable))) return message;
  const kind = 'node';
  const metadata = await loadModelMetadata(kind, envelope.data.method === 'model/list', env);
  const dialectId = `kimi-cli-${createHash('sha256').update(`${kind}:${dataDirectory(kind, env)}`).digest('hex').slice(0, 16)}`;
  if (!catalogs.has(dialectId)) experimental_registerAcpDialect({ id: dialectId, presentModel: model => presentKimiModel(model, catalogs.get(dialectId)?.[model.id], kind) });
  catalogs.set(dialectId, metadata);
  const launch = parsed.data;
  const next = { ...holder, providerOptions: { ...providerOptions.data, acpDialect: dialectId, acpLaunchSpec: launch } };
  return { ...envelope.data, params: options.success ? { ...params, options: next } : next };
}

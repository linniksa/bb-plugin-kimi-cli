import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'smol-toml';
import { z } from 'zod';
import { dataDirectory, readCredentials } from './credentials.ts';
import type { CliKind } from './installation.ts';

// null leaves effort support to the CLI; [] explicitly declares binary Thinking.
export type ModelMetadata = { label: string; thinking: 'always' | 'toggle' | 'none' | null; allowOff?: boolean; efforts: string[] | null; defaultEffort: string | null };
const localModel = z.object({
  provider: z.string().optional(), model: z.string().optional(), name: z.string().optional(),
  display_name: z.string().optional(), displayName: z.string().optional(), capabilities: z.array(z.string()).optional(),
  support_efforts: z.array(z.string().min(1)).optional(), supportEfforts: z.array(z.string().min(1)).optional(),
  default_effort: z.string().optional(), defaultEffort: z.string().optional(),
});
const configuredModel = localModel.extend({ overrides: localModel.omit({ provider: true, model: true, name: true }).optional() });
const remoteModel = z.object({ id: z.string().min(1), display_name: z.string().min(1).optional(), reasoning: z.object({
  type: z.enum(['only', 'both', 'none']), effort: z.object({ valid: z.array(z.string().min(1)).min(1), default: z.string().optional() }).optional(),
}).optional() });
const cache = new Map<string, { mtime: number; time: number; remote: unknown; value: Record<string, ModelMetadata> }>();

export function modelMetadata(input: unknown, remote: unknown = []): Record<string, ModelMetadata> {
  const config = z.object({ models: z.record(z.string(), z.unknown()).default({}) }).parse(input);
  const supplied = z.array(z.unknown()).parse(remote).flatMap(m => { const value = remoteModel.safeParse(m); return value.success ? [value.data] : []; });
  const result: Record<string, ModelMetadata> = Object.create(null);
  const aliases = new Map<string, string[]>();
  for (const [id, raw] of Object.entries(config.models)) {
    const parsed = configuredModel.safeParse(raw);
    if (!parsed.success) continue;
    const overrides = parsed.data.overrides;
    const model = { ...parsed.data, ...overrides };
    const upstream = model.provider === 'managed:kimi-code' ? supplied.find(m => m.id === model.model) : undefined;
    const reasoning = upstream?.reasoning;
    const efforts = overrides?.supportEfforts ?? overrides?.support_efforts
      ?? (reasoning ? reasoning.effort?.valid ?? [] : model.supportEfforts ?? model.support_efforts ?? null);
    const preferred = overrides?.defaultEffort ?? overrides?.default_effort
      ?? (reasoning ? reasoning.effort?.default : model.defaultEffort ?? model.default_effort);
    const capabilities = overrides?.capabilities;
    // The CLI can derive Thinking after applying overrides; absent raw flags do not prohibit it.
    const thinking = capabilities ? capabilities.includes('always_thinking') ? 'always' : capabilities.includes('thinking') ? 'toggle' : null
      : reasoning ? reasoning.type === 'only' ? 'always' : reasoning.type === 'both' ? 'toggle' : 'none'
      : model.capabilities?.includes('always_thinking') ? 'always' : model.capabilities?.includes('thinking') ? 'toggle' : null;
    result[id] = {
      label: overrides?.displayName ?? overrides?.display_name ?? upstream?.display_name ?? model.displayName ?? model.display_name ?? model.model ?? model.name ?? id,
      thinking,
      // Legacy managed catalogs lose the server's mandatory-thinking flag; Off needs an explicit declaration.
      allowOff: capabilities ? thinking === null ? undefined : thinking !== 'always' : reasoning ? reasoning.type !== 'only' : model.provider === 'managed:kimi-code' ? false : undefined,
      efforts, defaultEffort: preferred && efforts?.includes(preferred) ? preferred : null,
    };
    const name = model.model ?? model.name;
    if (name) aliases.set(name, [...(aliases.get(name) ?? []), id]);
  }
  for (const [name, ids] of aliases) if (!(name in result) && ids.length === 1) result[name] = result[ids[0]];
  return result;
}

export async function loadModelMetadata(kind: CliKind, refresh = false, env = process.env): Promise<Record<string, ModelMetadata>> {
  const path = join(dataDirectory(kind, env), 'config.toml');
  const key = `${kind}:${path}`;
  let text: string, mtime: number;
  try { [text, mtime] = await Promise.all([readFile(path, 'utf8'), stat(path).then(s => s.mtimeMs)]); }
  catch { return {}; }
  const cached = cache.get(key);
  if (!refresh && cached?.mtime === mtime && Date.now() - cached.time < 60000) return cached.value;
  const reuseRemote = !refresh && cached !== undefined && Date.now() - cached.time < 60000;
  let remote: unknown = reuseRemote ? cached.remote : [];
  const auth = reuseRemote ? null : await readCredentials(kind, env);
  if (auth?.status === 'ready') {
    try {
      const response = await fetch(`${auth.baseUrl}/models`, { headers: { Authorization: `Bearer ${auth.token}` }, redirect: 'error', signal: AbortSignal.timeout(3000) });
      if (response.ok) remote = z.object({ data: z.array(z.unknown()) }).parse(await response.json()).data;
    } catch { /* Offline discovery still uses the CLI's local catalog. */ }
  }
  try {
    const value = modelMetadata(parse(text), remote);
    cache.set(key, { mtime, time: reuseRemote ? cached.time : Date.now(), remote, value });
    return value;
  } catch { return {}; }
}

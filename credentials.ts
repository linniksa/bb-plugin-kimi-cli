import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'smol-toml';
import { z } from 'zod';
import type { CliKind } from './installation.ts';

const providerSchema = z.object({
  base_url: z.string().transform(s => s.replace(/\/$/, '')).pipe(z.enum(['https://api.kimi.com/coding/v1', 'https://api.kimi.ai/coding/v1'])),
  api_key: z.string().optional(),
  api_key_env: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).optional(),
  oauth: z.object({ storage: z.enum(['file', 'keyring']), key: z.string().regex(/^(?:oauth\/)?[a-zA-Z0-9-]+$/) }).optional(),
}).refine(p => [Boolean(p.api_key), Boolean(p.api_key_env), Boolean(p.oauth)].filter(Boolean).length <= 1);
const configSchema = z.object({ providers: z.record(z.string(), z.unknown()).default({}) });
const tokenSchema = z.object({ access_token: z.string().min(1), expires_at: z.number().finite().positive() });
type Credentials = { status: 'ready'; token: string; baseUrl: string }
  | { status: 'unauthenticated' | 'expired' }
  | { status: 'error'; message: string };

export function dataDirectory(kind: CliKind, env = process.env): string {
  return resolve(kind === 'python' ? env.KIMI_SHARE_DIR || join(env.HOME || homedir(), '.kimi') : env.KIMI_CODE_HOME || join(env.HOME || homedir(), '.kimi-code'));
}

// CLI credential helpers can migrate storage; health must only read existing files.
export async function readCredentials(kind: CliKind, env = process.env): Promise<Credentials> {
  const home = dataDirectory(kind, env);
  try {
    let text: string;
    try { text = await readFile(join(home, 'config.toml'), 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'unauthenticated' };
      throw error;
    }
    const raw = configSchema.parse(parse(text)).providers['managed:kimi-code'];
    if (!raw) return { status: 'unauthenticated' };
    const provider = providerSchema.parse(raw);
    let token = provider.api_key_env ? env[provider.api_key_env] : provider.api_key;
    if (provider.oauth) {
      if (kind === 'node' && provider.oauth.storage !== 'file') return { status: 'error', message: 'Open Kimi Code to migrate its keyring credentials, then refresh.' };
      let stored: string;
      try { stored = await readFile(join(home, 'credentials', `${provider.oauth.key.replace(/^oauth\//, '')}.json`), 'utf8'); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return provider.oauth.storage === 'keyring'
          ? { status: 'error', message: 'Open Kimi Code to migrate its keyring credentials, then refresh.' }
          : { status: 'unauthenticated' };
        throw error;
      }
      const credentials = tokenSchema.parse(JSON.parse(stored));
      if (credentials.expires_at <= Date.now() / 1000) return { status: 'expired' };
      token = credentials.access_token;
    }
    return token ? { status: 'ready', token, baseUrl: provider.base_url } : { status: 'unauthenticated' };
  } catch {
    return { status: 'error', message: 'Kimi Code configuration or credentials could not be read. Open Kimi Code to check its configuration.' };
  }
}

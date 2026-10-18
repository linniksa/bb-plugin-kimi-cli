import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, realpath } from 'node:fs/promises';
import { experimental_resolveExecutablePath } from '@get-bb/plugin-sdk/provider-bridge';
import { z } from 'zod';
import { parseUsage, usageSchema } from './usage.ts';
import { collector } from './collector.ts';

const exec = promisify(execFile);
const response = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), payload: z.unknown(), account: z.unknown().optional() }),
  z.object({ status: z.enum(['unauthenticated', 'expired', 'error']) }),
]);

export async function collectUsage(signal?: AbortSignal): Promise<z.infer<typeof usageSchema>> {
  const base = { accountEmail: null, planLabel: null };
  const executable = await experimental_resolveExecutablePath('kimi');
  if (!executable) return { ...base, status: 'not_installed' };
  try {
    const firstLine = (await readFile(await realpath(executable), 'utf8')).split('\n')[0];
    const python = firstLine?.match(/^#!(\/[^\r\n]+\/python[\d.]*)$/)?.[1];
    if (!python) return { ...base, status: 'error', message: 'Account and quota collection requires Python Kimi Code (tested with 1.50.0).' };
    const { stdout } = await exec(python, ['-c', collector], {
      timeout: 30000, maxBuffer: 128 * 1024, signal,
    });
    const result = response.parse(JSON.parse(stdout));
    if (result.status === 'ok') return parseUsage(result.payload, result.account);
    if (result.status === 'error') return { ...base, status: 'error', message: 'Kimi quota could not be collected. Check Kimi Code /usage.' };
    return { ...base, status: result.status };
  } catch {
    return { ...base, status: 'error', message: 'Kimi quota collection failed or returned an unsupported response.' };
  }
}

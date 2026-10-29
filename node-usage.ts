import { z } from 'zod';
import { parseUsage, usageSchema, usageBase } from './usage.ts';
import { readCredentials } from './credentials.ts';

// Tokens stay read-only: Kimi owns refresh-token rotation and the cross-process refresh lock.
export async function collectNodeUsage(signal?: AbortSignal): Promise<z.infer<typeof usageSchema>> {
  const auth = await readCredentials('node');
  if (auth.status !== 'ready') return { ...usageBase, ...auth };
  try {
    const request = (path: string, timeout: number) => fetch(`${auth.baseUrl}/${path}`, {
      headers: { Authorization: `Bearer ${auth.token}`, Accept: 'application/json' },
      redirect: 'error',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
    });
    const usageResponse = await request('usages', 15000);
    if (usageResponse.status === 401) return { ...usageBase, status: 'expired' };
    if (!usageResponse.ok) return { ...usageBase, status: 'error', message: `Kimi Code quota request failed (HTTP ${usageResponse.status}).` };
    const quota = await usageResponse.json();
    let profile: unknown = null;
    try {
      const response = await request('me', 4000);
      if (response.ok) profile = await response.json();
    } catch { /* An unavailable profile must not discard an already collected quota. */ }
    return parseUsage(quota, profile);
  } catch {
    return { ...usageBase, status: 'error', message: 'Kimi Code account or quota data is unavailable or unsupported.' };
  }
}

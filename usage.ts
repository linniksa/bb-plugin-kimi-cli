import { z } from 'zod';

const amount = z.union([z.number(), z.string().regex(/^\d+(\.\d+)?$/)]).transform(Number).pipe(z.number().finite().nonnegative());
const detail = z.object({ limit: amount.pipe(z.number().positive()), used: amount.optional(), remaining: amount.optional(), resetTime: z.string().datetime({ offset: true }).optional() }).refine(d => d.used !== undefined || d.remaining !== undefined);
const payload = z.object({ usage: detail, limits: z.array(z.object({ window: z.object({ duration: z.number().positive(), timeUnit: z.string() }), detail })).default([]) });
export const usageBase = { accountKey: null, accountEmail: null, planLabel: null };
const accountKey = z.string().min(1).nullable().default(null);
export const usageSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), accountKey, accountEmail: z.string().nullable(), planLabel: z.string().nullable(), windows: z.array(z.object({ id: z.string(), kind: z.enum(['weekly', 'five-hour', 'custom']), label: z.string(), usedPercent: z.number().nonnegative(), resetsAt: z.string().nullable(), model: z.null(), cost: z.null() })) }),
  z.object({ status: z.enum(['not_installed', 'unauthenticated', 'expired']), accountKey, accountEmail: z.null(), planLabel: z.null() }),
  z.object({ status: z.literal('error'), accountKey, accountEmail: z.null(), planLabel: z.null(), message: z.string() }),
]);
const accountSchema = z.object({
  user_id: z.string().min(1),
  email: z.string().nullish(),
  nickname: z.string().nullish(),
  user_level_name: z.string().nullish(),
});
export function parseUsage(input: unknown, profile: unknown = null): z.infer<typeof usageSchema> {
  const account = accountSchema.safeParse(profile);
  const email = account.success ? z.email().safeParse(account.data.email) : null;
  const identity = { accountKey: account.success ? `moonshot:kimi-code:user:${encodeURIComponent(account.data.user_id)}` : null, accountEmail: email?.success ? email.data : null, planLabel: account.success ? account.data.user_level_name || null : null };
  const data = payload.parse(input);
  const rows = [{ detail: data.usage, id: 'weekly', kind: 'weekly' as const, label: 'Weekly limit' }, ...data.limits.map((r, i) => ({ detail: r.detail, id: `limit-${i}`, kind: r.window.duration === 300 && r.window.timeUnit === 'TIME_UNIT_MINUTE' ? 'five-hour' as const : 'custom' as const, label: `${r.window.duration} ${r.window.timeUnit.replace('TIME_UNIT_', '').toLowerCase()} limit` }))];
  return { status: 'ok', ...identity, windows: rows.map(({ detail: d, ...row }) => ({ ...row,
    // Percentage consumed = 100 × used quota / quota limit; remaining is the fallback supplied by Kimi.
    usedPercent: Math.max(0, 100 * (d.used ?? d.limit - d.remaining!) / d.limit), resetsAt: d.resetTime ?? null, model: null, cost: null })) };
}

import { defineRpcContract } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { usageSchema } from './usage.ts';
export const measurement = z.object({ accountKey: z.string().min(1).nullable(), observedAt: z.number().int().nonnegative().nullable(), usage: usageSchema });
export const usageContract = defineRpcContract({
  'provider-usage.v1.listResources': { input: z.object({}), output: z.object({ resources: z.array(z.object({ accountKey: z.string().min(1).nullable(), id: z.string(), providerId: z.string(), label: z.string(), scope: z.object({ kind: z.literal('host'), hostId: z.string(), hostName: z.string() }) })) }), experimental_description: 'List Kimi Code quota resources, including disconnected machines, without contacting Kimi.' },
  'provider-usage.v1.getResource': { input: z.object({ resourceId: z.string().min(1), refresh: z.boolean() }), output: measurement, experimental_description: 'Collect subscription usage using the existing Kimi Code login on the selected machine.' },
});
export const hostContract = defineRpcContract({
  collect: { input: z.object({}), output: usageSchema },
});

import { z } from 'zod';
export class CampaignError extends Error {
  constructor(message: string, readonly status = 422) { super(message); }
}
export const expected = z.number().int().positive();
export const metadataInput = z.object({ name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000) });
export const assistantInput = z.object({instructions:z.string().trim().max(6000),enabled:z.boolean()});
export type AssistantConfig = z.infer<typeof assistantInput>;
export const emptyAssistant: AssistantConfig = {instructions:'',enabled:false};
export const now = () => new Date().toISOString();
export function ensure(value: unknown, message: string, status = 409): asserts value {
  if (!value) throw new CampaignError(message, status);
}

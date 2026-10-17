import { z } from 'zod';
import { CampaignError } from '../contracts';
export const kinds = ['business', 'product', 'faq', 'note'] as const;
const text = z.string().trim().max(6000),
  short = z.string().trim().max(300);
const business = z
  .object({
    name: short,
    description: text,
    address: text,
    hours: text,
    contact: text,
    escalation: text,
    coverage: text,
    policies: text,
  })
  .strict();
const product = z
  .object({
    name: short,
    description: text,
    price: z.string().regex(/^(?:\d{1,9}(?:\.\d{1,2})?)?$/),
    currency: z.string().regex(/^(?:[A-Z]{3})?$/),
    priceVerifiedAt: z.string().regex(/^(?:\d{4}-\d{2}-\d{2})?$/),
    availability: short,
    variations: text,
    category: short,
    notes: text,
  })
  .strict();
const faq = z
  .object({ question: short.min(1), answer: text.min(1), topic: short, alternates: text })
  .strict();
const note = z.object({ title: short.min(1), body: text.min(1) }).strict();
export const itemInput = z
  .object({
    kind: z.enum(kinds),
    fields: z.record(z.string(), z.string()),
    enabled: z.boolean(),
    expectedRevision: z.string().regex(/^\d+$/).optional(),
  })
  .strict();
export function redact(value: string) {
  return value
    .replace(/\b(?:sk|AIza|ghp|github_pat)[-_a-zA-Z0-9]{16,}\b/g, '[secret removed]')
    .replace(
      /\b(password|api[_ -]?key|secret|token)\s*[:=]\s*(?!\[secret removed\])[^\s,;]+/gi,
      '$1: [secret removed]',
    )
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
      '[private key removed]',
    );
}
export function normalize(value: string) {
  return redact(
    value
      .normalize('NFKC')
      .replace(/\r\n?/g, '\n')
      .split('')
      .filter((c) => c.charCodeAt(0) >= 32 || c === '\n' || c === '\t')
      .join('')
      .trim(),
  );
}
export function unsafe(value: string) {
  return /(?:ignore|override|disregard)\s+(?:all\s+|previous\s+|prior\s+|system\s+)*(?:instructions|rules)|(?:system|developer)\s*prompt|reveal\s+(?:secret|password|token)|<script|javascript:|<!DOCTYPE|<!ENTITY/i.test(
    value,
  );
}
export function parseItem(input: unknown) {
  const v = itemInput.parse(input),
    schema = { business, product, faq, note }[v.kind],
    parsed = schema.parse(v.fields);
  const fields = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, normalize(v)]));
  if (v.kind === 'product' && fields.price && !fields.currency) throw new CampaignError('A currency is required with a price');
  const title = fields.name || fields.question || fields.title || 'Business information';
  const content = Object.entries(fields)
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        (k === 'priceVerifiedAt'
          ? 'Price last confirmed'
          : k.charAt(0).toUpperCase() + k.slice(1)) +
        ': ' +
        v,
    )
    .join('\n');
  if (unsafe(content)) throw new CampaignError('KNOWLEDGE_UNSAFE_CONTENT');
  return { ...v, title: normalize(title), fields, text: content };
}
export type KnowledgeFact = {
  id: string;
  kind: string;
  title: string;
  fields: Record<string, string>;
  text: string;
};
export function fact(row: Record<string, unknown>): KnowledgeFact {
  return {
    id: String(row.id),
    kind: String(row.kind),
    title: String(row.title),
    fields: row.fields as Record<string, string>,
    text: String(row.text_content),
  };
}

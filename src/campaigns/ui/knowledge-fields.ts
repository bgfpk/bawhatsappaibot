export type Item = {
  id: string;
  kind: string;
  title: string;
  fields: Record<string, string>;
  enabled: boolean;
  revision: string;
  document_id: string | null;
  updated_at: string;
};
export type DocumentRow = {
  id: string;
  name: string;
  format: string;
  state: string;
  error_code: string | null;
  attempts: number;
  updated_at: string;
};
export type KnowledgeData = {
  items: Item[];
  removedItems: Item[];
  documents: DocumentRow[];
  removedDocuments: DocumentRow[];
  revision: string;
  instructionRevision: string;
  publishedAt: string;
  publishedCount: number;
  unpublished: boolean;
};
export const sections = [
  ['business', 'Business Information'],
  ['products', 'Products & Services'],
  ['faqs', 'FAQs'],
  ['documents', 'Documents'],
  ['notes', 'Business Notes'],
] as const;
export const fields: Record<string, Array<[string, string, string?]>> = {
  business: [
    ['name', 'Business name'],
    ['description', 'About the business', 'long'],
    ['address', 'Address or location', 'long'],
    ['hours', 'Business hours', 'long'],
    ['contact', 'Contact details'],
    ['escalation', 'Who should customers contact for help?'],
    ['coverage', 'Delivery or service coverage', 'long'],
    ['policies', 'Policies and important rules', 'long'],
  ],
  product: [
    ['name', 'Name'],
    ['description', 'Description', 'long'],
    ['price', 'Price (leave blank if unknown)'],
    ['currency', 'Currency (three letters)'],
    ['priceVerifiedAt', 'Price last confirmed', 'date'],
    ['availability', 'Availability'],
    ['variations', 'Variations', 'long'],
    ['category', 'Category'],
    ['notes', 'Notes', 'long'],
  ],
  faq: [
    ['question', 'Question'],
    ['answer', 'Answer', 'long'],
    ['topic', 'Topic'],
    ['alternates', 'Other ways customers ask this question', 'long'],
  ],
  note: [
    ['title', 'Title'],
    ['body', 'Business note', 'long'],
  ],
};

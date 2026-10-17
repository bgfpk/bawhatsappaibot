import { pathToFileURL } from 'node:url';
import path from 'node:path';

// Explicitly disposable bootstrap for copied tests that import legacy services.
if (process.env.BLACKARROW_STAGE !== '1' || process.env.BLACKARROW_DISPOSABLE_TEST !== '1') {
  throw new Error('Review fixtures require isolated disposable test flags');
}
const source = relative => pathToFileURL(path.resolve(relative)).href;
const { registerStageDocuments } = await import(source('src/staging/registry.ts'));
const { StageDocumentStore } = await import(source('src/staging/document-store.ts'));
registerStageDocuments(new StageDocumentStore(':memory:'));

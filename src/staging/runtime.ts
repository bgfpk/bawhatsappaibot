import fs from 'node:fs';
import { stageDocuments } from './document-store';
import { registerStageDocuments } from './registry';

export const isStaging = process.env.BLACKARROW_STAGE === '1';
export const stageStateDirectory = '/state';
if (isStaging) {
  process.umask(0o077);
  const forbidden = Object.keys(process.env).filter(name =>
    /^(APPWRITE_.*(?:KEY|PROJECT|ENDPOINT)|REDIS_URL|GEMINI_API_KEY|DEEPINFRA_API_KEY|GOOGLE_API_KEY|WHATSAPP_.*TOKEN)$/.test(name)
    && process.env[name]);
  if (forbidden.length) throw new Error('External service configuration forbidden in isolated staging');
  const custody = JSON.parse(fs.readFileSync(`${stageStateDirectory}/custody.json`, 'utf8'));
  if (typeof custody.sessionSecret !== 'string' || custody.sessionSecret.length < 64) {
    throw new Error('Independent staging session custody is missing');
  }
  if (typeof custody.encryptionSecret !== 'string' || custody.encryptionSecret.length < 64
    || custody.encryptionSecret === custody.sessionSecret) {
    throw new Error('Independent staging encryption custody is missing');
  }
  registerStageDocuments(stageDocuments());
  process.env.AUTH_SESSION_SECRET = custody.sessionSecret;
  process.env.BLACKARROW_SECRET_ENCRYPTION_KEY = custody.encryptionSecret;
}

import fs from 'node:fs';
import { stageDocuments } from './document-store';
import { hashPassword } from '../services/password-security';

const custody = JSON.parse(fs.readFileSync('/state/custody.json', 'utf8'));
const documents = stageDocuments();
const existing = await documents.listDocuments('blackarrow_stage', 'users');
if (existing.total !== 0) throw new Error('Refusing to replace an existing staging account');
await documents.createDocument('blackarrow_stage', 'users', 'blackarrow-stage-owner', {
  email: custody.email, name: 'Staging Owner', password_hash: hashPassword(custody.password),
  role: 'user', created_at: Math.floor(Date.now() / 1000),
});
console.log('Independent staging owner created; no campaign, customer, number or billing records seeded.');
documents.close();

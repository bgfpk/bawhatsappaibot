import { allowedOrigin, isPublicConversion } from './origin';
import { installPublicAuth, productionAccount } from './public-auth';
import express, { type Express } from 'express';
import { isStaging } from './runtime';
import { stageDocuments } from './document-store';
import { campaignRoutes } from '../campaigns/routes';
import { campaignStore } from '../campaigns/store';
import { geminiRoutes } from '../gemini/routes';
import { numberRoutes } from '../numbers/routes';
import { catalogueRoutes } from '../catalogue/routes';
import { conversationStatusRoutes } from '../conversation/routes';

const allowed = new Set([
  'POST /api/auth/login', 'POST /api/auth/logout',
  'GET /api/user/preferences', 'PATCH /api/user/preferences',
]);
export function installStageBoundary(app: Express, account: (req: any, res: any) => Promise<any>, safeUser: (user: any) => any) {
  if (!isStaging) return;
  if (isPublicConversion) account = productionAccount;
  app.use((req, res, next) => {
    if (/\.(?:cjs|map)$/.test(req.path)) return res.status(404).end();
    next();
  });
  app.use('/api/campaigns/:id/knowledge/documents', express.json({ limit: '3mb' }));
  app.use('/api/campaigns', express.json({ limit: '128kb' }));
  app.use(express.json({ limit: '32kb' }));
  app.use((error: any, _req: any, res: any, _next: any) => {
    res.status(error.status === 413 ? 413 : 400).json({ error: 'Invalid staging request body' });
  });
  app.post('/api/auth/login', (req, res, next) => {
    if (typeof req.body?.email !== 'string' || typeof req.body?.password !== 'string'
      || req.body.email.length > 254 || req.body.password.length > 256) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    next();
  });
  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  installPublicAuth(app);
  if (!isPublicConversion) app.get('/api/release', (_req,res)=>res.json({public:false}));
  app.get('/api/health', (_req, res) => {
    const storage = stageDocuments().health();
    res.status(storage ? 200 : 503).json({ application: 'Black Arrow', environment: isPublicConversion ? 'converted-public' : 'isolated-staging', storage,
      ai: 'owner-initiated-gemini', whatsapp: 'disabled', schedulers: 'disabled' });
  });
  if (!isPublicConversion) app.get('/api/auth/session', async (req, res) => {
    const user = await account(req, res);
    if (user) res.json({ user: safeUser(user) });
  });
  numberRoutes(app, campaignStore(), account);
  catalogueRoutes(app, campaignStore(), account);
  conversationStatusRoutes(app, campaignStore(), account);
  campaignRoutes(app, campaignStore(), account);
  geminiRoutes(app, campaignStore(), account);
  app.use('/api', async (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !allowedOrigin(req.get('origin'))) {
      return res.status(403).json({ error: 'A same-origin staging request is required' });
    }
    if (!isPublicConversion && allowed.has(`${req.method} ${req.baseUrl}${req.path}`)) return next();
    const user = await account(req, res);
    if (user) res.status(503).json({ error: 'This capability is unavailable in this conversion. No external operation was performed.', code: 'STAGING_CAPABILITY_DISABLED' });
  });
}

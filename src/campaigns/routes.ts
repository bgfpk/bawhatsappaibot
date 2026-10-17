import { allowedOrigin } from '../staging/origin';
import express, { type Express } from 'express';
import { z } from 'zod';
import { CampaignStore } from './store';
import { CampaignPublications } from './publications';
import { CampaignKnowledge } from './knowledge/repository';
import { CampaignDocuments } from './knowledge/documents';
import { expected } from './contracts';
import { retrievePublished } from './runtime-context';

export function campaignRoutes(app: Express, store: CampaignStore, account: (req:any,res:any)=>Promise<any>) {
  const pub = new CampaignPublications(store), knowledge = new CampaignKnowledge(store), docs = new CampaignDocuments(store);
  const router = express.Router();
  const route = (method: 'get'|'post'|'patch', path: string, work: (actor:string, req:any)=>any) => router[method](path,async(req,res)=>{
    try {
      const user = await account(req,res); if (!user) return;
      if (!['GET','HEAD'].includes(req.method) && !allowedOrigin(req.get('origin'))) {
        res.status(403).json({error:'A same-origin request is required'}); return;
      }
      if (req.params.id) z.string().uuid().parse(req.params.id);
      res.json(await work(String(user.$id||user.id),req));
    } catch (error:any) {
      const status = error instanceof z.ZodError ? 422 : Number(error.status)||500;
      if (status===500) console.error('[Black Arrow campaigns] Request failed', {method:req.method,path:req.route?.path});
      res.status(status).json({error:error instanceof z.ZodError ? 'Check required fields and supported values.' :
        status===500 ? 'Unable to complete this campaign operation.' : error.message});
    }
  });
  route('get','/campaigns',(a,r)=>({campaigns:store.list(a,String(r.query.search||''),String(r.query.state||''))}));
  route('post','/campaigns',(a,r)=>({campaign:store.create(a,r.body)}));
  route('get','/recently-deleted',(a)=>({campaigns:store.list(a,'','',true)}));
  route('get','/numbers',(a)=>({numbers:store.numbers(a),transport:'not_active',plannedTransport:'QR-first, authorization required'}));
  route('get','/campaigns/:id',(a,r)=>pub.state(a,r.params.id));
  route('patch','/campaigns/:id',(a,r)=>{
    const {expectedRevision,metadata} = z.object({expectedRevision:expected,metadata:z.unknown()}).strict().parse(r.body);
    return {campaign:store.edit(a,r.params.id,expectedRevision,metadata)};
  });
  route('post','/campaigns/:id/lifecycle',(a,r)=>{
    const data=z.object({expectedRevision:expected,action:z.enum(['pause','resume','archive','restore','delete','cancel_removal']),confirmation:z.string().max(120).optional()}).strict().parse(r.body);
    return {campaign:store.lifecycle(a,r.params.id,data.expectedRevision,data.action,data.confirmation)};
  });
  route('get','/campaigns/:id/numbers',(a,r)=>({numbers:store.numbers(a,r.params.id),transport:'not_active'}));
  route('get','/campaigns/:id/assistant',(a,r)=>pub.state(a,r.params.id));
  route('patch','/campaigns/:id/assistant',(a,r)=>{
    const data=z.object({expectedRevision:expected,config:z.unknown()}).strict().parse(r.body);
    return pub.save(a,r.params.id,data.expectedRevision,data.config);
  });
  route('post','/campaigns/:id/publish',(a,r)=>pub.publish(a,r.params.id,z.object({expectedRevision:expected}).strict().parse(r.body).expectedRevision));
  route('get','/campaigns/:id/versions',(a,r)=>({versions:pub.history(a,r.params.id)}));
  route('post','/campaigns/:id/rollback',(a,r)=>{
    const data=z.object({expectedRevision:expected,version:expected}).strict().parse(r.body);
    return pub.rollback(a,r.params.id,data.expectedRevision,data.version);
  });
  route('get','/campaigns/:id/knowledge',(a,r)=>knowledge.list(a,r.params.id));
  for (const updating of [false,true]) route(updating?'patch':'post','/campaigns/:id/knowledge/items'+(updating?'/:item':''),(a,r)=>{
    const data=z.object({expectedRevision:expected,item:z.unknown()}).strict().parse(r.body);
    return knowledge.save(a,r.params.id,data.expectedRevision,data.item,updating?r.params.item:undefined);
  });
  for (const action of ['remove','restore']) route('post','/campaigns/:id/knowledge/items/:item/'+action,(a,r)=>
    knowledge.remove(a,r.params.id,z.object({expectedRevision:expected}).strict().parse(r.body).expectedRevision,r.params.item,action==='restore'));
  route('post','/campaigns/:id/knowledge/documents',(a,r)=>{
    const data=z.object({expectedRevision:expected,name:z.string().max(160),base64:z.string().max(2796204)}).strict().parse(r.body);
    return docs.upload(a,r.params.id,data.expectedRevision,data);
  });
  route('get','/campaigns/:id/knowledge/documents/:document',(a,r)=>docs.detail(a,r.params.id,r.params.document));
  route('post','/campaigns/:id/knowledge/documents/:document/remove',(a,r)=>docs.remove(a,r.params.id,z.object({expectedRevision:expected}).strict().parse(r.body).expectedRevision,r.params.document));
  route('get','/campaigns/:id/knowledge/retrieve',(a,r)=>retrievePublished(store,a,r.params.id,z.string().max(1000).parse(r.query.query||'')));
  app.use('/api',router);
}

import { installConnectionEngine } from '../connections/engine';
import { allowedOrigin } from '../staging/origin';
import express,{type Express} from 'express';
import { z } from 'zod';
import { CampaignStore } from '../campaigns/store';
import { CampaignError,expected } from '../campaigns/contracts';
import { NumberRepository } from './repository';
import { NumberSessions } from './sessions';
import { numberName } from './contracts';
import { installConversationRuntime } from '../conversation/runtime';

export function numberRoutes(app:Express,store:CampaignStore,account:(req:any,res:any)=>Promise<any>) {
  const numbers=new NumberRepository(store),sessions=new NumberSessions(numbers),router=express.Router();
  installConversationRuntime(store,sessions);
  const engine=installConnectionEngine(store,sessions);
  const route=(method:'get'|'post',path:string,work:(actor:string,req:any)=>any)=>router[method](path,async(req,res)=>{
    try {
      const user=await account(req,res);if(!user)return;
      if(req.method!=='GET'&&!allowedOrigin(req.get('origin')))return res.status(403).json({error:'A same-origin request is required'});
      if(req.params.id)z.string().uuid().parse(req.params.id);
      if(req.params.number)z.string().uuid().parse(req.params.number);
      res.json(await work(String(user.$id||user.id),req));
    }catch(error:any) {
      const known=error instanceof CampaignError;
      res.status(error instanceof z.ZodError?422:known?error.status:500).json({error:error instanceof z.ZodError?
        'Check the name, international phone format and required confirmation.':known?error.message:'Unable to complete this number operation.'});
    }
  });
  const list=(a:string,c?:string,removed=false)=>({numbers:numbers.list(a,c,removed),campaigns:store.list(a).filter(c=>['active','paused'].includes(String(c.lifecycle))),
    transport:'unavailable',qrAvailable:false,authorizationRequired:true});
  route('get','/numbers',(a,r)=>list(a,undefined,r.query.removed==='1'));
  route('get','/campaigns/:id/numbers',(a,r)=>list(a,r.params.id));
  route('post','/numbers',(a,r)=>({number:numbers.create(a,r.body)}));
  route('post','/numbers/:number/rename',(a,r)=>{
    const v=z.object({expectedRevision:expected,name:numberName}).strict().parse(r.body);
    return {number:numbers.rename(a,r.params.number,v.expectedRevision,v.name)};
  });
  route('post','/numbers/:number/assignment',(a,r)=>{
    const v=z.object({expectedRevision:expected,sourceCampaignId:z.string().uuid().nullable(),targetCampaignId:z.string().uuid().nullable(),confirmation:numberName}).strict().parse(r.body);
    return {number:numbers.assign(a,r.params.number,v.expectedRevision,v.sourceCampaignId,v.targetCampaignId,v.confirmation)};
  });
  for(const action of ['connection','disconnect','restore'] as const)route('post','/numbers/:number/'+action,(a,r)=>{
    const {expectedRevision}=z.object({expectedRevision:expected}).strict().parse(r.body);
    return action==='connection'?engine.request(a,r.params.number,expectedRevision):{number:action==='restore'?numbers.restore(a,r.params.number,expectedRevision):engine.stop(a,r.params.number,expectedRevision)};
  });
  route('get','/numbers/:number/connection',(a,r)=>engine.readiness(a,r.params.number));
  route('post','/numbers/:number/connection/reset',(a,r)=>{
    const v=z.object({expectedRevision:expected,confirmation:z.literal('RESET PAIRING')}).strict().parse(r.body);
    return {number:engine.stop(a,r.params.number,v.expectedRevision,true)};
  });
  route('post','/numbers/:number/remove',(a,r)=>{
    const v=z.object({expectedRevision:expected,confirmation:numberName}).strict().parse(r.body);
    return {number:numbers.remove(a,r.params.number,v.expectedRevision,v.confirmation)};
  });
  app.use('/api',router);
}

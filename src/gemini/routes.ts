import { allowedOrigin } from '../staging/origin';
import express,{type Express} from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CampaignStore } from '../campaigns/store';
import { GeminiService } from './service';
import { GeminiError } from './errors';
import { CampaignError } from '../campaigns/contracts';

export function geminiRoutes(app:Express,store:CampaignStore,account:(req:any,res:any)=>Promise<any>) {
  const service=new GeminiService(store),router=express.Router();
  const uuid=z.string().uuid();
  const route=(method:'get'|'post',path:string,work:(actor:string,req:any)=>any)=>router[method](path,async(req,res)=>{
    try {
      const user=await account(req,res);if(!user)return;
      if(req.method!=='GET'&&!allowedOrigin(req.get('origin')))
        return res.status(403).json({error:'A same-origin request is required'});
      if(req.params.id)uuid.parse(req.params.id);
      res.json(await work(String(user.$id||user.id),req));
    }catch(error:any) {
      const known=error instanceof GeminiError||error instanceof CampaignError;
      res.status(error instanceof z.ZodError?422:known?error.status:500).json({
        error:error instanceof z.ZodError?'Check the required fields and try again.':known?error.message:'Unable to complete this Gemini operation.',
        category:error instanceof GeminiError?error.category:'validation'});
    }
  });
  const settings='/account/ai/gemini';
  route('get',settings,a=>service.settings.status(a));
  route('post',settings+'/save',(a,r)=>{
    const v=z.object({apiKey:z.string().trim().min(24).max(1024),expectedRevision:z.number().int().nonnegative()}).strict().parse(r.body);
    return service.settings.save(a,v.expectedRevision,v.apiKey);
  });
  route('post',settings+'/remove',(a,r)=>service.settings.remove(a,z.object({expectedRevision:z.number().int().positive()}).strict().parse(r.body).expectedRevision));
  route('post',settings+'/test',(a,r)=>service.testConnection(a,z.object({requestId:uuid}).strict().parse(r.body).requestId));
  const session=(r:any)=>createHash('sha256').update(String(r.headers.cookie||'')).digest('hex');
  route('post','/campaigns/:id/assistant/test',(a,r)=>service.send(a,r.params.id,session(r),z.object({requestId:uuid,
    message:z.string().trim().min(1).max(4000),conversationId:uuid.optional()}).parse(r.body)));
  route('post','/campaigns/:id/assistant/test/clear',(a,r)=>{
    store.owned(a,r.params.id);const {conversationId}=z.object({conversationId:uuid}).strict().parse(r.body);
    service.conversations.clear(a,r.params.id,session(r),conversationId);return {cleared:true};
  });
  route('get','/campaigns/:id/assistant/test/status',(a,r)=>{
    store.owned(a,r.params.id);return {settings:service.settings.status(a),transport:'disabled'};
  });
  app.use('/api',router);
}

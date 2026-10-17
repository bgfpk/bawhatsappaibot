import { allowedOrigin } from '../staging/origin';
import type { Express } from 'express';
import { z } from 'zod';
import { CampaignStore } from '../campaigns/store';
import { ConversationMemory } from './memory';
export function conversationStatusRoutes(app:Express,store:CampaignStore,account:(r:any,s:any)=>Promise<any>){
 const memory=new ConversationMemory(store);
 app.get('/api/campaigns/:id/assistant/alerts',async(req,res)=>{
  try{const user=await account(req,res);if(!user)return;const a=String(user.$id||user.id);z.string().uuid().parse(req.params.id);store.owned(a,req.params.id);
   res.json({alerts:store.db.prepare('SELECT category,created_at FROM conversation_alerts WHERE account_id=? AND campaign_id=? AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 20').all(a,req.params.id)});
  }catch{res.status(404).json({error:'Campaign not found'});}
 });
 app.post('/api/campaigns/:id/assistant/memory/reset',async(req,res)=>{
  try{const user=await account(req,res);if(!user)return;if(!allowedOrigin(req.get('origin')))return res.status(403).json({error:'A same-origin request is required'});
   z.string().uuid().parse(req.params.id);const value=z.object({confirmation:z.literal('RESET SAVED CONTEXT')}).strict().parse(req.body);
   res.json(memory.reset(String(user.$id||user.id),req.params.id));
  }catch{res.status(422).json({error:'Check campaign ownership and reset confirmation'});}
 });
 // No synthetic-inbound, worker, provider or delivery endpoint is exposed.
}

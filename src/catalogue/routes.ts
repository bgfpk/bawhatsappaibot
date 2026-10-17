import { allowedOrigin } from '../staging/origin';
import express,{type Express} from 'express';
import { z } from 'zod';
import { CampaignStore } from '../campaigns/store';
import { CampaignError,expected } from '../campaigns/contracts';
import { CampaignCatalogue } from './repository';
export function catalogueRoutes(app:Express,store:CampaignStore,account:(req:any,res:any)=>Promise<any>){
 const catalogue=new CampaignCatalogue(store),router=express.Router();
 const route=(method:'get'|'post'|'patch',path:string,work:(a:string,r:any)=>any)=>router[method](path,async(req,res)=>{
  try{const user=await account(req,res);if(!user)return;
   if(req.method!=='GET'&&!allowedOrigin(req.get('origin')))return res.status(403).json({error:'A same-origin request is required'});
   z.string().uuid().parse(req.params.id);if(req.params.item)z.string().uuid().parse(req.params.item);
   res.json(work(String(user.$id||user.id),req));
  }catch(e:any){res.status(e instanceof z.ZodError?422:e instanceof CampaignError?e.status:500).json({error:e instanceof z.ZodError?'Check the product or service details.':e instanceof CampaignError?e.message:'Unable to save catalogue changes.'});}
 });
 const base='/campaigns/:id/catalogue';
 route('get',base,(a,r)=>catalogue.list(a,r.params.id));
 for(const editing of [false,true])route(editing?'patch':'post',base+(editing?'/:item':''),(a,r)=>{
  const v=z.object({expectedRevision:expected,item:z.unknown()}).strict().parse(r.body);
  return catalogue.save(a,r.params.id,v.expectedRevision,v.item,editing?r.params.item:undefined);
 });
 for(const action of ['archive','restore'])route('post',base+'/:item/'+action,(a,r)=>catalogue.archive(a,r.params.id,z.object({expectedRevision:expected}).strict().parse(r.body).expectedRevision,r.params.item,action==='restore'));
 app.use('/api',router);
}

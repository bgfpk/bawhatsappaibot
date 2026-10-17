import React,{useEffect,useState} from 'react';
import { stageApi } from '../staging/api';
const labels:Record<string,string>={temporary_generation_failure:'A reply is waiting for a retry.',delivery_receipt_required:'A delivery needs confirmation before another attempt.',generation_completion_unknown:'A generation request needs review before another attempt.',credentials:'Gemini credentials need attention in Account Settings.',quality:'A reply needs review after quality checks.',context_revalidation_required:'A reply is held until its campaign and connection are revalidated.'};
export function ConversationAlerts({campaignId}:{campaignId:string}){
 const [alerts,setAlerts]=useState<any[]>([]);
 useEffect(()=>{let alive=true;stageApi('/api/campaigns/'+campaignId+'/assistant/alerts').then(r=>{if(alive)setAlerts(r.alerts);}).catch(()=>{});return()=>{alive=false;};},[campaignId]);
 if(!alerts.length)return null;
 return <section className="panel" role="status"><h2>Replies needing attention</h2>{[...new Set(alerts.map(a=>labels[a.category]||'A reply needs review before processing can continue.'))].map(text=><p key={text}>{text}</p>)}</section>;
}

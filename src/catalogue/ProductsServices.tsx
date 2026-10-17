import React,{useEffect,useState} from 'react';
import { stageApi } from '../staging/api';
const blank={kind:'product',name:'',description:'',price:''};
export function ProductsServices({campaign,publicationState,changed}:{campaign:any;publicationState:string;changed:()=>Promise<void>}){
 const [data,setData]=useState<any>(null),[item,setItem]=useState(blank),[editing,setEditing]=useState<string|null|undefined>(),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[showArchived,setShowArchived]=useState(false);
 const base='/api/campaigns/'+campaign.id+'/catalogue';
 useEffect(()=>{let alive=true;stageApi(base).then(d=>{if(alive)setData(d);}).catch(e=>setNotice(e.message));return()=>{alive=false;};},[base,campaign.revision]);
 async function perform(action:string,id?:string){
  setBusy(true);setNotice('');try{
   if(action==='save')await stageApi(base+(editing?'/'+editing:''),editing?'PATCH':'POST',{expectedRevision:campaign.revision,item});
   else if(action==='publish')await stageApi('/api/campaigns/'+campaign.id+'/publish','POST',{expectedRevision:campaign.revision});
   else await stageApi(base+'/'+id+'/'+action,'POST',{expectedRevision:campaign.revision});
   setEditing(undefined);await changed();setNotice(action==='publish'?'Instructions and catalogue published.':'Changes saved. Publish when ready.');
  }catch(e:any){setNotice(e.message);}finally{setBusy(false);}
 }
 return <><section className="panel"><span className="status-pill">{publicationState}</span><h2>Your products and services</h2><p>Save your catalogue, then publish it with the campaign’s AI instructions.</p><div className="ai-actions"><button disabled={busy} onClick={()=>{setItem(blank);setEditing(null);}}>Add Product or Service</button><button disabled={busy||editing!==undefined} onClick={()=>void perform('publish')}>Publish</button><button className="quiet-button" onClick={()=>setShowArchived(!showArchived)}>{showArchived?'Show Current':'Show Archived'}</button></div>
 {editing!==undefined&&<form className="workspace-form" onSubmit={e=>{e.preventDefault();void perform('save');}}><label>Type<select value={item.kind} onChange={e=>setItem({...item,kind:e.target.value})}><option value="product">Product</option><option value="service">Service</option></select></label><label>Name<input required maxLength={120} value={item.name} onChange={e=>setItem({...item,name:e.target.value})}/></label><label>Description<textarea rows={4} maxLength={3000} value={item.description} onChange={e=>setItem({...item,description:e.target.value})}/></label><label>Price (optional, include currency)<input maxLength={120} value={item.price} onChange={e=>setItem({...item,price:e.target.value})}/></label><div className="ai-actions"><button disabled={busy}>Save</button><button type="button" disabled={busy} onClick={()=>setEditing(undefined)}>Cancel</button></div></form>}</section>
 {notice&&<p role="status">{notice}</p>}{data&&<div className="workspace-cards">{data.items.filter((i:any)=>Boolean(i.archived_at)===showArchived).map((i:any)=><article className="workspace-card" key={i.id}><span className="status-pill">{i.kind}</span><h2>{i.name}</h2><p>{i.description}</p>{i.price&&<p>{i.price}</p>}<div className="ai-actions">{i.archived_at?<button disabled={busy} onClick={()=>void perform('restore',i.id)}>Restore</button>:<><button disabled={busy} onClick={()=>{setItem({kind:i.kind,name:i.name,description:i.description,price:i.price});setEditing(i.id);}}>Edit</button><button className="danger-button" disabled={busy} onClick={()=>void perform('archive',i.id)}>Archive</button></>}</div></article>)}</div>}</>;
}

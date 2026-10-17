import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { stageApi } from '../../staging/api';
import { StageShell, campaignPages } from '../../staging/StageShell';
import { AssistantEditor } from './AssistantEditor';
import { ProductsServices } from '../../catalogue/ProductsServices';
import { LifecycleControls } from './LifecycleControls';
import { NumbersManager } from '../../numbers/ui/NumbersManager';

export const CampaignWorkspace: React.FC<{id:string;section:string;email:string;signOut:()=>void}> = ({id,section,email,signOut}) => {
  const [data,setData]=useState<any>(null),[error,setError]=useState('');
  const [name,setName]=useState(''),[description,setDescription]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  async function refresh(){const result=await stageApi('/api/campaigns/'+id);setData(result);setName(result.campaign.name);setDescription(result.campaign.description);}
  useEffect(()=>{let alive=true;stageApi('/api/campaigns/'+id).then(result=>{if(alive){setData(result);setName(result.campaign.name);setDescription(result.campaign.description);}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[id]);
  if(['knowledge-base','languages','conversation-memory'].includes(section))return <Navigate to={'/campaigns/'+id+'/'+(section==='knowledge-base'?'products-services':'ai-assistant')} replace/>;
  if(!section)return <Navigate to={'/campaigns/'+id+'/overview'} replace/>;
  const title=campaignPages.find(([slug])=>slug===section)?.[1]||'Page unavailable';
  const locked=data&&['archived','pending_deletion'].includes(data.campaign.lifecycle);
  async function save(event:React.FormEvent){event.preventDefault();setBusy(true);setNotice('');try{await stageApi('/api/campaigns/'+id,'PATCH',{expectedRevision:data.campaign.revision,metadata:{name,description}});await refresh();setNotice('Campaign updated.');}catch(e:any){setNotice(e.message);}finally{setBusy(false);}}
  return <StageShell email={email} onSignOut={signOut} campaign={data?.campaign}>
    <div className="page-heading"><div><span className="eyebrow">{data?.campaign.name||'CAMPAIGN WORKSPACE'} / {title}</span><h1>{title}</h1></div>{data&&<span className="status-pill">{data.campaign.lifecycle.replace('_',' ')}</span>}</div>
    {error&&<section className="panel"><p role="alert">{error}</p><Link to="/campaigns">Back to My Campaigns</Link></section>}
    {!data&&!error&&<p role="status">Loading campaign…</p>}
    {data&&<>
      {locked&&section!=='settings'?<section className="panel"><h2>{data.campaign.lifecycle==='archived'?'Campaign archived':'Campaign recently deleted'}</h2><p>Saved instructions, knowledge and assignments are retained. Restore the campaign before editing.</p><Link className="primary-button" to={'/campaigns/'+id+'/settings'}>Open Campaign Settings</Link></section>:<>
        {section==='overview'&&<><section className="panel"><h2>{data.campaign.name}</h2><p>{data.campaign.description||'Build your campaign with your own instructions, business knowledge and numbers.'}</p><p>Instructions: {data.publicationState}. {data.published?'Published revision '+data.published.version+'.':'No publication yet.'}</p></section><div className="cards">{[['whatsapp-numbers','Manage your numbers','Connections assigned to this campaign.'],['ai-assistant','Your AI Assistant','Write and publish shared instructions.'],['products-services','Products & Services','Manage your published catalogue.']].map(([slug,label,detail])=><Link className="card" key={slug} to={'/campaigns/'+id+'/'+slug}><h2>{label} →</h2><p>{detail}</p></Link>)}</div></>}
        {section==='ai-assistant'&&<AssistantEditor data={data} changed={refresh}/>}
        {section==='products-services'&&<ProductsServices campaign={data.campaign} publicationState={data.publicationState} changed={refresh}/>}
        {section==='whatsapp-numbers'&&<NumbersManager campaignId={id} changed={refresh}/>}
        {section==='settings'&&<><section className="panel"><h2>Campaign Settings</h2>{!locked&&<form className="workspace-form" onSubmit={save}><label>Campaign name<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label><label>About this campaign<textarea maxLength={1000} value={description} onChange={e=>setDescription(e.target.value)}/></label><button disabled={busy}>{busy?'Saving…':'Save Campaign'}</button></form>}<LifecycleControls campaign={data.campaign} changed={refresh}/></section>{notice&&<p role="status">{notice}</p>}</>}
        {!['overview','ai-assistant','products-services','whatsapp-numbers','settings'].includes(section)&&<section className="panel"><h2>{title} is not available yet</h2><p>This feature is not configured. No customer data, sending activity or metrics are simulated.</p></section>}
      </>}
    </>}
  </StageShell>;
}

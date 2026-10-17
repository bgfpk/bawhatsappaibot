import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { stageApi } from '../../staging/api';
import { LifecycleControls } from './LifecycleControls';

// Adapted from the saved Black Arrow Workspaces/CreateWorkspace presentation.
export function CampaignList({deleted=false}:{deleted?:boolean}) {
  const navigate=useNavigate();
  const [items,setItems]=useState<any[]>([]),[loaded,setLoaded]=useState(false),[notice,setNotice]=useState('');
  const [search,setSearch]=useState(''),[state,setState]=useState(''),[busy,setBusy]=useState(false),[creating,setCreating]=useState(false);
  const [name,setName]=useState(''),[description,setDescription]=useState('');
  async function refresh(){
    try {const result=await stageApi(deleted?'/api/recently-deleted':'/api/campaigns?'+new URLSearchParams({search,state}));setItems(result.campaigns);setLoaded(true);}
    catch(error:any){setNotice(error.message);}
  }
  useEffect(()=>{void refresh();},[deleted,state]);
  const create=async(event:React.FormEvent)=>{
    event.preventDefault();setBusy(true);setNotice('');
    try {const result=await stageApi('/api/campaigns','POST',{name,description});navigate('/campaigns/'+result.campaign.id+'/overview');}
    catch(error:any){setNotice(error.message);}finally{setBusy(false);}
  };
  return <div className="workspaces">
    {!deleted&&<section className="panel"><button onClick={()=>setCreating(!creating)} aria-expanded={creating}>Create Campaign</button>
      {creating&&<form className="workspace-form" onSubmit={create}>
        <label>Campaign name<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
        <label>About this campaign<textarea maxLength={1000} value={description} onChange={e=>setDescription(e.target.value)}/></label>
        <div className="ai-actions"><button disabled={busy} type="submit">{busy?'Creating…':'Create'}</button><button type="button" onClick={()=>setCreating(false)}>Cancel</button></div>
      </form>}
    </section>}
    <section className="panel">
      {!deleted&&<form className="workspace-filters" onSubmit={e=>{e.preventDefault();void refresh();}}>
        <label>Search campaigns<input maxLength={120} value={search} onChange={e=>setSearch(e.target.value)}/></label>
        <label>Campaign status<select value={state} onChange={e=>setState(e.target.value)}><option value="">All statuses</option>{['active','paused','archived'].map(v=><option key={v} value={v}>{v[0].toUpperCase()+v.slice(1)}</option>)}</select></label><button>Search</button>
      </form>}
      {notice&&<p role="alert">{notice}</p>}
      {!loaded?<p>Loading campaigns…</p>:!items.length?<div className="empty-state"><h2>{deleted?'No recently deleted campaigns':search||state?'No campaigns match':'Create your first campaign.'}</h2><p>{deleted?'Recoverable campaigns will appear here.':'Start with your business name, then add your instructions and knowledge.'}</p></div>:null}
      <div className="workspace-cards">{items.map(campaign=><article className="workspace-card" key={campaign.id}>
        <span className="status-pill">{campaign.lifecycle==='pending_deletion'?'Recently deleted':campaign.lifecycle}</span><h2>{campaign.name}</h2><p>{campaign.description}</p><p>{campaign.number_count} assigned numbers</p>
        {!deleted&&<div className="ai-actions"><Link className="primary-button" to={'/campaigns/'+campaign.id+'/overview'}>Open Campaign</Link><Link to={'/campaigns/'+campaign.id+'/settings'}>Rename &amp; Settings</Link></div>}
        <LifecycleControls campaign={campaign} changed={refresh}/>
      </article>)}</div>
    </section>
  </div>;
}

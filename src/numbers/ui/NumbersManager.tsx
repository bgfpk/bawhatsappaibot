import React,{useEffect,useRef,useState} from 'react';
import { Link } from 'react-router-dom';
import { stageApi } from '../../staging/api';
import { NumberRow } from './NumberRow';

export function NumbersManager({campaignId,changed}:{campaignId?:string;changed?:()=>Promise<void>}) {
  const [data,setData]=useState<any>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[adding,setAdding]=useState(false),[removed,setRemoved]=useState(false),[busy,setBusy]=useState(false);
  const [name,setName]=useState(''),[phone,setPhone]=useState(''),[campaign,setCampaign]=useState(campaignId||'');
  const creation=useRef<{body:string;id:string}|null>(null);
  const base=campaignId?'/api/campaigns/'+campaignId+'/numbers':'/api/numbers'+(removed?'?removed=1':'');
  async function refresh(){const value=await stageApi(base);setData(value);if(changed)await changed();}
  useEffect(()=>{let alive=true;setError('');stageApi(base).then(r=>{if(alive)setData(r);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[base]);
  async function create(event:React.FormEvent) {
    event.preventDefault();setBusy(true);setError('');setNotice('');
    const input={name,phone,campaignId:campaignId||campaign||null},body=JSON.stringify(input);
    if(creation.current?.body!==body)creation.current={body,id:crypto.randomUUID()};
    try{await stageApi('/api/numbers','POST',{requestId:creation.current!.id,...input});creation.current=null;setName('');setPhone('');setAdding(false);await refresh();setNotice('Number record saved. No phone has been paired.');}
    catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  return <><section className="panel"><h2>{campaignId?'Numbers assigned to this campaign':'Your WhatsApp numbers'}</h2><p>Manage independent number records and campaign assignments. Multiple numbers can share a campaign’s published AI instructions and knowledge.</p><p>QR-first connection is planned. Pairing and customer messaging remain unavailable until platform authorization and owner approval are verified.</p>
    <div className="ai-actions"><button onClick={()=>{setAdding(!adding);setRemoved(false);}} disabled={busy}>Add Number Record</button>{!campaignId&&<button disabled={busy} onClick={()=>{setRemoved(!removed);setAdding(false);}}>{removed?'Show Current Numbers':'Recently Removed Numbers'}</button>}{campaignId&&<Link to="/whatsapp-numbers">Manage all account numbers</Link>}</div>
    {adding&&<form className="workspace-form" onSubmit={create}><label>Number display name<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label><label>Phone number (optional, international format)<input type="tel" autoComplete="off" placeholder="+ country code and number" maxLength={17} value={phone} onChange={e=>setPhone(e.target.value)}/></label>
      {!campaignId&&<label>Assign to campaign<select value={campaign} onChange={e=>setCampaign(e.target.value)}><option value="">Unassigned</option>{data?.campaigns.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}<p>Saving a record does not verify ownership of a phone or establish a connection.</p><button disabled={busy}>{busy?'Saving…':'Save Number Record'}</button><button type="button" className="quiet-button" disabled={busy} onClick={()=>setAdding(false)}>Cancel</button></form>}
  </section>{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {!data&&!error&&<p role="status">Loading number records…</p>}{data&&!data.numbers.length&&<section className="panel"><h2>{removed?'No recently removed numbers':'No saved numbers yet'}</h2><p>{removed?'Removed records will appear here during their recovery window.':'Add a number record when you are ready, or assign an existing account number to this campaign.'}</p></section>}
    {data&&<div className="workspace-cards">{data.numbers.map((n:any)=><NumberRow key={n.id} number={n} campaigns={data.campaigns} refresh={refresh}/>)}</div>}
  </>;
}

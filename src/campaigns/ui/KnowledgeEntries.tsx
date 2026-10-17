import React, { useState } from 'react';
import { stageApi } from '../../staging/api';
import { fields } from './knowledge-fields';

export function KnowledgeEntries({base,data,changed}:{base:string;data:any;changed:()=>Promise<void>}) {
  const [kind,setKind]=useState('business'),[editing,setEditing]=useState<any>(null),[open,setOpen]=useState(false);
  const [value,setValue]=useState<Record<string,string>>({}),[enabled,setEnabled]=useState(true),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const labels:Record<string,string>={business:'Business Information',product:'Products & Services',faq:'FAQs',note:'Business Notes'};
  const entries=data.items.filter((item:any)=>item.kind===kind);
  function edit(item:any){setEditing(item);setValue(item.fields);setEnabled(item.enabled);setOpen(true);setNotice('');}
  async function perform(work:()=>Promise<any>){setBusy(true);setNotice('');try{await work();setOpen(false);await changed();setNotice('Draft updated. Publish when ready.');}catch(e:any){setNotice(e.message);}finally{setBusy(false);}}
  return <>
    <section className="panel"><nav className="knowledge-tabs" aria-label="Knowledge sections">{Object.entries(labels).map(([v,label])=><button key={v} aria-pressed={kind===v} onClick={()=>{setKind(v);setOpen(false);}}>{label}</button>)}</nav>
      <h2>{labels[kind]}</h2><button onClick={()=>{setEditing(null);setValue(Object.fromEntries(fields[kind].map(([key])=>[key,''])));setEnabled(true);setOpen(true);}}>Add {kind==='faq'?'FAQ':kind==='product'?'Product or Service':kind==='business'?'Business Information':'Note'}</button>
      {kind==='product'&&<p>Enter only confirmed prices; leave unknown prices blank. Prices older than 30 days are omitted from runtime retrieval.</p>}
      {!entries.some((item:any)=>!item.removed_at)&&<p>No entries yet.</p>}
      {entries.map((item:any)=><article className="knowledge-row" key={item.id}><div><h3>{item.title}</h3><p>{item.removed_at?'Removed from draft':item.enabled?'Enabled in draft':'Disabled in draft'}</p></div>
        {item.removed_at?<button disabled={busy} onClick={()=>void perform(()=>stageApi(base+'/items/'+item.id+'/restore','POST',{expectedRevision:data.revision}))}>Restore Entry</button>:<button onClick={()=>edit(item)}>Edit</button>}
      </article>)}
    </section>
    {open&&<form className="panel workspace-form" onSubmit={e=>{e.preventDefault();void perform(()=>stageApi(base+'/items'+(editing?'/'+editing.id:''),editing?'PATCH':'POST',{expectedRevision:data.revision,item:{kind,fields:value,enabled}}));}}>
      <h2>{editing?'Edit entry':'New entry'}</h2><fieldset disabled={busy}>{fields[kind].map(([key,label,type])=><label key={key}>{label}{type==='long'?<textarea rows={4} maxLength={6000} value={value[key]||''} onChange={e=>setValue({...value,[key]:e.target.value})}/>:<input type={type==='date'?'date':'text'} required={['name','question','title'].includes(key)} maxLength={300} value={value[key]||''} onChange={e=>setValue({...value,[key]:e.target.value})}/>}</label>)}
      <label className="ai-check"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Use this entry when published</label>
      <div className="ai-actions"><button type="submit">Save Draft</button><button type="button" onClick={()=>setOpen(false)}>Cancel</button>{editing&&<button type="button" className="danger-button" onClick={()=>void perform(()=>stageApi(base+'/items/'+editing.id+'/remove','POST',{expectedRevision:data.revision}))}>Remove Entry</button>}</div></fieldset>
    </form>}{notice&&<p role="status">{notice}</p>}
  </>;
}

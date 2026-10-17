import React, { useEffect, useState } from 'react';
import { stageApi } from '../../staging/api';
import { KnowledgeEntries } from './KnowledgeEntries';
import { KnowledgeDocuments } from './KnowledgeDocuments';
export function KnowledgeBase({campaign,publicationState,published,changed}:{campaign:any;publicationState:string;published:any;changed:()=>Promise<void>}) {
  const base='/api/campaigns/'+campaign.id+'/knowledge';
  const [data,setData]=useState<any>(null),[notice,setNotice]=useState(''),[section,setSection]=useState('entries'),[query,setQuery]=useState(''),[result,setResult]=useState<any>(null),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false);
  async function refresh(){const value=await stageApi(base);setData(value);await changed();}
  useEffect(()=>{setData(null);setResult(null);void stageApi(base).then(setData).catch(e=>setNotice(e.message));},[base]);
  async function publish(){setBusy(true);setNotice('');try{await stageApi('/api/campaigns/'+campaign.id+'/publish','POST',{expectedRevision:data.revision});await refresh();setConfirm(false);setResult(null);setNotice('Saved instructions and knowledge published together.');}catch(e:any){setNotice(e.message);}finally{setBusy(false);}}
  return <><section className="panel"><span className="status-pill">{publicationState}</span><p>{published?'Published revision '+published.version:'No knowledge publication yet.'}</p></section>{notice&&<p role="status">{notice}</p>}
    <nav className="knowledge-tabs" aria-label="Knowledge management"><button aria-pressed={section==='entries'} onClick={()=>setSection('entries')}>Business Knowledge</button><button aria-pressed={section==='documents'} onClick={()=>setSection('documents')}>Documents</button><button aria-pressed={section==='published'} onClick={()=>setSection('published')}>Published Sources</button></nav>
    {!data?<p>Loading knowledge…</p>:<>
      {section==='entries'&&<KnowledgeEntries base={base} data={data} changed={refresh}/>}
      {section==='documents'&&<KnowledgeDocuments base={base} data={data} changed={refresh}/>}
      {section==='published'&&<section className="panel"><h2>Find published source facts</h2><p>This searches published knowledge. It does not generate an AI reply or send a message.</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);try{setResult(await stageApi(base+'/retrieve?'+new URLSearchParams({query})));}catch(error:any){setNotice(error.message);}finally{setBusy(false);}}}><label>Search published facts<input maxLength={1000} value={query} onChange={e=>setQuery(e.target.value)}/></label><button disabled={busy}>Find Sources</button></form>
        {result&&<><p>{result.version?'Published revision '+result.version:'No publication yet'}</p>{!result.sources.length?<p>No matching published source facts.</p>:result.sources.map((source:any)=><article key={source.id}><h3>{source.title}</h3><pre className="source-preview">{source.excerpt}</pre></article>)}</>}
      </section>}
      <section className="panel"><h2>Publish your campaign knowledge</h2><p>Draft edits remain separate from the current publication. Publish saved instructions and enabled knowledge together for this campaign.</p><button disabled={busy} onClick={()=>setConfirm(true)}>Publish Instructions &amp; Knowledge</button>{confirm&&<div className="number-confirm"><p>Publish the saved drafts to this campaign only?</p><div className="ai-actions"><button disabled={busy} onClick={()=>void publish()}>Confirm Publication</button><button onClick={()=>setConfirm(false)}>Cancel</button></div></div>}</section>
    </>}
  </>;
}

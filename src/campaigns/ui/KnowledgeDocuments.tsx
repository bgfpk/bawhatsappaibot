import React, { useState } from 'react';
import { stageApi } from '../../staging/api';
export function KnowledgeDocuments({base,data,changed}:{base:string;data:any;changed:()=>Promise<void>}) {
  const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[preview,setPreview]=useState<any>(null),[key,setKey]=useState(0);
  async function upload(event:React.FormEvent){event.preventDefault();if(!file)return;setBusy(true);setNotice('');
    try {
      if(file.size>2097152)throw Error('Choose a file no larger than 2 MB.');
      const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Could not read file'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);});
      const result=await stageApi(base+'/documents','POST',{name:file.name,base64,expectedRevision:data.revision});
      setNotice(result.duplicate?'This document is already imported.':result.state==='ready'?'Document extracted into draft knowledge. Publish when ready.':'Document could not be processed. Review its status below.');
      setFile(null);setKey(key+1);await changed();
    }catch(e:any){setNotice(e.message);}finally{setBusy(false);}
  }
  async function action(work:()=>Promise<void>){setBusy(true);setNotice('');try{await work();}catch(e:any){setNotice(e.message);}finally{setBusy(false);}}
  return <>
    <form className="panel workspace-form" onSubmit={upload}><h2>Add Document</h2><p>Readable PDF, DOCX, UTF-8 TXT, Markdown or CSV. Up to 2 MB per file, 20 documents and 20 MB per campaign. Files stay private; extraction uses no external service. Scanned PDFs require readable text first.</p>
      <label>Document<input key={key} required type="file" accept=".pdf,.docx,.txt,.md,.csv" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><button disabled={busy||!file}>{busy?'Processing…':'Upload Document'}</button>
    </form>
    <section className="panel"><h2>Your Documents</h2>{!data.documents.length&&<p>No documents uploaded yet.</p>}{data.documents.filter((d:any)=>d.state!=='removed').map((document:any)=><article className="knowledge-document" key={document.id}>
      <h3>{document.name}</h3><p>{document.state==='ready'?'Ready for draft publication':document.state==='failed'?'Could not process this file':'Processing…'}</p>
      {document.error_code&&<p role="alert">{document.error_code.toLowerCase().replaceAll('_',' ')}. Remove this file and upload a corrected copy.</p>}
      <div className="ai-actions"><button disabled={busy||document.state!=='ready'} onClick={()=>void action(async()=>setPreview(await stageApi(base+'/documents/'+document.id)))}>Preview Extracted Text</button><button disabled={busy} className="danger-button" onClick={()=>void action(async()=>{await stageApi(base+'/documents/'+document.id+'/remove','POST',{expectedRevision:data.revision});setPreview(null);await changed();})}>Remove Document</button></div>
    </article>)}</section>
    {preview&&<section className="panel"><h2>{preview.name}</h2><pre className="source-preview">{preview.extracted}</pre><button onClick={()=>setPreview(null)}>Close Preview</button></section>}{notice&&<p role="status">{notice}</p>}
  </>;
}

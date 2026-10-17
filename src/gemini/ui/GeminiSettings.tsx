import React,{useEffect,useState} from 'react';
import { stageApi } from '../../staging/api';

export function GeminiSettings() {
  const [settings,setSettings]=useState<any>(null),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),[test,setTest]=useState<any>(null),[removing,setRemoving]=useState(false);
  const base='/api/account/ai/gemini';
  useEffect(()=>{let alive=true;stageApi(base).then(r=>{if(alive)setSettings(r);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[]);
  async function action(kind:'save'|'remove'|'test') {
    setBusy(true);setNotice('');setError('');setTest(null);
    const submitted=key;setKey('');
    try {
      const body=kind==='save'?{apiKey:submitted,expectedRevision:settings.revision}:kind==='remove'?{expectedRevision:settings.revision}:{requestId:crypto.randomUUID()};
      const result=await stageApi(base+'/'+kind,'POST',body);setSettings(result);setRemoving(false);
      if(kind==='test'){setTest(result.test);setNotice('Google Gemini responded successfully.');}
      else setNotice(kind==='save'?'Gemini key saved securely. Click Test Connection when ready.':'Key removed from Black Arrow. This does not revoke the key at Google.');
    }catch(e:any){setError(e.message);try{setSettings(await stageApi(base));}catch{}}
    finally{setBusy(false);}
  }
  return <section className="panel ai-editor" id="ai-integration"><span className="eyebrow">AI INTEGRATION</span><h2>Google Gemini</h2>
    <p>One Google AI Studio key is shared across your account’s campaigns. Google may charge for requests under your project’s billing and quotas.</p>
    {!settings&&!error&&<p role="status">Loading Gemini settings…</p>}
    {settings&&<>
      <p className="status-pill">{settings.configured?settings.usable?'Connection verified':'Key saved · Test Connection required':'No key configured'}</p>
      {settings.configured&&<p>Saved key: {settings.masked}{settings.model?' · '+settings.model:''}{settings.lastTestAt?' · Last tested '+new Date(settings.lastTestAt).toLocaleString():''}</p>}
      <form onSubmit={e=>{e.preventDefault();void action('save');}}>
        <label>{settings.configured?'Replacement API key':'Google AI Studio API key'}<input name="gemini-key" type="password" autoComplete="new-password" spellCheck={false} maxLength={1024} value={key} onChange={e=>setKey(e.target.value)} placeholder="Enter your key securely" required disabled={busy}/></label>
        <button disabled={busy||!key.trim()}>{busy?'Working…':settings.configured?'Replace Key':'Save Key'}</button>
      </form>
      <div className="ai-actions"><button disabled={busy||!settings.configured} onClick={()=>void action('test')}>Test Connection</button><button className="danger-button" disabled={busy||!settings.configured} onClick={()=>setRemoving(true)}>Remove Key</button></div>
      {removing&&<div className="number-confirm"><p>Remove the key from Black Arrow? New Gemini requests will stop. A request already sent to Google may still finish or be billed. Removal does not revoke the key at Google.</p><button disabled={busy} onClick={()=>void action('remove')}>Confirm Removal</button> <button disabled={busy} onClick={()=>setRemoving(false)}>Cancel</button></div>}
      {settings.testStatus==='failed'&&!error&&<p role="alert">The last connection test failed. Check your key and Google project, then test again.</p>}
      <p>Saving or opening this page makes no Google request. Test Connection checks your available models and sends one brief request; Send Test Message also uses your Google project.</p>
    </>}
    {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
    {test&&<div className="test-reply"><strong>Genuine Gemini connection response</strong><p dir="auto">{test.text}</p><small>{test.model} · {test.usage.total??'Unreported'} tokens · Request {test.requestId}</small></div>}
  </section>;
}

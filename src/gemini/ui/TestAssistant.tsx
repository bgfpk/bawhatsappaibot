import React,{useEffect,useState} from 'react';
import { Link } from 'react-router-dom';
import { stageApi } from '../../staging/api';

export function TestAssistant({campaignId,publishedVersion}:{campaignId:string;publishedVersion?:number}) {
  const [turns,setTurns]=useState<Array<{role:string;text:string;meta?:any}>>([]),[message,setMessage]=useState(''),[conversation,setConversation]=useState<string>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[configured,setConfigured]=useState<boolean>();
  const base='/api/campaigns/'+campaignId+'/assistant/test';
  useEffect(()=>{let alive=true;stageApi(base+'/status').then(r=>{if(alive)setConfigured(r.settings.configured);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[base]);
  useEffect(()=>{setTurns([]);setConversation(undefined);setError('');},[campaignId,publishedVersion]);
  async function send(event:React.FormEvent) {
    event.preventDefault();const question=message.trim();if(!question||busy)return;
    setBusy(true);setError('');
    try {
      const reply=await stageApi(base,'POST',{message:question,conversationId:conversation,requestId:crypto.randomUUID()});
      setConversation(reply.conversationId);setTurns(old=>[...old,{role:'You',text:question},{role:'Gemini',text:reply.text,meta:reply}].slice(-12));setMessage('');
    }catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  async function clear() {
    setError('');try{if(conversation)await stageApi(base+'/clear','POST',{conversationId:conversation});setConversation(undefined);setTurns([]);}catch(e:any){if(e.status===404){setConversation(undefined);setTurns([]);}else setError(e.message);}
  }
  return <section className="panel ai-editor"><h2>Test Assistant</h2><p>Ask Gemini using this campaign’s published instructions and Products & Services. This temporary conversation is kept in this server session and clears on restart or after inactivity. Nothing is sent to WhatsApp.</p>
    {!publishedVersion&&<p role="status">Save and Publish your instructions before testing.</p>}
    {configured===false&&<p><Link to="/settings#ai-integration">Configure your Google Gemini key in Account Settings → AI Integration.</Link></p>}
    <div className="test-conversation" aria-live="polite">{turns.map((turn,index)=><article className="test-reply" key={index}><strong>{turn.role}</strong><p dir="auto">{turn.text}</p>{turn.meta&&<small>{turn.meta.model} · Published revision {turn.meta.publicationVersion} · {turn.meta.usage.total??'Unreported'} tokens{turn.meta.contextTruncated?' · Selected knowledge sources':''}</small>}</article>)}</div>
    <form onSubmit={send}>
      <label>Your test message<textarea rows={3} maxLength={4000} value={message} onChange={e=>setMessage(e.target.value)} disabled={busy} required/></label>
      <div className="ai-actions"><button disabled={busy||!publishedVersion||configured===false||!message.trim()}>{busy?'Waiting for Gemini…':'Send Test Message'}</button><button type="button" disabled={busy||!turns.length} onClick={()=>void clear()}>Clear Conversation</button></div>
    </form>{error&&<p role="alert">{error}</p>}
  </section>;
}

import { NumberConnection } from '../../connections/ui/NumberConnection';
import React,{useState} from 'react';
import { stageApi } from '../../staging/api';

export const NumberRow:React.FC<{number:any;campaigns:any[];refresh:()=>Promise<void>}> = ({number,campaigns,refresh}) => {
  const [mode,setMode]=useState(''),[name,setName]=useState(number.name),[target,setTarget]=useState(number.campaignId||''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function action(kind:string) {
    setBusy(true);setError('');
    try {
      const body={expectedRevision:number.revision,...(kind==='rename'?{name}:{}),...(kind==='assignment'?{sourceCampaignId:number.campaignId,targetCampaignId:target||null,confirmation}:{}),...(kind==='remove'?{confirmation}:{})};
      await stageApi('/api/numbers/'+number.id+'/'+kind,'POST',body);setMode('');setConfirmation('');await refresh();
    }catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  const status=number.status==='pending'?'Pending connection':number.status==='unavailable'?'Unavailable':number.status==='revoked'?'Revoked':number.status==='connected'?(number.liveTransport?'Connected':'Unavailable'):'Disconnected';
  return <article className="workspace-card number-card"><h2>{number.name}</h2><p>{number.maskedIdentity||'Phone identity will be verified by an authorized connection.'}</p><span className="status-pill">{status}</span>
    <p>{number.campaignName?'Campaign: '+number.campaignName:'Not assigned to a campaign'}</p>
    {!number.liveTransport&&<p>QR pairing requires verified platform authorization and separate owner approval. No QR code or live connection has been created.</p>}
    {number.removedAt?<><p>Removed. Recoverable until {new Date(number.recoverUntil).toLocaleDateString()}. Restoring leaves the record unassigned and disconnected.</p><button disabled={busy} onClick={()=>void action('restore')}>Restore Number</button></>:<>
      <div className="ai-actions"><button disabled={busy} onClick={()=>{setName(number.name);setMode(mode==='rename'?'':'rename');}}>Rename</button><button disabled={busy} onClick={()=>{setTarget(number.campaignId||'');setConfirmation('');setMode(mode==='assignment'?'':'assignment');}}>Change Campaign</button><button disabled={busy} onClick={()=>setMode(mode==='connection'?'':'connection')}>View QR Connection</button><button disabled={busy||!number.session||['revoked','disconnected'].includes(number.status)} onClick={()=>void action('disconnect')}>Disconnect</button><button className="danger-button" disabled={busy} onClick={()=>{setConfirmation('');setMode(mode==='remove'?'':'remove');}}>Remove</button></div>
      {mode==='connection'&&<NumberConnection number={number} refresh={refresh}/>}
      {mode==='rename'&&<form onSubmit={e=>{e.preventDefault();void action('rename');}}><label>Number display name<input value={name} maxLength={120} required onChange={e=>setName(e.target.value)}/></label><button disabled={busy}>Save Name</button></form>}
      {mode==='assignment'&&<form className="number-confirm" onSubmit={e=>{e.preventDefault();void action('assignment');}}><h3>Assign or move this number</h3><p>Moving the number revokes its previous session and holds unfinished work. Conversation history is not transferred to another campaign.</p><label>Campaign<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Unassigned</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Type “{number.name}” to confirm<input required value={confirmation} onChange={e=>setConfirmation(e.target.value)} maxLength={120}/></label><button disabled={busy||confirmation!==number.name||target===(number.campaignId||'')}>Confirm Assignment</button></form>}
      {mode==='remove'&&<form className="number-confirm" onSubmit={e=>{e.preventDefault();void action('remove');}}><h3>Remove this number?</h3><p>Its session will be revoked and campaign assignment removed. The record remains recoverable for 30 days.</p><label>Type “{number.name}” to confirm<input required value={confirmation} onChange={e=>setConfirmation(e.target.value)} maxLength={120}/></label><button className="danger-button" disabled={busy||confirmation!==number.name}>Confirm Removal</button></form>}
    </>}{mode&&<button className="quiet-button" disabled={busy} onClick={()=>setMode('')}>Cancel</button>}{error&&<p role="alert">{error}</p>}
  </article>;
}

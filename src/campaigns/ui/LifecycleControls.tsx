import React, { useState } from 'react';
import { stageApi } from '../../staging/api';
export function LifecycleControls({campaign,changed}:{campaign:any;changed:()=>Promise<void>}) {
  const [action,setAction]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const choices:Record<string,string[][]>={active:[['pause','Pause'],['archive','Archive']],paused:[['resume','Resume'],['archive','Archive']],archived:[['restore','Restore']],pending_deletion:[['cancel_removal','Restore Campaign']]};
  async function perform(){
    setBusy(true);setError('');
    try {await stageApi('/api/campaigns/'+campaign.id+'/lifecycle','POST',{action,confirmation,expectedRevision:campaign.revision});setAction('');setConfirmation('');await changed();}
    catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  return <section className="lifecycle-controls">
    <div className="ai-actions">{(choices[campaign.lifecycle]||[]).map(([value,label])=><button key={value} disabled={busy} onClick={()=>setAction(value)}>{label}</button>)}
      {campaign.lifecycle!=='pending_deletion'&&<button className="danger-button" disabled={busy} onClick={()=>setAction('delete')}>Delete Campaign</button>}
    </div>
    {campaign.recover_until&&<p>Recovery available until {new Date(campaign.recover_until).toLocaleDateString()}. Saved content is retained; no permanent deletion runs automatically.</p>}
    {action&&<div className="number-confirm" role="group" aria-label="Confirm campaign change">
      <p>{action==='delete'?'Delete this campaign from the active list? Its content remains recoverable for 30 days. Type its name to confirm.':action==='restore'||action==='cancel_removal'?'Restore this campaign as paused? Saved content and assignments are kept.':'Apply this change? Pending work stays on hold and no numbers are transferred.'}</p>
      {action==='delete'&&<label>Campaign name confirmation<input value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>}
      <div className="ai-actions"><button disabled={busy||(action==='delete'&&confirmation!==campaign.name)} onClick={()=>void perform()}>Confirm</button><button disabled={busy} onClick={()=>setAction('')}>Cancel</button></div>
    </div>}{error&&<p role="alert">{error}</p>}
  </section>;
}

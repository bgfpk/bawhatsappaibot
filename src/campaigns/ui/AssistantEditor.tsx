import React,{useEffect,useState} from 'react';
import { stageApi } from '../../staging/api';
import { TestAssistant } from '../../gemini/ui/TestAssistant';
import { ConversationAlerts } from '../../conversation/ConversationAlerts';
export function AssistantEditor({data,changed}:{data:any;changed:()=>Promise<void>}){
 const [instructions,setInstructions]=useState(data.draft.instructions),[enabled,setEnabled]=useState(data.draft.enabled),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 useEffect(()=>{setInstructions(data.draft.instructions);setEnabled(data.draft.enabled);setDirty(false);},[data]);
 async function perform(publish=false){setBusy(true);setNotice('');try{
  const base='/api/campaigns/'+data.campaign.id;
  if(publish)await stageApi(base+'/publish','POST',{expectedRevision:data.campaign.revision});
  else await stageApi(base+'/assistant','PATCH',{expectedRevision:data.campaign.revision,config:{instructions,enabled}});
  await changed();setNotice(publish?'Instructions and catalogue published.':'Draft saved.');
 }catch(e:any){setNotice(e.message);}finally{setBusy(false);}}
 return <><section className="panel ai-editor"><span className="status-pill">{dirty?'Unsaved changes':data.publicationState}</span><h2>Your AI instructions</h2><label>Main AI instructions<textarea rows={10} maxLength={6000} value={instructions} onChange={e=>{setInstructions(e.target.value);setDirty(true);}}/></label><label className="ai-check"><input type="checkbox" checked={enabled} onChange={e=>{setEnabled(e.target.checked);setDirty(true);}}/>AI replies enabled</label><div className="ai-actions"><button disabled={busy||!dirty} onClick={()=>void perform()}>Save Draft</button><button disabled={busy||dirty||!instructions.trim()} onClick={()=>void perform(true)}>Publish</button></div>{notice&&<p role="status">{notice}</p>}</section><ConversationAlerts campaignId={data.campaign.id}/><TestAssistant campaignId={data.campaign.id} publishedVersion={data.published?.version}/></>;
}

import React,{useEffect,useState} from 'react';
import QRCode from 'qrcode';
import { stageApi } from '../../staging/api';
import { QrPairingPanel } from '../../instance-hub/qr/QrPairingPanel';
export function NumberConnection({number,refresh}:{number:any;refresh:()=>Promise<void>}){
 const[data,setData]=useState<any>(null),[qr,setQr]=useState<string|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirmation,setConfirmation]=useState('');
 const[qrExpired,setQrExpired]=useState(false);
 const labels:Record<string,string>={unpaired:'Unpaired',connecting:'Connecting',qr_required:'QR required',connected:'Connected',disconnected:'Disconnected',repairing:'Re-pairing'};
 const path='/api/numbers/'+number.id+'/connection';
 async function load(){const r=await stageApi(path);setData(r);}
 useEffect(()=>{let active=true;async function read(){try{const r=await stageApi(path);if(active)setData(r);}catch(e:any){if(active)setError(e.message);}}void read();const timer=setInterval(()=>void read(),10000);return()=>{active=false;clearInterval(timer);};},[path]);
 useEffect(()=>{
  let active=true,timer:ReturnType<typeof setTimeout>|undefined;setQr(null);setQrExpired(false);
  if(data?.qr&&!data.synthetic&&data.connectionEligible){
   const remaining=data.qrExpiresAt-Date.now();
   if(remaining<=0)setQrExpired(true);
   else{timer=setTimeout(()=>{setQr(null);setQrExpired(true);},remaining);QRCode.toDataURL(data.qr).then(v=>{if(active&&data.qrExpiresAt>Date.now())setQr(v);}).catch(()=>{});}
  }
  return()=>{active=false;if(timer)clearTimeout(timer);};
 },[data?.qr,data?.qrExpiresAt,data?.synthetic,data?.connectionEligible]);
 async function action(reset=false){setBusy(true);setError('');try{await stageApi(reset?path+'/reset':path,'POST',{expectedRevision:data?.revision??number.revision,...(reset?{confirmation}:{})});await refresh();await load();setConfirmation('');}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 const phase=qrExpired&&data?.phase==='qr_required'?'repairing':data?.phase||'unpaired',live=data?.live===true;
 return <section className="panel" aria-label={'Connection for '+number.name}>
  <h3>WhatsApp connection</h3><p role="status">{labels[phase]||'Unpaired'}</p>
  <QrPairingPanel instanceName={number.name} statusInput={{status:phase==='qr_required'?'qr-ready':phase==='repairing'?'repairing':phase}} qrCode={qr} evidence={data?.synthetic?'synthetic':data?.connectionEligible?'verified':'unavailable'}/>
  {!data?.connectionEligible&&<p>{data?.blocker||'Checking transport eligibility...'}</p>}
  <div className="ai-actions"><button disabled={busy||!data?.connectionEligible||live} onClick={()=>void action()}>{phase==='repairing'?'Re-pair with QR':'Connect with QR'}</button><button disabled={busy} onClick={()=>void load().catch(e=>setError(e.message))}>Refresh connection</button></div>
  {data&&data.authGeneration>1&&<p>Earlier pairing credentials are revoked.</p>}
  {data&&phase!=='unpaired'&&<form onSubmit={e=>{e.preventDefault();void action(true);}}><p>Reset stops this number and revokes its saved pairing. Other numbers are unaffected.</p><label>Type RESET PAIRING<input value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off"/></label><button disabled={busy||confirmation!=='RESET PAIRING'}>Reset pairing</button></form>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}

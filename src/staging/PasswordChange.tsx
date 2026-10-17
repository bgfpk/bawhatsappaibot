import React,{useState} from 'react';
import { stageApi } from './api';
export function PasswordChange(){
 const[current,setCurrent]=useState(''),[next,setNext]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <main className="panel"><h1>Update your password</h1><form onSubmit={async e=>{e.preventDefault();setBusy(true);try{await stageApi('/api/auth/password/change','POST',{currentPassword:current,newPassword:next});window.location.reload();}catch(e:any){setError(e.message);}finally{setBusy(false);}}}><label>Current password<input type="password" autoComplete="current-password" required value={current} onChange={e=>setCurrent(e.target.value)}/></label><label>New password<input type="password" autoComplete="new-password" minLength={15} maxLength={128} required value={next} onChange={e=>setNext(e.target.value)}/></label><button disabled={busy}>Update password</button>{error&&<p role="alert">{error}</p>}</form></main>;
}

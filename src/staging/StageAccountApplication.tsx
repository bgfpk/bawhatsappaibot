import { PasswordChange } from './PasswordChange';
import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { StageShell } from './StageShell';
import { stageApi } from './api';
import { CampaignList } from '../campaigns/ui/CampaignList';
import { CampaignWorkspace } from '../campaigns/ui/CampaignWorkspace';
import { GeminiSettings } from '../gemini/ui/GeminiSettings';
import { NumbersManager } from '../numbers/ui/NumbersManager';

export function StageAccountApplication({onSignedOut}:{onSignedOut:()=>void}) {
  const {pathname}=useLocation(),[user,setUser]=useState<any>(null),[error,setError]=useState('');
  const [preference,setPreference]=useState(false),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{let alive=true;stageApi('/api/auth/session').then(async session=>[session,session.user?.passwordChangeRequired?{}:await stageApi('/api/user/preferences')]).then(([session,prefs])=>{if(alive){setUser(session.user);setPreference(prefs.showGetStarted===true);}}).catch(e=>{if(!alive)return;if(e.status===401){localStorage.removeItem('currentUser');onSignedOut();}else setError(e.message);});return()=>{alive=false;};},[onSignedOut]);
  async function signOut(){try{await stageApi('/api/auth/logout','POST',{});localStorage.removeItem('currentUser');onSignedOut();}catch(e:any){setError(e.message);}}
  async function save(event:React.FormEvent){event.preventDefault();setBusy(true);setNotice('');try{await stageApi('/api/user/preferences','PATCH',{showGetStarted:preference});setNotice('Preference saved.');}catch(e:any){setError(e.message);}finally{setBusy(false);}}
  if(user?.passwordChangeRequired)return <PasswordChange/>;
  if(['/login','/signup','/magic-link'].includes(pathname))return <Navigate to="/" replace/>;
  const match=pathname.match(/^\/campaigns\/([^/]+)(?:\/([^/]+))?/);
  if(user&&match)return <CampaignWorkspace key={match[1]} id={match[1]} section={match[2]||''} email={user.email} signOut={signOut}/>;
  const title=pathname==='/'?'Account Home':pathname==='/campaigns'?'My Campaigns':pathname==='/settings'?'Account Settings':pathname==='/whatsapp-numbers'?'WhatsApp Numbers':pathname==='/recently-deleted'?'Recently Deleted':'Page unavailable';
  return <StageShell email={user?.email||'Checking session…'} onSignOut={signOut}>
    <div className="page-heading"><div><span className="eyebrow">YOUR ACCOUNT</span><h1>{title}</h1>{pathname==='/campaigns'&&<p>One workspace for each business, with its own numbers, instructions and knowledge.</p>}</div></div>
    {error&&<p role="alert">{error}</p>}{!user?<p role="status">Verifying your session…</p>:<>
      {pathname==='/'&&<section className="panel"><h2>Welcome, {user.name}</h2><p>Manage each business in its own campaign workspace.</p><Link className="primary-button" to="/campaigns">My Campaigns</Link></section>}
      {pathname==='/campaigns'&&<CampaignList/>}{pathname==='/recently-deleted'&&<CampaignList deleted/>}
      {pathname==='/settings'&&<><GeminiSettings/><section className="panel"><h2>Account preferences</h2><form onSubmit={save}><label className="ai-check"><input type="checkbox" checked={preference} onChange={e=>setPreference(e.target.checked)}/>Show getting-started guidance</label><button disabled={busy}>{busy?'Saving…':'Save preference'}</button></form>{notice&&<p role="status">{notice}</p>}</section></>}
      {pathname==='/whatsapp-numbers'&&<NumbersManager/>}
      {!['/','/campaigns','/settings','/whatsapp-numbers','/recently-deleted'].includes(pathname)&&<section className="panel"><p>This page is unavailable.</p><Link to="/campaigns">My Campaigns</Link></section>}
    </>}
  </StageShell>;
}

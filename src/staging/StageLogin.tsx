import React,{useEffect,useState} from 'react';
import { releaseMode } from './api';
export function StageLogin({ email, password, loading, error, setEmail, setPassword, onSubmit }: {
  email: string; password: string; loading: boolean; error: string;
  setEmail: (value: string) => void; setPassword: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  const [live,setLive]=useState(false);useEffect(()=>{releaseMode().then(r=>setLive(r.public)).catch(()=>{});},[]);
  return <div className="login">
    <div className="wordmark"><span className="brand-symbol">↗</span> BLACK ARROW</div>
    <main className="login-card panel">
      <span className="eyebrow">{live?'BLACK ARROW':'ISOLATED STAGING'}</span><h1>Welcome back</h1>
      <p>{live?'Sign in with your existing Black Arrow account.':'Sign in with your independent staging account.'}</p>
      <form onSubmit={onSubmit}>
        <label htmlFor="stage-email">Email</label>
        <input id="stage-email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} />
        <label htmlFor="stage-password">Password</label>
        <input id="stage-password" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e => setPassword(e.target.value)} />
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  </div>;
}

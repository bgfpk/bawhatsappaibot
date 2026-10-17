import { CampaignError } from '../campaigns/contracts';
export class GeminiError extends Error {
  constructor(readonly category:string, message:string, readonly status=502, readonly retryAfter?:number) { super(message); }
}
export function safeGeminiError(error:any):GeminiError {
  if(error instanceof GeminiError)return error;
  if(error instanceof CampaignError)return new GeminiError('changed',error.message,error.status);
  const status=Number(error?.status||error?.code), raw=String(error?.message||'');
  let retryAfter:number|undefined;
  try{const detail=JSON.parse(raw)?.error?.details?.find((d:any)=>String(d['@type']).endsWith('RetryInfo'));
    const seconds=Number(String(detail?.retryDelay||'').replace(/s$/,''));if(detail&&Number.isFinite(seconds)&&seconds>=0)retryAfter=Math.max(1,seconds);}catch{}
  if(status===401||status===403||/API_KEY_INVALID|API key not valid/i.test(raw))
    return new GeminiError('credentials','Google rejected this key or its permissions. Check the AI Studio key and API restrictions.',422);
  if(status===429) {
    const exhausted=/billing|per.?day|daily|limit["\\:\s]+0\b/i.test(raw);
    return new GeminiError(exhausted?'quota':'rate_limit',exhausted?'Google quota is exhausted or billing is unavailable. Check your AI Studio project.':'Google is rate limiting requests. Wait and try again.',429,retryAfter);
  }
  if(status===404)return new GeminiError('model','The selected model is unavailable. Run Test Connection again.',422);
  if(status===400)return new GeminiError('request','Google could not accept this request. Check your project settings and published instructions.',422);
  if(status===504||error?.name==='AbortError'||error?.name==='TimeoutError'||/timed? ?out/i.test(raw))
    return new GeminiError('timeout','Gemini timed out. The request may have reached Google; try again when ready.',504);
  if(status>=500)return new GeminiError('unavailable','Google Gemini is temporarily unavailable. Try again shortly.',503,retryAfter);
  return new GeminiError('network','Cannot reach Google Gemini through the restricted connection. Try again shortly.',503);
}

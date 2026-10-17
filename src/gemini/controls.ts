import { GeminiError } from './errors';
export class GeminiControls {
  private busy=new Set<string>();private calls=new Map<string,number[]>();
  enter(account:string) {
    const now=Date.now(),recent=(this.calls.get(account)||[]).filter(t=>now-t<60000);
    if(this.busy.has(account)||this.busy.size>=2)throw new GeminiError('busy','A Gemini test is already running. Wait for it to finish.',429);
    if(recent.length>=8)throw new GeminiError('rate_limit','Too many tests in a short time. Wait a minute before trying again.',429);
    for(const [a,times]of this.calls)if(!times.some(t=>now-t<60000))this.calls.delete(a);
    this.calls.set(account,[...recent,now]);this.busy.add(account);return ()=>this.busy.delete(account);
  }
}

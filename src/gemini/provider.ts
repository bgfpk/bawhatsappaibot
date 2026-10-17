import { GoogleGenAI, type Content } from '@google/genai';
import { assertGeminiAllowedForPurpose,type AiProviderPolicyInput } from '../services/ai-provider-policy-service';
import { geminiBaseUrl } from './egress-client';
import { GeminiError, safeGeminiError } from './errors';

export type Generation={text:string;model:string;usage:{input:number|null;output:number|null;total:number|null;thoughts:number|null};providerResponseId:string|null};
export class GeminiProvider {
  async client(key:string) {
    // Installed SDK 1.50 discards status/body when retryOptions is supplied.
    // Omitting it uses a single fetch; this module owns the bounded retry policy.
    return new GoogleGenAI({apiKey:key,vertexai:false,httpOptions:{baseUrl:await geminiBaseUrl(),apiVersion:'v1beta',timeout:30000}});
  }
  async selectModel(key:string,guard:()=>void) {
    guard();const client=await this.client(key);const models:any[]=[];
    guard();
    const page=await client.models.list({config:{pageSize:100}});
    for await(const model of page) {models.push(model);if(models.length>=1000)break;guard();}
    const choices=models.filter(m=>/^models\/gemini-[\w.-]+$/.test(m.name||'')&&m.supportedActions?.includes('generateContent')
      &&!/(image|audio|tts|robotics|computer|embedding|live|custom)/i.test(m.name));
    choices.sort((a,b)=> {
      const rank=(name:string)=>(/preview|exp/.test(name)?100:0)+(/flash-lite/.test(name)?0:/flash/.test(name)?10:20);
      return rank(a.name)-rank(b.name)||b.name.localeCompare(a.name,undefined,{numeric:true});
    });
    if(!choices.length)throw new GeminiError('model','No supported text Gemini model is available to this project.',422);
    return choices[0].name.replace(/^models\//,'');
  }
  async generate(key:string,model:string,system:string,contents:Content[],guard:()=>void,onAttempt:()=>void,policy:AiProviderPolicyInput={purpose:'owner_campaign_test',modality:'text',ownerInitiated:true},singleAttempt=false):Promise<Generation> {
    assertGeminiAllowedForPurpose(policy);
    guard();const client=await this.client(key);
    for(let attempt=0;attempt<2;attempt++) {
      guard();onAttempt();
      try {
        const response=await client.models.generateContent({model,contents,config:{systemInstruction:system,maxOutputTokens:2048,temperature:0.3}});
        guard();const text=response.text?.trim();
        if(!text)throw new GeminiError('blocked','Gemini returned no usable text, possibly due to a safety block. Rephrase the question.',422);
        const u=response.usageMetadata;
        return {text,model:response.modelVersion||model,usage:{input:u?.promptTokenCount??null,output:u?.candidatesTokenCount??null,
          total:u?.totalTokenCount??null,thoughts:u?.thoughtsTokenCount??null},providerResponseId:response.responseId??null};
      }catch(error) {
        const safe=safeGeminiError(error);
        // Only explicit temporary provider failures are retried. Unknown network
        // completion, invalid credentials and quota exhaustion never duplicate calls.
        if(!singleAttempt&&policy.purpose!=='authorized_customer_reply'&&attempt===0&&(safe.category==='unavailable'||safe.category==='rate_limit'&&safe.retryAfter!==undefined)
          &&(safe.retryAfter??1)<=3) {await new Promise(resolve=>setTimeout(resolve,(safe.retryAfter??1)*1000));continue;}
        throw safe;
      }
    }
    throw new GeminiError('unavailable','Gemini is unavailable.',503);
  }
}

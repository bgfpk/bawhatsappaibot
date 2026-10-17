import { z } from 'zod';
export const numberName=z.string().trim().min(1).max(120);
export const phoneInput=z.string().trim().max(17).refine(v=>!v||/^\+[1-9]\d{6,14}$/.test(v),'Use international format, including + and country code.');
export const createNumber=z.object({requestId:z.string().uuid(),name:numberName,phone:phoneInput.default(''),campaignId:z.string().uuid().nullable().default(null)}).strict();
export type ConnectionState='disconnected'|'pending'|'unavailable'|'connected'|'revoked';
export type AdapterGrant={adapterId:string;reference:string;accountId:string;numberId:string;expiresAt:number;mode:'synthetic'|'verified'};
export type GrantVerifier=(grant:AdapterGrant)=>boolean;
// This conversion registers no live verifier. Synthetic grants are accepted only
// by explicitly injected offline tests with separate disposable storage.
export const denyLiveAdapters:GrantVerifier=()=>false;

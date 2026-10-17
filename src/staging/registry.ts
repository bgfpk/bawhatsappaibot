
export const isStaging = typeof window === 'undefined' && process.env.BLACKARROW_STAGE === '1';
let documents: any;
export function registerStageDocuments(value: any) {
  if (!isStaging || documents) throw new Error('Invalid staging storage registration');
  documents = value;
}
export function stageDocuments(): any {
  if (!isStaging || !documents) throw new Error('Independent staging storage is unavailable');
  return documents;
}
export const unavailableStageService: any = new Proxy({}, {
  get: () => async () => { throw Object.assign(new Error('Service unavailable in Conversion 02'), { code: 503 }); },
});

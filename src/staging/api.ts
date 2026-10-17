let release:Promise<{public:boolean}>|undefined;
export function releaseMode(){return release??=fetch('/api/release',{credentials:'same-origin'}).then(r=>{if(!r.ok)throw new Error('Release status unavailable');return r.json();}).catch(e=>{release=undefined;throw e;});}
export async function stageApi(path:string,method='GET',body?:unknown){
 const headers:Record<string,string>=body===undefined?{}:{'Content-Type':'application/json'};
 if(!['GET','HEAD'].includes(method)&&(await releaseMode()).public){
  const csrf=await fetch('/api/auth/csrf',{credentials:'same-origin'}).then(async r=>{if(!r.ok)throw new Error('Authentication unavailable');return r.json();});
  headers['x-blackarrow-csrf']=csrf.csrf;
 }
 const response=await fetch(path,{method,credentials:'same-origin',headers,body:body===undefined?undefined:JSON.stringify(body)});
 const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'Request failed'),{status:response.status});return data;
}

/** Socket construction extracted from the transferred whatsapp-connection.ts.
 * No SDK import, discovery, authentication or network work occurs before permit(). */
export type SessionSocket={ev:{on:(event:string,listener:(value:any)=>void)=>void;off:(event:string,listener:(value:any)=>void)=>void};sendMessage:(jid:string,body:any,options:any)=>Promise<any>;end?:(error?:Error)=>void;ws?:{readyState:number};user?:{id:string}};
export type SocketFactory=(options:any)=>SessionSocket;
export function openWhatsAppSocket(input:{permit:()=>void;makeSocket:SocketFactory;options:any;saveCreds:(update:any)=>Promise<void>;connection:(update:any)=>void}){
 input.permit();
 const socket=input.makeSocket(input.options);
 const creds=(update:any)=>{void input.saveCreds(update).catch(()=>input.connection({connection:'close',localError:'auth_persistence_failed'}));};
 socket.ev.on('creds.update',creds);socket.ev.on('connection.update',input.connection);
 return {socket,dispose(){socket.ev.off('creds.update',creds);socket.ev.off('connection.update',input.connection);socket.end?.();}};
}

/** @typedef {{id:string,sequence:number,role:'user'|'support',text:string,createdAt:string,delivery:'queued'|'delivered'|'cancelled',agent:string|null}} SupportMessage */
/** @typedef {{conversationId:string|null,messages:SupportMessage[],hasMore:boolean,before:number|null,available:boolean,agentAccess:boolean,warning:string|null}} SupportState */
export const supportNotice =
  'Messages are sent to our private Discord support channel. Replies appear here. Please omit health records, precise location, credentials and receipts.';
/** @typedef {(method:'GET'|'POST'|'PUT',body?:unknown,before?:number)=>Promise<SupportState>} SupportRequest */

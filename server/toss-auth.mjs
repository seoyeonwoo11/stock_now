import {providerError} from './providers.mjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function createTossAuth({clientId,clientSecret,fetchImpl=globalThis.fetch,now=()=>Date.now(),state={},db}={}){
 async function issue(){
  let response;
  try{response=await fetchImpl('https://openapi.tossinvest.com/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json','User-Agent':'Mozilla/5.0 StockNow/0.3'},body:new URLSearchParams({grant_type:'client_credentials',client_id:clientId,client_secret:clientSecret}).toString(),signal:AbortSignal.timeout(12000)});}
  catch{throw providerError('토스증권 인증 서버에 연결할 수 없어요.','PROVIDER_UNREACHABLE');}
  if(!response.ok){
   let reason;try{reason=await response.json();}catch{}
   const known=['invalid_client','invalid_request','access_denied','unsupported_grant_type'];
   console.warn('toss_auth_failed',{status:response.status,code:known.includes(reason?.error)?reason.error:'upstream_error',configured:typeof clientId==='string'&&typeof clientSecret==='string'});
   throw providerError(response.status===403?'토스증권 허용 IP 설정을 확인해 주세요.':'토스증권 API 키와 인증 설정을 확인해 주세요.','PROVIDER_ACCESS_DENIED');
  }
  let data;try{data=await response.json();}catch{throw providerError('토스증권 인증 응답이 올바르지 않아요.');}
  if(typeof data.access_token!=='string'||!data.access_token||!Number.isFinite(data.expires_in)||data.expires_in<=60)throw providerError('토스증권 인증 응답이 올바르지 않아요.');
  return {token:data.access_token,expiresAt:now()+data.expires_in*1000};
 }
 return async function token(rejected){
  if(!clientId||!clientSecret)throw providerError('서버에 토스증권 API 키를 설정해 주세요.','PROVIDER_ACCESS_DENIED');
  if(rejected){
   if(state.value?.token===rejected)delete state.value;
   if(db)await db.prepare('UPDATE provider_tokens SET expires_at = 0 WHERE client_id = ? AND access_token = ?').bind(clientId,rejected).run();
  }
  if(state.value?.expiresAt>now()+60000)return state.value.token;
  if(!db){
   // Standalone Node owns this promise; Workers use the D1 lease below instead.
   state.pending??=issue().then(value=>state.value=value).finally(()=>{delete state.pending;});
   return (await state.pending).token;
  }
  // Toss allows one active token per client. A shared lease prevents isolates revoking each other's tokens.
  await db.prepare('INSERT INTO provider_tokens (client_id) VALUES (?) ON CONFLICT(client_id) DO NOTHING').bind(clientId).run();
  for(let attempt=0;attempt<30;attempt++){
   const saved=await db.prepare('SELECT access_token, expires_at FROM provider_tokens WHERE client_id = ?').bind(clientId).first();
   if(saved?.access_token&&saved.expires_at>now()+60000){state.value={token:saved.access_token,expiresAt:saved.expires_at};return state.value.token;}
   const lease=now()+20000;
   const lock=await db.prepare('UPDATE provider_tokens SET lease_until = ? WHERE client_id = ? AND lease_until <= ? AND expires_at <= ?').bind(lease,clientId,now(),now()+60000).run();
   if(lock.meta.changes){
    try{
     const value=await issue();
     await db.prepare('UPDATE provider_tokens SET access_token = ?, expires_at = ?, lease_until = 0 WHERE client_id = ? AND lease_until = ?').bind(value.token,value.expiresAt,clientId,lease).run();
     state.value=value;return value.token;
    }finally{await db.prepare('UPDATE provider_tokens SET lease_until = 0 WHERE client_id = ? AND lease_until = ?').bind(clientId,lease).run();}
   }
   await pause(100);
  }
  throw providerError('토스증권 인증을 갱신하고 있어요. 잠시 후 다시 시도해 주세요.','PROVIDER_UNREACHABLE');
 };
}

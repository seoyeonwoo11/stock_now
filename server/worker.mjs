import {createDemoProvider} from './providers.mjs';
import {createTossProvider} from './toss.mjs';
import {catalog,ranges} from './catalog.mjs';
import {createNewsProvider} from './news.mjs';
import {assets} from './worker-assets.mjs';
// Only completed data crosses request boundaries; pending I/O belongs to its request.
const quoteCache=new Map(),newsCache=new Map(),stocks=new Map(catalog.map(stock=>[stock.symbol,stock])),demo=createDemoProvider(),authState={};
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default {
 async fetch(request,env={}) {
  const url=new URL(request.url),path=url.pathname;
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  if(path==='/healthz')return json({status:'ok',runtime:'cloudflare-worker'});
  if(!path.startsWith('/api/')){
   const asset=assets[path]??(path.includes('.')?null:assets['/']);
   return asset?new Response(asset.body,{headers:{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff'}}):new Response('Not found',{status:404});
  }
  const toss=createTossProvider({clientId:env.TOSS_CLIENT_ID,clientSecret:env.TOSS_CLIENT_SECRET,cache:quoteCache,stocks,authState,db:env.DB}),news=createNewsProvider({cache:newsCache});
  const isDemo=path.startsWith('/api/demo/'),route=path.slice(isDemo?9:4),provider=isDemo?demo:toss;
  try {
   if(route==='/status')return json({...provider.status,pollInterval:isDemo?5000:15000});
   if(route==='/search'){
    const q=url.searchParams.get('q')??'',type=url.searchParams.get('type')??'all',market=url.searchParams.get('market')??'all';
    if(q.length>100||!['all','stock','etf'].includes(type)||!['all','KR','US'].includes(market))return json({error:'검색 조건이 올바르지 않아요.'},400);
    return json({...await provider.search({q,type,market}),source:provider.status.mode});
   }
   const match=route.match(/^\/quotes\/([^/]+)(?:\/(history|stream|news))?$/);
   if(!match)return json({error:'API 경로를 찾을 수 없어요.'},404);
   const [,symbol,action]=match;
   if(!/^[A-Z0-9.-]{1,18}$/.test(symbol))return json({error:'종목 코드가 올바르지 않아요.'},400);
   if(action==='news'){const data=await news.forSymbol(symbol,toss);return json(data??{error:'종목을 찾을 수 없어요.'},data?200:404);}
   if(action==='history'){
    const range=url.searchParams.get('range')??'1D';
    if(!Object.hasOwn(ranges,range))return json({error:'차트 기간이 올바르지 않아요.'},400);
    const data=await provider.history(symbol,range);return json(data??{error:'종목을 찾을 수 없어요.'},data?200:404);
   }
   const data=await provider.quote(symbol);
   if(!data)return json({error:'종목을 찾을 수 없어요.'},404);
   if(action==='stream'){
    let timer,deadline,closed=false;
    const cleanup=()=>{closed=true;clearInterval(timer);clearTimeout(deadline);};
    const encoder=new TextEncoder();
    const stream=new ReadableStream({
     start(controller){
      const write=(event,value)=>{if(!closed)controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`));};
      controller.enqueue(encoder.encode('retry: 1000\n\n'));write('quote',data);
      let pending=false;
      timer=setInterval(async()=>{if(pending||closed)return;pending=true;try{const quote=await provider.quote(symbol);write(quote?'quote':'quote-error',quote??{error:'시세가 없어요.'});}catch{write('quote-error',{error:'시세 갱신을 재시도하고 있어요.'});}finally{pending=false;}},isDemo?5000:15000);
      deadline=setTimeout(()=>{cleanup();controller.close();},55000);
     },cancel(){cleanup();}
    });
    return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store'}});
   }
   return json(data);
  }catch(error){const known=['PROVIDER_ERROR','PROVIDER_UNREACHABLE','PROVIDER_ACCESS_DENIED','PROVIDER_RATE_LIMIT','HISTORY_UNAVAILABLE','QUOTE_NOT_FOUND','NEWS_UNAVAILABLE'].includes(error.code);return json({error:known?error.message:'시세를 가져오지 못했어요.',code:known?error.code:'PROVIDER_ERROR'},error.code==='QUOTE_NOT_FOUND'?404:503);}
 }
};

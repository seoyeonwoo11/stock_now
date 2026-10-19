import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {createTossProvider} from '../server/toss.mjs';
import {createTossAuth} from '../server/toss-auth.mjs';
const credentials={clientId:'test-client',clientSecret:'test-secret'};
const stock=(symbol='005930',extra={})=>({symbol,name:symbol==='005930'?'삼성전자':'애플',englishName:symbol==='005930'?'Samsung Electronics':'Apple',market:symbol==='005930'?'KOSPI':'NASDAQ',currency:symbol==='005930'?'KRW':'USD',securityType:'STOCK',status:'ACTIVE',...extra});
const candle=(timestamp,close='223500')=>({timestamp,openPrice:'217000',highPrice:'224000',lowPrice:'216000',closePrice:close,volume:'123456',currency:'KRW'});
const regular={startTime:'2026-10-19T09:00:00+09:00',endTime:'2026-10-19T15:30:00+09:00'};
function mock(overrides={}){
 const urls=[],fetchImpl=async(url,options)=>{
  urls.push(url);const path=new URL(url).pathname,query=new URL(url).searchParams;
  if(path==='/oauth2/token')return Response.json({access_token:'mock-token',expires_in:86400});
  assert.equal(options.headers.Authorization,'Bearer mock-token');
  if(overrides[path])return overrides[path](query);
  if(path==='/api/v1/stocks')return Response.json({result:query.get('symbols').split(',').map(s=>stock(s))});
  if(path==='/api/v1/prices')return Response.json({result:query.get('symbols').split(',').reverse().map(symbol=>({symbol,lastPrice:'223500',timestamp:'2026-10-19T16:00:00+09:00',currency:symbol==='005930'?'KRW':'USD'}))});
  if(path==='/api/v1/candles')return Response.json({result:{candles:[candle('2026-10-19T00:00:00+09:00'),candle('2026-10-16T00:00:00+09:00','215500')],nextBefore:null}});
  if(path.startsWith('/api/v1/market-calendar/'))return Response.json({result:{today:{date:query.get('date'),integrated:{regularMarket:regular},regularMarket:regular}}});
  throw new Error('Unexpected path: '+path);
 };
 return {urls,provider:createTossProvider({...credentials,fetchImpl})};
}
test('Toss maps prices, previous close, source, sessions and caches without calling account/order APIs',async()=>{
 const {provider,urls}=mock();const q=await provider.quote('005930');
 assert.equal(q.source,'toss');assert.equal(q.isDemo,false);assert.equal(q.price,223500);assert.equal(q.previousClose,215500);assert.equal(q.change,8000);assert.equal(q.volume,123456);assert.equal(q.session,'extended');assert.equal(q.asOf,'2026-10-19T07:00:00.000Z');
 await provider.quote('005930');assert.equal(urls.filter(u=>u.includes('/prices?')).length,1);assert.equal(urls.filter(u=>u.includes('/oauth2/')).length,1);
 assert.ok(urls.every(u=>new URL(u).hostname==='openapi.tossinvest.com'));assert.ok(urls.every(u=>!u.includes('account')&&!u.includes('order')));
});
test('missing statistics and timestamps stay null, and blank prices are never coerced to zero',async()=>{
 const {provider}=mock({'/api/v1/prices':()=>Response.json({result:[{symbol:'005930',lastPrice:'100',timestamp:null,currency:'KRW'}]}),'/api/v1/candles':()=>Response.json({result:{candles:[],nextBefore:null}})});
 const q=await provider.quote('005930');for(const key of ['previousClose','change','changePercent','asOf','volume'])assert.equal(q[key],null);
 assert.equal(await mock({'/api/v1/prices':()=>Response.json({result:[{symbol:'005930',lastPrice:'',currency:'KRW'}]})}).provider.quote('005930'),null);
});
test('minute pagination deduplicates, sorts, encodes offsets and preserves closing auction/extended sessions',async()=>{
 let pages=0;const {provider,urls}=mock({'/api/v1/candles':query=>{
  assert.equal(query.get('interval'),'1m');assert.equal(query.get('adjusted'),'false');pages++;
  return Response.json({result:pages===1?{candles:[candle('2026-10-19T15:40:00+09:00'),candle('2026-10-19T15:30:00+09:00')],nextBefore:'2026-10-19T15:30:00+09:00'}:{candles:[candle('2026-10-19T15:30:00+09:00'),candle('2026-10-19T09:00:00+09:00'),candle('2026-10-16T15:30:00+09:00')],nextBefore:null}});
 }});
 const h=await provider.history('005930','1D');assert.equal(h.source,'toss');assert.equal(h.points.length,3);assert.deepEqual(h.points.map(p=>p.session),['regular','regular','extended']);assert.equal(pages,2);assert.ok(urls.some(u=>u.includes('%2B09%3A00')));
});
test('US calendar controls early close; calendar failure never guesses regular hours',async()=>{
 const {provider}=mock({'/api/v1/candles':()=>Response.json({result:{candles:[candle('2026-11-27T18:05:00Z'),candle('2026-11-27T17:55:00Z'),candle('2026-11-27T14:25:00Z')],nextBefore:null}}),'/api/v1/market-calendar/US':()=>Response.json({result:{today:{date:'2026-11-27',regularMarket:{startTime:'2026-11-27T14:30:00Z',endTime:'2026-11-27T18:00:00Z'}}}})});
 assert.deepEqual((await provider.history('AAPL','1D')).points.map(p=>p.session),['extended','regular','extended']);
 const missing=mock({'/api/v1/candles':()=>Response.json({result:{candles:[candle('2026-10-19T09:01:00+09:00')],nextBefore:null}}),'/api/v1/market-calendar/KR':()=>new Response('',{status:503})});assert.equal((await missing.provider.history('005930','1D')).points[0].session,'unknown');
});
test('year chart loads past 200 daily bars without fading daily data',async()=>{
 const bars=Array.from({length:300},(_,i)=>candle(new Date(Date.UTC(2026,9,19)-i*86400000).toISOString()));let pages=0;
 const {provider}=mock({'/api/v1/candles':()=>Response.json({result:{candles:pages++===0?bars.slice(0,200):bars.slice(200),nextBefore:pages===1?bars[199].timestamp:null}})});
 const h=await provider.history('005930','1Y');assert.equal(h.points.length,300);assert.equal(pages,2);assert.ok(h.points.every((p,i)=>p.session===undefined&&(i===0||p.time>h.points[i-1].time)));
});
test('search uses Toss market lists, symbol lookup and ETF metadata',async()=>{
 const {provider}=mock({'/api/v1/stocks/all':()=>Response.json({result:[{symbol:'123456',name:'새로운기업',securityType:'ETF'}]}),'/api/v1/stocks':query=>Response.json({result:query.get('symbols').split(',').map(s=>stock(s,s==='123456'?{name:'새로운기업',securityType:'ETF',market:'KOSDAQ',currency:'KRW'}:{}))})});
 const list=await provider.search({q:'새로운기업',market:'KR',type:'etf'});assert.equal(list.items[0].symbol,'123456');assert.equal(list.items[0].exchange,'KOSDAQ');assert.equal(list.items[0].type,'etf');
 assert.ok((await provider.search({q:'ADBE',market:'US'})).items.some(q=>q.symbol==='ADBE'));
});
test('401 refreshes once; errors never expose keys or upstream response text',async()=>{
 let tokens=0,prices=0;const fetchImpl=async url=>{
  if(url.endsWith('/oauth2/token'))return Response.json({access_token:'token-'+(++tokens),expires_in:86400});
  if(url.includes('/stocks?'))return Response.json({result:[stock()]});
  if(url.includes('/prices?'))return new Response(credentials.clientSecret,{status:++prices===1?401:403});
  throw new Error('Unexpected path');
 };
 await assert.rejects(()=>createTossProvider({...credentials,fetchImpl}).quote('005930'),e=>e.code==='PROVIDER_ACCESS_DENIED'&&!e.message.includes(credentials.clientSecret));assert.equal(tokens,2);
 await assert.rejects(()=>createTossProvider({fetchImpl:()=>{throw Error('must not call');}}).quote('005930'),e=>e.code==='PROVIDER_ACCESS_DENIED');
});
test('D1 lease shares one token across isolates and preserves a newer token during a stale 401',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync(new URL('../drizzle/0000_toss_auth.sql',import.meta.url),'utf8'));
 const db={prepare(sql){return {bind(...values){return {async first(){return sqlite.prepare(sql).get(...values);},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}};}};}};}};
 let calls=0,now=100000;const fetchImpl=async()=>{calls++;await new Promise(r=>setTimeout(r,5));return Response.json({access_token:'token-'+calls,expires_in:120});};
 const a=createTossAuth({...credentials,db,fetchImpl,now:()=>now}),b=createTossAuth({...credentials,db,fetchImpl,now:()=>now});
 assert.deepEqual(await Promise.all([a(),b()]),['token-1','token-1']);assert.equal(calls,1);
 now+=61000;assert.equal(await a(),'token-2');assert.equal(await b('token-1'),'token-2');assert.equal(calls,2);sqlite.close();
});

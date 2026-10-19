import test from 'node:test';
import assert from 'node:assert/strict';
import { createYahooProvider } from '../server/providers.mjs';
const fixture={chart:{result:[{meta:{regularMarketPrice:72800,chartPreviousClose:71400,regularMarketTime:1760000000,currency:'KRW',regularMarketDayHigh:73400,regularMarketDayLow:71100,regularMarketVolume:2150000,exchangeDataDelayedBy:20,instrumentType:'EQUITY'},timestamp:[1759999800,1759999900,1760000000],indicators:{quote:[{open:[71500,72100,72700],high:[71700,72300,72900],low:[71300,72000,72600],close:[71600,null,72800]}]}}],error:null}};
test('Yahoo mapping preserves prices, delay and provenance and deduplicates concurrent requests',async()=>{
 let calls=0,url;const provider=createYahooProvider({fetchImpl:async u=>{calls++;url=u;return Response.json(fixture);}});const [a,b]=await Promise.all([provider.quote('005930'),provider.quote('005930')]);assert.deepEqual(a,b);assert.equal(a.price,72800);assert.equal(a.change,1400);assert.equal(a.delayMinutes,20);assert.equal(a.isDemo,false);assert.equal(a.open,71500);assert.match(url,/005930.KS\?range=1d&interval=5m$/);assert.equal(calls,1);assert.deepEqual((await provider.history('005930','1D')).points.map(p=>p.price),[71600,72800]);assert.match(url,/includePrePost=true$/);assert.equal(calls,2);
});

test('intraday sessions use each trading day, including DST and early closes, without changing prices',async()=>{
 const data=structuredClone(fixture),chart=data.chart.result[0];
 const seconds=value=>Date.parse(value)/1000;
 chart.meta.currency='USD';chart.meta.exchangeTimezoneName='America/New_York';
 chart.meta.tradingPeriods={regular:[[{start:seconds('2025-10-31T13:30Z'),end:seconds('2025-10-31T20:00Z')}],[{start:seconds('2025-11-03T14:30Z'),end:seconds('2025-11-03T21:00Z')}],[{start:seconds('2025-11-28T14:30Z'),end:seconds('2025-11-28T18:00Z')}]]};
 chart.timestamp=['2025-10-31T13:25Z','2025-10-31T13:30Z','2025-11-03T14:25Z','2025-11-03T14:30Z','2025-11-28T17:55Z','2025-11-28T18:00Z'].map(seconds);
 chart.indicators.quote[0].close=[100,101,102,103,104,105];
 let url;const provider=createYahooProvider({fetchImpl:async u=>{url=u;return Response.json(data);}});
 const result=await provider.history('AAPL','1W');
 assert.deepEqual(result.points.map(p=>p.session),['extended','regular','extended','regular','regular','extended']);
 assert.deepEqual(result.points.map(p=>p.price),[100,101,102,103,104,105]);
 assert.match(url,/range=5d&interval=30m&includePrePost=true$/);
 const daily=await provider.history('AAPL','1M');assert.ok(daily.points.every(p=>p.session===undefined));assert.doesNotMatch(url,/includePrePost/);
 await provider.quote('AAPL');assert.doesNotMatch(url,/includePrePost/);
});

test('Korean 15:00–15:30 remains regular when Yahoo returns the old 6-hour schedule',async()=>{
 const data=structuredClone(fixture),chart=data.chart.result[0],seconds=value=>Date.parse(value)/1000;
 chart.meta.exchangeTimezoneName='Asia/Seoul';
 chart.meta.tradingPeriods=[[{start:seconds('2026-10-19T00:00Z'),end:seconds('2026-10-19T06:00Z')}]];
 chart.timestamp=['2026-10-19T00:00Z','2026-10-19T06:25Z','2026-10-19T06:30Z','2026-10-19T06:40Z'].map(seconds);chart.indicators.quote[0].close=[71600,72800,72900,73000];
 const result=await createYahooProvider({fetchImpl:async()=>Response.json(data)}).history('005930','1D');
 assert.deepEqual(result.points.map(p=>p.session),['regular','regular','regular','extended']);
});

test('missing session metadata stays unknown rather than guessing trading hours',async()=>{
 const result=await createYahooProvider({fetchImpl:async()=>Response.json(fixture)}).history('005930','1D');
 assert.ok(result.points.every(p=>p.session==='unknown'));
});
test('cache expiration and interval selection',async()=>{let now=100000,calls=0,url;const provider=createYahooProvider({now:()=>now,fetchImpl:async u=>{calls++;url=u;return Response.json(fixture);}});await provider.quote('AAPL');now+=16000;await provider.quote('AAPL');assert.equal(calls,2);await provider.history('AAPL','1Y');assert.match(url,/range=1y&interval=1wk$/);});
test('network denial, rate limits and missing prices fail explicitly',async()=>{
 for(const [status,code] of [[403,'PROVIDER_ACCESS_DENIED'],[429,'PROVIDER_RATE_LIMIT']]){const provider=createYahooProvider({fetchImpl:async()=>new Response('',{status})});await assert.rejects(()=>provider.quote('AAPL'),error=>error.code===code);}
 const unreachable=createYahooProvider({fetchImpl:async()=>{throw new Error('proxy denied');}});await assert.rejects(()=>unreachable.quote('AAPL'),error=>error.code==='PROVIDER_UNREACHABLE');
 const bad=structuredClone(fixture);delete bad.chart.result[0].meta.regularMarketPrice;await assert.rejects(()=>createYahooProvider({fetchImpl:async()=>Response.json(bad)}).quote('AAPL'));
});
test('search outside the default list and quote restoration after restart',async()=>{
 const equity=structuredClone(fixture);Object.assign(equity.chart.result[0].meta,{currency:'USD',shortName:'Adobe'});
 const fetchImpl=async url=>Response.json(url.includes('/search?')?{quotes:[{symbol:'ADBE',shortname:'Adobe',longname:'Adobe Inc.',quoteType:'EQUITY',exchange:'NMS'}]}:equity);
 const data=await createYahooProvider({fetchImpl}).search({q:'Adobe',market:'US'});assert.equal(data.items.length,1);assert.equal(data.items[0].symbol,'ADBE');assert.equal((await createYahooProvider({fetchImpl}).quote('ADBE')).isDemo,false);
});
test('request-scoped quote providers share completed data but never await another request',async()=>{
 const cache=new Map();let release,calls=0;
 const first=createYahooProvider({cache,fetchImpl:()=>{calls++;return new Promise(resolve=>{release=()=>resolve(Response.json(fixture));});}});
 const pending=first.quote('005930');
 const second=createYahooProvider({cache,fetchImpl:async()=>{calls++;return Response.json(fixture);}});
 const response=await second.quote('005930');assert.equal(calls,2);release();await pending;
 const third=createYahooProvider({cache,fetchImpl:()=>{throw new Error('must use completed cache');}});
 assert.deepEqual(await third.quote('005930'),response);
});

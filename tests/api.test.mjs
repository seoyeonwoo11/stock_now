import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.mjs';
async function withServer(options,run){const server=createApp({serveStatic:false,...options}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));try{await run(`http://127.0.0.1:${server.address().port}`);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
test('Korean, English and symbol searches with ETF/market filters',async()=>withServer({mode:'demo'},async base=>{
 for(const query of ['삼성전자','Samsung','005930']){const result=await(await fetch(`${base}/api/search?q=${encodeURIComponent(query)}`)).json();assert.deepEqual(result.items.map(q=>q.symbol),['005930']);}
 const result=await(await fetch(`${base}/api/search?type=etf&market=US`)).json();assert.equal(result.items.length,3);assert.ok(result.items.every(q=>q.isDemo&&q.type==='etf'&&q.market==='US'));
 assert.deepEqual((await(await fetch(`${base}/api/search?q=없는종목`)).json()).items,[]);
}));
test('demo quote provenance, price invariants and five chronological chart periods',async()=>withServer({mode:'demo'},async base=>{
 const q=await(await fetch(`${base}/api/quotes/005930`)).json();assert.equal(q.source,'demo');assert.equal(q.isDemo,true);assert.equal(q.change,q.price-q.previousClose);assert.ok(q.low<=q.price&&q.price<=q.high);
 for(const range of ['1D','1W','1M','3M','1Y']){const h=await(await fetch(`${base}/api/quotes/005930/history?range=${range}`)).json();assert.equal(h.points.length,80);assert.equal(h.isDemo,true);assert.ok(h.points.every((p,i)=>Number.isFinite(p.price)&&(i===0||Date.parse(p.time)>Date.parse(h.points[i-1].time))));}
}));
test('invalid input and unknown symbols fail with 400/404',async()=>withServer({mode:'demo'},async base=>{
 for(const path of ['/api/search?type=crypto','/api/search?market=ZZ','/api/search?q=a&q=b','/api/quotes/%24bad','/api/quotes/AAPL/history?range=constructor','/api/quotes/AAPL/history?range=10Y'])assert.equal((await fetch(base+path)).status,400,path);
 assert.equal((await fetch(`${base}/api/quotes/MISSING`)).status,404);assert.equal((await fetch(`${base}/api/missing`)).status,404);
}));
test('SSE supplies initial and subsequent quotes and allows disconnect',async()=>withServer({mode:'demo',pollInterval:250},async base=>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3000);const response=await fetch(`${base}/api/quotes/AAPL/stream`,{signal:controller.signal});assert.match(response.headers.get('content-type'),/text\/event-stream/);const reader=response.body.getReader();let body='';
 try{while((body.match(/event: quote\n/g)||[]).length<2){const item=await reader.read();body+=new TextDecoder().decode(item.value);}const values=[...body.matchAll(/data: (.+)\n/g)].map(m=>JSON.parse(m[1]));assert.ok(values.every(q=>q.symbol==='AAPL'&&q.isDemo));assert.ok(Date.parse(values[1].asOf)>Date.parse(values[0].asOf));}finally{clearTimeout(timer);controller.abort();await reader.cancel().catch(()=>{});}
}));
test('live failures never silently become demo prices or disclose internal errors',async()=>{
 const provider={status:{mode:'yahoo'},async search(){throw new Error('sensitive-value');}};
 await withServer({provider},async base=>{const response=await fetch(`${base}/api/search`);assert.equal(response.status,502);assert.doesNotMatch(await response.text(),/sensitive-value|"items"/);const demo=await(await fetch(`${base}/api/demo/search?q=애플`)).json();assert.equal(demo.items[0].symbol,'AAPL');assert.equal(demo.items[0].isDemo,true);});
});

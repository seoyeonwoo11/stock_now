import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewsProvider} from '../server/news.mjs';

const rss=`<rss><channel>
<item><title>이전 기사 - 경제신문</title><link>https://news.google.com/old</link><pubDate>Sun, 18 Oct 2026 01:00:00 GMT</pubDate><source url="https://example.com">경제신문</source></item>
<item><title>삼성전자 &amp; 실적 - 경제신문</title><link>https://news.google.com/new</link><pubDate>Mon, 19 Oct 2026 01:00:00 GMT</pubDate><source url="https://example.com">경제신문</source></item>
<item><title>중복</title><link>https://news.google.com/new</link><pubDate>Sun, 18 Oct 2026 01:00:00 GMT</pubDate></item>
<item><title>잘못된 링크</title><link>javascript:alert(1)</link><pubDate>Mon, 19 Oct 2026 01:00:00 GMT</pubDate></item>
</channel></rss>`;
test('Korean RSS keeps publisher/date, decodes title, sorts, deduplicates and excludes unsafe links',async()=>{
 let requested;
 const provider=createNewsProvider({fetchImpl:async url=>{requested=new URL(url);return new Response(rss);}});
 const result=await provider.forSymbol('005930');
 assert.equal(requested.hostname,'news.google.com');assert.match(requested.searchParams.get('q'),/삼성전자/);
 assert.equal(result.source,'Google News');assert.equal(result.items.length,2);
 assert.equal(result.items[0].title,'삼성전자 & 실적');assert.equal(result.items[0].publisher,'경제신문');
 assert.equal(result.items[0].publishedAt,'2026-10-19T01:00:00.000Z');
});
test('US search maps Yahoo headlines and filters unrelated tickers',async()=>{
 const provider=createNewsProvider({fetchImpl:async()=>Response.json({news:[
  {uuid:'a',title:'Apple earnings',publisher:'Publisher',link:'https://finance.yahoo.com/a',providerPublishTime:1792371600,relatedTickers:['AAPL']},
  {uuid:'b',title:'Unrelated',link:'https://finance.yahoo.com/b',providerPublishTime:1792371600,relatedTickers:['OTHER']}
 ]})});
 const result=await provider.forSymbol('AAPL');assert.equal(result.source,'Yahoo Finance');assert.deepEqual(result.items.map(n=>n.id),['a']);
});
test('Yahoo denial falls back to RSS and concurrent requests share a cache entry',async()=>{
 let calls=0,now=1000;
 const provider=createNewsProvider({now:()=>now,fetchImpl:async url=>{calls++;return url.includes('finance.yahoo.com')?new Response('',{status:429}):new Response(rss);}});
 const [a,b]=await Promise.all([provider.forSymbol('AAPL'),provider.forSymbol('AAPL')]);
 assert.deepEqual(a,b);assert.equal(calls,2);assert.equal(a.source,'Google News');
 await provider.forSymbol('AAPL');assert.equal(calls,2);
 now+=300001;await provider.forSymbol('AAPL');assert.equal(calls,4);
});
test('invalid or missing symbols and malformed feeds do not fabricate articles',async()=>{
 const provider=createNewsProvider({fetchImpl:async()=>new Response('<html>upstream error</html>')});
 assert.equal(await provider.forSymbol('$bad'),null);
 assert.equal(await provider.forSymbol('MISSING',{quote:async()=>null}),null);
 await assert.rejects(()=>provider.forSymbol('005930'),error=>error.code==='NEWS_UNAVAILABLE');
});
test('a failed refresh retains dated news for at most one day',async()=>{
 let now=1000,fail=false;
 const provider=createNewsProvider({now:()=>now,fetchImpl:async()=>{if(fail)throw new Error('network failure');return new Response(rss);}});
 const fresh=await provider.forSymbol('005930');fail=true;now+=300001;
 const stale=await provider.forSymbol('005930');
 assert.deepEqual(stale.items,fresh.items);assert.equal(stale.fetchedAt,fresh.fetchedAt);assert.match(stale.warning,/마지막으로 받은 기사/);
 now=1000+86400000;await assert.rejects(()=>provider.forSymbol('005930'),error=>error.code==='NEWS_UNAVAILABLE');
});
test('request-scoped news providers share completed data but not pending network work',async()=>{
 const cache=new Map();let release,calls=0;
 const first=createNewsProvider({cache,fetchImpl:()=>{calls++;return new Promise(resolve=>{release=()=>resolve(new Response(rss));});}});
 const pending=first.forSymbol('005930');
 const second=createNewsProvider({cache,fetchImpl:async()=>{calls++;return new Response(rss);}});
 const response=await second.forSymbol('005930');assert.equal(calls,2);release();await pending;
 const third=createNewsProvider({cache,fetchImpl:()=>{throw new Error('must use completed cache');}});
 assert.deepEqual((await third.forSymbol('005930')).items,response.items);
});
test('Google 503 for a Korean stock falls back to Yahoo company-name search with its exchange ticker',async()=>{
 const urls=[];
 const provider=createNewsProvider({fetchImpl:async value=>{const url=new URL(value);urls.push(url);return url.hostname==='news.google.com'?new Response('',{status:503}):Response.json({news:[{uuid:'samsung',title:'Samsung earnings',publisher:'Publisher',link:'https://finance.yahoo.com/samsung',providerPublishTime:1792371600,relatedTickers:['005930.KS']}]});}});
 const result=await provider.forSymbol('005930');
 assert.equal(urls.length,2);assert.equal(urls[1].hostname,'query1.finance.yahoo.com');assert.equal(urls[1].searchParams.get('q'),'Samsung Electronics');
 assert.equal(result.source,'Yahoo Finance');assert.equal(result.items.length,1);
});

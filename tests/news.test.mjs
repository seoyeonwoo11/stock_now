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
 let requested,headers;
 const provider=createNewsProvider({fetchImpl:async(url,options)=>{requested=new URL(url);headers=options.headers;return new Response(rss); }});
 const result=await provider.forSymbol('005930');
 assert.match(headers['User-Agent'],/StockNow/);assert.equal(requested.hostname,'news.google.com');assert.match(requested.searchParams.get('q'),/삼성전자/);
 assert.equal(result.source,'Google News');assert.equal(result.items.length,2);
 assert.equal(result.items[0].title,'삼성전자 & 실적');assert.equal(result.items[0].publisher,'경제신문');
 assert.equal(result.items[0].publishedAt,'2026-10-19T01:00:00.000Z');
});
test('Google RSS serves US news and concurrent requests share a cache entry',async()=>{
 let calls=0,now=1000;
 const provider=createNewsProvider({now:()=>now,fetchImpl:async url=>{calls++;assert.equal(new URL(url).hostname,'news.google.com');return new Response(rss);}});
 const [a,b]=await Promise.all([provider.forSymbol('AAPL'),provider.forSymbol('AAPL')]);
 assert.deepEqual(a,b);assert.equal(calls,1);assert.equal(a.source,'Google News');
 await provider.forSymbol('AAPL');assert.equal(calls,1);
 now+=300001;await provider.forSymbol('AAPL');assert.equal(calls,2);
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
test('Google failure never calls a financial website fallback',async()=>{const urls=[];const provider=createNewsProvider({fetchImpl:async url=>{urls.push(url);return new Response('',{status:503});}});await assert.rejects(()=>provider.forSymbol('005930'),e=>e.code==='NEWS_UNAVAILABLE');assert.equal(urls.length,1);assert.equal(new URL(urls[0]).hostname,'news.google.com');});

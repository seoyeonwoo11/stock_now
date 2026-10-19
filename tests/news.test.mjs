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

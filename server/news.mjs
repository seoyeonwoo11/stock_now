import {XMLParser} from 'fast-xml-parser';
import {catalog} from './catalog.mjs';

const seeded=new Map(catalog.map(stock=>[stock.symbol,stock]));
const parser=new XMLParser({ignoreAttributes:false,parseTagValue:false,processEntities:false});
const text=value=>String(value??'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const newsError=()=>Object.assign(new Error('뉴스 제공원 응답이 지연되거나 연결되지 않아요. 다시 시도해 주세요.'),{code:'NEWS_UNAVAILABLE'});
function safeUrl(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}}
function normalize(items){
 const seen=new Set();
 return items.filter(item=>item.title&&item.url&&Number.isFinite(Date.parse(item.publishedAt)))
  .sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt))
  .filter(item=>{if(seen.has(item.url))return false;seen.add(item.url);return true;}).slice(0,6);
}
export function createNewsProvider({fetchImpl=globalThis.fetch,now=()=>Date.now(),cache=new Map()}={}){
 // shortcut: this completed-data cache is isolate-local; use shared storage if cold-start fallback is needed.
 const inflight=new Map();
 async function request(url){
  const response=await fetchImpl(url,{headers:{Accept:'application/json, application/rss+xml, application/xml'},signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Object.assign(newsError(),{upstreamStatus:response.status});return response;
 }
 async function google(stock){
  const domestic=stock.market==='KR',query=domestic?`"${stock.name}" when:30d`:`${stock.symbol} stock when:30d`;
  const url=new URL('https://news.google.com/rss/search');url.search=new URLSearchParams({q:query,hl:domestic?'ko':'en-US',gl:domestic?'KR':'US',ceid:domestic?'KR:ko':'US:en'}).toString();
  const body=await(await request(url.href)).text();if(body.length>1000000||/<!DOCTYPE|<!ENTITY/i.test(body))throw newsError();
  const channel=parser.parse(body).rss?.channel;if(!channel)throw newsError();
  const entries=channel.item?Array.isArray(channel.item)?channel.item:[channel.item]:[];
  const items=entries.map(item=>{
   const publisher=text(typeof item.source==='object'?item.source?.['#text']:item.source)||'언론사';
   let title=text(item.title);const suffix=` - ${publisher}`;if(title.endsWith(suffix))title=title.slice(0,-suffix.length);
   return {id:String(item.guid?.['#text']??item.guid??item.link),title,publisher,url:safeUrl(item.link),publishedAt:new Date(item.pubDate).toJSON()};
  });
  return {items:normalize(items),source:'Google News'};
 }
 async function yahoo(stock){
  const url=new URL('https://query1.finance.yahoo.com/v1/finance/search');url.search=new URLSearchParams({q:stock.symbol,quotesCount:'0',newsCount:'12'}).toString();
  const data=await(await request(url.href)).json();
  if(!Array.isArray(data.news))throw newsError();
  return {items:normalize(data.news.filter(item=>!item.relatedTickers?.length||item.relatedTickers.includes(stock.symbol)).map(item=>({id:String(item.uuid??item.link),title:text(item.title),publisher:text(item.publisher)||'Yahoo Finance',url:safeUrl(item.link),publishedAt:new Date(Number(item.providerPublishTime)*1000).toJSON()}))),source:'Yahoo Finance'};
 }
 return {
  async forSymbol(symbol,provider){
   if(!/^[A-Z0-9.-]{1,18}$/.test(symbol))return null;
   const saved=cache.get(symbol);if(saved&&now()-saved.at<300000)return saved.value;
   if(inflight.has(symbol))return inflight.get(symbol);
   const task=(async()=>{
    const stock=seeded.get(symbol)??await provider.quote(symbol);if(!stock)return null;
    let result;
    try{
     if(stock.market==='KR')result=await google(stock);
     else{try{result=await yahoo(stock);}catch{}if(!result?.items.length)result=await google(stock);}
    }catch(error){
     console.warn('news_fetch_failed',{symbol,code:error.code??error.name,upstreamStatus:error.upstreamStatus??null});
     if(saved?.value.items.length&&now()-saved.at<86400000)return {...saved.value,warning:'뉴스 갱신이 지연되어 마지막으로 받은 기사를 표시합니다.'};
     throw newsError();
    }
    const value={symbol,...result,fetchedAt:new Date(now()).toISOString()};
    if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(symbol,{at:now(),value});return value;
   })();
   inflight.set(symbol,task);try{return await task;}finally{inflight.delete(symbol);}
  }
 };
}

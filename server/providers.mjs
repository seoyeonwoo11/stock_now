import { catalog, matches, ranges } from './catalog.mjs';
export const providerError=(message,code='PROVIDER_ERROR')=>Object.assign(new Error(message),{code});
const symbolForYahoo=symbol=>/^\d{6}$/.test(symbol)?`${symbol}.KS`:symbol;
export function createYahooProvider({ fetchImpl=globalThis.fetch, now=()=>Date.now(), cache=new Map(), stocks=new Map(catalog.map(s=>[s.symbol,s])) }={}) {
 const inflight=new Map();
 async function request(path,ttl=15000) {
  const saved=cache.get(path);
  if(saved && now()-saved.time<ttl)return saved.value;
  if(inflight.has(path))return inflight.get(path);
  const task=(async()=>{
   let response;
   try {response=await fetchImpl(`https://query1.finance.yahoo.com${path}`,{headers:{'User-Agent':'Mozilla/5.0 StockNow/0.2','Accept':'application/json'},signal:AbortSignal.timeout(12000)});}
   catch {throw providerError('시세 제공원에 연결할 수 없어요. 네트워크 설정을 확인해 주세요.','PROVIDER_UNREACHABLE');}
   if(response.status===404)throw providerError('종목을 찾을 수 없어요.','QUOTE_NOT_FOUND');
   if([401,403].includes(response.status))throw providerError('시세 제공원 접근이 거부되었어요. 네트워크 설정이나 제공원의 이용 제한을 확인해 주세요.','PROVIDER_ACCESS_DENIED');
   if(response.status===429)throw providerError('시세 요청이 일시적으로 제한되었어요. 잠시 후 다시 시도해 주세요.','PROVIDER_RATE_LIMIT');
   if(!response.ok)throw providerError('시세 제공원이 응답하지 않았어요.');
   let value; try {value=await response.json();}catch {throw providerError('시세 응답 형식이 올바르지 않아요.');}
   if(cache.size>=200)cache.delete(cache.keys().next().value);
   cache.set(path,{time:now(),value}); return value;
  })();
  inflight.set(path,task); try{return await task;}finally{inflight.delete(path);}
 }
 async function chart(symbol,range='1D') {
  const [period,interval]=ranges[range];
  const data=await request(`/v8/finance/chart/${encodeURIComponent(symbolForYahoo(symbol))}?range=${period}&interval=${interval}`,range==='1D'?15000:60000);
  const result=data.chart?.result?.[0];
  if(!result||data.chart.error)throw providerError('이 종목의 시세가 없어요.','QUOTE_NOT_FOUND');
  return result;
 }
 async function quote(symbol) {
  let data;try{data=await chart(symbol);}catch(error){if(error.code==='QUOTE_NOT_FOUND')return null;throw error;}
  const meta=data.meta, price=meta?.regularMarketPrice, previousClose=meta?.chartPreviousClose??meta?.previousClose;
  if(!Number.isFinite(price)||!Number.isFinite(previousClose)||previousClose<=0||!Number.isFinite(meta?.regularMarketTime))throw providerError('시세 응답에 유효한 가격 또는 기준 시각이 없어요.');
  let stock=stocks.get(symbol);
  if(!stock){
   if(!['EQUITY','ETF'].includes(meta.instrumentType)||!['KRW','USD'].includes(meta.currency))return null;
   stock={symbol,name:meta.shortName||meta.longName||symbol,englishName:meta.longName||meta.shortName||symbol,type:meta.instrumentType==='ETF'?'etf':'stock',market:meta.currency==='KRW'?'KR':'US',exchange:meta.fullExchangeName||meta.exchangeName||'',currency:meta.currency,color:'#6481a4',initials:symbol.slice(0,2),sector:'기타',description:'Yahoo Finance에서 제공하는 종목이에요.'};
   if(stocks.size<2000)stocks.set(symbol,stock);
  }
  const observations=data.indicators?.quote?.[0];
  const finite=(values=[])=>values.filter(Number.isFinite);
  const high=finite(observations?.high),low=finite(observations?.low);
  const change=price-previousClose;
  return {...stock,currency:meta.currency||stock.currency,price,previousClose,change,changePercent:change/previousClose*100,open:finite(observations?.open)[0]??null,high:meta.regularMarketDayHigh??(high.length?Math.max(...high):null),low:meta.regularMarketDayLow??(low.length?Math.min(...low):null),volume:meta.regularMarketVolume??null,asOf:new Date(meta.regularMarketTime*1000).toISOString(),source:'yahoo',isDemo:false,delayMinutes:Number.isFinite(meta.exchangeDataDelayedBy)?meta.exchangeDataDelayedBy:null};
 }
 return {
  status:{mode:'yahoo',label:'Yahoo Finance',disclaimer:'거래소별 시세 지연이나 장 마감 가격이 포함될 수 있습니다.'},
  quote,
  async search({q='',type='all',market='all'}={}) {
   if(q.trim()&&![...stocks.values()].some(s=>matches(s,q))) {
    const data=await request(`/v1/finance/search?q=${encodeURIComponent(q.trim())}&quotesCount=20&newsCount=0`,60000);
    for(const item of data.quotes??[]){
     if(!['EQUITY','ETF'].includes(item.quoteType)||!/^[A-Z0-9.-]{1,18}$/.test(item.symbol))continue;
     const domestic=/\.(KS|KQ)$/.test(item.symbol);
     if(!domestic&&!['NMS','NGM','NCM','NYQ','PCX','ASE','BTS'].includes(item.exchange))continue;
     const symbol=item.symbol.endsWith('.KS')?item.symbol.slice(0,-3):item.symbol;
     if(!stocks.has(symbol)&&stocks.size<2000)stocks.set(symbol,{symbol,name:item.shortname||item.longname||symbol,englishName:item.longname||item.shortname||symbol,type:item.quoteType==='ETF'?'etf':'stock',market:domestic?'KR':'US',exchange:item.exchDisp||item.exchange,currency:domestic?'KRW':'USD',color:'#6481a4',initials:symbol.slice(0,2),sector:item.sector||'기타',description:'Yahoo Finance에서 제공하는 종목이에요.'});
    }
   }
   const list=[...stocks.values()].filter(s=>matches(s,q)&&(type==='all'||s.type===type)&&(market==='all'||s.market===market)).slice(0,20);
   const results=[];
   for(let i=0;i<list.length;i+=4)results.push(...await Promise.allSettled(list.slice(i,i+4).map(s=>quote(s.symbol))));
   const items=results.filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value);
   const errors=results.filter(r=>r.status==='rejected');
   if(errors.length&&!items.length)throw errors[0].reason;
   return {items,warning:errors.length?'일부 종목의 시세를 가져오지 못했어요.':null};
  },
  async history(symbol,range) {
   if(!stocks.has(symbol)&&!await quote(symbol))return null;
   const data=await chart(symbol,range), closes=data.indicators?.quote?.[0]?.close??[];
   const points=(data.timestamp??[]).map((t,i)=>({time:new Date(t*1000).toISOString(),price:closes[i]})).filter(p=>Number.isFinite(p.price));
   if(!points.length)throw providerError('이 기간의 차트 데이터가 없어요.','HISTORY_UNAVAILABLE');
   return {symbol,range,points,isDemo:false};
  }
 };
}
const demoPrices=[72800,194500,203000,248500,42700,35640,18250,16920,114200,228.4,138.72,248.5,426.3,532.18,512.36,28.32];
const rounded=(value,currency)=>currency==='KRW'?Math.round(value/5)*5:Math.round(value*100)/100;
export function createDemoProvider({now=()=>Date.now()}={}) {
 function quote(symbol) {
  const i=catalog.findIndex(s=>s.symbol===symbol);if(i<0)return null;
  const stock=catalog[i],base=demoPrices[i],direction=i%3===2?-1:1;
  const price=rounded(base*(1+Math.sin(now()/65000+i)*.0008),stock.currency);
  const previousClose=rounded(base*(1-direction*.015),stock.currency),change=price-previousClose;
  return {...stock,price,previousClose,change,changePercent:change/previousClose*100,open:rounded(base*.993,stock.currency),high:rounded(base*1.013,stock.currency),low:rounded(base*.985,stock.currency),volume:1843200+i*11347,asOf:new Date(now()).toISOString(),source:'demo',isDemo:true,delayMinutes:null};
 }
 return {
  status:{mode:'demo',label:'데모 데이터',disclaimer:'모든 가격과 차트는 시연용 가상 데이터입니다.'},
  async quote(symbol){return quote(symbol);},
  async search({q='',type='all',market='all'}={}){return {items:catalog.filter(s=>matches(s,q)&&(type==='all'||s.type===type)&&(market==='all'||s.market===market)).map(s=>quote(s.symbol)),warning:null};},
  async history(symbol,range){
   const current=quote(symbol);if(!current)return null;
   const duration=ranges[range][2],direction=current.change>=0?1:-1,timestamp=now();
   const points=Array.from({length:80},(_,i)=>{const fraction=i/79;return {time:new Date(timestamp-duration*(1-fraction)).toISOString(),price:rounded(current.price*(1-direction*(1-fraction)*(range==='1D'?.016:.09)+(Math.sin(i*1.7)*.002+Math.sin(i*.42)*.003)*(1-fraction)),current.currency)};});
   return {symbol,range,points,isDemo:true};
  }
 };
}

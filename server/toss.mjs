import {catalog,matches} from './catalog.mjs';
import {providerError} from './providers.mjs';
import {createTossAuth} from './toss-auth.mjs';

const number=value=>typeof value==='number'?Number.isFinite(value)?value:null:typeof value==='string'&&/^-?\d+(\.\d+)?$/.test(value)&&Number.isFinite(Number(value))?Number(value):null;
const positive=value=>{const n=number(value);return n!==null&&n>0?n:null;};
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const dateFormat={KR:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}),US:new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'})};
const day=(value,market,session=false)=>dateFormat[market].format(new Date(Date.parse(value)+(market==='US'&&session?4*3600000:0)));
const markets={KR:['KOSPI','KOSDAQ'],US:['NASDAQ','NYSE','AMEX']};
const isStock=item=>['STOCK','FOREIGN_STOCK','DEPOSITARY_RECEIPT','INFRASTRUCTURE_FUND','REIT','ETF','FOREIGN_ETF'].includes(item.securityType)&&/^[A-Z0-9.-]{1,18}$/.test(item.symbol)&&(!item.status||item.status==='ACTIVE');

export function createTossProvider({clientId,clientSecret,fetchImpl=globalThis.fetch,now=()=>Date.now(),cache=new Map(),stocks=new Map(catalog.map(s=>[s.symbol,s])),authState={},db}={}){
 const token=createTossAuth({clientId,clientSecret,fetchImpl,now,state:authState,db}),inflight=new Map();
 async function request(path,ttl=15000){
  const saved=cache.get(path);if(saved&&now()-saved.time<ttl)return saved.value;
  if(inflight.has(path))return inflight.get(path);
  const task=(async()=>{
   let access=await token();
   for(let attempt=0;attempt<3;attempt++){
    let response;
    try{response=await fetchImpl('https://openapi.tossinvest.com'+path,{headers:{Authorization:`Bearer ${access}`,Accept:'application/json'},signal:AbortSignal.timeout(12000)});}
    catch{throw providerError('토스증권 시세 서버에 연결할 수 없어요.','PROVIDER_UNREACHABLE');}
    if(response.status===401&&attempt===0){access=await token(access);continue;}
    if(response.status===429&&attempt<2){const delay=Number(response.headers.get('Retry-After')??1);await new Promise(resolve=>setTimeout(resolve,Math.min(2000,Math.max(250,Number.isFinite(delay)?delay*1000:1000))));continue;}
    if(response.status===404)return null;
    if([401,403].includes(response.status))throw providerError('토스증권 API 권한 또는 허용 IP 설정을 확인해 주세요.','PROVIDER_ACCESS_DENIED');
    if(response.status===429)throw providerError('토스증권 시세 요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요.','PROVIDER_RATE_LIMIT');
    if(!response.ok)throw providerError('토스증권 시세 서버가 응답하지 않았어요.');
    let data;try{data=await response.json();}catch{throw providerError('토스증권 응답 형식이 올바르지 않아요.');}
    if(data.error||!Object.hasOwn(data,'result'))throw providerError('토스증권 응답 형식이 올바르지 않아요.');
    if(cache.size>=600)cache.delete(cache.keys().next().value);
    cache.set(path,{time:now(),value:data.result});return data.result;
   }
   throw providerError('토스증권 시세 요청을 완료하지 못했어요.');
  })();
  inflight.set(path,task);try{return await task;}finally{inflight.delete(path);}
 }
 function remember(item,market){
  if(!isStock(item))return null;
  const old=stocks.get(item.symbol),domestic=market==='KR'||['KOSPI','KOSDAQ','KR_ETC'].includes(item.market);
  const value={...old,symbol:item.symbol,name:item.name,englishName:item.englishName||old?.englishName||item.symbol,type:item.securityType.includes('ETF')?'etf':'stock',market:domestic?'KR':'US',exchange:item.market||old?.exchange||'',currency:item.currency||(domestic?'KRW':'USD'),color:old?.color||'#6481a4',initials:old?.initials||item.symbol.slice(0,2),sector:old?.sector||'기타',description:'토스증권 Open API 제공 종목',detailed:Boolean(item.currency)};
  stocks.set(item.symbol,value);return value;
 }
 async function infos(symbols){
  const missing=symbols.filter(s=>!stocks.get(s)?.detailed);
  if(missing.length){const result=await request('/api/v1/stocks?'+new URLSearchParams({symbols:missing.join(',')}),86400000);for(const item of result??[])remember(item);}
 }
 async function calendar(market,date){
  const key=`calendar:${market}:${date}`,saved=cache.get(key);if(saved&&now()-saved.time<86400000)return saved.value;
  const result=await request(`/api/v1/market-calendar/${market}?`+new URLSearchParams({date}),86400000);
  for(const value of Object.values(result??{}))if(value?.date)cache.set(`calendar:${market}:${value.date}`,{time:now(),value});
  return cache.get(key)?.value??null;
 }
 async function sessions(points,market){
  const dates=[...new Set(points.map(p=>day(p.time,market,true)))].reverse(),days=new Map();
  for(const date of dates){try{days.set(date,await calendar(market,date));}catch{days.set(date,null);}}
  return points.map(point=>{
   const info=days.get(day(point.time,market,true));
   const period=market==='KR'?info?.integrated?.regularMarket:info?.regularMarket;
   const t=Date.parse(point.time),start=Date.parse(period?.startTime),end=Date.parse(period?.endTime);
   return {...point,session:!info?'unknown':Number.isFinite(start)&&Number.isFinite(end)&&t>=start&&(t<end||market==='KR'&&t===end)?'regular':'extended'};
  });
 }
 async function candles(symbol,interval,count=200,before){
  const params=new URLSearchParams({symbol,interval,count:String(count),adjusted:'false'});if(before)params.set('before',before);
  return request('/api/v1/candles?'+params,interval==='1m'?15000:60000);
 }
 async function quotes(symbols){
  await infos(symbols);
  const prices=await request('/api/v1/prices?'+new URLSearchParams({symbols:symbols.join(',')}));
  if(!Array.isArray(prices))return [];
  const output=[];
  for(let offset=0;offset<prices.length;offset+=4){
   const batch=await Promise.all(prices.slice(offset,offset+4).map(async item=>{
    const stock=stocks.get(item.symbol),price=positive(item.lastPrice);if(!stock?.detailed||price===null||!['KRW','USD'].includes(item.currency))return null;
    let daily;try{daily=await candles(item.symbol,'1d',3);}catch{daily=null;}
    const asOf=iso(item.timestamp),currentDay=asOf?day(asOf,stock.market,true):null;
    const bars=(daily?.candles??[]).filter(c=>iso(c.timestamp)).sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp));
    const current=bars.find(c=>day(c.timestamp,stock.market)===currentDay);
    const previous=bars.find(c=>currentDay&&day(c.timestamp,stock.market)<currentDay);
    const previousClose=positive(previous?.closePrice),change=previousClose===null?null:price-previousClose;
    const [session]=asOf?await sessions([{time:asOf,price}],stock.market):[];
    const {detailed,...display}=stock;
    return {...display,price,previousClose,change,changePercent:change===null?null:change/previousClose*100,open:positive(current?.openPrice),high:positive(current?.highPrice),low:positive(current?.lowPrice),volume:number(current?.volume),asOf,session:session?.session??'unknown',source:'toss',isDemo:false,delayMinutes:null};
   }));
   output.push(...batch.filter(Boolean));
  }
  return output;
 }
 return {
  status:{mode:'toss',label:'토스증권 Open API',disclaimer:'토스증권 현재가와 차트를 조회합니다. 국내 통합 시세와 정규장 외 거래가 포함될 수 있습니다.'},
  async quote(symbol){return (await quotes([symbol]))[0]??null;},
  async search({q='',type='all',market='all'}={}){
   const query=q.trim();
   const direct=/^[A-Za-z][A-Za-z0-9.-]{0,17}$|^\d{6}$/.test(query);
   if(query&&direct)await infos([query.toUpperCase()]);
   if(query&&(!direct||!stocks.get(query.toUpperCase())?.detailed)){
    for(const region of market==='all'?['KR','US']:[market])for(const exchange of markets[region]){
     const result=await request('/api/v1/stocks/all?'+new URLSearchParams({market:exchange}),86400000);
     for(const item of result??[])remember({...item,market:exchange},region);
    }
   }
   const list=[...stocks.values()].filter(s=>matches(s,query)&&(type==='all'||s.type===type)&&(market==='all'||s.market===market)).slice(0,20);
   const items=list.length?await quotes(list.map(s=>s.symbol)):[];
   return {items,warning:items.length<list.length?'일부 종목의 시세를 가져오지 못했어요.':!items.length&&/[a-z]/i.test(query)?'전체 영문명 검색은 제공원에서 지원하지 않아요. 한글 종목명이나 종목 코드를 입력해 주세요.':null};
  },
  async history(symbol,range){
   await infos([symbol]);const stock=stocks.get(symbol);if(!stock?.detailed)return null;
   const intraday=range==='1D'||range==='1W',interval=intraday?'1m':'1d',limit=intraday?40:2;
   const found=new Map();let before,lastCursor,latest,cutoff;
   for(let page=0;page<limit;page++){
    const result=await candles(symbol,interval,200,before);const bars=result?.candles??[];
    if(!bars.length)break;
    for(const item of bars){const time=iso(item.timestamp),price=positive(item.closePrice);if(time&&price!==null)found.set(time,{time,price});}
    const ordered=[...found.values()].sort((a,b)=>Date.parse(b.time)-Date.parse(a.time));
    if(!ordered.length)break;
    latest??=ordered[0].time;cutoff??=Date.parse(latest)-({'1W':7,'1M':30,'3M':90,'1Y':365}[range]??1)*86400000;
    const oldest=ordered.at(-1).time;
    if(range==='1D'?day(oldest,stock.market,true)!==day(latest,stock.market,true):Date.parse(oldest)<cutoff)break;
    before=result.nextBefore;if(!before||before===lastCursor)break;lastCursor=before;
   }
   let points=[...found.values()].sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)).filter(p=>range==='1D'?day(p.time,stock.market,true)===day(latest,stock.market,true):Date.parse(p.time)>=cutoff);
   if(!points.length)throw providerError('이 기간의 토스증권 차트 데이터가 없어요.','HISTORY_UNAVAILABLE');
   if(intraday){
    points=await sessions(points,stock.market);
    const step=range==='1D'?5:30,buckets=new Map();
    for(const point of points)buckets.set(`${Math.floor(Date.parse(point.time)/(step*60000))}:${point.session}`,point);
    const first=points[0];points=[...buckets.values()];if(points[0].time!==first.time)points.unshift(first);
   }
   return {symbol,range,points,source:'toss',isDemo:false};
  }
 };
}

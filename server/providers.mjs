import {catalog,matches,ranges} from './catalog.mjs';
export const providerError=(message,code='PROVIDER_ERROR')=>Object.assign(new Error(message),{code});
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

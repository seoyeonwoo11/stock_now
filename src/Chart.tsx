import { useId,useState } from 'react';
import type { Point,Range } from './types';
export const price=(value:number|null,currency='KRW')=>value===null?'—':new Intl.NumberFormat('ko-KR',{minimumFractionDigits:currency==='KRW'?0:2,maximumFractionDigits:currency==='KRW'?0:2}).format(value);
export default function Chart({points,positive,currency,range}:{points:Point[];positive:boolean;currency:string;range:Range}) {
 const id=useId().replace(/:/g,'');const [hover,setHover]=useState<number|null>(null);
 if(!points.length)return <div className="chart-empty">차트 데이터가 없어요.</div>;
 const width=820,height=275,left=8,right=75,top=18,bottom=31;
 const min=Math.min(...points.map(p=>p.price)),max=Math.max(...points.map(p=>p.price)),padding=Math.max((max-min)*.22,max*.001),lower=min-padding,upper=max+padding;
 const x=(i:number)=>left+(width-left-right)*i/Math.max(1,points.length-1),y=(p:number)=>top+(height-top-bottom)*(upper-p)/(upper-lower);
 const line=points.map((p,i)=>`${i?'L':'M'}${x(i)},${y(p.price)}`).join(' '),area=`${line} L${x(points.length-1)},${height-bottom} L${left},${height-bottom} Z`,color=positive?'#eb625e':'#4786d5';
 const active=hover===null?null:points[Math.min(hover,points.length-1)];
 const time=(value:string)=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hourCycle:'h23',...(range==='1D'?{hour:'2-digit',minute:'2-digit'}:{month:'numeric',day:'numeric'})});
 return <div className="chart-wrap">{active&&<div className="chart-tooltip" style={{left:`${Math.min(80,Math.max(12,x(hover!)/width*100))}%`}}><strong>{price(active.price,currency)}{currency==='KRW'?'원':' USD'}</strong><span>{time(active.time)} KST</span></div>}
 <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${range} 가격 차트, 최저 ${price(min,currency)}, 최고 ${price(max,currency)}`} onMouseMove={event=>{const rect=event.currentTarget.getBoundingClientRect();setHover(Math.max(0,Math.min(points.length-1,Math.round(((event.clientX-rect.left)/rect.width*width-left)/(width-left-right)*(points.length-1)))));}} onMouseLeave={()=>setHover(null)}>
 <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".17"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
 {[0,1,2,3,4].map(i=>{const py=top+i*(height-top-bottom)/4;return <g key={i}><line x1={left} x2={width-right+5} y1={py} y2={py} stroke="#edf0f4" strokeDasharray="4 5"/><text x={width-right+16} y={py+4} fill="#9ba5b3" fontSize="11">{price(upper-i*(upper-lower)/4,currency)}</text></g>;})}
 <path d={area} fill={`url(#${id})`}/><path d={line} fill="none" stroke={color} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round"/>
 {active&&<g><line x1={x(hover!)} x2={x(hover!)} y1={top} y2={height-bottom} stroke="#a9b4c2" strokeDasharray="4 4"/><circle cx={x(hover!)} cy={y(active.price)} r="5" fill={color} stroke="white" strokeWidth="3"/></g>}
 {[0,Math.floor((points.length-1)/3),Math.floor((points.length-1)*2/3),points.length-1].map((i,j)=><text key={j} x={x(i)} y={height-5} textAnchor={j===0?'start':j===3?'end':'middle'} fill="#9ba5b3" fontSize="11">{time(points[i].time)}</text>)}
 </svg></div>;
}

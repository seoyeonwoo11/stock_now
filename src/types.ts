export interface Quote { symbol:string; name:string; englishName:string; type:'stock'|'etf'; market:'KR'|'US'; exchange:string; currency:string; color:string; initials:string; sector:string; description:string; price:number; previousClose:number; change:number; changePercent:number; open:number|null; high:number|null; low:number|null; volume:number|null; asOf:string; source:'yahoo'|'demo'; isDemo:boolean; delayMinutes:number|null }
export interface Point {time:string;price:number;session?:'regular'|'extended'|'unknown'}
export type Range='1D'|'1W'|'1M'|'3M'|'1Y';
export interface Status {mode:'yahoo'|'demo';label:string;disclaimer:string;pollInterval:number}

export interface NewsArticle {id:string;title:string;publisher:string;url:string;publishedAt:string}
export interface NewsFeed {symbol:string;items:NewsArticle[];source:string;fetchedAt:string;warning?:string}

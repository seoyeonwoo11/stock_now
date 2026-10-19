// Display metadata; prices are always obtained from the selected provider.
export const catalog = [
 ['005930','삼성전자','Samsung Electronics','stock','KR','KOSPI','KRW','#416bcb','삼성','반도체','반도체, 스마트폰, 가전 등 다양한 전자제품을 만드는 글로벌 기술 기업이에요.'],
 ['000660','SK하이닉스','SK hynix','stock','KR','KOSPI','KRW','#dc7959','SK','반도체','DRAM과 NAND 플래시 등 메모리 반도체를 개발하고 생산해요.'],
 ['035420','NAVER','NAVER','stock','KR','KOSPI','KRW','#22a36b','N','인터넷','검색, 커머스, 콘텐츠와 클라우드 서비스를 제공하는 인터넷 기업이에요.'],
 ['005380','현대차','Hyundai Motor','stock','KR','KOSPI','KRW','#4c739a','현대','자동차','자동차를 생산하고 전기차와 미래 모빌리티 기술을 개발해요.'],
 ['035720','카카오','Kakao','stock','KR','KOSPI','KRW','#b89b21','K','인터넷','메신저를 중심으로 콘텐츠, 커머스, 모빌리티 서비스를 제공해요.'],
 ['069500','KODEX 200','KODEX 200','etf','KR','KOSPI','KRW','#387eae','K','국내 대표지수','국내 대표 기업 200개로 구성된 KOSPI 200 지수를 추종하는 ETF예요.'],
 ['360750','TIGER 미국S&P500','TIGER US S&P 500','etf','KR','KOSPI','KRW','#de913d','T','미국 대표지수','미국 S&P 500 지수를 추종하는 국내 상장 ETF예요.'],
 ['379800','KODEX 미국S&P500','KODEX US S&P 500','etf','KR','KOSPI','KRW','#387eae','K','미국 대표지수','미국 대형주 S&P 500 지수를 추종하는 국내 상장 ETF예요.'],
 ['133690','TIGER 미국나스닥100','TIGER NASDAQ 100','etf','KR','KOSPI','KRW','#de913d','T','미국 기술주','미국 나스닥 100 지수를 추종하는 국내 상장 ETF예요.'],
 ['AAPL','애플','Apple','stock','US','NASDAQ','USD','#7d8794','A','기술','아이폰, 맥, 아이패드와 소프트웨어 및 디지털 서비스를 제공해요.'],
 ['NVDA','엔비디아','NVIDIA','stock','US','NASDAQ','USD','#77a43f','N','반도체','GPU와 인공지능 컴퓨팅 플랫폼을 개발하는 기술 기업이에요.'],
 ['TSLA','테슬라','Tesla','stock','US','NASDAQ','USD','#d65d65','T','자동차','전기차와 에너지 저장 및 태양광 제품을 개발하는 기업이에요.'],
 ['MSFT','마이크로소프트','Microsoft','stock','US','NASDAQ','USD','#4c8abb','M','기술','소프트웨어, 클라우드, 인공지능 및 업무 생산성 서비스를 제공해요.'],
 ['VOO','뱅가드 S&P 500','Vanguard S&P 500 ETF','etf','US','NYSE ARCA','USD','#b45c6c','V','미국 대표지수','미국 S&P 500 지수를 추종하는 뱅가드의 ETF예요.'],
 ['QQQ','인베스코 QQQ','Invesco QQQ Trust','etf','US','NASDAQ','USD','#4c8abb','Q','미국 기술주','미국 나스닥 100 지수를 추종하는 ETF예요.'],
 ['SCHD','슈왑 미국 배당주','Schwab US Dividend Equity ETF','etf','US','NYSE ARCA','USD','#4c739a','S','배당주','배당의 지속성과 재무 건전성을 고려해 미국 기업에 투자하는 ETF예요.'],
].map(([symbol,name,englishName,type,market,exchange,currency,color,initials,sector,description])=>({symbol,name,englishName,type,market,exchange,currency,color,initials,sector,description}));
export const normalize = value => value.trim().toLowerCase().replace(/\s+/g,'');
export const matches = (stock,q) => [stock.name,stock.englishName,stock.symbol].some(value=>normalize(value).includes(normalize(q)));
export const ranges = { '1D':['1d','5m',6.5*3600000], '1W':['5d','30m',7*86400000], '1M':['1mo','1d',30*86400000], '3M':['3mo','1d',90*86400000], '1Y':['1y','1wk',365*86400000] };

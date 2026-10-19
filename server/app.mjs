import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createYahooProvider,createDemoProvider } from './providers.mjs';
import { ranges } from './catalog.mjs';
import {createNewsProvider} from './news.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function createApp({mode='yahoo',provider,pollInterval=15000,serveStatic=true}={}) {
 if(!['yahoo','demo'].includes(mode))throw new Error('MARKET_DATA_MODE must be yahoo or demo');
 provider??=mode==='demo'?createDemoProvider():createYahooProvider();
 const app=express(),news=createNewsProvider();app.disable('x-powered-by');
 app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');if(req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');next();});
 function api(provider,interval){
  const router=express.Router();
  router.get('/status',(req,res)=>res.json({...provider.status,pollInterval:interval}));
  router.get('/search',async(req,res)=>{
   const {q='',type='all',market='all'}=req.query;
   if(typeof q!=='string'||q.length>100||!['all','stock','etf'].includes(type)||!['all','KR','US'].includes(market))return res.status(400).json({error:'검색 조건이 올바르지 않아요.'});
   res.json({...await provider.search({q,type,market}),source:provider.status.mode});
  });
  router.use('/quotes/:symbol',(req,res,next)=>{if(!/^[A-Z0-9.-]{1,18}$/.test(req.params.symbol))return res.status(400).json({error:'종목 코드가 올바르지 않아요.'});next();});
  router.get('/quotes/:symbol',async(req,res)=>{const data=await provider.quote(req.params.symbol);if(!data)return res.status(404).json({error:'종목을 찾을 수 없어요.'});res.json(data);});
  router.get('/quotes/:symbol/news',async(req,res)=>{const data=await news.forSymbol(req.params.symbol,provider);res.status(data?200:404).json(data??{error:'종목을 찾을 수 없어요.'});});
  router.get('/quotes/:symbol/history',async(req,res)=>{const {range='1D'}=req.query;if(typeof range!=='string'||!Object.hasOwn(ranges,range))return res.status(400).json({error:'차트 기간이 올바르지 않아요.'});const data=await provider.history(req.params.symbol,range);if(!data)return res.status(404).json({error:'종목을 찾을 수 없어요.'});res.json(data);});
  router.get('/quotes/:symbol/stream',async(req,res)=>{
   const initial=await provider.quote(req.params.symbol);if(!initial)return res.status(404).json({error:'종목을 찾을 수 없어요.'});
   res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache','X-Accel-Buffering':'no'});res.flushHeaders();res.write('retry: 10000\n\n');
   const write=(event,data)=>res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
   write('quote',initial);let pending=false;
   const timer=setInterval(async()=>{if(pending||res.destroyed)return;pending=true;try{const data=await provider.quote(req.params.symbol);if(!res.destroyed){if(data)write('quote',data);else write('quote-error',{error:'시세가 없어요.'});}}catch{if(!res.destroyed)write('quote-error',{error:'시세 갱신을 재시도하고 있어요.'});}finally{pending=false;}},Math.max(250,interval));
   res.on('close',()=>clearInterval(timer));
  });
  return router;
 }
 app.use('/api/demo',api(createDemoProvider(),5000));app.use('/api',api(provider,pollInterval));
 app.use('/api',(req,res)=>res.status(404).json({error:'API 경로를 찾을 수 없어요.'}));
 app.get('/healthz',(req,res)=>res.json({status:'ok'}));
 if(serveStatic&&fs.existsSync(path.join(root,'dist/index.html'))){app.use(express.static(path.join(root,'dist')));app.get('/{*path}',(req,res)=>res.sendFile(path.join(root,'dist/index.html')));}
 app.use((error,req,res,next)=>{if(res.headersSent)return next(error);const known=['PROVIDER_ERROR','PROVIDER_UNREACHABLE','PROVIDER_ACCESS_DENIED','PROVIDER_RATE_LIMIT','HISTORY_UNAVAILABLE','QUOTE_NOT_FOUND','NEWS_UNAVAILABLE'].includes(error.code);res.status(error.code==='QUOTE_NOT_FOUND'?404:known?503:502).json({error:known?error.message:'시세를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.',code:known?error.code:'PROVIDER_ERROR'});});
 return app;
}

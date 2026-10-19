import { EnvHttpProxyAgent,setGlobalDispatcher } from 'undici';
import { createApp } from './app.mjs';
if(process.env.HTTPS_PROXY||process.env.HTTP_PROXY||process.env.https_proxy)setGlobalDispatcher(new EnvHttpProxyAgent());
const port=Number(process.env.PORT||3001),pollInterval=Number(process.env.QUOTE_POLL_INTERVAL_MS||15000);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
if(!Number.isInteger(pollInterval)||pollInterval<1000||pollInterval>60000)throw new Error('QUOTE_POLL_INTERVAL_MS must be 1000–60000');
const server=createApp({mode:process.env.MARKET_DATA_MODE||'toss',pollInterval}).listen(port,'0.0.0.0',()=>console.log(`Stock Now listening on ${port} (${process.env.MARKET_DATA_MODE||'toss'})`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>{server.closeAllConnections();process.exit(0);},1500).unref();});

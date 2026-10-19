import fs from 'node:fs';
import {build} from 'esbuild';
const assets={};
for(const file of fs.readdirSync('dist',{recursive:true})){
 const filename=`dist/${file}`;if(!fs.statSync(filename).isFile())continue;
 const type=file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':null;
 if(type)assets[file==='index.html'?'/':`/${file.replaceAll('\\','/')}`]={type,body:fs.readFileSync(filename,'utf8')};
}
fs.writeFileSync('server/worker-assets.mjs',`export const assets=${JSON.stringify(assets)};`);
await build({entryPoints:['server/worker.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/server/index.js',minify:true});
fs.mkdirSync('dist/.openai',{recursive:true});
fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');

fs.cpSync('drizzle','dist/.openai/drizzle',{recursive:true});

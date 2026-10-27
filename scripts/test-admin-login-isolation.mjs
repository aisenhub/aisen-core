#!/usr/bin/env node
// Anonymous production-preview cold-login performance isolation (no Auth/DB writes).
import assert from 'node:assert/strict';
import { spawn,spawnSync } from 'node:child_process';
import { mkdtempSync,existsSync,readFileSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),win=process.platform==='win32';
const base='http://127.0.0.1:3425',profile=mkdtempSync(join(tmpdir(),'aisencore-login-perf-'));
let site=null,chrome=null,ws=null,seq=0,done=false;
const pending=new Map(),sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const results=[];
function send(method,params={},timeout=16000){
  const id=++seq;return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},timeout);
    pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const o=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(o.result?.exceptionDetails)throw Error(o.result.exceptionDetails.text);
  return o.result?.result?.value;
}
async function until(fn,limit=15000){
  const start=Date.now();
  while(Date.now()-start<limit){if(await fn())return;await sleep(100);}
  throw Error('browser readiness timed out');
}
const observer=`window.__perf={fcp:null,lcp:null,cls:0,longTasks:0};
try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(e.name==='first-contentful-paint')window.__perf.fcp=e.startTime;}).observe({type:'paint',buffered:true});}catch{}
try{new PerformanceObserver(list=>{for(const e of list.getEntries())window.__perf.lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});}catch{}
try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__perf.cls+=e.value;}).observe({type:'layout-shift',buffered:true});}catch{}
try{new PerformanceObserver(list=>{window.__perf.longTasks+=list.getEntries().length;}).observe({type:'longtask',buffered:true});}catch{}`;
let failed=null;
try{
  site=spawn(win?'cmd.exe':'pnpm',win?['/d','/s','/c','pnpm --filter @aisencore/admin preview --host 127.0.0.1 --port 3425 --strictPort']:
    ['--filter','@aisencore/admin','preview','--host','127.0.0.1','--port','3425','--strictPort'],
    {cwd:root,stdio:'ignore'});
  await until(async()=>{try{return (await fetch(base,{signal:AbortSignal.timeout(700)})).ok}catch{return false}},17000);
  const chromePath=win?'C:/Program Files/Google/Chrome/Application/chrome.exe':'google-chrome';
  chrome=spawn(chromePath,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port=0','--window-size=1440,900','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  const active=join(profile,'DevToolsActivePort');
  await until(async()=>existsSync(active),14000);
  const port=Number(readFileSync(active,'utf8').split(/\r?\n/)[0]);
  const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=pages.find(x=>x.type==='page');assert.ok(page?.webSocketDebuggerUrl);
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',fail,{once:true});});
  ws.addEventListener('message',event=>{
    const o=JSON.parse(event.data),d=pending.get(o.id);
    if(d){pending.delete(o.id);o.error?d.reject(Error(o.error.message)):d.resolve(o)}
  });
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:observer});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send('Network.setCacheDisabled',{cacheDisabled:true});
  for(const [label,cpu,network] of [
    ['baseline',1,false],['cpu4x_only',4,false],['network_only_150ms_1_6Mbps',1,true],
  ]){
    await send('Emulation.setCPUThrottlingRate',{rate:cpu});
    await send('Network.emulateNetworkConditions',network?
      {offline:false,latency:150,downloadThroughput:200000,uploadThroughput:90000}:
      {offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    for(let i=0;i<5;i++){
      await send('Network.clearBrowserCache');
      const trial='?trial='+label+'-'+(i+1);
      await send('Page.navigate',{url:base+'/'+trial+'#/login'});
      await until(async()=>await evaluate("location.search==="+JSON.stringify(trial)+" && document.readyState==='complete' && !!document.querySelector('h1')"),21000);
      await sleep(900);
      const record=await evaluate(`(()=>{const p=window.__perf||{},nav=performance.getEntriesByType('navigation')[0];const js=performance.getEntriesByType('resource').filter(x=>x.name.includes('/assets/')&&x.name.endsWith('.js'));return {fcp:Math.round(p.fcp||0),lcp:Math.round(p.lcp||0),cls:p.cls||0,longTasks:p.longTasks||0,ttfb:Math.round((nav?.responseStart||0)-(nav?.requestStart||0)),jsRequests:js.length,jsBytes:Math.round(js.reduce((v,r)=>v+(r.transferSize||0),0)),criticalAssets:js.map(r=>({asset:r.name.split('/').pop(),start:Math.round(r.startTime),end:Math.round(r.responseEnd),transfer:Math.round(r.transferSize||0),duration:Math.round(r.duration)})).sort((a,b)=>b.end-a.end).slice(0,7)}})()`);
      assert.ok(record.fcp>0&&record.lcp>0,label+' LCP/FCP missing');
      results.push({condition:label,index:i+1,...record});
    }
    const subset=results.filter(x=>x.condition===label);
    const median=a=>a.map(x=>x.lcp).sort((a,b)=>a-b)[2];
    console.log('LOGIN_PERF '+label+' n=5 medianLCP='+median(subset)+'ms');
  }
  done=true;
}catch(e){failed=e;console.error('LOGIN_PERF FAILED '+e.message)}
finally{
  try{ws?.close()}catch{}
  if(win){for(const child of [chrome,site])if(child?.pid)spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{encoding:'utf8',timeout:9000});}
  else{chrome?.kill();site?.kill();}
  await sleep(1200);
  try{rmSync(profile,{force:true,recursive:true,maxRetries:30,retryDelay:250})}catch{console.error('LOGIN_PROFILE_CLEANUP FAILED');done=false}
  const medians=Object.fromEntries(['baseline','cpu4x_only','network_only_150ms_1_6Mbps'].map(label=>{
    const v=results.filter(x=>x.condition===label).map(x=>x.lcp).sort((a,b)=>a-b);
    return [label,v.length===5?v[2]:null];
  }));
  const outputName=process.argv.includes('--entry-split')?'admin-login-entry-split-2026-10-26.json':process.argv.includes('--network-chain')?'admin-login-network-chain-2026-10-26.json':process.argv.includes('--after-shell')?'admin-login-after-shell-2026-10-26.json':'admin-login-cpu-network-2026-10-26.json';
  writeFileSync(join(root,'docs','Plans','aisencore-mvp','ui-evidence',outputName),
    JSON.stringify({context:'Local loopback production preview, anonymous headless Chrome cold HTTP cache, independent CPU-only and network-only emulation; n=5 each',pass:done,medians,results,
      caveat:'Not real-user P75/P95; CDP throttling uncalibrated; desktop hardware and background load may differ; comparison with prior audit different run, not an A/B outcome.'},null,2));
  if(!done||failed)process.exitCode=1;
}

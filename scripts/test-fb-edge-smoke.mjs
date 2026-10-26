#!/usr/bin/env node
// FB local Edge runtime smoke: never disables JWT verification, never
// supplies live R2 credentials, never accesses the remote Supabase project.
// 401/403 to an unauthenticated POST proves runtime is routing protected code.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const win=process.platform==='win32';
const status=spawnSync(win?'cmd.exe':'pnpm',
  win?['/d','/s','/c','pnpm dlx supabase status --output json']:
  ['dlx','supabase','status','--output','json'],{
    cwd:root,encoding:'utf8',timeout:45000,maxBuffer:1000000});
assert.equal(status.status,0,'Supabase local status');
const cfg=JSON.parse(status.stdout);
assert.equal(cfg.API_URL,'http://127.0.0.1:55321');
assert.match(cfg.DB_URL,/127\.0\.0\.1:55322/);
const guard=createServer();
let worker=null;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  await new Promise((resolve,reject)=>{
    guard.once('error',reject);guard.listen(3410,'127.0.0.1',resolve);
  });
  worker=spawn(win?'cmd.exe':'pnpm',
    win?['/d','/s','/c','pnpm dlx supabase functions serve feedback-submit feedback-image-access']:
      ['dlx','supabase','functions','serve','feedback-submit','feedback-image-access'],{
        cwd:root,stdio:['ignore','pipe','pipe']
      });
  let stderr='',stdout='';
  worker.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-12000)});
  worker.stdout.on('data',chunk=>{stdout=(stdout+String(chunk)).slice(-12000)});
  const expected=['feedback-submit','feedback-image-access'];
  const answered=new Map();
  const seen=new Map();
  const start=Date.now();
  while(Date.now()-start<100000 && answered.size<expected.length){
    if(worker.exitCode!==null)break;
    for(const name of expected){
      if(answered.has(name))continue;
      try{
        const response=await fetch(cfg.API_URL+'/functions/v1/'+name,{
          method:'POST',
          headers:{'content-type':'application/json',
            apikey:cfg.PUBLISHABLE_KEY||cfg.ANON_KEY},
          body:'{}',signal:AbortSignal.timeout(7000)
        });
        seen.set(name,response.status);
        if(response.status===401||response.status===403)answered.set(name,response.status);
      }catch{/* gateway may be loading Docker runtime */}
    }
    if(answered.size<expected.length)await sleep(900);
  }
  if(answered.size!==expected.length){
    const evidence=(stdout+'\n'+stderr).split('\n')
      .filter(line=>/error|failed|runtime|pull|docker|loading/i.test(line))
      .slice(-18).join(' | ').slice(0,2100);
    throw Error('Edge local HTTP runtime not ready: '+answered.size+'/'+expected.length+
      '; observed statuses='+JSON.stringify(Object.fromEntries(seen))+'; '+evidence);
  }
  for(const name of expected)console.log('FB_EDGE_LOCAL_HTTP protected '+name+
    ' anonymous POST HTTP '+answered.get(name));
  console.log('FB_EDGE_LOCAL_HTTP PASS both endpoints enforce auth; no real uploads made');
}finally{
  if(worker?.pid){
    if(win)spawnSync('taskkill',['/PID',String(worker.pid),'/T','/F'],
      {timeout:10000,encoding:'utf8'});
    else worker.kill('SIGTERM');
  }
  guard.close();
}
#!/usr/bin/env node
// Local-only reproducibility gate. Never touches the project's node_modules.
// A new temp workspace is created on the same volume as the pnpm store, and
// removed even when the install fails. No cloud/package downloads permitted.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync,existsSync,mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import {dirname,join,resolve,parse} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const win=process.platform==='win32';
const cli=spawnSync(win?'cmd.exe':'pnpm',
  win?['/d','/s','/c','pnpm store path']:['store','path'],
  {cwd:root,encoding:'utf8',timeout:30000});
assert.equal(cli.status,0,'pnpm local store path required');
const store=resolve(cli.stdout.trim());
assert.ok(existsSync(store),'the local content-addressable store must exist');
const parent=resolve(process.env.AISENCORE_FROZEN_QA_PARENT??dirname(dirname(store)));
assert.ok(existsSync(parent)&&parse(parent).root===parse(store).root,
  'QA parent must exist on the pnpm store volume');
assert.ok(!parent.startsWith(resolve(root)),'QA installation must live outside repository');
const files=['package.json','pnpm-workspace.yaml','pnpm-lock.yaml',
  'apps/admin/package.json','patches/query-string@7.1.3.patch'];
const fingerprints=new Map(files.map(f=>[f,createHash('sha256')
  .update(readFileSync(join(root,f))).digest('hex')]));
let dir=null,child=null,timeout=false,result=null;
const limit=Number(process.env.AISENCORE_FROZEN_QA_TIMEOUT_MS??720000);
assert.ok(Number.isSafeInteger(limit)&&limit>=30000&&limit<=1800000,'bounded QA timeout');
try{
  dir=mkdtempSync(join(parent,'aisencore-frozen-qa-'));
  assert.equal(existsSync(join(dir,'node_modules')),false);
  for(const f of files){
    mkdirSync(dirname(join(dir,f)),{recursive:true});
    cpSync(join(root,f),join(dir,f));
  }
  const cmd='pnpm install --offline --frozen-lockfile --ignore-scripts --config.package-import-method=hardlink --reporter append-only';
  child=spawn(win?'cmd.exe':'pnpm',
    win?['/d','/s','/c',cmd]:['install','--offline','--frozen-lockfile',
      '--ignore-scripts','--config.package-import-method=hardlink','--reporter','append-only'],
    {cwd:dir,stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])
    stream.on('data',x=>process.stdout.write(String(x).slice(-1200)));
  const deadline=setTimeout(()=>{
    timeout=true;
    if(win&&child?.pid)spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],
      {timeout:12000,encoding:'utf8'});
    else child?.kill('SIGTERM');
  },limit);
  try{result=await new Promise((done)=>{
    child.once('close',(code,signal)=>done({code,signal}));
    child.once('error',e=>done({error:e.message}));
  });}finally{clearTimeout(deadline)}
  const sameFiles=files.every(f=>fingerprints.get(f)===createHash('sha256')
    .update(readFileSync(join(dir,f))).digest('hex'));
  const installed=existsSync(join(dir,'node_modules','.pnpm','lock.yaml'))
    &&existsSync(join(dir,'apps','admin','node_modules'));
  const pass=result?.code===0&&!timeout&&sameFiles&&installed;
  console.log('FROZEN_CLEAN_INSTALL_RESULT',JSON.stringify({pass,result,timeout,
    sameFiles,installed,noNetwork:true,usedExistingModules:false}));
  if(!pass)process.exitCode=1;
}finally{
  if(child&&child.exitCode===null&&!child.killed){
    if(win&&child.pid)spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],
      {timeout:12000,encoding:'utf8'});
    else child.kill('SIGTERM');
  }
  if(dir){
    let clean=false;
    for(let i=0;i<4&&!clean;i++){
      try{rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:400});clean=true;}
      catch(e){console.warn('FROZEN_QA_CLEANUP_RETRY',i,e.code);
        await new Promise(ok=>setTimeout(ok,800))}
    }
    console.log('FROZEN_QA_TEMP_CLEANED',!existsSync(dir));
    if(existsSync(dir))process.exitCode=2;
  }
}

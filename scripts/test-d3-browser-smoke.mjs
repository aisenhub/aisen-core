#!/usr/bin/env node
// Frontend-only login-render smoke. It does NOT test real Supabase Auth/RPC.
// Default uses a fake PUBLIC key. Pass --local to test apps/admin/.env.local
// against the real local dev Auth services. Neither proves authorized E2E.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const windows=process.platform==='win32';
const chrome=windows
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : 'google-chrome';
const withLocalConfig=process.argv.includes('--local');
const port=withLocalConfig?3395:3394; // Isolated from the user's localhost:3000.
const base='http://127.0.0.1:'+port;
const profile=mkdtempSync(join(tmpdir(),'aisencore-d3-smoke-'));
const server=spawn(windows?'cmd.exe':'pnpm',
  windows?['/d','/s','/c','pnpm --filter @aisencore/admin dev --host 127.0.0.1 --port '+port]:
    ['--filter','@aisencore/admin','dev','--host','127.0.0.1','--port',String(port)],{
    cwd:new URL('..',import.meta.url).pathname.replace(/^\/([A-Z]:\/)/,'$1'),
    env:withLocalConfig?process.env:{...process.env,
      VITE_SUPABASE_URL:'http://127.0.0.1:55321',
      VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_static_smoke_only'},
    stdio:'ignore',
  });
async function listen() {
  for(let i=0;i<75;i++){
    try{
      const r=await fetch(base+'/',{signal:AbortSignal.timeout(1000)});
      if(r.ok)return;
    }catch{}
    if(server.exitCode!==null)throw Error('Vite server terminated during smoke startup');
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  throw Error('Local Vite server did not start');
}
try{
  await listen();
  const result=spawnSync(chrome,['--headless=new','--disable-gpu',
    '--no-first-run','--no-default-browser-check',
    '--user-data-dir='+profile,'--virtual-time-budget=6000','--dump-dom',
    base+'/#/login'],{encoding:'utf8',timeout:60000,maxBuffer:3_000_000});
  assert.equal(result.status,0,'headless Chrome must exit successfully: '+result.stderr.slice(-500));
  assert.ok(result.stdout.includes('AisenCore 管理平台'),'login heading must render');
  assert.ok(result.stdout.includes('动态口令')||result.stdout.includes('管理员身份登录'),'login view must render');
  console.log(withLocalConfig?'D3 actual local config Chrome login PASS; not authenticated E2E':'D3 Chrome login render PASS; no Auth/RPC/browser E2E claim');
}finally{
  if(windows){
    spawnSync('taskkill',['/PID',String(server.pid),'/T','/F'],
      {encoding:'utf8',timeout:10000});
  }else server.kill('SIGTERM');
  rmSync(profile,{recursive:true,force:true});
}

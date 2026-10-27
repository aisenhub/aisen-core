#!/usr/bin/env node
// Isolated local AAL2 read-only UI probe. Never logs credentials or private data.
// Its only DB/Auth writes create/delete one random QA admin; --revocation
// additionally deactivates ONLY that temporary QA admin before cleanup.
import assert from 'node:assert/strict';
import { spawn,spawnSync } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const win=process.platform==='win32';
const base='http://127.0.0.1:3422';
const profile=mkdtempSync(join(tmpdir(),'aisencore-perf-qa-'));
const qaEmail='perf-uiqa-'+randomUUID().slice(0,13)+'@aisencore.test';
const password='QA!'+randomBytes(18).toString('base64url');
const guard=createServer();
let uid=null,chrome=null,site=null,ws=null,seq=0,holdTable=null,holdChunk=null;
let requests={access:0,tags:0,products:0,feedback:0};
let lazyRoute=null;
let revocation=null;
const verifyRevocation=process.argv.includes('--revocation');
const verifySpaTags=process.argv.includes('--spa-tags');
let spaTags=null;
const verifyPendingAxe=process.argv.includes('--axe-pending');
const a11y=[];
const axeBundle=verifyPendingAxe?readFileSync(join(root,'apps','admin','node_modules','axe-core','axe.min.js'),'utf8'):null;
const pending=new Map(),held=new Set(),failures=[],results=[];
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
function sql(q){
  const x=spawnSync('docker',['exec','supabase_db_Aisencore','psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8',timeout:17000});
  if(x.status!==0)throw Error('local test DB command failed');
  return x.stdout.trim();
}
async function api(cfg,path,method='GET',body,token=null,service=false){
  const key=service?cfg.SERVICE_ROLE_KEY:cfg.PUBLISHABLE_KEY;
  const headers={apikey:key,...(token||service?{authorization:'Bearer '+(token||key)}:{})};
  if(body!==undefined)headers['content-type']='application/json';
  const response=await fetch(cfg.API_URL+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(16000)});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Error('local test Auth/API HTTP '+response.status+' at '+path.split('?')[0]);
  return data;
}
function totp(secret){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let buffer=0,bits=0,bytes=[];
  for(const c of secret.replace(/[\s=]/g,'').toUpperCase()){
    const x=alphabet.indexOf(c);if(x<0)throw Error('invalid generated TOTP secret');
    buffer=(buffer<<5)|x;bits+=5;
    if(bits>=8){bits-=8;bytes.push((buffer>>>bits)&255);}
  }
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const h=createHmac('sha1',Buffer.from(bytes)).update(counter).digest();
  return String((h.readUInt32BE(h.at(-1)&15)&0x7fffffff)%1000000).padStart(6,'0');
}
function send(method,params={},timeoutMs=16000){
  const id=++seq;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},timeoutMs);
    pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const v=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(v.result?.exceptionDetails)throw Error('Chrome evaluate failed: '+v.result.exceptionDetails.text);
  return v.result?.result?.value;
}
async function until(fn,timeout=11000){
  const start=Date.now();
  while(Date.now()-start<timeout){const value=await fn();if(value)return value;await sleep(85);}
  throw Error('browser waiting condition timeout');
}
async function release(){
  holdTable=null;holdChunk=null;
  const ids=[...held];held.clear();
  for(const requestId of ids)await send('Fetch.continueRequest',{requestId}).catch(e=>{failures.push('release '+e.message);});
}
function onMessage(event){
  const msg=JSON.parse(event.data);
  const wait=pending.get(msg.id);
  if(wait){pending.delete(msg.id);msg.error?wait.reject(Error(msg.error.message)):wait.resolve(msg);}
  if(msg.method==='Network.requestWillBeSent'){
    const url=msg.params?.request?.url??'';
    if(url.includes('/rest/v1/rpc/admin_check_access'))requests.access++;
    if(url.includes('/rest/v1/rpc/admin_feedback_tags'))requests.tags++;
    if(url.includes('/rest/v1/products?'))requests.products++;
    if(url.includes('/rest/v1/admin_feedback_summaries?'))requests.feedback++;
  }
  if(msg.method!=='Fetch.requestPaused')return;
  const req=msg.params;
  const url=req.request?.url??'';
  const target=req.request?.method==='GET' &&
    ((holdTable && url.includes('/rest/v1/'+holdTable) && (url.includes('?')||url.endsWith(holdTable))) ||
      (holdChunk && url.includes('/assets/'+holdChunk)));
  if(target)held.add(req.requestId);
  else void send('Fetch.continueRequest',{requestId:req.requestId}).catch(e=>{failures.push('continue '+e.message);});
}
const cfgProcess=spawnSync(win?'cmd.exe':'pnpm',win?['/d','/s','/c','pnpm dlx supabase status --output json']:
  ['dlx','supabase','status','--output','json'],{cwd:root,encoding:'utf8',timeout:45000,maxBuffer:1_000_000});
assert.equal(cfgProcess.status,0,'local Supabase must be running');
const cfg=JSON.parse(cfgProcess.stdout);
assert.equal(cfg.API_URL,'http://127.0.0.1:55321','only preconfigured local Auth allowed');
assert.match(cfg.DB_URL,/127\.0\.0\.1:55322/,'only local DB allowed');
let primaryError=null;
try{
  await new Promise((resolve,reject)=>{guard.once('error',reject);guard.listen(3397,'127.0.0.1',resolve)});
  const user=await api(cfg,'/auth/v1/admin/users','POST',{email:qaEmail,password,email_confirm:true},null,true);
  uid=user.id;assert.match(uid,/^[0-9a-f-]{36}$/i);
  sql("INSERT INTO public.platform_admins(user_id,active) VALUES ('"+uid+"',true)");
  const sign=await api(cfg,'/auth/v1/token?grant_type=password','POST',{email:qaEmail,password});
  const factor=await api(cfg,'/auth/v1/factors','POST',{factor_type:'totp',friendly_name:'Disposable performance QA'},sign.access_token);
  const chal=await api(cfg,'/auth/v1/factors/'+factor.id+'/challenge','POST',{},sign.access_token);
  const upgraded=await api(cfg,'/auth/v1/factors/'+factor.id+'/verify','POST',{challenge_id:chal.id,code:totp(factor.totp.secret)},sign.access_token);
  const current=await api(cfg,'/auth/v1/user','GET',undefined,upgraded.access_token);
  const access=await api(cfg,'/rest/v1/rpc/admin_check_access','POST',{},upgraded.access_token);
  assert.equal(access.allowed,true);
  const session={access_token:upgraded.access_token,refresh_token:upgraded.refresh_token??sign.refresh_token,
    expires_in:upgraded.expires_in??3600,expires_at:Math.floor(Date.now()/1000)+(upgraded.expires_in??3600),
    token_type:'bearer',user:current};

  const command='pnpm --filter @aisencore/admin preview --host 127.0.0.1 --port 3422 --strictPort';
  site=spawn(win?'cmd.exe':'pnpm',win?['/d','/s','/c',command]:
    ['--filter','@aisencore/admin','preview','--host','127.0.0.1','--port','3422','--strictPort'],
    {cwd:root,stdio:'ignore'});
  await until(async()=>{try{return (await fetch(base,{signal:AbortSignal.timeout(700)})).ok}catch{return false}},16000);
  const chromePath=win?'C:/Program Files/Google/Chrome/Application/chrome.exe':'google-chrome';
  chrome=spawn(chromePath,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port=0','--window-size=1440,900','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  const active=join(profile,'DevToolsActivePort');
  await until(async()=>existsSync(active),15000);
  const port=Number(readFileSync(active,'utf8').split(/\r?\n/)[0]);
  const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=pages.find(x=>x.type==='page');assert.ok(page?.webSocketDebuggerUrl);
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('message',onMessage);
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:"window.__layout={cls:0};try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__layout.cls+=e.value;}).observe({type:'layout-shift',buffered:true})}catch{}"});
  await send('Page.navigate',{url:base+'/#/'});
  await until(async()=>await evaluate('document.readyState')==='complete');
  await evaluate("localStorage.setItem('sb-127-auth-token',"+JSON.stringify(JSON.stringify(session))+")");
  await send('Page.reload',{ignoreCache:true});
  await until(async()=>String(await evaluate('document.body?.innerText??""')).includes('管理概览'),14000);
  await send('Fetch.enable',{patterns:[
    {urlPattern:'http://127.0.0.1:55321/rest/v1/*',requestStage:'Request'},
    {urlPattern:'http://127.0.0.1:3422/assets/*',requestStage:'Request'},
  ]});

  async function probe(name,route,table,column,width=1440){
    await release();
    await send('Emulation.setDeviceMetricsOverride',{width,height:width<600?844:900,deviceScaleFactor:1,mobile:width<600});
    holdTable=table;
    requests={access:0,tags:0,products:0,feedback:0};
    const start=Date.now();
    // Change the document URL, not only its hash: a hash-only navigation can
    // legitimately reuse React-admin's cached data and skip the pending state.
    await send('Page.navigate',{url:base+'/?probe='+encodeURIComponent(name)+'#/'+route});
    await until(async()=>held.size>0,17000);
    try{await until(async()=>await evaluate("document.body.innerText.includes('正在读取记录')"),9000)}
    catch(e){
      const debug=await evaluate("({hash:location.hash,hasAppBar:!!document.querySelector('.MuiAppBar-root'),hasMain:!!document.querySelector('.RaLayout-content'),hasPending:document.body.innerText.includes('正在读取记录'),headings:[...document.querySelectorAll('thead th')].map(x=>x.textContent.trim()),isBusy:!!document.querySelector('[aria-busy=true]'),hasLogin:document.body.innerText.includes('管理账号登录')})");
      throw Error(name+' pending-timeout '+JSON.stringify(debug)+'; '+e.message);
    }
    const holdingAt=Date.now()-start;
    const snapshot=await evaluate(`(()=>{const tabs=[...document.querySelectorAll('thead th')].filter(x=>getComputedStyle(x).display!=='none').map(x=>x.textContent.trim());
       const body=document.body.innerText;return {headings:tabs,bodyLoading:body.includes('正在读取记录'),appBar:!!document.querySelector('.MuiAppBar-root'),
       sidebar:!!document.querySelector('.MuiDrawer-paper'),bodyStatus:body.includes('正在加载记录')};})()`);
    if(width>=900){assert.ok(snapshot.headings.some(x=>x.includes(column)),name+' known header must be visible while GET is paused');}
    else assert.ok(snapshot.bodyLoading,name+' mobile pending must show localized loading');
    assert.ok(snapshot.appBar,name+' must retain top navigation');
    assert.ok(snapshot.bodyLoading||snapshot.bodyStatus,name+' must give visible loading feedback');
    if(verifyPendingAxe&&['products','feedback-inbox','memberships-mobile'].includes(name)){
      // Audit the *pending* table/card state, not just the loaded layout. Save
      // rule IDs/counts only: no HTML, user content, tokens or private data.
      await send('Runtime.evaluate',{expression:axeBundle},45000);
      const output=await send('Runtime.evaluate',{expression:
        "axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}).then(r=>JSON.stringify({serious:r.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,impact:v.impact,count:v.nodes.length})),all:r.violations.map(v=>({id:v.id,impact:v.impact,count:v.nodes.length})),incomplete:r.incomplete.length}))",
        returnByValue:true,awaitPromise:true},45000);
      assert.ok(output.result?.result?.value,'axe returned a report for '+name);
      const report=JSON.parse(output.result.result.value);
      a11y.push({name,...report});
      assert.equal(report.serious.length,0,'serious/critical WCAG pending-state violations in '+name);
      console.log('AAL2_PENDING_AXE PASS '+name+' incomplete='+report.incomplete);
    }
    await sleep(1200);
    const during=await evaluate("({appBar:!!document.querySelector('.MuiAppBar-root'),visibleHeadings:[...document.querySelectorAll('thead th')].filter(x=>getComputedStyle(x).display!=='none').map(x=>x.textContent.trim()),pendingText:document.body.innerText.includes('正在读取记录')})");
    assert.ok(during.appBar&&during.pendingText,name+' pending content must remain after >1s');
    const heldCount=held.size;
    await release();
    await until(async()=>!(await evaluate("document.body.innerText.includes('正在读取记录')")),16000);
    const loaded=await evaluate("({hasHeader:!!document.querySelector('thead th'),tableRows:document.querySelectorAll('tbody tr').length,appBar:!!document.querySelector('.MuiAppBar-root'),cls:window.__layout?.cls??null,docOverflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-document.documentElement.clientWidth})");
    assert.ok(loaded.appBar);
    results.push({name,route,width,blockedTable:table,heldRequestCountAtFirstPaint:heldCount,
      awaitingTimeMs:holdingAt,fixedHeaderPresent:width>=900,
      pendingTextVisible:snapshot.bodyLoading,appBarDuringPending:during.appBar,
      loadedHeaderPresent:loaded.hasHeader,loadedVisibleRows:loaded.tableRows,
      cls:loaded.cls,docOverflowPx:loaded.docOverflow,requests:{...requests}});
    console.log('AAL2_READONLY_UI PASS '+name+' '+width+'px');
  }
  if(verifySpaTags){
    await release();
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    requests={access:0,tags:0,products:0,feedback:0};
    await send('Page.navigate',{url:base+'/?probe=tags-spa#/feedback'});
    await until(async()=>await evaluate("location.hash==='#/feedback' && !!document.querySelector('input[placeholder=\"选择已有标签\"]')"),15000);
    await sleep(500);
    const cold=requests.tags;
    await evaluate("location.hash='#/feedback/workbench'");
    await until(async()=>await evaluate("location.hash==='#/feedback/workbench' && document.body.innerText.includes('处理工作台')"),10000);
    await sleep(350);
    await evaluate("location.hash='#/feedback/archived'");
    await until(async()=>await evaluate("location.hash==='#/feedback/archived' && document.body.innerText.includes('归档')"),10000);
    await sleep(350);
    spaTags={cold,afterTwoSpaRoutes:requests.tags,additional:requests.tags-cold};
    assert.ok(cold>=1,'cold feedback must fetch tags');
    assert.equal(spaTags.additional,0,'same-scope fast SPA switches must reuse tag cache');
    console.log('AAL2_SPA_TAG_CACHE PASS '+JSON.stringify(spaTags));
  }else{
  await probe('products','products','products','产品',1440);
  await probe('memberships','memberships','product_memberships','加入日期',1440);
  await probe('feedback-inbox','feedback','admin_feedback_summaries','反馈',1440);
  await probe('feedback-workbench','feedback/workbench','admin_feedback_summaries','反馈',1440);
  await probe('feedback-archived','feedback/archived','admin_feedback_summaries','反馈',1440);
  await probe('feedback-trash','feedback/trash','admin_feedback_summaries','反馈',1440);
  await probe('grants','grants','entitlement_grants','授权账号',1440);
  await probe('batches','code-batches','redemption_code_batches','请求编号',1440);
  await probe('codes','codes','admin_redemption_code_summaries','安全前缀',1440);
  await probe('redemptions','redemptions','redemptions','核销账号',1440);
  await probe('events','membership-events','membership_events','对应成员',1440);
  await probe('admins','admins','platform_admins','管理员账号',1440);
  await probe('restrictions','restrictions','platform_account_restrictions','目标账号',1440);
  await probe('audit','audit-logs','admin_audit_log','操作类型',1440);
  await probe('products-mobile','products','products','产品',390);
  await probe('memberships-mobile','memberships','product_memberships','加入日期',390);
  await probe('feedback-mobile','feedback','admin_feedback_summaries','反馈',390);
  await probe('feedback-archived-mobile','feedback/archived','admin_feedback_summaries','反馈',390);
  await probe('feedback-trash-mobile','feedback/trash','admin_feedback_summaries','反馈',390);
  await probe('grants-mobile','grants','entitlement_grants','授权账号',390);
  await probe('batches-mobile','code-batches','redemption_code_batches','请求编号',390);
  await probe('codes-mobile','codes','admin_redemption_code_summaries','安全前缀',390);
  await probe('redemptions-mobile','redemptions','redemptions','核销账号',390);
  await probe('events-mobile','membership-events','membership_events','对应成员',390);
  await probe('admins-mobile','admins','platform_admins','管理员账号',390);
  await probe('restrictions-mobile','restrictions','platform_account_restrictions','目标账号',390);
  await probe('audit-mobile','audit-logs','admin_audit_log','操作类型',390);
  await probe('memberships-phone-small','memberships','product_memberships','加入日期',320);
  await probe('memberships-tablet','memberships','product_memberships','加入日期',768);
  // A first-time lazy route must not erase the authenticated application shell.
  // Hold just its JS chunk while navigating inside the same SPA document.
  await release();
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  holdChunk='AccountActions-';
  await send('Page.navigate',{url:base+'/?probe=feedback-trash-mobile#/account-actions'});
  try{
    await until(async()=>held.size>0,9000);
    await sleep(260);
    const during=await evaluate("({hasBar:!!document.querySelector('.MuiAppBar-root'),hasSidebar:!!document.querySelector('.MuiDrawer-paper'),routeLoading:document.body.innerText.includes('正在加载工作区')})");
    lazyRoute={chunk:'AccountActions',suspended:true,...during};
    await release();
    await until(async()=>await evaluate("document.body.innerText.includes('平台账号操作')"),12000);
    lazyRoute.restoredBar=await evaluate("!!document.querySelector('.MuiAppBar-root')");
    console.log('LAZY_ROUTE_SHELL '+JSON.stringify(lazyRoute));
  }catch(e){
    lazyRoute={chunk:'AccountActions',suspended:false,reason:'asset interception not confirmed; '+e.message};
    await release();
    console.log('LAZY_ROUTE_SHELL NOT RUN');
  }
  if(verifyRevocation){
    // Only the random, temporary QA actor may be revoked. No human admin,
    // baseline product or business record can be modified by this negative case.
    assert.equal(sql("SELECT count(*) FROM auth.users WHERE id='"+uid+"' AND email LIKE 'perf-uiqa-%@aisencore.test'"),'1');
    assert.equal(sql("SELECT count(*) FROM public.platform_admins WHERE user_id='"+uid+"' AND active"),'1');
    sql("UPDATE public.platform_admins SET active=false WHERE user_id='"+uid+"'");
    const result=await api(cfg,'/rest/v1/rpc/admin_check_access','POST',{},session.access_token);
    assert.equal(result.allowed,false,'revoked QA actor must be denied by server');
    await send('Page.navigate',{url:base+'/?probe=revoked#/memberships'});
    await until(async()=>String(await evaluate('document.body.innerText')).includes('使用平台管理员身份登录'),22000);
    const protectedRows=await evaluate("!!document.querySelector('.RaLayout-content tbody tr')");
    assert.equal(protectedRows,false,'revoked AAL2 QA actor must not see protected records');
    revocation={serverAllowed:false,loginVisible:true,protectedRows:false};
    console.log('AAL2_REVOKED_ADMIN_DENIED PASS');
  }
  }
  assert.equal(failures.length,0,'interception failures must be absent');
} catch(err){primaryError=err;console.error('AAL2_READONLY_UI FAILED '+err.message)}
finally{
  try{await release()}catch{}
  try{guard.close()}catch{}
  try{await send('Fetch.disable')}catch{}
  try{ws?.close()}catch{}
  if(win){
    for(const child of [chrome,site])if(child?.pid)spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{encoding:'utf8',timeout:10000});
  }else{chrome?.kill();site?.kill();}
  if(uid){
    try{
      assert.equal(sql("SELECT count(*) FROM auth.users WHERE id='"+uid+"' AND email LIKE 'perf-uiqa-%@aisencore.test'"),'1');
      sql("DELETE FROM public.platform_admins WHERE user_id='"+uid+"'");
      await api(cfg,'/auth/v1/admin/users/'+uid,'DELETE',undefined,null,true);
      assert.equal(sql("SELECT count(*) FROM auth.users WHERE id='"+uid+"'"),'0');
      console.log('AAL2_QA_CLEANUP PASS');
    }catch(e){failures.push('cleanup '+e.message);console.error('AAL2_QA_CLEANUP FAILED '+e.message);}
  }
  // Windows Chrome can keep its profile locked briefly after taskkill exits.
  // Retry boundedly and treat final deletion failure as an actual test failure.
  let profileDeleted=false;
  for(let retry=0;retry<15&&!profileDeleted;retry++){
    try{rmSync(profile,{force:true,recursive:true,maxRetries:3,retryDelay:200});profileDeleted=true;}
    catch{await sleep(900)}
  }
  if(!profileDeleted){failures.push('profile deletion');console.error('QA_PROFILE_CLEANUP FAILED');}
  const safe={context:'temporary local AAL2 admin; production preview; read-only business queries artificially paused by CDP; no credentials/data retained',
    createdAt:'2026-10-26',results,lazyRoute,revocation,spaTags,a11y,pass:!primaryError&&failures.length===0,
    limitations:['Synthetic local fixture; no real-user p75/p95','Only GET paused; not application request latency','No data-volume stress test','No manual screen-reader or owner signoff']};
  writeFileSync(join(root,'docs','Plans','aisencore-mvp','ui-evidence',verifySpaTags?
    'admin-perf-spa-tags-2026-10-26.json':verifyRevocation?
    'admin-perf-aal2-revocation-2026-10-26.json':verifyPendingAxe?
    'admin-perf-aal2-loading-axe-2026-10-26.json':'admin-perf-aal2-readonly-2026-10-26.json'),JSON.stringify(safe,null,2));
  if(primaryError||failures.length)process.exitCode=1;
}

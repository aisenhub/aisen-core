#!/usr/bin/env node
// Real isolated local browser acceptance: Supabase GoTrue AAL2 -> React-admin.
// Creates and cleans up one synthetic QA admin. Never persists passwords, MFA
// secrets, access tokens, or service keys. Screenshots contain only demo data.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const win=process.platform==='win32';
const preview=process.env.AISENCORE_UIQA_PREVIEW==='1';
// Short, independently-cleaned runs avoid the previous 320s kill during writes.
// Safe default is the read-only-resource/navigation suite (QA Auth is still temporary).
const qaPhase=process.env.AISENCORE_UIQA_PHASE??'navigation';
assert.ok(['full','navigation','operations','operations-grants','operations-issuance','operations-responsive','operations-feedback'].includes(qaPhase),'Unsupported Admin QA phase');
const cli=spawnSync(win?'cmd.exe':'pnpm',
  win?['/d','/s','/c','pnpm dlx supabase status --output json']:
    ['dlx','supabase','status','--output','json'],
  {cwd:root,encoding:'utf8',timeout:45000,maxBuffer:1_000_000});
assert.equal(cli.status,0,'local Supabase must be running');
const cfg=JSON.parse(cli.stdout);
assert.equal(cfg.API_URL,'http://127.0.0.1:55321');
assert.match(cfg.DB_URL,/127\.0\.0\.1:55322/);
assert.match(spawnSync('docker',['port','supabase_db_Aisencore','5432/tcp'],
  {encoding:'utf8',timeout:10000}).stdout,/:55322\b/);
const port=3396,base='http://127.0.0.1:'+port,profile=mkdtempSync(join(tmpdir(),'aisencore-uiqa-'));
const chromePath=win?'C:/Program Files/Google/Chrome/Application/chrome.exe':'google-chrome';
const email='admin-uiqa-'+randomUUID().slice(0,12)+'@aisencore.test';
const password='LocalUiQa!'+randomBytes(15).toString('base64url');
const qaProductKey='qa_browser_'+randomBytes(6).toString('hex');
let qaProductId=null,qaOrdUserId=null,qaFeedbackId=null,qaFeedbackRequestId=null;
const qaCleanupFailures=[];
const qaSecretDownloadPaths=[];
let uid=null,site=null,chrome=null,ws=null,qaFixtureStarted=false;
let injectedFault=null,mfaBrowserRequests=0,interceptionFailure=null;
const exclusiveGuard=createServer();
// A previous 320s external kill prevented finally cleanup. Every short QA
// phase must exit voluntarily with enough time to clean temporary Auth, grants,
// products, secrets and Chrome profiles before the runner's hard deadline.
const qaSoftDeadline = Date.now() + 180_000;
let qaInCleanup = false;
const sleep=ms=>{
  if(!qaInCleanup && uid && Date.now()+ms >= qaSoftDeadline)
    return Promise.reject(Error('ADMIN_QA_SOFT_DEADLINE: stop phase and run finally before external timeout'));
  return new Promise(resolve=>setTimeout(resolve,ms));
};
function sql(query) {
  const r=spawnSync('docker',['exec','supabase_db_Aisencore','psql','-X','-qAt',
    '-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',query],
    {encoding:'utf8',timeout:20000});
  if(r.status!==0)throw Error('Local fixture SQL failed '+r.stderr.slice(-220));
  return r.stdout.trim();
}
async function api(path,method='GET',body,token=null,service=false) {
  const headers={apikey:service?cfg.SERVICE_ROLE_KEY:cfg.PUBLISHABLE_KEY};
  if(service)headers.authorization='Bearer '+cfg.SERVICE_ROLE_KEY;
  if(token)headers.authorization='Bearer '+token;
  if(body!==undefined)headers['content-type']='application/json';
  const r=await fetch(cfg.API_URL+path,{method,headers,
    body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(path+' returned HTTP '+r.status);
  return data;
}
function totp(secret){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let buffer=0,bits=0,bytes=[];
  for(const c of secret.replace(/[\s=]/g,'').toUpperCase()){
    const x=alphabet.indexOf(c);if(x<0)throw Error('Invalid TOTP secret');
    buffer=(buffer<<5)|x;bits+=5;
    if(bits>=8){bits-=8;bytes.push((buffer>>>bits)&255);}
  }
  const counter=Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',Buffer.from(bytes)).update(counter).digest();
  return String((digest.readUInt32BE(digest.at(-1)&15)&0x7fffffff)%1000000).padStart(6,'0');
}
async function ready(url) {
  for(let i=0;i<80;i++) {
    try {const r=await fetch(url,{signal:AbortSignal.timeout(900)});if(r.ok)return;}
    catch{}
    await sleep(200);
  }
  throw Error('Frontend/Chrome not ready: '+url);
}
let seq=0,pending=new Map();
function send(method,params={},timeoutMs=15000) {
  const id=++seq;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{
      if(pending.has(id)){pending.delete(id);reject(Error('CDP '+method+' timeout'));}
    },timeoutMs);
    pending.set(id,{
      resolve:value=>{clearTimeout(timer);resolve(value)},
      reject:error=>{clearTimeout(timer);reject(error)},
    });
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const x=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  const problem=x.exceptionDetails??x.result?.exceptionDetails;
  if(problem)throw Error('Browser exception while evaluating QA condition: '+String(problem.exception?.description??problem.text??'unknown').slice(0,450));
  return x.result?.result?.value;
}
async function visible(needle){
  for(let i=0;i<70;i++){
    const text=await evaluate('document.body?.innerText ?? ""');
    if(text?.includes(needle))return text;
    await sleep(220);
  }
  const body=String(await evaluate('document.body?.innerText ?? ""'));
  const route=String(await evaluate('location.pathname'));
  throw Error('Browser page missing '+needle+' on route '+route+'; body preview: '+body.slice(0,1000));
}
try {
  // Exclusive loopback port guard must be acquired before any test writes.
  // A second simultaneous QA would otherwise pollute list totals and screenshots.
  await new Promise((resolve,reject)=>{
    exclusiveGuard.once('error',reject);
    exclusiveGuard.listen(3397,'127.0.0.1',resolve);
  });
  // Fail BEFORE all writes when a previous timed-out suite left QA data.
  // This acceptance suite is intentionally restricted to the owner's clean,
  // two-product, single-admin local DB; never overwrite a real development user.
  const baseline=sql("SELECT "+
    "(SELECT count(*) FROM auth.users)||'|'||"+
    "(SELECT count(*) FROM public.products WHERE product_key IN ('aisenhub','aisenlens') AND status='active')||'|'||"+
    "(SELECT count(*) FROM public.products)||'|'||"+
    "(SELECT count(*) FROM public.platform_admins WHERE active)||'|'||"+
    "(SELECT count(*) FROM public.product_memberships)||'|'||"+
    "(SELECT count(*) FROM public.entitlement_grants)||'|'||"+
    "(SELECT count(*) FROM public.redemption_code_batches)||'|'||"+
    "(SELECT count(*) FROM public.redemption_codes)||'|'||"+
    "(SELECT count(*) FROM public.admin_audit_log)");
  assert.equal(baseline,'1|2|2|1|0|0|0|0|0',
    'LOCAL_QA_BASELINE_DIRTY: do NOT start write tests; review 2026-10-27-admin-uiqa-timeout-and-recovery.md');
  console.log('CLEAN_LOCAL_QA_BASELINE PASS before Auth, product or grant writes');
  const newUser=await api('/auth/v1/admin/users','POST',{email,password,email_confirm:true},null,true);
  uid=newUser.id;
  qaFixtureStarted=true;
  assert.match(uid,/^[a-f0-9-]{36}$/i);
  sql("INSERT INTO public.platform_admins(user_id,active) VALUES ('"+uid+"',true)");
  const signin=await api('/auth/v1/token?grant_type=password','POST',{email,password});
  const factor=await api('/auth/v1/factors','POST',{factor_type:'totp',friendly_name:'Temporary QA factor'},signin.access_token);
  const challenge=await api('/auth/v1/factors/'+factor.id+'/challenge','POST',{},signin.access_token);
  const level=await api('/auth/v1/factors/'+factor.id+'/verify','POST',
    {challenge_id:challenge.id,code:totp(factor.totp.secret)},signin.access_token);
  const currentUser=await api('/auth/v1/user','GET',undefined,level.access_token);
  const authCheck=await api('/rest/v1/rpc/admin_check_access','POST',{},level.access_token);
  assert.equal(authCheck.allowed,true,'real GoTrue AAL2 must be accepted by admin RPC');
  const session={access_token:level.access_token,refresh_token:level.refresh_token??signin.refresh_token,
    expires_in:level.expires_in??3600,
    expires_at:Math.floor(Date.now()/1000)+(level.expires_in??3600),
    token_type:'bearer',user:currentUser};
  const frontendArgs=['--filter','@aisencore/admin',preview?'preview':'dev',
    '--host','127.0.0.1','--port','3396'];
  site=spawn(win?'cmd.exe':'pnpm',
    win?['/d','/s','/c','pnpm '+frontendArgs.join(' ')]:frontendArgs,
    {cwd:root,env:process.env,stdio:'ignore'});
  await ready(base);
  console.log('UI_QA_MODE '+(preview?'production-preview':'vite-development'));
  chrome=spawn(chromePath,['--headless=new','--disable-gpu','--no-first-run',
    '--no-default-browser-check','--remote-debugging-port=0','--window-size=1440,900',
    '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  const portFile=join(profile,'DevToolsActivePort');
  for(let i=0;i<100&&!existsSync(portFile);i++)await sleep(130);
  assert.ok(existsSync(portFile),'Chrome DevToolsActivePort');
  let debugPort=0;
  for(let i=0;i<35&&!debugPort;i++){
    try{debugPort=Number(readFileSync(portFile,'utf8').split(/\r?\n/)[0]);}
    catch(error){if(!['EBUSY','EPERM','ENOENT'].includes(error.code))throw error;await sleep(100);}
  }
  assert.ok(debugPort>0,'Chrome debugging port readable after Windows file unlock');
  const pages=await (await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json();
  const page=pages.find(p=>p.type==='page');
  assert.ok(page?.webSocketDebuggerUrl,'Chrome page CDP endpoint');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('message',event=>{
    const payload=JSON.parse(event.data);
    const entry=pending.get(payload.id);
    if(entry){pending.delete(payload.id);payload.error?entry.reject(Error(payload.error.message)):entry.resolve(payload);}
    if(payload.method==='Network.requestWillBeSent' &&
      /\/auth\/v1\/(?:factors|mfa)(?:\/|\?|$)/.test(payload.params?.request?.url??''))mfaBrowserRequests++;
    if(payload.method==='Fetch.requestPaused'){
      const req=payload.params;
      const faultRpc=injectedFault?.rpc??'admin_create_codes';
      const targeted=injectedFault?.readTable?
        req.request?.url?.includes('/rest/v1/'+injectedFault.readTable)&&req.request?.method==='GET':
        req.request?.url?.includes('/rest/v1/rpc/'+faultRpc)&&req.request?.method==='POST';
      const fault=targeted && injectedFault &&
        (injectedFault.remaining>0||!injectedFault.used) ? injectedFault : null;
      if(fault){
        fault.used=true;
        if(fault.remaining>0)fault.remaining--;
        const body=Buffer.from(JSON.stringify({message:'Synthetic local browser QA failure',code:'QA_INJECTED'})).toString('base64');
        void send('Fetch.fulfillRequest',{requestId:req.requestId,responseCode:fault.status,
          responseHeaders:[{name:'Access-Control-Allow-Origin',value:'*'},
            {name:'Content-Type',value:'application/json'},
            {name:'Cache-Control',value:'no-store'}],body}).catch(error=>{interceptionFailure=error.message;});
      }else void send('Fetch.continueRequest',{requestId:req.requestId})
        .catch(error=>{interceptionFailure=error.message;});
    }
  });
  await send('Network.enable');
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate',{url:base+'/'});
  await sleep(1000);
  await evaluate("localStorage.setItem('sb-127-auth-token',"+JSON.stringify(JSON.stringify(session))+")");
  await send('Page.reload',{ignoreCache:true});
  await visible('管理概览');
  const dir=join(root,'docs','Plans','aisencore-mvp','ui-evidence');
  mkdirSync(dir,{recursive:true});

  // Stage-1 automated accessibility baseline for actual authenticated pages.
  // Only rule IDs, impact and counts are saved: no DOM HTML, emails or tokens.
  const axeBundle=readFileSync(join(root,'apps/admin/node_modules/axe-core/axe.min.js'),'utf8');
  await send('Runtime.evaluate',{expression:axeBundle});
  assert.equal(await evaluate('typeof axe.run'),'function','axe-core injected into isolated QA Chrome');
  const a11yResults=[];
  async function axeAudit(label) {
    // MUI Dialog fades in with an opacity transition. A contrast scan during
    // that short fade falsely measures near-white glyphs on near-white paper.
    // Audit the settled interactive state instead of an animation frame.
    if(label.endsWith('-dialog'))await sleep(600);
    const raw=await evaluate("axe.run(document.querySelector('[role=dialog]')??document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}).then(r=>JSON.stringify({violations:r.violations.map(v=>({id:v.id,impact:v.impact,count:v.nodes.length,help:v.help,samples:v.nodes.slice(0,3).map(n=>({selector:n.target[0]?.slice(0,120),contrast:n.any.find(c=>c.id==='color-contrast')?.data??null}))})),passes:r.passes.length,incomplete:r.incomplete.length}))");
    assert.equal(typeof raw,'string','axe.run returned no JSON result for '+label+'; inspect browser exception');
    const entry={page:label,...JSON.parse(raw)};
    a11yResults.push(entry);
    writeFileSync(join(dir,'phase1-axe-wcag-baseline.json'),JSON.stringify({
      context:'axe-core local headless Chrome production preview; automated rules only; does not establish WCAG AA compliance',
      pages:a11yResults,
      manualStillRequired:['screen reader','focus order','IME','keyboard','200-400% zoom','all dynamic states'],
    },null,2));
    console.log('A11Y_BASELINE '+label+' violations='+entry.violations.length+' incomplete='+entry.incomplete);
    assert.equal(entry.violations.filter(v=>['critical','serious'].includes(v.impact)).length,0,
      'automated serious WCAG violations in '+label+'; inspect phase1-axe-wcag-baseline.json');
  }
  const morePages=[
    // Empty states hide result column headers. Check the real bounded-search
    // controls instead; each verifies the secure Admin list actually mounted.
    ['memberships','成员关系','精确成员 UUID'],
    ['grants','授权记录','精确授权用户 UUID'],
    ['code-batches','发行批次','准确请求编号'],
    ['codes','兑换码记录','精确批次 UUID'],
    ['redemptions','核销记录','精确授权 UUID'],
    ['membership-events','成员事件','精确成员关系 UUID'],
    ['admins','管理员权限','精确管理员 UUID'],
    ['restrictions','账号限制','精确账号 UUID'],
    ['audit-logs','管理审计','精确目标 UUID'],
    ['users','查找账号','请输入邮箱查找账号'],
    ['feedback','收件箱','收件箱'],
  ];
  const capture=async(name)=>{
    const jpeg=name.endsWith('.jpg');
    let r;
    for(let attempt=0;attempt<2;attempt++){
      try{
        r=await send('Page.captureScreenshot',{
          format:jpeg?'jpeg':'png',
          ...(jpeg?{quality:name.includes('-review')?43:76}:{}),
          captureBeyondViewport:false,
        },attempt===0?30000:45000);
        break;
      }catch(error){
        if(attempt===1)throw error;
        // A single slow headless Chrome frame is not an application failure.
        // Still fail the suite if the capture remains unresponsive on retry.
        console.warn('SCREENSHOT_RETRY '+name+' after one CDP timeout');
        await sleep(400);
      }
    }
    if(!r?.result?.data)throw Error('Screenshot produced no data: '+name);
    writeFileSync(join(dir,name),Buffer.from(r.result.data,'base64'));
  };
  if(!qaPhase.startsWith('operations')){
  await axeAudit('dashboard');
  const headerLayout=JSON.parse(await evaluate("JSON.stringify((()=>{const toolbar=document.querySelector('.MuiToolbar-root');return [...(toolbar?.children??[])].slice(0,8).map(el=>({tag:el.tagName,cls:String(el.className).slice(0,100),text:(el.innerText??'').slice(0,30),width:Math.round(el.getBoundingClientRect().width),left:Math.round(el.getBoundingClientRect().left)}))})())"));
  console.log('AC03_APPBAR_DOM '+JSON.stringify(headerLayout));
  // Shell acceptance: floating navigation, content and the light toolbar.
  const shell=JSON.parse(await evaluate("JSON.stringify((()=>{const bar=document.querySelector('.MuiAppBar-root'),header=document.querySelector('.MuiToolbar-root'),brand=document.querySelector('.aisencore-brand'),scope=document.querySelector('.aisencore-scope'),sidebar=document.querySelector('.MuiDrawer-paper'),content=document.querySelector('.RaLayout-content');const b=el=>{const r=el?.getBoundingClientRect();return r?{left:Math.round(r.left),right:Math.round(r.right),top:Math.round(r.top),bottom:Math.round(r.bottom),width:Math.round(r.width)}:null};const c=el=>el?{background:getComputedStyle(el).backgroundColor,shadow:getComputedStyle(el).boxShadow,radius:getComputedStyle(el).borderTopLeftRadius}:null;return {headerText:header?.innerText??'',brand:b(brand),scope:b(scope),heading:b(document.querySelector('.RaLayout-content h1')),header:b(header),bar:c(bar),sidebar:b(sidebar),sidebarStyle:c(sidebar),content:b(content),contentStyle:c(content),pageBg:getComputedStyle(document.body).backgroundColor}})())"));
  console.log('SHELL_THREE_ZONE '+JSON.stringify(shell));
  assert.ok(!shell.headerText.includes('产品目录')&&!shell.headerText.includes('工作范围'),
    'topbar must not duplicate the resource title or visible scope label');
  assert.ok(shell.scope&&shell.heading&&Math.abs(shell.scope.left-shell.heading.left)<=16,
    'at 1440px the product selector must align with the workspace page heading, not the brand');
  assert.ok(shell.sidebar&&shell.content&&shell.sidebar.left>=8&&shell.content.left-shell.sidebar.right>=8,
    'sidebar and content must be separate elevated surfaces with a visible gutter');
  assert.ok(parseFloat(shell.sidebarStyle?.radius??'0')>=12&&parseFloat(shell.contentStyle?.radius??'0')>=12,
    'navigation and content must have independent rounded surfaces');
  assert.ok(shell.bar?.background!=='rgb(23, 42, 48)',
    'topbar must use the new light appearance');
  console.log('SHELL_LIGHT PASS independent panels, left scope, no duplicate header copy');

  // Navigation IA: one workspace group, six first-level tasks and four management children.
  const primaryNav=JSON.parse(await evaluate("JSON.stringify([...document.querySelectorAll('.MuiDrawer-paper a[href]')].map(a=>a.textContent?.trim()).filter(Boolean))"));
  assert.deepEqual(primaryNav,['概览','用户','权益','兑换码','用户反馈','平台管理'],
    'sidebar has exactly six task-based destinations, feedback immediately below redemption');
  const sidebarText=String(await evaluate("document.querySelector('.MuiDrawer-paper')?.innerText??''"));
  assert.ok(sidebarText.includes('工作区')&&!sidebarText.includes('业务管理'),
    'workspace is the only navigation group; product is a management child');
  console.log('NAV_PRIMARY PASS one workspace category, six primary entries and preserved Resource routes');

  // Local production-preview diagnostic sample, not a Lighthouse/Core Web
  // Vitals signoff. Only aggregate timings and asset sizes; never URL tokens.
  const dashboardPerf=JSON.parse(await evaluate(`JSON.stringify((()=>{
    const nav=performance.getEntriesByType('navigation')[0];
    const assets=performance.getEntriesByType('resource').filter(r=>r.name.includes('/assets/'));
    return {domContentLoadedMs:Math.round(nav?.domContentLoadedEventEnd??0),
      loadEventMs:Math.round(nav?.loadEventEnd??0),
      ttfbMs:Math.round((nav?.responseStart??0)-(nav?.requestStart??0)),
      resourceRequests:performance.getEntriesByType('resource').length,
      assetsRequested:assets.length,
      scriptAssetRequests:assets.filter(r=>r.name.endsWith('.js')).length,
      sameOriginTransferBytes:Math.round(assets.reduce((s,r)=>s+(r.transferSize||0),0)),
      jsDecodedBytes:Math.round(assets.filter(r=>r.name.endsWith('.js')).reduce((s,r)=>s+(r.decodedBodySize||0),0))};
  })())`));
  writeFileSync(join(dir,'phase1-perf-browser-sample.json'),JSON.stringify({
    context:'single headless Chrome local production-preview authenticated navigation; no throttling',
    sample:dashboardPerf,
    limitations:'Exploratory sample only; LCP/INP/CLS, P95, cold/warm repeated tests, 10k rows still NOT RUN',
  },null,2));
  console.log('P1_SAMPLE recorded headless local production dashboard performance (not Web Vitals signoff)');
  await capture('operator-dashboard-1440.png');
  await capture('operator-dashboard-desktop-qa.jpg');
  // Four operation button entries open a single modal and preserve route.
  for(const [label,title,key] of [['新建产品','新建产品','product'],
    ['授予 Pro','新增 Pro 授权','grant'],['发行兑换码','发行兑换码','issue']]){
    const before=await evaluate('location.hash');
    const found=await evaluate("(()=>{const a=[...document.querySelectorAll('.RaLayout-content a[href]')].find(e=>e.textContent?.trim()==="+JSON.stringify(label)+");a?.click();return !!a})()");
    assert.equal(found,true,'dashboard operation trigger '+label);
    await visible(title);
    assert.equal(await evaluate("document.querySelectorAll('[role=dialog]').length"),1,
      label+' must open one root dialog');
    assert.equal(await evaluate('location.hash'),before,label+' retains dashboard URL');
    await axeAudit('operation-'+key+'-dialog');
    await capture('operator-operation-'+key+'-dialog-1440.png');
    const closed=await evaluate("(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(x=>x.getAttribute('aria-label')==='关闭操作窗口');b?.click();return !!b})()");
    assert.equal(closed,true,'operation close control');
    for(let i=0;i<30;i++){
      if(await evaluate("document.querySelectorAll('[role=dialog]').length")===0)break;
      await sleep(100);
    }
    assert.equal(await evaluate("document.querySelectorAll('[role=dialog]').length"),0,'operation dismissed');
    assert.equal(await evaluate('location.hash'),before,'background route not replaced');
    console.log('OPERATION_DIALOG PASS '+key+' opens/closes without navigation');
  }

  // V1 responsive proof for the redesigned Dashboard, not browser zoom.
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:1,mobile:true});
  await sleep(260);
  const mobileBrand=JSON.parse(await evaluate("JSON.stringify((()=>{const brand=document.querySelector('.aisencore-brand');const toggle=document.querySelector('.MuiToolbar-root > button');const select=[...document.querySelectorAll('[role=combobox]')].find(e=>e.getAttribute('aria-label')?.startsWith('切换管理产品范围'));return {brandLeft:brand?.getBoundingClientRect().left??null,brandRight:brand?.getBoundingClientRect().right??null,toggleLeft:toggle?.getBoundingClientRect().left??null,toggleWidth:toggle?.getBoundingClientRect().width??0,scope:select?.innerText?.trim()??null}})())"));
  assert.ok(mobileBrand.brandLeft!==null&&mobileBrand.brandRight<=mobileBrand.toggleLeft+2,
    'at 320px the logo must precede the mobile drawer button');
  assert.ok(mobileBrand.toggleWidth>=44,'mobile drawer touch target >=44px');
  assert.equal(mobileBrand.scope,'全平台','320px full-platform scope remains legible');
  console.log('AC03_MOBILE_BRAND PASS '+JSON.stringify(mobileBrand));
  const dashboard320=JSON.parse(await evaluate('JSON.stringify({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,links:document.querySelectorAll("a[href]").length})'));
  assert.ok(dashboard320.scroll<=dashboard320.viewport+1,'320px dashboard must reflow without whole-page horizontal overflow');
  assert.ok(dashboard320.links>=5,'320px dashboard must keep action links reachable');
  await capture('operator-dashboard-320.png');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await sleep(220);
  const dashboard390=JSON.parse(await evaluate('JSON.stringify({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})'));
  assert.ok(dashboard390.scroll<=dashboard390.viewport+1,'390px dashboard must not overflow horizontally');
  await capture('operator-dashboard-390.png');
  console.log('V1 RESPONSIVE PASS Dashboard 320/390px no page overflow, operational links remain');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await sleep(180);

  await send('Page.navigate',{url:base+'/#/products'});
  await visible('产品目录');
  // Only real active platform entries remain in the sanitized local DB.
  await visible('aisenlens');
  const managementTabs=JSON.parse(await evaluate("JSON.stringify([...document.querySelectorAll('nav[aria-label=平台管理二级导航] a')].map(a=>({name:a.textContent?.trim(),current:a.getAttribute('aria-current')})))"));
  assert.deepEqual(managementTabs.map(x=>x.name),['产品','管理审计','账号限制','管理员权限'],
    'product resource belongs to platform management with exactly four child destinations');
  assert.deepEqual(managementTabs.filter(x=>x.current==='page').map(x=>x.name),['产品'],
    'products list has the selected product child');
  const platformSidebar=JSON.parse(await evaluate("JSON.stringify((()=>{const a=[...document.querySelectorAll('.MuiDrawer-paper a')].find(x=>x.textContent?.trim()==='平台管理');return {present:!!a,background:a?getComputedStyle(a).backgroundColor:null}})())"));
  assert.equal(platformSidebar.present,true,'management remains in the sidebar on product page');
  const managementClick=await evaluate("(()=>{const x=[...document.querySelectorAll('nav[aria-label=平台管理二级导航] a')].find(e=>e.textContent?.trim()==='管理审计');x?.click();return !!x})()");
  assert.equal(managementClick,true,'management audit child is clickable from products');
  await visible('精确目标 UUID');
  assert.ok(String(await evaluate('location.hash')).includes('/audit-logs'),
    'management child uses original audit Resource URL');
  await send('Page.reload',{ignoreCache:true});
  await visible('管理审计');
  let selectedManagement=[];
  for(let n=0;n<65;n++){
    selectedManagement=JSON.parse(await evaluate("JSON.stringify([...document.querySelectorAll('nav[aria-label=平台管理二级导航] a[aria-current=page]')].map(e=>e.textContent?.trim()))"));
    if(selectedManagement.length===1&&selectedManagement[0]==='管理审计')break;
    await sleep(120);
  }
  assert.deepEqual(selectedManagement,['管理审计'],
    'management child selection survives reload');
  await send('Runtime.evaluate',{expression:axeBundle});
  await send('Page.navigate',{url:base+'/#/products'});
  await visible('产品目录');
  console.log('NAV_MANAGEMENT PASS products -> audit, 4 child views, selected state after reload');
  await axeAudit('products-desktop');
  await capture('operator-products-1440.png');
  await capture('operator-products-desktop-qa.jpg');
  await send('Emulation.setDeviceMetricsOverride',{width:1000,height:700,deviceScaleFactor:1,mobile:false});
  await sleep(250);
  const desktopWidth=await evaluate('JSON.stringify({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,layout:document.querySelector(".RaLayout-content")?.getBoundingClientRect().width})');
  console.log('TABLET_LAYOUT_QA '+desktopWidth);
  const tablet=JSON.parse(desktopWidth);
  assert.ok(tablet.scroll<=tablet.viewport+12,'1000px content must avoid whole-page horizontal scrolling');
  await capture('operator-products-review.jpg');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await sleep(300);
  await capture('operator-products-390.png');
  const mobileDebug=await evaluate('JSON.stringify({innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,layoutWidth:document.querySelector(".RaLayout-content")?.getBoundingClientRect().width,viewportMeta:document.querySelector("meta[name=viewport]")?.content,cards:[...document.querySelectorAll(".MuiCard-root")].slice(0,4).map(e=>({x:Math.round(e.getBoundingClientRect().x),w:Math.round(e.getBoundingClientRect().width)})),table:document.querySelector(".MuiTable-root")?.getBoundingClientRect().width})');
  console.log('MOBILE_LAYOUT_QA '+mobileDebug);

  const mobileOverflow=await evaluate('Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth');
  assert.ok(mobileOverflow<=12,'390px must not have whole-page horizontal overflow: '+mobileOverflow);
  // Current local baseline keeps only the real platforms: use the scoped QA Admin.
  const demoUserId=uid;
  assert.match(demoUserId,/^[a-f0-9-]{36}$/i);
  await send('Page.navigate',{url:base+'/#/users/'+demoUserId+'/show'});
  await visible('用户编号');
  await visible(email);
  await capture('operator-user-390.png');
  await axeAudit('user360-mobile');
  const userOverflow=await evaluate('Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-document.documentElement.clientWidth');
  assert.ok(userOverflow<=12,'User 360 at 390px should not overflow the document');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await sleep(300);
  await capture('operator-user-1440.png');
  const actionTarget=await evaluate("(()=>[...document.querySelectorAll('a[href]')].find(e=>e.textContent?.includes('平台账号与管理员权限操作'))?.getAttribute('href')??null)()");
  assert.ok(actionTarget?.includes('/account-actions?user_id='+demoUserId),
    'User360 governance action must preserve the verified target account');
  console.log('NAV_USER360 PASS scoped account-governance action route');
  const historyTarget=await evaluate("(()=>[...document.querySelectorAll('a[href]')].find(e=>e.textContent?.includes('查看完整授权历史'))?.getAttribute('href')??null)()");
  assert.ok(historyTarget?.includes('/grants?user_id='+demoUserId),
    'UI12 User360 history link must preserve exact UUID without any email in URL');
  assert.ok(!historyTarget.includes('@'),'UI12 account history URL must not contain an email address');
  await send('Page.navigate',{url:base+historyTarget});
  await visible('授权记录');
  const grantPrefill=await evaluate("(()=>[...document.querySelectorAll('input')].some(x=>x.value==="+JSON.stringify(demoUserId)+"))()");
  assert.equal(grantPrefill,true,'UI12 server filtered grant history must prefill exact account UUID');
  console.log('UI12_USER_HISTORY PASS verified UUID-only User360 -> Grants deep link');
  // Verify the destination form, not merely the href. It may be entered
  // directly after a user has been identified by an authorized lookup.
  await send('Page.navigate',{url:base+'/#/account-actions?user_id='+demoUserId});
  await visible('平台账号操作');
  let actualTarget='';
  for(let i=0;i<60;i++){
    actualTarget=String(await evaluate("(()=>[...document.querySelectorAll('input')].find(e=>e.value==="+JSON.stringify(demoUserId)+")?.value??'')()")??'');
    if(actualTarget===demoUserId)break;
    await sleep(160);
  }
  assert.equal(actualTarget,demoUserId,'protected governance form must prefill the identified User360 account');
  await visible(email);
  console.log('NAV_USER360_FORM PASS prefilled precise identity, protected confirmation remains');


  await send('Page.navigate',{url:base+'/#/grant-new'});
  await visible('授予 Pro 权益');
  await visible('目标产品');
  await visible('365 天');
  await capture('operator-grant-form-1440.png');
  await axeAudit('grant-form');
  await send('Page.navigate',{url:base+'/#/issue-codes'});
  await visible('发行兑换码');
  await visible('目标产品');
  await capture('operator-code-issuance-1440.png');
  await axeAudit('issue-codes');
  await send('Page.navigate',{url:base+'/#/account-actions'});
  await visible('平台账号操作');
  await visible('目标用户 UUID');
  await visible('管理操作');
  await capture('operator-account-actions-1440.png');
  await axeAudit('account-actions');


  for(const [route,title,expected] of morePages){
    await send('Page.navigate',{url:base+'/#/'+route});
    await visible(title);
    let body=await visible(expected);
    if(route==='feedback'){
      // The primary menu label is visible before the feedback async list settles.
      for(let n=0;n<75;n++){
        body=String(await evaluate('document.body?.innerText??""')??'');
        if(body.includes('当前没有匹配的收件箱反馈')||body.includes('收到时间'))break;
        await sleep(180);
      }
    }
    assert.ok(!body.includes('resources.'+route+'.'),route+' untranslated framework keys');
    assert.ok(!body.includes('记录读取失败'),route+' data request failed');
    assert.ok(!body.includes('Cannot read properties'),route+' runtime crashed');
    if(route==='feedback')assert.ok(body.includes('当前没有匹配的收件箱反馈')||body.includes('收到时间'),
      'feedback list must render either valid records or its localized empty state');
    await axeAudit(route);
    // AC-01: operational lists have no marketing Hero or secondary global switch.
    assert.equal(await evaluate("document.body.innerText.includes('查看全平台')"),false,
      route+' must not duplicate the top work-scope switch');
    assert.equal(await evaluate("document.body.innerText.includes('AISENCORE / AUTHORIZED OPERATIONS')"),false,
      route+' removes ornamental technical footers');
    if(route!=='users'&&route!=='membership-events'){
      let geo=null;
      for(let i=0;i<40;i++){
        geo=JSON.parse(await evaluate("JSON.stringify((()=>{const h=document.querySelector('table thead');const row=document.querySelector('table tbody tr');return {header:h?.getBoundingClientRect().top??null,first:row?.getBoundingClientRect().top??null}})())"));
        if(geo.header!==null&&geo.first!==null)break;
        await sleep(150);
      }
      if(geo?.header!==null&&geo?.first!==null){
        console.log('AC02_LAYOUT '+route+' '+JSON.stringify(geo));
        assert.ok(geo.header<=440,route+' table header must be visible in upper 440px');
        assert.ok(geo.first<=520,route+' first data row must start within upper 520px');
      }
    }

    const section={
      memberships:['用户',['成员关系','查找账号']],
      users:['用户',['成员关系','查找账号']],
      'code-batches':['兑换码',['发行批次','兑换码记录','核销记录']],
      codes:['兑换码',['发行批次','兑换码记录','核销记录']],
      redemptions:['兑换码',['发行批次','兑换码记录','核销记录']],
      'audit-logs':['平台管理',['产品','管理审计','账号限制','管理员权限']],
      restrictions:['平台管理',['产品','管理审计','账号限制','管理员权限']],
      admins:['平台管理',['产品','管理审计','账号限制','管理员权限']],
    }[route];
    if(section){
      const secondary=JSON.parse(await evaluate("JSON.stringify([...document.querySelectorAll('nav[aria-label$=二级导航] a[href]')].map(a=>({text:a.textContent?.trim(),current:a.getAttribute('aria-current')})))"));
      assert.deepEqual(secondary.map(x=>x.text),section[1],'approved secondary views for '+route);
      assert.equal(secondary.filter(x=>x.current==='page').length,1,'one selected secondary destination for '+route);
    }
    if(route==='feedback'){
      const nav=JSON.parse(await evaluate("JSON.stringify((()=>({selected:[...document.querySelectorAll('.MuiDrawer-paper a[href]')].filter(a=>a.textContent?.trim()==='用户反馈'&&a.classList.contains('RaMenuItemLink-active')).length,secondary:document.querySelectorAll('nav[aria-label$=二级导航]').length}))())"));
      assert.equal(nav.selected,1,'feedback is a selected first-level navigation item');
      assert.equal(nav.secondary,0,'feedback no longer renders the people secondary navigation');
      console.log('NAV_FEEDBACK_PRIMARY PASS own selected entry and no people secondary tabs');
    }
    if(route==='code-batches'){
      const jumped=await evaluate("(()=>{const a=[...document.querySelectorAll('nav[aria-label=兑换码二级导航] a')].find(e=>e.textContent?.includes('兑换码记录'));a?.click();return !!a})()");
      assert.equal(jumped,true,'redemption child navigation actionable');
      await visible('兑换码记录');
      assert.ok((await evaluate('location.hash')).includes('/codes'),'redemption second view changes browser URL');
      console.log('NAV_SECONDARY PASS redemption click opens code records');
      await send('Page.reload',{ignoreCache:true});
      await visible('兑换码记录');
      // Full navigation resets the page-scoped test-only axe injection.
      await send('Runtime.evaluate',{expression:axeBundle});
      let selected=[];
      for(let n=0;n<55;n++){
        selected=await evaluate("(()=>[...document.querySelectorAll('nav[aria-label=兑换码二级导航] a')].filter(x=>x.getAttribute('aria-current')==='page').map(x=>x.textContent?.trim()))()");
        if(selected.length===1&&selected[0]==='兑换码记录')break;
        await sleep(120);
      }
      assert.deepEqual(selected,['兑换码记录'],'redemption selected view remains correct after reload');
      console.log('NAV_RELOAD PASS selected child survives full browser reload');

    }
    if(route==='memberships'){
      const jumped=await evaluate("(()=>{const a=[...document.querySelectorAll('nav[aria-label=用户二级导航] a')].find(e=>e.textContent?.includes('查找账号'));a?.click();return !!a})()");
      assert.equal(jumped,true,'identity lookup is reachable from members');
      await visible('请输入邮箱查找账号');
      assert.ok((await evaluate('location.hash')).includes('/users'),'people second view changes URL');
      console.log('NAV_SECONDARY PASS people click reaches protected exact email search');
    }

    await capture('operator-'+route+'-1440.png');
    console.log('AUTHENTICATED_PAGE PASS '+route+' '+expected);
  }

  // UI-04: distinguish known HTTP read failures from empty records, and retry
  // with the original deep-link filter after the injection is removed.
  for(const [status,message] of [[429,'请求过于频繁'],[503,'数据服务暂时不可用']]){
    await send('Page.navigate',{url:base+'/#/memberships?user_id='+demoUserId+'&qa_error='+status});
    await visible('条记录');
    await send('Fetch.enable',{patterns:[{
      urlPattern:'*://127.0.0.1:55321/rest/v1/product_memberships*',requestStage:'Request',
    }]});
    // React-admin may retry a failed GET. Keep the fault active until an
    // observable error is rendered; do not inject into an unrelated first paint.
    injectedFault={status,used:false,remaining:20,readTable:'product_memberships'};
    const refreshed=await evaluate("(()=>{const b=document.querySelector('button[aria-label=\"刷新数据\"]');b?.click();return !!b})()");
    assert.equal(refreshed,true,'explicit list refresh requests real GET');
    let failedBody='';
    for(let i=0;i<125;i++){
      failedBody=String(await evaluate('document.body?.innerText??""'));
      if(failedBody.includes(message))break;
      await sleep(240);
    }
    assert.ok(failedBody.includes(message),
      'UI-04 GET '+status+' not visibly surfaced; intercepted='+
      injectedFault.used+' remaining='+injectedFault.remaining+
      ' interceptionError='+(interceptionFailure??'none'));
    assert.equal(injectedFault.used,true,'read-only '+status+' injected into actual GET');
    assert.ok(failedBody.includes('重试读取'),'temporary read failure offers retry');
    assert.ok(!failedBody.includes('暂无匹配的成员关系'),'failed read cannot masquerade as an empty list');
    const originalInput=await evaluate("(()=>[...document.querySelectorAll('input')].some(x=>x.value==="+JSON.stringify(demoUserId)+"))()");
    assert.equal(originalInput,true,'read failure must preserve exact original search filter');
    await send('Fetch.disable'); injectedFault=null;
    const retried=await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('重试读取'));b?.click();return !!b})()");
    assert.equal(retried,true,'original safe GET can be retried');
    for(let i=0;i<70;i++){
      const text=String(await evaluate('document.body?.innerText??""'));
      if(!text.includes(message)&&text.includes('条记录'))break;
      await sleep(160);
    }
    assert.equal((await evaluate('document.body?.innerText??""')).includes(message),false,
      'read recovery removes stale error while preserving the filter');
  }
  console.log('UI04_READ_ERRORS PASS actual GET 429/503, nonempty-vs-error, original filter, safe retry');


  // Domain navigation is responsive. Management records remain global even
  // when a product is selected in the top workspace scope switch.
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:1,mobile:true});
  await send('Page.navigate',{url:base+'/#/code-batches'});
  // Clean DB has no issuance rows: the bounded search field is present.
  await visible('准确请求编号');
  const redemptionMobile=JSON.parse(await evaluate("JSON.stringify({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,links:[...document.querySelectorAll('nav[aria-label=兑换码二级导航] a')].map(a=>a.textContent?.trim())})"));
  assert.deepEqual(redemptionMobile.links,['发行批次','兑换码记录','核销记录'],'all redemption child destinations at 320px');
  if(redemptionMobile.scroll>redemptionMobile.viewport+12){
    const offenders=JSON.parse(await evaluate("JSON.stringify([...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:typeof e.className==='string'?e.className.slice(0,60):'',text:e.textContent?.trim().slice(0,32)??'',left:Math.round(e.getBoundingClientRect().left),right:Math.round(e.getBoundingClientRect().right)})).filter(x=>x.right>document.documentElement.clientWidth+10||x.left < -10).slice(0,35))"));
    console.log('LAYOUT_OVERFLOW_REDEMPTION '+JSON.stringify(redemptionMobile)+' '+JSON.stringify(offenders));
  }
  assert.ok(redemptionMobile.scroll<=redemptionMobile.viewport+12,'320px redemption workspace must not horizontally overflow');
  await capture('operator-navigation-redemption-320.png');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Page.navigate',{url:base+'/#/audit-logs'});
  await visible('管理审计');
  const governanceMobile=JSON.parse(await evaluate("JSON.stringify({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,links:[...document.querySelectorAll('nav[aria-label=平台管理二级导航] a')].map(a=>a.textContent?.trim())})"));
  assert.deepEqual(governanceMobile.links,['产品','管理审计','账号限制','管理员权限'],'all platform management children at 390px');
  assert.ok(governanceMobile.scroll<=governanceMobile.viewport+12,'390px governance workspace must not horizontally overflow');
  await capture('operator-navigation-management-390.png');
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:1,mobile:true});
  await send('Page.navigate',{url:base+'/#/products'});
  await visible('产品目录');
  const productMobile=JSON.parse(await evaluate("JSON.stringify({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,labels:[...document.querySelectorAll('nav[aria-label=平台管理二级导航] a')].map(e=>e.textContent?.trim())})"));
  assert.deepEqual(productMobile.labels,['产品','管理审计','账号限制','管理员权限'],'all management links readable on 320px product page');
  assert.ok(productMobile.scroll<=productMobile.client+12,'320px product management cannot overflow document');
  await capture('operator-navigation-management-products-320.png');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  console.log('NAV_MOBILE PASS 320 redemption + product / 390 platform management no overflow, all child views visible');

  const demoBaseline = sql("SELECT EXISTS(SELECT 1 FROM public.products WHERE product_key='demo_atlas')") === 't';
  if (demoBaseline) {
  const scopedCases=[
    ['products', "SELECT id FROM public.products WHERE product_key='demo_atlas'",'产品详情'],
    ['memberships', "SELECT id FROM public.product_memberships WHERE product_id=(SELECT id FROM public.products WHERE product_key='demo_atlas') LIMIT 1",'成员详情'],
    ['grants', "SELECT id FROM public.entitlement_grants WHERE source_ref LIKE 'demo_%' LIMIT 1",'Pro 授权详情'],
    ['code-batches', "SELECT id FROM public.redemption_code_batches WHERE request_id='demo_fixture_batch_0'",'发行批次详情'],
    ['codes', "SELECT id FROM public.redemption_codes WHERE code_prefix LIKE 'DEMO%' LIMIT 1",'兑换码详情'],
    ['admins', "SELECT user_id FROM public.platform_admins WHERE user_id='"+uid+"'",'管理员资格详情'],
    ['restrictions', "SELECT user_id FROM public.platform_account_restrictions WHERE reason_code='demo_fixture_account_block' LIMIT 1",'账号限制详情'],
    ['audit-logs', "SELECT id FROM public.admin_audit_log WHERE action='demo_fixture_preview' LIMIT 1",'审计记录详情'],
  ];
  for(const [resource,lookupQuery,title] of scopedCases){
    const recordId=sql(lookupQuery);
    assert.match(recordId,/^[a-f0-9-]{36}$/i,resource+' demo detail id');
    await send('Page.navigate',{url:base+'/#/'+resource+'/'+recordId+'/show'});
    await visible(title);
    await visible('业务信息');
    if(resource!=='audit-logs')await visible('管理操作');
    await axeAudit(resource+'-detail');
    await capture('operator-'+resource+'-detail-1440.png');
    if(resource==='products'){
      const productLink=await evaluate("(()=>{const a=[...document.querySelectorAll('a[href]')].find(e=>e.textContent?.includes('查看此产品成员'));a?.click();return !!a})()");
      assert.equal(productLink,true,'product detail has its member-scoped domain shortcut');
      let arrived=false;
      for(let i=0;i<80;i++){
        const href=String(await evaluate('location.hash')??'');
        const body=String(await evaluate('document.body?.innerText??""')??'');
        const selected=String(await evaluate("(()=>document.querySelector('[role=combobox][aria-label^=\"切换管理产品范围\"]')?.getAttribute('aria-label')??'')()")??'');
        if(href.includes('/memberships')&&selected.includes('Atlas · 智识引擎')&&body.includes('成员账号')){arrived=true;break;}
        await sleep(180);
      }
      assert.equal(arrived,true,'product shortcut opens related members and selects the exact product');
      const scopeOpen=await evaluate("(()=>{const x=[...document.querySelectorAll('[role=combobox]')].find(e=>e.getAttribute('aria-label')?.startsWith('切换管理产品范围'));x?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));return !!x})()");
      assert.equal(scopeOpen,true,'top bar is the only scope switch control');
      await sleep(160);
      assert.equal(await evaluate("(()=>{const e=[...document.querySelectorAll('[role=option]')].find(x=>x.textContent?.includes('全平台视角'));e?.click();return !!e})()"),true,'top bar switches to global scope');
      await visible('条记录');
      assert.ok(String(await evaluate("(()=>document.querySelector('[role=combobox][aria-label^=\"切换管理产品范围\"]')?.getAttribute('aria-label')??'')()")).includes('全平台视角'),'top scope selector displays global');
      console.log('NAV_PRODUCT_SCOPE PASS product detail -> filtered members -> global reset');
    }

    const deepLink={
      memberships:['查看此成员事件历史','membership-events','membership_id','成员事件'],
      grants:['查看关联核销记录','redemptions','grant_id','核销记录'],
      'code-batches':['查看此批次兑换码记录','codes','batch_id','兑换码记录'],
    }[resource];
    if(deepLink){
      const linkLabel=JSON.stringify(deepLink[0]);
      const href=await evaluate("(()=>{const a=[...document.querySelectorAll('a[href]')].find(e=>e.textContent?.includes("+linkLabel+"));return a?.getAttribute('href')??null})()");
      assert.ok(href?.includes('/'+deepLink[1]+'?'+deepLink[2]+'='+recordId),resource+' detail must link to the exact related records');
      const clicked=await evaluate("(()=>{const a=[...document.querySelectorAll('a[href]')].find(e=>e.textContent?.includes("+linkLabel+"));a?.click();return !!a})()");
      assert.equal(clicked,true,resource+' association link must navigate');
      const targetPath='/'+deepLink[1]+'?'+deepLink[2]+'='+recordId;
      let arrived='';
      for(let n=0;n<75;n++){
        arrived=String(await evaluate('location.hash')??'');
        if(arrived.includes(targetPath))break;
        await sleep(160);
      }
      assert.ok(arrived.includes(targetPath),resource+' must land at its scoped child route: '+arrived);
      await visible(deepLink[3]);
      let value=null;
      for(let n=0;n<70;n++){
        value=await evaluate("(()=>{const a=[...document.querySelectorAll('input')].find(e=>e.value==="+JSON.stringify(recordId)+");return a?.value??null})()");
        if(value===recordId)break;
        await sleep(160);
      }
      assert.equal(value,recordId,resource+' association query must prefill the accurate UUID');
      console.log('NAV_DEEP_LINK PASS '+resource+' -> '+deepLink[1]+' linked record');
    }

    console.log('AUTHENTICATED_DETAIL PASS '+resource);
  }
  } else {
    // The current QA DB has no demo_atlas, demo grants or 48 demo members.
    const realProduct=sql("SELECT id FROM public.products WHERE product_key='aisenlens' AND status='active'");
    assert.match(realProduct,/^[a-f0-9-]{36}$/i);
    await send('Page.navigate',{url:base+'/#/products/'+realProduct+'/show'});
    await visible('产品详情');
    await send('Page.navigate',{url:base+'/#/admins/'+uid+'/show'});
    await visible('管理员资格详情');
    console.log('CLEAN_BASELINE_DETAILS PASS real product and scoped temporary Admin; legacy demo associations N/A');
  }

  await send('Page.navigate',{url:base+'/#/memberships'});
  await visible('精确成员 UUID');
  await visible('条记录');
  // T1: a real sortable column must expose aria-sort AND request a new
  // server-sorted page, rather than rearranging only 20 local rows.
  if (demoBaseline) {
  const initialSort=await evaluate("(()=>{const th=[...document.querySelectorAll('th')].find(e=>e.textContent?.includes('加入日期'));return th?.getAttribute('aria-sort')??null})()");
  assert.equal(initialSort,'descending','membership joined_at defaults to descending');
  const sortClicked=await evaluate("(()=>{const b=[...document.querySelectorAll('.MuiTableSortLabel-root')].find(e=>e.textContent?.includes('加入日期'));b?.click();return !!b})()");
  assert.equal(sortClicked,true,'sortable header is an interactive control');
  // React Query may temporarily replace the table with a loading card.
  // Check the final DOM instead of treating a fixed 600ms delay as an SLA.
  let asc=null,actualDates=[];
  for(let i=0;i<100;i++){
    asc=await evaluate("(()=>{const th=[...document.querySelectorAll('th')].find(e=>e.textContent?.includes('加入日期'));return th?.getAttribute('aria-sort')??null})()");
    actualDates=JSON.parse(await evaluate("JSON.stringify([...document.querySelectorAll('tbody tr')].map(tr=>Date.parse(tr.querySelectorAll('td')[3]?.innerText??'')).filter(n=>Number.isFinite(n)))"));
    if(asc==='ascending'&&actualDates.length>5&&actualDates.every((v,i)=>i===0||v>=actualDates[i-1]))break;
    await sleep(180);
  }
  assert.equal(asc,'ascending','sort direction must become ascending after backend reload');
  assert.ok(actualDates.length>5,'real member rows remain after server-sort');
  assert.ok(actualDates.every((v,i)=>i===0||v>=actualDates[i-1]),'membership joined_at is sorted ascending by backend');
  console.log('T1 PASS real Chrome column sort + aria-sort + ascending server results');
  } else console.log('T1_DEMO_SORT N/A: no synthetic multi-row members exist in sanitized DB');
  // Exact UUID filters should reject malformed input before issuing PostgREST.
  const filterFocused=await evaluate("(()=>{const x=[...document.querySelectorAll('input')].find(e=>e.closest('.MuiFormControl-root')?.textContent?.includes('精确成员 UUID'));x?.focus();return !!x})()");
  assert.equal(filterFocused,true);
  await send('Input.insertText',{text:'invalid-uuid'});
  await visible('请输入完整、有效的 UUID');
  assert.equal(await evaluate("(()=>{const f=[...document.querySelectorAll('form')].find(e=>e.textContent?.includes('精确成员 UUID'));return !!f&&!!f.querySelector('button[type=submit]')?.disabled})()"),true,'malformed UUID cannot be submitted');
  console.log('T1 PASS browser invalid UUID search blocked before backend request');
  await send('Page.navigate',{url:base+'/#/memberships'});
  await visible('精确成员 UUID');
  await evaluate("(()=>{let x=[...document.querySelectorAll('[role=combobox]')].find(e=>e.textContent?.includes('全平台视角'));if(!x)throw Error('Top product scope select missing');x.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));return true;})()");
  await sleep(350);
  const options=await evaluate("[...document.querySelectorAll('[role=option]')].map(e=>e.textContent?.trim())");
  assert.ok(options?.some(s=>s.includes('aisenlens')),'Scope options should show aisenlens');
  await evaluate("(()=>{const x=[...document.querySelectorAll('[role=option]')].find(e=>e.textContent?.includes('aisenlens'));x?.click();return !!x;})()");
  await visible('当前产品暂无成员关系');
  await capture('operator-memberships-scoped-empty-1440.png');
  const resetOpen=await evaluate("(()=>{const x=[...document.querySelectorAll('[role=combobox]')].find(e=>e.getAttribute('aria-label')?.startsWith('切换管理产品范围'));x?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));return !!x})()");
  assert.equal(resetOpen,true,'top scope is the only range switch');
  await sleep(160);
  assert.equal(await evaluate("(()=>{const e=[...document.querySelectorAll('[role=option]')].find(x=>x.textContent?.includes('全平台视角'));e?.click();return !!e})()"),true,'top scope reset');
  await visible('条记录');
  const globalMemberText=await evaluate('document.body.innerText');
  const globalMemberCount=Number(globalMemberText.match(/共\s*(\d+)\s*条记录/)?.[1]??0);
  assert.equal(globalMemberCount,Number(sql('SELECT count(*) FROM public.product_memberships')),'global member count must match actual DB');
  console.log('SCOPED_EMPTY_RECOVERY PASS aisenlens -> 全平台 '+globalMemberCount+' records');
  // UI-05: rapidly change scopes while requests are in flight. A late result
  // for the previous scope must never be presented as current data.
  async function selectWorkScope(label){
    const opened=await evaluate("(()=>{const x=[...document.querySelectorAll('[role=combobox]')].find(e=>e.getAttribute('aria-label')?.startsWith('切换管理产品范围'));x?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));return !!x})()");
    assert.equal(opened,true,'UI05 selector stays actionable after scope changes');
    await sleep(140);
    const clicked=await evaluate("(()=>{const x=[...document.querySelectorAll('[role=option]')].find(e=>e.textContent?.includes("+JSON.stringify(label)+"));x?.click();return !!x})()");
    assert.equal(clicked,true,'UI05 target scope '+label+' selectable');
  }
  await selectWorkScope('aisenlens');
  await selectWorkScope('全平台视角');
  await selectWorkScope('aisenlens');
  await visible('当前产品暂无成员关系');
  if(globalMemberCount>0) assert.equal(await evaluate("document.body?.innerText.includes('共 "+globalMemberCount+" 条记录')"),false,
    'UI05 stale global records must not be rendered into empty product scope');
  await selectWorkScope('全平台视角');
  await visible('共 '+globalMemberCount+' 条记录');
  console.log('UI05_RAPID_SCOPE PASS latest scope selected and prior rows not misattributed');


  await send('Page.navigate',{url:base+'/#/users'});
  await visible('请输入邮箱查找账号');
  const focus=await evaluate("(()=>{const x=document.querySelector('input[type=text]');if(x){x.focus();return x.outerHTML.slice(0,180)}return null;})()");
  assert.ok(focus,'User lookup input must be focusable');
  await send('Input.insertText',{text:email});
  await evaluate("document.querySelector('button[type=submit]')?.click()");
  await visible(email);
  await visible('共 1 条记录');
  await capture('operator-users-exact-lookup-1440.png');
  console.log('EXACT_IDENTITY_LOOKUP PASS real RPC email search');
  await send('Page.navigate',{url:base+'/#/memberships'});
  await visible('精确成员 UUID');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await sleep(250);
  const memberMobile=await evaluate('Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-document.documentElement.clientWidth');
  assert.ok(memberMobile<=12,'memberships mobile document overflow '+memberMobile);
  await capture('operator-memberships-390.png');

  } else console.log('ADMIN_NAVIGATION_SKIPPED operations-only slice; previous navigation acceptance is independent');
  if(qaPhase!=='navigation'){
  // Isolated real write E2E: temporary QA-owned product only; never change demo rows.
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base+'/#/products/create'});
  await visible('建立新产品');
  assert.equal(await evaluate("(()=>{const x=document.querySelector('[name=product-name]');x?.focus();return !!x})()"),true);
  await send('Input.insertText',{text:'浏览器验收 · 临时产品'});
  assert.equal(await evaluate("(()=>{const x=document.querySelector('[name=product-key]');x?.focus();return !!x})()"),true);
  await send('Input.insertText',{text:qaProductKey});
  assert.equal(await evaluate("document.querySelector('[name=product-key]')?.value"),qaProductKey);
  const allowed=await evaluate("(()=>{const x=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('确认创建草稿产品'));return x&&!x.disabled})()");
  assert.equal(allowed,true,'QA product creation submit enabled');
  await evaluate("(()=>{[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('确认创建草稿产品'))?.click()})()");
  // The create form itself mentions '产品详情' in a step label; do not
  // mistake that instruction for successful navigation after a slow RPC.
  let createdHash='';
  for(let i=0;i<80;i++){
    createdHash=String(await evaluate('location.hash')??'');
    if(/^#\/products\/[0-9a-f-]{36}\/show$/i.test(createdHash))break;
    await sleep(200);
  }
  assert.match(createdHash,/^#\/products\/[0-9a-f-]{36}\/show$/i,
    'create must navigate to the server-confirmed product detail, not just display a step label');
  qaProductId=sql("SELECT id FROM public.products WHERE product_key='"+qaProductKey+"'");
  assert.match(qaProductId,/^[a-f0-9-]{36}$/i);
  assert.ok(createdHash.includes(qaProductId),'displayed product must match committed database row');
  await visible('产品详情');
  assert.equal(sql("SELECT status FROM public.products WHERE id='"+qaProductId+"'"),'draft');
  console.log('PROTECTED_WRITE PASS UI admin_create_product with new draft');
  await capture('operator-product-created-qa-1440.png');
  // Verify a protected RPC through the actual dialog, including reason and audit.
  assert.equal(await evaluate("(()=>{const x=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('恢复运行'));x?.click();return !!x})()"),true);
  await visible('操作理由');
  await axeAudit('product-danger-dialog');
  const verifyDialog=await evaluate("document.querySelector('[role=dialog]')?.innerText.includes("+JSON.stringify(qaProductId)+")");
  assert.equal(verifyDialog,true,'dialog should identify precise target record');
  const reasonFocused=await evaluate("(()=>{const x=document.querySelector('[role=dialog] textarea');x?.focus();return !!x})()");
  assert.equal(reasonFocused,true);
  await send('Input.insertText',{text:'隔离本地浏览器验收，结束后清理'});
  assert.equal(await evaluate("(()=>{const x=[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent?.includes('确认提交'));x?.click();return !!x})()"),true);
  for(let k=0;k<50&&sql("SELECT status FROM public.products WHERE id='"+qaProductId+"'")!=='active';k++)await sleep(180);
  assert.equal(sql("SELECT status FROM public.products WHERE id='"+qaProductId+"'"),'active');
  assert.equal(sql("SELECT count(*) FROM public.admin_audit_log WHERE actor_user_id='"+uid+"' AND target_id='"+qaProductId+"' AND action='product.status' AND reason='隔离本地浏览器验收，结束后清理'"),'1');
  console.log('PROTECTED_WRITE PASS dialog reason -> admin_set_product_status -> audit');



  // X07: actual join and both reversible suspension paths on the temporary QA member.
  const joinedMember=await api('/rest/v1/rpc/ensure_membership','POST',{p_product_key:qaProductKey},level.access_token);
  assert.ok(joinedMember,'real member creation response');
  const membershipId=sql("SELECT id FROM public.product_memberships WHERE user_id='"+uid+"' AND product_id='"+qaProductId+"'");
  assert.match(membershipId,/^[a-f0-9-]{36}$/i);
  async function memberTransition(button,expected,previous){
    await send('Page.navigate',{url:base+'/#/memberships/'+membershipId+'/show'});
    await visible('成员详情');
    const clicked=await evaluate("(()=>{const x=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes("+JSON.stringify(button)+"));if(x)x.click();return !!x})()");
    assert.equal(clicked,true,button+' action exists');
    await visible('操作理由');
    const disabled=await evaluate("(()=>{const x=[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent?.includes('确认提交'));return !!x&&x.disabled})()");
    assert.equal(disabled,true,'reason is required');
    assert.equal(await evaluate("(()=>{const x=document.querySelector('[role=dialog] textarea');x?.focus();return !!x})()"),true);
    await send('Input.insertText',{text:'隔离成员生命周期验收'});
    await evaluate("(()=>{[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent?.includes('确认提交'))?.click()})()");
    for(let i=0;i<45;i++){
      if(sql("SELECT status FROM public.product_memberships WHERE id='"+membershipId+"'")===expected)break;
      await sleep(220);
    }
    assert.equal(sql("SELECT status FROM public.product_memberships WHERE id='"+membershipId+"'"),expected);
    assert.equal(sql("SELECT coalesce(pre_suspend_status,'') FROM public.product_memberships WHERE id='"+membershipId+"'"),previous);
  }
  await memberTransition('暂停成员','suspended','active');
  await memberTransition('解除暂停','active','');
  await api('/rest/v1/rpc/leave_product','POST',{p_product_key:qaProductKey},level.access_token);
  assert.equal(sql("SELECT status FROM public.product_memberships WHERE id='"+membershipId+"'"),'left');
  await memberTransition('暂停成员','suspended','left');
  await memberTransition('解除暂停','left','');
  assert.equal(sql("SELECT count(*) FROM public.membership_events WHERE membership_id='"+membershipId+"' AND actor_type='admin' AND action IN ('suspend','restore')"),'4');
  console.log('X07 PASS true AAL2 admin UI active/suspended/active and left/suspended/left, events preserved');

  if(qaPhase!=='operations-issuance' && qaPhase!=='operations-responsive' && qaPhase!=='operations-feedback'){
  // A second real write using the dedicated Pro form and a temporary QA actor/product.
  await send('Page.navigate',{url:base+'/#/grant-new?user_id='+uid});
  await visible('授予 Pro 权益');
  await visible('目标产品');
  const selectedProduct=await evaluate("(()=>{const x=[...document.querySelectorAll('[role=combobox]')].find(e=>e.closest('.MuiFormControl-root')?.textContent?.includes('目标产品'));x?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));return !!x})()");
  assert.equal(selectedProduct,true,'Grant product picker is interactive');
  await sleep(240);
  const clickedProduct=await evaluate("(()=>{const x=[...document.querySelectorAll('[role=option]')].find(e=>e.textContent?.includes("+JSON.stringify(qaProductKey)+"));x?.click();return !!x})()");
  assert.equal(clickedProduct,true,'New QA product option selectable');
  const grantReason=await evaluate("(()=>{const x=document.querySelector('textarea');x?.focus();return !!x})()");
  assert.equal(grantReason,true,'Grant reason input');
  await send('Input.insertText',{text:'浏览器 Pro 授权验收'});
  const grantSubmit=await evaluate("(()=>{const x=[...document.querySelectorAll('button')].find(e=>e.textContent?.includes('确认授予 Pro'));const allowed=!!x&&!x.disabled;if(allowed)x.click();return allowed})()");
  assert.equal(grantSubmit,true,'Grant form valid inputs');
  await visible('授权已确认 · 编号');
  assert.equal(sql("SELECT count(*) FROM public.entitlement_grants WHERE user_id='"+uid+"' AND product_id='"+qaProductId+"' AND source_type='admin' AND created_by='"+uid+"' AND requested_duration_days=30"),'1');
  assert.equal(sql("SELECT count(*) FROM public.admin_audit_log WHERE actor_user_id='"+uid+"' AND action='grant.create' AND target_id IN (SELECT id FROM public.entitlement_grants WHERE user_id='"+uid+"' AND product_id='"+qaProductId+"')"),'1');
  console.log('PROTECTED_WRITE PASS UI admin_grant_entitlement 30-day Pro with audit');



  // B1: Pro grant UNKNOWN uses the ORIGINAL actor/request_id/parameters across
  // page reload. Simulate HTTP 503 before backend commit, then simulate the
  // original backend request committing while the browser still sees UNKNOWN.
  await send('Page.navigate',{url:base+'/#/grant-new?user_id='+uid});
  await visible('授予 Pro 权益');
  assert.equal(await evaluate("(()=>{const x=[...document.querySelectorAll('[role=combobox]')].find(e=>e.closest('.MuiFormControl-root')?.textContent?.includes('目标产品'));x?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));return !!x})()"),true);
  await sleep(220);
  assert.equal(await evaluate("(()=>{const x=[...document.querySelectorAll('[role=option]')].find(e=>e.textContent?.includes("+JSON.stringify(qaProductKey)+"));x?.click();return !!x})()"),true);
  assert.equal(await evaluate("(()=>{const x=document.querySelector('textarea');x?.focus();return !!x})()"),true);
  await send('Input.insertText',{text:'Pro 幂等故障注入验收'});
  const grantCountBefore=Number(sql("SELECT count(*) FROM public.entitlement_grants WHERE user_id='"+uid+"' AND product_id='"+qaProductId+"' AND source_type='admin'"));
  await send('Fetch.enable',{patterns:[{urlPattern:'*://127.0.0.1:55321/rest/v1/rpc/admin_grant_entitlement*',requestStage:'Request'}]});
  injectedFault={status:503,used:false,rpc:'admin_grant_entitlement'};
  assert.equal(await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent?.includes('确认授予 Pro'));const ok=!!b&&!b.disabled;if(ok)b.click();return ok})()"),true);
  for(let i=0;i<65&&!injectedFault.used;i++)await sleep(120);
  assert.equal(injectedFault.used,true,'Chrome intercepted real Pro grant RPC');
  await send('Fetch.disable'); injectedFault=null;
  await visible('有待核实的授权请求');
  const grantPendingRaw=await evaluate("sessionStorage.getItem('aisencore.grant.pending.v1')");
  assert.ok(grantPendingRaw,'503 must retain exact original Grant request in tab session');
  const originalGrant=JSON.parse(grantPendingRaw);
  assert.equal(originalGrant.actorId,uid);
  assert.equal(originalGrant.request.p_product_id,qaProductId);
  assert.equal(Number(sql("SELECT count(*) FROM public.entitlement_grants WHERE user_id='"+uid+"' AND product_id='"+qaProductId+"' AND source_type='admin'")),grantCountBefore,'503 before commit cannot write a Grant');
  // Query original request before retry: 503 means UNKNOWN, not safe to write.
  const inspectAbsent=await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent?.includes('只读核查原请求'));const ok=!!b&&!b.disabled;if(ok)b.click();return ok})()");
  assert.equal(inspectAbsent,true,'readonly grant inspection available');
  await visible('没有找到原请求');
  await visible('以原请求编号重试');
  assert.equal(Number(sql("SELECT count(*) FROM public.entitlement_grants WHERE user_id='"+uid+"' AND product_id='"+qaProductId+"' AND source_type='admin'")),grantCountBefore,'readonly check writes nothing');
  // The server then commits before the browser refreshes, demonstrating
  // why inspecting again is mandatory and why no duplicate write is needed.
  const committed=await api('/rest/v1/rpc/admin_grant_entitlement','POST',originalGrant.request,session.access_token);
  assert.ok(committed.grant_id,'original server-side grant commit');
  const grantSource='admin:'+uid+':'+originalGrant.request.p_request_id;
  assert.equal(sql("SELECT count(*) FROM public.entitlement_grants WHERE source_type='admin' AND source_ref='"+grantSource+"'"),'1');
  await send('Page.reload',{ignoreCache:true});
  await visible('有待核实的授权请求');
  assert.equal(await evaluate("document.body.innerText.includes('以原请求编号重试')"),false,'refresh invalidates prior absence result');
  const inspectCommitted=await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent?.includes('只读核查原请求'));const ok=!!b&&!b.disabled;if(ok)b.click();return ok})()");
  assert.equal(inspectCommitted,true,'readonly inspection available after reload');
  await visible('授权已确认 · 编号');
  assert.equal(await evaluate("sessionStorage.getItem('aisencore.grant.pending.v1')"),null,'successful replay clears metadata');
  assert.equal(Number(sql("SELECT count(*) FROM public.entitlement_grants WHERE user_id='"+uid+"' AND product_id='"+qaProductId+"' AND source_type='admin'")),grantCountBefore+1,'replay cannot duplicate Grant');
  assert.equal(sql("SELECT count(*) FROM public.entitlement_grants WHERE source_type='admin' AND source_ref='"+grantSource+"'"),'1');
  console.log('B1 PASS Pro 503 UNKNOWN, readonly absent/present recovery, no replay or duplicate');

  // B1: HTTP 429 is known rejection. It cannot be mistaken for an unknown grant.
  await send('Page.navigate',{url:base+'/#/grant-new?user_id='+uid});
  await visible('授予 Pro 权益');
  assert.equal(await evaluate("(()=>{const x=[...document.querySelectorAll('[role=combobox]')].find(e=>e.closest('.MuiFormControl-root')?.textContent?.includes('目标产品'));x?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));return !!x})()"),true);
  await sleep(220);
  assert.equal(await evaluate("(()=>{const x=[...document.querySelectorAll('[role=option]')].find(e=>e.textContent?.includes("+JSON.stringify(qaProductKey)+"));x?.click();return !!x})()"),true);
  assert.equal(await evaluate("(()=>{const x=document.querySelector('textarea');x?.focus();return !!x})()"),true);
  await send('Input.insertText',{text:'Pro 429 已知拒绝验收'});
  const beforeGrant429=Number(sql("SELECT count(*) FROM public.entitlement_grants WHERE user_id='"+uid+"' AND product_id='"+qaProductId+"' AND source_type='admin'"));
  await send('Fetch.enable',{patterns:[{urlPattern:'*://127.0.0.1:55321/rest/v1/rpc/admin_grant_entitlement*',requestStage:'Request'}]});
  injectedFault={status:429,used:false,rpc:'admin_grant_entitlement'};
  assert.equal(await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent?.includes('确认授予 Pro'));const ok=!!b&&!b.disabled;if(ok)b.click();return ok})()"),true);
  for(let i=0;i<65&&!injectedFault.used;i++)await sleep(120);
  assert.equal(injectedFault.used,true,'known 429 intercepted for Pro RPC');
  await send('Fetch.disable'); injectedFault=null;
  let knownGrantRejected=false;
  for(let i=0;i<50;i++){
    knownGrantRejected=await evaluate("sessionStorage.getItem('aisencore.grant.pending.v1')===null && !document.body.innerText.includes('有待核实的授权请求')");
    if(knownGrantRejected)break;
    await sleep(120);
  }
  assert.equal(knownGrantRejected,true,'429 clears pending Grant and does not enter UNKNOWN');
  assert.equal(Number(sql("SELECT count(*) FROM public.entitlement_grants WHERE user_id='"+uid+"' AND product_id='"+qaProductId+"' AND source_type='admin'")),beforeGrant429);
  console.log('B1 PASS real Chrome Pro 429 known rejection clears pending without Grant write');

  // T1: exercise the real User360 page-2 server query using ONLY grants
  // issued to this temporary QA account/product. Cleanup below deletes them.
  // No demo or persistent administrator rows are modified.
  const paginationGrants=21;
  for(let i=0;i<paginationGrants;i++){
    const requestId='qa_page_'+randomBytes(10).toString('hex');
    await api('/rest/v1/rpc/admin_grant_entitlement','POST',{
      p_target_user_id:uid,p_product_id:qaProductId,p_tier:'pro',p_mode:'duration',
      p_duration_days:1,p_starts_at:null,p_ends_at:null,p_is_lifetime:false,
      p_reason:'隔离测试用户综合视图翻页',p_request_id:requestId,
    },session.access_token);
  }
  const expectedGrantTotal=beforeGrant429+paginationGrants;
  assert.equal(Number(sql("SELECT count(*) FROM public.entitlement_grants WHERE user_id='"+uid+"' AND product_id='"+qaProductId+"' AND source_type='admin'")),expectedGrantTotal);
  await send('Page.navigate',{url:base+'/#/users/'+uid+'/show'});
  await visible('用户编号');
  await visible('授权历史第 1 页，共 '+expectedGrantTotal+' 条');
  const secondGrantPage=await evaluate("(()=>{const nav=[...document.querySelectorAll('nav[aria-label]')].find(e=>e.getAttribute('aria-label')==='授权历史列表分页');const b=[...(nav?.querySelectorAll('button')??[])].find(e=>e.textContent?.trim()==='2');b?.click();return !!b})()");
  assert.equal(secondGrantPage,true,'User360 second-page control must be clickable');
  await visible('授权历史第 2 页，共 '+expectedGrantTotal+' 条');
  await sleep(400);
  const pageTwoRows=await evaluate("(()=>{const card=[...document.querySelectorAll('.MuiCard-root')].filter(e=>e.textContent?.includes('授权历史第 2 页')).at(-1);return card?.querySelectorAll('.MuiChip-root').length??-1})()");
  assert.equal(pageTwoRows,expectedGrantTotal-20,'User360 second page must actually render the remaining server-paginated Grant rows');
  console.log('T1 PASS real User360 server pagination >20 grants, page2 accessible, all QA grants safely scoped');
  // User360 action dialogs retain the user's context and verified identity.
  for(const [trigger,title] of [['平台账号与管理员权限操作','平台账号操作'],
      ['为此用户新建 Pro 授权','新增 Pro 授权']]){
    const route=await evaluate('location.hash');
    assert.equal(await evaluate("(()=>{const a=[...document.querySelectorAll('.RaLayout-content a[href]')].find(e=>e.textContent?.includes("+JSON.stringify(trigger)+"));a?.click();return !!a})()"),true,'User360 operation link '+trigger);
    await visible(title);
    await visible('目标用户 UUID');
    assert.equal(await evaluate("document.querySelectorAll('[role=dialog]').length"),1,'User360 operation one dialog');
    assert.equal(await evaluate('location.hash'),route,'User360 remains the background route');
    let prefilled=null;
    for(let i=0;i<45;i++){
      prefilled=await evaluate("document.querySelector('[role=dialog] input')?.value??null");
      if(prefilled===uid)break;
      await sleep(120);
    }
    assert.equal(prefilled,uid,'User360 operation must prefill the exact UUID');
    if(title==='平台账号操作')await visible(email);
    await send('Runtime.evaluate',{expression:axeBundle});
    await axeAudit('user360-'+(title==='平台账号操作'?'account':'grant')+'-dialog');
    await evaluate("(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(e=>e.getAttribute('aria-label')==='关闭操作窗口');b?.click()})()");
    for(let i=0;i<35;i++){
      if(await evaluate("document.querySelectorAll('[role=dialog]').length")===0)break;
      await sleep(100);
    }
    assert.equal(await evaluate("document.querySelectorAll('[role=dialog]').length"),0,'User360 modal dismissed');
    assert.equal(await evaluate('location.hash'),route,'User360 stays visible after closing');
    console.log('OPERATION_USER360 PASS '+title+' prefilled UUID + retained context');
  }


  } else console.log('ADMIN_GRANTS_SLICE_SKIPPED');
  if(qaPhase==='operations-issuance'){
    // Seed only the one QA-scoped grant needed by later revoke-detail tests.
    // Its browser grant/UNKNOWN behavior belongs exclusively to the grants slice.
    const seed=await api('/rest/v1/rpc/admin_grant_entitlement','POST',{
      p_target_user_id:uid,p_product_id:qaProductId,p_tier:'pro',p_mode:'duration',
      p_duration_days:30,p_starts_at:null,p_ends_at:null,p_is_lifetime:false,
      p_reason:'QA issuer detail requires one owned grant',
      p_request_id:'qa_issuer_'+randomBytes(10).toString('hex'),
    },session.access_token);
    assert.ok(seed.grant_id,'Issuer requires its own QA scoped grant');
  }
  if(qaPhase!=='operations-grants' && qaPhase!=='operations-responsive' && qaPhase!=='operations-feedback'){
  // Protected issuance: assert plaintext appears only in first-response modal,
  // never print/capture/export the actual secret code in QA artifacts.
  async function openIssuanceFromList(){
    // The issuance list can be genuinely empty on the owner's sanitized DB.
    await visible('准确请求编号');
    // The route and lazy-loaded list action can become visible in different frames.
    // Wait for the actual action rather than treating a table header as page readiness.
    let opened=false;
    for(let i=0;i<40&&!opened;i++){
      opened=await evaluate("(()=>{const a=[...document.querySelectorAll('.RaLayout-content a[href]')].find(e=>e.textContent?.trim()==='发行兑换码');a?.click();return !!a})()");
      if(!opened)await sleep(150);
    }
    assert.equal(opened,true,'issuance opens from batch list');
    await visible('目标产品');
    assert.equal(await evaluate("document.querySelectorAll('[role=dialog]').length"),1,
      'issuance modal has a single root');
    assert.ok((await evaluate('location.hash')).includes('/code-batches'),
      'issuance preserves the batch list background');
  }
  await send('Page.navigate',{url:base+'/#/code-batches'});
  await openIssuanceFromList();
  const chosenForIssue=await evaluate("(()=>{const x=[...document.querySelectorAll('[role=combobox]')].find(e=>e.closest('.MuiFormControl-root')?.textContent?.includes('目标产品'));x?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));return !!x})()");
  assert.equal(chosenForIssue,true,'Issuance target product dropdown is interactive');
  await sleep(240);
  const issueTargetSelected=await evaluate("(()=>{const x=[...document.querySelectorAll('[role=option]')].find(e=>e.textContent?.includes("+JSON.stringify(qaProductKey)+"));x?.click();return !!x})()");
  assert.equal(issueTargetSelected,true,'Issuance target product selectable');
  const issueBtn=await evaluate("(()=>{const x=[...document.querySelectorAll('button')].find(e=>e.textContent?.includes('确认创建兑换码'));const ok=!!x&&!x.disabled;if(ok)x.click();return ok})()");
  assert.equal(issueBtn,true,'Issuance form valid product/quantity');
  await visible('兑换码已成功创建');
  await sleep(350);
  assert.equal(await evaluate("document.querySelectorAll('[role=dialog]').length"),1,
    'one-time code result must remain inside the same root dialog');
  assert.equal(await evaluate("(()=>{const b=document.querySelector('[role=dialog] button[aria-label=关闭操作窗口]');b?.click();return !!b})()"),true,
    'close control exists even while plaintext needs protection');
  await visible('兑换码明文尚未确认安全保存');
  assert.equal(await evaluate("document.querySelectorAll('[role=dialog]').length"),1,
    'plaintext cannot be dismissed before explicit safe-save acknowledgement');
  await evaluate("(()=>{[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent?.includes('继续操作'))?.click()})()");
  console.log('ISSUE_MODAL_GUARD PASS single dialog, plaintext close requires acknowledgement');
  const codeRendered=await evaluate("(()=>{const pre=document.querySelector('[role=dialog] pre');return !!pre && (pre.textContent?.trim().length??0)>12})()");
  assert.equal(codeRendered,true,'one-time plaintext displayed exactly at issuance');
  assert.equal(sql("SELECT count(*) FROM public.redemption_code_batches WHERE created_by='"+uid+"' AND product_id='"+qaProductId+"' AND quantity=1"),'1');
  assert.equal(sql("SELECT count(*) FROM public.redemption_codes WHERE created_by='"+uid+"' AND product_id='"+qaProductId+"'"),'1');
  assert.equal(sql("SELECT count(*) FROM public.admin_audit_log WHERE actor_user_id='"+uid+"' AND action='code.create' AND target_id IN (SELECT id FROM public.redemption_code_batches WHERE created_by='"+uid+"' AND product_id='"+qaProductId+"')"),'1');

  // X12: download ephemeral secrets only into the Chrome QA temporary profile.
  const qaDownloadDir=join(profile,'downloads');
  mkdirSync(qaDownloadDir,{recursive:true});
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:qaDownloadDir});
  for(const label of ['下载 TXT','下载 CSV']){
    const clicked=await evaluate("(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent?.includes("+JSON.stringify(label)+"));b?.click();return !!b})()");
    assert.equal(clicked,true,label+' export button');
  }
  const txtPath=join(qaDownloadDir,'aisencore-issued-codes.txt');
  const csvPath=join(qaDownloadDir,'aisencore-issued-codes.csv');
  qaSecretDownloadPaths.push(txtPath,csvPath);
  for(let i=0;i<65&&(!existsSync(txtPath)||!existsSync(csvPath));i++)await sleep(100);
  assert.ok(existsSync(txtPath)&&existsSync(csvPath),'real Chrome TXT and UTF-8 CSV downloads');
  const qaTextCode=readFileSync(txtPath,'utf8').trim();
  const qaCsv=readFileSync(csvPath,'utf8');
  assert.ok(qaTextCode.length>12&&qaCsv.startsWith('\uFEFF序号,兑换码\r\n')&&qaCsv.includes('"'+qaTextCode+'"'),
    'Downloaded CSV and TXT match the first-response secret; never log value');
  const persistentLeak=JSON.parse(await evaluate(
    "(()=>{const p=document.querySelector('[role=dialog] pre')?.textContent?.trim();return JSON.stringify({storage:!!p&&Object.values(localStorage).concat(Object.values(sessionStorage)).some(v=>v.includes(p)),url:!!p&&location.href.includes(p)})})()"));
  assert.equal(persistentLeak.storage,false,'plaintext must never persist in web storage');
  assert.equal(persistentLeak.url,false,'plaintext must never appear in URL');
  // Windows may lock Chrome's profile metadata long after process shutdown.
  // Delete code-bearing downloads immediately after asserting their content,
  // not merely as a side effect of final profile removal.
  for(const filename of qaSecretDownloadPaths)rmSync(filename,{force:true,maxRetries:12,retryDelay:100});
  assert.ok(qaSecretDownloadPaths.every(filename=>!existsSync(filename)),'QA plaintext downloads wiped immediately');
  console.log('X12 PASS real Chrome TXT+CSV download, UTF-8 BOM, no persistent leak; secret files wiped');

  assert.equal(await evaluate("(()=>{const x=document.querySelector('[role=dialog] input[type=checkbox]');x?.click();return !!x})()"),true,'operator acknowledges one-time secret');
  await sleep(130);
  const closed=await evaluate("(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent?.includes('清除明文并关闭'));const allowed=!!b&&!b.disabled;if(allowed)b.click();return allowed})()");
  assert.equal(closed,true,'plaintext close guarded by checkbox');
  await sleep(560); // MUI Dialog remains in the DOM while its exit animation runs.
  const cleaned=JSON.parse(await evaluate("JSON.stringify({dialogWiped:![...document.querySelectorAll('[role=dialog] pre')].some(e=>e.textContent?.trim()),pendingWiped:sessionStorage.getItem('aisencore.issuance.pending.v1')===null})"));
  assert.equal(cleaned.dialogWiped,true,'plaintext must be blank after acknowledgement');
  assert.equal(cleaned.pendingWiped,true,'successful issuance must remove pending metadata');
  console.log('PROTECTED_WRITE PASS UI issuance first-response-only code, audit, clear-secret modal; no plaintext logged');



  // X13: reproduce a pending UNKNOWN operation after reload; reconcile existing
  // and nonexistent request IDs without guessing or exposing old plaintext.
  const pendingKey='aisencore.issuance.pending.v1';
  const originalId=sql("SELECT request_id FROM public.redemption_code_batches WHERE created_by='"+uid+"' AND product_id='"+qaProductId+"' ORDER BY created_at LIMIT 1");
  assert.ok(originalId);
  const makePending=(requestId)=>JSON.stringify({requestId,productId:qaProductId,quantity:1,
    duration:30,maxRedemptions:1,expiresAt:null,note:null,startedAt:Date.now()});
  await evaluate("sessionStorage.setItem("+JSON.stringify(pendingKey)+","+JSON.stringify(makePending(originalId))+")");
  await send('Page.reload',{ignoreCache:true});
  await openIssuanceFromList();
  await visible('有待核实的发码请求');
  const inspect=await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent?.includes('核对批次状态'));b?.click();return !!b})()");
  assert.equal(inspect,true,'UNKNOWN reconciliation button');
  await visible('批次已存在，但明文不可恢复');
  const replay=await api('/rest/v1/rpc/admin_create_codes','POST',{
    p_product_id:qaProductId,p_tier:'pro',p_quantity:1,p_grant_duration_days:30,
    p_is_lifetime:false,p_max_redemptions_per_code:1,p_code_expires_at:null,
    p_request_id:originalId,p_note:null,
  },level.access_token);
  assert.equal(replay.idempotent_replay,true);
  assert.equal(replay.plaintext_available,false,'duplicate idempotent request has no old code');
  assert.equal(replay.codes.length,0);
  await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent?.includes('撤销已有批次'));b?.click();return !!b})()");
  await visible('撤销已创建的整批兑换码');
  assert.equal(await evaluate("document.querySelectorAll('[role=dialog]').length"),1,
    'UNKNOWN batch revoke is an inline step, never nested dialogs');
  assert.equal(await evaluate("(()=>{const x=[...document.querySelectorAll('[role=dialog] input')].at(-1);x?.focus();return !!x})()"),true);
  await send('Input.insertText',{text:'浏览器 UNKNOWN 批次核查撤销'});
  await evaluate("(()=>{[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent?.includes('明确撤销批次'))?.click()})()");
  for(let i=0;i<40;i++){
    if(sql("SELECT count(*) FROM public.redemption_codes WHERE created_by='"+uid+"' AND product_id='"+qaProductId+"' AND revoked_at IS NOT NULL")==='1')break;
    await sleep(170);
  }
  assert.equal(sql("SELECT count(*) FROM public.redemption_codes WHERE created_by='"+uid+"' AND product_id='"+qaProductId+"' AND revoked_at IS NOT NULL"),'1');
  await visible('旧批次已撤销');
  await evaluate("(()=>{[...document.querySelectorAll('button')].find(e=>e.textContent?.includes('另行开始新请求'))?.click()})()");
  assert.equal(await evaluate("sessionStorage.getItem("+JSON.stringify(pendingKey)+")"),null);

  // Negative reconciliation => retry with SAME original request id, not a fresh one.
  const absentId='qa_absent_'+randomBytes(9).toString('hex');
  await evaluate("sessionStorage.setItem("+JSON.stringify(pendingKey)+","+JSON.stringify(makePending(absentId))+")");
  await send('Page.reload',{ignoreCache:true});
  await openIssuanceFromList();
  await visible('有待核实的发码请求');
  await evaluate("(()=>{[...document.querySelectorAll('button')].find(e=>e.textContent?.includes('核对批次状态'))?.click()})()");
  await visible('未查询到相同请求编号');
  await evaluate("(()=>{[...document.querySelectorAll('button')].find(e=>e.textContent?.includes('以相同编号重试'))?.click()})()");
  await visible('兑换码已成功创建');
  assert.equal(sql("SELECT count(*) FROM public.redemption_code_batches WHERE created_by='"+uid+"' AND product_id='"+qaProductId+"'"),'2');
  assert.equal(sql("SELECT count(*) FROM public.redemption_code_batches WHERE created_by='"+uid+"' AND product_id='"+qaProductId+"' AND request_id='"+absentId+"'"),'1');
  assert.equal(await evaluate("(()=>{const b=document.querySelector('[role=dialog] input[type=checkbox]');b?.click();return !!b})()"),true);
  await sleep(180);
  await evaluate("(()=>{[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent?.includes('清除明文并关闭'))?.click()})()");
  await sleep(560);
  assert.equal(await evaluate("sessionStorage.getItem("+JSON.stringify(pendingKey)+")"),null);
  console.log('X13 PASS persisted UNKNOWN -> existing/replay no secret -> batch revoke; absent original-ID retry creates once');

  // X03/X15/X16: ordinary QA identity, AAL1 denial and guarded account workflows.
  const qaOrdEmail='ordinary-uiqa-'+randomUUID().slice(0,12)+'@aisencore.test';
  const qaOrdPassword='OrdinaryUiQa!'+randomBytes(13).toString('base64url');
  const qaPerson=await api('/auth/v1/admin/users','POST',
    {email:qaOrdEmail,password:qaOrdPassword,email_confirm:true},null,true);
  qaOrdUserId=qaPerson.id;
  assert.match(qaOrdUserId,/^[a-f0-9-]{36}$/i);
  const ordinary=await api('/auth/v1/token?grant_type=password','POST',
    {email:qaOrdEmail,password:qaOrdPassword});
  const unauthorizedCall=async(token,label)=>{
    let status=0;
    try{await api('/rest/v1/rpc/admin_lookup_users','POST',
      {p_user_ids:[qaOrdUserId],p_page:1,p_per_page:1},token);}
    catch(error){status=Number(String(error.message).split('HTTP ')[1]?.slice(0,3));}
    assert.equal(status,403,label+' must be rejected by PostgREST');
  };
  await unauthorizedCall(ordinary.access_token,'ordinary AAL1');
  await unauthorizedCall(signin.access_token,'admin AAL1');
  console.log('X03 PASS real ordinary and admin AAL1 tokens cannot call privileged RPC');
  async function accountAction(name,expectedSql){
    await send('Page.navigate',{url:base+'/#/account-actions?user_id='+qaOrdUserId});
    await visible('平台账号操作');
    await visible(qaOrdEmail);
    await visible('当前状态：平台账号');
    const opened=await evaluate("(()=>{const x=[...document.querySelectorAll('[role=combobox]')].find(e=>e.closest('.MuiFormControl-root')?.textContent?.includes('管理操作')) ?? [...document.querySelectorAll('[role=combobox]')].at(-1);x?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));return !!x})()");
    assert.equal(opened,true,'Account action combobox');
    await sleep(150);
    const selected=await evaluate("(()=>{const x=[...document.querySelectorAll('[role=option]')].find(e=>e.textContent?.includes("+JSON.stringify(name)+"));x?.click();return !!x})()");
    assert.equal(selected,true,'Account action '+name+' selectable');
    const form=await evaluate("(()=>{const x=[...document.querySelectorAll('textarea')].find(x=>!x.closest('[role=dialog]'));x?.focus();return !!x})()");
    assert.equal(form,true,'Account reason entry');
    await send('Input.insertText',{text:'隔离身份治理自动验收'});
    const reviewed=await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('核对目标与操作'));const ok=!!b&&!b.disabled;if(ok)b.click();return ok})()");
    assert.equal(reviewed,true,'Account review gating');
    const summary=await visible('请核对后单独提交');
    const transitions={
      '封禁平台账号':'未封禁 → 已封禁',
      '解除平台封禁':'已封禁 → 未封禁',
      '授予平台管理员资格':'无有效管理员资格 → 有效平台管理员',
      '撤销平台管理员资格':'有效平台管理员 → 无有效管理员资格',
    };
    assert.ok(summary.includes('作用范围：全平台，不受顶部产品筛选影响。'),
      'high-risk confirmation must state global impact');
    assert.ok(summary.includes(transitions[name]),
      'high-risk confirmation must show verified before/after status for '+name);
    assert.ok(summary.includes(qaOrdEmail),
      'high-risk confirmation must identify the verified target account');
    const submitted=await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('提交管理操作'));const ok=!!b&&!b.disabled;if(ok)b.click();return ok})()");
    assert.equal(submitted,true,'Reviewed account submission');
    for(let i=0;i<48;i++){
      if(sql(expectedSql)==='1')break;
      await sleep(200);
    }
    assert.equal(sql(expectedSql),'1',name+' expected state');
  }
  await accountAction('封禁平台账号',"SELECT count(*) FROM public.platform_account_restrictions WHERE user_id='"+qaOrdUserId+"' AND kind='blocked'");
  assert.equal((await api('/rest/v1/rpc/check_access','POST',
    {p_product_key:qaProductKey},ordinary.access_token)).reason,'ACCOUNT_RESTRICTED');
  await accountAction('解除平台封禁',"SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM public.platform_account_restrictions WHERE user_id='"+qaOrdUserId+"') THEN 1 ELSE 0 END");
  await accountAction('授予平台管理员资格',"SELECT count(*) FROM public.platform_admins WHERE user_id='"+qaOrdUserId+"' AND active");
  const upgraded=await api('/auth/v1/factors','POST',
    {factor_type:'totp',friendly_name:'Temporary ordinary QA factor'},ordinary.access_token);
  const ordinaryChallenge=await api('/auth/v1/factors/'+upgraded.id+'/challenge','POST',{},ordinary.access_token);
  const ordinaryLevel=await api('/auth/v1/factors/'+upgraded.id+'/verify','POST',
    {challenge_id:ordinaryChallenge.id,code:totp(upgraded.totp.secret)},ordinary.access_token);
  assert.equal((await api('/rest/v1/rpc/admin_check_access','POST',{},ordinaryLevel.access_token)).allowed,true);
  await accountAction('撤销平台管理员资格',"SELECT count(*) FROM public.platform_admins WHERE user_id='"+qaOrdUserId+"' AND active=false");
  assert.equal((await api('/rest/v1/rpc/admin_check_access','POST',{},ordinaryLevel.access_token)).allowed,false,
    'stale AAL2 token must lose admin access after roster revocation');
  await unauthorizedCall(ordinaryLevel.access_token,'stale AAL2 revoked admin');
  assert.equal(sql("SELECT count(*) FROM public.admin_audit_log WHERE actor_user_id='"+uid+"' AND target_id='"+qaOrdUserId+"' AND action LIKE 'account.%'"),'4');
  console.log('X04/X15 PASS block/unblock + grant/revoke administrator with actual UI, audit and stale AAL2 denial');


  // X10/X14/X15: revoke only this test's grant and second issued code.
  async function detailRpc(route,title,action,targetId,checkSql){
    await send('Page.navigate',{url:base+'/#/'+route+'/'+targetId+'/show'});
    await visible(title);
    const clicked=await evaluate("(()=>{const x=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes("+JSON.stringify(action)+"));x?.click();return !!x})()");
    assert.equal(clicked,true,'protected detail action '+action);
    await visible('操作理由');
    assert.equal(await evaluate("(()=>{const x=document.querySelector('[role=dialog] textarea');x?.focus();return !!x})()"),true);
    await send('Input.insertText',{text:'仅针对临时 QA 对象的安全撤销'});
    const submit=await evaluate("(()=>{const x=[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent?.includes('确认提交'));const ok=!!x&&!x.disabled;if(ok)x.click();return ok})()");
    assert.equal(submit,true,'protected detail confirmation');
    for(let i=0;i<48;i++){
      if(sql(checkSql)==='1')break;
      await sleep(175);
    }
    assert.equal(sql(checkSql),'1','database shows expected '+action);
  }
  const qaGrantId=sql("SELECT id FROM public.entitlement_grants WHERE created_by='"+uid+"' AND product_id='"+qaProductId+"' AND source_type='admin' LIMIT 1");
  assert.match(qaGrantId,/^[a-f0-9-]{36}$/i);
  await detailRpc('grants','Pro 授权详情','撤销 Pro 授权',qaGrantId,
    "SELECT count(*) FROM public.entitlement_grants WHERE id='"+qaGrantId+"' AND revoked_at IS NOT NULL");
  const qaCodeId=sql("SELECT c.id FROM public.redemption_codes c JOIN public.redemption_code_batches b ON b.id=c.batch_id WHERE c.created_by='"+uid+"' AND c.product_id='"+qaProductId+"' AND b.request_id='"+absentId+"'");
  assert.match(qaCodeId,/^[a-f0-9-]{36}$/i);
  await detailRpc('codes','兑换码详情','撤销该兑换码',qaCodeId,
    "SELECT count(*) FROM public.redemption_codes WHERE id='"+qaCodeId+"' AND revoked_at IS NOT NULL");
  // A redacted view must not expose a code_hash or recover historical plaintext.
  const summaryResp=await fetch(cfg.API_URL+'/rest/v1/admin_redemption_code_summaries?select=*&product_id=eq.'+qaProductId,
    {headers:{apikey:cfg.PUBLISHABLE_KEY,authorization:'Bearer '+level.access_token}});
  assert.equal(summaryResp.status,200,'redacted summary query');
  const safeRows=await summaryResp.json();
  assert.ok(safeRows.length>=2,'both historical QA codes available as security summaries');
  assert.equal(safeRows.some(row=>Object.keys(row).some(key=>/hash|plaintext|secret/i.test(key))),false,
    'read-only code view must never expose hashes/secret keys');
  const forbidden=await fetch(cfg.API_URL+'/rest/v1/redemption_codes?select=code_hash&product_id=eq.'+qaProductId,
    {headers:{apikey:cfg.PUBLISHABLE_KEY,authorization:'Bearer '+level.access_token}});
  assert.ok(!forbidden.ok,'direct code_hash REST request must be denied even for UI admin');
  console.log('X10/X14 PASS grant and individual code revoked through UI; no secret/hash in redacted REST view');
  await detailRpc('products','产品详情','暂停产品',qaProductId,
    "SELECT count(*) FROM public.products WHERE id='"+qaProductId+"' AND status='suspended'");
  await detailRpc('products','产品详情','恢复运行',qaProductId,
    "SELECT count(*) FROM public.products WHERE id='"+qaProductId+"' AND status='active'");
  console.log('X05 PASS real product activation/suspension and safe audit path');


  } else console.log('ADMIN_ISSUANCE_SLICE_SKIPPED');
  if(qaPhase!=='operations-grants' && qaPhase!=='operations-issuance' && qaPhase!=='operations-feedback'){
  // X01/X17 limited browser-level responsive and keyboard acceptance.
  const viewportRoutes=[
    ['/memberships','成员关系'],['/grants','授权记录'],
    ['/code-batches','发行批次'],['/account-actions','平台账号操作'],
    ['/products/create','建立新产品'],
  ];
  let responsiveChecks=0;
  for(const w of [320,390,768,1000,1280,1440]){
    await send('Emulation.setDeviceMetricsOverride',{width:w,height:850,deviceScaleFactor:1,mobile:w<768});
    for(const [route,expected] of viewportRoutes){
      await send('Page.navigate',{url:base+'/#'+route});
      await visible(expected);
      const view=JSON.parse(await evaluate("JSON.stringify({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})"));
      if(view.scroll>view.client+12){
        const offenders=JSON.parse(await evaluate("JSON.stringify([...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:typeof e.className==='string'?e.className.slice(0,60):'',text:e.textContent?.trim().slice(0,45)??'',left:Math.round(e.getBoundingClientRect().left),right:Math.round(e.getBoundingClientRect().right),width:Math.round(e.getBoundingClientRect().width)})).filter(x=>x.right>document.documentElement.clientWidth+10 || x.left< -10).slice(0,35))"));
        console.log('LAYOUT_OVERFLOW_ELEMENTS '+route+' '+w+' '+JSON.stringify(offenders));
      }
      assert.ok(view.scroll<=view.client+12,route+' at '+w+'px must not overflow the whole document; '+JSON.stringify(view));
      responsiveChecks++;
    }
  }
  // Every shared-resource page must also fit mobile, tablet and compact desktop.
  // This measures CSS-viewport reflow, not the separate browser 200/400% zoom gate.
  for(const w of [320,390,768,1024]){
    await send('Emulation.setDeviceMetricsOverride',{width:w,height:850,deviceScaleFactor:1,mobile:w<768});
    for(const [route,title,expected] of morePages){
      await send('Page.navigate',{url:base+'/#/'+route});
      await visible(title);
      // Empty lists do not render row-number cards or desktop table headers.
      // The bounded filter/lookup control is present in both empty and populated
      // responsive states; validate it instead of requiring a fabricated row.
      await visible(expected);
      const width=JSON.parse(await evaluate("JSON.stringify({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})"));
      assert.ok(width.scroll<=width.client+12,route+' at '+w+'px overflows document; '+JSON.stringify(width));
      responsiveChecks++;
    }
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:850,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base+'/#/products'});
  await visible('产品目录');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,nativeVirtualKeyCode:9});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,nativeVirtualKeyCode:9});
  const keyboard=JSON.parse(await evaluate("JSON.stringify({tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label')??document.activeElement?.textContent?.trim().slice(0,60)})"));
  assert.notEqual(keyboard.tag,'BODY','Tab must move focus to an interactive target');
  assert.ok(keyboard.label,'keyboard target requires a discernible name');
  await send('Page.navigate',{url:base+'/#/products/'+qaProductId+'/show'});
  await visible('产品详情');
  await evaluate("(()=>{[...document.querySelectorAll('button')].find(e=>e.textContent?.includes('暂停产品'))?.click()})()");
  await visible('操作理由');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  await sleep(450);
  assert.equal(await evaluate("!document.querySelector('[role=dialog]')"),true,'Escape closes confirmation without mutation');
  assert.equal(sql("SELECT status FROM public.products WHERE id='"+qaProductId+"'"),'active');
  console.log('X01/X17 PARTIAL PASS '+responsiveChecks+' viewport-route combinations, Tab focus name, Escape cancel; full WCAG audit pending');


  // X16: inject real HTTP 503 using Chrome Fetch domain BEFORE the server sees
  // the create request. Verify UNKNOWN, unchanged DB, and safe same-id retry.
  await send('Page.navigate',{url:base+'/#/issue-codes'});
  await visible('发行兑换码');
  const currentBatchCount=Number(sql("SELECT count(*) FROM public.redemption_code_batches WHERE created_by='"+uid+"' AND product_id='"+qaProductId+"'"));
  assert.equal(await evaluate("(()=>{const x=[...document.querySelectorAll('[role=combobox]')].find(e=>e.closest('.MuiFormControl-root')?.textContent?.includes('目标产品'));x?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));return !!x})()"),true);
  await sleep(220);
  assert.equal(await evaluate("(()=>{const x=[...document.querySelectorAll('[role=option]')].find(e=>e.textContent?.includes("+JSON.stringify(qaProductKey)+"));x?.click();return !!x})()"),true);
  await send('Fetch.enable',{patterns:[{urlPattern:'*://127.0.0.1:55321/rest/v1/rpc/admin_create_codes*',requestStage:'Request'}]});
  injectedFault={status:503,used:false};
  const syntheticButton=await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent?.includes('确认创建兑换码'));if(b&&!b.disabled)b.click();return !!b&&!b.disabled})()");
  assert.equal(syntheticButton,true,'fault-injection issuance submit available');
  await visible('有待核实的发码请求');
  for(let i=0;i<50&&(!injectedFault.used || await evaluate("document.body.innerText.includes('提交中…')"));i++)await sleep(100);
  assert.equal(injectedFault.used,true,'Chrome intercepted actual issue POST before backend');
  await send('Fetch.disable');
  injectedFault=null;
  assert.equal(interceptionFailure,null,'no CDP interception errors');
  assert.equal(Number(sql("SELECT count(*) FROM public.redemption_code_batches WHERE created_by='"+uid+"' AND product_id='"+qaProductId+"'")),currentBatchCount,
    'synthetic 503 must not issue a code or accidentally report success');
  const pendingAfter503=await evaluate("sessionStorage.getItem('aisencore.issuance.pending.v1')");
  assert.ok(pendingAfter503,'503 must preserve a nonsecret request id for reconciliation');
  await evaluate("(()=>{[...document.querySelectorAll('button')].find(e=>e.textContent?.includes('核对批次状态'))?.click()})()");
  await visible('未查询到相同请求编号');
  await evaluate("(()=>{[...document.querySelectorAll('button')].find(e=>e.textContent?.includes('以相同编号重试'))?.click()})()");
  await visible('兑换码已成功创建');
  assert.equal(Number(sql("SELECT count(*) FROM public.redemption_code_batches WHERE created_by='"+uid+"' AND product_id='"+qaProductId+"'")),currentBatchCount+1,
    'safe original request_id retry must create one code batch');
  const injectedOriginal=JSON.parse(pendingAfter503).requestId;
  assert.equal(sql("SELECT count(*) FROM public.redemption_code_batches WHERE created_by='"+uid+"' AND product_id='"+qaProductId+"' AND request_id='"+injectedOriginal+"'"),'1');
  await evaluate("(()=>{document.querySelector('[role=dialog] input[type=checkbox]')?.click()})()");
  await sleep(140);
  await evaluate("(()=>{[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent?.includes('清除明文并关闭'))?.click()})()");
  await sleep(500);
  assert.equal(await evaluate("sessionStorage.getItem('aisencore.issuance.pending.v1')"),null);
  console.log('X16 PASS Chrome-injected HTTP 503 => UNKNOWN, no database write, same-ID reconcile/retry, no duplicate');


  // X16: known HTTP 429 rejection must not be classified as UNKNOWN or leave
  // stale pending metadata; it must permit a later independently reviewed request.
  await send('Page.navigate',{url:base+'/#/issue-codes'});
  await visible('发行兑换码');
  const before429=Number(sql("SELECT count(*) FROM public.redemption_code_batches WHERE created_by='"+uid+"' AND product_id='"+qaProductId+"'"));
  const select429=await evaluate("(()=>{const x=[...document.querySelectorAll('[role=combobox]')].find(e=>e.closest('.MuiFormControl-root')?.textContent?.includes('目标产品'));x?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));return !!x})()");
  assert.equal(select429,true);
  await sleep(220);
  assert.equal(await evaluate("(()=>{const x=[...document.querySelectorAll('[role=option]')].find(e=>e.textContent?.includes("+JSON.stringify(qaProductKey)+"));x?.click();return !!x})()"),true);
  await send('Fetch.enable',{patterns:[{urlPattern:'*://127.0.0.1:55321/rest/v1/rpc/admin_create_codes*',requestStage:'Request'}]});
  injectedFault={status:429,used:false};
  const rejectedSubmit=await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent?.includes('确认创建兑换码'));const allowed=!!b&&!b.disabled;if(allowed)b.click();return allowed})()");
  assert.equal(rejectedSubmit,true);
  for(let i=0;i<55&&!injectedFault.used;i++)await sleep(120);
  assert.equal(injectedFault.used,true,'Chrome intercepted POST for synthetic 429');
  await send('Fetch.disable');injectedFault=null;
  assert.equal(interceptionFailure,null,'429 interception transport healthy');
  let cleared429=false;
  for(let i=0;i<50;i++){
    cleared429=await evaluate("sessionStorage.getItem('aisencore.issuance.pending.v1')===null && !document.body.innerText.includes('有待核实的发码请求')");
    if(cleared429)break;
    await sleep(140);
  }
  assert.equal(cleared429,true,'known HTTP 429 clears pending as rejected; never UNKNOWN');
  assert.equal(Number(sql("SELECT count(*) FROM public.redemption_code_batches WHERE created_by='"+uid+"' AND product_id='"+qaProductId+"'")),before429,
    'known 429 cannot create a batch');
  console.log('X16 PASS real Chrome-injected HTTP 429 distinct from UNKNOWN, no duplicate, pending cleared');

  // X03: browser route cannot expose protected dashboard to an uncompleted
  // AAL1 session, and fully logged-out browsers only see the login gate.
  const mfaAfterNavigation=mfaBrowserRequests;
  assert.equal(mfaAfterNavigation,0,'route changes must not trigger extra TOTP challenges');
  // AAL2 verification rotates the previous refresh token: sign in again to
  // obtain a legitimate fresh AAL1 session for the browser route gate.
  const freshAal1=await api('/auth/v1/token?grant_type=password','POST',{email,password});
  const lowSession={...session,access_token:freshAal1.access_token,refresh_token:freshAal1.refresh_token,
    expires_in:freshAal1.expires_in??3600,expires_at:Math.floor(Date.now()/1000)+(freshAal1.expires_in??3600)};
  // Change hash without navigating through a running Supabase JS instance;
  // only then reload exactly once with the fresh low-assurance Auth session.
  await evaluate("history.replaceState(null,'','/#/products');localStorage.setItem('sb-127-auth-token',"+
    JSON.stringify(JSON.stringify(lowSession))+")");
  await send('Page.reload',{ignoreCache:true});
  await visible('AisenCore 管理平台');
  await sleep(650);
  const loginKind=await evaluate("document.body.innerText.includes('验证管理账号的动态口令')?'totp':document.body.innerText.includes('使用平台管理员身份登录')?'credentials':'unexpected'");
  assert.ok(loginKind==='totp'||loginKind==='credentials','AAL1 must reach a login challenge, not protected UI');
  assert.equal(await evaluate("document.body.innerText.includes('产品目录')"),false,
    'AAL1 browser must not expose protected product list');
  console.log('X03 PASS Chrome AAL1 direct protected URL denied; login gate '+loginKind);
  await evaluate("localStorage.removeItem('sb-127-auth-token')");
  await send('Page.reload',{ignoreCache:true});
  await visible('使用平台管理员身份登录');
  assert.equal(await evaluate("document.body.innerText.includes('产品目录')"),false,
    'anonymous browser must not display protected resource');
  console.log('X03 PASS anonymous direct protected route always redirects to sign-in');


  // X03 additional real browser UI credential -> TOTP -> protected dashboard.
  // The test's Node API used a verified factor; fresh browser password login
  // must challenge that same factor rather than silently granting an AAL2 page.
  const mailInput=await evaluate("(()=>{const x=document.querySelector('input[type=email]');x?.focus();return !!x})()");
  assert.equal(mailInput,true,'browser has real email sign-in input');
  await send('Input.insertText',{text:email});
  assert.equal(await evaluate("(()=>{const x=document.querySelector('input[type=password]');x?.focus();return !!x})()"),true);
  await send('Input.insertText',{text:password});
  const browserSignin=await evaluate("(()=>{const x=[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='继续');if(x&&!x.disabled)x.click();return !!x&&!x.disabled})()");
  assert.equal(browserSignin,true,'browser password form submits');
  await visible('验证管理账号的动态口令');
  assert.equal(await evaluate("document.body.innerText.includes('管理概览')"),false,
    'password login by itself does not expose dashboard');
  assert.equal(await evaluate("(()=>{const x=document.querySelector('input[autocomplete=one-time-code]');x?.focus();return !!x})()"),true);
  await send('Input.insertText',{text:totp(factor.totp.secret)});
  const browserTotp=await evaluate("(()=>{const x=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('完成双因素认证'));if(x&&!x.disabled)x.click();return !!x&&!x.disabled})()");
  assert.equal(browserTotp,true,'browser TOTP verification submits');
  await visible('管理概览');
  console.log('X03 PASS actual Chrome email/password -> verified TOTP -> AAL2 dashboard; no secrets persisted in QA logs');

  } else console.log('ADMIN_RESPONSIVE_SECURITY_SLICE_SKIPPED');

  if(qaPhase==='operations-feedback'){
    // F08 real Admin UI queue E2E. Existing F07 covers Lens JWT Edge/S3 upload;
    // this one creates one strictly QA-scoped DB fixture to exercise four queues
    // and actual AAL2 browser RPC transitions, without cloud/object storage.
    qaFeedbackId=randomUUID();
    qaFeedbackRequestId=randomUUID();
    const feedbackText='Lens/Core Stage2 owned QA feedback '+randomBytes(5).toString('hex');
    sql("INSERT INTO public.user_feedback(id,user_id,product_id,content,request_id) VALUES ("+
      "'"+qaFeedbackId+"','"+uid+"','"+qaProductId+"','"+feedbackText+"','"+qaFeedbackRequestId+"')");
    assert.equal(sql("SELECT queue_state||'|'||version FROM public.user_feedback WHERE id='"+qaFeedbackId+"'"),
      'inbox|1','new QA feedback must begin in inbox at version 1');
    const target=base+'/#/feedback/'+qaFeedbackId+'/show';
    const queuePage=async(path,label)=>{
      await send('Page.navigate',{url:base+'/#'+path});
      await visible(label);
      await visible(feedbackText);
      console.log('FEEDBACK_QUEUE_UI PASS '+path);
    };
    const detail=async(label)=>{
      await send('Page.navigate',{url:target});
      // Same-route SPA navigation does not refresh a stale optimistic version.
      // Force a fresh server read after an expected 409 before the next write.
      await send('Page.reload',{ignoreCache:true});
      await visible('反馈内容');
      await visible(feedbackText);
      await visible(label);
    };
    const click=async(label)=>{
      assert.equal(await evaluate("(()=>{const x=[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==="+JSON.stringify(label)+");if(x&&!x.disabled)x.click();return !!x&&!x.disabled})()"),true,
        'Admin feedback action must be enabled: '+label);
    };
    const state=async(queue,version)=>{
      for(let i=0;i<80;i++){
        if(sql("SELECT queue_state||'|'||version FROM public.user_feedback WHERE id='"+qaFeedbackId+"'")===queue+'|'+version)return;
        await sleep(150);
      }
      throw Error('Feedback queue transition missing '+queue+' '+version);
    };
    await queuePage('/feedback','收件箱');
    await detail('加入处理工作台');
    await click('加入处理工作台');
    await state('workbench',2);
    await queuePage('/feedback/workbench','处理工作台');
    await detail('归档反馈');

    // Simulate a different authorized Admin process updating the same version
    // while the browser has version=2. The stale browser must show 409 and
    // must not silently override concurrent tags, star or priority changes.
    const external=await api('/rest/v1/rpc/admin_feedback_v3','POST',{
      p_feedback_id:qaFeedbackId,p_expected_version:2,p_action:'save',
      p_priority:'high',p_tags:['qa-stage2'],p_is_starred:true,
      p_internal_note:'QA concurrent update from a separate AAL2 request',
    },session.access_token);
    assert.equal(external.version,3,'server-side concurrent write increments version');
    await click('归档反馈');
    await visible('反馈已被其他操作更新，请刷新后核对并重试。');
    assert.equal(sql("SELECT queue_state||'|'||version FROM public.user_feedback WHERE id='"+qaFeedbackId+"'"),
      'workbench|3','stale UI may not change the queue');
    assert.equal(sql("SELECT is_starred FROM public.user_feedback WHERE id='"+qaFeedbackId+"'"),'t');
    console.log('FEEDBACK_UI_409 PASS actual stale Chrome update rejected, concurrent labels preserved');

    await detail('归档反馈');
    await click('归档反馈');
    await state('archived',4);
    await queuePage('/feedback/archived','已归档');
    await detail('重新进入工作台');
    await click('重新进入工作台');
    await state('workbench',5);
    await detail('移入回收站');
    await click('移入回收站');
    await visible('移入回收站？');
    await click('确认移入');
    await state('trashed',6);
    await queuePage('/feedback/trash','回收站');
    await detail('恢复到删除前位置');
    await click('恢复到删除前位置');
    await state('workbench',7);
    await queuePage('/feedback/workbench','处理工作台');
    // psql -qAt returns text: lexical comparisons misclassify 10+ rows (e.g. '10' < '5').
    // Keep the actual numeric evidence instead of weakening the audit threshold.
    const internalEventCount=Number(sql("SELECT count(*) FROM public.feedback_events WHERE feedback_id='"+qaFeedbackId+"' AND visibility='internal'"));
    const feedbackAuditCount=Number(sql("SELECT count(*) FROM public.admin_audit_log WHERE actor_user_id='"+uid+"' AND target_id='"+qaFeedbackId+"' AND action LIKE 'feedback.%'"));
    console.log('FEEDBACK_FOUR_QUEUES_COUNTS internal_events='+internalEventCount+' admin_audits='+feedbackAuditCount);
    assert.ok(Number.isSafeInteger(internalEventCount)&&internalEventCount>=5,
      'five or more internal feedback transitions required; observed '+internalEventCount);
    assert.ok(Number.isSafeInteger(feedbackAuditCount)&&feedbackAuditCount>=6,
      'six or more Admin feedback audit entries required; observed '+feedbackAuditCount);
    console.log('FEEDBACK_ADMIN_FOUR_QUEUES PASS inbox->workbench->archived->workbench->trash->restored with full audit');
  }

  console.log('ADMIN_OPERATIONS_SLICE PASS '+qaPhase+' protected business checks');
  } else console.log('ADMIN_NAVIGATION_SLICE PASS all 10 read-only resource views, UX/error/empty-state checks; no business product created');
  if(qaPhase==='full')console.log('REAL Auth AAL2 + Chrome navigation and operations journey PASS.');
} finally {
  qaInCleanup = true; // Cleanup must never be refused by the QA soft deadline.
  try{exclusiveGuard.close();}catch{}
  try{ws?.close();}catch{}
  if(win){
    if(chrome?.pid)spawnSync('taskkill',['/PID',String(chrome.pid),'/T','/F'],{encoding:'utf8',timeout:10000});
    if(site?.pid)spawnSync('taskkill',['/PID',String(site.pid),'/T','/F'],{encoding:'utf8',timeout:10000});
  }else{chrome?.kill('SIGTERM');site?.kill('SIGTERM');}
  // The database user must be cleaned even if Chrome has a temporarily
  // locked profile (common on Windows). Never abort Auth cleanup for EPERM.
  // Audits may outlive their target (including code.batch_revoke). The actor
  // is a newly-created, randomly named QA admin, never a fixed or human admin.
  if(uid){
    try{
      const owned=sql("SELECT count(*) FROM auth.users WHERE id='"+uid+"' AND email LIKE 'admin-uiqa-%@aisencore.test'");
      if(owned!=='1')throw Error('QA actor ownership verification failed');
      sql("DELETE FROM public.admin_audit_log WHERE actor_user_id='"+uid+"'");
    }catch(error){qaCleanupFailures.push('QA actor audits');console.error('QA audit cleanup needs review: '+error.message);}
  }

  if(qaFeedbackId&&uid&&qaProductId&&qaFeedbackRequestId){
    try{
      const owner=sql("SELECT user_id::text||'|'||product_id::text||'|'||request_id::text FROM public.user_feedback WHERE id='"+qaFeedbackId+"'");
      assert.equal(owner,uid+'|'+qaProductId+'|'+qaFeedbackRequestId,
        'QA feedback cleanup ownership verified; do not delete non-QA feedback');
      sql("DELETE FROM public.feedback_events WHERE feedback_id='"+qaFeedbackId+"'");
      sql("DELETE FROM public.user_feedback WHERE id='"+qaFeedbackId+"' AND user_id='"+uid+"' AND product_id='"+qaProductId+"' AND request_id='"+qaFeedbackRequestId+"'");
      console.log('QA_FEEDBACK_CLEANUP PASS owned feedback and internal events removed');
    }catch(error){qaCleanupFailures.push('QA feedback');console.error('Scoped QA feedback cleanup needs review: '+error.message);}
  }

  // Scoped cleanup: only remove this test's random product and associated audit rows.
  try{
    const actual=qaProductId??sql("SELECT id FROM public.products WHERE product_key='"+qaProductKey+"'");
    if(actual && /^[a-f0-9-]{36}$/i.test(actual)){
      if(uid){
        sql("DELETE FROM public.admin_audit_log WHERE actor_user_id='"+uid+"' AND action='grant.create' AND target_id IN (SELECT id FROM public.entitlement_grants WHERE user_id='"+uid+"' AND product_id='"+actual+"')");
        sql("DELETE FROM public.entitlement_grants WHERE user_id='"+uid+"' AND product_id='"+actual+"' AND source_type='admin' AND created_by='"+uid+"'");
      }
      if(uid){
        sql("DELETE FROM public.admin_audit_log WHERE actor_user_id='"+uid+"' AND action='code.create' AND target_id IN (SELECT id FROM public.redemption_code_batches WHERE created_by='"+uid+"' AND product_id='"+actual+"')");
        sql("DELETE FROM public.redemption_codes WHERE created_by='"+uid+"' AND product_id='"+actual+"' AND batch_id IN (SELECT id FROM public.redemption_code_batches WHERE created_by='"+uid+"' AND product_id='"+actual+"')");
        sql("DELETE FROM public.redemption_code_batches WHERE created_by='"+uid+"' AND product_id='"+actual+"'");
      }
      if(uid)sql("DELETE FROM public.admin_audit_log WHERE target_id='"+actual+"' AND actor_user_id='"+uid+"' AND action IN ('product.create','product.status')");

      if(uid){
        sql("DELETE FROM public.membership_events WHERE membership_id IN (SELECT id FROM public.product_memberships WHERE user_id='"+uid+"' AND product_id='"+actual+"')");
        sql("DELETE FROM public.product_memberships WHERE user_id='"+uid+"' AND product_id='"+actual+"'");
      }
      sql("DELETE FROM public.products WHERE id='"+actual+"' AND product_key='"+qaProductKey+"'");
      console.log('QA_PRODUCT_CLEANUP PASS '+qaProductKey);
    }
  }catch(e){qaCleanupFailures.push('QA product');console.error('QA product scoped cleanup needs review: '+e.message);}

  if(qaOrdUserId){
    try{
      if(uid)sql("DELETE FROM public.admin_audit_log WHERE actor_user_id='"+uid+"' AND target_id='"+qaOrdUserId+"' AND action LIKE 'account.%'");
      sql("DELETE FROM public.platform_account_restrictions WHERE user_id='"+qaOrdUserId+"'");
      sql("DELETE FROM public.platform_admins WHERE user_id='"+qaOrdUserId+"'");
      await api('/auth/v1/admin/users/'+qaOrdUserId,'DELETE',undefined,null,true);
      console.log('QA_IDENTITY_CLEANUP PASS');
    }catch(e){qaCleanupFailures.push('QA ordinary identity');console.error('QA ordinary identity cleanup needs review: '+e.message);}
  }
  if(uid){
    try{sql("DELETE FROM public.platform_admins WHERE user_id='"+uid+"'");}catch(e){qaCleanupFailures.push('QA admin roster');console.error('QA admin roster cleanup needs review: '+e.message);}
    try{await api('/auth/v1/admin/users/'+uid,'DELETE',undefined,null,true);}catch(e){qaCleanupFailures.push('QA admin Auth');console.error('QA Auth identity cleanup needs review: '+e.message);}
  }
  // Retry direct secret file deletion regardless of previous assertion/error;
  // the browser profile itself can remain locked, but plaintext may not.
  for(const filename of qaSecretDownloadPaths){
    try{rmSync(filename,{force:true,maxRetries:20,retryDelay:120});}
    catch{qaCleanupFailures.push('QA code export file cleanup');}
    if(existsSync(filename))qaCleanupFailures.push('QA plaintext export file remains');
  }
  // Never report full PASS while ephemeral DB/Auth objects remain.
  for(const [label,id] of [['QA admin',uid],['QA ordinary',qaOrdUserId]]){
    if(!id)continue;
    try{
      if(sql("SELECT count(*) FROM auth.users WHERE id='"+id+"'")!=='0')qaCleanupFailures.push(label+' Auth row remains');
    }catch(error){qaCleanupFailures.push(label+' cleanup verification unavailable');}
  }
  if(qaProductId){
    try{if(sql("SELECT count(*) FROM public.products WHERE id='"+qaProductId+"'")!=='0')qaCleanupFailures.push('QA product remains');}
    catch{qaCleanupFailures.push('QA product verification unavailable');}
  }
  if(qaCleanupFailures.length){
    console.error('QA_CLEANUP_FAILED: '+qaCleanupFailures.join(', '));
    process.exitCode=1;
  }else console.log(qaFixtureStarted
    ? 'QA_CLEANUP_VERIFIED no QA Auth or product records remain'
    : 'QA_PRECHECK_BLOCKED no temporary QA identity or product was created');
  await sleep(350);
  try{rmSync(profile,{recursive:true,force:true,maxRetries:15,retryDelay:150});}
  catch{console.warn('Chrome profile still locked by Windows; manual Temp cleanup may be needed.');}
}

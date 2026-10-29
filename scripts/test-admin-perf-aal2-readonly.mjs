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
const verifyIdentityUX=process.argv.includes('--identity-ux');
const verifyScroll=process.argv.includes('--scroll');
let spaTags=null;
let identityUX=null;
const verifyPendingAxe=process.argv.includes('--axe-pending');
const a11y=[];
const axeBundle=verifyPendingAxe?readFileSync(join(root,'apps','admin','node_modules','axe-core','axe.min.js'),'utf8'):null;
const pending=new Map(),held=new Set(),failures=[],results=[];
const grantReadUrls=[];
const memberReadUrls=[];
const feedbackReadUrls=[];
const runtimeErrors=[];
const feedbackResponses=[];
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
  if(v.result?.exceptionDetails)throw Error('Chrome evaluate failed: '+
    String(v.result.exceptionDetails.exception?.description??v.result.exceptionDetails.text).slice(0,450));
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
  if(msg.method==='Runtime.exceptionThrown'){
    const e=msg.params?.exceptionDetails;
    runtimeErrors.push(String(e?.exception?.description??e?.text??'unknown browser exception')
      .split('\n')[0].slice(0,300));
  }
  if(msg.method==='Runtime.consoleAPICalled'&&msg.params?.type==='error'){
    runtimeErrors.push((msg.params.args??[]).map(a=>String(a.value??a.description??'')).join(' ')
      .split('\n')[0].slice(0,300));
  }
  if(msg.method==='Network.responseReceived'){
    const response=msg.params?.response;
    if(response?.url?.includes('/rest/v1/admin_feedback_summaries?'))
      feedbackResponses.push({status:response.status,
        filterUser:response.url.includes('user_id=eq.')});
  }
  const wait=pending.get(msg.id);
  if(wait){pending.delete(msg.id);msg.error?wait.reject(Error(msg.error.message)):wait.resolve(msg);}
  if(msg.method==='Network.requestWillBeSent'){
    const url=msg.params?.request?.url??'';
    if(url.includes('/rest/v1/entitlement_grants?'))grantReadUrls.push(url);
    if(url.includes('/rest/v1/product_memberships?'))memberReadUrls.push(url);
    if(url.includes('/rest/v1/rpc/admin_check_access'))requests.access++;
    if(url.includes('/rest/v1/rpc/admin_feedback_tags'))requests.tags++;
    if(url.includes('/rest/v1/products?'))requests.products++;
    if(url.includes('/rest/v1/admin_feedback_summaries?')){
      requests.feedback++;
      feedbackReadUrls.push(url);
    }
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
  if(verifyScroll){
    // Real headed DOM using an isolated AAL2 QA admin, with synthetic rows
    // cloned in-browser only. No existing business row is altered.
    await release();
    await send('Emulation.setDeviceMetricsOverride',
      {width:1440,height:900,deviceScaleFactor:1,mobile:false});
    const cases=[
      {route:'audit-logs',kind:'mui',name:'audit'},
      {route:'feedback',kind:'ra',name:'feedback'},
      {route:'products',kind:'ra',name:'products'},
      {route:'code-batches',kind:'mui',name:'redemption-batches'},
    ];
    const sampleBatch=sql('SELECT id FROM public.redemption_code_batches ORDER BY created_at DESC LIMIT 1');
    if(sampleBatch)cases.push({route:'code-batches/'+sampleBatch+'/show',kind:'mui',name:'redemption-batch-detail'});
    for(const item of cases){
      await send('Page.navigate',{url:base+'/?scroll='+item.name+'#/'+item.route});
      await until(async()=>await evaluate('document.readyState')==='complete');
      const readyRow=item.kind==='ra'?'.RaDatagrid-tableWrapper tbody tr':'.MuiTableContainer-root tbody tr';
      await until(async()=>await evaluate("!!document.querySelector('.RaLayout-content') && !!document.querySelector("+JSON.stringify(readyRow)+")"),19000);
      // A single page can contain only 2-3 records. Add copies to the
      // *browser DOM* so actual scroll can be tested without DB writes.
      const result=await evaluate(`(async()=>{
        const selector=${JSON.stringify(item.kind==='ra'?'.RaDatagrid-tableWrapper':'.MuiTableContainer-root')};
        const main=document.querySelector('.RaLayout-content');
        const table=main?.querySelector(selector);
        const body=table?.querySelector('tbody');
        const row=body?.querySelector('tr');
        if(!main||!table||!row) return {error:'missing-main-or-table',
          route:location.hash,hasMain:!!main,hasTable:!!table,hasRow:!!row,
          raWrappers:main?.querySelectorAll('.RaDatagrid-tableWrapper').length,
          tableContainers:main?.querySelectorAll('.MuiTableContainer-root').length,
          status:(main?.innerText??'').includes('暂无匹配')?'empty':'not-empty',
          errorNotice:!!main?.querySelector('[role=alert]'),
          pending:(main?.innerText??'').includes('正在读取记录')};
        for(let i=0;i<36;i++)body.appendChild(row.cloneNode(true));
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const bar=document.querySelector('.MuiAppBar-root');
        const rail=document.querySelector('.RaSidebar-paper');
        const tools=main.querySelector('button');
        const th=table.querySelector('thead th');
        const geom=()=>({
          bar:bar?.getBoundingClientRect().top,
          rail:rail?.getBoundingClientRect().top,
          tools:tools?.getBoundingClientRect().top,
          head:th?.getBoundingClientRect().top,
          row:row.getBoundingClientRect().top,
        });
        const before=geom();
        window.scrollTo(0,350);
        main.scrollTop=150;
        table.scrollTop=350;
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const chain=[];let node=table;
        while(node&&chain.length<10){
          const s=getComputedStyle(node);
          chain.push({cls:String(node.className).slice(0,100),
            tag:node.tagName,clientHeight:node.clientHeight,scrollHeight:node.scrollHeight,
            flex:s.flex,display:s.display,minHeight:s.minHeight,maxHeight:s.maxHeight,
            height:s.height,overflowY:s.overflowY});
          node=node.parentElement;
        }
        return {before,after:geom(),chain,
          windowScrollY:window.scrollY,mainScrollTop:main.scrollTop,
          tableScrollTop:table.scrollTop,tableScrollHeight:table.scrollHeight,
          tableClientHeight:table.clientHeight,
          bodyOverflow:getComputedStyle(document.body).overflow,
          mainOverflow:getComputedStyle(main).overflowY};
      })()`);
      assert.ok(!result.error,item.name+' '+JSON.stringify(result));
      assert.equal(result.windowScrollY,0,item.name+' must never scroll browser document');
      assert.equal(result.mainScrollTop,0,item.name+' must keep list toolbar fixed');
      assert.ok(result.tableScrollTop>=120,item.name+' table must scroll data rows');
      for(const key of ['bar','rail','tools','head'])
        assert.ok(Math.abs(result.before[key]-result.after[key])<=2,
          item.name+' '+key+' moved: '+JSON.stringify(result));
      assert.ok(result.after.row<result.before.row-100,
        item.name+' row must move without its header');
      results.push({name:item.name,scrollport:'table',windowScrollY:result.windowScrollY,
        mainScrollTop:result.mainScrollTop,tableScrollTop:result.tableScrollTop,
        fixedElements:true});
      console.log('ADMIN_SCROLL_REAL_CDP PASS '+item.name);
    }
  }else if(verifyIdentityUX){
    // A real AAL2 Chrome read-only acceptance of the new exact-email flows.
    // This suite uses the disposable QA admin created above; unlike the
    // historical write-suite it does not require deleting existing business data.
    async function openRoute(route){
      await send('Page.navigate',{url:base+'/?qa=identity-'+encodeURIComponent(route)+'#/'+route});
      await until(async()=>await evaluate('document.readyState')==='complete');
    }
    async function searchEmail(address){
      await until(async()=>await evaluate("!!document.querySelector('input[type=email]')"),12000);
      await evaluate(`(()=>{const input=document.querySelector('input[type=email]');
        const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
        setter.call(input,${JSON.stringify(address)});
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new Event('change',{bubbles:true}));
        return true;})()`);
      await until(async()=>await evaluate(`document.querySelector('input[type=email]')?.value===${JSON.stringify(address)}`));
      await evaluate(`(()=>{const input=document.querySelector('input[type=email]');
        const find=[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='查找账号');
        if(find) find.click(); else input.closest('form').requestSubmit();
      })()`);
    }
    await openRoute('');
    await until(async()=>await evaluate(`!![...document.querySelectorAll('a[href]')]
      .find(a=>a.textContent?.trim()==='用户中心'&&
        a.getAttribute('href')?.endsWith('/users'))`),12000);
    const clickUserCenter=await evaluate(`(()=>{
      const a=[...document.querySelectorAll('a[href]')].find(a=>
        a.textContent?.trim()==='用户中心'&&
        a.getAttribute('href')?.endsWith('/users'));
      a?.click();return !!a;
    })()`);
    assert.equal(clickUserCenter,true,'left User Center navigation must lead to /users');
    await until(async()=>await evaluate("location.hash.includes('/users')&&document.body.innerText.includes('全平台 · 注册用户')"),14000);
    console.log('USER_CENTER_SIDEBAR_REAL_CLICK_ROUTE PASS');
    await until(async()=>await evaluate(`!![...document.querySelectorAll('tbody tr')]
      .find(r=>r.innerText.includes(${JSON.stringify(qaEmail)}))`),14000);
    const directory=await evaluate(`(()=>({
      heading:document.body.innerText.includes('用户中心'),
      rows:document.querySelectorAll('tbody tr').length,
      primary:!![...document.querySelectorAll('tbody a[href]')].find(a=>
        a.textContent?.includes('用户360°')&&
        a.getAttribute('href')?.includes(${JSON.stringify('/users/'+uid+'/show')})),
      noTopLevelMembership:![...document.querySelectorAll('nav a')].some(a=>
        a.textContent?.trim()==='成员关系'),
    }))()`);
    assert.ok(directory.heading&&directory.rows>=1&&directory.primary&&directory.noTopLevelMembership,
      'User menu should show a real account directory, not a membership list: '+JSON.stringify(directory));
    console.log('USER_CENTER_REAL_AAL2_LIST_UNFILTERED_AND_USER360_ENTRY PASS');
    const headers={apikey:cfg.PUBLISHABLE_KEY,authorization:'Bearer '+upgraded.access_token,
      'content-type':'application/json'};
    const directoryPage=await fetch(cfg.API_URL+'/rest/v1/rpc/admin_list_users',{
      method:'POST',headers,body:JSON.stringify({p_page:1,p_per_page:1}),
      signal:AbortSignal.timeout(12000),
    });
    assert.equal(directoryPage.status,200,'AAL2 admin may read one paginated directory user');
    const firstPage=await directoryPage.json();
    assert.equal(firstPage.items.length,1,'server pagination must return one Auth user, not one membership');
    assert.ok(firstPage.total>=1&&typeof firstPage.items[0].membership_count==='number');
    const directoryBadLimit=await fetch(cfg.API_URL+'/rest/v1/rpc/admin_list_users',{
      method:'POST',headers,body:JSON.stringify({p_page:1,p_per_page:51}),
      signal:AbortSignal.timeout(12000),
    });
    assert.equal(directoryBadLimit.status,422,'unbounded user directory read must be denied');
    const directoryAal1=await fetch(cfg.API_URL+'/rest/v1/rpc/admin_list_users',{
      method:'POST',headers:{...headers,authorization:'Bearer '+sign.access_token},
      body:JSON.stringify({p_page:1,p_per_page:20}),signal:AbortSignal.timeout(12000),
    });
    assert.equal(directoryAal1.status,403,'AAL1 must not enumerate accounts');
    const actualProductId=sql("SELECT id FROM public.products WHERE product_key='aisenlens'");
    assert.match(actualProductId,/^[0-9a-f-]{36}$/i);
    const productDirectory=await fetch(cfg.API_URL+'/rest/v1/rpc/admin_list_users',{
      method:'POST',headers,
      body:JSON.stringify({p_product_id:actualProductId,p_page:1,p_per_page:50}),
      signal:AbortSignal.timeout(12000),
    });
    assert.equal(productDirectory.status,200,'AAL2 product directory must be a restricted read');
    const selectedProduct=await productDirectory.json();
    assert.ok(selectedProduct.items.every(item=>
      item.scope_membership_status!==null&&item.id!==uid),
      'product scope must contain real members only and exclude the membership-free QA admin');
    assert.equal(new Set(selectedProduct.items.map(item=>item.id)).size,selectedProduct.items.length,
      'the product user directory must have unique auth users');
    console.log('USER_CENTER_AAL2_SINGLE_PRODUCT_UNIQUE_USERS PASS');
    console.log('USER_CENTER_AAL2_PAGINATION_AND_AAL1_DENIAL PASS');
    await searchEmail(qaEmail);
    await until(async()=>await evaluate(`document.querySelector('tbody')?.innerText.includes(${JSON.stringify(uid)})`),14000);
    const account=await evaluate(`(()=>{const rows=[...document.querySelectorAll('tbody tr')];
      const cell=rows[0]?.querySelectorAll('td')[1];
      return {count:rows.length,id:cell?.innerText,copy:!!cell?.querySelector('button[aria-label="复制用户编号"]'),
        duplicate:!!rows[0]?.querySelector('td:last-child button[aria-label="复制完整编号"]')};})()`);
    assert.equal(account.count,1,'exact lookup must display only matching user');
    assert.ok(account.id.includes(uid)&&account.copy&&!account.duplicate,'user number copy belongs to its cell');
    console.log('CA01_CA02_REAL_AAL2 PASS');
    const keyboard=await evaluate(`(()=>{
      const button=document.querySelector('tbody button[aria-label="复制用户编号"]');
      button?.focus();
      return !!button&&document.activeElement===button;
    })()`);
    assert.equal(keyboard,true,'User-ID copy must be reachable by keyboard focus');
    await evaluate(`(()=>{
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
        writeText:()=>Promise.reject(Error('synthetic clipboard permission denied'))}});
      document.querySelector('tbody button[aria-label="复制用户编号"]').click();
    })()`);
    await until(async()=>await evaluate("document.body.innerText.includes('复制失败')"),9000);
    console.log('CA02_CLIPBOARD_PERMISSION_DENIED_FEEDBACK_REAL_AAL2 PASS');
    const aal1Lookup=await fetch(cfg.API_URL+'/rest/v1/rpc/admin_lookup_users',{
      method:'POST',headers:{apikey:cfg.PUBLISHABLE_KEY,authorization:'Bearer '+sign.access_token,
        'content-type':'application/json'},
      body:JSON.stringify({p_user_ids:null,p_email_exact:qaEmail,p_page:1,p_per_page:2}),
      signal:AbortSignal.timeout(12000),
    });
    assert.equal(aal1Lookup.status,403,'AAL1 actor must not read restricted user identities');
    console.log('CA11_AAL1_IDENTITY_LOOKUP_DENIED PASS');
    await openRoute('users/'+uid+'/show');
    await until(async()=>await evaluate("document.body.innerText.includes('用户编号：')"),12000);
    const cards=await evaluate(`(()=>['账号状态与权限','成员关系','订阅与 Pro 权益','用户反馈','账号管理审计'].every(title=>!!document.querySelector('button[aria-label="展开'+title+'详情"]')))()`);
    assert.equal(cards,true,'user 360 must show five expandable account, member, subscription, feedback and audit cards');
    const openPro=await evaluate(`(()=>{const b=document.querySelector('button[aria-label="展开订阅与 Pro 权益详情"]');b?.click();return !!b})()`);
    assert.equal(openPro,true,'subscription card must expand details and record links');
    await until(async()=>await evaluate("document.body.innerText.includes('为此用户新建 Pro 授权')"),10000);
    const userShow=await evaluate(`(()=>({id:document.body.innerText.includes(${JSON.stringify(uid)}),
      copy:!!document.querySelector('button[aria-label="复制用户编号"]'),
      grant:document.body.innerText.includes('为此用户新建 Pro 授权'),
      records:document.body.innerText.includes('完整授权记录')}))()`);
    assert.ok(userShow.id&&userShow.copy&&userShow.grant);
    console.log('CA03_USER_SHOW_REAL_AAL2 PASS');
    console.log('USER360_FOUR_EXPANDABLE_CARDS_AND_SUBSCRIPTION_DETAILS_REAL_AAL2 PASS');
    const auditExpanded=await evaluate(`(()=>{const b=document.querySelector('button[aria-label="展开账号管理审计详情"]');b?.click();return !!b})()`);
    assert.equal(auditExpanded,true,'account audit must expand to its own protected history');
    await until(async()=>await evaluate("document.body.innerText.includes('查看此用户完整管理审计')"),10000);
    assert.ok(await evaluate(`!!document.querySelector('a[href*="audit-logs?target_id=${uid}"]')`),
      'account audit history deep link must retain this user UUID');
    console.log('USER360_AUDIT_DETAIL_AND_EXACT_TARGET_LINK_REAL_AAL2 PASS');
    const historyStart=feedbackReadUrls.length;
    await openRoute('feedback/history?user_id='+uid);
    try{
      await until(async()=>await evaluate("document.body.innerText.includes('该用户全部反馈')"),14000);
    }catch(error){
      const diagnostic=await evaluate(`(()=>({route:location.hash,
        heading:document.querySelector('h1')?.innerText??'none',
        hint:(()=>{const t=document.body.innerText;const i=t.indexOf('页面遇到了问题');return i>=0?t.slice(i,i+280):''})(),
        login:document.body.innerText.includes('使用平台管理员身份登录'),
        blocked:document.body.innerText.includes('已阻止无筛选的查询'),
        busy:document.body.innerText.includes('正在加载工作区')}))()`).catch(()=>null);
      console.error('USER360_FEEDBACK_ROUTE_DIAGNOSTIC '+JSON.stringify({
        ...diagnostic,feedbackRequests:feedbackReadUrls.length,
        browserErrors:runtimeErrors.slice(-3),feedbackResponses:feedbackResponses.slice(-4),
      }));
      throw error;
    }
    console.log('USER360_FEEDBACK_HISTORY_ROUTE_RENDERED_REAL_AAL2 PASS');
    await until(async()=>feedbackReadUrls.slice(historyStart)
      .some(url=>url.includes('user_id=eq.')&&url.includes(uid)),14000);
    const scopedFeedback=feedbackReadUrls.slice(historyStart)
      .filter(url=>url.includes('/rest/v1/admin_feedback_summaries?'));
    assert.ok(scopedFeedback.length>0&&scopedFeedback.every(url=>
      url.includes('user_id=eq.')&&url.includes(uid)),
      'user feedback history must never fetch a full-platform unfiltered list: '+JSON.stringify(
        scopedFeedback.map(url=>({filtered:url.includes('user_id=eq.'),hasOwner:url.includes(uid)}))));
    assert.ok(await evaluate("document.body.innerText.includes('返回用户综合详情')"),
      'user feedback record history must retain a path back to the same user');
    console.log('USER360_REAL_AAL2_FEEDBACK_ALL_QUEUES_USER_SCOPED PASS');
    const stageStart=feedbackReadUrls.length;
    await openRoute('feedback/history?user_id='+uid+'&queue_state=archived');
    await until(async()=>feedbackReadUrls.slice(stageStart).some(url=>
      url.includes('user_id=eq.')&&url.includes(uid)&&url.includes('queue_state=eq.archived')),14000);
    assert.ok(feedbackReadUrls.slice(stageStart).every(url=>
      url.includes('user_id=eq.')&&url.includes(uid)),
      'switching a user feedback stage must not strip identity scope');
    console.log('USER360_REAL_AAL2_FEEDBACK_ARCHIVE_STAGE_PRESERVES_TARGET PASS');
    await send('Emulation.setDeviceMetricsOverride',
      {width:320,height:720,deviceScaleFactor:1,mobile:true});
    await openRoute('feedback/history?user_id='+uid);
    await until(async()=>await evaluate("document.body.innerText.includes('该用户全部反馈')"),12000);
    const smallHistory=await evaluate(`(()=>({
      overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
      tabs:!!document.querySelector('[aria-label="该用户反馈阶段"]'),
      sameUser:document.body.innerText.includes(${JSON.stringify(uid)}),
    }))()`);
    assert.ok(smallHistory.overflow<=12&&smallHistory.tabs&&smallHistory.sameUser,
      '320px user-feedback history should stay in viewport: '+JSON.stringify(smallHistory));
    console.log('USER360_REAL_AAL2_FEEDBACK_HISTORY_320PX PASS');
    await send('Emulation.setDeviceMetricsOverride',
      {width:1440,height:900,deviceScaleFactor:1,mobile:false});
    const beforeInvalid=feedbackReadUrls.length;
    await openRoute('feedback/history?user_id=invalid-user-id');
    await until(async()=>await evaluate("document.body.innerText.includes('已阻止无筛选的查询')"),10000);
    await sleep(350);
    assert.equal(feedbackReadUrls.length,beforeInvalid,'invalid user UUID must not issue unfiltered feedback reads');
    console.log('USER360_REAL_AAL2_INVALID_FEEDBACK_USER_FAIL_CLOSED PASS');
    await openRoute('memberships');
    await until(async()=>await evaluate("document.body.innerText.includes('成员关系记录')"),12000);
    await searchEmail(qaEmail);
    await until(async()=>await evaluate("document.body.innerText.includes('共 0 条记录')"),14000);
    assert.ok(memberReadUrls.some(url=>url.includes('user_id=eq.')&&url.includes(uid)),
      'memberships must filter by verified user_id');
    console.log('CA05_MEMBERSHIP_EMAIL_REAL_AAL2 PASS');
    await openRoute('grants');
    await until(async()=>await evaluate("document.body.innerText.includes('授权记录')"),12000);
    await searchEmail(qaEmail);
    await until(async()=>await evaluate("document.body.innerText.includes('共 0 条记录')"),14000);
    const firstFiltered=grantReadUrls.slice();
    assert.ok(firstFiltered.some(url=>url.includes('user_id=eq.')&&url.includes(uid)),
      'grants must filter by verified user_id');
    const priorCount=grantReadUrls.length;
    await searchEmail('not-found-identity-qa@aisencore.test');
    await until(async()=>await evaluate("document.body.innerText.includes('未找到此邮箱的唯一注册账号')"),14000);
    await sleep(350);
    const missing=await evaluate(`(()=>({
      noRows:!document.querySelector('tbody tr'),
      refreshDisabled:!!document.querySelector('button[aria-label="刷新数据"]')?.disabled
    }))()`);
    assert.ok(missing.noRows&&missing.refreshDisabled,'missing identity must fail closed');
    assert.equal(grantReadUrls.length,priorCount,'unknown email may not trigger unfiltered grants read');
    console.log('CA06_EXACT_EMAIL_FAIL_CLOSED_REAL_AAL2 PASS');
    await openRoute('grant-new?user_id='+uid);
    await until(async()=>await evaluate("document.body.innerText.includes('已核实目标账号')"),12000);
    const grant=await evaluate(`(()=>({email:document.body.innerText.includes(${JSON.stringify(qaEmail)}),
      uuid:document.body.innerText.includes(${JSON.stringify(uid)}),
      noUuidInput:!document.body.innerText.includes('目标用户 UUID'),
      shortcut:document.body.innerText.includes('7 天')&&document.body.innerText.includes('365 天')
    }))()`);
    assert.ok(Object.values(grant).every(Boolean),'grant preselection and shortcuts');
    console.log('CA07_PRO_GRANT_PREFILL_REAL_AAL2 PASS');
    const preview=await evaluate(`(()=>({
      noDateControls:document.querySelectorAll('input[type="datetime-local"]').length===0,
      cannotSubmit:!![...document.querySelectorAll('button')].find(
        b=>b.innerText.includes('确认授予 Pro'))?.disabled
    }))()`);
    assert.ok(Object.values(preview).every(Boolean),
      'Pro form must not submit without verified product or allow date input: '+JSON.stringify(preview));
    console.log('GE19_20_PRO_FORM_NO_DATES_AND_UNSELECTED_PRODUCT_DENIED PASS');
    await openRoute('grant-new?user_id='+uid+'&product_id=invalid');
    await until(async()=>await evaluate("document.body.innerText.includes('用户中心传入的产品编号无效')"),10000);
    assert.ok(await evaluate("!![...document.querySelectorAll('button')].find(b=>b.innerText.includes('确认授予 Pro'))?.disabled"),
      'invalid product card context must never enable a grant');
    console.log('USER360_INVALID_PRO_CARD_PRODUCT_FAIL_CLOSED_REAL_AAL2 PASS');
    await openRoute('grant-new');
    await searchEmail(qaEmail);
    await until(async()=>await evaluate("document.body.innerText.includes('确认选择此用户')"),14000);
    await evaluate("([...document.querySelectorAll('button')].find(b=>b.innerText.includes('确认选择此用户'))).click()");
    await until(async()=>await evaluate("document.body.innerText.includes('已核实目标账号')"),12000);
    assert.ok(await evaluate(`document.body.innerText.includes(${JSON.stringify(uid)})`),
      'direct grant form must select the verified UUID, not an email string');
    console.log('CA08_DIRECT_EMAIL_TARGET_SELECTION_REAL_AAL2 PASS');
    await openRoute('account-actions?user_id='+uid);
    await until(async()=>await evaluate("document.body.innerText.includes('已核实目标账号')"),12000);
    const gov=await evaluate(`(()=>({verified:document.body.innerText.includes(${JSON.stringify(qaEmail)}),
      review:document.body.innerText.includes('核对目标与操作'),
      oldInput:document.body.innerText.includes('目标用户 UUID')}))()`);
    assert.ok(gov.verified&&gov.review&&!gov.oldInput,'governance must retain independent review');
    console.log('CA14_GOVERNANCE_PREFILL_REAL_AAL2 PASS');
    await until(async()=>await evaluate("document.body.innerText.includes('当前状态：平台账号')"),14000);
    const noopOpen=await evaluate("(()=>{const x=[...document.querySelectorAll('[role=combobox]')].find(e=>e.closest('.MuiFormControl-root')?.textContent?.includes('管理操作'));x?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));return !!x})()");
    assert.equal(noopOpen,true,'governance selector must be accessible');
    await until(async()=>await evaluate("!![...document.querySelectorAll('[role=option]')].find(e=>e.textContent?.includes('解除平台封禁'))"),10000);
    const noopChoice=await evaluate("(()=>{const x=[...document.querySelectorAll('[role=option]')].find(e=>e.textContent?.includes('解除平台封禁'));x?.click();return !!x})()");
    assert.equal(noopChoice,true,'no-op governance option must be selectable to show explanation');
    const noOp=await evaluate(`(()=>({notice:document.body.innerText.includes('无需重复提交'),
      reviewDisabled:[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('核对目标与操作'))?.disabled,
      submitDisabled:[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('提交管理操作'))?.disabled}))()`);
    assert.ok(noOp.notice&&noOp.reviewDisabled&&noOp.submitDisabled,
      'unblocked account cannot submit an unnecessary unblock command: '+JSON.stringify(noOp));
    console.log('U01_REAL_AAL2_GOVERNANCE_NOOP_BLOCKED PASS no unnecessary unblock submission');
    await send('Emulation.setDeviceMetricsOverride',
      {width:390,height:844,deviceScaleFactor:1,mobile:true});
    await openRoute('users');
    await searchEmail(qaEmail);
    await until(async()=>await evaluate("!!document.querySelector('button[aria-label=\"复制用户编号\"]')"),14000);
    const mobile=await evaluate(`(()=>({
      userId:document.body.innerText.includes(${JSON.stringify(uid)}),
      copyCount:document.querySelectorAll('button[aria-label="复制用户编号"]').length,
      overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-
        document.documentElement.clientWidth
    }))()`);
    assert.ok(mobile.userId&&mobile.copyCount===1&&mobile.overflow<=0,
      '390px mobile identity and copy must remain usable without horizontal overflow');
    console.log('CA12_MOBILE_COPY_LAYOUT_REAL_AAL2 PASS');
    identityUX={account,userShow,missing,grant,gov,mobile,pass:true};
  }else if(verifySpaTags){
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
    await until(async()=>await evaluate("document.body.innerText.includes('平台账号封禁与解封')"),12000);
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
  let profileError='';
  for(let retry=0;retry<45&&!profileDeleted;retry++){
    try{rmSync(profile,{force:true,recursive:true,maxRetries:3,retryDelay:200});profileDeleted=true;}
    catch(error){profileError=String(error?.code??error?.message??error);await sleep(1100)}
  }
  if(!profileDeleted){failures.push('profile deletion');console.error('QA_PROFILE_CLEANUP FAILED '+profileError);}
  const safe={context:'temporary local AAL2 admin; production preview; read-only business queries artificially paused by CDP; no credentials/data retained',
    createdAt:'2026-10-28',results,lazyRoute,revocation,spaTags,identityUX,a11y,pass:!primaryError&&failures.length===0,
    limitations:['Synthetic local fixture; no real-user p75/p95','Only GET paused; not application request latency','No data-volume stress test','No manual screen-reader or owner signoff']};
  writeFileSync(join(root,'docs','Plans','aisencore-mvp','ui-evidence',verifyScroll?
    'admin-global-table-scroll-2026-10-29.json':verifyIdentityUX?
    'admin-identity-ux-2026-10-28.json':verifySpaTags?
    'admin-perf-spa-tags-2026-10-28.json':verifyRevocation?
    'admin-perf-aal2-revocation-2026-10-28.json':verifyPendingAxe?
    'admin-perf-aal2-loading-axe-2026-10-28.json':'admin-perf-aal2-readonly-2026-10-28.json'),JSON.stringify(safe,null,2));
  if(primaryError||failures.length)process.exitCode=1;
}

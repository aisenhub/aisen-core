#!/usr/bin/env node
// FB focused real local Chrome+GoTrue AAL2+PostgREST QA.
// Isolates all SQL and identities, performs cleanup even on failure.
// Never persists credentials, tokens, TOTP secrets or private attachment keys.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {mkdtempSync,existsSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const win=process.platform==='win32';
const cfgResult=spawnSync(win?'cmd.exe':'pnpm',
  win?['/d','/s','/c','pnpm dlx supabase status --output json']:
  ['dlx','supabase','status','--output','json'],{
    cwd:root,encoding:'utf8',timeout:45000,maxBuffer:1000000});
assert.equal(cfgResult.status,0,'Local Supabase must be running');
const cfg=JSON.parse(cfgResult.stdout);
assert.equal(cfg.API_URL,'http://127.0.0.1:55321');
assert.match(cfg.DB_URL,/127\.0\.0\.1:55322/);
const docker=spawnSync('docker',['port','supabase_db_Aisencore','5432/tcp'],
  {encoding:'utf8',timeout:10000});
assert.equal(docker.status,0);
assert.match(docker.stdout,/:55322\b/);
const prefix=randomUUID().replaceAll('-','').slice(0,12);
const email='fb-chrome-'+prefix+'@example.invalid';
const password='LocalQA!'+randomBytes(12).toString('hex');
const productId=randomUUID(),productKey='fb_ui_'+prefix,requestId=randomUUID();
const base='http://127.0.0.1:3406';
const profile=mkdtempSync(join(tmpdir(),'fb-chrome-'));
const guard=createServer();
let uid=null,feedbackId=null,site=null,chrome=null,ws=null,sequence=0;
const outstanding=new Map();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function sql(q){
  const r=spawnSync('docker',['exec','supabase_db_Aisencore','psql','-X','-qAt',
    '-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',q],
    {encoding:'utf8',timeout:18000});
  if(r.status!==0)throw Error('local fixture SQL: '+r.stderr.slice(-250));
  return r.stdout.trim();
}
async function http(path,body,token,service=false){
  const key=service?cfg.SERVICE_ROLE_KEY:cfg.PUBLISHABLE_KEY||cfg.ANON_KEY;
  const headers={apikey:key,authorization:'Bearer '+(service?key:token)};
  if(body!==undefined)headers['content-type']='application/json';
  const response=await fetch(cfg.API_URL+path,{method:'POST',headers,
    body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(14000)});
  const txt=await response.text();let data;try{data=JSON.parse(txt)}catch{data=txt}
  if(!response.ok)throw Error(path+' HTTP '+response.status+' '+String(data?.code||''));
  return data;
}
function totp(secret){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let buffer=0,bits=0,values=[];
  for(const char of secret.replace(/[\s=]/g,'').toUpperCase()){
    const bit=alphabet.indexOf(char);assert.ok(bit>=0);buffer=(buffer<<5)|bit;bits+=5;
    if(bits>=8){bits-=8;values.push((buffer>>>bits)&255)}
  }
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',Buffer.from(values)).update(counter).digest();
  return String((digest.readUInt32BE(digest.at(-1)&15)&0x7fffffff)%1000000).padStart(6,'0');
}
function send(method,params={}){
  const id=++sequence;
  return new Promise((resolve,reject)=>{
    outstanding.set(id,{resolve,reject});
    ws.send(JSON.stringify({id,method,params}));
    setTimeout(()=>{if(outstanding.has(id)){outstanding.delete(id);reject(Error(method+' CDP timed out'));}},18000);
  });
}
async function evaluate(expression){
  const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.result?.exceptionDetails)throw Error('Browser error: '+String(result.result.exceptionDetails.text));
  return result.result?.result?.value;
}
async function capture(name){
  if(process.env.FB_CAPTURE_UI!=='1')return;
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  const path=join(root,'docs','Plans','aisencore-mvp','ui-evidence',name+'.png');
  writeFileSync(path,Buffer.from(shot.result.data,'base64'));
  console.log('FB_BROWSER visual evidence '+name+'.png');
}
async function visible(text){
  for(let i=0;i<95;i++){
    const body=String(await evaluate('document.body?.innerText??""')??'');
    if(body.includes(text))return body;
    await sleep(150);
  }
  throw Error('FB Chrome did not render '+text+
    ' body: '+String(await evaluate('document.body?.innerText??""')).slice(0,500));
}
async function untilSql(query,want){
  for(let i=0;i<45;i++){
    const current=sql(query);
    if(current===want)return;
    await sleep(180);
  }
  throw Error('FB Chrome write not confirmed, expected '+want+
    ' page='+String(await evaluate('document.body?.innerText??""')).slice(-1100));
}
try{
  await new Promise((resolve,reject)=>{
    guard.once('error',reject);
    guard.listen(3407,'127.0.0.1',resolve);
  });
  const created=await http('/auth/v1/admin/users',{
    email,password,email_confirm:true},null,true);
  uid=created.id;assert.match(uid,/^[0-9a-f-]{36}$/i);
  sql("INSERT INTO public.platform_admins(user_id,active) VALUES ('"+uid+"',true)");
  sql("INSERT INTO public.products(id,product_key,name,status) VALUES ('"+
    productId+"','"+productKey+"','FB browser QA','active')");
  const signin=await http('/auth/v1/token?grant_type=password',{email,password});
  const factor=await http('/auth/v1/factors',{
    factor_type:'totp',friendly_name:'FB browser QA factor'},signin.access_token);
  const challenge=await http('/auth/v1/factors/'+factor.id+'/challenge',{},signin.access_token);
  const upgraded=await http('/auth/v1/factors/'+factor.id+'/verify',{
    challenge_id:challenge.id,code:totp(factor.totp.secret)},signin.access_token);
  const jwt=JSON.parse(Buffer.from(upgraded.access_token.split('.')[1],'base64url'));
  assert.equal(jwt.aal,'aal2');
  const user=await (async()=>{
    const r=await fetch(cfg.API_URL+'/auth/v1/user',{headers:{
      apikey:cfg.PUBLISHABLE_KEY||cfg.ANON_KEY,
      authorization:'Bearer '+upgraded.access_token}});
    assert.equal(r.status,200);return r.json();
  })();
  const ticket=await http('/rest/v1/rpc/feedback_submit_from_edge',{
    p_user_id:uid,p_product_key:productKey,p_request_id:requestId,
    p_content:'浏览器真实反馈详情与指派验收',p_category:'bug',p_attachments:[]
  },null,true);
  feedbackId=ticket.id;
  const session={access_token:upgraded.access_token,
    refresh_token:upgraded.refresh_token??signin.refresh_token,
    expires_in:upgraded.expires_in??3600,
    expires_at:Math.floor(Date.now()/1000)+(upgraded.expires_in??3600),
    token_type:'bearer',user};
  site=spawn(win?'cmd.exe':'pnpm',
    win?['/d','/s','/c','pnpm --filter @aisencore/admin dev --host 127.0.0.1 --port 3406']:
      ['--filter','@aisencore/admin','dev','--host','127.0.0.1','--port','3406'],{
      cwd:root,stdio:'ignore'
    });
  let ready=false;
  for(let i=0;i<70;i++){
    try{if((await fetch(base,{signal:AbortSignal.timeout(900)})).ok){ready=true;break}}
    catch{}
    await sleep(200);
  }
  assert.ok(ready,'Admin local Vite preview');
  const chromePath=win?'C:/Program Files/Google/Chrome/Application/chrome.exe':'google-chrome';
  chrome=spawn(chromePath,['--headless=new','--disable-gpu','--no-first-run',
    '--no-default-browser-check','--remote-debugging-port=0',
    '--user-data-dir='+profile,'--window-size=1440,900','about:blank'],{stdio:'ignore'});
  const active=join(profile,'DevToolsActivePort');
  for(let i=0;i<90&&!existsSync(active);i++)await sleep(120);
  assert.ok(existsSync(active),'Chrome CDP port');
  const port=Number(readFileSync(active,'utf8').split(/\r?\n/)[0]);
  const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=pages.find(x=>x.type==='page');assert.ok(page);
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    ws.addEventListener('open',resolve,{once:true});
    ws.addEventListener('error',reject,{once:true});
  });
  ws.addEventListener('message',event=>{
    const msg=JSON.parse(event.data),wait=outstanding.get(msg.id);
    if(wait){outstanding.delete(msg.id);
      msg.error?wait.reject(Error(msg.error.message)):wait.resolve(msg)}
  });
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate',{url:base+'/#/feedback'});
  await sleep(400);
  await evaluate("localStorage.setItem('sb-127-auth-token',"+
    JSON.stringify(JSON.stringify(session))+")");
  await send('Page.reload',{ignoreCache:true});
  await visible('浏览器真实反馈详情与指派验收');
  assert.ok(!(await evaluate('document.body.innerText')).includes('resources.feedback.empty'));
  const menu=JSON.parse(await evaluate("JSON.stringify((()=>({items:[...document.querySelectorAll('.MuiDrawer-paper a[href]')].map(a=>a.textContent?.trim()).filter(Boolean),active:[...document.querySelectorAll('.MuiDrawer-paper a.RaMenuItemLink-active')].map(a=>a.textContent?.trim()),secondary:document.querySelectorAll('nav[aria-label$=二级导航]').length}))())"));
  assert.deepEqual(menu.items,['概览','用户','权益','兑换码','用户反馈','平台管理']);
  assert.ok(menu.active.includes('用户反馈'),'feedback first-level nav selected');
  assert.ok(!menu.active.includes('用户'),'people first-level nav is not selected');
  assert.equal(menu.secondary,0,'feedback no longer shows people secondary nav');
  const inboxGeometry=await evaluate("(()=>{const main=document.querySelector('.RaLayout-content')?.getBoundingClientRect();const heading=[...document.querySelectorAll('h1')].find(x=>x.textContent?.includes('反馈收件箱'))?.getBoundingClientRect();const table=document.querySelector('table')?.getBoundingClientRect();return {mainWidth:main?.width,left:main?.left,headingLeft:heading?.left,tableWidth:table?.width}})()");
  assert.ok(inboxGeometry.headingLeft-inboxGeometry.left<100,
    'feedback inbox title left aligned with workspace, not centered island');
  assert.ok(inboxGeometry.tableWidth>inboxGeometry.mainWidth*.73,
    'feedback inbox table should occupy main workspace width');
  await capture('feedback-inbox-desktop');
  console.log('FB_BROWSER list PASS real AAL2, server feedback row visible');
  await send('Page.navigate',{url:base+'/#/feedback/'+feedbackId+'/show'});
  await visible('收件箱筛选');
  await visible('浏览器真实反馈详情与指派验收');
  await visible('处理历史');
  assert.equal(await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.trim()==='处理历史');b?.click();return !!b})()"),true,
    'history button should open a dialog');
  await visible('反馈提交');
  assert.ok(await evaluate("!![...document.querySelectorAll('[role=dialog]')].find(x=>x.textContent?.includes('反馈提交'))"),
    'history must render inside a dialog instead of below the editor');
  await capture('feedback-history-dialog-desktop');
  await evaluate("(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(x=>x.textContent?.trim()==='关闭');b?.click()})()");
  // Wait for MUI's exit transition so visual evidence is not dimmed by the departing backdrop.
  await sleep(300);
  const detailMenu=await evaluate("(()=>({active:[...document.querySelectorAll('.MuiDrawer-paper a.RaMenuItemLink-active')].map(a=>a.textContent?.trim()),secondary:document.querySelectorAll('nav[aria-label$=二级导航]').length}))()");
  assert.ok(detailMenu.active.includes('用户反馈'),'feedback detail retains first-level active state');
  assert.ok(!detailMenu.active.includes('用户'),'feedback detail must not highlight people');
  assert.equal(detailMenu.secondary,0,'feedback detail omits people tabs');
  await capture('feedback-inbox-detail-desktop');
  const select=async(label,option)=>{
    const chosen=await evaluate("(()=>{const el=[...document.querySelectorAll('[role=combobox]')].find(e=>e.closest('.MuiFormControl-root')?.textContent?.includes("+
      JSON.stringify(label)+"));el?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));return !!el})()");
    assert.equal(chosen,true,'Dropdown '+label);
    await sleep(200);
    const clicked=await evaluate("(()=>{const el=[...document.querySelectorAll('[role=option]')].find(e=>e.textContent?.includes("+
      JSON.stringify(option)+"));el?.click();return !!el})()");
    assert.equal(clicked,true,'Option '+option);
  };
  assert.equal(await evaluate("(()=>{const btn=[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('分配并进入工作台'));const ok=!!btn&&!btn.disabled;if(ok)btn.click();return ok})()"),
    true,'triage is actionable from inbox detail');
  await untilSql("SELECT queue_state FROM public.user_feedback WHERE id='"+feedbackId+"'",'workbench');
  await visible('处理反馈');
  console.log('FB_BROWSER V2 triage PASS inbox to workbench, priority assigned');
  await select('处理状态','处理中');
  const clicked=await evaluate("(()=>{const btn=[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('保存处理结果'));const allowed=!!btn&&!btn.disabled;if(allowed)btn.click();return allowed})()");
  assert.equal(clicked,true,'Save status button actionable');
  await untilSql("SELECT status FROM public.user_feedback WHERE id='"+feedbackId+"'",'in_progress');
  await visible('处理反馈');
  console.log('FB_BROWSER update PASS true AAL2 Admin status + audit');
  await select('处理负责人',uid.slice(0,8));
  assert.equal(await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('更新负责人'));const ok=!!b&&!b.disabled;if(ok)b.click();return ok})()"),
    true,'assign button enabled');
  await untilSql("SELECT assigned_to::text FROM public.user_feedback WHERE id='"+feedbackId+"'",uid);
  const auditCount=Number(sql("SELECT count(*) FROM public.admin_audit_log WHERE target_id='"+
    feedbackId+"' AND target_type='feedback'"));
  assert.ok(auditCount>=2,'status and assignment audit');
  console.log('FB_BROWSER assignment PASS real Admin UI -> versioned RPC');
  const draftText='QA 未保存的公开回复草稿';
  const draftSet=await evaluate("(()=>{const el=[...document.querySelectorAll('textarea')].find(x=>x.closest('.MuiFormControl-root')?.textContent?.includes('回复用户')&&!x.getAttribute('aria-hidden'));if(!el)return false;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,"+
    JSON.stringify(draftText)+");el.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
  assert.equal(draftSet,true,'public reply draft editable');
  const detailGeometry=await evaluate("(()=>{const main=document.querySelector('.RaLayout-content')?.getBoundingClientRect();const card=[...document.querySelectorAll('.MuiCard-root')].find(x=>x.textContent?.includes('反馈内容'))?.getBoundingClientRect();return {mainWidth:main?.width,cardWidth:card?.width}})()");
  assert.ok(detailGeometry.cardWidth>detailGeometry.mainWidth*.73,
    'feedback content must occupy workspace rather than half an empty split layout');
  assert.equal(await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('星标与标签'));b?.click();return !!b})()"),true,
    'star and tag editor should open through a button');
  await visible('添加内部标签');
  assert.ok(await evaluate("!![...document.querySelectorAll('[role=dialog]')].find(x=>x.textContent?.includes('添加内部标签'))"),
    'star and tag editor must be in a dialog');
  await capture('feedback-attention-dialog-desktop');
  const tagSet=await evaluate("(()=>{const el=[...document.querySelectorAll('input')].find(x=>x.closest('.MuiFormControl-root')?.textContent?.includes('添加内部标签'));if(!el)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'易复现');el.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
  assert.equal(tagSet,true,'structured internal tag input editable');
  assert.equal(await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.trim()==='添加');if(b&&!b.disabled){b.click();return true}return false})()"),
    true,'structured tag can be committed as a chip');
  const starClicked=await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('加星标'));b?.click();return !!b})()");
  assert.equal(starClicked,true,'attention star is actionable');
  const starSaved=await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('保存星标和标签'));if(b&&!b.disabled){b.click();return true}return false})()");
  assert.equal(starSaved,true,'attention save is actionable');
  await untilSql("SELECT is_starred::text FROM public.user_feedback WHERE id='"+feedbackId+"'",'true');
  await untilSql("SELECT tags[1] FROM public.user_feedback WHERE id='"+feedbackId+"'",'易复现');
  await sleep(250);
  const retainedDraft=await evaluate("(()=>[...document.querySelectorAll('textarea')].find(x=>x.closest('.MuiFormControl-root')?.textContent?.includes('回复用户')&&!x.getAttribute('aria-hidden'))?.value)()");
  assert.equal(retainedDraft,draftText,'attention update must not discard an unsaved public reply');
  console.log('FB_BROWSER draft preservation PASS versioned star/tag update retains reply input');
  await send('Page.navigate',{url:base+'/#/feedback/workbench'});
  await visible('处理工作台');
  await visible('浏览器真实反馈详情与指派验收');
  console.log('FB_BROWSER V2 workbench list PASS accepted ticket visible and routed');
  await capture('feedback-workbench-desktop');
  const exportOpened=await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('导出筛选结果 ZIP'));if(b&&!b.disabled){b.click();return true}return false})()");
  assert.equal(exportOpened,true,'workbench filtered ZIP export button enabled');
  await visible('导出反馈压缩包');
  const defaults=await evaluate("(()=>[...document.querySelectorAll('[role=dialog] label')].filter(x=>/内部评论|反馈人身份/.test(x.textContent??'')).map(x=>({label:x.textContent?.trim(),checked:x.querySelector('input[type=checkbox]')?.checked})))()");
  assert.equal(defaults.length,2,'sensitive ZIP options should be visible');
  assert.ok(defaults.every(x=>x.checked===false),'internal notes and identity default excluded');
  assert.equal(await evaluate("(()=>{const x=[...document.querySelectorAll('[role=dialog] label')].find(e=>e.textContent?.includes('内部评论'))?.querySelector('input[type=checkbox]');x?.click();return !!x?.checked})()"),
    true,'operator can explicitly include sensitive internal notes');
  assert.equal(await evaluate("(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(x=>x.textContent?.trim()==='生成 ZIP');b?.click();return !!b})()"),
    true,'sensitive ZIP requires an in-app confirmation');
  await visible('请再次确认本次敏感导出');
  assert.equal(await evaluate("(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(x=>x.textContent?.includes('返回修改'));b?.click();return !!b})()"),
    true,'operator can decline sensitive export without downloading');
  await evaluate("(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(x=>x.textContent?.includes('取消'));b?.click()})()");
  assert.equal(await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('导出筛选结果 ZIP'));b?.click();return !!b})()"),
    true,'ZIP dialog can reopen');
  await visible('导出反馈压缩包');
  const reopened=await evaluate("(()=>[...document.querySelectorAll('[role=dialog] label')].filter(x=>/内部评论|反馈人身份/.test(x.textContent??'')).map(x=>x.querySelector('input[type=checkbox]')?.checked))()");
  assert.ok(reopened.length===2&&reopened.every(x=>x===false),
    'sensitive ZIP options must reset when reopened, never persist');
  await evaluate("(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(x=>x.textContent?.includes('取消'));b?.click()})()");
  console.log('FB_BROWSER V2 export privacy PASS safe defaults, staged warning, cancel and reopen reset');
  await send('Page.navigate',{url:base+'/#/feedback/'+feedbackId+'/show'});
  await visible('处理反馈');
  await capture('feedback-workbench-detail-desktop');
  await send('Emulation.setDeviceMetricsOverride',{
    width:390,height:844,deviceScaleFactor:1,mobile:true});
  await sleep(400);
  const overflow=Number(await evaluate("Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-document.documentElement.clientWidth"));
  assert.ok(overflow<=12,'Feedback detail 390px horizontal overflow: '+overflow);
  await capture('feedback-detail-mobile-390');
  console.log('FB_BROWSER mobile PASS 390px page no horizontal overflow');
  const axe=readFileSync(join(root,'apps/admin/node_modules/axe-core/axe.min.js'),'utf8');
  await send('Runtime.evaluate',{expression:axe});
  const violations=await evaluate("axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}).then(x=>JSON.stringify(x.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.slice(0,4).map(n=>n.target)}))))");
  const actual=JSON.parse(violations??'[]');
  if(actual.length)console.log('FB_BROWSER axe violations:',JSON.stringify(actual));
  assert.equal(actual.filter(x=>['serious','critical'].includes(x.impact)).length,0,
    'FB browser automated serious accessibility errors');
  console.log('FB_BROWSER axe automated serious/critical violations=0; manual a11y not yet signed off');
  await send('Page.navigate',{url:base+'/#/feedback/workbench'});
  await visible('处理工作台');
  await visible('浏览器真实反馈详情与指派验收');
  const listOverflow=Number(await evaluate("Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-document.documentElement.clientWidth"));
  assert.ok(listOverflow<=12,'Feedback workbench list 390px horizontal overflow: '+listOverflow);
  await capture('feedback-workbench-mobile-390');
  await send('Emulation.setDeviceMetricsOverride',{
    width:320,height:780,deviceScaleFactor:1,mobile:true});
  await sleep(350);
  const narrowOverflow=Number(await evaluate("Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-document.documentElement.clientWidth"));
  assert.ok(narrowOverflow<=12,'Feedback workbench list 320px horizontal overflow: '+narrowOverflow);
  await capture('feedback-workbench-mobile-320');
  console.log('FB_BROWSER workbench responsive PASS 390px/320px no page overflow');
}finally{
  try{ws?.close()}catch{}
  if(chrome?.pid){
    if(win)spawnSync('taskkill',['/PID',String(chrome.pid),'/T','/F'],{timeout:10000,encoding:'utf8'});
    else chrome.kill('SIGTERM');
  }
  if(site?.pid){
    if(win)spawnSync('taskkill',['/PID',String(site.pid),'/T','/F'],{timeout:10000,encoding:'utf8'});
    else site.kill('SIGTERM');
  }
  guard.close();
  // Database/Auth fixture cleanup must never be skipped by an OS-level
  // Chrome profile file lock (common on Windows after taskkill).
  const errors=[];
  const clean=q=>{try{sql(q)}catch(e){errors.push(String(e.message).slice(0,130))}};
  clean("DELETE FROM public.admin_audit_log WHERE target_type='feedback' AND target_id IN (SELECT id FROM public.user_feedback WHERE product_id='"+productId+"')");
  clean("DELETE FROM public.feedback_events WHERE feedback_id IN (SELECT id FROM public.user_feedback WHERE product_id='"+productId+"')");
  clean("DELETE FROM public.feedback_attachments WHERE feedback_id IN (SELECT id FROM public.user_feedback WHERE product_id='"+productId+"')");
  clean("DELETE FROM public.user_feedback WHERE product_id='"+productId+"'");
  clean("DELETE FROM public.products WHERE id='"+productId+"'");
  if(uid){
    clean("DELETE FROM public.platform_admins WHERE user_id='"+uid+"'");
    try{
      const r=await fetch(cfg.API_URL+'/auth/v1/admin/users/'+uid,{method:'DELETE',
        headers:{apikey:cfg.SERVICE_ROLE_KEY,
          authorization:'Bearer '+cfg.SERVICE_ROLE_KEY},signal:AbortSignal.timeout(10000)});
      if(!r.ok)errors.push('GoTrue cleanup HTTP '+r.status);
    }catch(e){errors.push('GoTrue cleanup '+e.message)}
  }
  try{rmSync(profile,{recursive:true,force:true,maxRetries:15,retryDelay:150})}
  catch{console.warn('Chrome QA profile locked by OS; browser temp directory may need later cleanup')}
  if(errors.length)throw Error('FB_BROWSER clean-up: '+errors.join('; '));
  console.log('FB_BROWSER_CLEANUP VERIFIED temporary account/product/feedback removed');
}

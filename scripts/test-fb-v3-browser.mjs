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
    p_content:'浏览器真实反馈详情与指派验收',p_category:'bug',p_attachments:[],p_contact_email:'fixture@example.com'
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
  const second=await http('/rest/v1/rpc/feedback_submit_from_edge',{
    p_user_id:uid,p_product_key:productKey,p_request_id:randomUUID(),
    p_content:'收件箱删除恢复测试',p_category:'suggestion',p_attachments:[],p_contact_email:'fixture@example.com'
  },null,true);
  await send('Page.navigate',{url:base+'/#/feedback'});
  await sleep(400);
  await evaluate("localStorage.setItem('sb-127-auth-token',"+JSON.stringify(JSON.stringify(session))+")");
  await send('Page.reload',{ignoreCache:true});
  await visible('浏览器真实反馈详情与指派验收');
  await visible('已归档');
  await visible('回收站');
  const toolbar=await evaluate("(()=>{const forms=[...document.querySelectorAll('.MuiFormControl-root')];const y=name=>forms.find(e=>e.textContent?.includes(name))?.getBoundingClientRect().top;const zip=[...document.querySelectorAll('button')].find(e=>e.textContent?.includes('导出筛选结果 ZIP'))?.getBoundingClientRect().top;return [y('优先级'),y('星标'),y('标签筛选'),zip]})()");
  console.log('FB_V3_BROWSER toolbar geometry',JSON.stringify(toolbar));
  assert.ok(toolbar.every(x=>typeof x==='number')&&Math.max(...toolbar)-Math.min(...toolbar)<32,
    'desktop priority/star/tags/ZIP controls must share a single toolbar row');
  await capture('feedback-v3-inbox-desktop');
  console.log('FB_V3_BROWSER four queue tabs PASS');
  // UI-08: opening/reopening a ZIP export must never persist sensitive flags.
  const openZip=await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('导出筛选结果 ZIP'));if(b&&!b.disabled){b.click();return true}return false})()");
  assert.equal(openZip,true,'local QA feedback with two rows supports filtered export review');
  await visible('导出反馈压缩包');
  const sensitiveUnchecked=await evaluate("(()=>{const x=[...document.querySelectorAll('[role=dialog] label')].filter(e=>e.textContent?.includes('内部评论')||e.textContent?.includes('包含反馈人身份'));return x.length===2&&x.every(e=>!e.querySelector('input')?.checked)})()");
  assert.equal(sensitiveUnchecked,true,'both sensitive options must be unchecked by default');
  const chooseNotes=await evaluate("(()=>{const e=[...document.querySelectorAll('[role=dialog] label')].find(e=>e.textContent?.includes('内部评论'));e?.querySelector('input')?.click();return !!e})()");
  assert.equal(chooseNotes,true,'sensitive notes option selectable');
  assert.equal(await evaluate("(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(x=>x.textContent?.trim()==='生成 ZIP');b?.click();return !!b})()"),true,
    'first sensitive submit opens confirmation instead of exporting');
  await visible('请再次确认本次敏感导出');
  assert.equal(await evaluate("(()=>{const x=[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent?.includes('返回修改'));x?.click();return !!x})()"),true);
  assert.equal(await evaluate("(()=>{const x=[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent?.trim()==='取消');x?.click();return !!x})()"),true);
  await sleep(250);
  assert.equal(await evaluate("(()=>{const x=[...document.querySelectorAll('button')].find(e=>e.textContent?.includes('导出筛选结果 ZIP'));x?.click();return !!x})()"),true);
  await visible('导出反馈压缩包');
  assert.equal(await evaluate("(()=>{const x=[...document.querySelectorAll('[role=dialog] label')].filter(e=>e.textContent?.includes('内部评论')||e.textContent?.includes('包含反馈人身份'));return x.length===2&&x.every(e=>!e.querySelector('input')?.checked)})()"),true,
    'reopened ZIP export must clear previous sensitive approval');
  // Simulate the header selector changing during a modal review (ordinary
  // pointer clicks are blocked by the modal backdrop). The approval must not
  // silently transfer to another product even when both scopes have 2 rows.
  const selector=await evaluate("(()=>{const x=[...document.querySelectorAll('[role=combobox]')].find(e=>e.getAttribute('aria-label')?.startsWith('切换管理产品范围'));x?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));return !!x})()");
  assert.equal(selector,true,'header product selector exists under the export modal');
  await sleep(160);
  const picked=await evaluate("(()=>{const x=[...document.querySelectorAll('[role=option]')].find(e=>e.textContent?.includes('FB browser QA'));x?.click();return !!x})()");
  assert.equal(picked,true,'isolated QA product available as changed export scope');
  await visible('页面范围已变化');
  const disabledSubmit=await evaluate("(()=>{const d=[...document.querySelectorAll('[role=dialog]')].find(x=>x.textContent?.includes('导出反馈压缩包'));const b=[...(d?.querySelectorAll('button')??[])].find(x=>x.textContent?.includes('生成 ZIP'));return !!b&&b.disabled})()");
  assert.equal(disabledSubmit,true,'changed product scope must invalidate previous export review');
  await evaluate("(()=>[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent?.trim()==='取消')?.click())()");
  console.log('UI08_EXPORT_REVIEW PASS default flags, two-step confirmation, reset and scope-drift guard');
  await send('Page.navigate',{url:base+'/#/feedback/'+feedbackId+'/show'});
  await visible('加入处理工作台');
  assert.ok(!(await evaluate('document.body.innerText')).includes('更新负责人'));
  assert.ok(!(await evaluate('document.body.innerText')).includes('回复用户'));
  const changed=await evaluate("(()=>{const el=[...document.querySelectorAll('select')].find(x=>x.closest('.MuiFormControl-root')?.textContent?.includes('优先级'));if(!el)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,'high');el.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
  assert.equal(changed,true,'Priority selector editable in inbox');
  const star=await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.trim()==='星标');b?.click();return !!b})()");
  assert.equal(star,true,'Star toggle available in inbox');
  const note=await evaluate("(()=>{const el=[...document.querySelectorAll('textarea')].find(x=>x.closest('.MuiFormControl-root')?.textContent?.includes('内部备注'));if(!el)return false;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'V3 浏览器内部记录');el.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
  assert.equal(note,true,'Private note available in inbox');
  const saved=await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('保存标记与备注'));if(b&&!b.disabled){b.click();return true}return false})()");
  assert.equal(saved,true,'Save inbox pretriage');
  await untilSql("SELECT priority FROM public.user_feedback WHERE id='"+feedbackId+"'",'high');
  await untilSql("SELECT is_starred::text FROM public.user_feedback WHERE id='"+feedbackId+"'",'true');
  assert.equal(sql("SELECT count(*) FROM public.feedback_events WHERE feedback_id='"+feedbackId+"' AND event_type='internal_note'"),'1');
  console.log('FB_V3_BROWSER inbox pre-triage PASS');
  await sleep(500);
  const promoted=await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('加入处理工作台'));if(b&&!b.disabled){b.click();return true}return false})()");
  assert.equal(promoted,true,'Triage button actionable');
  await untilSql("SELECT queue_state FROM public.user_feedback WHERE id='"+feedbackId+"'",'workbench');
  await send('Page.navigate',{url:base+'/#/feedback/workbench'});
  await visible('浏览器真实反馈详情与指派验收');
  await capture('feedback-v3-workbench-desktop');
  console.log('FB_V3_BROWSER workbench PASS');
  await send('Page.navigate',{url:base+'/#/feedback/'+feedbackId+'/show'});
  await visible('归档反馈');
  const remove=await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('移入回收站'));b?.click();return !!b})()");
  assert.equal(remove,true,'Workbench delete button');
  await visible('移入回收站？');
  assert.equal(await evaluate("(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(x=>x.textContent?.includes('确认移入'));b?.click();return !!b})()"),true);
  await untilSql("SELECT queue_state FROM public.user_feedback WHERE id='"+feedbackId+"'",'trashed');
  assert.equal(sql("SELECT deleted_from FROM public.user_feedback WHERE id='"+feedbackId+"'"),'workbench');
  await visible('恢复到删除前位置');
  assert.equal(await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('恢复到删除前位置'));b?.click();return !!b})()"),true);
  await untilSql("SELECT queue_state FROM public.user_feedback WHERE id='"+feedbackId+"'",'workbench');
  await visible('归档反馈');
  assert.equal(await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('归档反馈'));b?.click();return !!b})()"),true);
  await untilSql("SELECT queue_state FROM public.user_feedback WHERE id='"+feedbackId+"'",'archived');
  await visible('重新进入工作台');
  assert.equal(await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('重新进入工作台'));b?.click();return !!b})()"),true);
  await untilSql("SELECT queue_state FROM public.user_feedback WHERE id='"+feedbackId+"'",'workbench');
  console.log('FB_V3_BROWSER trash restore archive reopen PASS');
  await send('Page.navigate',{url:base+'/#/feedback/'+second.id+'/show'});
  await visible('收件箱删除恢复测试');
  await visible('移入回收站');
  await evaluate("(()=>[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('移入回收站'))?.click())()");
  await visible('移入回收站？');
  await evaluate("(()=>[...document.querySelectorAll('[role=dialog] button')].find(x=>x.textContent?.includes('确认移入'))?.click())()");
  await untilSql("SELECT queue_state FROM public.user_feedback WHERE id='"+second.id+"'",'trashed');
  await visible('恢复到删除前位置');
  await evaluate("(()=>[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('恢复到删除前位置'))?.click())()");
  await untilSql("SELECT queue_state FROM public.user_feedback WHERE id='"+second.id+"'",'inbox');
  await send('Page.navigate',{url:base+'/#/feedback/trash'});
  await visible('回收站');
  await capture('feedback-v3-trash-desktop');
  await send('Page.navigate',{url:base+'/#/feedback/workbench'});
  await visible('浏览器真实反馈详情与指派验收');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await sleep(400);
  const overflow=Number(await evaluate("Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-document.documentElement.clientWidth"));
  assert.ok(overflow<=12,'V3 workbench overflow 390px '+overflow);
  await capture('feedback-v3-mobile-390');
  console.log('FB_V3_BROWSER 390px no horizontal overflow PASS');
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:780,deviceScaleFactor:1,mobile:true});
  await sleep(350);
  const narrowOverflow=Number(await evaluate("Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-document.documentElement.clientWidth"));
  assert.ok(narrowOverflow<=12,'V3 workbench overflow 320px '+narrowOverflow);
  await send('Page.navigate',{url:base+'/#/feedback/'+feedbackId+'/show'});
  await visible('处理反馈');
  const detailOverflow=Number(await evaluate("Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-document.documentElement.clientWidth"));
  assert.ok(detailOverflow<=12,'V3 detail overflow 320px '+detailOverflow);
  const historyButton=await evaluate("(()=>{const button=[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('处理历史'));button?.click();return !!button})()");
  assert.equal(historyButton,true,'History is accessible from detail');
  await visible('处理历史');
  assert.equal(await evaluate("!![...document.querySelectorAll('[role=dialog]')].find(x=>x.textContent?.includes('处理历史'))"),true,
    'History must be shown in modal');
  const axe=readFileSync(join(root,'apps/admin/node_modules/axe-core/axe.min.js'),'utf8');
  await send('Runtime.evaluate',{expression:axe});
  const a11y=JSON.parse(await evaluate("axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}).then(x=>JSON.stringify(x.violations.map(v=>({id:v.id,impact:v.impact}))))"));
  assert.deepEqual(a11y.filter(x=>['serious','critical'].includes(x.impact)),[],
    'V3 detail history modal must have no serious/critical automated WCAG violations');
  await evaluate("(()=>[...document.querySelectorAll('[role=dialog] button')].find(x=>x.textContent?.trim()==='关闭')?.click())()");
  console.log('FB_V3_BROWSER 320px workbench/detail and history modal PASS');
  await send('Emulation.setDeviceMetricsOverride',{width:768,height:900,deviceScaleFactor:1,mobile:false});
  await sleep(300);
  const midOverflow=Number(await evaluate("Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-document.documentElement.clientWidth"));
  assert.ok(midOverflow<=12,'V3 detail overflow 768px '+midOverflow);
  await send('Emulation.setDeviceMetricsOverride',{width:1024,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base+'/#/feedback/workbench'});
  await visible('浏览器真实反馈详情与指派验收');
  const tabletOverflow=Number(await evaluate("Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-document.documentElement.clientWidth"));
  assert.ok(tabletOverflow<=12,'V3 workbench overflow 1024px '+tabletOverflow);
  console.log('FB_V3_BROWSER 768/1024px and modal axe serious/critical=0 PASS');
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
  // The temporary profile may still contain browser session material after
  // GoTrue fixture deletion. Treat lingering files as a real QA cleanup
  // failure, not an ignorable warning, and retry only this exact profile.
  for(let attempt=0;attempt<18&&existsSync(profile);attempt++){
    try{rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:180})}
    catch{await sleep(500)}
  }
  if(existsSync(profile))errors.push('isolated Chrome QA profile cleanup failed');
  if(errors.length)throw Error('FB_BROWSER clean-up: '+errors.join('; '));
  console.log('FB_BROWSER_CLEANUP VERIFIED temporary account/product/feedback removed');
}

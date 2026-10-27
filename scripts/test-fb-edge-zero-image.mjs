#!/usr/bin/env node
// Local real authenticated feedback-submit Edge E2E with ZERO images.
// No R2 secrets or bucket are used. Never treat this as two-image R2 QA.
// Only temporary GoTrue user and product may be created; cleanup is mandatory.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
const win=process.platform==='win32',root=fileURLToPath(new URL('../',import.meta.url));
const status=spawnSync(win?'cmd.exe':'pnpm',
  win?['/d','/s','/c','pnpm dlx supabase status --output json']:
  ['dlx','supabase','status','--output','json'],{
    cwd:root,encoding:'utf8',timeout:40000,maxBuffer:1_000_000});
assert.equal(status.status,0,'local instance only');
const cfg=JSON.parse(status.stdout);
assert.equal(cfg.API_URL,'http://127.0.0.1:55321');
assert.match(cfg.DB_URL,/127\.0\.0\.1:55322/);
const port=spawnSync('docker',['port','supabase_db_Aisencore','5432/tcp'],
  {encoding:'utf8',timeout:10000});
assert.equal(port.status,0);assert.match(port.stdout,/:55322\b/);
const pub=cfg.PUBLISHABLE_KEY||cfg.ANON_KEY,priv=cfg.SERVICE_ROLE_KEY;
assert.ok(pub&&priv);
const unique=randomUUID().replaceAll('-','').slice(0,10);
const email='fb-edge-'+unique+'@example.invalid',password='FBlocal!'+randomBytes(16).toString('hex');
const productId=randomUUID(),productKey='fb_edge_'+unique,requestId=randomUUID();
const guard=createServer(),delay=ms=>new Promise(r=>setTimeout(r,ms));
let userId=null,worker=null;
function sql(query){
  const result=spawnSync('docker',['exec','supabase_db_Aisencore','psql','-X','-qAt',
    '-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',query],{
      encoding:'utf8',timeout:16000});
  if(result.status!==0)throw Error('local SQL: '+result.stderr.slice(-230));
  return result.stdout.trim();
}
async function api(path,body,token,asService=false){
  const key=asService?priv:pub;
  const response=await fetch(cfg.API_URL+path,{method:'POST',
    headers:{apikey:key,authorization:'Bearer '+(asService?priv:token),
      'content-type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=text}
  return {status:response.status,data};
}
async function edge(name,body,token){
  const response=await fetch(cfg.API_URL+'/functions/v1/'+name,{method:'POST',
    headers:{apikey:pub,authorization:'Bearer '+token},body,
    signal:AbortSignal.timeout(20000)});
  const text=await response.text();
  let data;try{data=JSON.parse(text)}catch{data=text}
  return {status:response.status,data};
}
function form(text,images=[],id=requestId){
  const data=new FormData();
  data.set('product_key',productKey);
  data.set('request_id',id);
  data.set('content',text);
  data.set('category','bug');
  for(const image of images)data.append('images',image,'screenshot.png');
  return data;
}
try{
  await new Promise((resolve,reject)=>{guard.once('error',reject);
    guard.listen(3412,'127.0.0.1',resolve)});
  const created=await api('/auth/v1/admin/users',{email,password,email_confirm:true},null,true);
  assert.equal(created.status,200);userId=created.data.id;
  sql("INSERT INTO public.products(id,product_key,name,status) VALUES ('"+
    productId+"','"+productKey+"','Temporary Edge zero-image QA','active')");
  const login=await api('/auth/v1/token?grant_type=password',{email,password});
  assert.equal(login.status,200);
  const token=login.data.access_token;
  worker=spawn(win?'cmd.exe':'pnpm',
    win?['/d','/s','/c','pnpm dlx supabase functions serve feedback-submit feedback-image-access']:
      ['dlx','supabase','functions','serve','feedback-submit','feedback-image-access'],
    {cwd:root,stdio:['ignore','pipe','pipe']});
  let errors='';
  worker.stderr.on('data',d=>{errors=(errors+String(d)).slice(-12000)});
  // Only consider runtime ready once local protected endpoint actually responds.
  let ready=false;
  for(let n=0;n<65;n++){
    try{
      const r=await fetch(cfg.API_URL+'/functions/v1/feedback-submit',{
        method:'POST',headers:{'content-type':'application/json',apikey:pub},
        body:'{}',signal:AbortSignal.timeout(5000)});
      if(r.status===401){ready=true;break}
    }catch{}
    await delay(850);
  }
  assert.ok(ready,'local Edge protected runtime must be active. '+errors.slice(-350));
  const normal=await edge('feedback-submit',form('Edge zero-image real JWT'),token);
  assert.equal(normal.status,201,'valid JWT 0-image submit: '+normal.status+
    ' '+JSON.stringify(normal.data).slice(0,200)+'; '+errors.slice(-900));
  assert.equal(normal.data.status,'received');
  const id=normal.data.id;
  const self=await api('/rest/v1/rpc/my_feedback',{p_product_key:productKey},token);
  assert.equal(self.status,200);
  assert.equal(self.data.filter(x=>x.id===id).length,1);
  assert.equal(self.data.find(x=>x.id===id).attachment_count,0);
  console.log('FB_EDGE_AUTH zero-image multipart PASS real GoTrue -> Edge -> SQL -> owner DTO');
  const replay=await edge('feedback-submit',form('Edge zero-image real JWT'),token);
  assert.equal(replay.status,200);
  assert.equal(replay.data.replayed,true);
  const changed=await edge('feedback-submit',form('changed text with same request'),token);
  assert.equal(changed.status,409);
  console.log('FB_EDGE_AUTH retry PASS same request replay 200, conflicting content 409');
  const illegal=await edge('feedback-submit',form('fake image',[
    new Blob([new Uint8Array([60,115,118,103,62])],{type:'image/png'})]),token);
  assert.equal(illegal.status,422,'MIME spoofing must be refused');
  const tooMany=await edge('feedback-submit',form('three fake images',[
    new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'}),
    new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'}),
    new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'})]),token);
  assert.equal(tooMany.status,422,'three pictures must be rejected');
  console.log('FB_EDGE_AUTH invalid image and >2 photos both rejected HTTP 422');
  const access=await edge('feedback-image-access',
    JSON.stringify({attachment_id:randomUUID()}),token);
  assert.equal(access.status,403,'private image ID not owned/absent '+JSON.stringify(access.data).slice(0,250)+'; '+errors.slice(-1000));
  console.log('FB_EDGE_AUTH private missing image 403 PASS');
  for(let index=0;index<4;index++){
    const added=await edge('feedback-submit',form('Edge accepted report '+index,[],randomUUID()),token);
    assert.equal(added.status,201,'accepted report '+index+': '+JSON.stringify(added.data));
  }
  const excess=await edge('feedback-submit',form('Sixth report not accepted',[],randomUUID()),token);
  assert.equal(excess.status,429,'sixth fresh report must be rate-limited');
  const safeReplay=await edge('feedback-submit',form('Edge zero-image real JWT',[],requestId),token);
  assert.equal(safeReplay.status,200,'original request replay remains allowed above quota');
  assert.equal(safeReplay.data.replayed,true);
  console.log('FB_EDGE_AUTH quota PASS five fresh reports, sixth 429, exact replay 200');
}finally{
  if(worker?.pid){
    if(win)spawnSync('taskkill',['/PID',String(worker.pid),'/T','/F'],
      {encoding:'utf8',timeout:10000});
    else worker.kill('SIGTERM');
  }
  guard.close();
  const problems=[];
  const safe=q=>{try{sql(q)}catch(e){problems.push(String(e.message).slice(0,170))}};
  safe("DELETE FROM public.admin_audit_log WHERE target_type='feedback' AND target_id IN (SELECT id FROM public.user_feedback WHERE product_id='"+productId+"')");
  safe("DELETE FROM public.feedback_events WHERE feedback_id IN (SELECT id FROM public.user_feedback WHERE product_id='"+productId+"')");
  safe("DELETE FROM public.feedback_attachments WHERE feedback_id IN (SELECT id FROM public.user_feedback WHERE product_id='"+productId+"')");
  safe("DELETE FROM public.user_feedback WHERE product_id='"+productId+"'");
  safe("DELETE FROM public.products WHERE id='"+productId+"'");
  if(userId){
    try{
      const r=await fetch(cfg.API_URL+'/auth/v1/admin/users/'+userId,{
        method:'DELETE',headers:{apikey:priv,authorization:'Bearer '+priv},
        signal:AbortSignal.timeout(12000)});
      if(!r.ok)problems.push('GoTrue cleanup HTTP '+r.status);
    }catch(e){problems.push('GoTrue cleanup '+e.message)}
  }
  if(problems.length)throw Error('FB Edge QA cleanup: '+problems.join('; '));
  console.log('FB_EDGE_AUTH_CLEANUP VERIFIED no test account, product or feedback persisted');
}
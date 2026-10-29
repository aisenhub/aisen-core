#!/usr/bin/env node
// FB-V2 local ZIP HTTP: real signed AAL2 JWT, RLS, Admin audit, no R2 objects.
// No remote operations; temporary user/product/feedback are deleted.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
const win=process.platform==='win32';
const runner=(cmd,args,opts={})=>spawnSync(cmd,args,{encoding:'utf8',timeout:40000,...opts});
const local=runner(win?'cmd.exe':'pnpm',win?
 ['/d','/s','/c','pnpm dlx supabase status --output json']:
 ['dlx','supabase','status','--output','json'],{timeout:90000});
assert.equal(local.status,0,'local Supabase should be running: '+
  String(local.stderr||local.error?.message||'no status output').slice(-500));
const cfg=JSON.parse(local.stdout);
assert.equal(cfg.API_URL,'http://127.0.0.1:55321');
assert.match(cfg.DB_URL,/127\.0\.0\.1:55322/);
const pub=cfg.PUBLISHABLE_KEY||cfg.ANON_KEY,service=cfg.SERVICE_ROLE_KEY;
const prefix=randomUUID().slice(0,10),userEmail='fb-zip-'+prefix+'@example.invalid';
const password='FBv2Zip!'+randomBytes(10).toString('hex');
const productId=randomUUID(),userRequest=randomUUID();
const key='fb_zip_'+prefix.replaceAll('-','');
let uid=null,feedbackId=null,edge=null;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function sql(query){
  const x=runner('docker',['exec','supabase_db_Aisencore','psql','-X','-qAt',
    '-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',query],{timeout:20000});
  if(x.status!==0)throw Error('local SQL '+x.stderr.slice(-250));
  return x.stdout.trim();
}
async function api(path,body,token,admin=false){
  const k=admin?service:pub;
  const result=await fetch(cfg.API_URL+path,{method:'POST',
    headers:{apikey:k,authorization:'Bearer '+(admin?service:token),'Content-Type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(16000)});
  const raw=await result.text();let data;try{data=JSON.parse(raw)}catch{data=raw}
  assert.ok(result.ok,path+' HTTP '+result.status+' '+String(data?.code||''));
  return data;
}
function totp(secret){
  const alpha='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits=0,acc=0,bytes=[];
  for(const c of secret.replace(/[=\s]/g,'').toUpperCase()){
    const value=alpha.indexOf(c);assert.ok(value>=0);
    acc=(acc<<5)|value;bits+=5;
    if(bits>=8){bits-=8;bytes.push((acc>>>bits)&255)}
  }
  const counter=Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const h=createHmac('sha1',Buffer.from(bytes)).update(counter).digest();
  return String((h.readUInt32BE(h.at(-1)&15)&0x7fffffff)%1000000).padStart(6,'0');
}
try{
  const user=await api('/auth/v1/admin/users',{
    email:userEmail,password,email_confirm:true},null,true);
  uid=user.id;
  sql("INSERT INTO public.platform_admins(user_id,active) VALUES ('"+uid+"',true)");
  sql("INSERT INTO public.products(id,product_key,name,status) VALUES ('"+
    productId+"','"+key+"','FB ZIP local','active')");
  const sign=await api('/auth/v1/token?grant_type=password',{email:userEmail,password},null);
  const enroll=await api('/auth/v1/factors',{factor_type:'totp',friendly_name:'ZIP QA'},sign.access_token);
  const challenge=await api('/auth/v1/factors/'+enroll.id+'/challenge',{},sign.access_token);
  const upgraded=await api('/auth/v1/factors/'+enroll.id+'/verify',{
    challenge_id:challenge.id,code:totp(enroll.totp.secret)},sign.access_token);
  const jwt=JSON.parse(Buffer.from(upgraded.access_token.split('.')[1],'base64url'));
  assert.equal(jwt.aal,'aal2');
  const created=await api('/rest/v1/rpc/feedback_submit_from_edge',{
    p_user_id:uid,p_product_key:key,p_request_id:userRequest,
    p_content:'ZIP HTTP localized text',p_category:'bug',p_attachments:[],p_contact_email:'fixture@example.com',
  },null,true);
  feedbackId=created.id;
  assert.equal(created.status,'received');
  const triaged=await api('/rest/v1/rpc/admin_screen_feedback',{
    p_feedback_id:feedbackId,p_expected_version:1,p_action:'triage',p_priority:'high',
  },upgraded.access_token);
  assert.equal(triaged.queue_state,'workbench');

  edge=spawn(win?'cmd.exe':'pnpm',win?
    ['/d','/s','/c','pnpm dlx supabase functions serve feedback-export']:
    ['dlx','supabase','functions','serve','feedback-export'],{stdio:'ignore'});
  const url=cfg.API_URL+'/functions/v1/feedback-export';
  let ready=false;
  for(let attempt=0;attempt<85;attempt++){
    try{
      const ping=await fetch(url,{method:'POST',headers:{apikey:pub,'content-type':'application/json'},
        body:'{}',signal:AbortSignal.timeout(5500)});
      if(ping.status===401){ready=true;break}
    }catch{}
    await sleep(650);
  }
  assert.ok(ready,'local ZIP Edge runtime not ready');
  async function request(token){
    return fetch(url,{method:'POST',headers:{apikey:pub,
      authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify({scope:'selected',queue_state:'workbench',
        ids:[feedbackId],options:{internal_notes:false,identity:false,
          user_comments:true,public_replies:true,history:true,status:true,tags:true}}),
      signal:AbortSignal.timeout(25000)});
  }
  const denied=await request(sign.access_token);
  assert.equal(denied.status,403,'AAL1 must be denied ZIP export');
  const oversized=await fetch(url,{method:'POST',headers:{apikey:pub,
    authorization:'Bearer '+upgraded.access_token,
    'content-type':'application/json'},
    body:JSON.stringify({scope:'selected',pad:'x'.repeat(8500)}),
    signal:AbortSignal.timeout(25000)});
  assert.equal(oversized.status,413,'oversized request must be refused');
  console.log('FB_ZIP_INPUT_BOUND PASS payload over 8192 bytes rejected');
  const response=await request(upgraded.access_token);
  const body=Buffer.from(await response.arrayBuffer());
  assert.equal(response.status,200,'AAL2 export: HTTP '+response.status+' '+body.toString('utf8').slice(0,230));
  assert.equal(response.headers.get('x-feedback-export-revision'),'v2-snapshot-check',
    'test must invoke the current function worker, not stale local code');
  assert.equal(body.subarray(0,2).toString(),'PK');
  const unzip=runner('python',['-c',[
    'import sys,zipfile,io,json',
    'z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))',
    'names=z.namelist()',
    'assert "feedback.jsonl" in names and "manifest.json" in names',
    'data=json.loads(z.read("feedback.jsonl").decode())',
    'assert data["content"]=="ZIP HTTP localized text"',
    'assert "user_id" not in data',
    'assert all("screenshot" not in s for s in names)',
    'print("FB_ZIP_UNZIP VERIFIED",len(names),"entries")',
  ].join(';')],{input:body,timeout:25000});
  assert.equal(unzip.status,0,'ZIP extraction '+unzip.stderr.slice(0,180));
  console.log(unzip.stdout.trim());
  const filtered=await fetch(url,{method:'POST',headers:{apikey:pub,
    authorization:'Bearer '+upgraded.access_token,'content-type':'application/json'},
    body:JSON.stringify({scope:'filtered',queue_state:'workbench',
      filters:{product_id:productId},options:{internal_notes:false,identity:false}}),
    signal:AbortSignal.timeout(25000)});
  const filteredBytes=Buffer.from(await filtered.arrayBuffer());
  assert.equal(filtered.status,200,'filtered scoped ZIP HTTP '+filtered.status+' '+
    filteredBytes.toString('utf8').slice(0,160));
  assert.equal(filteredBytes.subarray(0,2).toString(),'PK');
  console.log('FB_V2_EXPORT_FILTERED_REAL_HTTP PASS scoped product filter ZIP');
  // A signed JWT must not preserve ZIP privileges after current Admin access
  // is revoked. This is stronger than trusting stale app-metadata claims.
  sql("UPDATE public.platform_admins SET active=false WHERE user_id='"+uid+"'");
  const revokedAccess=await fetch(cfg.API_URL+'/rest/v1/rpc/admin_check_access',{
    method:'POST',headers:{apikey:pub,authorization:'Bearer '+upgraded.access_token,
      'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});
  assert.equal(revokedAccess.status,200,'Admin check RPC should remain callable');
  assert.equal((await revokedAccess.json()).allowed,false,'current Admin qualification must be revoked');
  const revoked=await request(upgraded.access_token);
  const revokedMessage=await revoked.text();
  assert.equal(revoked.status,403,'revoked AAL2 Admin must not export: HTTP '+
    revoked.status+' '+revokedMessage.slice(0,180));
  console.log('FB_V2_EXPORT_REVOKED PASS current admin revocation denies existing JWT');
  assert.equal(sql("SELECT count(*) FROM public.admin_audit_log WHERE target_type='feedback_export' AND actor_user_id='"+uid+"'"),
    '2','both selected and filtered ZIP exports have minimal audit');
  console.log('FB_V2_EXPORT_REAL_HTTP PASS AAL1 denied, AAL2 private ZIP zero image, scoped record and audit');
}finally{
  if(edge?.pid){
    if(win)runner('taskkill',['/PID',String(edge.pid),'/T','/F'],{timeout:12000});
    else edge.kill('SIGTERM');
  }
  const failures=[];
  const clean=q=>{try{sql(q)}catch(e){failures.push(String(e.message).slice(0,160))}};
  if(uid)clean("DELETE FROM public.admin_audit_log WHERE target_type='feedback_export' AND actor_user_id='"+uid+"'");
  clean("DELETE FROM public.admin_audit_log WHERE target_type='feedback' AND target_id IN (SELECT id FROM public.user_feedback WHERE product_id='"+productId+"')");
  clean("DELETE FROM public.feedback_events WHERE feedback_id IN (SELECT id FROM public.user_feedback WHERE product_id='"+productId+"')");
  clean("DELETE FROM public.feedback_attachments WHERE feedback_id IN (SELECT id FROM public.user_feedback WHERE product_id='"+productId+"')");
  clean("DELETE FROM public.user_feedback WHERE product_id='"+productId+"'");
  clean("DELETE FROM public.products WHERE id='"+productId+"'");
  if(uid)clean("DELETE FROM public.platform_admins WHERE user_id='"+uid+"'");
  if(uid){
    try{
      const removed=await fetch(cfg.API_URL+'/auth/v1/admin/users/'+uid,{
        method:'DELETE',headers:{apikey:service,authorization:'Bearer '+service},
        signal:AbortSignal.timeout(16000)});
      if(!removed.ok)failures.push('Auth remove '+removed.status);
    }catch(e){failures.push('Auth remove '+e.message)}
  }
  if(failures.length)throw Error('Synthetic data cleanup errors: '+failures.join('; '));
  console.log('FB_V2_EXPORT_TEST_CLEANUP PASS');
}

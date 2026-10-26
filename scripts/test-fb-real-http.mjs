#!/usr/bin/env node
// FB local HTTP acceptance: real GoTrue credentials, actual PostgREST
// authorization and role changes; no R2 or Edge HTTP paths are asserted.
// Creates isolated temporary identities/product and fully cleans them up.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';

const win=process.platform==='win32';
const status=spawnSync(win?'cmd.exe':'pnpm',
  win?['/d','/s','/c','pnpm dlx supabase status --output json']:
  ['dlx','supabase','status','--output','json'],{
    encoding:'utf8',timeout:45000,maxBuffer:1000000});
assert.equal(status.status,0,'Local Supabase must already run');
const cfg=JSON.parse(status.stdout);
assert.equal(cfg.API_URL,'http://127.0.0.1:55321');
assert.match(cfg.DB_URL,/127\.0\.0\.1:55322/);
const mapping=spawnSync('docker',['port','supabase_db_Aisencore','5432/tcp'],
  {encoding:'utf8',timeout:12000});
assert.equal(mapping.status,0,'AisenCore local docker must exist');
assert.match(mapping.stdout,/:55322\b/);
const pub=cfg.PUBLISHABLE_KEY||cfg.ANON_KEY;
assert.ok(pub&&cfg.SERVICE_ROLE_KEY);
const prefix=randomUUID().replaceAll('-','').slice(0,12);
const pass='LocalFb!'+randomBytes(16).toString('hex');
const ids=[],productId=randomUUID(),productKey='fb_http_'+prefix;
let feedbackId=null,adminId=null;
const valid=x=>{assert.match(x,/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);return x};
function sql(query){
  const r=spawnSync('docker',['exec','supabase_db_Aisencore','psql',
    '-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',query],
    {encoding:'utf8',timeout:15000});
  if(r.status!==0)throw Error('isolated local SQL failed: '+r.stderr.slice(-300));
  return r.stdout.trim();
}
async function http(path,body,token,admin=false,method='POST'){
  const headers={apikey:admin?cfg.SERVICE_ROLE_KEY:pub,
    authorization:'Bearer '+(admin?cfg.SERVICE_ROLE_KEY:token||pub)};
  if(body!==undefined)headers['content-type']='application/json';
  const res=await fetch(cfg.API_URL+path,{method,headers,
    body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(14000)});
  const raw=await res.text();
  let data;try{data=JSON.parse(raw)}catch{data=raw}
  return {status:res.status,data};
}
function ok(res,want,label){
  assert.equal(res.status,want,label+' HTTP '+res.status+
    ' != '+want+' '+String(res.data?.code??''));
  return res.data;
}
function totp(secret){
  const letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let accumulator=0,bits=0,bytes=[];
  for(const c of secret.replace(/[\s=]/g,'').toUpperCase()){
    const x=letters.indexOf(c);assert.ok(x>=0);
    accumulator=(accumulator<<5)|x;bits+=5;
    if(bits>=8){bits-=8;bytes.push((accumulator>>>bits)&255)}
  }
  const count=Buffer.alloc(8);
  count.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',Buffer.from(bytes)).update(count).digest();
  return String((digest.readUInt32BE(digest.at(-1)&15)&0x7fffffff)%1000000).padStart(6,'0');
}
async function newUser(tag){
  const data=ok(await http('/auth/v1/admin/users',{
    email:'fb-'+prefix+'-'+tag+'@example.invalid',password:pass,email_confirm:true
  },null,true),200,'create local '+tag);
  ids.push(valid(data.id));
  const token=ok(await http('/auth/v1/token?grant_type=password',{
    email:'fb-'+prefix+'-'+tag+'@example.invalid',password:pass
  }),200,'sign in '+tag);
  assert.equal(JSON.parse(Buffer.from(token.access_token.split('.')[1],'base64url')).aal,'aal1');
  return {id:data.id,access:token.access_token};
}
async function rpc(name,body,token,admin=false){
  return http('/rest/v1/rpc/'+name,body,token,admin);
}
async function mfa(user){
  const factor=ok(await http('/auth/v1/factors',{
    factor_type:'totp',friendly_name:'Feedback local QA'
  },user.access),200,'enroll');
  const challenge=ok(await http('/auth/v1/factors/'+factor.id+'/challenge',
    {},user.access),200,'challenge');
  const verified=ok(await http('/auth/v1/factors/'+factor.id+'/verify',{
    challenge_id:challenge.id,code:totp(factor.totp.secret)
  },user.access),200,'verify');
  const aal=JSON.parse(Buffer.from(verified.access_token.split('.')[1],'base64url')).aal;
  assert.equal(aal,'aal2');
  return verified.access_token;
}
try{
  const a=await newUser('owner');
  const b=await newUser('stranger');
  const admin=await newUser('admin');adminId=admin.id;
  sql('INSERT INTO public.platform_admins(user_id,active) VALUES ('+
    "'"+admin.id+"',true)");
  sql('INSERT INTO public.products(id,product_key,name,status) VALUES ('+
    "'"+productId+"','"+productKey+"','QA FB isolated','active')");
  const a2=await mfa(admin);

  ok(await rpc('feedback_submit_from_edge',{
    p_user_id:a.id,p_product_key:productKey,p_request_id:randomUUID(),
    p_content:'forged',p_category:'bug',p_attachments:[]
  },a.access),403,'owner cannot impersonate Edge submit');
  const requestId=randomUUID();
  const body={p_user_id:a.id,p_product_key:productKey,p_request_id:requestId,
    p_content:'real JWT feedback test',p_category:'bug',p_attachments:[]};
  const created=ok(await rpc('feedback_submit_from_edge',body,null,true),
    200,'trusted Edge-equivalent RPC commit');
  feedbackId=valid(created.id);assert.equal(created.status,'received');
  assert.equal(ok(await rpc('feedback_submit_from_edge',body,null,true),
    200,'trusted replay').replayed,true);
  ok(await rpc('feedback_submit_from_edge',{...body,p_content:'changed'},
    null,true),409,'same ID different content is rejected');
  const owner=ok(await rpc('my_feedback',{},a.access),200,'owner read');
  const stranger=ok(await rpc('my_feedback',{},b.access),200,'stranger read');
  assert.equal(owner.length,1);assert.equal(stranger.length,0);
  assert.equal(owner[0].version,1);
  assert.ok(!JSON.stringify(owner).includes('object_key'));
  ok(await rpc('my_feedback_events',{p_feedback_id:feedbackId},
    b.access),403,'cannot read stranger public events');
  ok(await rpc('reply_to_feedback',{p_feedback_id:feedbackId,
    p_message:'attack',p_expected_version:1},b.access),403,'stranger cannot reply');
  ok(await rpc('admin_update_feedback',{p_feedback_id:feedbackId,
    p_expected_version:1,p_status:'in_progress'},a.access),403,'owner cannot admin');
  ok(await rpc('admin_update_feedback',{p_feedback_id:feedbackId,
    p_expected_version:1,p_status:'in_progress'},admin.access),403,'admin AAL1 refused');
  const pre=ok(await rpc('feedback_submit_preflight',
    {p_product_key:productKey},a.access),200,'owner preflight');
  assert.equal(pre.allowed,true);
  const listPre=ok(await http('/rest/v1/admin_feedback_summaries?select=id&limit=5',
    undefined,a.access,false,'GET'),200,'RLS owner on Admin view');
  assert.equal(listPre.length,0);
  const listAdmin=ok(await http('/rest/v1/admin_feedback_summaries?select=id&limit=5',
    undefined,a2,false,'GET'),200,'AAL2 Admin view');
  assert.equal(listAdmin.filter(x=>x.id===feedbackId).length,1);
  ok(await rpc('admin_update_feedback',{
    p_feedback_id:feedbackId,p_expected_version:1,p_status:'in_progress'
  },a2),409,'untriaged inbox cannot be processed');
  assert.equal(ok(await rpc('admin_screen_feedback',{
    p_feedback_id:feedbackId,p_expected_version:1,p_action:'triage',p_priority:'high'
  },a2),200,'AAL2 admin triages').version,2);
  assert.equal(ok(await rpc('admin_update_feedback',{
    p_feedback_id:feedbackId,p_expected_version:2,p_status:'in_progress'
  },a2),200,'Admin accepts feedback').version,3);
  ok(await rpc('admin_update_feedback',{
    p_feedback_id:feedbackId,p_expected_version:1,p_status:'resolved',
    p_public_reply:'stale'
  },a2),409,'stale version refused');
  assert.equal(ok(await rpc('admin_assign_feedback',{
    p_feedback_id:feedbackId,p_expected_version:3,p_assigned_to:adminId
  },a2),200,'Admin assigns').version,4);
  ok(await rpc('admin_assign_feedback',{
    p_feedback_id:feedbackId,p_expected_version:4,p_assigned_to:b.id
  },a2),422,'ordinary user not eligible as assignee');
  assert.equal(ok(await rpc('admin_update_feedback',{
    p_feedback_id:feedbackId,p_expected_version:4,p_status:'waiting_user',
    p_public_reply:'Please add reproduction steps'
  },a2),200,'Admin asks for details').version,5);
  const appended=ok(await rpc('reply_to_feedback',{
    p_feedback_id:feedbackId,p_expected_version:5,p_message:'Here are steps'
  },a.access),200,'owner appends reply');
  assert.equal(appended.status,'in_progress');
  const events=ok(await rpc('my_feedback_events',{p_feedback_id:feedbackId},
    a.access),200,'owner visible history');
  assert.equal(events.filter(e=>e.event_type==='user_reply').length,1);
  assert.ok(events.every(e=>!['internal_note','assigned'].includes(e.event_type)));
  console.log('FB_REAL_HTTP PASS signed GoTrue AAL1/AAL2, RLS, Edge-only metadata boundary, owner isolation, CAS, assignment, status and reply');
}finally{
  // Every cleanup predicate is anchored to the freshly created product/users.
  // Do not touch existing demo rows, user data, or durable admins.
  const errors=[];
  const safe=fn=>{try{fn()}catch(e){errors.push(String(e.message||e).slice(0,200))}};
  safe(()=>sql('DELETE FROM public.admin_audit_log WHERE target_type='+
    "'feedback' AND target_id IN (SELECT id FROM public.user_feedback WHERE product_id='"+
    productId+"')"));
  safe(()=>sql('DELETE FROM public.feedback_events WHERE feedback_id IN ('+
    "SELECT id FROM public.user_feedback WHERE product_id='"+productId+"')"));
  safe(()=>sql('DELETE FROM public.feedback_attachments WHERE feedback_id IN ('+
    "SELECT id FROM public.user_feedback WHERE product_id='"+productId+"')"));
  safe(()=>sql("DELETE FROM public.user_feedback WHERE product_id='"+productId+"'"));
  safe(()=>sql("DELETE FROM public.products WHERE id='"+productId+"'"));
  if(adminId)safe(()=>sql("DELETE FROM public.platform_admins WHERE user_id='"+adminId+"'"));
  for(const id of ids.reverse()){
    try{ok(await http('/auth/v1/admin/users/'+id,undefined,null,true,'DELETE'),
      200,'cleanup synthetic user')}catch(e){errors.push('Auth cleanup: '+String(e.message).slice(0,200))}
  }
  if(errors.length)throw Error('QA cleanup errors: '+errors.join(' | '));
  console.log('FB_REAL_HTTP_CLEANUP VERIFIED no synthetic feedback/product/user remains');
}
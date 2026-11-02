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
const pass='LocalFb!8'+randomBytes(16).toString('hex');
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
    p_content:'forged',p_category:'bug',p_attachments:[],p_contact_email:'fixture@example.com'
  },a.access),403,'owner cannot impersonate Edge submit');
  const requestId=randomUUID();
  const body={p_user_id:a.id,p_product_key:productKey,p_request_id:requestId,
    p_content:'real JWT feedback test',p_category:'bug',p_attachments:[],p_contact_email:'fixture@example.com'};
  const created=ok(await rpc('feedback_submit_from_edge',body,null,true),
    200,'trusted Edge-equivalent RPC commit');
  feedbackId=valid(created.id);assert.equal(created.status,'received');
  assert.equal(ok(await rpc('feedback_submit_from_edge',body,null,true),
    200,'trusted replay').replayed,true);
  ok(await rpc('feedback_submit_from_edge',{...body,p_content:'changed'},
    null,true),409,'same ID different content is rejected');
  const owner=ok(await rpc('my_feedback',{p_product_key:productKey},a.access),200,'owner read');
  const stranger=ok(await rpc('my_feedback',{p_product_key:productKey},b.access),200,'stranger read');
  assert.equal(owner.length,1);assert.equal(stranger.length,0);
  assert.equal(owner[0].version,1);
  assert.ok(!JSON.stringify(owner).includes('object_key'));
  ok(await rpc('my_feedback_events',{p_feedback_id:feedbackId},
    b.access),403,'cannot read stranger public events');
  // V4 only: removed legacy write endpoints must not resolve, even for AAL2 admins.
  for(const [name,payload] of [
    ['reply_to_feedback',{p_feedback_id:feedbackId,p_expected_version:1,p_message:'obsolete'}],
    ['admin_update_feedback',{p_feedback_id:feedbackId,p_expected_version:1,p_status:'in_progress'}],
    ['admin_assign_feedback',{p_feedback_id:feedbackId,p_expected_version:1,p_assigned_to:adminId}],
    ['admin_screen_feedback',{p_feedback_id:feedbackId,p_expected_version:1,p_action:'trash'}],
    ['admin_attention_feedback',{p_feedback_id:feedbackId,p_expected_version:1,p_tags:['obsolete']}],
    ['admin_feedback_tags',{p_product_id:productId}],
  ]) {
    for(const [role,token] of [['owner',a.access],['admin-aal2',a2]]) {
      const response=await rpc(name,payload,token);
      assert.equal(response.status,404,name+' must be absent for '+role+
        ': '+JSON.stringify(response.data).slice(0,140));
    }
  }
  ok(await rpc('admin_mark_feedback_read',{p_feedback_id:feedbackId,p_expected_version:1},
    a.access),403,'ordinary user cannot mark read');
  ok(await rpc('admin_mark_feedback_read',{p_feedback_id:feedbackId,p_expected_version:1},
    admin.access),403,'AAL1 cannot mark read');
  assert.equal(ok(await rpc('admin_mark_feedback_read',{
    p_feedback_id:feedbackId,p_expected_version:1},a2),200,'AAL2 marks read').version,1);
  ok(await rpc('admin_mark_feedback_read',{p_feedback_id:feedbackId,p_expected_version:1},
    a2),200,'read is idempotent');
  for(const action of ['trash','restore']) {
    const payload={p_feedback_id:feedbackId,p_expected_version:1,
      p_action:action};
    const res=await rpc('admin_feedback_v3',payload,a2);
    assert.equal(res.status,422,'obsolete action/tags '+action+' denied');
  }
  ok(await rpc('admin_feedback_v3',{p_feedback_id:feedbackId,p_expected_version:1,
    p_action:'save',p_priority:'high'},a.access),403,'ordinary cannot save');
  ok(await rpc('admin_feedback_v3',{p_feedback_id:feedbackId,p_expected_version:1,
    p_action:'save',p_priority:'high'},admin.access),403,'AAL1 cannot save');
  assert.equal(ok(await rpc('admin_feedback_v3',{p_feedback_id:feedbackId,
    p_expected_version:1,p_action:'save',p_priority:'high',
    p_is_starred:true,p_internal_note:'private QA note'},a2),200,'V4 inbox saves').version,2);
  ok(await rpc('admin_feedback_v3',{p_feedback_id:feedbackId,p_expected_version:1,
    p_action:'triage'},a2),409,'V4 stale CAS refused');
  assert.equal(ok(await rpc('admin_feedback_v3',{p_feedback_id:feedbackId,
    p_expected_version:2,p_action:'triage'},a2),200,'V4 triage').queue_state,'workbench');
  assert.equal(ok(await rpc('admin_feedback_v3',{p_feedback_id:feedbackId,
    p_expected_version:3,p_action:'archive'},a2),200,'V4 archive').queue_state,'archived');
  assert.equal(ok(await rpc('admin_feedback_v3',{p_feedback_id:feedbackId,
    p_expected_version:4,p_action:'reopen'},a2),200,'V4 reopen').queue_state,'workbench');
  const events=ok(await rpc('my_feedback_events',{p_feedback_id:feedbackId},
    a.access),200,'owner visible history');
  assert.ok(!events.some(e=>['internal_note','user_reply','public_reply','assigned']
    .includes(e.event_type)),'V4 owner event projection excludes internal/obsolete writing');
  console.log('FB_REAL_HTTP_V4 PASS real JWT AAL1/AAL2, removed RPC 404, V4 CAS, priorities, lifecycle, owner isolation');
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

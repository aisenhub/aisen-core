#!/usr/bin/env node
// CORE-ENTITLEMENT-001: live LOCAL GoTrue/PostgREST test. Generates disposable
// QA identities, uses real AAL2 admin + user JWTs, and cleans ONLY those IDs.
// Never logs passwords, code plaintext, access tokens or user private data.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';

const win=process.platform==='win32';
const root=new URL('../',import.meta.url);
const cfgCli=spawnSync(win?'cmd.exe':'pnpm',
  win?['/d','/s','/c','pnpm dlx supabase status --output json']:
    ['dlx','supabase','status','--output','json'],
  {cwd:new URL('.',root),encoding:'utf8',timeout:45000});
assert.equal(cfgCli.status,0,'local Supabase must be running');
const cfg=JSON.parse(cfgCli.stdout);
assert.equal(cfg.API_URL,'http://127.0.0.1:55321','remote API is forbidden');
assert.match(cfg.DB_URL,/127\.0\.0\.1:55322/,'remote database is forbidden');
const tag=randomUUID().slice(0,13);
const emailA='pro-credit-http-admin-'+tag+'@aisencore.test';
const emailU='pro-credit-http-user-'+tag+'@aisencore.test';
const pass='ProLocal!'+randomBytes(16).toString('hex');
const created=[];
let adminId=null,targetId=null,done=false,cleanupOk=true;
const scaleMode=process.argv.includes('--http-scale');
const scaleSamples=[];
let baselineCounts=null;
function sql(query,timeoutMs=30000){
  const r=spawnSync('docker',['exec','supabase_db_Aisencore','psql','-X','-qAt',
    '-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',query],
    {encoding:'utf8',timeout:timeoutMs,maxBuffer:100000});
  if(r.status!==0)throw Error('local psql operation failed: '+
    (r.error?.code??r.stderr?.slice(-280)??'unknown'));
  return r.stdout.trim();
}
const q=s=>{
  assert.match(s,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  return "'"+s+"'";
};
async function request(path,{token=null,admin=false,body,method='POST',expect=200}={}){
  const key=admin?cfg.SERVICE_ROLE_KEY:cfg.PUBLISHABLE_KEY;
  const headers={apikey:key,authorization:'Bearer '+(admin?key:token??key)};
  if(body!==undefined)headers['content-type']='application/json';
  const response=await fetch(cfg.API_URL+path,{method,headers,
    body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(18000)});
  const data=await response.json().catch(()=>null);
  if(response.status!==expect){
    throw Error('HTTP '+response.status+' expected '+expect+' for '+path.split('?')[0]+
      ' code '+String(data?.code??'unknown').slice(0,100));
  }
  return data;
}
function totp(secret){
  const abc='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let buffer=0,bits=0;
  const decoded=[];
  for(const c of secret.replace(/[\s=]/g,'').toUpperCase()){
    const value=abc.indexOf(c);if(value<0)throw Error('invalid TOTP base32');
    buffer=(buffer<<5)|value;bits+=5;
    if(bits>=8){bits-=8;decoded.push((buffer>>>bits)&255);}
  }
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',Buffer.from(decoded)).update(counter).digest();
  return String((digest.readUInt32BE(digest.at(-1)&15)&0x7fffffff)%1000000).padStart(6,'0');
}
function duration(id,product,days,requestId){
  return {p_target_user_id:id,p_product_id:product,p_tier:'pro',
    p_mode:'duration',p_duration_days:days,p_starts_at:null,p_ends_at:null,
    p_is_lifetime:false,p_reason:'Temporary local credit verification',p_request_id:requestId};
}
function expiry(access){
  assert.equal(access.allowed,true);
  assert.equal(access.pro_active,true);
  assert.equal(access.tier,'pro');
  const ms=Date.parse(access.effective_ends_at);
  assert.ok(Number.isFinite(ms),'effective expiry must be a real date');
  return ms;
}
try{
  baselineCounts=JSON.parse(sql("BEGIN READ ONLY; SELECT json_build_object("+
    "'users',(select count(*) from auth.users),"+
    "'grants',(select count(*) from public.entitlement_grants),"+
    "'entries',(select count(*) from public.pro_credit_entries),"+
    "'accounts',(select count(*) from public.pro_credit_accounts),"+
    "'audit',(select count(*) from public.admin_audit_log),"+
    "'members',(select count(*) from public.product_memberships)); COMMIT;"));
  const productId=sql("BEGIN READ ONLY; SELECT id FROM public.products WHERE product_key='aisenlens' AND status='active'; COMMIT;").split(/\s+/).find(x=>/^[0-9a-f-]{36}$/i.test(x));
  assert.ok(productId,'existing local AisenLens product required');
  for(const email of [emailA,emailU]){
    const user=await request('/auth/v1/admin/users',{admin:true,body:{
      email,password:pass,email_confirm:true,
    }});
    assert.match(user.id,/^[0-9a-f-]{36}$/i);
    created.push(user.id);
  }
  [adminId,targetId]=created;
  sql('BEGIN; INSERT INTO public.platform_admins(user_id,active) VALUES ('+q(adminId)+',true);'+
      'INSERT INTO public.product_memberships(user_id,product_id,status) VALUES ('+
      q(targetId)+','+q(productId)+",'active'); COMMIT;");
  const loginA=await request('/auth/v1/token?grant_type=password',{body:{email:emailA,password:pass}});
  const factor=await request('/auth/v1/factors',{
    token:loginA.access_token,body:{factor_type:'totp',friendly_name:'Disposable Pro QA'}});
  const challenge=await request('/auth/v1/factors/'+factor.id+'/challenge',
    {token:loginA.access_token,body:{}});
  const aal2=await request('/auth/v1/factors/'+factor.id+'/verify',{
    token:loginA.access_token,
    body:{challenge_id:challenge.id,code:totp(factor.totp.secret)}});
  const userLogin=await request('/auth/v1/token?grant_type=password',{body:{email:emailU,password:pass}});
  const rpc=(name,body,token=aal2.access_token,expect=200)=>
    request('/rest/v1/rpc/'+name,{token,body,expect});
  const access=()=>rpc('check_access',{p_product_key:'aisenlens'},userLogin.access_token);

  const firstReq=duration(targetId,productId,30,randomUUID());
  const first=await rpc('admin_grant_entitlement',firstReq);
  assert.equal(first.idempotent_replay,false);
  const firstEnd=expiry(await access());
  const repeat=await rpc('admin_grant_entitlement',firstReq);
  assert.equal(repeat.idempotent_replay,true);
  assert.equal(repeat.grant_id,first.grant_id);
  await request('/rest/v1/rpc/admin_grant_entitlement',{
    token:aal2.access_token,body:{...firstReq,p_duration_days:7},expect:409,
  });
  console.log('HTTP_ADMIN_GRANT_30D_AND_IDEMPOTENT_REPLAY PASS');

  const second=await rpc('admin_grant_entitlement',duration(targetId,productId,30,randomUUID()));
  const secondEnd=expiry(await access());
  assert.ok(Math.abs((secondEnd-firstEnd)-30*86400000)<120000,'new 30d must extend composite expiry');
  const visibleProducts=await rpc('get_my_products',{},userLogin.access_token);
  assert.ok(Array.isArray(visibleProducts),'get_my_products must return a product array');
  const myLens=visibleProducts.find(item=>item.product_key==='aisenlens');
  assert.ok(myLens&&myLens.allowed&&myLens.pro_active);
  assert.ok(Math.abs(Date.parse(myLens.effective_ends_at)-secondEnd)<120000,
    'get_my_products and check_access must use identical credit projection');
  assert.equal(visibleProducts.some(item=>item.product_key==='aisenhub'),false,
    'unjoined product may not appear in my-products list');
  console.log('HTTP_PRO_CUMULATIVE_30_PLUS_30 PASS');

  const details=await rpc('admin_get_pro_entitlement',
    {p_target_user_id:targetId,p_product_id:productId});
  assert.equal(details.pro_active,true);
  assert.equal(details.membership_status,'active');
  assert.equal(details.account_blocked,false);
  assert.ok(Math.abs(Date.parse(details.effective_ends_at)-secondEnd)<120000);
  await request('/rest/v1/rpc/admin_get_pro_entitlement',{
    token:loginA.access_token,body:{p_target_user_id:targetId,p_product_id:productId},
    expect:403,
  });
  console.log('HTTP_ADMIN_PRO_PREVIEW_AAL2_REQUIRED PASS');
  const summaryList=await rpc('admin_get_user_pro_entitlements',
    {p_target_user_id:targetId});
  const lensRow=summaryList.items?.find(row=>row.product_id===productId);
  assert.ok(lensRow,'user centre must include current product');
  assert.ok(Math.abs(Date.parse(lensRow.effective_ends_at)-secondEnd)<120000);
  await request('/rest/v1/rpc/admin_get_user_pro_entitlements',{
    token:loginA.access_token,body:{p_target_user_id:targetId},expect:403,
  });
  console.log('HTTP_USER_CENTRE_COMPOSITE_SUMMARY_AAL2 PASS');
  const hubId=sql("SELECT id FROM public.products WHERE product_key='aisenhub' AND status='active'");
  assert.match(hubId,/^[0-9a-f-]{36}$/i);
  const other=await rpc('admin_get_pro_entitlement',
    {p_target_user_id:targetId,p_product_id:hubId});
  assert.equal(other.membership_status,null);
  assert.equal(other.pro_active,false);
  await request('/rest/v1/rpc/admin_grant_entitlement',{
    token:aal2.access_token,body:duration(targetId,hubId,30,randomUUID()),
    expect:409,
  });
  const wrongAccess=await rpc('check_access',{p_product_key:'aisenhub'},
    userLogin.access_token);
  assert.equal(wrongAccess.allowed,false);
  assert.equal(wrongAccess.reason,'MEMBERSHIP_REQUIRED');
  console.log('HTTP_CROSS_PRODUCT_NONMEMBER_GRANT_REJECTED PASS');

  const revoked=await rpc('admin_revoke_grant',
    {p_grant_id:first.grant_id,p_reason:'Temporary local credit verification'});
  assert.equal(revoked.changed,true);
  const afterRevoke=expiry(await access());
  assert.ok(Math.abs((secondEnd-afterRevoke)-30*86400000)<120000,
    'revoking original Grant must cancel only its unspent balance');
  assert.ok(Math.abs((afterRevoke-firstEnd))<120000,
    'later 30d credit must continue without a gap');
  console.log('HTTP_PRO_REVOKE_NO_COVERAGE_GAP PASS');

  const permanent=await rpc('admin_grant_entitlement',{
    ...duration(targetId,productId,1,randomUUID()),
    p_mode:'explicit_window',p_duration_days:null,p_is_lifetime:true,
  });
  let permanentAccess=await access();
  assert.equal(permanentAccess.is_lifetime,true);
  assert.equal(permanentAccess.effective_ends_at,null);
  const permanentList=await rpc('get_my_products',{},userLogin.access_token);
  assert.equal(permanentList.find(item=>item.product_key==='aisenlens')?.is_lifetime,true);
  assert.equal(permanentList.find(item=>item.product_key==='aisenlens')?.effective_ends_at,null);
  await request('/rest/v1/rpc/admin_grant_entitlement',{
    token:aal2.access_token,body:duration(targetId,productId,30,randomUUID()),
    expect:409,
  });
  assert.equal((await access()).is_lifetime,true);
  const freezeStart=await rpc('admin_get_pro_entitlement',
    {p_target_user_id:targetId,p_product_id:productId});
  assert.ok(Number(freezeStart.remaining_credit_seconds)>25*86400);
  console.log('HTTP_PRO_PERMANENT_FREEZE PASS');

  const issue=await rpc('admin_create_codes',{
    p_product_id:productId,p_tier:'pro',p_quantity:1,p_grant_duration_days:7,
    p_is_lifetime:false,p_max_redemptions_per_code:1,
    p_code_expires_at:null,p_request_id:randomUUID(),p_note:'Temporary local credit verification',
  });
  assert.equal(issue.codes?.length,1);
  const denied=await rpc('redeem_code',{p_product_key:'aisenlens',p_code:issue.codes[0]},
    userLogin.access_token);
  assert.equal(denied.ok,false);
  assert.equal(denied.code,'REDEEM_LIFETIME_ACTIVE');
  console.log('HTTP_REDEEM_DURING_PERMANENT_NO_CODE_CONSUMPTION PASS');

  await rpc('admin_revoke_grant',
    {p_grant_id:permanent.grant_id,p_reason:'Temporary local credit verification'});
  const resumed=await access();
  assert.equal(resumed.is_lifetime,false);
  assert.ok(Math.abs(expiry(resumed)-afterRevoke)<120000,
    'finite credit must resume at permanent cancellation');
  const accepted=await rpc('redeem_code',
    {p_product_key:'aisenlens',p_code:issue.codes[0]},userLogin.access_token);
  assert.equal(accepted.ok,true);
  const redeemedEnd=expiry(await access());
  assert.ok(Math.abs(redeemedEnd-Date.parse(resumed.effective_ends_at)-7*86400000)<120000);
  const reused=await rpc('redeem_code',{p_product_key:'aisenlens',p_code:issue.codes[0]},
    userLogin.access_token);
  assert.equal(reused.ok,false);
  assert.equal(reused.code,'REDEEM_ALREADY_USED');
  console.log('HTTP_REDEEM_AND_PERMANENT_RESUME_AND_SINGLE_USE PASS');
  // Concurrent requests must serialize on the real L0/L1/L7 advisory locks,
  // not just pass a synthetic single-process credit reference.
  const beforeConcurrent=expiry(await access());
  const [parallelA,parallelB]=await Promise.all([
    rpc('admin_grant_entitlement',duration(targetId,productId,7,randomUUID())),
    rpc('admin_grant_entitlement',duration(targetId,productId,7,randomUUID())),
  ]);
  assert.notEqual(parallelA.grant_id,parallelB.grant_id);
  assert.ok(Math.abs(expiry(await access())-beforeConcurrent-14*86400000)<120000,
    'two simultaneous 7d grants must add 14d exactly once each');
  console.log('HTTP_TWO_PARALLEL_CREDIT_WRITES_SERIALIZED PASS');
  if(scaleMode){
    // Not a fake temp-table SQL benchmark: these credits are real committed
    // fixture rows belonging ONLY to this disposable QA account. All real
    // HTTP requests carry JWT/AAL2 through PostgREST and execute RLS/RPC.
    // No other developer's accounts, memberships or Grants are modified.
    const percent=(sorted,p)=>Number(sorted[Math.ceil(sorted.length*p)-1].toFixed(2));
    const sample=async(label,body,token)=>{
      const path='/rest/v1/rpc/'+label;
      const timings=[];
      for(let i=0;i<52;i++){
        const started=process.hrtime.bigint();
        const response=await request(path,{token,body});
        const elapsed=Number(process.hrtime.bigint()-started)/1e6;
        assert.ok(response!==null&&response!==undefined,'RPC response must be valid');
        if(i>=12)timings.push(elapsed);
      }
      const sorted=timings.sort((a,b)=>a-b);
      return {name:label,n:sorted.length,p50_ms:percent(sorted,.5),
        p75_ms:percent(sorted,.75),p95_ms:percent(sorted,.95),
        max_ms:Number(sorted.at(-1).toFixed(2))};
    };
    let earlier=0;
    for(const target of [100,1000,10000]){
      const prefix='qa-http-scale:'+tag+':';
      const insert=`WITH new_grants AS (
        INSERT INTO public.entitlement_grants(
          user_id,product_id,tier,source_type,source_ref,grant_mode,
          requested_duration_days,starts_at,ends_at,created_by,grant_reason)
        SELECT ${q(targetId)},${q(productId)},'pro','admin',
          '${prefix}'||n::text,'duration',1,transaction_timestamp(),
          transaction_timestamp()+interval '1 day',
          ${q(adminId)},'Isolated QA HTTP latency fixture'
        FROM generate_series(${earlier+1},${target}) n
        RETURNING id,user_id,product_id
      ) INSERT INTO public.pro_credit_entries(
          grant_id,user_id,product_id,credited_seconds,remaining_seconds)
        SELECT id,user_id,product_id,86400,86400 FROM new_grants;`;
      sql('BEGIN; '+insert+' COMMIT;');
      earlier=target;
      assert.equal(sql('SELECT count(*) FROM public.pro_credit_entries e '+
        'JOIN public.entitlement_grants g ON g.id=e.grant_id '+
        'WHERE g.user_id='+q(targetId)+
        " AND g.source_ref LIKE '"+prefix+"%'"),String(target),
        'scale fixture is limited to the exact synthetic user');
      const cases=[];
      cases.push(await sample('check_access',
        {p_product_key:'aisenlens'},userLogin.access_token));
      cases.push(await sample('get_my_products',{},userLogin.access_token));
      cases.push(await sample('admin_get_pro_entitlement',
        {p_target_user_id:targetId,p_product_id:productId},aal2.access_token));
      scaleSamples.push({qa_credit_rows:target,measurements:cases});
      console.log('HTTP_SCALE_QA_'+target+'_ROWS PASS '+JSON.stringify(cases));
    }
  }
  done=true;
}catch(error){
  console.error('PRO_CREDIT_HTTP_FAIL '+String(error?.message??error).slice(0,280));
  process.exitCode=1;
}finally{
  if(created.length){
    try{
      // Before ANY deletion, ensure both identities are this exact test run's
      // synthetic accounts, not actual customer/admin accounts.
      for(const [index,id] of created.entries()){
        const email=index===0?emailA:emailU;
        const result=sql('SELECT count(*) FROM auth.users WHERE id='+q(id)+
          " AND email='"+email+"'");
        assert.equal(result,'1','QA cleanup identity mismatch');
      }
      const body=[
        'BEGIN;',
        'DELETE FROM public.admin_audit_log WHERE actor_user_id='+q(adminId)+';',
        'DELETE FROM public.redemptions WHERE user_id='+q(targetId)+';',
        'DELETE FROM public.pro_credit_entries WHERE user_id='+q(targetId)+';',
        'DELETE FROM public.entitlement_grants WHERE user_id='+q(targetId)+';',
        'DELETE FROM public.redemption_codes WHERE created_by='+q(adminId)+';',
        'DELETE FROM public.redemption_code_batches WHERE created_by='+q(adminId)+';',
        'DELETE FROM public.pro_credit_accounts WHERE user_id='+q(targetId)+';',
        'DELETE FROM public.membership_events WHERE membership_id IN ('+
          'SELECT id FROM public.product_memberships WHERE user_id='+q(targetId)+');',
        'DELETE FROM public.product_memberships WHERE user_id='+q(targetId)+';',
        'DELETE FROM public.redemption_rate_limits WHERE user_id='+q(targetId)+';',
        'DELETE FROM public.platform_admins WHERE user_id='+q(adminId)+';',
        'COMMIT;',
      ].join('\n');
      // 10k test Grants entail FK enforcement and may take longer than the
      // 30s normal SQL bound. Keep the original all-or-nothing cleanup SQL
      // transaction alive through completion before deleting Auth users.
      sql(body,180000);
      for(const id of created.slice().reverse()){
        await request('/auth/v1/admin/users/'+id,{admin:true,method:'DELETE',expect:200});
        assert.equal(sql('SELECT count(*) FROM auth.users WHERE id='+q(id)),'0');
      }
      console.log('PRO_CREDIT_HTTP_QA_CLEANUP PASS');
    }catch(error){
      cleanupOk=false;
      console.error('PRO_CREDIT_HTTP_QA_CLEANUP_FAIL '+String(error?.message??error).slice(0,260));
      process.exitCode=1;
    }
  }
}
if(done&&cleanupOk)console.log('PRO_CREDIT_HTTP_ALL_PASS: real local JWT + AAL2 + protected RPC');
if(scaleMode&&done&&cleanupOk){
  // Other Lens/Core development may write to this shared nonempty database.
  // Global COUNT equality cannot establish ownership or correct cleanup.
  // Require ZERO survivors by this run's exact UUIDs and unique source refs;
  // report unrelated global count drift separately without deleting it.
  const owned=JSON.parse(sql("BEGIN READ ONLY; SELECT json_build_object("+
    "'qa_auth',(SELECT count(*) FROM auth.users WHERE id IN ("+q(adminId)+','+q(targetId)+")), "+
    "'qa_admin',(SELECT count(*) FROM public.platform_admins WHERE user_id="+q(adminId)+"), "+
    "'qa_members',(SELECT count(*) FROM public.product_memberships WHERE user_id="+q(targetId)+"), "+
    "'qa_grants',(SELECT count(*) FROM public.entitlement_grants WHERE user_id="+q(targetId)+"), "+
    "'qa_scale_grants',(SELECT count(*) FROM public.entitlement_grants WHERE source_ref LIKE 'qa-http-scale:"+tag+":%'), "+
    "'qa_entries',(SELECT count(*) FROM public.pro_credit_entries WHERE user_id="+q(targetId)+"), "+
    "'qa_accounts',(SELECT count(*) FROM public.pro_credit_accounts WHERE user_id="+q(targetId)+"), "+
    "'qa_audit',(SELECT count(*) FROM public.admin_audit_log WHERE actor_user_id="+q(adminId)+"), "+
    "'qa_codes',(SELECT count(*) FROM public.redemption_codes WHERE created_by="+q(adminId)+"), "+
    "'qa_batches',(SELECT count(*) FROM public.redemption_code_batches WHERE created_by="+q(adminId)+")); COMMIT;"));
  assert.ok(Object.values(owned).every(count=>count===0),
    'exactly owned QA records must be fully removed');
  const current=JSON.parse(sql("BEGIN READ ONLY; SELECT json_build_object("+
    "'users',(select count(*) from auth.users),"+
    "'grants',(select count(*) from public.entitlement_grants),"+
    "'entries',(select count(*) from public.pro_credit_entries),"+
    "'accounts',(select count(*) from public.pro_credit_accounts),"+
    "'audit',(select count(*) from public.admin_audit_log),"+
    "'members',(select count(*) from public.product_memberships)); COMMIT;"));
  const globalCountsChanged=Object.keys(baselineCounts).some(key=>
    baselineCounts[key]!==current[key]);
  const file=new URL('../docs/Plans/aisencore-mvp/ui-evidence/pro-credit-http-scale-2026-10-29.json',import.meta.url);
  writeFileSync(file,JSON.stringify({
    pass:true,environment:'Local GoTrue JWT/TOTP AAL2 + real PostgREST/DB on 127.0.0.1:55321',
    method:'40 serial samples / RPC after 12 warm-ups per 100/1000/10000-row synthetic QA account',
    caveat:'Single developer workstation, no simulated network; other independent writes may occur in shared local DB. Not production P95/SLA; synthetic 1-day Grants, no tenant-wide representative distribution.',
    scaleSamples,ownedQaResidue:owned,ownedQaClean:true,
    globalCountsChangedDuringTest:globalCountsChanged,
  },null,2));
  console.log('PRO_CREDIT_HTTP_SCALE_EXACT_QA_BASELINE_RESTORED PASS'+
    (globalCountsChanged?' (other local data totals also changed)':''));
}

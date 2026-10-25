#!/usr/bin/env node
// Real local Supabase GoTrue/PostgREST/Mailpit E2E. Node 24 built-ins only.
// No passwords, TOTP secrets, JWTs, Auth keys, code plaintext persisted/logged.
// Performs cleanup of synthetic identities and business rows, even on failure.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHmac, createPublicKey, randomBytes, randomUUID, timingSafeEqual, verify as cryptoVerify } from 'node:crypto';

const win=process.platform==='win32';
const cli=spawnSync(win?'cmd.exe':'pnpm',
  win?['/d','/s','/c','pnpm dlx supabase status -o json']:['dlx','supabase','status','-o','json'],
  {encoding:'utf8',timeout:45000});
assert.equal(cli.status,0,'local Supabase CLI unavailable');
const cfg=JSON.parse(cli.stdout);
assert.equal(cfg.API_URL,'http://127.0.0.1:55321','remote API refused');
assert.equal(cfg.MAILPIT_URL,'http://127.0.0.1:55324','remote mail refused');
assert.match(cfg.DB_URL,/127\.0\.0\.1:55322/,'remote DB refused');
assert.match(execFileSync('docker',['port','supabase_db_Aisencore','5432/tcp'],
  {encoding:'utf8',timeout:12000}),/:55322\b/,'wrong local container');
const runId=randomUUID().replaceAll('-','').slice(0,14);
const email='d2-'+runId+'-user@example.invalid';
const adminEmail='d2-'+runId+'-admin@example.invalid';
const secondEmail='d2-'+runId+'-admin2@example.invalid';
const productKey='d2_'+runId;
const password='LocalD2!'+randomBytes(16).toString('hex');
const createdUserIds=[];
let createdProductId=null;
let mfaRequestCount=0;

function q(uuid) {
  assert.match(uuid,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  return "'"+uuid+"'";
}
function sql(text) {
  return execFileSync('docker',['exec','supabase_db_Aisencore','psql','-X','-qAt',
    '-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',text],
    {encoding:'utf8',timeout:20000}).trim();
}
async function request(path, opts={}) {
  const headers={apikey:opts.admin?cfg.SERVICE_ROLE_KEY:cfg.ANON_KEY};
  if(opts.token) headers.authorization='Bearer '+opts.token;
  if(opts.admin) headers.authorization='Bearer '+cfg.SERVICE_ROLE_KEY;
  if(opts.body!==undefined) headers['content-type']='application/json';
  if(path.includes('/factors')) mfaRequestCount++;
  const response=await fetch((opts.mail?cfg.MAILPIT_URL:cfg.API_URL)+path,{
    method:opts.method||'GET',headers,redirect:opts.redirect||'follow',
    body:opts.body===undefined?undefined:JSON.stringify(opts.body),
    signal:AbortSignal.timeout(12000)
  });
  const raw=await response.text();
  let data;
  try{data=JSON.parse(raw);}catch{data=raw;}
  return {status:response.status,data};
}
function check(res,status,label) {
  assert.equal(res.status,status,label+': HTTP '+res.status+' expected '+status+
    ' code '+(res.data?.code||'none'));
  return res.data;
}
async function decodeJWT(jwt) {
  const parts=jwt.split('.');
  assert.equal(parts.length,3,'JWT part count');
  const header=JSON.parse(Buffer.from(parts[0],'base64url'));
  const claims=JSON.parse(Buffer.from(parts[1],'base64url'));
  const actual=Buffer.from(parts[2],'base64url');
  if(header.alg==='HS256') {
    const expected=createHmac('sha256',cfg.JWT_SECRET).update(parts[0]+'.'+parts[1]).digest();
    assert.ok(timingSafeEqual(actual,expected),'cryptographically verified local HMAC JWT');
  } else {
    assert.ok(['ES256','RS256'].includes(header.alg),'supported asymmetric signing algorithm');
    const jwks=check(await request('/auth/v1/.well-known/jwks.json'),200,'GoTrue JWKS');
    const jwk=jwks.keys?.find(key=>key.kid===header.kid);
    assert.ok(jwk,'matching current signing key ID');
    const options=header.alg==='ES256'
      ? {key:createPublicKey({key:jwk,format:'jwk'}),dsaEncoding:'ieee-p1363'}
      : createPublicKey({key:jwk,format:'jwk'});
    assert.ok(cryptoVerify(header.alg==='RS256'?'RSA-SHA256':'sha256',
      Buffer.from(parts[0]+'.'+parts[1]),options,actual),
      'JWKS cryptographically verified signed JWT');
  }
  assert.equal(claims.aud,'authenticated');
  assert.ok(claims.iss?.startsWith(cfg.API_URL+'/auth/v1'),'GoTrue issuer');
  assert.ok(claims.exp>Date.now()/1000,'token not expired');
  return claims;
}
function totp(secret) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let buffer=0,bits=0,bytes=[];
  for(const c of secret.replace(/[\s=]/g,'').toUpperCase()) {
    const x=alphabet.indexOf(c);
    assert.ok(x>=0,'base32 TOTP secret');
    buffer=(buffer<<5)|x;bits+=5;
    if(bits>=8){bits-=8;bytes.push((buffer>>>bits)&255);}
  }
  const counter=Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const hash=createHmac('sha1',Buffer.from(bytes)).update(counter).digest();
  const n=(hash.readUInt32BE(hash.at(-1)&15)&0x7fffffff)%1000000;
  return String(n).padStart(6,'0');
}
async function rpc(name,body,token) {
  return request('/rest/v1/rpc/'+name,{method:'POST',body,token});
}
async function mailLink(address, expectedType) {
  const deadline=Date.now()+18000;
  while(Date.now()<deadline) {
    const messages=check(await request('/api/v1/messages',{mail:true}),200,'Mailpit');
    const candidates=messages.messages?.filter(x=>x.To?.some(y=>y.Address?.toLowerCase()===address))||[];
    for (const item of candidates) {
      const detail=check(await request('/api/v1/message/'+encodeURIComponent(item.ID),
        {mail:true}),200,'Mailpit message');
      const body=String(detail.Text||'')+'\n'+String(detail.HTML||'');
      const start=body.indexOf(cfg.API_URL+'/auth/v1/verify?');
      if (start<0) continue;
      const url=body.slice(start).match(/^[^\s<>"']+/)?.[0]?.replaceAll('&amp;','&');
      if (url && (!expectedType || new URL(url).searchParams.get('type')===expectedType)) return url;
    }
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw Error('Expected local Mailpit verification message absent');
}
async function signin(address) {
  const session=check(await request('/auth/v1/token?grant_type=password',
    {method:'POST',body:{email:address,password}}),200,'real password login');
  assert.ok(session.access_token&&session.refresh_token,'session credentials');
  assert.equal((await decodeJWT(session.access_token)).aal,'aal1','password has AAL1');
  return session;
}
async function newAdmin(address) {
  const data=check(await request('/auth/v1/admin/users',
    {method:'POST',body:{email:address,password,email_confirm:true},admin:true}),200,
    'local synthetic Auth Admin createUser');
  assert.ok(data.id,'GoTrue user ID');
  createdUserIds.push(data.id);
  return data.id;
}
async function mfaUpgrade(session) {
  const enroll=check(await request('/auth/v1/factors',{
    method:'POST',token:session.access_token,
    body:{factor_type:'totp',friendly_name:'D2 test factor'}}),200,'TOTP enroll');
  assert.ok(enroll.id&&enroll.totp?.secret,'TOTP factor and secret');
  const challenge=check(await request('/auth/v1/factors/'+enroll.id+'/challenge',{
    method:'POST',token:session.access_token,body:{}}),200,'TOTP challenge');
  const verified=check(await request('/auth/v1/factors/'+enroll.id+'/verify',{
    method:'POST',token:session.access_token,
    body:{challenge_id:challenge.id,code:totp(enroll.totp.secret)}}),200,'TOTP verify');
  assert.ok(verified.access_token,'upgraded JWT');
  assert.equal((await decodeJWT(verified.access_token)).aal,'aal2','verified MFA has AAL2');
  return verified;
}
function cleanSql() {
  if(!createdUserIds.length)return;
  const ids=createdUserIds.map(q).join(',');
  const queries=[
    'DELETE FROM public.admin_audit_log WHERE actor_user_id IN ('+ids+')',
    'DELETE FROM public.redemptions WHERE user_id IN ('+ids+')',
    'DELETE FROM public.entitlement_grants WHERE user_id IN ('+ids+')',
    'DELETE FROM public.redemption_codes WHERE created_by IN ('+ids+')',
    'DELETE FROM public.redemption_code_batches WHERE created_by IN ('+ids+')',
    'DELETE FROM public.redemption_rate_limits WHERE user_id IN ('+ids+')',
    'DELETE FROM public.membership_events WHERE membership_id IN (SELECT id FROM public.product_memberships WHERE user_id IN ('+ids+'))',
    'DELETE FROM public.product_memberships WHERE user_id IN ('+ids+')',
    'DELETE FROM public.platform_account_restrictions WHERE user_id IN ('+ids+')',
    'DELETE FROM public.platform_admins WHERE user_id IN ('+ids+')'
  ];
  if(createdProductId)queries.push('DELETE FROM public.products WHERE id='+q(createdProductId));
  sql('BEGIN;'+queries.join(';')+';COMMIT;');
}
async function cleanAuth() {
  for(const id of createdUserIds) {
    const response=await request('/auth/v1/admin/users/'+id,{method:'DELETE',admin:true});
    assert.ok([200,204,404].includes(response.status),'cleanup Auth user status');
  }
}
async function main() {
  check(await request('/auth/v1/health'),200,'GoTrue health');
  check(await request('/api/v1/messages',{mail:true}),200,'Mailpit health');
  check(await request('/rest/v1/'),200,'PostgREST health');
  console.log('D2-M1 PASS: GoTrue/Kong/PostgREST/Mailpit healthy');

  const signedUp=await request('/auth/v1/signup',{method:'POST',body:{email,password}});
  assert.ok([200,201].includes(signedUp.status),'real signup');
  // Raw GoTrue /signup returns a user object at the root (the SDK wraps it).
  const userId=signedUp.data?.id||signedUp.data?.user?.id;
  assert.ok(userId&&!signedUp.data?.access_token&&!signedUp.data?.session,
    'unconfirmed user has no access token');
  createdUserIds.push(userId);
  const premature=await request('/auth/v1/token?grant_type=password',
    {method:'POST',body:{email,password}});
  assert.ok(premature.status>=400,'unconfirmed email cannot password login');
  const confirmURL=await mailLink(email);
  assert.equal(new URL(confirmURL).origin,cfg.API_URL,'confirmation remains local');
  const verified=await fetch(confirmURL,{redirect:'manual',signal:AbortSignal.timeout(12000)});
  assert.ok([200,302,303].includes(verified.status),'real email confirmation');
  const user=await signin(email);
  assert.equal((await decodeJWT(user.access_token)).sub,userId);
  console.log('AUTH PASS: real signup, email confirmation via Mailpit, verified signed JWT');

  check(await request('/rest/v1/rpc/check_access',
    {method:'POST',body:{p_product_key:productKey}}),401,'anonymous access');
  check(await request('/rest/v1/rpc/check_access',
    {method:'POST',body:{p_product_key:productKey},token:'invalid.jwt.test'}),401,'bad JWT');
  const denied=check(await rpc('check_access',{p_product_key:productKey},
    user.access_token),200,'business check denied');
  assert.equal(denied.allowed,false);
  assert.equal(denied.reason,'PRODUCT_UNAVAILABLE');
  const redeem=check(await rpc('redeem_code',
    {p_product_key:productKey,p_code:'NONEXISTENT'},user.access_token),200,'business redeem denied');
  assert.equal(redeem.ok,false);
  assert.equal(redeem.code,'PRODUCT_UNAVAILABLE');
  assert.deepEqual(check(await rpc('get_my_products',{},user.access_token),200,'initial products'),[]);
  console.log('D2-M1 PASS: HTTP 401 auth; HTTP 200 + business reasons');

  const adminId=await newAdmin(adminEmail);
  const adminBId=await newAdmin(secondEmail);
  sql('INSERT INTO public.platform_admins(user_id,active) VALUES ('+
    q(adminId)+',true),('+q(adminBId)+',true)');
  const a1=await signin(adminEmail);
  const b1=await signin(secondEmail);
  assert.equal(check(await rpc('admin_check_access',{},a1.access_token),200,'AAL1 admin').allowed,false);
  check(await rpc('admin_lookup_users',{p_user_ids:[userId]},a1.access_token),403,'AAL1 lookup refused');
  check(await rpc('admin_create_product',
    {p_product_key:productKey,p_name:'D2 Test'},a1.access_token),403,'AAL1 admin write refused');
  check(await rpc('admin_lookup_users',{p_user_ids:[userId]},user.access_token),403,
    'ordinary user cannot read auth identities');
  const a2=await mfaUpgrade(a1);
  const b2=await mfaUpgrade(b1);
  assert.equal(check(await rpc('admin_check_access',{},a2.access_token),200,'AAL2 admin').allowed,true);
  const prevMfa=mfaRequestCount;
  const found=check(await rpc('admin_lookup_users',
    {p_user_ids:[userId,adminBId],p_page:1,p_per_page:50},a2.access_token),200,'admin lookup');
  assert.equal(found.total,2,'bounded UUID lookup');
  assert.deepEqual(Object.keys(found.items[0]).sort(),
    ['id','email','created_at','email_confirmed_at','last_sign_in_at'].sort(),'exact whitelist');
  assert.equal(check(await rpc('admin_lookup_users',
    {p_email_exact:email.toUpperCase()},a2.access_token),200,'email exact').total,1);
  check(await rpc('admin_lookup_users',{},a2.access_token),422,'unbounded admin lookup');
  // HTTP smoke latency on 50 UUIDs, not a representative-production P95 SLA.
  const batchIds=[userId,adminBId,...Array.from({length:48},()=>randomUUID())];
  const lookupTimes=[];
  for(let i=0;i<15;i++) {
    const start=performance.now();
    const page=check(await rpc('admin_lookup_users',
      {p_user_ids:batchIds,p_page:1,p_per_page:50},a2.access_token),200,
      '50 UUID bounded HTTP lookup');
    assert.equal(page.total,2,'unknown UUIDs do not affect results');
    lookupTimes.push(performance.now()-start);
  }
  lookupTimes.sort((x,y)=>x-y);
  const observedP95=lookupTimes[Math.ceil(lookupTimes.length*0.95)-1];
  console.log('REV-DEC06 HTTP smoke: 50 UUID P95 '+observedP95.toFixed(1)+'ms / '+lookupTimes.length+
    ' local samples; not representative data-scale acceptance');
  assert.equal(mfaRequestCount,prevMfa,'no extra MFA requests for normal admin actions');
  console.log('D2-M2 PASS: signed AAL1/2, bounded real Auth identity lookup, whitelist');

  const product=check(await rpc('admin_create_product',
    {p_product_key:productKey,p_name:'D2 Test'},a2.access_token),200,'create product');
  createdProductId=product.id;
  check(await rpc('admin_set_product_status',
    {p_product_id:createdProductId,p_status:'active',p_reason:'D2 local test'},
    a2.access_token),200,'activate product');
  assert.equal(check(await rpc('check_access',{p_product_key:productKey},
    user.access_token),200,'membership missing').reason,'MEMBERSHIP_REQUIRED');
  check(await rpc('ensure_membership',{p_product_key:productKey},
    user.access_token),200,'real JWT membership join');
  assert.equal(check(await rpc('check_access',{p_product_key:productKey},
    user.access_token),200,'membership active').allowed,true);
  console.log('D2-M1 PASS: real HTTP admin write + user member lifecycle');

  check(await rpc('admin_block_account',
    {p_target_user_id:userId,p_reason:'D2 local blocked check'},a2.access_token),200,
    'admin blocks a different user');
  const blockedAccess=check(await rpc('check_access',
    {p_product_key:productKey},user.access_token),200,'blocked access');
  assert.equal(blockedAccess.reason,'ACCOUNT_RESTRICTED');
  assert.equal(blockedAccess.allowed,false);
  const blockedRedeem=check(await rpc('redeem_code',
    {p_product_key:productKey,p_code:'INVALID'},user.access_token),200,'blocked redemption');
  assert.equal(blockedRedeem.code,'ACCOUNT_RESTRICTED');
  check(await rpc('ensure_membership',
    {p_product_key:productKey},user.access_token),403,'blocked member write');
  check(await rpc('admin_unblock_account',
    {p_target_user_id:userId,p_reason:'D2 local restore'},a2.access_token),200,
    'admin unblocks user');
  assert.equal(check(await rpc('check_access',
    {p_product_key:productKey},user.access_token),200,'post-unblock access').allowed,true);
  check(await rpc('admin_create_codes',{
    p_product_id:createdProductId,p_tier:'pro',p_quantity:0,
    p_grant_duration_days:30,p_is_lifetime:false,p_max_redemptions_per_code:1,
    p_code_expires_at:null,p_request_id:'d2-invalid',p_note:null},a2.access_token),422,
    'invalid code issuance fails HTTP 422');
  console.log('D2-M1 PASS: immediate blocked checks, redeem 200, writes 403 and invalid input 422');

  check(await rpc('admin_block_account',
    {p_target_user_id:adminBId,p_reason:'D2 blocked admin test'},a2.access_token),200,
    'qualified admin blocks another admin');
  check(await rpc('admin_lookup_users',{p_user_ids:[userId]},b2.access_token),403,
    'blocked admin old signed AAL2 JWT cannot look up identities');
  check(await rpc('admin_unblock_account',
    {p_target_user_id:adminBId,p_reason:'D2 unblock admin test'},a2.access_token),200,
    'qualified admin unblocks peer');
  check(await rpc('admin_lookup_users',{p_user_ids:[userId]},b2.access_token),200,
    'unblocked admin current AAL2 again qualified');
  check(await rpc('admin_revoke_admin',
    {p_target_user_id:adminId,p_reason:'D2 immediate revocation'},b2.access_token),200,
    'second admin revokes first');
  check(await rpc('admin_lookup_users',{p_user_ids:[userId]},a2.access_token),403,
    'old AAL2 JWT rejected after revoke');
  assert.equal(check(await rpc('admin_check_access',{},a2.access_token),200,
    'revoke check').allowed,false);
  console.log('AUTH PASS: stale signed AAL2 JWT denied at next admin request');
  // A retained local development administrator changes the genuine M1
  // precondition: this synthetic B is then NOT the last eligible admin.
  // Never disable or delete a user's durable admin just to manufacture HTTP 409.
  const outside=Number(sql("SELECT count(*) FROM public.platform_admins a"+
    " WHERE a.active AND a.user_id NOT IN ("+q(adminId)+","+q(adminBId)+")"+
    " AND NOT EXISTS(SELECT 1 FROM public.platform_account_restrictions r"+
    " WHERE r.user_id=a.user_id AND r.kind='blocked')"));
  const last=await rpc('admin_revoke_admin',
    {p_target_user_id:adminBId,p_reason:'D2 last admin semantics'},b2.access_token);
  if(outside===0){
    check(last,409,'genuine last eligible admin cannot be revoked');
    console.log('D2-M1 PASS: last-admin conflict returns real HTTP 409');
  }else{
    assert.equal(check(last,200,'other eligible admin remains').changed,true);
    assert.equal(check(await rpc('admin_check_access',{},b2.access_token),200,
      'synthetic B revoked with durable other admin').allowed,false);
    check(await rpc('admin_lookup_users',{p_user_ids:[userId]},b2.access_token),403,
      'stale JWT revoked even though another admin still exists');
    console.log('D2-M1 PASS: last synthetic admin may be revoked only with durable eligible admin; stale token rejected');
    console.log('D2-M1 409 HTTP last-admin negative NOT RUN: other eligible local dev administrator present; pgTAP isolated M1 passes');
  }

  const sa=await signin(email);
  const sb=await signin(email);
  check(await request('/auth/v1/logout?scope=local',
    {method:'POST',token:sa.access_token}),204,'local logout A');
  check(await request('/auth/v1/token?grant_type=refresh_token',
    {method:'POST',body:{refresh_token:sb.refresh_token}}),200,'session B unaffected');
  assert.ok((await request('/auth/v1/token?grant_type=refresh_token',
    {method:'POST',body:{refresh_token:sa.refresh_token}})).status>=400,
    'session A refresh revoked');
  console.log('AUTH PASS: independent sessions and local signOut semantics');

  check(await request('/auth/v1/recover',{
    method:'POST',body:{email}}),200,'recovery email request');
  const resetUrl=await mailLink(email,'recovery');
  assert.equal(new URL(resetUrl).origin,cfg.API_URL,'GoTrue recovery link local only');
  const resetResponse=await fetch(resetUrl,{redirect:'manual',signal:AbortSignal.timeout(12000)});
  assert.ok([200,302,303].includes(resetResponse.status),'GoTrue accepts recovery link');
  const location=resetResponse.headers.get('location');
  assert.ok(location,'recovery redirects with a session');
  const hash=new URL(location).hash.slice(1);
  const resetToken=new URLSearchParams(hash).get('access_token');
  assert.ok(resetToken,'GoTrue recovery session in redirect fragment');
  assert.equal((await decodeJWT(resetToken)).sub,userId,'recovery token matches caller');
  const updatedPassword='RecoveryLocal!'+randomBytes(15).toString('hex');
  check(await request('/auth/v1/user',{method:'PUT',token:resetToken,
    body:{password:updatedPassword}}),200,'recovery session sets new password');
  assert.ok((await request('/auth/v1/token?grant_type=password',{
    method:'POST',body:{email,password}})).status>=400,'old password no longer accepted');
  const resetLogin=check(await request('/auth/v1/token?grant_type=password',{
    method:'POST',body:{email,password:updatedPassword}}),200,'new password succeeds');
  assert.equal((await decodeJWT(resetLogin.access_token)).sub,userId,'new password authenticates correct user');
  console.log('AUTH PASS: password recovery via real Mailpit link and signed JWT');
}
let passed=false;
try{
  await main();
  passed=true;
}finally{
  try{cleanSql();}catch(e){console.error('SQL fixture cleanup error: '+e.message);passed=false;}
  try{await cleanAuth();}catch(e){console.error('Auth fixture cleanup error: '+e.message);passed=false;}
}
if(!passed)process.exitCode=1;
else console.log('D2 real local Auth/API/MFA HTTP checks PASS');

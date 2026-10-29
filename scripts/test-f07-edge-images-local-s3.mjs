#!/usr/bin/env node
// Actual local GoTrue JWT -> production Edge -> Postgres -> signed S3 protocol fixture.
// Uses only the verified local :55321/:55322 installation and throwaway identities.
// No R2/cloud, no permanent DB migrations, no existing user/product deletions.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer as httpServer} from 'node:http';
import {createServer as tcpServer} from 'node:net';
import {writeFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {deflateSync,inflateRawSync} from 'node:zlib';
const win=process.platform==='win32';
const root=new URL('../',import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/,x=>x.slice(1));
const run=(exe,args,opts={})=>spawnSync(exe,args,
  {cwd:root,encoding:'utf8',timeout:45000,maxBuffer:1_000_000,...opts});
const result=run(win?'cmd.exe':'pnpm',win?
  ['/d','/s','/c','pnpm dlx supabase status --output json']:
  ['dlx','supabase','status','--output','json']);
assert.equal(result.status,0,'local Supabase CLI required');
const cfg=JSON.parse(result.stdout);
assert.equal(cfg.API_URL,'http://127.0.0.1:55321');
assert.match(cfg.DB_URL,/127\.0\.0\.1:55322/);
const port=run('docker',['port','supabase_db_Aisencore','5432/tcp']);
assert.equal(port.status,0);assert.match(port.stdout,/:55322\b/);
const key=cfg.PUBLISHABLE_KEY||cfg.ANON_KEY,adminKey=cfg.SERVICE_ROLE_KEY;
assert.ok(key&&adminKey);
const created=[],objects=new Map(),s3Events=[];
let secondImageReportId=null;
let secondPutFault=null;
let heldExportGet=null;
const unique=randomUUID().replaceAll('-','').slice(0,13);
const password='F07fixture!'+randomBytes(14).toString('hex');
let fixture=null,edgeWorker=null,gate=null,ownedEnvFile=null;
let baselineCounts=null;
let originalRecordIds=null;
const sleep=n=>new Promise(resolve=>setTimeout(resolve,n));
function sql(text){
  const r=run('docker',['exec','supabase_db_Aisencore','psql','-X','-qAt',
    '-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',text],{timeout:20000});
  if(r.status!==0)throw Error('local SQL failure: '+r.stderr.slice(-350));
  return r.stdout.trim();
}
const qq=id=>{assert.match(id,/^[a-f0-9-]{36}$/i);return "'"+id+"'"};
const preservedTables=['auth.users','public.user_feedback','public.product_memberships',
  'public.feedback_attachments','public.entitlement_grants'];
function preserveOriginalIds(){
  originalRecordIds=Object.fromEntries(preservedTables.map(table=>
    [table,JSON.parse(sql('BEGIN READ ONLY; SELECT COALESCE(jsonb_agg(id),'+
      "'[]'::jsonb) FROM "+table+'; COMMIT;'))]));
}
function verifyOriginalIds(){
  for(const [table,ids] of Object.entries(originalRecordIds??{})){
    if(!ids.length)continue;
    assert.equal(sql('SELECT count(*) FROM '+table+' WHERE id IN ('+
      ids.map(qq).join(',')+')'),String(ids.length),
      'existing non-QA IDs must remain in '+table);
  }
}
async function req(path,method='POST',body=null,token=null,service=false){
  const headers={apikey:service?adminKey:key,
    authorization:'Bearer '+(service?adminKey:token??key)};
  const res=await fetch(cfg.API_URL+path,{method,headers:{
    ...headers,...(body instanceof FormData?{}:{'content-type':'application/json'})},
    body:body===null?undefined:body instanceof FormData?body:JSON.stringify(body),
    signal:AbortSignal.timeout(25000)});
  const buf=new Uint8Array(await res.arrayBuffer());
  let data;try{data=JSON.parse(Buffer.from(buf).toString('utf8'))}catch{data=buf}
  return {status:res.status,data};
}
function form(text,images,id=randomUUID()){
  const fd=new FormData();
  fd.set('product_key','aisenlens');fd.set('request_id',id);
  fd.set('content',text);fd.set('category','bug');fd.set('contact_email','fixture@example.com');
  for(const [i,blob] of images.entries())fd.append('images',blob,'test-'+i+'.png');
  return fd;
}
function png(seed){
  const crc32=bytes=>{
    let c=0xffffffff;
    for(const b of bytes){c^=b;for(let n=0;n<8;n++)
      c=(c>>>1)^((c&1)?0xedb88320:0)}
    return (c^0xffffffff)>>>0;
  };
  const chunk=(name,data)=>{
    const type=Buffer.from(name);
    const body=Buffer.concat([type,data]),len=Buffer.alloc(4),crc=Buffer.alloc(4);
    len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len,body,crc]);
  };
  const header=Buffer.alloc(13);header.writeUInt32BE(4,0);
  header.writeUInt32BE(4,4);header[8]=8;header[9]=6;
  const scan=Buffer.alloc(4*17);
  for(let y=0;y<4;y++)for(let x=0;x<4;x++){
    const at=y*17+1+x*4;
    scan[at]=seed;scan[at+1]=95;scan[at+2]=210;scan[at+3]=255;
  }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',header),chunk('IDAT',deflateSync(scan)),
    chunk('IEND',Buffer.alloc(0))]);
}
async function user(tag){
  const email='f07-img-'+unique+'-'+tag+'@example.invalid';
  const createdResult=await req('/auth/v1/admin/users','POST',{
    email,password,email_confirm:true},null,true);
  assert.equal(createdResult.status,200,'create fixture identity '+tag);
  const id=createdResult.data.id;qq(id);created.push(id);
  const login=await req('/auth/v1/token?grant_type=password','POST',{email,password});
  assert.equal(login.status,200,'login fixture identity');
  return {id,token:login.data.access_token};
}
async function registeredMailOwner(){
  // Unlike admin.createUser fixtures, this feedback owner must perform the
  // actual GoTrue signup -> Mailpit delivery -> real email verification.
  // All resulting identities are synthetic and deleted in the outer finally.
  const email='f07-img-'+unique+'-signedup@example.invalid';
  const callback='http://127.0.0.1:8443/auth/confirm';
  const signup=await req('/auth/v1/signup?redirect_to='+encodeURIComponent(callback),
    'POST',{email,password});
  assert.equal(signup.status,200,'real signup endpoint for the feedback owner');
  const id=sql("select id from auth.users where email='"+email+"'");
  qq(id);created.push(id);
  assert.equal(sql('select email_confirmed_at is null from auth.users where id='+qq(id)),
    't','signup initially requires real email confirmation');
  assert.equal(cfg.MAILPIT_URL,'http://127.0.0.1:55324');
  let confirmationLink=null;
  const prefix=cfg.API_URL+'/auth/v1/verify?';
  for(let attempt=0;attempt<90&&!confirmationLink;attempt++){
    const inbox=await fetch(cfg.MAILPIT_URL+'/api/v1/messages',{
      signal:AbortSignal.timeout(6000)}).then(r=>r.json());
    for(const item of inbox.messages??[]){
      if(!item.To?.some(v=>v.Address?.toLowerCase()===email))continue;
      const detail=await fetch(cfg.MAILPIT_URL+'/api/v1/message/'+
        encodeURIComponent(item.ID),{signal:AbortSignal.timeout(6000)}).then(r=>r.json());
      const html=String(detail.Text??'')+'\n'+String(detail.HTML??'');
      const matches=html.match(/https?:\/\/[^\s<>"']+/g)??[];
      for(const raw of matches){
        const url=raw.replaceAll('&amp;','&');
        if(!url.startsWith(prefix))continue;
        if(new URL(url).searchParams.get('type')!=='signup')continue;
        confirmationLink=url;break;
      }
      if(confirmationLink)break;
    }
    if(!confirmationLink)await sleep(330);
  }
  assert.ok(confirmationLink,'actual Mailpit signup confirmation link delivered');
  const confirmed=await fetch(confirmationLink,{
    redirect:'manual',headers:{apikey:key},signal:AbortSignal.timeout(12000)});
  assert.ok([302,303].includes(confirmed.status),'GoTrue must redirect on valid confirmation');
  assert.ok((confirmed.headers.get('location')??'').startsWith(callback),
    'valid confirmation redirects only to the approved Lens callback');
  assert.equal(sql('select email_confirmed_at is not null from auth.users where id='+qq(id)),
    't','real mail proof confirmed the signup identity');
  const login=await req('/auth/v1/token?grant_type=password','POST',{email,password});
  assert.equal(login.status,200,'mail-confirmed user can use genuine GoTrue login');
  console.log('F07_REAL_GOTRUE_MAIL_CONFIRMED_OWNER PASS signup -> Mailpit -> verified link -> login');
  return {id,token:login.data.access_token};
}
function totp(secret){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits=0,value=0,bytes=[];
  for(const char of secret.replace(/[=\s]/g,'').toUpperCase()){
    const index=alphabet.indexOf(char);assert.ok(index>=0,'TOTP base32');
    value=(value<<5)|index;bits+=5;
    if(bits>=8){bits-=8;bytes.push((value>>>bits)&255)}
  }
  const counter=Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',Buffer.from(bytes)).update(counter).digest();
  return String((digest.readUInt32BE(digest.at(-1)&15)&0x7fffffff)%1000000).padStart(6,'0');
}
async function adminAal2(token){
  const enroll=await req('/auth/v1/factors','POST',{
    factor_type:'totp',friendly_name:'F07 local ZIP fixture'},token);
  assert.equal(enroll.status,200,'enroll isolated admin TOTP');
  const challenge=await req('/auth/v1/factors/'+enroll.data.id+'/challenge','POST',{},token);
  assert.equal(challenge.status,200);
  const verified=await req('/auth/v1/factors/'+enroll.data.id+'/verify','POST',
    {challenge_id:challenge.data.id,code:totp(enroll.data.totp.secret)},token);
  assert.equal(verified.status,200,'verify AAL2');
  const claims=JSON.parse(Buffer.from(verified.data.access_token.split('.')[1],'base64url').toString());
  assert.equal(claims.aal,'aal2');
  return verified.data.access_token;
}
function unzipEntries(data){
  const bytes=Buffer.from(data),entries=new Map();
  let offset=0;
  while(offset+30<=bytes.length&&bytes.readUInt32LE(offset)===0x04034b50){
    const flags=bytes.readUInt16LE(offset+6),method=bytes.readUInt16LE(offset+8);
    assert.equal(flags&8,0,'ZIP unsupported data descriptor');
    const compressed=bytes.readUInt32LE(offset+18);
    const nameLength=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28);
    const name=bytes.subarray(offset+30,offset+30+nameLength).toString('utf8');
    const from=offset+30+nameLength+extra;
    const content=bytes.subarray(from,from+compressed);
    entries.set(name,method===8?inflateRawSync(content):Buffer.from(content));
    assert.ok([0,8].includes(method),'ZIP compression method');
    offset=from+compressed;
  }
  assert.ok(entries.size>=3,'ZIP includes metadata and attachments');
  return entries;
}
function s3Server(){
  return httpServer(async(request,response)=>{
    const path=(request.url??'').split('?')[0];
    const url=new URL(request.url??'/', 'http://localhost');
    if(!path.startsWith('/f07-feedback-private/feedback/')){
      response.writeHead(403);response.end();return;
    }
    // AWS signing is performed by the real S3Client. This fixture checks
    // signature presence, not cryptographic validity: not a Cloudflare R2 test.
    const signed=Boolean(request.headers.authorization)||url.searchParams.has('X-Amz-Signature');
    if(!signed){response.writeHead(403);response.end();return}
    if(request.method==='PUT'){
      s3Events.push({verb:'PUT',path,condition:request.headers['if-none-match']});
      if(request.headers['if-none-match']!=='*'){response.writeHead(412);response.end();return}
      // A one-request, loopback-only fault injection. The first image can be
      // stored, but all retries of the second image key receive 503 until the
      // test explicitly restores storage. The real Edge code is untouched.
      // Fail the second ORIGINAL, not slot-1's derived thumbnail. Both
      // originals and thumbnails are stored in distinct private S3 keys.
      if(secondPutFault && (secondPutFault.failedKey===path ||
        (/\/2-[^/]+\.(?:png|jpg|webp)$/.test(path) && !objects.has(path)))){
        secondPutFault.failedKey=path;
        response.writeHead(503,{'content-type':'application/xml'});
        response.end('<Error><Code>ServiceUnavailable</Code></Error>');
        return;
      }
      const chunks=[];for await(const piece of request)chunks.push(piece);
      if(objects.has(path)){response.writeHead(412,{'content-type':'application/xml'});
        response.end('<Error><Code>PreconditionFailed</Code></Error>');return}
      objects.set(path,Buffer.concat(chunks));
      if(secondPutFault)secondPutFault.successfulPuts++;
      response.writeHead(200,{etag:'"f07-fixture"'});response.end();return;
    }
    if(request.method==='GET'){
      s3Events.push({verb:'GET',path,signed:!!url.searchParams.get('X-Amz-Signature')});
      // Only the isolated local fixture may pause an in-flight export.
      // This allows a real Admin revocation while the production Edge is
      // fetching a committed image, before ZIP audit/final authorization.
      if(heldExportGet?.path===path){
        heldExportGet.entered();
        await heldExportGet.resume;
      }
      if(!objects.has(path)){response.writeHead(404,{'content-type':'application/xml'});
        response.end('<Error><Code>NoSuchKey</Code></Error>');return}
      const bytes=objects.get(path);
      response.writeHead(200,{'content-type':path.endsWith('.thumb.jpg')?'image/jpeg':'image/png',
        'content-length':bytes.length});
      response.end(bytes);return;
    }
    response.writeHead(405);response.end();
  });
}
let edgeDiagnostic='';
async function testLensBrowserWithRealS3(){
  // Keep this temporary S3 server responsive while Chrome runs in the Lens repo.
  const lensRoot=join(root,'..','Aisenlens');
  const browserTest=join(lensRoot,'tests','features','workflow',
    'core-account-feedback.browser.test.js');
  assert.ok(existsSync(browserTest),'expected local Lens browser suite');
  // Prefer the independently tested long-running official :8443 Vite while
  // this worker runs three real Edge functions. Starting a second Vite may
  // time out under concurrent Edge/browser cold-start load. If :8443 is not
  // available, retain the original disposable Vite fallback.
  let reuseOfficial=false;
  try{
    const probe=await fetch('http://127.0.0.1:8443/',{
      signal:AbortSignal.timeout(3500)});
    reuseOfficial=probe.ok;
  }catch{}
  console.log('F07_LENS_VITE_MODE',reuseOfficial?'existing-8443':'isolated-fallback');
  const child=spawn('node.exe',['--test','--test-concurrency=1',
    'tests/features/workflow/core-account-feedback.browser.test.js'],{
    cwd:lensRoot,env:{...process.env,AISENLENS_EXPECT_LOCAL_S3:'1',
      AISENLENS_REUSE_RUNNING_8443:reuseOfficial?'1':'0'},
    stdio:['ignore','pipe','pipe'],
  });
  let output='',errors='';
  child.stdout.on('data',value=>{output=(output+String(value)).slice(-14000)});
  child.stderr.on('data',value=>{errors=(errors+String(value)).slice(-6000)});
  const result=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{
      if(win)run('taskkill',['/PID',String(child.pid),'/T','/F'],{timeout:9000});
      else child.kill('SIGKILL');
      reject(new Error('Lens browser S3 test timed out'));
    },200000);
    child.once('error',error=>{clearTimeout(timer);reject(error)});
    child.once('close',code=>{clearTimeout(timer);resolve(code)});
  });
  assert.equal(result,0,'Lens browser private S3 failed: '+
    output.slice(-2500)+' '+errors.slice(-400));
  assert.ok(output.includes('LENS_REAL_PRIVATE_S3_IMAGES PASS'));
  assert.ok(output.includes('LENS_REAL_CORE_CLEANUP PASS'));
  verifyOriginalIds();
  console.log('F07_REAL_LENS_CHROME_TWO_IMAGES PASS browser -> Edge -> S3 -> DB; QA deleted');
}
async function startWorker(){
  edgeWorker=spawn(win?'cmd.exe':'pnpm',win?
    ['/d','/s','/c','pnpm dlx supabase functions serve feedback-submit feedback-image-access feedback-export']:
    ['dlx','supabase','functions','serve','feedback-submit','feedback-image-access',
      'feedback-export'],{cwd:root,stdio:['ignore','pipe','pipe']});
  let logs='';
  edgeWorker.stderr.on('data',data=>{logs=(logs+String(data)).slice(-12000);edgeDiagnostic=logs});
  // The local functions serve worker may answer one 401 while the Edge
  // runtime is still warming and subsequently return 503 to a browser.
  // Require repeated real unauthorized auth-gate responses before launching
  // the longer Lens Chrome test; never treat a 503 as ready.
  let readySamples=0;
  for(let n=0;n<84;n++){
    try{
      const res=await fetch(cfg.API_URL+'/functions/v1/feedback-submit',{
        method:'POST',headers:{apikey:key,'content-type':'application/json'},
        body:'{}',signal:AbortSignal.timeout(1800)});
      readySamples=res.status===401?readySamples+1:0;
      if(readySamples>=4){await sleep(900);return}
    }catch{readySamples=0}
    await sleep(750);
  }
  throw Error('Edge with local S3 fixture not ready '+logs.slice(-1100));
}
const listen=server=>new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(3418,'0.0.0.0',()=>resolve());
});
try{
  baselineCounts={
    auth_users:Number(sql('select count(*) from auth.users')),
    feedback:Number(sql('select count(*) from public.user_feedback')),
    attachments:Number(sql('select count(*) from public.feedback_attachments')),
    memberships:Number(sql('select count(*) from public.product_memberships')),
  };
  preserveOriginalIds();
  assert.ok(baselineCounts.auth_users>=1,'local Auth must have an existing Admin');
  assert.equal(sql("select string_agg(product_key,',' order by product_key) from public.products"),
    'aisenhub,aisenlens');
  // Pre-existing real feedback is not a reason to clear the database.
  assert.ok(baselineCounts.feedback>=0);
  gate=tcpServer();await new Promise((resolve,reject)=>{
    gate.once('error',reject);gate.listen(3412,'127.0.0.1',resolve)});
  fixture=s3Server();await listen(fixture);
  // Supabase CLI auto-loads supabase/functions/.env. Refuse to overwrite
  // any existing developer file; this fixture owns this path temporarily.
  const envfile=join(root,'supabase','functions','.env');
  await writeFile(envfile,[
    'R2_FEEDBACK_STORAGE_MODE=local-test',
    'R2_FEEDBACK_TEST_ENDPOINT=http://host.docker.internal:3418',
    'R2_FEEDBACK_TEST_ACCESS_KEY_ID=f07-fixture-access',
    'R2_FEEDBACK_TEST_SECRET_ACCESS_KEY=f07-fixture-secret',
    'R2_FEEDBACK_BUCKET=f07-feedback-private',''].join('\n'),{mode:0o600,flag:'wx'});
  ownedEnvFile=envfile;
  await startWorker();
  await testLensBrowserWithRealS3();
  const lensS3Objects=objects.size;
  assert.equal(lensS3Objects,4,'Lens must write 2 originals and 2 private thumbnails');
  const owner=await registeredMailOwner(),stranger=await user('stranger');
  const images=[png(80),png(120)];
  for(const count of [1,2]){
    const requestId=randomUUID(),content='Real Edge local signed S3 '+count+' '+unique;
    const blobs=images.slice(0,count).map(bytes=>new Blob([bytes],{type:'image/png'}));
    const createdResult=await req('/functions/v1/feedback-submit','POST',
      form(content,blobs,requestId),owner.token);
    if(createdResult.status!==201)console.log('S3_DIAG',JSON.stringify({events:s3Events.slice(-4),objects:objects.size,edgeLog:edgeDiagnostic.slice(-900)}));
    assert.equal(createdResult.status,201,'actual image Edge submit '+count+': '+
      JSON.stringify(createdResult.data).slice(0,260));
    assert.ok(createdResult.data?.id);
    const reportId=createdResult.data.id;
    if(count===2)secondImageReportId=reportId;
    const rows=sql("select slot||':'||mime_type||':'||size_bytes||':'||id "+
      "from public.feedback_attachments where feedback_id="+qq(reportId)+
      " order by slot").split('\n').filter(Boolean);
    assert.equal(rows.length,count,'DB attachment count');
    assert.equal(objects.size,lensS3Objects+(count===1?2:6),
      'each committed image must have a separate private JPEG thumbnail');
    const replay=await req('/functions/v1/feedback-submit','POST',
      form(content,blobs,requestId),owner.token);
    assert.equal(replay.status,200,'idempotent image replay');
    assert.equal(replay.data.replayed,true);
    for(const [i,row] of rows.entries()){
      const [,mime,bytes,attachmentId]=row.split(':');
      assert.equal(mime,'image/png');assert.equal(Number(bytes),images[i].length);
      const strangerDenied=await req('/functions/v1/feedback-image-access',
        'POST',{attachment_id:attachmentId},stranger.token);
      assert.equal(strangerDenied.status,403,'cross-user private image forbidden');
      const link=await req('/functions/v1/feedback-image-access',
        'POST',{attachment_id:attachmentId},owner.token);
      assert.equal(link.status,200,'owner private URL signing '+JSON.stringify(link.data).slice(0,200));
      assert.equal(link.data.expires_in,60);
      const signed=new URL(link.data.url);
      assert.equal(signed.hostname,'host.docker.internal');
      assert.ok(signed.searchParams.get('X-Amz-Signature'));
      const download=await fetch(signed,{signal:AbortSignal.timeout(12000)});
      assert.equal(download.status,200,'signed GET fixture');
      const bytesBack=Buffer.from(await download.arrayBuffer());
      assert.deepEqual(bytesBack,images[i],'signed URL image byte integrity');
      const thumb=await req('/functions/v1/feedback-image-access','POST',
        {attachment_id:attachmentId,variant:'thumbnail'},owner.token);
      assert.equal(thumb.status,200,'authorized thumbnail signed GET');
      assert.equal(thumb.data.mime_type,'image/jpeg');
      const thumbRes=await fetch(thumb.data.url,{signal:AbortSignal.timeout(12000)});
      assert.equal(thumbRes.status,200);
      const preview=Buffer.from(await thumbRes.arrayBuffer());
      assert.equal(preview[0],255);assert.equal(preview[1],216);
      assert.ok(preview.length<=256*1024,'actual bounded JPEG thumbnail stored');
      const strangerThumb=await req('/functions/v1/feedback-image-access','POST',
        {attachment_id:attachmentId,variant:'thumbnail'},stranger.token);
      assert.equal(strangerThumb.status,403,'private thumbnail authorization matches original');
    }
    console.log('F07_REAL_EDGE_PRIVATE_S3 '+count+
      ' image(s) PASS JWT -> Edge -> DB -> signed PUT/GET; owner 200 stranger 403');
  }
  const qaAdmin=await user('admin');
  sql("insert into public.platform_admins(user_id,active) values ("+qq(qaAdmin.id)+",true)");
  const denied=await req('/functions/v1/feedback-export','POST',{
    scope:'selected',queue_state:'inbox',
    ids:[secondImageReportId],options:{identity:false}},qaAdmin.token);
  assert.equal(denied.status,403,'AAL1 Admin must not export private attachments');
  const mfaToken=await adminAal2(qaAdmin.token);
  const adminImageId=sql('select id from public.feedback_attachments where '+
    'feedback_id='+qq(secondImageReportId)+' order by slot limit 1');
  assert.match(adminImageId,/^[a-f0-9-]{36}$/i);
  const adminThumb=await req('/functions/v1/feedback-image-access','POST',
    {attachment_id:adminImageId,variant:'thumbnail'},mfaToken);
  assert.equal(adminThumb.status,200,
    'AAL2 administrator must be able to sign a private thumbnail');
  assert.equal(adminThumb.data.mime_type,'image/jpeg');
  const adminThumbGet=await fetch(adminThumb.data.url,{
    signal:AbortSignal.timeout(12000)});
  assert.equal(adminThumbGet.status,200);
  console.log('F07_REAL_AAL2_ADMIN_THUMBNAIL PASS protected signature and private GET');
  const invalidThumbVariant=await req('/functions/v1/feedback-image-access','POST',
    {attachment_id:adminImageId,variant:'../../other-key'},mfaToken);
  assert.equal(invalidThumbVariant.status,422,
    'real Edge must reject image variant path injection before storage signing');
  const adminOriginal=await req('/functions/v1/feedback-image-access','POST',
    {attachment_id:adminImageId,variant:'original'},mfaToken);
  assert.equal(adminOriginal.status,200);
  const knownOriginalPath=new URL(adminOriginal.data.url).pathname;
  const oldThumbnailPath=knownOriginalPath+'.thumb.jpg';
  const oldThumbBytes=objects.get(oldThumbnailPath);
  assert.ok(oldThumbBytes?.length,'test controls only an existing private thumbnail');
  try{
    objects.delete(oldThumbnailPath);
    const stillAuthorized=await req('/functions/v1/feedback-image-access','POST',
      {attachment_id:adminImageId,variant:'thumbnail'},mfaToken);
    assert.equal(stillAuthorized.status,200,
      'signed URLs are not proof the remote object exists');
    assert.equal((await fetch(stillAuthorized.data.url,{signal:AbortSignal.timeout(12000)})).status,
      404,'unavailable thumbnail must never return made-up image data');
    assert.equal((await fetch(adminOriginal.data.url,{signal:AbortSignal.timeout(12000)})).status,
      200,'missing derived image must not block the original user-authorized photo');
    assert.equal(sql('select count(*) from public.feedback_attachments where id='+
      qq(adminImageId)),'1','missing derivative cannot rewrite source attachment metadata');
  }finally{objects.set(oldThumbnailPath,oldThumbBytes)}
  console.log('F07_REAL_THUMBNAIL_MISSING_ORIGINAL_SAFE PASS 404 derivative, 200 original, DB unchanged');
  const exportRequest={
    scope:'selected',queue_state:'inbox',
    ids:[secondImageReportId],options:{
      user_comments:false,public_replies:false,internal_notes:false,
      history:false,tags:false,status:false,identity:false,
    }};
  const missingObjectKey=sql('select object_key from public.feedback_attachments where '+
    'feedback_id='+qq(secondImageReportId)+' order by slot limit 1');
  assert.ok(missingObjectKey.startsWith('feedback/'),'real committed private attachment');
  const missingObjectPath='/f07-feedback-private/'+missingObjectKey;
  const originalImage=objects.get(missingObjectPath);
  assert.ok(originalImage?.length,'missing-image test must target a real stored object');
  try{
    objects.delete(missingObjectPath); // Only in the isolated in-memory S3 fixture.
    const missingExport=await req('/functions/v1/feedback-export','POST',
      exportRequest,mfaToken);
    assert.equal(missingExport.status,503,
      'AAL2 export must fail closed if a committed S3 image is missing');
    assert.equal(missingExport.data?.message,'PRIVATE_ATTACHMENT_OR_ZIP_UNAVAILABLE',
      'must return safe error, never a partial/private ZIP');
    assert.ok(!(missingExport.data instanceof Uint8Array),
      'missing attachment must not produce an archive');
    assert.equal(sql('select count(*) from public.feedback_attachments where feedback_id='+
      qq(secondImageReportId)),'2','failed export must not mutate source attachments');
  }finally{objects.set(missingObjectPath,originalImage)}
  console.log('F07_REAL_EDGE_ZIP_MISSING_IMAGE PASS 503 fail-closed; source SQL and S3 restored');
  // The initial AAL2 check is not enough: revoke this synthetic Admin while
  // a real private S3 GET is blocked, then ensure the subsequent source/audit
  // recheck prevents shipping any ZIP. The sole original Admin is untouched.
  let enteredGet,releaseGet;
  const awaitingGet=new Promise(resolve=>{enteredGet=resolve});
  const resumingGet=new Promise(resolve=>{releaseGet=resolve});
  heldExportGet={path:missingObjectPath,entered:enteredGet,resume:resumingGet};
  let pendingRevokedExport;
  try{
    pendingRevokedExport=req('/functions/v1/feedback-export','POST',
      exportRequest,mfaToken);
    const reached=await Promise.race([
      awaitingGet.then(()=>true),sleep(16000).then(()=>false),
    ]);
    assert.equal(reached,true,'real Edge export must reach the held S3 GET');
    assert.equal(sql('update public.platform_admins set active=false where user_id='+
      qq(qaAdmin.id)+' and active=true returning active'),'f',
    'revoke precisely the synthetic QA Admin during S3 transfer');
    const revokedThumb=await req('/functions/v1/feedback-image-access','POST',
      {attachment_id:adminImageId,variant:'thumbnail'},mfaToken);
    assert.equal(revokedThumb.status,403,
      'revoked AAL2 administrator may no longer mint any new private preview URL');
    releaseGet();
    const forbiddenExport=await pendingRevokedExport;
    assert.ok([403,409].includes(forbiddenExport.status),
      'in-flight revoke must reject ZIP (403 or snapshot conflict 409), never 200');
    assert.ok(['EXPORT_ACCESS_CHANGED','ADMIN_AUTH_REVOKED',
      'EXPORT_CHANGED_DURING_GENERATION'].includes(forbiddenExport.data?.message),
    'in-flight revoke must fail with safe authorization/snapshot reason');
    assert.ok(!(forbiddenExport.data instanceof Uint8Array));
    console.log('F07_REAL_EDGE_ZIP_INFLIGHT_ADMIN_REVOKE PASS no ZIP after QA AAL2 Admin is revoked');
  }finally{
    releaseGet();
    heldExportGet=null;
    assert.equal(sql('update public.platform_admins set active=true where user_id='+
      qq(qaAdmin.id)+' returning active'),'t',
      'restore temporary QA Admin for positive ZIP regression and cleanup');
    void pendingRevokedExport?.catch(()=>undefined);
  }
  // A real client can disappear after an authorized AAL2 export has started,
  // while the Edge is waiting for private object bytes. Never assume that
  // cancelling a download means the source ticket should be rolled back,
  // removed, or that a later authorized retry should receive a partial ZIP.
  let clientGetReached,releaseInterruptedGet;
  const clientGetPromise=new Promise(resolve=>{clientGetReached=resolve});
  const releaseClientGet=new Promise(resolve=>{releaseInterruptedGet=resolve});
  heldExportGet={path:missingObjectPath,
    entered:clientGetReached,resume:releaseClientGet};
  const disconnect=new AbortController();
  const savedObjects=objects.size;
  let interruptedExport;
  try{
    interruptedExport=fetch(cfg.API_URL+'/functions/v1/feedback-export',{
      method:'POST',
      headers:{
        apikey:key,authorization:'Bearer '+mfaToken,
        'content-type':'application/json',
      },
      body:JSON.stringify(exportRequest),
      signal:disconnect.signal,
    });
    const reached=await Promise.race([
      clientGetPromise.then(()=>true),sleep(16000).then(()=>false),
    ]);
    assert.equal(reached,true,'real Edge AAL2 export reached private S3 GET before disconnect');
    disconnect.abort();
    await assert.rejects(interruptedExport,
      error=>['AbortError','TypeError'].includes(error?.name),
      'exporting client must see a transport cancellation, not a successful ZIP');
    releaseInterruptedGet();
    assert.equal(sql('select count(*) from public.feedback_attachments where feedback_id='+
      qq(secondImageReportId)),'2','cancelled ZIP must retain its source attachments');
    assert.equal(objects.size,savedObjects,'cancelled ZIP cannot mutate private S3 objects');
    console.log('F07_REAL_EDGE_ZIP_CLIENT_DISCONNECT PASS abort during S3 GET; no client ZIP; source attachments preserved');
  }finally{
    disconnect.abort();
    releaseInterruptedGet();
    heldExportGet=null;
    void interruptedExport?.catch(()=>undefined);
  }
  const exported=await req('/functions/v1/feedback-export','POST',exportRequest,mfaToken);
  assert.equal(exported.status,200,'real AAL2 Admin ZIP '+JSON.stringify(
    exported.data instanceof Uint8Array?'binary':exported.data).slice(0,250));
  assert.ok(exported.data instanceof Uint8Array);
  const zip=unzipEntries(exported.data);
  const shots=[...zip.entries()].filter(([name])=>/screenshot-[12]\.png$/.test(name))
    .sort(([left],[right])=>left.localeCompare(right));
  assert.equal(shots.length,2,'Admin selected ZIP contains precisely two images');
  assert.deepEqual(shots[0][1],images[0],'Admin ZIP original image 1 bytes');
  assert.deepEqual(shots[1][1],images[1],'Admin ZIP original image 2 bytes');
  console.log('F07_REAL_EDGE_ADMIN_ZIP PASS current AAL2 allows private export, AAL1 403, images byte-identical');
  assert.equal(s3Events.filter(x=>x.verb==='PUT').length,lensS3Objects+6,
    'image retries should not put second copy');
  console.log('F07_REAL_EDGE_S3_REPLAY PASS no additional writes');

  // Opposite of an interrupted S3 upload: the REAL Edge and DB commit two
  // images successfully, but a one-use loopback proxy drops the downstream
  // HTTP response *after* it receives upstream 201. The caller knows only
  // "network failed", not whether SQL committed. Retry must converge on the
  // existing feedback without re-uploading either private object.
  const lossId=randomUUID(),lossText='F07 committed but response lost '+unique;
  const lossBlobs=images.map(bytes=>new Blob([bytes],{type:'image/png'}));
  const beforeLossObjects=objects.size;
  let finishProxy;
  const proxyUpstream=new Promise((resolve,reject)=>{finishProxy={resolve,reject}});
  const responseLossProxy=httpServer(async(incoming,outgoing)=>{
    try{
      assert.equal(incoming.method,'POST');
      assert.equal(incoming.url,'/drop-success');
      const parts=[];
      for await(const part of incoming)parts.push(part);
      const upstream=await fetch(cfg.API_URL+'/functions/v1/feedback-submit',{
        method:'POST',
        headers:{
          apikey:key,authorization:'Bearer '+owner.token,
          'content-type':String(incoming.headers['content-type']??''),
        },
        body:Buffer.concat(parts),
        signal:AbortSignal.timeout(30000),
      });
      const body=await upstream.json();
      finishProxy.resolve({status:upstream.status,data:body});
      // No HTTP status, body or success ACK reaches the client.
      outgoing.destroy();
    }catch(error){
      finishProxy.reject(error);
      outgoing.destroy();
    }
  });
  try{
    await new Promise((resolve,reject)=>{
      responseLossProxy.once('error',reject);
      responseLossProxy.listen(0,'127.0.0.1',resolve);
    });
    const proxyPort=responseLossProxy.address().port;
    await assert.rejects(
      fetch('http://127.0.0.1:'+proxyPort+'/drop-success',{
        method:'POST',body:form(lossText,lossBlobs,lossId),
        signal:AbortSignal.timeout(40000),
      }),
      error=>error instanceof TypeError,
      'client must observe transport failure rather than an acknowledged commit');
    const committed=await proxyUpstream;
    assert.equal(committed.status,201,'upstream real Edge committed before ACK loss');
    assert.match(committed.data.id,/^[a-f0-9-]{36}$/i);
    assert.equal(sql('select count(*) from public.user_feedback where request_id='+
      qq(lossId)),'1','one real SQL record despite lost client response');
    assert.equal(sql('select count(*) from public.feedback_attachments where feedback_id='+
      qq(committed.data.id)),'2','both images were committed before ACK loss');
    assert.equal(objects.size,beforeLossObjects+4,'two originals and two thumbnails stored once');
    const putCount=s3Events.filter(x=>x.verb==='PUT').length;
    const retried=await req('/functions/v1/feedback-submit','POST',
      form(lossText,lossBlobs,lossId),owner.token);
    assert.equal(retried.status,200,'unknown-result retry resolves as replay');
    assert.equal(retried.data?.replayed,true,'replay explicitly confirmed');
    assert.equal(retried.data?.id,committed.data.id,'same real SQL feedback ID');
    assert.equal(objects.size,beforeLossObjects+4,'retry must not create objects');
    assert.equal(s3Events.filter(x=>x.verb==='PUT').length,putCount,
      'retry must not attempt any additional S3 writes');
    const changed=await req('/functions/v1/feedback-submit','POST',
      form(lossText+' modified',lossBlobs,lossId),owner.token);
    assert.equal(changed.status,409,'same id changed content is still forbidden');
    assert.equal(sql('select count(*) from public.user_feedback where request_id='+
      qq(lossId)),'1','no duplicate SQL rows after unknown result and conflict');
    console.log('F07_REAL_EDGE_COMMITTED_ACK_LOST PASS upstream201 discarded; retry200 existing two images; mismatch409');
  }finally{
    await new Promise(resolve=>responseLossProxy.close(resolve));
  }

  // Real Edge + actual local S3 failure after the first of two uploads.
  // Never treat the partial upload as a committed ticket or delete an object
  // that a concurrent identical request might reference. Retrying the SAME
  // UUID and attachments must reuse the first key and commit exactly once.
  const faultId=randomUUID(),faultText='F07 second PUT fails then exact retry '+unique;
  const faultBlobs=images.map(bytes=>new Blob([bytes],{type:'image/png'}));
  const beforeFaultObjects=objects.size;
  const priorKeys=new Set(objects.keys());
  secondPutFault={successfulPuts:0,failedKey:null};
  try{
    const failure=await req('/functions/v1/feedback-submit','POST',
      form(faultText,faultBlobs,faultId),owner.token);
    assert.equal(failure.status,503,
      'second image PUT failure must be reported as storage unavailable/unknown');
    assert.equal(secondPutFault.successfulPuts,2,'first original and thumbnail uploaded');
    assert.ok(secondPutFault.failedKey,'second image PUT actually failed');
  }finally{secondPutFault=null}
  assert.equal(sql('select count(*) from public.user_feedback where request_id='+qq(faultId)),
    '0','storage 503 must not fabricate a committed feedback');
  assert.equal(objects.size,beforeFaultObjects+2,
    'first original and thumbnail remain for safe reference-aware reconciliation');
  const firstFaultKey=[...objects.keys()].filter(k=>!priorKeys.has(k));
  assert.equal(firstFaultKey.length,2,'one isolated original and its derived thumbnail');
  // S3 protocol fixture Map includes /<bucket>/, whereas the real DB
  // stores bucket-relative object keys. Never send HTTP path strings to RPC.
  const objectKeys=paths=>paths.map(path=>{
    assert.ok(path.startsWith('/f07-feedback-private/feedback/'));
    return path.slice('/f07-feedback-private/'.length);
  });
  const checkReferences=async keys=>req('/rest/v1/rpc/feedback_referenced_keys',
    'POST',{p_keys:keys},null,true);
  const orphanBefore=await checkReferences(objectKeys(firstFaultKey));
  assert.equal(orphanBefore.status,200,'service role real reference query');
  assert.deepEqual(orphanBefore.data,[],
    'a partially uploaded object is not a committed DB attachment');
  const deniedReferences=await req('/rest/v1/rpc/feedback_referenced_keys',
    'POST',{p_keys:objectKeys(firstFaultKey)},owner.token);
  assert.equal(deniedReferences.status,403,
    'ordinary authenticated member must not enumerate private object references');
  const recovered=await req('/functions/v1/feedback-submit','POST',
    form(faultText,faultBlobs,faultId),owner.token);
  assert.equal(recovered.status,201,
    'same request ID retries successfully once isolated S3 fault is repaired');
  assert.equal(sql('select count(*) from public.user_feedback where request_id='+qq(faultId)),
    '1','one real Core feedback record after retry');
  assert.equal(sql('select count(*) from public.feedback_attachments where feedback_id='+
    qq(recovered.data.id)),'2','both attachments committed after recovery');
  assert.equal(objects.size,beforeFaultObjects+4,
    'retry reused first original+thumb and added only missing second pair');
  const finalFaultKeys=[...objects.keys()].filter(k=>!priorKeys.has(k));
  assert.equal(finalFaultKeys.length,4,'recovered two original+thumbnail pairs');
  const referencesAfter=await checkReferences(objectKeys(finalFaultKeys));
  assert.equal(referencesAfter.status,200);
  assert.deepEqual([...referencesAfter.data].sort(),objectKeys(finalFaultKeys).sort(),
    'both previously orphaned and newly uploaded objects must be committed references');
  console.log('F07_REAL_DB_REFERENCE_RECONCILIATION PASS uncommitted object unreferenced then both committed; user RPC 403');
  const replayAfterFault=await req('/functions/v1/feedback-submit','POST',
    form(faultText,faultBlobs,faultId),owner.token);
  assert.equal(replayAfterFault.status,200,'confirmed exact replay after fault recovery');
  assert.equal(objects.size,beforeFaultObjects+4,'replay must not upload again');
  const mismatchedReplay=await req('/functions/v1/feedback-submit','POST',
    form(faultText+' modified',faultBlobs,faultId),owner.token);
  assert.equal(mismatchedReplay.status,409,
    'same UUID with changed immutable content must be rejected, not overwritten');
  assert.equal(sql('select count(*) from public.user_feedback where request_id='+qq(faultId)),
    '1','409 mismatch cannot create a second feedback');
  assert.equal(objects.size,beforeFaultObjects+4,'mismatched replay must not upload');
  console.log('F07_REAL_EDGE_SECOND_PUT_RECOVERY PASS 503 no DB commit -> exact retry 201/200; two S3 objects');
  console.log('F07_REAL_EDGE_REQUEST_MISMATCH PASS same UUID changed content gets 409, no new objects/records');
}finally{
  if(edgeWorker?.pid){
    if(win)run('taskkill',['/PID',String(edgeWorker.pid),'/T','/F'],{timeout:11000});
    else edgeWorker.kill('SIGTERM');
  }
  const errors=[];
  if(created.length){
    const ids=created.map(qq).join(',');
    const ownershipOk=sql('select count(*) from auth.users where id in ('+ids+
      ") and email like 'f07-img-"+unique+"-%@example.invalid'")===String(created.length);
    if(!ownershipOk){
      errors.push('Abort cleanup: fixture identity ownership mismatch');
    } else {
    for(const sqlText of [
      "DELETE FROM public.feedback_events WHERE feedback_id IN (SELECT id FROM public.user_feedback WHERE user_id IN ("+ids+"))",
      "DELETE FROM public.feedback_attachments WHERE feedback_id IN (SELECT id FROM public.user_feedback WHERE user_id IN ("+ids+"))",
      "DELETE FROM public.admin_audit_log WHERE actor_user_id IN ("+ids+") OR (target_type='feedback' AND target_id IN (SELECT id FROM public.user_feedback WHERE user_id IN ("+ids+")))",
      "DELETE FROM public.platform_admins WHERE user_id IN ("+ids+")",
      "DELETE FROM public.user_feedback WHERE user_id IN ("+ids+")",
    ])try{sql(sqlText)}catch(e){errors.push(String(e.message).slice(0,150))}
    for(const id of created)try{
      const removed=await req('/auth/v1/admin/users/'+id,'DELETE',null,null,true);
      if(removed.status!==200&&removed.status!==204)errors.push('Auth cleanup '+removed.status);
    }catch(e){errors.push('Auth cleanup '+String(e.message))}
    }
  }
  await new Promise(resolve=>fixture?fixture.close(resolve):resolve());
  if(gate)await new Promise(resolve=>gate.close(resolve));
  if(ownedEnvFile)await rm(ownedEnvFile,{force:true});
  objects.clear();
  try{
    verifyOriginalIds();
    if(created.length)assert.equal(sql('SELECT count(*) FROM auth.users WHERE id IN ('+
      created.map(qq).join(',')+')'),'0','all exact fixture Auth IDs removed');
    assert.equal(sql("select string_agg(product_key,',' order by product_key) from public.products"),
      'aisenhub,aisenlens');
  }catch(e){errors.push(String(e.message))}
  if(errors.length)throw Error('F07 fixture cleanup FAILED '+errors.join('; '));
  console.log('F07_REAL_EDGE_S3_CLEANUP PASS administrator and 2 platforms unchanged, zero QA residue');
}

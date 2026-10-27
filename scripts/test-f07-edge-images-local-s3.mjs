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
const unique=randomUUID().replaceAll('-','').slice(0,13);
const password='F07fixture!'+randomBytes(14).toString('hex');
let fixture=null,edgeWorker=null,gate=null,ownedEnvFile=null;
const sleep=n=>new Promise(resolve=>setTimeout(resolve,n));
function sql(text){
  const r=run('docker',['exec','supabase_db_Aisencore','psql','-X','-qAt',
    '-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',text],{timeout:20000});
  if(r.status!==0)throw Error('local SQL failure: '+r.stderr.slice(-350));
  return r.stdout.trim();
}
const qq=id=>{assert.match(id,/^[a-f0-9-]{36}$/i);return "'"+id+"'"};
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
  fd.set('content',text);fd.set('category','bug');
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
      const chunks=[];for await(const piece of request)chunks.push(piece);
      if(objects.has(path)){response.writeHead(412,{'content-type':'application/xml'});
        response.end('<Error><Code>PreconditionFailed</Code></Error>');return}
      objects.set(path,Buffer.concat(chunks));
      response.writeHead(200,{etag:'"f07-fixture"'});response.end();return;
    }
    if(request.method==='GET'){
      s3Events.push({verb:'GET',path,signed:!!url.searchParams.get('X-Amz-Signature')});
      if(!objects.has(path)){response.writeHead(404,{'content-type':'application/xml'});
        response.end('<Error><Code>NoSuchKey</Code></Error>');return}
      const bytes=objects.get(path);
      response.writeHead(200,{'content-type':'image/png','content-length':bytes.length});
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
  const child=spawn('node.exe',['--test','--test-concurrency=1',
    'tests/features/workflow/core-account-feedback.browser.test.js'],{
    cwd:lensRoot,env:{...process.env,AISENLENS_EXPECT_LOCAL_S3:'1'},
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
  assert.equal(sql('select count(*) from auth.users'),'1');
  assert.equal(sql('select count(*) from public.user_feedback'),'0');
  console.log('F07_REAL_LENS_CHROME_TWO_IMAGES PASS browser -> Edge -> S3 -> DB; QA deleted');
}
async function startWorker(){
  edgeWorker=spawn(win?'cmd.exe':'pnpm',win?
    ['/d','/s','/c','pnpm dlx supabase functions serve feedback-submit feedback-image-access feedback-export']:
    ['dlx','supabase','functions','serve','feedback-submit','feedback-image-access',
      'feedback-export'],{cwd:root,stdio:['ignore','pipe','pipe']});
  let logs='';
  edgeWorker.stderr.on('data',data=>{logs=(logs+String(data)).slice(-12000);edgeDiagnostic=logs});
  for(let n=0;n<68;n++){
    try{
      const res=await fetch(cfg.API_URL+'/functions/v1/feedback-submit',{
        method:'POST',headers:{apikey:key,'content-type':'application/json'},
        body:'{}',signal:AbortSignal.timeout(1800)});
      if(res.status===401)return;
    }catch{}
    await sleep(750);
  }
  throw Error('Edge with local S3 fixture not ready '+logs.slice(-1100));
}
const listen=server=>new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(3418,'0.0.0.0',()=>resolve());
});
try{
  assert.equal(sql('select count(*) from auth.users'),'1','admin-only baseline required');
  assert.equal(sql("select string_agg(product_key,',' order by product_key) from public.products"),
    'aisenhub,aisenlens');
  assert.equal(sql('select count(*) from public.user_feedback'),'0');
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
  assert.equal(lensS3Objects,2,'Lens must write 2 private objects');
  const owner=await user('owner'),stranger=await user('stranger');
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
    assert.equal(objects.size,lensS3Objects+(count===1?1:3),'private object count');
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
  const exported=await req('/functions/v1/feedback-export','POST',{
    scope:'selected',queue_state:'inbox',
    ids:[secondImageReportId],options:{
      user_comments:false,public_replies:false,internal_notes:false,
      history:false,tags:false,status:false,identity:false,
    }},mfaToken);
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
  assert.equal(s3Events.filter(x=>x.verb==='PUT').length,lensS3Objects+3,
    'image retries should not put second copy');
  console.log('F07_REAL_EDGE_S3_REPLAY PASS no additional writes');
}finally{
  if(edgeWorker?.pid){
    if(win)run('taskkill',['/PID',String(edgeWorker.pid),'/T','/F'],{timeout:11000});
    else edgeWorker.kill('SIGTERM');
  }
  const errors=[];
  if(created.length){
    const ids=created.map(qq).join(',');
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
  await new Promise(resolve=>fixture?fixture.close(resolve):resolve());
  if(gate)await new Promise(resolve=>gate.close(resolve));
  if(ownedEnvFile)await rm(ownedEnvFile,{force:true});
  objects.clear();
  try{
    assert.equal(sql('select count(*) from auth.users'),'1');
    assert.equal(sql('select count(*) from public.user_feedback'),'0');
    assert.equal(sql('select count(*) from public.feedback_attachments'),'0');
    assert.equal(sql('select count(*) from public.product_memberships'),'0');
    assert.equal(sql("select string_agg(product_key,',' order by product_key) from public.products"),
      'aisenhub,aisenlens');
  }catch(e){errors.push(String(e.message))}
  if(errors.length)throw Error('F07 fixture cleanup FAILED '+errors.join('; '));
  console.log('F07_REAL_EDGE_S3_CLEANUP PASS administrator and 2 platforms unchanged, zero QA residue');
}

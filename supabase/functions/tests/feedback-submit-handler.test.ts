import {Image} from 'jsr:@matmen/imagescript@3.3.0';
import {submitFeedback,type FeedbackPorts,type CommitArgs} from '../feedback-submit/service.ts';
import {issueFeedbackImageUrl,type ImageAccessPorts} from '../feedback-image-access/service.ts';
import {putFile,readFile,signedGet} from '../_shared/feedback.ts';

function check(v:unknown,message:string):asserts v{
  if(!v)throw new Error(message);
}
const product='11111111-1111-4111-8111-111111111111';
const owner='22222222-2222-4222-8222-222222222222';
let sequence=0;
const next=()=>('33333333-3333-4333-8333-'+(++sequence).toString().padStart(12,'0'));

Deno.test('F07 production submission service: real loopback HTTP with 0/1/2 images, replay and fail-closed partial storage',async()=>{
  const objects=new Map<string,Uint8Array>();
  let storageFailureSlot=0,putCount=0;
  const storage=Deno.serve({hostname:'127.0.0.1',port:0,onListen:()=>{}},async(req)=>{
    const key=new URL(req.url).pathname;
    if(req.method==='PUT'){
      putCount++;
      check(req.headers.get('if-none-match')==='*','conditional object create missing');
      check(!!req.headers.get('authorization'),'object creation must be signed');
      if(storageFailureSlot&&key.includes('/'+storageFailureSlot+'-'))
        return new Response('<Error><Code>ServiceUnavailable</Code></Error>',{
          status:503,headers:{'content-type':'application/xml'}});
      if(objects.has(key))return new Response(
        '<Error><Code>PreconditionFailed</Code></Error>',{
          status:412,headers:{'content-type':'application/xml'}});
      objects.set(key,new Uint8Array(await req.arrayBuffer()));
      return new Response(null,{status:200,headers:{etag:'"fixture"'}});
    }
    if(req.method==='GET'){
      const signedQuery=new URL(req.url).searchParams.has('X-Amz-Signature');
      if(!req.headers.get('authorization')&&!signedQuery)
        return new Response(null,{status:403});
      const bytes=objects.get(key);
      return bytes?new Response(Uint8Array.from(bytes),{status:200}):
        new Response('<Error><Code>NoSuchKey</Code></Error>',{
          status:404,headers:{'content-type':'application/xml'}});
    }
    return new Response(null,{status:405});
  });
  const saved=new Map<string,string|undefined>();
  const vars={
    R2_FEEDBACK_STORAGE_MODE:'local-test',
    R2_FEEDBACK_TEST_ENDPOINT:'http://127.0.0.1:'+storage.addr.port,
    R2_FEEDBACK_TEST_ACCESS_KEY_ID:'fixture-access',
    R2_FEEDBACK_TEST_SECRET_ACCESS_KEY:'fixture-secret',
    R2_FEEDBACK_BUCKET:'private-qa',
  };
  for(const [k,v] of Object.entries(vars)){
    saved.set(k,Deno.env.get(k));
    Deno.env.set(k,v);
  }
  const png=await new Image(2,3).encodePNG();
  const jpg=await new Image(2,3).encodeJPEG();
  const webp=await new Image(2,3).encodeWebP();
  const ledger=new Map<string,{args:CommitArgs;id:string}>();
  let failIdentity=false,confirmed=true,failRead=false,failPreflight=false,
    failCommit=false,returnUnknownAfterCommit=false,deny=false,
    throwIdentity=false,throwRead=false,throwPreflight=false,throwCommit=false;
  const ports:FeedbackPorts={
    actor:owner,
    getIdentity:async()=>{
      if(throwIdentity)throw Error('transport unavailable');
      return {user:{email_confirmed_at:confirmed?'2026-10-27':null},
        error:failIdentity?{message:'offline'}:null};
    },
    myFeedback:async(_key,id)=>{
      if(throwRead)throw Error('transport unavailable');
      return {data:ledger.has(id)?[{product_id:product}]:[],
        error:failRead?{code:'PGRST500'}:null};
    },
    preflight:async()=>{
      if(throwPreflight)throw Error('transport unavailable');
      return {data:{product_id:product},
        error:failPreflight?{code:'PGRST500'}:deny?{code:'PT403'}:null};
    },
    commit:async(args)=>{
      if(throwCommit)throw Error('transport unavailable');
      const existing=ledger.get(args.p_request_id);
      if(existing){
        if(JSON.stringify(existing.args)!==JSON.stringify(args))
          return {data:null,error:{code:'PT409'}};
        return {data:{id:existing.id,replayed:true},error:null};
      }
      if(failCommit)return {data:null,error:{code:'XX000'}};
      const id='44444444-4444-4444-8444-'+
        String(ledger.size+1).padStart(12,'0');
      ledger.set(args.p_request_id,{args,id});
      if(returnUnknownAfterCommit)return {data:null,error:{code:'PGRST500'}};
      return {data:{id,replayed:false},error:null};
    },
    putFile,
  };
  // Exercise the same production service via an actual HTTP listener,
  // not a synthetic test of just the S3 SDK.
  const app=Deno.serve({hostname:'127.0.0.1',port:0,onListen:()=>{}},
    req=>submitFeedback(req,ports));
  const imageId='55555555-5555-4555-8555-555555555555';
  let imageKey='',imageDenied=false,imageReadError='',imageMissing=false,
    signingError=false,imageTransportError=false;
  const imagePorts:ImageAccessPorts={
    getAccess:async(id)=>{
      if(imageTransportError)throw Error('transport unavailable');
      if(imageReadError)return {data:null,error:{code:imageReadError}};
      if(imageDenied||id!==imageId)return {data:null,error:{code:'PT403'}};
      return {data:imageMissing?{}:{object_key:imageKey,mime_type:'image/png'},
        error:null};
    },
    sign:async(key)=>{
      if(signingError)throw Error('storage unavailable');
      return signedGet(key);
    },
  };
  const imageApp=Deno.serve({hostname:'127.0.0.1',port:0,onListen:()=>{}},
    req=>issueFeedbackImageUrl(req,imagePorts));
  async function imageAccess(id:string){
    const resp=await fetch('http://127.0.0.1:'+imageApp.addr.port,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({attachment_id:id})});
    return {status:resp.status,body:await resp.json()};
  }
  function form(id:string,content:string,images:Uint8Array[],
    mimetypes:string[]):FormData{
    const fd=new FormData();
    fd.set('product_key','f07_test');
    fd.set('request_id',id);
    fd.set('content',content);
    fd.set('category','bug');
    for(let n=0;n<images.length;n++)
      fd.append('images',new File([Uint8Array.from(images[n])],
        'image'+n,{type:mimetypes[n]}));
    return fd;
  }
  async function submit(id:string,body:string,
    images:Uint8Array[]=[],types:string[]=[]){
    const resp=await fetch('http://127.0.0.1:'+app.addr.port,{
      method:'POST',body:form(id,body,images,types)});
    return {status:resp.status,body:await resp.json()};
  }
  try{
    const zero=next();
    check((await submit(zero,'zero image')).status===201,'0 image must commit 201');
    check(ledger.get(zero)?.args.p_attachments.length===0,'0 image creates no object reference');
    const single=next();
    check((await submit(single,'one image',[png],['image/png'])).status===201,
      '1 PNG must commit 201');
    const singleKey=ledger.get(single)?.args.p_attachments[0].object_key;
    check(singleKey&&objects.has('/private-qa/'+singleKey),'first image bytes not on private S3');
    check((await readFile(singleKey)).every((v,i)=>v===png[i]),
      'private S3 GET must preserve PNG bytes');
    const signed=await signedGet(singleKey);
    check(new URL(signed).searchParams.get('X-Amz-Expires')==='60',
      'signed private GET must expire in 60 seconds');
    check((await fetch(signed)).status===200,'valid signature must retrieve image');
    check((await fetch('http://127.0.0.1:'+storage.addr.port+
      '/private-qa/'+singleKey)).status===403,
      'bare private object GET must be rejected');
    imageKey=singleKey;
    const issued=await imageAccess(imageId);
    check(issued.status===200,'owner image-access RPC must mint signed URL');
    check(issued.body.expires_in===60&&
      !('object_key' in issued.body),'image API must not expose object key');
    check((await fetch(issued.body.url)).status===200,
      'image-access signed URL must fetch authorized private object');
    check((await imageAccess('66666666-6666-4666-8666-666666666666')).status===403,
      'other user/attachment ID must be refused');
    check((await imageAccess('not-a-uuid')).status===422,
      'malformed attachment ID must be rejected before RPC');
    imageDenied=true;
    check((await imageAccess(imageId)).status===403,
      'revoked access must deny minting any new URL');
    imageDenied=false;imageReadError='PGRST500';
    check((await imageAccess(imageId)).status===503,
      'DB outage in private image authorization must be 503');
    imageReadError='';imageTransportError=true;
    check((await imageAccess(imageId)).status===503,
      'thrown private image DB failure must be 503');
    imageTransportError=false;imageMissing=true;
    check((await imageAccess(imageId)).status===503,
      'incomplete successful DB payload must not mint a URL');
    imageMissing=false;signingError=true;
    check((await imageAccess(imageId)).status===503,
      'failed signing must not appear successful');
    signingError=false;
    const beforeReplay=putCount;
    check((await submit(single,'one image',[png],['image/png'])).status===200,
      'same request+file must replay HTTP 200');
    check(putCount===beforeReplay,'safe replay must not re-upload');
    check((await submit(single,'different text',[png],['image/png'])).status===409,
      'same request with different content must refuse');
    const both=next();
    check((await submit(both,'two images',[jpg,webp],
      ['image/jpeg','image/webp'])).status===201,'2 JPEG/WebP must commit 201');
    check(ledger.get(both)?.args.p_attachments.length===2,
      '2 image metadata rows must be committed');
    check((await submit(next(),'three',[png,jpg,webp],
      ['image/png','image/jpeg','image/webp'])).status===422,
      'third image must be rejected before writing any object');
    check((await submit(next(),'truncated',[png.slice(0,9)],
      ['image/png'])).status===422,
      'PNG header-only upload must fail');
    check((await submit(next(),'MIME mismatch',[png],
      ['image/jpeg'])).status===422,
      'forged MIME must fail');

    // A second object failure must never create a DB record or delete
    // first-slot bytes that concurrent retries might reference.
    storageFailureSlot=2;
    const partial=next();
    check((await submit(partial,'second image down',[png,jpg],
      ['image/png','image/jpeg'])).status===503,
      'second image PUT outage must return 503');
    check(!ledger.has(partial),'partial S3 failure must not commit DB metadata');
    check([...objects.keys()].some(k=>k.includes('/'+partial+'/1-')),
      'successful first object must be retained for reconciliation');
    storageFailureSlot=0;
    check((await submit(partial,'second image down',[png,jpg],
      ['image/png','image/jpeg'])).status===201,
      'same request retry after S3 recovery must succeed');
    check(ledger.get(partial)?.args.p_attachments.length===2,
      'retry commits exactly the original two slots');

    // A DB commit may have succeeded even when the response was lost.
    const unknown=next();
    returnUnknownAfterCommit=true;
    check((await submit(unknown,'commit response lost',[png],
      ['image/png'])).status===503,
      'uncertain RPC commit must be surfaced as UNKNOWN service failure');
    check(ledger.has(unknown),'fixture simulated durable commit before lost response');
    returnUnknownAfterCommit=false;
    const beforeUnknownRetry=putCount;
    check((await submit(unknown,'commit response lost',[png],
      ['image/png'])).status===200,
      'exact replay must recover already committed request');
    check(putCount===beforeUnknownRetry,'recover must not write duplicate R2 objects');
    const parallel=next();
    const outcomes=await Promise.all([
      submit(parallel,'concurrent exact retry',[png],['image/png']),
      submit(parallel,'concurrent exact retry',[png],['image/png']),
    ]);
    check(outcomes.map(v=>v.status).sort().join(',')==='200,201',
      'two concurrent same-request submissions must yield one create and one replay');
    check([...ledger.keys()].filter(id=>id===parallel).length===1,
      'parallel submission must commit exactly one feedback');

    // Current identity and RPC faults must never silently produce an
    // accepted ticket or masquerade as an unconfirmed account.
    failIdentity=true;
    check((await submit(next(),'identity outage')).status===503,
      'Auth upstream failure must be 503');
    failIdentity=false;throwIdentity=true;
    check((await submit(next(),'Auth thrown')).status===503,
      'thrown Auth transport failure must be 503');
    throwIdentity=false;confirmed=false;
    check((await submit(next(),'unconfirmed user')).status===403,
      'unconfirmed user must be forbidden');
    confirmed=true;failRead=true;
    check((await submit(next(),'read outage')).status===503,
      'feedback lookup outage must be 503');
    failRead=false;throwRead=true;
    check((await submit(next(),'read thrown')).status===503,
      'thrown my_feedback transport failure must be 503');
    throwRead=false;failPreflight=true;
    check((await submit(next(),'preflight outage')).status===503,
      'preflight outage must be 503');
    failPreflight=false;throwPreflight=true;
    check((await submit(next(),'preflight thrown')).status===503,
      'thrown preflight failure must be 503');
    throwPreflight=false;deny=true;
    check((await submit(next(),'blocked account')).status===403,
      'explicit business access denial must remain 403');
    deny=false;throwCommit=true;
    check((await submit(next(),'commit thrown')).status===503,
      'thrown commit transport failure must be 503');
    throwCommit=false;failCommit=true;
    const dbDown=next();
    check((await submit(dbDown,'DB outage after PUT',[png],['image/png'])).status===503,
      'DB commit outage must report 503');
    check(!ledger.has(dbDown),'DB outage must not create a fake ticket');
    check([...objects.keys()].some(k=>k.includes('/'+dbDown+'/1-')),
      'orphan must be left for reference-aware reconciliation');

    check(ledger.size===6,'fixture should have exactly six successful submissions');
    check([...ledger.values()].every(x=>x.args.p_user_id===owner),
      'no submitted record can impersonate another identity');
  }finally{
    await app.shutdown();
    await imageApp.shutdown();
    await storage.shutdown();
    for(const [name,v] of saved){
      if(v===undefined)Deno.env.delete(name);else Deno.env.set(name,v);
    }
  }
});

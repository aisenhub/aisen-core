import {boundedForm,detectMime,feedbackObjectKey,feedbackIdentityFailure,feedbackRpcReadFailure} from '../_shared/feedback.ts';
import {Image} from 'jsr:@matmen/imagescript@3.3.0';
import {validateFeedbackImage} from '../_shared/feedback-image.ts';
function check(value:unknown,message:string):asserts value{
  if(!value)throw new Error(message);
}
Deno.test('feedback Auth lookup errors fail closed as service unavailable, not unconfirmed',async()=>{
  const outage=feedbackIdentityFailure({status:503,message:'upstream down'},null);
  check(outage,'Auth lookup error must have a response');
  check(outage.status===503,'Auth 503 must remain service failure');
  check((await outage.json()).message==='IDENTITY_LOOKUP_UNAVAILABLE','Auth error misclassified');
  const missing=feedbackIdentityFailure(null,null);
  check(missing?.status===401,'missing Auth identity must require authentication');
  const unconfirmed=feedbackIdentityFailure(null,{email_confirmed_at:null});
  check(unconfirmed,'unconfirmed email must have a response');
  check(unconfirmed.status===403,'genuinely unconfirmed email must be denied');
  check((await unconfirmed.json()).message==='VERIFIED_EMAIL_REQUIRED','unconfirmed business code');
  check(feedbackIdentityFailure(null,{email_confirmed_at:'2026-10-27T00:00:00Z'})===null,
    'confirmed identity must continue');
});
Deno.test('feedback reader keeps explicit authentication/permission denial, not upstream DB failure',async()=>{
  for(const name of ['FEEDBACK_READ_DENIED','IMAGE_FORBIDDEN']){
    const unavailable=feedbackRpcReadFailure({code:'PGRST500'},name,'FEEDBACK_SERVICE_UNAVAILABLE');
    check(unavailable.status===503,'database failure must not be 403');
    check((await unavailable.json()).message==='FEEDBACK_SERVICE_UNAVAILABLE','DB error must be opaque');
    const malformed=feedbackRpcReadFailure({code:'XX000'},name,'FEEDBACK_SERVICE_UNAVAILABLE');
    check(malformed.status===503,'internal SQL failure must not be 403');
    const refused=feedbackRpcReadFailure({code:'PT403'},name,'FEEDBACK_SERVICE_UNAVAILABLE');
    check(refused.status===403,'explicit PT403 must remain permission refusal');
    check((await refused.json()).message===name,'wrong permission code');
    const unauthenticated=feedbackRpcReadFailure({code:'PT401'},name,'FEEDBACK_SERVICE_UNAVAILABLE');
    check(unauthenticated.status===401,'PT401 must remain authentication failure');
  }
});
Deno.test('JPEG PNG WebP magic bytes; SVG and mismatched bytes refused',()=>{
  const png=new Uint8Array([137,80,78,71,13,10,26,10,0]);
  const jpeg=new Uint8Array([255,216,255,0,1]);
  const webp=new TextEncoder().encode('RIFF0000WEBPxxxxxxxxx');
  check(detectMime(png)?.mime==='image/png','PNG signature rejected');
  check(detectMime(jpeg)?.mime==='image/jpeg','JPEG signature rejected');
  check(detectMime(webp)?.mime==='image/webp','WebP signature rejected');
  check(detectMime(new TextEncoder().encode('<svg onload="bad()">'))===null,
    'SVG must be refused');
  check(detectMime(new Uint8Array([1,2,3,4]))===null,'unrecognized bytes refused');
});

Deno.test('F07 fully decodes valid PNG JPEG WebP, rejecting headers and corrupt/truncated data',async()=>{
  const image=new Image(3,2);
  const valid=[
    {mime:'image/png',bytes:await image.encodePNG()},
    {mime:'image/jpeg',bytes:await image.encodeJPEG()},
    {mime:'image/webp',bytes:await image.encodeWebP()},
  ];
  for(const {mime,bytes} of valid){
    check(bytes.length>20,'fixture must contain encoded pixels');
    check((await validateFeedbackImage(bytes,mime))?.mime===mime,
      'valid encoded '+mime+' was rejected');
    check(await validateFeedbackImage(bytes.subarray(0,Math.min(bytes.length,12)),mime)===null,
      'truncated '+mime+' must be rejected');
    check(await validateFeedbackImage(bytes.subarray(0,bytes.length-8),mime)===null,
      'missing image tail '+mime+' must be rejected');
    check(await validateFeedbackImage(bytes,'image/svg+xml')===null,
      'MIME mismatch must be rejected');
  }
  const png=valid[0].bytes;
  const corrupt=Uint8Array.from(png);
  corrupt[corrupt.length-8]^=0x1;
  check(await validateFeedbackImage(corrupt,'image/png')===null,
    'corrupt PNG CRC/trailer must be rejected');
  const enormous=Uint8Array.from(png);
  enormous.set([0,0,78,32,0,0,78,32],16);
  check(await validateFeedbackImage(enormous,'image/png')===null,
    'tiny file claiming 4e8 decoded pixels must not allocate those pixels');
  const webp=Uint8Array.from(valid[2].bytes);
  webp[4]=0;webp[5]=0;webp[6]=0;webp[7]=0;
  check(await validateFeedbackImage(webp,'image/webp')===null,
    'broken RIFF length must fail');
  check(await validateFeedbackImage(new TextEncoder().encode('<svg onload="x"/>'),'image/svg+xml')===null,
    'SVG is never accepted');
});
Deno.test('F07 valid highly-compressible oversized image is blocked before full RGBA decode',async()=>{
  // Unlike a broken IHDR, this is a fully valid PNG with >12 million pixels.
  // It compresses to a small file; byte limits alone must not let it through.
  const oversized=new Image(3500,3500);
  const encoded=await oversized.encodePNG();
  check(encoded.length<3*1024*1024,
    'highly compressible oversized image must fit the upload byte quota');
  check(await validateFeedbackImage(encoded,'image/png')===null,
    'valid PNG with too many pixels must be rejected without decode allocation');
});
Deno.test('same content and idempotency key gives same private key; different content changes it',async()=>{
  const product='11111111-1111-4111-8111-111111111111';
  const user='22222222-2222-4222-8222-222222222222';
  const request='33333333-3333-4333-8333-333333333333';
  const first=new Uint8Array([137,80,78,71,13,10,26,10]);
  const a=await feedbackObjectKey(product,user,request,1,first,'png');
  const b=await feedbackObjectKey(product,user,request,1,first,'png');
  const c=await feedbackObjectKey(product,user,request,2,first,'png');
  const d=await feedbackObjectKey(product,user,request,1,new Uint8Array([...first,1]),'png');
  check(a===b,'same request should repeat same key');
  check(a!==c&&a!==d,'slot/content must affect key');
  check(a.startsWith('feedback/'+product+'/'+user+'/'+request+'/1-'),'wrong key prefix');
});
Deno.test('invalid slot rejected before object storage',async()=>{
  let rejected=false;
  try{
    await feedbackObjectKey(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',3,new Uint8Array([1]),'png');
  }catch{rejected=true}
  check(rejected,'slot 3 should be rejected');
});
Deno.test('bounded multipart accepts ordinary form',async()=>{
  const form=new FormData();
  form.set('product_key','aisenlens');
  form.set('content','feedback');
  form.append('images',new File([new Uint8Array([255,216,255])],'shot.jpg',{type:'image/jpeg'}));
  const req=new Request('http://localhost/functions/v1/feedback-submit',{method:'POST',body:form});
  const parsed=await boundedForm(req,70000);
  check(parsed.get('product_key')==='aisenlens','product missing');
  check(parsed.getAll('images').length===1,'image missing');
});
Deno.test('bounded reader rejects body exceeding cap before parsing',async()=>{
  const req=new Request('http://localhost',{method:'POST',body:new Uint8Array(500)});
  let rejected=false;
  try{await boundedForm(req,100)}catch(e){rejected=(e as Error).message==='REQUEST_TOO_LARGE'}
  check(rejected,'oversized request should be rejected');
});

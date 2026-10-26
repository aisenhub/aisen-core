import {boundedForm,detectMime,feedbackObjectKey} from '../_shared/feedback.ts';
function check(value:unknown,message:string){
  if(!value)throw new Error(message);
}
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

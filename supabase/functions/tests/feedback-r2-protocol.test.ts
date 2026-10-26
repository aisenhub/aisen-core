import {S3Client} from 'npm:@aws-sdk/client-s3@3.1156.0';
import {putObject,readObject,feedbackObjectKey} from '../_shared/feedback.ts';
import {unzipSync} from 'npm:fflate@0.8.2';
import {buildFeedbackZip,type ExportFeedback} from '../_shared/feedback-export.ts';
function check(value:unknown,message:string):asserts value{
 if(!value)throw new Error(message);
}
Deno.test('isolated S3 protocol fixture: 1/2 images, conditional replay and error injection',async()=>{
  const objects=new Map<string,Uint8Array>();
  let failOnSlot=0,puts=0;
  const fixture=Deno.serve({hostname:'127.0.0.1',port:0,onListen:()=>{}},async(request)=>{
    const key=new URL(request.url).pathname;
    if(request.method==='GET'&&key.includes('oversized-stream')){
      return new Response(new ReadableStream<Uint8Array>({start(controller){
        controller.enqueue(new Uint8Array(12));controller.close();
      }}),{status:200,headers:{'content-type':'application/octet-stream'}});
    }
    if(request.method==='GET'){
      if(failOnSlot&&key.includes('/'+failOnSlot+'-'))
        return new Response('<Error><Code>ServiceUnavailable</Code></Error>',{
          status:503,headers:{'content-type':'application/xml'}});
      const body=objects.get(key);
      return body?new Response(Uint8Array.from(body),{status:200,
        headers:{'content-type':key.endsWith('.png')?'image/png':'image/jpeg'}}):
        new Response('<Error><Code>NoSuchKey</Code></Error>',{status:404,
          headers:{'content-type':'application/xml'}});
    }
    if(request.method!=='PUT')return new Response('Only Get/Put',{status:405});
    puts++;
    check(request.headers.get('if-none-match')==='*','missing S3 conditional-create header');
    check(!!request.headers.get('authorization'),'SDK did not sign request');
    if(failOnSlot&&key.includes('/'+failOnSlot+'-'))
      return new Response('<Error><Code>ServiceUnavailable</Code></Error>',{
        status:503,headers:{'content-type':'application/xml'}});
    if(objects.has(key))
      return new Response('<Error><Code>PreconditionFailed</Code></Error>',{
        status:412,headers:{'content-type':'application/xml'}});
    objects.set(key,new Uint8Array(await request.arrayBuffer()));
    return new Response(null,{status:200,headers:{etag:'"test"'}});
  });
  const client=new S3Client({region:'auto',
    endpoint:'http://127.0.0.1:'+fixture.addr.port,forcePathStyle:true,
    credentials:{accessKeyId:'fixture-access',secretAccessKey:'fixture-secret'},
    maxAttempts:1});
  const prefix=['11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333'] as const;
  const one=new Uint8Array([137,80,78,71,13,10,26,10,0,1]);
  const two=new Uint8Array([255,216,255,2,3,255,217]);
  const key1=await feedbackObjectKey(...prefix,1,one,'png');
  const key2=await feedbackObjectKey(...prefix,2,two,'jpg');
  try{
    check(await putObject(client,'private-qa',key1,one,'image/png'),
      'first image should create object');
    check(Number(objects.size)===1,'one image fixture count');
    check(!(await putObject(client,'private-qa',key1,one,'image/png')),
      'same image must be idempotent, not overwrite');
    check(Number(objects.size)===1,'idempotent retry must leave same object');
    check(await putObject(client,'private-qa',key2,two,'image/jpeg'),
      'second image should create object');
    check(Number(objects.size)===2,'exactly two distinct private objects');
    check(objects.get('/private-qa/'+key2)?.length===two.length,'byte count changed');
    const downloaded1=await readObject(client,'private-qa',key1);
    const downloaded2=await readObject(client,'private-qa',key2);
    check(downloaded1.length===one.length&&downloaded2.length===two.length,
      'signed S3 GET must return exact original byte lengths');
    check(downloaded1.every((v,i)=>v===one[i])&&downloaded2.every((v,i)=>v===two[i]),
      'S3 GET must preserve original image bytes');
    const sample:ExportFeedback={
      id:prefix[0],feedback_no:50,product_id:prefix[0],user_id:prefix[1],
      content:'S3 two-image test',category:'bug',queue_state:'workbench',
      created_at:'2026-10-26T00:00:00Z',version:1,priority:'high',
      status:'new',is_starred:false,tags:[],events:[],images:[
        {slot:1,mime_type:'image/png',bytes:downloaded1},
        {slot:2,mime_type:'image/jpeg',bytes:downloaded2},
      ],
    };
    const archive=unzipSync(await buildFeedbackZip([sample],{
      user_comments:false,public_replies:false,internal_notes:false,
      history:false,tags:false,status:false,identity:false,
    },'selected'));
    check(archive['feedback/FB-50/screenshot-1.png']?.length===one.length,
      'private screenshot 1 must appear in unpacked ZIP');
    check(archive['feedback/FB-50/screenshot-2.jpg']?.length===two.length,
      'private screenshot 2 must appear in unpacked ZIP');
    let bounded=false;
    try{await readObject(client,'private-qa','oversized-stream',8)}
    catch(e){bounded=e instanceof Error&&e.message==='OBJECT_TOO_LARGE'}
    check(bounded,'untrusted streamed S3 bytes must stop at the hard read cap');
    let invalidCap=false;
    try{await readObject(client,'private-qa',key1,4*1024*1024)}
    catch(e){invalidCap=e instanceof Error&&e.message==='INVALID_OBJECT_READ_LIMIT'}
    check(invalidCap,'callers cannot disable maximum private image size');
    failOnSlot=2;
    let getFailed=false;
    try{await readObject(client,'private-qa',key2)}
    catch(e){getFailed=(e as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===503}
    check(getFailed,'S3 GET 503 must reject instead of returning a partial image');
    let failed=false;
    try{
      await putObject(client,'private-qa',
        await feedbackObjectKey(...prefix,2,new Uint8Array([...two,8]),'jpg'),
        new Uint8Array([...two,8]),'image/jpeg');
    }catch(e){failed=(e as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===503}
    check(failed,'storage 503 must not be treated as success or harmless conflict');
    check(Number(objects.size)===2,'failed conditional put did not add third object');
    check(puts>=4,'fixture exercised signed HTTP PUT and retry');
  }finally{
    client.destroy();
    await fixture.shutdown();
  }
});

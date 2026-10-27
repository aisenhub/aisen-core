import {S3Client} from 'npm:@aws-sdk/client-s3@3.1156.0';
import {auditFeedbackObjectPage,readFeedbackReferencedKeys} from '../_shared/feedback-orphan-audit.ts';
function ok(v:unknown,m:string):asserts v{if(!v)throw Error(m)}
const uuid=(v:number)=>v.toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111';
const imageKey=(slot:number,seed:number)=>'feedback/'+uuid(1)+'/'+uuid(2)+'/'+uuid(3)+'/'+slot+'-'+
  seed.toString(16).padStart(64,'0')+'.png';
const day=24*3600*1000;
Deno.test('F07 orphan audit is strictly read-only, bounded, paged, and fails closed on reference fault',async()=>{
  const now=Date.parse('2026-10-27T00:00:00Z');
  const referenced=imageKey(1,1),oldUnreferenced=imageKey(2,2),
    recent=imageKey(1,3),invalid='feedback/unknown-do-not-delete',
    timeless=imageKey(1,4),future=imageKey(1,5);
  const entries=[
    {key:referenced,lastModified:new Date(now-30*day)},
    {key:oldUnreferenced,lastModified:new Date(now-30*day)},
    {key:recent,lastModified:new Date(now-2*day)},
    {key:invalid,lastModified:new Date(now-40*day)},
    {key:timeless,lastModified:null},
    {key:future,lastModified:new Date(now+day)},
  ];
  let getCount=0,deleteCount=0,checks=0,requestedKeys:string[]=[];
  const fixture=Deno.serve({hostname:'127.0.0.1',port:0,onListen:()=>{}},req=>{
    const url=new URL(req.url);
    if(req.method==='DELETE')deleteCount++;
    if(req.method!=='GET'||url.searchParams.get('list-type')!=='2')
      return new Response('<Error><Code>AccessDenied</Code></Error>',{status:403,
        headers:{'content-type':'application/xml'}});
    getCount++;
    ok(url.searchParams.get('prefix')==='feedback/','must scope private feedback prefix');
    ok(url.searchParams.get('max-keys')==='100','must bound S3 enumeration');
    ok(!!req.headers.get('authorization'),'S3 enumeration must be signed');
    const onSecond=!!url.searchParams.get('continuation-token');
    const page=onSecond?entries.slice(4):entries.slice(0,4);
    const contents=page.map(item=>
      '<Contents><Key>'+item.key+'</Key>'+
      (item.lastModified?'<LastModified>'+item.lastModified.toISOString()+'</LastModified>':'')+
      '</Contents>').join('');
    const body='<?xml version="1.0" encoding="UTF-8"?>'+
      '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">'+
      '<Name>private-qa</Name><Prefix>feedback/</Prefix><MaxKeys>100</MaxKeys>'+
      '<IsTruncated>'+(onSecond?'false':'true')+'</IsTruncated>'+
      (onSecond?'':'<NextContinuationToken>test-next-page</NextContinuationToken>')+
      contents+'</ListBucketResult>';
    return new Response(body,{status:200,headers:{'content-type':'application/xml'}});
  });
  const client=new S3Client({endpoint:'http://127.0.0.1:'+fixture.addr.port,
    region:'auto',forcePathStyle:true,maxAttempts:1,
    credentials:{accessKeyId:'test-only',secretAccessKey:'test-only'}});
  let dbFailure=false,dbUnexpected=false;
  const refs=async(keys:string[])=>readFeedbackReferencedKeys(
    async(name,args)=>{
      ok(name==='feedback_referenced_keys','must call the existing trusted RPC');
      ok(args.p_keys.length<=100,'RPC must receive no more than 100 keys');
      checks++;requestedKeys=args.p_keys;
      if(dbFailure)throw Error('upstream DB outage');
      return {data:dbUnexpected?[imageKey(2,999)]:
        (keys.includes(referenced)?[referenced]:[]),error:null};
    },keys);

  try{
    const page1=await auditFeedbackObjectPage(client,'private-qa',refs,
      {nowMs:now,minAgeMs:7*day});
    ok(page1.nextCursor==='test-next-page','pagination token must be preserved');
    ok(page1.entries.length===4,'S3 first page items missing');
    ok(page1.entries.find(x=>x.key===referenced)?.status==='referenced',
      'referenced object must never be review candidate');
    ok(page1.entries.find(x=>x.key===oldUnreferenced)?.status==='manual_review',
      'aged unreferenced canonical key must get review status, not deletion');
    ok(page1.entries.find(x=>x.key===recent)?.status==='retained_recent',
      'recent unreferenced object must be guarded');
    ok(page1.entries.find(x=>x.key===invalid)?.status==='retained_invalid_key',
      'malformed key must be guarded');
    ok(!requestedKeys.includes(invalid),'malformed key must not reach DB RPC');
    const page2=await auditFeedbackObjectPage(client,'private-qa',refs,
      {nowMs:now,minAgeMs:7*day,cursor:page1.nextCursor});
    ok(page2.nextCursor===null,'second page must be complete');
    ok(page2.entries.find(x=>x.key===timeless)?.status==='retained_unknown_age',
      'missing object timestamp must be guarded');
    ok(page2.entries.find(x=>x.key===future)?.status==='retained_recent',
      'future timestamp must never imply aged object');
    ok(getCount===2&&checks===2,'must check each S3 page against live DB');
    ok(deleteCount===0,'audit must never perform DELETE');
    dbFailure=true;
    let refused=false;
    try{await auditFeedbackObjectPage(client,'private-qa',refs,
      {nowMs:now,minAgeMs:7*day})}
    catch(e){refused=(e as Error).message==='REFERENCE_CHECK_UNAVAILABLE'}
    ok(refused,'unknown database state must fail closed');
    dbFailure=false;dbUnexpected=true;
    refused=false;
    try{await auditFeedbackObjectPage(client,'private-qa',refs,
      {nowMs:now,minAgeMs:7*day})}
    catch(e){refused=(e as Error).message==='INVALID_REFERENCE_REPLY'}
    ok(refused,'unrecognized DB reference response must fail closed');
    refused=false;
    try{await auditFeedbackObjectPage(client,'private-qa',refs,
      {nowMs:now,minAgeMs:0})}
    catch(e){refused=(e as Error).message==='INVALID_AUDIT_WINDOW'}
    ok(refused,'zero-day cleanup review window must be forbidden');
    refused=false;
    try{await readFeedbackReferencedKeys(async()=>({data:[],error:null}),
      Array.from({length:101},()=>imageKey(1,1)))}
    catch(e){refused=(e as Error).message==='INVALID_REFERENCE_QUERY'}
    ok(refused,'trusted RPC adapter must enforce at most 100 objects');
    ok(deleteCount===0,'even after failure, audit must never delete objects');
  }finally{
    client.destroy();
    await fixture.shutdown();
  }
});

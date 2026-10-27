import {ListObjectsV2Command,S3Client} from 'npm:@aws-sdk/client-s3@3.1156.0';

// F07 audit-only helper. This module has no DeleteObject operation, scheduler,
// credentials or public Edge endpoint. "manual_review" is NOT permission to
// delete: concurrent commits, uncertain HTTP results and retention rules still
// require a separately reviewed, live reference recheck before any action.
const DAY=86_400_000;
const MAX_PAGE=100; // private.feedback_referenced_keys_core RPC hard cap.
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const allowedKey=new RegExp('^feedback/'+uuid+'/'+uuid+'/'+uuid+
  '/[12]-[0-9a-f]{64}\\.(?:png|jpg|webp)$','i');
export type FeedbackAuditStatus=
  'referenced'|'manual_review'|'retained_recent'|
  'retained_unknown_age'|'retained_invalid_key';
export type FeedbackAuditEntry={key:string;status:FeedbackAuditStatus};
export type FeedbackAuditPage={entries:FeedbackAuditEntry[];nextCursor:string|null};

// Service-role only; the database contract denies anon/authenticated.
// The caller must supply an authenticated server-side RPC implementation.
// Never log keys or the upstream error, and never substitute [] after faults.
export async function readFeedbackReferencedKeys(
  rpc:(name:'feedback_referenced_keys',args:{p_keys:string[]})=>
    Promise<{data:unknown;error?:unknown}>,
  keys:string[]
):Promise<string[]>{
  if(keys.length<1||keys.length>MAX_PAGE||!keys.every(k=>allowedKey.test(k)))
    throw new Error('INVALID_REFERENCE_QUERY');
  let reply:{data:unknown;error?:unknown};
  try{reply=await rpc('feedback_referenced_keys',{p_keys:keys})}
  catch{throw new Error('REFERENCE_CHECK_UNAVAILABLE')}
  if(reply.error)throw new Error('REFERENCE_CHECK_UNAVAILABLE');
  if(!Array.isArray(reply.data)||
    !reply.data.every(x=>typeof x==='string'&&keys.includes(x)))
    throw new Error('INVALID_REFERENCE_REPLY');
  return reply.data as string[];
}

// Trusted service-role RPC adapter: SELECT public.feedback_referenced_keys(p_keys).
// The caller provides a bounded frozen observation time, NOT a delete cutoff.
export async function auditFeedbackObjectPage(
  client:S3Client,bucket:string,readReferences:(keys:string[])=>Promise<string[]>,
  options:{nowMs:number;minAgeMs:number;cursor?:string}
):Promise<FeedbackAuditPage>{
  if(!Number.isSafeInteger(options.nowMs)||
    !Number.isSafeInteger(options.minAgeMs)||
    options.minAgeMs<7*DAY||
    options.cursor!==undefined&&(!options.cursor||options.cursor.length>4096))
    throw new Error('INVALID_AUDIT_WINDOW');
  if(!bucket||!/^[-a-zA-Z0-9_.]{3,63}$/.test(bucket))
    throw new Error('INVALID_AUDIT_BUCKET');

  // Exactly one capped page; no unbounded S3 scan or object mutations.
  const list=await client.send(new ListObjectsV2Command({
    Bucket:bucket,Prefix:'feedback/',MaxKeys:MAX_PAGE,
    ...(options.cursor?{ContinuationToken:options.cursor}:{}),
  }));
  const objects=list.Contents??[];
  if(objects.length>MAX_PAGE||
    list.IsTruncated&&!list.NextContinuationToken)
    throw new Error('INVALID_AUDIT_LIST');
  const unique=new Set<string>();
  for(const object of objects){
    if(typeof object.Key!=='string'||unique.has(object.Key)||
      !object.Key.startsWith('feedback/'))throw new Error('INVALID_AUDIT_LIST');
    unique.add(object.Key);
  }
  const canonical=objects.map(o=>o.Key!).filter(k=>allowedKey.test(k));
  let referenced:string[];
  try{
    referenced=canonical.length?await readReferences(canonical):[];
  }catch(e){
    if(e instanceof Error&&e.message==='INVALID_REFERENCE_REPLY')throw e;
    throw new Error('REFERENCE_CHECK_UNAVAILABLE');
  }
  if(!Array.isArray(referenced)||
    !referenced.every(x=>typeof x==='string'&&canonical.includes(x)))
    throw new Error('INVALID_REFERENCE_REPLY');
  const referencedSet=new Set(referenced);
  return {
    entries:objects.map(o=>{
      const key=o.Key!;
      let status:FeedbackAuditStatus;
      if(!allowedKey.test(key))status='retained_invalid_key';
      else if(referencedSet.has(key))status='referenced';
      else if(!o.LastModified||!Number.isFinite(o.LastModified.getTime()))
        status='retained_unknown_age';
      else if(o.LastModified.getTime()>options.nowMs-options.minAgeMs)
        status='retained_recent';
      else status='manual_review';
      return {key,status};
    }),
    nextCursor:list.IsTruncated?list.NextContinuationToken!:null,
  };
}

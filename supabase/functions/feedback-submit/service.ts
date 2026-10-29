import {boundedForm,cors,fail,feedbackIdentityFailure,feedbackObjectKey,
  feedbackRpcReadFailure,json} from '../_shared/feedback.ts';
import {makeFeedbackThumbnail,feedbackThumbnailKey} from '../_shared/feedback-image.ts';

const MAX_IMAGE=3*1024*1024;
const MAX_BODY=7*1024*1024;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CommitAttachment={slot:number;object_key:string;mime_type:string;size_bytes:number};
export type CommitArgs={p_user_id:string;p_product_key:string;p_request_id:string;
  p_content:string;p_category:string;p_contact_email:string;p_attachments:CommitAttachment[]};
export type RpcReply<T>={data:T|null;error:{code?:string}|null};
export type FeedbackPorts={
  actor?:string|null;
  getIdentity:()=>Promise<{user?:{email_confirmed_at?:string|null}|null;error?:unknown}>;
  myFeedback:(productKey:string,requestId:string)=>Promise<RpcReply<{product_id:string}[]>>;
  preflight:(productKey:string,requestId:string)=>Promise<RpcReply<{product_id?:string}>>;
  commit:(args:CommitArgs)=>Promise<RpcReply<{replayed?:boolean}>>;
  putFile:(key:string,data:Uint8Array,mime:string)=>Promise<boolean>;
};

// Same production request validation/commit sequence, with a narrow port
// for isolated HTTP/S3 tests. No auth bypass exists in the Edge entrypoint:
// withSupabase validates the JWT before supplying these dependencies.
export async function submitFeedback(req:Request,ports:FeedbackPorts):Promise<Response>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return fail('METHOD_NOT_ALLOWED',405);
  const actor=ports.actor;
  if(!actor)return fail('AUTH_REQUIRED',401);
  // Recheck current identity. Auth JWT alone is not proof of confirmed email.
  let identity:Awaited<ReturnType<FeedbackPorts['getIdentity']>>;
  try{identity=await ports.getIdentity()}
  catch{return fail('IDENTITY_LOOKUP_UNAVAILABLE',503)}
  const identityFailure=feedbackIdentityFailure(identity.error,identity.user);
  if(identityFailure)return identityFailure;
  if(Number(req.headers.get('content-length')??0)>MAX_BODY)
    return fail('REQUEST_TOO_LARGE',413);
  let form:FormData;
  try{form=await boundedForm(req,MAX_BODY)}
  catch(e){
    return fail(e instanceof Error&&e.message==='REQUEST_TOO_LARGE'?
      'REQUEST_TOO_LARGE':'INVALID_MULTIPART',
      e instanceof Error&&e.message==='REQUEST_TOO_LARGE'?413:422);
  }
  const productKey=String(form.get('product_key')??'').trim();
  const requestId=String(form.get('request_id')??'').trim();
  const content=String(form.get('content')??'').trim();
  const category=String(form.get('category')??'other');
  const contactValue=form.get('contact_email');
  const contactEmail=typeof contactValue==='string'?contactValue.trim():'';
  const validEmail=contactEmail.length<=254&&/^[A-Za-z0-9.!#$%&'*+/=?^_{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(contactEmail);
  const images=form.getAll('images');
  if(!/^[a-z][a-z0-9_]{0,63}$/.test(productKey)||!uuid.test(requestId)||
    !content||content.length>5000||!validEmail||images.length>2||
    !['bug','account','experience','suggestion','other'].includes(category)||
    images.some(image=>!(image instanceof File)))return fail('INVALID_ARGUMENT',422);
  // UNKNOWN/timeout recovery uses the original request ID, not a new ticket.
  let before:Awaited<ReturnType<FeedbackPorts['myFeedback']>>;
  try{before=await ports.myFeedback(productKey,requestId)}
  catch{return fail('FEEDBACK_READ_UNAVAILABLE',503)}
  if(before.error)return feedbackRpcReadFailure(before.error,
    'FEEDBACK_READ_DENIED','FEEDBACK_READ_UNAVAILABLE');
  const previous=before.data?.[0];
  // Product table is intentionally not directly SELECT-granted to Data API
  // roles (even service_role). The least-privilege preflight validates the
  // active product and returns only the UUID needed for a private R2 key.
  // A matching existing request is exempt from quota, not from identity checks.
  let preflight:Awaited<ReturnType<FeedbackPorts['preflight']>>;
  try{preflight=await ports.preflight(productKey,requestId)}
  catch{return fail('SUBMISSION_UNAVAILABLE',503)}
  if(preflight.error)return fail(preflight.error.code==='PT429'?'RATE_LIMITED':
    preflight.error.code==='PT403'?'ACCESS_DENIED':
    preflight.error.code==='PT409'?'PRODUCT_UNAVAILABLE':'SUBMISSION_UNAVAILABLE',
    preflight.error.code==='PT429'?429:preflight.error.code==='PT403'?403:
    preflight.error.code==='PT409'?409:503);
  const productId=preflight.data?.product_id;
  if(typeof productId!=='string'||!uuid.test(productId))
    return fail('SUBMISSION_UNAVAILABLE',503);
  if(previous&&previous.product_id!==productId)
    return fail('REQUEST_CONFLICT',409);
  const pending:{slot:number;key:string;mime:string;size:number;
    bytes:Uint8Array;thumbnail:Uint8Array}[]=[];
  for(const [index,file] of images.entries()){
    const bytes=new Uint8Array(await (file as File).arrayBuffer());
    if(!bytes.length||bytes.length>MAX_IMAGE)return fail('IMAGE_TOO_LARGE',413);
    const parsed=await makeFeedbackThumbnail(bytes,(file as File).type);
    if(!parsed)return fail('UNSUPPORTED_IMAGE',422);
    const key=await feedbackObjectKey(productId,actor,requestId,index+1,bytes,parsed.ext);
    pending.push({slot:index+1,key,mime:parsed.mime,size:bytes.length,bytes,
      thumbnail:parsed.thumbnail});
  }
  // A repeated ID must match every immutable attachment, not merely the
  // number of photos. No R2 write occurs before this comparison.
  if(previous){
    let check:Awaited<ReturnType<FeedbackPorts['commit']>>;
    try{check=await ports.commit({
      p_user_id:actor,p_product_key:productKey,p_request_id:requestId,
      p_content:content,p_category:category,p_contact_email:contactEmail,
      p_attachments:pending.map(({slot,key,mime,size})=>({
        slot,object_key:key,mime_type:mime,size_bytes:size,
      })),
    })}
    catch{return fail('SUBMISSION_UNKNOWN',503)}
    if(check.error)return fail(check.error.code==='PT409'?'REQUEST_CONFLICT':'SUBMISSION_UNKNOWN',
      check.error.code==='PT409'?409:503);
    return json(check.data,check.data?.replayed?200:201);
  }
  // Concurrent retries may use the same deterministic R2 key. Never delete
  // an object merely because this invocation fails or receives a replay;
  // a separate successful request may already reference that object.
  // Orphans require delayed reconciliation against committed DB references.
  try{
    for(const file of pending){
      await ports.putFile(file.key,file.bytes,file.mime);
      // The original and its JPEG derivative share one content-derived key.
      // A partial 503 keeps them for later reference-aware reconciliation.
      await ports.putFile(feedbackThumbnailKey(file.key),file.thumbnail,'image/jpeg');
    }
    const result=await ports.commit({
      p_user_id:actor,p_product_key:productKey,p_request_id:requestId,
      p_content:content,p_category:category,p_contact_email:contactEmail,
      p_attachments:pending.map(({slot,key,mime,size})=>({
        slot,object_key:key,mime_type:mime,size_bytes:size,
      })),
    });
    if(result.error){
      // Keep possible orphan for safe reference-aware reconciliation.
      return fail(result.error.code==='PT409'?'REQUEST_CONFLICT':
        result.error.code==='PT403'?'ACCESS_DENIED':
        result.error.code==='PT429'?'RATE_LIMITED':'SUBMISSION_UNKNOWN',
        result.error.code==='PT409'?409:result.error.code==='PT403'?403:
        result.error.code==='PT422'?422:result.error.code==='PT429'?429:503);
    }
    return json(result.data,result.data?.replayed?200:201);
  }catch{
    // Cannot infer from transport errors whether this R2 key is still
    // needed by a concurrent request; leave it for the future safe janitor.
    return fail('STORAGE_FAILURE_OR_UNKNOWN',503);
  }
}

import {cors,fail,feedbackRpcReadFailure,json} from '../_shared/feedback.ts';

export type ImageAccessPorts={
  getAccess:(attachmentId:string)=>Promise<{
    data:{object_key?:string;mime_type?:string}|null;
    error:{code?:string}|null;
  }>;
  sign:(objectKey:string)=>Promise<string>;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function issueFeedbackImageUrl(req:Request,ports:ImageAccessPorts):Promise<Response>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return fail('METHOD_NOT_ALLOWED',405);
  const payload=await req.json().catch(()=>null);
  const id=payload?.attachment_id;
  if(typeof id!=='string'||!uuid.test(id))return fail('INVALID_ATTACHMENT_ID',422);
  let access:Awaited<ReturnType<ImageAccessPorts['getAccess']>>;
  try{access=await ports.getAccess(id)}
  catch{return fail('IMAGE_ACCESS_UNAVAILABLE',503)}
  if(access.error)return feedbackRpcReadFailure(access.error,
    'IMAGE_FORBIDDEN','IMAGE_ACCESS_UNAVAILABLE');
  if(!access.data?.object_key)return fail('IMAGE_ACCESS_UNAVAILABLE',503);
  try{
    const url=await ports.sign(access.data.object_key);
    return json({url,expires_in:60,mime_type:access.data.mime_type});
  }catch{return fail('OBJECT_STORAGE_UNAVAILABLE',503)}
}

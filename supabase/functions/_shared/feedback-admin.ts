import {fail,feedbackRpcReadFailure} from './feedback.ts';

export async function authorizeFeedbackAdmin(
 actor:string|null|undefined,
 assurance:()=>PromiseLike<{data:{currentLevel:string|null}|null;error:unknown}>,
 access:()=>PromiseLike<{data:{allowed?:boolean}|null;error:{code?:string}|null}>,
):Promise<Response|null>{
 if(!actor)return fail('AUTH_REQUIRED',401);
 try{
  const level=await assurance();
  if(level.error||!level.data)return fail('AUTH_ASSURANCE_UNAVAILABLE',503);
  if(level.data.currentLevel!=='aal2')return fail('ADMIN_MFA_REQUIRED',403);
 }catch{return fail('AUTH_ASSURANCE_UNAVAILABLE',503)}
 try{
  const permission=await access();
  if(permission.error)return feedbackRpcReadFailure(permission.error,
   'ADMIN_ACCESS_DENIED','ADMIN_ACCESS_UNAVAILABLE');
  if(typeof permission.data?.allowed!=='boolean')return fail('ADMIN_ACCESS_UNAVAILABLE',503);
  if(permission.data.allowed!==true)return fail('ADMIN_ACCESS_DENIED',403);
 }catch{return fail('ADMIN_ACCESS_UNAVAILABLE',503)}
 return null;
}

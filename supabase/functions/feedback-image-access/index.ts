import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {withSupabase} from 'npm:@supabase/server@1';
import {cors,signedGet} from '../_shared/feedback.ts';
import {issueFeedbackImageUrl} from './service.ts';

const handle=withSupabase({auth:'user'},(req,ctx)=>
  issueFeedbackImageUrl(req,{
    getAccess:async(attachmentId)=>{
      const bearer=req.headers.get('authorization')?.replace(/^Bearer /i,'')??'';
      const assurance=await ctx.supabase.auth.mfa.getAuthenticatorAssuranceLevel(bearer);
      if(assurance.error)return {data:null,error:{code:'AUTH_UNAVAILABLE'}};
      const {data,error}=await ctx.supabaseAdmin.rpc('feedback_image_access',{
        p_actor_id:ctx.userClaims?.id,p_actor_aal:assurance.data.currentLevel,
        p_attachment_id:attachmentId,
      });
      return {data,error};
    },
    sign:signedGet,
  }));
export default {fetch:(req:Request)=>req.method==='OPTIONS'?
  new Response(null,{status:204,headers:cors}):handle(req)};

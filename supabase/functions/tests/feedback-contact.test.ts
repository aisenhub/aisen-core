import {submitFeedback,type CommitArgs,type FeedbackPorts} from '../feedback-submit/service.ts';
const check=(value:unknown,message:string)=>{if(!value)throw new Error(message)};
const actor='22222222-2222-4222-8222-222222222222';
const product='11111111-1111-4111-8111-111111111111';
Deno.test('contact email is required, validated before storage and frozen in trusted commit',async()=>{
  let committed:CommitArgs|null=null;
  const ports:FeedbackPorts={
    actor,getIdentity:async()=>({user:{email_confirmed_at:'2026-10-29'}}),
    myFeedback:async()=>({data:[],error:null}),
    preflight:async()=>({data:{product_id:product},error:null}),
    commit:async args=>{committed=args;return {data:{id:crypto.randomUUID(),replayed:false},error:null}},
    putFile:async()=>{throw new Error('zero images must not touch storage')},
  };
  for(const email of [null,'','a,b@example.com','a@example','a\n@example.com','艾@example.com','a'.repeat(244)+'@example.com']){
    const form=new FormData();
    form.set('product_key','aisenlens');form.set('request_id',crypto.randomUUID());
    form.set('content','contact contract');form.set('category','suggestion');
    if(email!==null)form.set('contact_email',email);
    const response=await submitFeedback(new Request('http://localhost',{method:'POST',body:form}),ports);
    check(response.status===422,'invalid or missing contact accepted');
    check(committed===null,'invalid contact reached trusted commit');
  }
  const form=new FormData();
  form.set('product_key','aisenlens');form.set('request_id',crypto.randomUUID());
  form.set('content','contact contract');form.set('category','suggestion');
  form.set('contact_email','  Reply.User@example.com  ');
  const response=await submitFeedback(new Request('http://localhost',{method:'POST',body:form}),ports);
  check(response.status===201,'valid contact not committed');
  const args=committed as CommitArgs|null;
  check(args?.p_user_id===actor,'contact must never replace JWT identity');
  check(args && 'p_contact_email' in args && args.p_contact_email==='Reply.User@example.com','trimmed case-preserving contact missing');
});

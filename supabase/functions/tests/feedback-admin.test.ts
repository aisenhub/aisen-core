import {authorizeFeedbackAdmin} from '../_shared/feedback-admin.ts';
import {validFeedbackObjectKey} from '../_shared/feedback-key.ts';

function equal(actual:unknown,expected:unknown){
  if(actual!==expected)throw new Error(`Expected ${expected}, got ${actual}`);
}
Deno.test('admin authorization distinguishes identity, permission and upstream failure',async()=>{
  const good=async()=>({data:{currentLevel:'aal2'},error:null});
  const allowed=async()=>({data:{allowed:true},error:null});
  equal((await authorizeFeedbackAdmin(null,good,allowed))?.status,401);
  equal((await authorizeFeedbackAdmin('actor',async()=>({data:null,error:{}}),allowed))?.status,503);
  equal((await authorizeFeedbackAdmin('actor',async()=>{throw new Error('offline')},allowed))?.status,503);
  equal((await authorizeFeedbackAdmin('actor',async()=>({data:{currentLevel:'aal1'},error:null}),allowed))?.status,403);
  equal((await authorizeFeedbackAdmin('actor',good,async()=>({data:null,error:{code:'08006'}})))?.status,503);
  equal((await authorizeFeedbackAdmin('actor',good,async()=>({data:null,error:{code:'PT403'}})))?.status,403);
  equal((await authorizeFeedbackAdmin('actor',good,async()=>({data:null,error:{code:'PT401'}})))?.status,401);
  equal((await authorizeFeedbackAdmin('actor',good,async()=>({data:{allowed:false},error:null})))?.status,403);
  equal((await authorizeFeedbackAdmin('actor',good,async()=>({data:{},error:null})))?.status,503);
  equal(await authorizeFeedbackAdmin('actor',good,allowed),null);
});
Deno.test('storage keys match exact product, owner, request and slot/hash protocol',()=>{
  const product='11111111-1111-4111-8111-111111111111';
  const owner='22222222-2222-4222-8222-222222222222';
  const request='33333333-3333-4333-8333-333333333333';
  const key=`feedback/${product}/${owner}/${request}/1-${'a'.repeat(64)}.png`;
  equal(validFeedbackObjectKey(key,product,owner,request),true);
  equal(validFeedbackObjectKey(key,owner,owner,request),false);
  equal(validFeedbackObjectKey(key.replace('/1-','/nested/1-'),product,owner,request),false);
  equal(validFeedbackObjectKey(key.replace('/1-','/3-'),product,owner,request),false);
});

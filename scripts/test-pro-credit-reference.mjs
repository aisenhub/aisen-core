#!/usr/bin/env node
// Pure test oracle for the *proposed* policy, not a production entitlement test.
import assert from 'node:assert/strict';
import {DAY_MS,projectCredits} from './experiments/pro-credit-reference.mjs';
const t0='2026-10-28T00:00:00.000Z';
const day=d=>new Date(Date.parse(t0)+d*DAY_MS).toISOString();
const ctx=(at=0,productId='aisenlens')=>({userId:'test-user',productId,at:day(at)});
const event=(kind,id,at=0,more={})=>({kind,id,at:day(at),userId:'test-user',productId:'aisenlens',...more});
const grant=(id,days,at=0,sourceKey)=>event('grant',id,at,{days,...(sourceKey?{sourceKey}:{})});
const check=(name,events,at,expected)=> {
  const result=projectCredits(events,ctx(at));
  assert.equal(result.endsAt,expected,name);
  console.log(name+' PASS');
};
check('GE01 free to 7d',[grant('A',7)],0,day(7));
check('GE02 redeem credited on redemption',[grant('R',30,2,'code:R')],2,day(32));
check('GE03 30d plus 30d',[grant('A',30),grant('B',30,3)],3,day(60));
check('GE04 additional redemption 90d',[grant('A',30),grant('R',90,5)],5,day(120));
check('GE05 concurrent 30d plus 30d',[grant('A',30),grant('B',30)],0,day(60));
check('GE06 lost response/replay no duplicate',
  [grant('A',30,0,'admin:req'),grant('A',30,5,'admin:req')],5,day(30));
assert.throws(()=>projectCredits(
  [grant('A',30,0,'admin:req'),grant('B',90,0,'admin:req')],ctx()),/SOURCE_CONFLICT/);
console.log('GE06 changed request rejected PASS');
check('GE07 redeemed code cannot recredit',
  [grant('R',30,0,'code:abcd'),grant('R',30,5,'code:abcd')],5,day(30));
const revokeA=[grant('A',30),grant('B',30),event('revoke','A',20)];
check('GE08 revoke consumed A, B takes over immediately',revokeA,20,day(50));
const a=projectCredits(revokeA,ctx(20)).grants;
assert.deepEqual([a[0].consumedMs,a[0].revokedMs,a[1].remainingMs],
  [20*DAY_MS,10*DAY_MS,30*DAY_MS]);
console.log('GE08 remaining credit conservation PASS');
check('GE09 revoke unconsumed B',[grant('A',30),grant('B',30),event('revoke','B',20)],20,day(30));
let frozen=[grant('A',30),event('permanent','P',5)];
assert.equal(projectCredits(frozen,ctx(18)).kind,'permanent');
assert.equal(projectCredits(frozen,ctx(18)).remainingMs,25*DAY_MS);
console.log('GE10 permanent freezes unspent credit PASS');
assert.throws(()=>projectCredits([...frozen,grant('B',30,6)],ctx(6)),/PERMANENT_ALREADY_ACTIVE/);
console.log('GE11 repeated credit while permanent rejected PASS');
check('GE12 permanent revoked restores unspent credit',
  [...frozen,event('revokePermanent','P',20)],20,day(45));
check('GE13 cross-product isolation',
  [grant('A',30),{...grant('X',90),productId:'aisenhub'}],0,day(30));
check('GE16 revoke used A preserves B',
  [grant('A',30),grant('B',30),event('revoke','A',35)],35,day(60));
const dst='2026-03-08T09:00:00.000Z';
assert.equal(projectCredits([{...grant('A',1),at:dst}],{
  userId:'test-user',productId:'aisenlens',at:dst,
}).endsAt,'2026-03-09T09:00:00.000Z');
console.log('GE17 UTC 24h unaffected by DST PASS');
assert.equal(projectCredits([grant('A',7,5)],ctx()).kind,'free');
assert.throws(()=>projectCredits([grant('A',36501)],ctx()),/DURATION_INVALID/);
assert.throws(()=>projectCredits([grant('A',7)],{...ctx(),at:'2026-10-28'}),/UTC_TIMESTAMP_REQUIRED/);
console.log('GE18 future/invalid inputs fail closed PASS');
assert.deepEqual(projectCredits(revokeA,ctx(20)),projectCredits(revokeA,ctx(20)));
console.log('GE24 repeated read has no credit side effects PASS');
// Deterministic property checks across many generated overlaps and revocations.
// Verify conservation without trusting the projected expiry string as oracle.
let seed=20261028;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
for(let i=0;i<300;i++){
  const durationA=1+Math.floor(random()*365);
  const durationB=1+Math.floor(random()*365);
  const addB=Math.floor(random()*30);
  const revokeAt=addB+Math.floor(random()*380);
  const at=revokeAt+Math.floor(random()*380);
  const events=[grant('A',durationA),grant('B',durationB,addB),event('revoke','A',revokeAt)];
  const result=projectCredits(events,ctx(at));
  for(const [index,g] of result.grants.entries()){
    const original=(index===0?durationA:durationB)*DAY_MS;
    assert.equal(g.remainingMs+g.consumedMs+g.revokedMs,original,
      'each grant must conserve credited duration');
    assert.ok(g.remainingMs>=0&&g.consumedMs>=0&&g.revokedMs>=0,
      'credit balances may never become negative');
  }
  assert.equal(result.grants.reduce((sum,g)=>sum+g.remainingMs,0),result.remainingMs);
  assert.equal(result.endsAt,result.remainingMs?
    new Date(Date.parse(day(at))+result.remainingMs).toISOString():null);
}
console.log('CREDIT_CONSERVATION_300_CASES PASS');
console.log('PRO_CREDIT_REFERENCE_ALL_PASS (isolated policy experiment; no SQL/real customer state)');

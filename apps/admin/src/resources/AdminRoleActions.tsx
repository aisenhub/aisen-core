import {useEffect,useState} from 'react';
import {Alert,Button,Card,CardContent,Stack,TextField,Typography} from '@mui/material';
import {useGetList,useGetOne,useNotify,useRefresh} from 'react-admin';
import {useSearchParams} from 'react-router-dom';
import {callRpc} from '../data/dataProvider';
import {OperationLayout} from './OperationLayout';
import type {OperationSafety} from './OperationDialogs';
import {UserIdentityPicker} from './UserIdentityPicker';

// Platform-wide administrator authority is separate from account restrictions.
// Both RPCs recheck current AAL2 admin qualification, the last-admin guard and audit.
export function AdminRoleActions({embedded=false,defaultUserId,onSafetyChange,onCompleted}:{
  embedded?:boolean;defaultUserId?:string;onSafetyChange?:(v:OperationSafety)=>void;
  onCompleted?:()=>void;
}={}){
  const [params]=useSearchParams();
  const [target,setTarget]=useState(()=>defaultUserId??params.get('user_id')??'');
  const valid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(target.trim());
  const identity=useGetOne('users',{id:target.trim()},
    {enabled:valid,refetchOnMount:'always',refetchOnWindowFocus:true});
  const verified=valid&&!identity.isPending&&!identity.isFetching&&!identity.isError&&
    identity.data?.id===target.trim()&&typeof identity.data.email==='string'&&!!identity.data.email;
  const admins=useGetList('admins',{
    pagination:{page:1,perPage:1},sort:{field:'created_at',order:'DESC'},
    filter:{user_id:target.trim()},
  },{enabled:verified,refetchOnWindowFocus:true});
  const restrictions=useGetList('restrictions',{
    pagination:{page:1,perPage:1},sort:{field:'created_at',order:'DESC'},
    filter:{user_id:target.trim(),kind:'blocked'},
  },{enabled:verified,refetchOnWindowFocus:true});
  const ready=verified&&!admins.isPending&&!admins.isFetching&&!admins.isError&&
    !restrictions.isPending&&!restrictions.isFetching&&!restrictions.isError;
  const isAdmin=(admins.data??[]).some(row=>row.user_id===target.trim()&&row.active===true);
  const isBlocked=(restrictions.data??[]).some(row=>row.user_id===target.trim()&&row.kind==='blocked');
  const action=isAdmin?'admin_revoke_admin':'admin_grant_admin';
  const label=isAdmin?'撤销平台管理员资格':'授予平台管理员资格';
  const before=isAdmin?'有效平台管理员':'无有效管理员资格';
  const after=isAdmin?'无有效管理员资格':'有效平台管理员';
  const [reason,setReason]=useState('');
  const [reviewedKey,setReviewedKey]=useState('');
  const [busy,setBusy]=useState(false);
  const notify=useNotify(),refresh=useRefresh();
  useEffect(()=>{onSafetyChange?.(busy?'busy':'idle')},[onSafetyChange,busy]);
  const mayReview=ready&&!busy&&!!reason.trim();
  // Review expires when identity, reason, role, restriction or refreshed record changes.
  const reviewKey=ready?JSON.stringify([target.trim(),identity.data?.email,
    action,reason.trim(),isBlocked,admins.data?.[0]?.updated_at,
    restrictions.data?.[0]?.created_at]):'';
  const reviewed=!!reviewKey&&reviewedKey===reviewKey;
  const changeTarget=(next:string)=>{setTarget(next);setReviewedKey('');setReason('')};
  async function submit(event:React.FormEvent){
    event.preventDefault();
    if(!reviewed||!mayReview)return;
    setBusy(true);
    try{
      const result=await callRpc<Record<string,unknown>>(action,{
        p_target_user_id:target.trim(),p_reason:reason.trim(),
      });
      notify(result.changed===false?'管理员资格未发生变化':'已执行：'+label,{type:'success'});
      setReviewedKey('');setReason('');
      refresh();
      if(embedded)onCompleted?.();
    }catch(error){
      notify(error instanceof Error?error.message:'管理员资格操作失败',{type:'error'});
      refresh();
    }finally{setBusy(false)}
  }
  return <OperationLayout title="管理员资格操作" embedded={embedded}>
    <Card variant="outlined"><CardContent>
      <Stack component="form" onSubmit={submit} spacing={2}>
        <UserIdentityPicker value={target} onChange={changeTarget} disabled={busy}/>
        {verified&&<Alert severity={admins.isError||restrictions.isError?'error':'info'} role="status">
          {ready?<>当前资格：{before}{isBlocked?' · 平台账号已封禁':''}</>:
            admins.isError||restrictions.isError?'管理员资格核查失败，禁止提交。':
              '正在核实管理员资格…'}
        </Alert>}
        {ready&&<Typography variant="body2" sx={{fontWeight:700}}>{label}</Typography>}
        <TextField label="操作理由" required multiline minRows={2} value={reason}
          disabled={busy} slotProps={{htmlInput:{maxLength:200}}}
          onChange={event=>{setReason(event.target.value);setReviewedKey('')}}/>
        <Button variant="outlined" disabled={!mayReview}
          onClick={()=>setReviewedKey(reviewKey)}>核对管理员资格变更</Button>
        {reviewed&&<Alert severity="warning" role="status">
          目标：{String(identity.data?.email)}（{target.trim()}）。
          全平台管理员资格：{before} → {after}。
          {isAdmin?'撤销后该账号将失去平台管理权限；最后一位有效管理员不可撤销。':
            '授予后该账号将获得平台敏感管理权限，需完成管理员 MFA 验证方可使用。'}
          本操作不改变普通账号的封禁状态。服务端将再次核验管理员权限。
        </Alert>}
        <Button type="submit" color={isAdmin?'error':'primary'} variant="contained"
          disabled={!mayReview||!reviewed}>{busy?'正在处理…':'确认'+label}</Button>
      </Stack>
    </CardContent></Card>
  </OperationLayout>;
}

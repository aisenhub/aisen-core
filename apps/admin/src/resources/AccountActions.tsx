import { useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, MenuItem, Stack, TextField } from '@mui/material';
import { useGetList, useGetOne, useNotify, useRefresh } from 'react-admin';
import { callRpc } from '../data/dataProvider';
import { OperationLayout } from './OperationLayout';
import { useSearchParams } from 'react-router-dom';
import type { OperationSafety } from './OperationDialogs';
import { UserIdentityPicker } from './UserIdentityPicker';

const actions = [
  { id: 'admin_block_account', label: '封禁平台账号', danger: true },
  { id: 'admin_unblock_account', label: '解除平台封禁', danger: false },
] as const;
const impact:Record<(typeof actions)[number]['id'],string>={
  admin_block_account:'封禁账号会影响其在全部产品中的受限操作。',
  admin_unblock_account:'解除平台封禁后，仍需遵守各产品中的成员状态。',
};

export function AccountActions({embedded=false,defaultUserId,onSafetyChange,onCompleted}:{
  embedded?:boolean;defaultUserId?:string;onSafetyChange?:(v:OperationSafety)=>void;
  onCompleted?:()=>void;
}={}) {
  const [params] = useSearchParams();
  const [target, setTarget] = useState(() => defaultUserId ?? params.get('user_id') ?? '');
  const matched=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(target.trim());
  const identity=useGetOne('users',{id:target.trim()},
    {enabled:matched,refetchOnMount:'always',refetchOnWindowFocus:true});
  // An unresolved user lookup returns an id-only placeholder. Such an identity
  // cannot become the target of a high-risk governance operation.
  const identityVerified=matched&&!identity.isPending&&!identity.isFetching&&!identity.isError&&
    identity.data?.id===target.trim()&&typeof identity.data.email==='string'&&!!identity.data.email;
  const restrictions=useGetList('restrictions',{
    pagination:{page:1,perPage:1},sort:{field:'created_at',order:'DESC'},
    filter:{user_id:target.trim(),kind:'blocked'},
  },{enabled:identityVerified});
  // A failed or pending read is not evidence that the account is unrestricted.
  const statusReady=identityVerified&&!restrictions.isPending&&!restrictions.isFetching&&!restrictions.isError;
  const isBlocked=(restrictions.data??[]).some(row=>row.user_id===target.trim()&&row.kind==='blocked');
  const [action, setAction] = useState<(typeof actions)[number]['id']>('admin_block_account');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(()=>{onSafetyChange?.(busy?'busy':'idle')},[onSafetyChange,busy]);
  const [reviewedKey, setReviewedKey] = useState('');
  const stateAlreadyMatches=action==='admin_block_account'?isBlocked:!isBlocked;
  const mayReview=statusReady&&!stateAlreadyMatches&&!busy&&!!reason.trim();
  const currentStatus=isBlocked?'已封禁':'未封禁';
  const nextStatus=action==='admin_block_account'?'已封禁':'未封禁';
  // Confirmations expire on any form, identity, or observed governance-state change.
  const reviewKey=statusReady?JSON.stringify([
    target.trim(),identity.data?.email,action,reason.trim(),isBlocked,
    restrictions.data?.[0]?.created_at,
  ]):'';
  const reviewed=!!reviewKey&&reviewedKey===reviewKey;
  const actionName=actions.find(item=>item.id===action)?.label;
  const recovery=action==='admin_block_account'?'可通过「解除平台封禁」恢复平台账号；产品成员资格仍须单独核查。':
    '需要再次封禁时可使用「封禁平台账号」。';
  const notify = useNotify();
  const refresh = useRefresh();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reviewed || !mayReview) return;
    setBusy(true);
    try {
      const result = await callRpc<Record<string, unknown>>(action, {
        p_target_user_id: target.trim(), p_reason: reason.trim(),
      });
      notify(result.changed === false ? '全平台状态未变更：'+actionName : '已执行全平台操作：'+actionName, { type: 'success' });
      setReviewedKey(''); setReason('');
      refresh();
      if(embedded)onCompleted?.();
    } catch (error) {
      notify(error instanceof Error ? error.message : '操作失败', { type: 'error' });
      refresh();
    } finally { setBusy(false); }
  }
  return <OperationLayout title="平台账号封禁与解封" embedded={embedded}>
    <Card variant="outlined"><CardContent>
      <Stack spacing={2} component="form" onSubmit={submit}>
        <Alert severity={action==='admin_unblock_account'?'info':'warning'}>{impact[action]}</Alert>
        <UserIdentityPicker value={target} disabled={busy}
          onChange={next=>{setTarget(next);setReviewedKey('');}} />
        <TextField select label="账号限制操作" value={action}
          disabled={busy}
          onChange={e => { setAction(e.target.value as typeof action); setReviewedKey(''); }}>
          {actions.map(item => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}
        </TextField>
        {identityVerified&&<Alert role="status" severity={!statusReady?(restrictions.isError?'error':'info'):'info'}>
          {!statusReady?(restrictions.isError?
            '平台账号限制读取失败，无法核实当前状态；请检查权限或刷新后重试。':
            '正在核查平台账号限制…'):
            '当前平台账号状态：'+(isBlocked?'已封禁':'未封禁')}
        </Alert>}
        {statusReady&&stateAlreadyMatches&&<Alert severity="info" role="status">
          当前账号已处于「{nextStatus}」，无需重复提交「{actionName}」。如需执行其他操作，请更改操作类型。
        </Alert>}
        <TextField label="操作理由" value={reason} required multiline minRows={2}
          disabled={busy} onChange={e => { setReason(e.target.value); setReviewedKey(''); }} />
        <Button variant="outlined" onClick={() => setReviewedKey(reviewKey)}
          disabled={!mayReview}>
          核对目标与操作
        </Button>
        {reviewed && <Alert severity="warning" role="status">
          目标账号：{String(identity.data?.email)}（{target.trim()}）
          <br/>
          作用范围：全平台，不受顶部产品筛选影响。
          <br/>
          {actionName}：{currentStatus} → {nextStatus}。
          <br/>
          {impact[action]} {recovery}
          <br/>
          请核对后单独提交；最终结果由服务端重新校验。
        </Alert>}
        <Button type="submit" variant="contained" disabled={!reviewed || !mayReview}>
          {busy ? '操作进行中…' : '提交管理操作'}
        </Button>
      </Stack>
    </CardContent></Card>
  </OperationLayout>;
}
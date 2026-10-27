import { useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, MenuItem, Stack, TextField } from '@mui/material';
import { useGetList, useGetOne, useNotify, useRefresh } from 'react-admin';
import { callRpc } from '../data/dataProvider';
import { OperationLayout } from './OperationLayout';
import { useSearchParams } from 'react-router-dom';
import type { OperationSafety } from './OperationDialogs';

const actions = [
  { id: 'admin_block_account', label: '封禁平台账号', danger: true },
  { id: 'admin_unblock_account', label: '解除平台封禁', danger: false },
  { id: 'admin_grant_admin', label: '授予平台管理员资格', danger: true },
  { id: 'admin_revoke_admin', label: '撤销平台管理员资格', danger: true },
] as const;
const impact:Record<(typeof actions)[number]['id'],string>={
  admin_block_account:'封禁账号会影响其在全部产品中的受限操作。',
  admin_unblock_account:'解除平台封禁后，仍需遵守各产品中的成员状态。',
  admin_grant_admin:'该账号将获得平台敏感管理权限，请核对目标身份。',
  admin_revoke_admin:'该账号将失去平台管理权限；最后一位有效管理员不可撤销。',
};

export function AccountActions({embedded=false,defaultUserId,onSafetyChange,onCompleted}:{
  embedded?:boolean;defaultUserId?:string;onSafetyChange?:(v:OperationSafety)=>void;
  onCompleted?:()=>void;
}={}) {
  const [params] = useSearchParams();
  const [target, setTarget] = useState(() => defaultUserId ?? params.get('user_id') ?? '');
  const matched=/^[a-f0-9-]{36}$/i.test(target.trim());
  const identity=useGetOne('users',{id:target.trim()},{enabled:matched});
  // An unresolved user lookup returns an id-only placeholder. Such an identity
  // cannot become the target of a high-risk governance operation.
  const identityVerified=matched&&!identity.isPending&&!identity.isError&&
    identity.data?.id===target.trim()&&typeof identity.data.email==='string'&&!!identity.data.email;
  const admins=useGetList('admins',{
    pagination:{page:1,perPage:1},sort:{field:'created_at',order:'DESC'},
    filter:{user_id:target.trim()},
  },{enabled:identityVerified});
  const restrictions=useGetList('restrictions',{
    pagination:{page:1,perPage:1},sort:{field:'created_at',order:'DESC'},
    filter:{user_id:target.trim(),kind:'blocked'},
  },{enabled:identityVerified});
  // A failed or pending read is not evidence that the account is unrestricted.
  const statusReady=identityVerified&&!admins.isPending&&!admins.isFetching&&!admins.isError&&
    !restrictions.isPending&&!restrictions.isFetching&&!restrictions.isError;
  const isAdmin=(admins.data??[]).some(row=>row.user_id===target.trim()&&row.active===true);
  const isBlocked=(restrictions.data??[]).some(row=>row.user_id===target.trim()&&row.kind==='blocked');
  const [action, setAction] = useState<(typeof actions)[number]['id']>('admin_block_account');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(()=>{onSafetyChange?.(busy?'busy':'idle')},[onSafetyChange,busy]);
  const [reviewedKey, setReviewedKey] = useState('');
  const adminAction=action==='admin_grant_admin'||action==='admin_revoke_admin';
  const currentStatus=adminAction?(isAdmin?'有效平台管理员':'无有效管理员资格'):(isBlocked?'已封禁':'未封禁');
  const nextStatus=action==='admin_block_account'?'已封禁':
    action==='admin_unblock_account'?'未封禁':
    action==='admin_grant_admin'?'有效平台管理员':'无有效管理员资格';
  // Confirmations expire on any form, identity, or observed governance-state change.
  const reviewKey=statusReady?JSON.stringify([
    target.trim(),identity.data?.email,action,reason.trim(),isAdmin,isBlocked,
    admins.data?.[0]?.updated_at,restrictions.data?.[0]?.created_at,
  ]):'';
  const reviewed=!!reviewKey&&reviewedKey===reviewKey;
  const actionName=actions.find(item=>item.id===action)?.label;
  const recovery=action==='admin_block_account'?'可通过「解除平台封禁」恢复平台账号；产品成员资格仍须单独核查。':
    action==='admin_unblock_account'?'需要再次封禁时可使用「封禁平台账号」。':
    action==='admin_grant_admin'?'可通过「撤销平台管理员资格」收回授权。':
    '恢复管理员资格须重新执行「授予平台管理员资格」；最后一位有效管理员不可撤销。';
  const notify = useNotify();
  const refresh = useRefresh();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reviewed || !statusReady || busy || !reason.trim()) return;
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
  return <OperationLayout title="平台账号操作" embedded={embedded}>
    <Card variant="outlined"><CardContent>
      <Stack spacing={2} component="form" onSubmit={submit}>
        <Alert severity={action==='admin_unblock_account'?'info':'warning'}>{impact[action]}</Alert>
        <TextField label="目标用户 UUID" required value={target}
          disabled={busy}
          onChange={e => { setTarget(e.target.value); setReviewedKey(''); }}
          slotProps={{ htmlInput: { pattern: '[a-fA-F0-9-]{36}' } }} />
        {matched&&<Alert role="status" severity={identityVerified?'success':identity.isPending?'info':'error'}>
          目标身份核查：{identity.isPending?'正在核对…':identityVerified?String(identity.data?.email):'查无可确认账号，禁止提交敏感操作'}。
        </Alert>}
        <TextField select label="管理操作" value={action}
          disabled={busy}
          onChange={e => { setAction(e.target.value as typeof action); setReviewedKey(''); }}>
          {actions.map(item => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}
        </TextField>
        {identityVerified&&<Alert role="status" severity={!statusReady?(admins.isError||restrictions.isError?'error':'info'):'info'}>
          {!statusReady?(admins.isError||restrictions.isError?
            '平台账号或管理员资格读取失败，无法核实当前状态；请检查权限或刷新后重试。':
            '正在核查平台账号限制和管理员资格…'):
            '当前状态：平台账号'+(isBlocked?'已封禁':'未封禁')+'；'+
              (isAdmin?'具备有效平台管理员资格。':'无有效平台管理员资格。')}
        </Alert>}
        <TextField label="操作理由" value={reason} required multiline minRows={2}
          disabled={busy} onChange={e => { setReason(e.target.value); setReviewedKey(''); }} />
        <Button variant="outlined" onClick={() => setReviewedKey(reviewKey)}
          disabled={!statusReady || busy || !reason.trim()}>
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
        <Button type="submit" variant="contained" disabled={!reviewed || !statusReady || busy || !reason.trim()}>
          {busy ? '操作进行中…' : '提交管理操作'}
        </Button>
      </Stack>
    </CardContent></Card>
  </OperationLayout>;
}

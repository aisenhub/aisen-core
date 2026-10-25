import { useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, MenuItem, Stack, TextField } from '@mui/material';
import { useGetOne, useNotify, useRefresh } from 'react-admin';
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
  const [action, setAction] = useState<(typeof actions)[number]['id']>('admin_block_account');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(()=>{onSafetyChange?.(busy?'busy':'idle')},[onSafetyChange,busy]);
  const [reviewed, setReviewed] = useState(false);
  const notify = useNotify();
  const refresh = useRefresh();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reviewed || !identityVerified || busy || !reason.trim() || !target.trim()) return;
    setBusy(true);
    try {
      const result = await callRpc<Record<string, unknown>>(action, {
        p_target_user_id: target.trim(), p_reason: reason.trim(),
      });
      notify(result.changed === false ? '记录保持原状态' : '账号状态已更新', { type: 'success' });
      setReviewed(false); setReason('');
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
          onChange={e => { setTarget(e.target.value); setReviewed(false); }}
          slotProps={{ htmlInput: { pattern: '[a-fA-F0-9-]{36}' } }} />
        {matched&&<Alert role="status" severity={identityVerified?'success':identity.isPending?'info':'error'}>
          目标身份核查：{identity.isPending?'正在核对…':identityVerified?String(identity.data?.email):'查无可确认账号，禁止提交敏感操作'}。
        </Alert>}
        <TextField select label="管理操作" value={action}
          onChange={e => { setAction(e.target.value as typeof action); setReviewed(false); }}>
          {actions.map(item => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}
        </TextField>
        <TextField label="操作理由" value={reason} required multiline minRows={2}
          onChange={e => { setReason(e.target.value); setReviewed(false); }} />
        <Button variant="outlined" onClick={() => setReviewed(true)} disabled={!identityVerified || !reason.trim()}>
          核对目标与操作
        </Button>
        {reviewed && <Alert severity="info">目标：{target}；动作：{actions.find(x => x.id === action)?.label}。请核对后单独提交。</Alert>}
        <Button type="submit" variant="contained" disabled={!reviewed || !identityVerified || busy || !reason.trim()}>
          {busy ? '操作进行中…' : '提交管理操作'}
        </Button>
      </Stack>
    </CardContent></Card>
  </OperationLayout>;
}

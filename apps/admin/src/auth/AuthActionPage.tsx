import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { supabase } from '../supabaseClient';

export function AuthActionPage() {
  const isReset = window.location.pathname === '/auth/reset-password';
  const [loading, setLoading] = useState(isReset);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState(isReset ? '正在验证恢复会话…' : '正在处理邮箱验证…');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let live = true;
    if (!isReset) {
      void supabase.auth.getSession().then(({ data, error }) => {
        if (live) setMessage(error ? '验证失败，请重新请求邮件' :
          data.session ? '邮箱验证完成，可以返回原应用。' : '请在邮箱中重新打开有效的验证链接。');
      });
      return () => { live = false; };
    }
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!live) return;
      if (event === 'PASSWORD_RECOVERY' && session) {
        setReady(true); setLoading(false); setMessage('为当前账号设置新密码');
      }
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!live) return;
      if (error) setMessage('恢复链接无效或已过期');
      else if (data.session) { setReady(true); setMessage('为当前账号设置新密码'); }
      else setMessage('请通过密码找回邮件中的链接进入此页面');
      setLoading(false);
    });
    return () => { live = false; subscription.subscription.unsubscribe(); };
  }, [isReset]);
  async function requestReset(event: React.FormEvent) {
    event.preventDefault(); setLoading(true);
    // Fixed local page path: user input cannot influence redirect destination.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + '/auth/reset-password',
    });
    setLoading(false);
    if (error) setMessage(error.message);
    else { setEmailSent(true); setMessage('如该账号已注册，密码恢复邮件将发送至指定邮箱。'); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setMessage(error.message); setLoading(false); return; }
    setPassword(''); setDone(true); setReady(false); setLoading(false);
    await supabase.auth.signOut({ scope: 'local' });
    setMessage('密码已更新。请重新登录并完成双因素认证。');
  }
  return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2, bgcolor: 'background.default' }}>
    <Card variant="outlined" sx={{ maxWidth: 460, width: '100%' }}>
      <CardContent sx={{ p: 4 }}>
        <Stack spacing={3}>
          <Typography variant="h5" component="h1">{isReset ? '重置密码' : '验证邮箱'}</Typography>
          <Alert severity={done || (!isReset && ready) ? 'success' : 'info'}>{message}</Alert>
          {isReset && !ready && !done && !emailSent &&
            <Box component="form" onSubmit={requestReset}>
              <Stack spacing={2}>
                <TextField label="管理账号邮箱" type="email" value={email} required
                  autoComplete="email" onChange={event => setEmail(event.target.value)} />
                <Button type="submit" variant="contained" disabled={loading}>发送密码恢复邮件</Button>
              </Stack>
            </Box>}
          {isReset && ready && !done &&
            <Box component="form" onSubmit={save}>
              <Stack spacing={2}>
                <TextField label="新密码" type="password" autoComplete="new-password" value={password}
                  onChange={event => setPassword(event.target.value)} slotProps={{ htmlInput: { minLength: 8 } }} required />
                <Button variant="contained" type="submit" disabled={loading}>保存新密码</Button>
              </Stack>
            </Box>}
          <Button href="/login" variant="text">返回管理平台</Button>
        </Stack>
      </CardContent>
    </Card>
  </Box>;
}

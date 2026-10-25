import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Link, Stack, TextField, Typography } from '@mui/material';
import { useLogin } from 'react-admin';
import { supabase } from '../supabaseClient';
import { invalidateAdminAccess } from './authProvider';

type Stage = 'credentials' | 'totp' | 'checking';
export function LoginPage() {
  const login = useLogin();
  const [stage, setStage] = useState<Stage>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [factor, setFactor] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startMfa() {
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) throw aalError;
    if (aal?.currentLevel === 'aal2') {
      await finish();
      return;
    }
    const { data, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) throw factorsError;
    const existing = data?.totp?.find(f => f.status === 'verified');
    if (existing) {
      setFactor(existing.id);
      setStage('totp');
      return;
    }
    const enrolled = await supabase.auth.mfa.enroll({
      factorType: 'totp', friendlyName: 'AisenCore Admin',
    });
    if (enrolled.error || !enrolled.data) throw enrolled.error ?? new Error('无法注册 TOTP');
    setFactor(enrolled.data.id);
    setQrCode(enrolled.data.totp?.qr_code ?? null);
    setSecret(enrolled.data.totp?.secret ?? null);
    setStage('totp');
  }
  async function finish() {
    setStage('checking');
    // AuthProvider itself revalidates the signed aal2 JWT and current roster.
    await login({ ready: true }, '/');
    setQrCode(null);
    setSecret(null);
    setPassword('');
  }
  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) {
        void startMfa().catch(err => {
          if (mounted) { setStage('credentials'); setError(String(err.message || err)); }
        });
      }
    });
    return () => { mounted = false; };
    // We only attempt re-entry once on mount, never challenge per navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitCredentials(event: React.FormEvent) {
    event.preventDefault(); setError(null); setBusy(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      setPassword('');
      await startMfa();
    } catch (err) { setError(err instanceof Error ? err.message : '登录失败'); }
    finally { setBusy(false); }
  }
  async function submitTotp(event: React.FormEvent) {
    event.preventDefault(); if (!factor) return;
    setError(null); setBusy(true);
    try {
      if (!/^\d{6}$/.test(otp)) throw new Error('请输入 6 位动态验证码');
      const { error: verificationError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor, code: otp,
      });
      if (verificationError) throw verificationError;
      setOtp('');
      await finish();
    } catch (err) { setError(err instanceof Error ? err.message : '验证码不正确'); }
    finally { setBusy(false); }
  }
  async function cancel() {
    invalidateAdminAccess();
    await supabase.auth.signOut({ scope: 'local' });
    setStage('credentials'); setFactor(null); setSecret(null); setQrCode(null);
    setPassword(''); setOtp(''); setError(null);
  }
  return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', px: 2, py: 6, bgcolor: 'background.default' }}>
    <Card variant="outlined" sx={{ width: '100%', maxWidth: 440 }}>
      <CardContent sx={{ p: 4 }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h5" component="h1">AisenCore 管理平台</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              {stage === 'totp' ? '验证管理账号的动态口令' : '使用平台管理员身份登录'}
            </Typography>
          </Box>
          {error && <Alert severity="error" role="alert">{error}</Alert>}
          {stage === 'checking' ? <CircularProgress aria-label="正在验证管理员登录状态" /> : stage === 'credentials' ?
            <Box component="form" onSubmit={submitCredentials}>
              <Stack spacing={2}>
                <TextField label="邮箱" type="email" value={email} autoComplete="username"
                  onChange={event => setEmail(event.target.value)} required />
                <TextField label="密码" type="password" value={password} autoComplete="current-password"
                  onChange={event => setPassword(event.target.value)} required />
                <Button variant="contained" type="submit" disabled={busy}>{busy ? '验证中…' : '继续'}</Button>
              </Stack>
            </Box> :
            <Box component="form" onSubmit={submitTotp}>
              <Stack spacing={2}>
                {secret && <Alert severity="info">首次使用：用身份验证器扫描二维码，或手动输入密钥。请妥善保存密钥。</Alert>}
                {qrCode && <Box component="img" src={qrCode} alt="TOTP 绑定二维码"
                  sx={{ maxWidth: 220, alignSelf: 'center' }} />}
                {secret && <Typography variant="body2" sx={{ overflowWrap: 'anywhere', fontFamily: 'monospace' }}>{secret}</Typography>}
                <TextField label="6 位动态验证码" value={otp} autoComplete="one-time-code"
                  slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6, pattern: '[0-9]{6}' } }}
                  onChange={event => setOtp(event.target.value.replace(/\D/g, ''))} required />
                <Button variant="contained" disabled={busy} type="submit">完成双因素认证</Button>
                <Button onClick={() => void cancel()} disabled={busy}>返回登录</Button>
              </Stack>
            </Box>}
          <Link href="/auth/reset-password" underline="hover">忘记密码？</Link>
        </Stack>
      </CardContent>
    </Card>
  </Box>;
}

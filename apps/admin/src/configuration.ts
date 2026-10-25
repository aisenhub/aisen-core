/** Public client-only Vite settings. No secrets or fallback service credentials. */
export function getConfigurationProblem(): string | null {
  const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!rawUrl || !publicKey || publicKey === 'YOUR_LOCAL_PUBLISHABLE_KEY') {
    return '尚未配置 Supabase 地址或 Publishable Key。';
  }
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol');
  } catch {
    return 'Supabase URL 不是有效的 http(s) 地址。';
  }
  if (publicKey.startsWith('sb_secret_')) {
    return '检测到 Secret Key：严禁将它配置到浏览器应用。';
  }
  // Legacy Supabase JWTs may also have a service_role claim. Reject these
  // before the bundle imports the actual Supabase client.
  const jwtParts = publicKey.split('.');
  if (jwtParts.length === 3) {
    try {
      const base64 = jwtParts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64)) as { role?: string };
      if (payload.role === 'service_role') {
        return '检测到 service_role 密钥：请改用 Publishable/anon 公钥。';
      }
    } catch {
      return 'Supabase 连接密钥不是有效的 JWT；请核对 Publishable Key。';
    }
  }
  return null;
}

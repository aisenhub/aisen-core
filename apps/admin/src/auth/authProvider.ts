import type { AuthProvider } from 'react-admin';
import { supabase } from '../supabaseClient';

let checkedAt = 0;
let cachedUserId: string | null = null;
let cachedToken: string | null = null;
let validAdmin = false;
const NAV_TTL_MS = 8_000;
let accessEpoch = 0;
let pendingCheck: { token: string; promise: Promise<void> } | null = null;

export function invalidateAdminAccess() {
  accessEpoch++;
  pendingCheck = null;
  checkedAt = 0;
  cachedUserId = null;
  cachedToken = null;
  validAdmin = false;
}

export async function requireAdmin(refresh = false): Promise<void> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) throw new Error('请登录管理账号');
  // AAL is read locally from the current signed session; no repeated MFA challenge.
  const { data: level, error: levelError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (levelError || level?.currentLevel !== 'aal2') {
    invalidateAdminAccess();
    throw new Error('管理操作需要完成 TOTP 双因素认证');
  }
  // Forced verification must not reuse a previous allow decision, including
  // one still in flight. Every caller has already checked its own AAL2 session.
  if (refresh) invalidateAdminAccess();
  if (!refresh && validAdmin && cachedUserId === session.user.id &&
      cachedToken === session.access_token && Date.now() - checkedAt < NAV_TTL_MS) return;
  const token = session.access_token;
  if (!refresh && pendingCheck?.token === token) return pendingCheck.promise;
  const epoch = accessEpoch;
  const promise = (async () => {
    const { data, error } = await supabase.rpc('admin_check_access');
    // A late allow or deny must not overwrite a new login / logout / refresh.
    // Re-check the current token as an extra safeguard against auth transitions
    // between the first getSession()/AAL2 check and the server RPC response.
    if (epoch !== accessEpoch) throw new Error('管理员身份状态已变化，请重新验证');
    const { data: { session: latest }, error: latestError } = await supabase.auth.getSession();
    if (epoch !== accessEpoch || latestError || !latest ||
        latest.user.id !== session.user.id || latest.access_token !== token) {
      throw new Error('管理员会话已变化，请重新验证');
    }
    if (error || !data?.allowed) {
      invalidateAdminAccess();
      throw new Error(error?.message || '当前账号没有平台管理权限');
    }
    checkedAt = Date.now();
    cachedUserId = session.user.id;
    cachedToken = token;
    validAdmin = true;
  })();
  pendingCheck = { token, promise };
  try { await promise; }
  finally { if (pendingCheck?.promise === promise) pendingCheck = null; }
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' ||
      event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') invalidateAdminAccess();
});

export const authProvider: AuthProvider = {
  login: async (params: { ready?: boolean }) => {
    if (!params.ready) throw new Error('请使用受保护的登录与 MFA 流程');
    await requireAdmin(true);
  },
  logout: async () => {
    invalidateAdminAccess();
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
    return '/login';
  },
  checkAuth: () => requireAdmin(),
  checkError: async (error: { status?: number }) => {
    if (error?.status === 401 || error?.status === 403) {
      invalidateAdminAccess();
      throw error;
    }
  },
  getIdentity: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('请登录');
    return { id: session.user.id, fullName: session.user.email ?? session.user.id };
  },
  getPermissions: async () => {
    await requireAdmin();
    return 'admin';
  },
  canAccess: async () => {
    try { await requireAdmin(); return true; }
    catch { return false; }
  },
};

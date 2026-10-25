import type { AuthProvider } from 'react-admin';
import { supabase } from '../supabaseClient';

let checkedAt = 0;
let cachedUserId: string | null = null;
let validAdmin = false;
const NAV_TTL_MS = 8_000;

export function invalidateAdminAccess() {
  checkedAt = 0;
  cachedUserId = null;
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
  if (!refresh && validAdmin && cachedUserId === session.user.id &&
      Date.now() - checkedAt < NAV_TTL_MS) return;
  const { data, error } = await supabase.rpc('admin_check_access');
  if (error || !data?.allowed) {
    invalidateAdminAccess();
    throw new Error(error?.message || '当前账号没有平台管理权限');
  }
  checkedAt = Date.now();
  cachedUserId = session.user.id;
  validAdmin = true;
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') invalidateAdminAccess();
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

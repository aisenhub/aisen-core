import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !publicKey) {
  throw new Error('缺少 Supabase 公开连接配置；参照 apps/admin/.env.example');
}
// A public publishable key, never a service_role/secret key.
export const supabase = createClient(url, publicKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
});

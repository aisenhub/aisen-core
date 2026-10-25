import type { DataProvider, RaRecord } from 'react-admin';
import { supabase } from '../supabaseClient';
import { invalidateAdminAccess } from '../auth/authProvider';

const columns: Record<string, { table: string; id: string; fields: string }> = {
  products: { table: 'products', id: 'id', fields: 'id,product_key,name,description,status,created_at,updated_at' },
  memberships: { table: 'product_memberships', id: 'id', fields: 'id,user_id,product_id,status,pre_suspend_status,joined_at,updated_at' },
  grants: { table: 'entitlement_grants', id: 'id', fields: 'id,user_id,product_id,tier,source_type,grant_mode,requested_duration_days,starts_at,ends_at,revoked_at,created_at' },
  'code-batches': { table: 'redemption_code_batches', id: 'id', fields: 'id,product_id,tier,created_by,request_id,quantity,grant_duration_days,is_lifetime,max_redemptions_per_code,code_expires_at,note,created_at' },
  codes: { table: 'admin_redemption_code_summaries', id: 'id', fields: 'id,batch_id,batch_ordinal,code_prefix,product_id,tier,grant_duration_days,is_lifetime,max_redemptions,redeemed_count,expires_at,created_by,created_at,revoked_at' },
  redemptions: { table: 'redemptions', id: 'id', fields: 'id,code_id,user_id,product_id,grant_id,created_at' },
  admins: { table: 'platform_admins', id: 'user_id', fields: 'user_id,active,granted_by,created_at,updated_at' },
  restrictions: { table: 'platform_account_restrictions', id: 'user_id', fields: 'user_id,kind,reason_code,created_by,created_at' },
  'audit-logs': { table: 'admin_audit_log', id: 'id', fields: 'id,actor_user_id,action,target_type,target_id,before,after,reason,created_at' },
  'membership-events': { table: 'membership_events', id: 'id', fields: 'id,membership_id,action,from_status,to_status,actor_type,actor_user_id,reason_code,created_at' },
};

type AnyRecord = RaRecord & Record<string, unknown>;
function spec(name: string) {
  const value = columns[name];
  if (!value) throw new Error('不支持的数据资源：' + name);
  return value;
}
function recordOf(resource: string, item: Record<string, unknown>): AnyRecord {
  const conf = spec(resource);
  return { ...item, id: String(item[conf.id]) };
}
function asError(error: { message: string; code?: string; status?: number }): Error {
  const status = error.status ?? ({ PT401: 401, PT403: 403, PT409: 409, PT422: 422, '42501': 403, PGRST301: 401, PGRST302: 401 } as Record<string, number>)[error.code ?? ''];
  if (status === 401 || status === 403) invalidateAdminAccess();
  const labels: Record<string, string> = {
    PT401: '请重新登录', PT403: '需要有效管理员资格与 TOTP MFA',
    PT409: '记录状态已变化，请刷新后重试', PT422: '请核对输入内容',
  };
  return Object.assign(new Error(labels[error.code ?? ''] ?? error.message),
    { status, code: error.code });
}
export async function callRpc<T = Record<string, unknown>>(
  name: string, params: Record<string, unknown>,
): Promise<T> {
  const { data, error, status } = await supabase.rpc(name, params);
  // PostgrestError itself carries code/message, but the transport's HTTP
  // status belongs to the response. Losing it would turn a known HTTP 429
  // rejection into an UNKNOWN write and incorrectly block recovery flows.
  if (error) throw asError({ message: error.message, code: error.code, status });
  return data as T;
}

async function lookup(ids: string[], email?: string, page = 1, perPage = 50) {
  return callRpc<{ items: AnyRecord[]; total: number; has_more: boolean; search_incomplete: boolean }>(
    'admin_lookup_users', {
      p_user_ids: ids.length ? [...new Set(ids)] : null,
      p_email_exact: email ?? null, p_page: page, p_per_page: perPage,
    });
}
function filterRows(resource: string, filter: Record<string, unknown>) {
  const s = spec(resource);
  // Only mapped, explicitly permitted columns may reach PostgREST filters.
  const allowed = s.fields.split(',');
  return Object.entries(filter).filter(([key, value]) =>
    value !== '' && value !== null && value !== undefined &&
    (allowed.includes(key) || (key === 'id' && s.id !== 'id')));
}
async function listRecords(resource: string, opts: {
  pagination?: { page: number; perPage: number };
  sort?: { field: string; order: string };
  filter?: Record<string, unknown>;
}) {
  if (resource === 'users') {
    const email = String(opts.filter?.email ?? '').trim();
    if (!email && !opts.filter?.id) return { data: [], total: 0 };
    const result = await lookup(opts.filter?.id ? [String(opts.filter?.id)] : [], email || undefined,
      (opts.pagination?.page ?? 1), (opts.pagination?.perPage ?? 25));
    return { data: result.items, total: result.total };
  }
  const s = spec(resource);
  const allowed = s.fields.split(',');
  const field = (opts.sort?.field ?? 'id') === 'id' ? s.id : (opts.sort?.field ?? 'id');
  if (!allowed.includes(field)) throw new Error('不支持的排序字段');
  let query = supabase.from(s.table).select(s.fields, { count: 'exact' });
  for (const [key, value] of filterRows(resource, opts.filter ?? {})) {
    query = query.eq(key === 'id' ? s.id : key, value as string);
  }
  const offset = ((opts.pagination?.page ?? 1) - 1) * (opts.pagination?.perPage ?? 25);
  const { data, error, count } = await query.order(field, {
    ascending: (opts.sort?.order ?? 'ASC') === 'ASC',
  }).range(offset, offset + (opts.pagination?.perPage ?? 25) - 1);
  if (error) throw asError(error);
  return { data: (data as unknown as Record<string, unknown>[] ?? []).map(item => recordOf(resource, item)), total: count ?? 0 };
}

// React-admin DataProvider methods are generic over caller record types. This
// adapter returns the safe configured fields; React-admin owns the record type.
export const dataProvider = {
  getList: (resource, params) => listRecords(resource, params),
  getOne: async (resource, params) => {
    if (resource === 'users') {
      const result = await lookup([String(params.id)]);
      return { data: result.items[0] ?? { id: params.id, email: null } };
    }
    const s = spec(resource);
    const { data, error } = await supabase.from(s.table).select(s.fields)
      .eq(s.id, String(params.id)).single();
    if (error) throw asError(error);
    return { data: recordOf(resource, data as unknown as Record<string, unknown>) };
  },
  getMany: async (resource, params) => {
    if (resource === 'users') {
      const results: AnyRecord[] = [];
      // DEC-06 hard cap: 100 UUIDs in one request. UI records may still
      // display UUID-only if Auth lookup fails, but never leak other identity.
      try {
        for (let i = 0; i < params.ids.length; i += 100) {
          const ids = params.ids.slice(i, i + 100).map(String);
          const page = await lookup(ids, undefined, 1, 100);
          const found = new Map(page.items.map(item => [String(item.id), item]));
          for (const id of ids) results.push(found.get(id) ?? { id, email: null });
        }
      } catch (error) {
        if ((error as { status?: number }).status === 403) throw error;
        return { data: params.ids.map(id => ({ id, email: null })) };
      }
      return { data: results };
    }
    const s = spec(resource);
    const { data, error } = await supabase.from(s.table).select(s.fields)
      .in(s.id, params.ids.map(String));
    if (error) throw asError(error);
    return { data: (data as unknown as Record<string, unknown>[] ?? []).map(item => recordOf(resource, item)) };
  },
  getManyReference: (resource, params) => listRecords(resource, {
    pagination: params.pagination, sort: params.sort,
    filter: { ...params.filter, [params.target]: params.id },
  }),
  create: async (resource, params) => {
    if (resource !== 'products') throw new Error('此资源必须走经过保护的专用操作');
    const item = await callRpc<AnyRecord>('admin_create_product', {
      p_product_key: params.data.product_key,
      p_name: params.data.name,
      p_description: params.data.description ?? null,
    });
    return { data: item };
  },
  update: async () => { throw new Error('请使用有明确确认步骤的受保护业务操作'); },
  updateMany: async () => { throw new Error('禁止批量直写业务表'); },
  delete: async () => { throw new Error('禁止直接删除业务事实'); },
  deleteMany: async () => { throw new Error('禁止批量删除业务事实'); },
} as DataProvider;

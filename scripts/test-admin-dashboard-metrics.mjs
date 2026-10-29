#!/usr/bin/env node
// Dashboard scope/stat semantics contract; SQL/AAL2 integration is tested separately.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const page=get('apps/admin/src/Dashboard.tsx');
const provider=get('apps/admin/src/data/dataProvider.ts');
const initialSql=get('supabase/migrations/20261029190000_admin_dashboard_metrics.sql');
const sql=get('supabase/migrations/20261029191000_admin_dashboard_new_pro_month.sql');
for(const card of ["title:'用户'","title:'订阅'","title:'反馈'"])
  assert.ok(page.includes(card),'missing card '+card);
assert.equal((page.match(/title:'(?:用户|订阅|反馈)'/g)??[]).length,3);
for(const key of ['normal_users','new_users_month','pro_members','new_pro_month',
  'open_feedback','new_feedback']) assert.ok(page.includes("key:'"+key+"'"));
assert.match(page,/本月新增 Pro 会员/);
assert.doesNotMatch(page,/本月新增反馈|new_feedback_month/);
assert.doesNotMatch(provider,/new_feedback_month/);
assert.match(sql,/'new_pro_month',v_new_pro/);
assert.doesNotMatch(sql,/'new_feedback_month'/);
assert.match(sql,/SELECT count\(\*\) INTO v_new_pro/);
assert.match(sql,/GROUP BY g.user_id/);
assert.match(sql,/min\(greatest\(g.created_at,g.starts_at\)\)/);
assert.match(sql,/g.starts_at<=v_now/);
assert.match(sql,/p_product_id IS NULL OR g.product_id=p_product_id/);
assert.match(initialSql,/CREATE FUNCTION private\.admin_dashboard_metrics_core/);
assert.match(sql,/CREATE OR REPLACE FUNCTION private\.admin_dashboard_metrics_core/);
assert.match(page,/useGetOne<DashboardTotals>\('dashboard-metrics',\{id:currentScope\}/);
assert.match(page,/const currentScope=product\|\|'all'/);
assert.match(page,/stats\.data\?\.id===currentScope/);
assert.doesNotMatch(page,/const (?:products|members|grants|batches|feedback)=useGetList/);
assert.match(provider,/resource === 'dashboard-metrics'/);
assert.match(provider,/admin_dashboard_metrics/);
assert.match(provider,/Number\.isSafeInteger/);
assert.match(sql,/PERFORM private\.require_admin\(\)/);
assert.match(sql,/FROM auth\.users u/);
assert.match(sql,/count\(DISTINCT m\.user_id\)/);
assert.match(sql,/private\.pro_credit_summary/);
assert.match(sql,/FROM public\.admin_feedback_summaries f/);
assert.match(sql,/queue_state IN \('inbox','workbench'\)/);
assert.match(sql,/queue_state='inbox'/);
assert.match(sql,/Asia\/Shanghai/);
assert.match(sql,/p_product_id IS NULL OR f\.product_id=p_product_id/);
assert.match(initialSql,/GRANT EXECUTE ON FUNCTION public\.admin_dashboard_metrics\(uuid\) TO authenticated/);
assert.match(sql,/REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor/);
console.log('ADMIN_DASHBOARD_THREE_METRICS_STATIC PASS (real AAL2/browser requires separate validation)');

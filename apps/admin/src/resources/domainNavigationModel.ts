// Task-level navigation definitions. Keep shared data separate from the
// React component so Vite Fast Refresh only sees components in TSX modules.
export const domainViews={
  management:{title:'平台管理',views:[['products','产品'],['audit-logs','管理审计'],['admins','管理员权限']]},
} as const;
export type DomainResourceName =
  'products'|'memberships'|'users'|'membership-events'|'grants'|
  'audit-logs'|'admins'|'feedback';
export const domainFor:Partial<Record<DomainResourceName,keyof typeof domainViews>>={
  products:'management','audit-logs':'management',admins:'management',
};

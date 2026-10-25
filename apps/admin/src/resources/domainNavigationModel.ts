// Task-level navigation definitions. Keep shared data separate from the
// React component so Vite Fast Refresh only sees components in TSX modules.
export const domainViews={
  people:{title:'用户',views:[['memberships','成员关系'],['users','查找账号']]},
  redemption:{title:'兑换码',views:[['code-batches','发行批次'],['codes','兑换码记录'],['redemptions','核销记录']]},
  management:{title:'平台管理',views:[['products','产品'],['audit-logs','管理审计'],['restrictions','账号限制'],['admins','管理员权限']]},
} as const;
export type DomainResourceName =
  'products'|'memberships'|'users'|'membership-events'|'grants'|
  'code-batches'|'codes'|'redemptions'|'audit-logs'|'restrictions'|'admins';
export const domainFor:Partial<Record<DomainResourceName,keyof typeof domainViews>>={
  memberships:'people',users:'people',
  'code-batches':'redemption',codes:'redemption',redemptions:'redemption',
  products:'management','audit-logs':'management',restrictions:'management',admins:'management',
};

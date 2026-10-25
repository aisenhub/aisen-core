// Present readable admin activity without discarding the original audit fact.
// Unknown actions remain visible as their source code for traceability.
const actions:Record<string,string>={
  admin_create_product:'创建产品',
  admin_set_product_status:'变更产品状态',
  admin_suspend_membership:'暂停成员',
  admin_restore_membership:'恢复成员',
  admin_grant_entitlement:'授予 Pro 权益',
  admin_revoke_grant:'撤销 Pro 授权',
  admin_create_codes:'发行兑换码',
  admin_revoke_code:'撤销兑换码',
  admin_revoke_batch:'撤销兑换码批次',
  admin_block_account:'封禁平台账号',
  admin_unblock_account:'解除平台封禁',
  admin_grant_admin:'授予管理员资格',
  admin_revoke_admin:'撤销管理员资格',
  demo_fixture_preview:'演示审计记录',
  join:'加入成员',leave:'退出成员',suspend:'暂停成员',restore:'恢复成员',
};
const targets:Record<string,string>={
  product:'产品',user:'用户账号',membership:'成员关系',grant:'Pro 授权',
  entitlement_grant:'Pro 授权',redemption_code:'兑换码',
  redemption_code_batch:'兑换码批次',admin:'管理员',
};
export const auditActionLabel=(code:unknown)=>{
  const key=String(code??'').trim();
  return actions[key]??(key||'管理操作');
};
export const auditTargetLabel=(code:unknown)=>{
  const key=String(code??'').trim();
  return targets[key]??(key||'业务对象');
};

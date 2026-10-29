# CORE-FEEDBACK-001｜反馈联系邮箱

2026-10-29 用户授权本地双仓实施；**字段、Edge、可信RPC、Admin详情/复制及ZIP隐私已实现**。现行合同唯一维护于[需求](../../spec/requirements.md#用户反馈-v3四队列轻量处理--私有图片--可选内容-zip)与[反馈领域](../../architecture/domains/user-feedback.md)，Lens施工及完整矩阵见其 `docs/plans/2026-10-28_user-acceptance-ui-review/IMPLEMENTATION_PLAN.md`。本项不表示第一阶段签收或线上部署。

## 审查结论与决定

- 联系邮箱是单条反馈的提交快照，不是登录邮箱或邮箱所有权证明。真实user_id只取已验证JWT，注册邮箱仍须确认；反馈不要求Pro/active成员，不自动加入产品。
- 新multipart必填contact_email；去首尾空白，最多254个ASCII字符，单一local@domain格式，拒绝空白/控制字符/多地址/无域名点，保留大小写。正文/分类/邮箱/图片一起参加同号比较；更改返回409，不覆盖原记录。
- 唯一可信提交签名为 `feedback_submit_from_edge(uuid,text,uuid,text,text,jsonb,text)`，最后参数为联系邮箱；Edge使用具名参数。旧六参签名移除，全部现有RPC调用者/夹具同改，无兼容包装或账户邮箱补齐。
- Admin详情仅在getOne附取联系邮箱，普通列表不扩张PII字段；RLS继续要求当前AAL2管理员。复制只有真实剪贴板成功才提示。身份敏感导出选项同时包含联系邮箱，默认false时JSONL/Markdown均排除；不进入普通日志和审计快照。
- 本地已有两条反馈完整保留，不转换、补齐或删除。存储允许事实缺失，可信新提交强制校验；没有旧客户端入口或旧记录展示兜底。直接修订现行SQL真源并应用本地DDL，没有新建数据迁移或重置数据库。全新空库重放全部SQL本轮未执行。
- 不增加自动发邮件、回复、注销或工单中心。

## 实施顺序与验证

1. 文档先冻结新合同；新增Edge缺失/非法邮箱失败测试；补授权投影/幂等/导出断言。
2. 修订当前表字段、六处顺序SQL中的同一可信函数定义和公共薄代理，保持原锁、权限、限流、图片一致性与事务。
3. Edge校验、提交字段；Admin详情受限读取与复制；ZIP显式敏感字段。
4. Lens真实JWT与单独联系地址/分类，0/2图、丢回执重放；Admin AAL2详情/剪贴板及四队列回归。

已运行：

- `014_feedback_contact.test.sql`：15/15；新写/重放/邮箱及类别变更409/格式/身份不变/无成员写入/普通及撤权管理员不可读/无旧签名。
- `009_feedback_rpcs.test.sql` 60/60、`013_feedback_scoped_recovery.test.sql` 24/24；均在回滚事务内。
- Deno联系邮箱、ZIP、正式提交service隔离HTTP与S3：6/6；缺失邮箱用例修复前失败、修复后通过。
- `node scripts/test-f07-edge-images-local-s3.mjs`：EXIT0；真实Lens独立邮箱/分类→JWT→Edge→DB，双图/丢回执同号200/私图隔离/AAL2 ZIP/故障恢复通过，原管理员/平台/非QA记录保留。
- Admin类型、Lint和构建EXIT0；`AISENCORE_UIQA_PHASE=operations-feedback` EXIT0；真实AAL2详情与系统剪贴板地址一致，四队列、实际409及内部事件/审计通过，专用QA清理后原业务基线恢复。

真实Cloudflare R2、人工读屏/所有者视觉签收及线上配置不由本地自动化替代。没有提交、推送或云端变更。

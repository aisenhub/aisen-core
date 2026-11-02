# 已确认账号自动关联当前产品实施计划

> 所有者2026-11-02确认并授权：从Lens注册并完成邮箱确认后自动关联AisenLens，默认Free；兑换码只负责Pro。覆盖正常登录与已确认会话恢复，避免同一账号因入口不同仍缺成员。仅本地双仓实施，无Git推送/部署/清库授权。

## 单一合同

- 未确认注册不建成员；确认后的当前产品会话通过现有`ensure_membership('aisenlens')`幂等建立active成员和一次join事件，不创建Grant/核销/信用。无既有权益时为Free，既有Pro不因关联/登录降级或被改写。
- 仅当前产品关联，不使用用户metadata或邮件参数选择任意产品，不注册即关联全部产品。
- active重复登录/刷新/多标签不重复创建；left仍需本人显式rejoin；suspended、blocked、产品暂停不绕过。
- Core查询保持只读；Lens认证接入负责关联，关联服务失败不假报Free或兑换要求，保留身份与本机数据并允许重试。
- 复用现有受保护RPC、锁序和唯一键，不增加Auth触发器、业务服务或批量补数据。旧已确认账号通过正常会话接入当前规则。

## 步骤与验收

| 步骤 | 工作 | 必须验证 | 状态 |
| --- | --- | --- | --- |
| M1 文档 | 同步Core需求/身份/生命周期/API及Lens ACCOUNT-02，清除相反的现行描述 | 无“登录不关联”与新合同并存 | PASS，当前合同/索引/历史取代说明已同步 |
| M2 红测试 | 修改真实注册邮件浏览器用例，确认前0/确认后1、Free、单次join、无Grant、跨产品0 | 修复前确认后成员断言失败 | PASS，真实确认后成员为0导致失败 |
| M3 最小实现 | Lens确认/登录/会话恢复接现有ensure；更新不准确的兑换关联提示 | 身份切换安全；服务故障可重试；正常Free展示 | PASS，复用Core原RPC无SQL变更 |
| M4 回归 | 邮件/注册/登录、权益兑换、left/rejoin/suspended、跨标签隔离及Core SQL | 真实JWT/浏览器及负例通过；当前用户/管理员/产品保全 | PASS，含完整真实F07 |
| M5 准出 | Lens类型/Lint/Build及双仓链接，更新计划/TODO及清理精确QA | 报告真实失败/未测范围，不把云/人工门禁关闭 | 专项PASS；整仓verify:web被并行AI类型错误阻塞 |

## 执行记录

- 施工前当前用户已确认但无成员，管理员和AisenLens存在；不直接SQL补成员，最终通过正式客户端路径验证。
- Core现有change_my_membership_core已具备首次唯一创建、active幂等、left/suspended拒绝、blocked和产品状态检查；优先复用，是否需要SQL变更由行为测试决定。
- 红测试：真实Lens注册→Mailpit→独立Chrome邮箱确认成功，新增确认后Free成员断言失败（成员0）；精确QA清理通过。随后才修改Lens认证接入，Core无需新增表/触发器/迁移。
- 真实邮件/独立浏览器回归EXIT0：确认前0、确认后仅Lens active1，Grant/核销0，恢复后join1；无证明重置/恢复/重放拒绝通过。旧无成员断言与QA清理调用链已同步。
- 真实权益Chrome EXIT0：登录Free无需兑换；ensure503不显示Free，手动重试恢复且join1；兑换后Pro、跨产品码拒绝不消耗；撤授Free、永久/重复保护、blocked、left显式rejoin、suspended仅Admin恢复、同账号刷新不锁Key、跨标签迟到响应与账号/Pro隔离、local/global会话均通过。响应式首次测试在断点切换期间读取尚未挂载DOM失败，修为等待真实布局挂载后原溢出断言通过；不是放宽界面验收。
- 正式持续运行8443复用测试EXIT0：真实登录仅Lens Free，无Grant，暖启动离线编辑/重连身份和本机项目保持、join1；以精确QA清理保留原用户/产品，不再要求历史两产品/空用户基线。Core16组SQL543/543独立事务回滚PASS，8项权益解析/分页/拒绝测试PASS。
- Lens全量Lint、全量typecheck复跑与WebApp/WebHome构建PASS；构建已有WASM node:module外置/插件耗时警告。第一次typecheck因并行AI开发的project/types.ts缺AIBatchRootTaskRecord失败，未修改该领域，该领域随后自行修复后复跑通过。测试运行有Node缺根type:module提示，未改构建系统消除无关告警。
- 当前用户通过正式Lens会话接入已自动关联aisenlens active，初次关联时join1/Grant0，无直接SQL补写；管理员和产品身份保全。随后观察到原管理员另行授予7天Pro，source_type=admin，该真实授权已保留；不能把它归为自动关联授予。最终账号2/Admin1/产品1/成员1/Grant1，核销0/反馈0/QA账号0。未清空真实用户或本机数据。
- 完整F07复验EXIT0：正式8443 Lens双图→GoTrue→真实Edge→隔离S3→DB及旧回归全过，含用户图片/缩略图权限、AdminZIP字节/首次已读竞争/缺图503/在途撤权/断连、提交ACK丢失/第二图PUT恢复、0/1/2图永久删除/503恢复/删除ACK丢失，临时QA清理PASS，真实成员/授权保全。临时functions/.env已清理，原运行服务仍在。
- i18n中英24/24和权益解析8/8通过；Core全部543项SQL回滚通过。链接校验：Core106份/997链接/17锚点错误0，Lens125份/2030链接错误0；双仓git diff --check通过。
- 当前用户浏览器已确认真实会话；该浏览器项目列表另有独立加载失败，未用清库/修改本机项目处理。Free权益界面使用隔离真实Chrome/新QA项目验证，未把数据库记录核对冒充当前用户项目界面视觉验收。
- 最后追加运行完整verify:web：WebHome类型/Lint/Build通过，WebApp类型阶段因并行修改的features/ai/hooks/useAIShotCameraWorkbench.ts:436缺fields名称失败；后续WebApp构建/边界/设计门禁未在这条命令继续执行。此前独立类型检查和两站构建的PASS为其执行时快照；当前整仓准出不能标PASS。未修改该AI文件/弱化门禁，待其所属施工修复后复跑。其他未测：真实云SMTP/R2、跨物理设备、全站人工读屏/视觉，未提交/推送/部署。

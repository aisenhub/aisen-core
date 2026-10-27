# Admin 性能第二阶段：真实加载与交互优化施工计划｜2026-10-26

> **实施中；不是总验收通过。** 前序依据：[全面审查](./admin-frontend-performance-review-2026-10-26.md)、[首轮 O0～O3 专项计划](./admin-frontend-performance-optimization-plan-2026-10-26.md)。工作区为 main 且已有未提交代码、计划和证据；仅实施本地安全改动，不提交、推送、部署，不修改生产/真实业务数据。此前临时 AAL2 测试只对测试身份做一次性创建与清理。

## 目标与现状

这轮把重点由“加载时可见”推进为“**为什么慢、何时可用、连续操作是否正确且快速**”。已验证29个 AAL2 受控等待场景和5类 Auth 在途单测，但不能当作真实耗时、非零记录数、线上P75/P95/INP、完整WCAG或数据规模验收。匿名登录网络150ms/1.6Mbps冷LCP中位约2932ms，仍高于2500ms目标；反馈标签在部分页面仍有2次RPC；所有通用数据列表使用 PostgREST `count:'exact'`，Dashboard五个KPI各独立请求；通用列表首次还有用户/产品映射的附加请求。

## 第二阶段优先次序与验收门禁

| 工作包 | 性能疑点与具体行动 | 验证与完成定义 | 当前 |
|---|---|---|---|
| **P1 S1 登录关键链** | 新增15次Chrome资源时间轴证据：MUI vendor约128KB传输，慢网先在约1.9秒完成后才开始App+Supabase请求，之后才获取LoginPage。试验延迟加载SetupScreen，将本轮基线模拟慢网LCP2948ms对比试验2968ms，未证实改善并撤回试验代码；保持错误态与MFA。 | 证据 `ui-evidence/admin-login-network-chain-2026-10-26.json` 和 `ui-evidence/admin-login-entry-split-2026-10-26.json`，每条件5次；下一步按有用依赖颗粒度优化并同场A/B。 | **瀑布图诊断PASS、试验无收益已回滚；慢网目标未达成** |
| **P1 S2 标签缓存和请求量** | `useFeedbackTags` 实施12秒/最多20项的成功结果缓存，令牌+产品隔离、auth改变清空、跨产品标签选择立即隔离。真实SPA同会话切换收件箱→处理→归档，首次标签RPC两次，后两次切换新增0次。 | 本地AAL2真实SPA测试 `node scripts/test-admin-perf-aal2-readonly.mjs --spa-tags` 退出0；证据 `ui-evidence/admin-perf-spa-tags-2026-10-26.json`。 | **同范围热切换PASS；冷进入双RPC、跨身份及跨产品联测开放** |
| **P1 S3 SPA连续操作与实数据** | 使用真实 SPA 路由（不能只用每次刷新）记录点击→状态、点击→真实行可操作、刷新/筛选/排序/页码/产品切换旧请求迟到。安全隔离合成 20 条数据与权限，不写真实业务。 | 五样本、真实非空行、CLS、INP可得则测、Profile提交次数；正确隔离是优先门禁。 | **待测** |
| **P1 S4 查询成本** | 在本地Postgres只读事务中查看计数和LIMIT/ORDER查询计划，样本仅8产品/48成员/1反馈；管理员超级用户视角，不代表AAL2/RLS。48行成员精确COUNT实际执行约0.310ms、最近20行实际执行约0.168ms，均Seq Scan；本地小样本没有证据证明需牺牲准确total或新增索引。 | 只读 `EXPLAIN (ANALYZE,BUFFERS)`；仍需隔离数据规模100/1000/10000、真实应用JWT/RLS时延及服务端计数响应。 | **本地小样本诊断PASS；容量与准确范围验收开放** |
| **P2 S5 取消与缓存范围** | 评估React-admin 5和Supabase v2 signal传递，区分只读/写入、不允许取消写入产生UNKNOWN风险。重点观察快速切页响应是否过时。 | 浏览器慢请求与失败/离线态负例 + 请求可取消证明；必要时谨慎调整 readonly。 | **待测** |
| **P2 S6 完整可用性** | 320/390/768/1440及200/400%缩放、读屏/键盘/加载头与数据行连续性；真实R2/ZIP、导出、长会话内存与P75/P95/INP。 | Chrome录屏filmstrip与人工辅助技术、测试数据和所有者视觉签收，任何未跑记NOT RUN。 | **开放** |

## 当前批次 S1 / S2 实施细则

**S1** 保留 `index.html` 无JS加载提示、配置错误SetupScreen和MFA；通过主入口代码拆分优化 `main→App` 的首次依赖关系。须保留按需路由模块和无需配置时不加载 Supabase。Build/Lint/路线拆包静态回归及隔离AAL2登录/加载测试必须PASS。不能将原生HTML提示当作真实LCP加速。

**S2** 首批受限实现：短12秒/至多20项的内存缓存，不持久化，仅缓存成功标签；Key含当前令牌和产品ID，登录/登出/令牌刷新清空缓存并持续检查请求完成后的当前令牌，切产品立即隐藏旧选中标签，避免 stale filter。现有React-admin虽然间接包含 TanStack Query，但将其作为Admin直接依赖的离线安装耗时70秒后中止、无锁文件更改，因此暂未新增依赖或强行采用第二个QueryClient；待有稳定依赖变更条件后统一接入内置查询系统。必须保留短TTL失效、身份隔离与错误语义。

## 结果记录与回滚

本计划每项只有源码/构建、AAL2业务浏览器、真实负载/人工签收三级各自PASS才算对应完成。命令：`pnpm build`、`pnpm lint`、`node scripts/test-d3-phase1-foundation.mjs`、`node scripts/test-admin-auth-inflight-race.mjs`、隔离Chrome对应专项脚本、`git diff --check`。计划和TODO需同步标注缺口。任何失败回滚本次新增最小改动，保留先前20+文件未提交成果，不做git reset/clean或数据库reset。

## 实施日志

| 日期 | 交付与证据 | 剩余 |
|---|---|---|
| 2026-10-26 | 确立网络关键路径、受限标签缓存、非空SPA交互、真实数据查询成本与签收的第二阶段工作包 | S1～S6后续逐项填写实测状态 |
| 2026-10-26 S2首批 | `useFeedbackTags.ts` 同令牌+产品请求结果12秒/20项有界缓存，`FeedbackV2.tsx` 标签作用域隔离；Build、Lint、29/29浏览器加载回归、权限并发单测PASS。补充同文档SPA `--spa-tags` 实测：冷入同范围标签2次，连续切处理/归档新增0次，退出0、QA清理PASS，证据 `ui-evidence/admin-perf-spa-tags-2026-10-26.json`。 | 冷进入两次不是零，不能声称全量去重；仍待跨产品与跨身份、短TTL到期负例；也未通过非空记录全流程 |
| 2026-10-26 S1实测与无收益试验 | 正式生产预览匿名冷加载 ×15，当前原入口模拟慢网LCP中位2948ms、FCP约200多ms；JS资源传输约394KB，mui-vendor约128KB在~1.9秒末完成，随后App+Supabase于~1.9–2.6秒到达，LoginPage约~2.8秒到达，证据 `ui-evidence/admin-login-network-chain-2026-10-26.json`。试验仅动态导入SetupScreen后，慢网中位2968ms（非交织A/B，不认为有收益），并将main.tsx还原到试验前。证据 `ui-evidence/admin-login-entry-split-2026-10-26.json`。 | 下一次必须针对公共UI依赖与chunk串行关键链优化；不准用本次无显著差异宣称LCP已提升，仍>2500ms |
| 2026-10-26 S4读权限重放前的SQL小样本 | 仅读本地Postgres、READ ONLY事务：8产品、48成员、1反馈。成员总数COUNT计划Seq Scan实际执行0.310ms，最近20成员ORDER/LIMIT执行0.168ms，均只触及少量缓冲页。**这些数字是超级用户/小表单次SQL，不含HTTP、JWT/RLS或Admin UI**。 | 无代表性100/1000/10000大规模数据，不准据此认为生产count已优化完成；尚需正式权限/索引基准 |

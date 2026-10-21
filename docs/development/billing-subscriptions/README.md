# 会员、兑换码与支付订阅开发专题

> 状态：文档结构和最小开发底线已明确；对接尚未实施，接口字段和库的选择均未定。

**当前顺序**：AisenCore **自有兑换码 → 爱发电（初期暂定） → 支付宝个体工商户支付（后期） → Stripe（更后期）**。不是同时建设四套支付系统。

## 本专题文档

| 文件 / 目录 | 用途 |
| --- | --- |
| [`references.md`](./references.md) | 官方 API、React-admin/Supabase 开发文档、成熟开源项目或案例的链接与适用性说明 |
| [`integration-guide.md`](./integration-guide.md) | 当前已确认的兑换码开发边界、爱发电对接步骤与安全/可靠性检查点；未定实现保持待确认 |
| [`templates/`](./templates/README.md) | 今后复用的接口、检查单、测试数据或文档模板；目前仅保留使用约定 |

本专题**不决定产品业务模型和架构**：需求以[唯一需求文件](../../spec/requirements.md)为准；支付来源、权益归属和系统边界以[计费与权益架构](../../architecture/domains/billing-and-entitlements.md)为准。
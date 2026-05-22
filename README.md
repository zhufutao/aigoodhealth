# AIGoodHealth

人工素材 + 权威素材双驱动的养生食谱内容生成后台。

## 已实现的 MVP 闭环

- 管理员登录：默认 `admin / admin123456`
- 人工素材录入
- 国家卫生健康委健康科普辟谣平台抓取入口
- S 级权威素材入库
- AI 素材解析接口，默认接入火山方舟，必须配置 `ARK_API_KEY` 才会执行真实生成
- 选题生成
- 公众号/小红书/海报/食谱内容包生成
- 健康内容风险审核
- 发布数据手动录入
- Cloudflare Pages + Functions + D1 部署

## 技术栈

- React + Vite
- Cloudflare Pages Functions
- Cloudflare D1
- 火山方舟 OpenAI 兼容 API
- @uiw/react-md-editor 开源 Markdown 编辑器

## 本地开发

```bash
npm install
npm run build
npm run db:migrate:local
npm run pages:dev
```

访问 `http://127.0.0.1:8788`。

## Cloudflare

1. 创建 D1：

```bash
npx wrangler d1 create aigoodhealth-db
```

2. 将返回的 `database_id` 写入 `wrangler.toml`。

3. 应用远端迁移：

```bash
npm run db:migrate:remote
```

4. 部署：

```bash
npm run cf:deploy
```

## 环境变量

建议在 Cloudflare Pages 中配置：

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `AI_PROVIDER`，默认 `ark`
- `ARK_API_KEY`
- `ARK_BASE_URL`，默认 `https://ark.cn-beijing.volces.com/api/v3`
- `ARK_MODEL`，默认 `doubao-seed-1-6-250615`，如果你的方舟控制台模型不同，请改成实际可用的模型/接入点 ID
- 可选：`OPENAI_API_KEY`、`OPENAI_MODEL`，当 `AI_PROVIDER=openai` 时使用

未配置对应模型服务的 Key 时，AI 解析、选题生成、内容生成、风险审核会明确报错，不会再用截取或模板冒充 AI 结果。

## 权威抓取说明

第一版权威来源为：

`https://www.nhc.gov.cn/kppypt/index.shtml`

该页面当前会对直接服务端抓取返回防护页面或 412。抓取器会先尝试平台地址；若平台页不暴露列表，会记录受限原因，并使用国家卫健委同域公开健康营养资料作为兜底种子，保证 MVP 流程可验证。

## 安全边界

健康内容必须保守表达，禁止“专治、根治、治愈、7天见效、湿气全无、排毒、刮油、神方、秘方”等表达。系统生成内容默认包含“不替代医疗建议”和特殊人群提醒。

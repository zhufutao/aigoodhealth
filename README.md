# AIGoodHealth

人工素材 + 权威素材双驱动的养生食谱内容生成后台。

## 已实现的 MVP 闭环

- 管理员登录：默认 `admin / admin123456`
- 人工素材录入
- 国家卫生健康委健康科普辟谣平台抓取入口
- S 级权威素材入库
- AI 素材解析接口，未配置 OpenAI 时使用保守规则兜底
- 选题生成
- 公众号/小红书/海报/食谱内容包生成
- 健康内容风险审核
- 发布数据手动录入
- Cloudflare Pages + Functions + D1 部署

## 技术栈

- React + Vite
- Cloudflare Pages Functions
- Cloudflare D1
- OpenAI API，可选

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
- `OPENAI_API_KEY`

未配置 `OPENAI_API_KEY` 时，系统仍能用规则兜底跑完整流程，但生成质量会弱一些。

## 权威抓取说明

第一版权威来源为：

`https://www.nhc.gov.cn/kppypt/index.shtml`

该页面当前会对直接服务端抓取返回防护页面或 412。抓取器会先尝试平台地址；若平台页不暴露列表，会记录受限原因，并使用国家卫健委同域公开健康营养资料作为兜底种子，保证 MVP 流程可验证。

## 安全边界

健康内容必须保守表达，禁止“专治、根治、治愈、7天见效、湿气全无、排毒、刮油、神方、秘方”等表达。系统生成内容默认包含“不替代医疗建议”和特殊人群提醒。

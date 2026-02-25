---
name: commercialization-plan
overview: 将 Super Project Agent 转化为商业化 SaaS 产品的完整路线图，包含支付接入、权限控制及推广准备。
todos:
  - id: tech-1
    content: 设计数据库 Schema 变更（增加会员字段）
    status: pending
  - id: tech-2
    content: 创建 Pricing 页面 UI 结构
    status: pending
  - id: tech-3
    content: 编写后端权限检查中间件 (Middleware/Helper)
    status: pending
isProject: false
---

# Super Project Agent 商业化与推广计划

## 第一阶段：技术准备（支付与权限）

目标：在代码层面支持“区分免费用户与付费用户”，并接入支付功能。

### 1. 数据库 Schema 升级

- 修改 `src/lib/db.ts` 和 `initDb`，在 `users` 表中增加会员相关字段：
  - `subscription_status` (TEXT): 'active', 'inactive', 'lifetime'
  - `subscription_plan` (TEXT): 'free', 'pro'
  - `subscription_end_date` (TEXT): ISO 日期
  - `stripe_customer_id` (TEXT): 用于关联支付平台用户

### 2. 接入支付网关 (Payment Gateway)

*建议选择：如果是面向国内用户，推荐“面包多”或“虎皮椒”等易接入平台；如果是面向国际/通用，推荐 Lemon Squeezy（支持支付宝/微信支付且处理税务）。本计划以 Lemon Squeezy 为例（开发体验好）。*

- 安装 Lemon Squeezy SDK 或相关依赖。
- 创建 `/api/payment/checkout` 接口：生成支付链接。
- 创建 `/api/payment/webhook` 接口：监听支付成功事件，自动更新数据库中的用户会员状态。

### 3. 实现权限控制逻辑 (Access Control)

- 创建 `src/lib/subscription.ts` 工具函数：
  - `checkUsageLimit(userId, feature)`: 检查用户是否达到免费额度。
- **限制项目数量**：
  - 在 `POST /api/projects` 中，先检查当前用户项目数。如果是免费用户且已满 3 个，拒绝创建并返回 403。
- **限制 AI 使用**：
  - 在 AI 建议相关接口中，增加每日/每月调用次数检查。
- **前端限制**：
  - 在 UI 上（如“新建项目”按钮旁）展示剩余额度。
  - 增加“升级 Pro”的引导弹窗组件。

### 4. 用户中心与定价页

- 新增 `/pricing` 页面：展示 Free vs Pro 的对比表格。
- 在 `/dashboard` 或设置页增加“我的订阅”板块，展示当前状态和续费/管理按钮。

---

## 第二阶段：推广素材准备 (Marketing Assets)

目标：利用现有的高颜值 UI 制作吸引人的宣传物料。

### 1. 视觉物料制作

- **Bento Grid 宣传图**：利用现有的 `DashboardPortfolio` 组件，截取填满数据（创业/工作/生活）的高清图，强调“一站式掌控”。
- **Halide 风格动效视频**：录制首页 3D 视差效果和鼠标交互的短视频（15秒内），用于小红书/Twitter。
- **对比图**：制作“普通待办清单” vs “Super Agent 甘特图”的对比，突出专业性。

### 2. 文案撰写 (Copywriting)

- **针对求职者**：“用管理千万级项目的思路来管理你的秋招/春招，拒绝焦虑。”
- **针对创业者/独立开发者**：“独立开发者的超级仪表盘，左手代码，右手生活。”
- **针对考研/考公党**：“WBS 拆解复习计划，甘特图可视化进度，AI 帮你找破局点。”

---

## 第三阶段：发布与冷启动 (Launch)

### 1. 种子用户获取

- **V2EX / 独立开发者社区**：发布“我做了一个高颜值的个人项目管理工具，求反馈”，发放 50 个 Pro 兑换码。
- **小红书**：发布笔记，带话题 #生产力工具 #Notion #时间管理 #高颜值APP。
- **Product Hunt**：准备英文文案，在 Product Hunt 上发布（需提前准备好演示视频）。

### 2. 持续运营

- 收集用户反馈，快速迭代（特别是 PWA 推送功能的稳定性）。
- 建立用户群（微信/Discord），增强粘性。


# 个人超级项目管理 Agent

基于 Next.js + TypeScript + Tailwind + Shadcn UI + Zustand 的多线程任务与甘特图管理应用。

## 功能概览

- **项目集大盘**：创业组 / 工作组 / 生活组分类、总进度、今日到期与逾期高亮
- **WBS 任务拆解**：层级录入、工期、依赖、状态（To Do / Doing / Done）
- **甘特图视图**：多轨甘特图、关键路径与项目类型配色
- **AI 破局建议**：基于未完成任务的一句话「今日破局点」

## 技术栈

- Next.js (App Router) + TypeScript
- Tailwind CSS + Shadcn UI
- Zustand（状态）
- Frappe Gantt（甘特图）
- 本地优先：LocalStorage，预留 Supabase/Firebase 接口

## 本地运行

### 1. 安装依赖（若 npm 报缓存权限错误，先执行）

```bash
sudo chown -R $(whoami) ~/.npm
```

### 2. 安装并启动

```bash
cd /Users/xuluyan/Documents/super-project-agent
npm install
npm run dev
```

浏览器打开 **http://localhost:3001**（本项目固定端口 3001，与 schema 室内设计站区分）。

## 部署到网上

要把应用部署到公网（而不是本地网址），按下面做即可：

1. **准备数据库（Turso）**  
   安装 [Turso CLI](https://docs.turso.tech/cli)，登录后创建数据库并拿到 **Database URL** 和 **Auth Token**：
   ```bash
   brew install tursodatabase/tap/turso   # macOS
   turso auth login
   turso db create super-project-agent --location hkg
   turso db tokens create super-project-agent
   ```

2. **把代码推到 GitHub**  
   在 GitHub 新建仓库，把本项目推上去（若已有仓库可跳过）。

3. **用 Vercel 部署**  
   - 打开 [vercel.com](https://vercel.com)，用 GitHub 登录  
   - **Add New → Project**，选择刚推送的仓库，直接 **Deploy**  
   - 部署完成后，在项目 **Settings → Environment Variables** 里添加：
     - `NEXTAUTH_SECRET`：终端执行 `openssl rand -base64 32` 得到的一串
     - `NEXTAUTH_URL`：你的站点地址，如 `https://xxx.vercel.app`（无末尾斜杠）
     - `TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN`：第 1 步拿到的
     - 若用 Google 登录：再填 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`，并把 Google 控制台里该应用的 **Authorized redirect URI** 加上 `https://你的域名/api/auth/callback/google`
   - 保存后回到 **Deployments**，对最新部署点 **Redeploy**，让环境变量生效

完成后访问 Vercel 给你的域名（如 `https://super-project-agent-xxx.vercel.app`）即为线上地址。

更详细的说明（含 Google OAuth 发布、自定义域名等）见 **[DEPLOY.md](./DEPLOY.md)**。

## 项目结构（核心）

```
src/
├── app/              # 页面与布局
├── components/       # 通用与业务组件
├── lib/              # 工具与存储适配
├── store/            # Zustand 状态
└── types/            # TS 类型
```

## 后续扩展

- 接入 Supabase/Firebase 做多端同步
- AI 破局建议可对接 OpenAI / 本地 LLM API

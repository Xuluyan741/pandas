# 部署说明（Vercel + Turso）

本应用使用 **Turso**（基于 SQLite 的云数据库）持久化用户与项目/任务数据，使用 **Vercel** 部署前端与 API。

## 一、Turso 数据库

### 1. 安装 Turso CLI 并登录

```bash
# macOS
brew install tursodatabase/tap/turso

# 登录（会打开浏览器）
turso auth login
```

### 2. 创建数据库

```bash
# 创建数据库（区域选离用户近的；先运行 turso db locations 查看当前支持列表）
# 亚太可选：aws-ap-northeast-1(东京)、aws-ap-south-1(孟买)；默认 aws-eu-west-1(爱尔兰)
turso db create super-project-agent --location aws-ap-northeast-1

# 查看连接信息
turso db show super-project-agent
turso db tokens create super-project-agent
```

记下：

- **Database URL**：形如 `libsql://super-project-agent-xxx.turso.io`
- **Auth Token**：创建 token 后显示的一串密钥

### 3. 本地验证（可选）

在项目根目录 `.env.local` 中配置：

```env
TURSO_DATABASE_URL=libsql://super-project-agent-xxx.turso.io
TURSO_AUTH_TOKEN=你的 Auth Token
```

然后执行 `npm run dev`，注册/登录并创建项目与任务，刷新后数据应仍在（说明已连上 Turso）。

---

## 二、Vercel 部署

### 1. 推送代码并导入项目

- 将代码推送到 GitHub/GitLab/Bitbucket
- 打开 [Vercel](https://vercel.com) → Add New → Project → 导入该仓库
- 构建命令与输出目录使用默认（Next.js 自动识别）即可

### 2. 环境变量

在 Vercel 项目 **Settings → Environment Variables** 中配置（生产与预览环境建议都填）：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `NEXTAUTH_SECRET` | NextAuth 加密用，生产务必随机 | `openssl rand -base64 32` 生成 |
| `NEXTAUTH_URL` | 站点完整 URL（无末尾斜杠） | `https://你的域名.vercel.app` |
| `TURSO_DATABASE_URL` | Turso 数据库 URL | `libsql://xxx.turso.io` |
| `TURSO_AUTH_TOKEN` | Turso 数据库 Auth Token | 在 Turso CLI 中创建 |
| `GOOGLE_CLIENT_ID` | Google OAuth 客户端 ID | 来自 Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 客户端密钥 | 同上 |
| `NEXT_PUBLIC_GOOGLE_ENABLED` | 是否显示 Google 登录 | `true` |

**各变量填写说明：**

| 变量名 | 填什么 |
|--------|--------|
| `NEXTAUTH_SECRET` | 终端执行 `openssl rand -base64 32`，把输出整段复制进去（生产环境用新的，不要和本地相同） |
| `NEXTAUTH_URL` | 部署后的访问地址：先随便填 `https://super-project-agent.vercel.app`，部署完成若 Vercel 给了不同域名，再改为此域名（无末尾斜杠） |
| `TURSO_DATABASE_URL` | 与本地 `.env.local` 里一致，即 `libsql://super-project-agent-xuluyan.aws-ap-northeast-1.turso.io` |
| `TURSO_AUTH_TOKEN` | 与本地 `.env.local` 里一致，或运行 `turso db tokens create super-project-agent` 新生成一个填进去 |
| `GOOGLE_CLIENT_ID` | 与本地一致，即 Google Cloud Console 里 OAuth 客户端的「客户端 ID」 |
| `GOOGLE_CLIENT_SECRET` | 与本地一致，即同一 OAuth 客户端的「客户端密钥」 |
| `NEXT_PUBLIC_GOOGLE_ENABLED` | 需要 Google 登录填 `true`，不需要填 `false` |

部署后首次访问会执行建表（`initDb`），无需手动迁移。

---

## 三、Google OAuth 生产配置

若希望**其他人**也能用 Google 登录（而不只是你自己）：

### 1. 添加生产回调 URL

在 [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → 你的 OAuth 2.0 客户端 ID：

- **Authorized redirect URIs** 中新增：  
  `https://你的域名.vercel.app/api/auth/callback/google`
- 若有自定义域名，再添加：  
  `https://你的自定义域名/api/auth/callback/google`

保存。

### 2. 发布 OAuth 同意屏幕（让他人可登录）

- 进入 **APIs & Services → OAuth consent screen**
- 若当前为「Testing」：将 **Publishing status** 改为 **PUBLISH APP**
- 发布后，任何拥有 Google 账号的用户都可使用「通过 Google 登录」（仍受你配置的 redirect URI 限制）

仅自己用时，可保持 Testing，并把测试用户列表里加上自己的邮箱。

---

## 四、可选：恢复首页登录保护

当前为「演示模式」：未登录也可访问首页（仅看示例数据）。若希望未登录用户必须先去登录页：

1. 打开 `src/middleware.ts`
2. 将 `matcher` 从 `[]` 改回 `["/"]`（或你希望保护的路径），例如：

   ```ts
   export const config = { matcher: ["/"] };
   ```

保存后重新部署即可。

---

## 五、小结

- **Turso**：提供 `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`，本地与 Vercel 共用同一库即可持久化。
- **Vercel**：配置上述环境变量，部署后 `NEXTAUTH_URL` 使用实际访问域名。
- **Google**：生产 redirect URI + 需要时「发布」OAuth 同意屏幕，其他人即可用 Google 登录。

如有自定义域名，在 Vercel 中绑定后，记得把 `NEXTAUTH_URL` 和 Google 的 redirect URI 都改为该域名。

---

## 六、每日推送（Web Push，可选）

要让用户**不打开网页也能收到**「今日最重要事项」手机通知，需配置 Web Push 与定时任务。

### 1. 生成 VAPID 密钥

```bash
npx web-push generate-vapid-keys
```

将输出的 **Public Key** 填到 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`，**Private Key** 填到 `VAPID_PRIVATE_KEY`（仅服务端，勿泄露）。

### 2. Vercel 环境变量

在项目 Settings → Environment Variables 增加：

| 变量名 | 说明 |
|--------|------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 上一步的 Public Key |
| `VAPID_PRIVATE_KEY` | 上一步的 Private Key |
| `CRON_SECRET` | 随机字符串，用于保护定时接口，如 `openssl rand -base64 24` |

### 3. 定时任务

项目内已包含 `vercel.json`，配置了每天 **8:00 UTC** 调用 `/api/cron/daily-push`。  
Vercel 在调用 Cron 时会带上 `CRON_SECRET`（若在环境变量中配置了 `CRON_SECRET`，部分环境下会以 Header 形式传递，否则可用外部 cron 调用时带 `?secret=你的CRON_SECRET`）。

若需改为其他时区或时间，可修改 `vercel.json` 的 `crons[0].schedule`（格式为 cron 表达式，UTC）。

### 4. 用户侧

用户登录后，在浏览器/手机中**允许通知**，并至少打开一次首页（有任务数据）。此时前端会向服务端注册推送订阅。之后每天定时任务会按订阅向该设备发送「今日最重要事项」。

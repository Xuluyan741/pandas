# 小熊猫 · Cursor 可直接执行的 Prompt 指令集

> 按顺序复制到 Cursor 中执行，每步完成并自测后再进行下一步。

---

## 使用说明

1. 打开 Cursor，进入 Super Project Agent 项目。
2. 复制下方任意一个「完整 Prompt」到 Cursor Chat。
3. 等待生成代码，运行 `npm run dev` 自测。
4. 通过后 `git commit`，再执行下一步。

---

## Phase 1：日历视图 + 数据模型升级

```
请帮我升级 Super Project Agent 的基础架构：

1. UI 升级
   - 在主界面增加视图切换：List View（现有）、Day View（24h 时间轴）、Week View（日历网格）。
   - 推荐使用 FullCalendar 或 react-big-calendar + Shadcn UI + Tailwind。
   - 保持项目规范：全部 "use client"，仅用 Tailwind 原子类，不引入额外 CSS 文件。

2. 数据模型扩展
   - 在 types/index.ts 中为 Task 增加可选字段：
     - startTime?: string  // "HH:mm"
     - endTime?: string    // "HH:mm"
     - priorityLevel?: "P0" | "P1" | "P2" | "P3"  // 艾森豪威尔矩阵，与 priority 并存
     - isAiGenerated?: boolean
   - 在 lib/db.ts 与 API 中同步支持新字段。
   - 修改 store 的 partialize/merge 覆盖新字段。

3. 交互
   - 日历视图点击空白处可快速弹出「简易新增任务」。
   - 根据 priority 或 priorityLevel 显示不同颜色块（P0 红、P1 橙、P2 黄、P3 灰）。

4. 自测
   - 添加任务后，日视图与周视图中正确显示；
   - 甘特图与现有逻辑不冲突。
```

---

## Phase 2：小熊猫大脑 —— 冲突消解引擎

```
为 Super Project Agent 集成「小熊猫」冲突消解引擎：

1. 扩展 /api/ai/parse-tasks 或新建 /api/agent/parse
   - 输入：{ text: string, imageBase64?: string }（后续支持截图）
   - 调用 DeepSeek/Claude，将模糊输入（如"明晚七点约老王吃饭"）解析为带 startDate、startTime、endTime 的标准 JSON。
   - 必须结合 new Date() 计算准确的 ISO 或 YYYY-MM-DD 字符串。

2. 冲突检测函数
   - 在 src/lib/ 中创建 schedule-conflict.ts：
     - checkScheduleConflict(newTask, existingTasks): 检测时间重叠。
     - 若与 P0/P1 任务冲突，返回 { conflict: true, suggestions: [...] }。
   - 优先级定义（艾森豪威尔）：
     - P0：会议、差旅、约见（不可移动）
     - P1：深度工作、学习（可微调 ±2h）
     - P2：健身、取快递（可挪明天）
     - P3：娱乐（冲突时建议取消/推迟）

3. System Prompt 结构
   - AI 输出格式：{ conflict_detected, original_schedule, new_proposal, reasoning }
   - 禁止直接修改，仅输出「建议方案」供用户确认。
   - 参考 docs/PRD-小熊猫智能管家.md 中的冲突消解 System Prompt。

4. 前端
   - 在 WBS 输入区旁增加「小熊猫」图标按钮。
   - 点击后弹出输入框（支持粘贴文字），调用解析 API。
   - 解析结果以预览卡片展示，用户点击「确认」后再写入 store 与 API。
   - 若有冲突，展示 AI 的 reasoning 与 new_proposal。
```

---

## Phase 3：拟人化 Agent 交互

```
为小熊猫增加拟人化交互：

1. Agent Status 面板
   - 在页面右侧或底部增加可折叠的「小熊猫状态」面板。
   - 当 AI 解析或冲突检测时，流式显示：Thought → Action → Observation。
   - 使用 SSE 或 Vercel AI SDK 的 streamText。

2. 加载动画
   - 处理任务时，小熊猫图标显示「挥舞大螯」的 loading 动画（可用 CSS 或 Lottie）。
   - 文案示例：「小熊猫正在为您修剪日程冲突…」

3. 悬浮球（可选）
   - 平时缩在屏幕边缘的悬浮球，点击展开聊天/输入。
   - 完成时弹窗展示结果（如订座二维码）。
```

---

## Phase 3 补充：Agent 自主推送（情绪触达）

```
为小熊猫实现 Agent 自主推送（情绪触达）：

1. 扩展推送决策逻辑
   - 新建 src/lib/agent-push.ts 或扩展 daily-digest。
   - 输入：用户 tasks、完成记录、时间窗口。
   - 输出：{ shouldPush: boolean, type: "reminder" | "emotional" | "urgent", title: string, body: string }。
   - 调用 LLM（DeepSeek/Claude）根据上下文生成推送文案，而非固定模板。

2. 推送场景
   - 日程提醒：今日到期/逾期任务（可沿用现有 getTodayPriorities 逻辑）。
   - 情绪关怀：连续忙碌、久未休息时推「注意休息」等。
   - 成就鼓励：完成里程碑、连续有进度时推正向反馈。
   - 主动协助：重要节点前夕（如明天有会议）推「需要我帮你整理进度吗？」。

3. 与现有 push 集成
   - 扩展 /api/cron/daily-push 或在新建 /api/cron/agent-push 中调用 agent-push 决策。
   - 保持 CRON_SECRET 校验，支持用户配置推送频率与情绪类开关（可先写死，后续加设置页）。

4. 灵魂伴侣语气
   - System Prompt 要求：亲切、简短、有温度，像朋友而非机器人；避免「您有 X 条待办」式的冷冰冰表述。
```

---

## Phase 4：执行器与 Deep Link

```
赋予小熊猫执行能力：

1. 动作识别
   - 在解析任务时，若检测到关键词（订餐、打车、会议、买票、出差），在任务卡片上自动生成「动作按钮」。
   - 动作类型映射：订餐→美团/大众点评，打车→高德/滴滴，会议→Zoom/腾讯会议，买票→12306/携程。

2. Deep Link 集成
   - 创建 src/lib/deep-links.ts，维护各平台的 URL Scheme 或 Universal Link。
   - 例如：美团搜索 "上海 周五" → 生成带预填参数的链接。
   - 点击按钮后 window.open 或 location.href 跳转。

3. 安全
   - 不自动支付，仅跳转到预填好的第三方确认页，由用户手动完成支付。
```

---

## Phase 5：多模态与长期记忆

```
完善小熊猫的感知与记忆：

1. 图片识别
   - 扩展 /api/agent/parse 支持 multipart/form-data 上传图片。
   - 调用 GPT-4o-vision 或 Claude 多模态，从讲座海报、聊天截图中提取时间、地点、人物。
   - 解析为与语音相同的 JSON 结构。

2. 用户偏好
   - 在数据库中增加 user_preferences 表（或在 users 表扩展）：
     - user_id, key, value (JSON)
     - 示例：{ "dislike_meetings_after": "19:00", "travel_seat": "二等座" }
   - Agent 在冲突消解前，先读取偏好；建议符合偏好时在 UI 标注「已根据您的习惯优化」。

3. 动画
   - 为小熊猫增加悬浮浮窗，处理任务时显示「大螯挥舞」动画。
```

---

## Phase 6：长期目标管家（自主搜寻、规划、监督）

```
为小熊猫实现「长期目标管家」能力：

1. 长期目标识别
   - 扩展 /api/agent/parse 或 parse-tasks，当识别到含明确 deadline 的长期目标时
    （关键词：考试、备考、减肥、健身、上线、交付、比赛、答辩等），
     返回 { type: "long_term_goal", title, deadline, category }。
   - category 枚举：exam（考试/备考）、fitness（减肥/运动）、project（工作/项目）、custom。

2. 自主搜寻资料
   - 新建 src/lib/agent-research.ts。
   - 调用 Search API（Serper / Bing / Google CSE）搜索与目标相关的学习资料、视频、攻略。
   - 用 LLM 对搜索结果做摘要和筛选，输出 { resources: [{ title, url, summary, type }] }。
   - type: article / video / course / tool。

3. 计划生成
   - 新建 src/lib/goal-planner.ts。
   - 输入：goal、deadline、现有日程。
   - 用 LLM 生成分周/分日计划，每日任务含：任务名、预计时间、推荐资料链接。
   - 输出：子任务数组，可直接写入 store/API 作为 Task（带 parentGoalId 关联）。
   - 写入日程/甘特图时与冲突消解联动，避免与已有任务冲突。

4. 每日监督推送
   - 扩展 agent-push.ts：
     - 每日检查有哪些活跃的长期目标计划。
     - 推送当日任务 + 资料链接 + 鼓励语。
     - 若用户完成可勾选（复用 Task 的 status），
       小熊猫根据完成率动态调整：完成率高给鼓励，低了给温和催促。
   - 语气：灵魂伴侣式，不是冰冷的 checklist。

5. 前端
   - 在日历/任务列表中标注「长期目标」类任务，展示整体进度条和剩余天数。
   - 每日任务卡片上附带资料链接（可点击跳转）。
   - 提供「暂停计划」「调整计划」「结束目标」按钮。

6. 安全与声明
   - 搜寻结果标注来源 URL。
   - 健康/减肥类需标注「仅供参考，请咨询专业人士」。
   - 资料链接需校验域名白名单，避免恶意链接。
```

---

## 冲突消解 System Prompt（复制到 API 代码中）

```
你是一名智能日程决策专家 (Super Project Agent - Lobster Brain)。
当用户输入新日程或任务时，对比现有日历，识别时间冲突并根据优先级提出「最优重排方案」。

优先级定义 (Eisenhower Matrix)：
- P0：会议、差旅、约见客户（不可移动）
- P1：深度工作、学习（可微调 ±2h）
- P2：健身、取快递（可挪明天）
- P3：娱乐（冲突时建议取消/推迟）

执行逻辑：
1. 解析：从输入中提取 [事件] [时间] [地点] [优先级]
2. 检索：查询当天该时段的已有日程
3. 判定：若有冲突，根据优先级给出重排建议
4. 输出：禁止直接修改，必须输出建议方案供用户确认

只输出 JSON，格式：
{
  "conflict_detected": boolean,
  "original_schedule": "描述现有安排",
  "new_proposal": "建议的新安排",
  "reasoning": "为什么这么安排..."
}
```

---

## 单步快捷指令

若只想做某一小功能，可使用下方简短指令：

**仅增加日视图**
```
在 Super Project Agent 中增加 Day View（24 小时时间轴），用 react-big-calendar 或 FullCalendar，保持 Tailwind 原子类。
```

**仅增加冲突检测**
```
在 src/lib/ 中实现 checkScheduleConflict(newTask, existingTasks)，检测任务时间重叠，返回冲突信息与建议。
```

**仅优化语音输入**
```
优化 VoiceInput 组件：录音结束后自动调用 /api/ai/parse-tasks，将解析结果直接填入任务表单，用户可修改后再保存。
```

---

*文档结束。建议按 Phase 1 → 2 → 3 → … → 6 顺序执行，确保每步自测通过。*

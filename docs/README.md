# Super Project Agent · 小熊猫智能管家 文档索引

本目录包含基于 Gemini 讨论整理的产品与开发文档，可直接用于 Cursor 分步执行。

---

## 文档列表

| 文档 | 用途 | 何时使用 |
|------|------|----------|
| [PRD-小熊猫智能管家.md](./PRD-小熊猫智能管家.md) | 产品需求文档（含 OpenClaw 借鉴、开发顺序、Zero-Shot 主动代理、自主技能发现等全部讨论） | 了解整体方案、对齐需求 |
| [CURSOR-PROMPTS.md](./CURSOR-PROMPTS.md) | Cursor 可直接复制的 Prompt 指令集 | 开发时按 Phase 复制到 Cursor |
| [开发计划与可行性分析.md](./开发计划与可行性分析.md) | 可行性分析、技术深水区、避坑指南 | 评估风险、制定排期 |

---

## 快速开始

1. 阅读 **PRD-小熊猫智能管家.md** 了解全貌  
2. 打开 **CURSOR-PROMPTS.md**，复制 Phase 1 的 Prompt 到 Cursor  
3. 生成代码后运行 `npm run dev` 自测  
4. 通过后 commit，再执行 Phase 2，依此类推  

---

## 开发顺序

```
Phase 1：Spotlight UI 重构（已完成）
    ↓
Phase 2：冲突消解引擎（小熊猫大脑）
    ↓
Phase 3：智能化 Heartbeat 推送
    ↓
Phase 4：独立 Skills 架构
    ↓
Phase 5：多模态 + 长期记忆
    ↓
Phase 6+：小程序/App 迁移（后续）
```

/**
 * PRD 第十一章：社区技能「执行」
 * 已安装的 ClawHub 技能通过加载 SKILL.md 作为系统指令，由 LLM 按技能说明完成用户请求
 */
import { getSkillFile } from "@/lib/skills/clawhub";
import { getUnifiedCompletion } from "@/lib/ai/unified";

const SYSTEM_SUFFIX = "\n\n请严格按上述技能说明完成用户请求，只输出结果内容，不要重复技能名称或冗长说明。";

/**
 * 执行社区技能：拉取 SKILL.md，以之为 system prompt 调用 LLM 完成 userGoal
 * @param slug ClawHub 技能 slug
 * @param userGoal 用户本轮请求/目标
 * @returns 执行结果文本，失败时抛错或返回简短错误信息
 */
export async function runCommunitySkill(
  slug: string,
  userGoal: string,
): Promise<{ content: string; slug: string; displayName?: string }> {
  const content = await getSkillFile(slug.trim().toLowerCase(), "SKILL.md");
  if (!content?.trim()) {
    return {
      content: "",
      slug,
      displayName: undefined,
    };
  }
  const systemContent = content.trim() + SYSTEM_SUFFIX;
  const result = await getUnifiedCompletion(
    [
      { role: "system", content: systemContent },
      { role: "user", content: userGoal.trim() || "请按技能说明执行。" },
    ],
    { temperature: 0.3, maxTokens: 2048 },
  );
  return {
    content: result.content?.trim() ?? "",
    slug,
    displayName: undefined,
  };
}

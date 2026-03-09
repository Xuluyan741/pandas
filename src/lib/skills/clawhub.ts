/**
 * ClawHub 技能市场 API 客户端（PRD 第十一章、Phase7）
 * 语义搜索、按 slug 获取技能详情与 SKILL.md 文件，支持即用即删（仅当轮注入，不持久化）
 */

const CLAWHUB_API_BASE =
  process.env.CLAWHUB_API_BASE?.trim() || "https://clawhub.ai";

export interface ClawHubSearchResult {
  score: number;
  slug: string | null;
  displayName: string | null;
  summary: string | null;
  version: string | null;
  updatedAt?: number;
}

export interface ClawHubSkillDetail {
  skill: {
    slug: string;
    displayName: string;
    summary: string | null;
    tags?: Record<string, unknown>;
    stats?: unknown;
    createdAt: number;
    updatedAt: number;
  };
  latestVersion: {
    version: string;
    createdAt: number;
    changelog: string;
  } | null;
  owner?: { handle?: string; displayName?: string } | null;
}

/** 搜索技能（语义/向量搜索），limit 默认 5 */
export async function searchSkills(
  query: string,
  limit = 5,
): Promise<ClawHubSearchResult[]> {
  if (!query.trim()) return [];
  const url = new URL(`${CLAWHUB_API_BASE}/api/v1/search`);
  url.searchParams.set("q", query.trim());
  if (limit > 0) url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 60 },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: ClawHubSearchResult[] };
  return data.results ?? [];
}

/** 按 slug 获取技能详情 */
export async function getSkillBySlug(
  slug: string,
): Promise<ClawHubSkillDetail | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  const url = `${CLAWHUB_API_BASE}/api/v1/skills/${encodeURIComponent(normalized)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 120 },
  });
  if (!res.ok) return null;
  return (await res.json()) as ClawHubSkillDetail;
}

/** 获取技能某文件内容（如 SKILL.md），用于即用即删时注入当轮 context */
export async function getSkillFile(
  slug: string,
  path: string,
): Promise<string | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized || !path.trim()) return null;
  const url = new URL(
    `${CLAWHUB_API_BASE}/api/v1/skills/${encodeURIComponent(normalized)}/file`,
  );
  url.searchParams.set("path", path.trim());

  const res = await fetch(url.toString(), {
    headers: { Accept: "text/plain, text/markdown" },
    next: { revalidate: 0 },
  });
  if (!res.ok) return null;
  return res.text();
}

/**
 * 根据任务/用户输入搜索 ClawHub，取 topK 个技能并拉取 SKILL.md 摘要
 * 用于「即用即删」：仅当轮注入 prompt，用后不持久化，节省 token
 */
export async function discoverClawHubSkillsForTask(
  taskOrMessage: string,
  topK = 2,
  maxExcerptChars = 2000,
): Promise<{ slug: string; displayName: string; excerpt: string }[]> {
  const results = await searchSkills(taskOrMessage, topK);
  const out: { slug: string; displayName: string; excerpt: string }[] = [];

  for (const r of results) {
    if (!r.slug) continue;
    const displayName = r.displayName || r.slug;
    let excerpt = (r.summary || "").trim();
    const content = await getSkillFile(r.slug, "SKILL.md");
    if (content) {
      const truncated =
        content.length > maxExcerptChars
          ? content.slice(0, maxExcerptChars) + "\n...(略)"
          : content;
      excerpt = excerpt ? `${excerpt}\n\n${truncated}` : truncated;
    }
    out.push({ slug: r.slug, displayName, excerpt: excerpt || "(无说明)" });
  }
  return out;
}

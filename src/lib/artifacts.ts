/**
 * 产出物可追溯（计划/冲突建议摘要等，参考 ClawWork 改进）
 */
import { db } from "./db";

export type ArtifactType = "plan" | "conflict_advice" | "message_draft";

export async function saveArtifact(
  userId: string,
  type: ArtifactType,
  summary: string,
  refId?: string,
): Promise<void> {
  await db.execute({
    sql: `INSERT INTO artifacts (id, user_id, type, ref_id, summary)
          VALUES (?, ?, ?, ?, ?)`,
    args: [
      `art_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      userId,
      type,
      refId ?? null,
      summary.slice(0, 10000),
    ],
  });
}

export async function listArtifacts(
  userId: string,
  type?: ArtifactType,
  limit = 20,
): Promise<{ id: string; type: string; refId: string | null; summary: string; createdAt: string }[]> {
  const res = type
    ? await db.execute({
        sql: `SELECT id, type, ref_id, summary, created_at FROM artifacts
              WHERE user_id = ? AND type = ? ORDER BY created_at DESC LIMIT ?`,
        args: [userId, type, limit],
      })
    : await db.execute({
        sql: `SELECT id, type, ref_id, summary, created_at FROM artifacts
              WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
        args: [userId, limit],
      });
  return ((res.rows ?? []) as unknown as { id: string; type: string; ref_id: string | null; summary: string; created_at: string }[]).map(
    (r) => ({
      id: r.id,
      type: r.type,
      refId: r.ref_id,
      summary: r.summary,
      createdAt: r.created_at,
    }),
  );
}

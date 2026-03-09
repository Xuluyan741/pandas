/**
 * POST /api/usage/reward — 高价值行为返还额度（参考 ClawWork 改进）
 * body: { reason: "conflict_accepted" | "goal_milestone" | "schedule_created", amount?: number }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recordReward, type RewardReason } from "@/lib/quota";
import { logEvent } from "@/lib/analytics";

const REWARD_AMOUNTS: Record<RewardReason, number> = {
  conflict_accepted: 0.5,
  goal_milestone: 1,
  schedule_created: 0.5,
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { reason?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const reason = body.reason as RewardReason | undefined;
  if (!reason || !["conflict_accepted", "goal_milestone", "schedule_created"].includes(reason)) {
    return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
  }

  const amount = typeof body.amount === "number" ? body.amount : REWARD_AMOUNTS[reason];
  await recordReward(session.user.id, amount, reason);
  if (reason === "conflict_accepted") {
    logEvent(session.user.id, "conflict_accepted", {}).catch(() => {});
  }
  if (reason === "goal_milestone") {
    logEvent(session.user.id, "goal_milestone_done", {}).catch(() => {});
  }
  return NextResponse.json({ ok: true, amount, reason });
}

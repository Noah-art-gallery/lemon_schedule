import { AppError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { EncouragementRow } from "@/lib/supabase/database.types";
import { z } from "zod";

export interface EncouragementDisplay extends EncouragementRow {
  authorName: string;
}

export const reactionValues = ["lemon", "clap", "heart", "cheer"] as const;
export type Reaction = (typeof reactionValues)[number];

export async function sendEncouragement(
  occurrenceId: number,
  reaction: Reaction | null,
  message?: string,
): Promise<number> {
  const normalizedMessage = message?.trim() || null;
  if (
    !z.number().int().positive().safeParse(occurrenceId).success ||
    (reaction !== null && !reactionValues.includes(reaction)) ||
    (normalizedMessage !== null && normalizedMessage.length > 120) ||
    (reaction === null && normalizedMessage === null)
  ) {
    throw new AppError("INVALID_INPUT", "이모지나 120자 이하 응원글을 입력해 주세요.");
  }
  const { data, error } = await getSupabaseClient().rpc("upsert_encouragement", {
    target_occurrence_id: occurrenceId,
    selected_reaction: reaction,
    selected_message: normalizedMessage,
  });
  if (error) {
    if (error.message.includes("ENCOURAGEMENT_NOT_ALLOWED")) {
      throw new AppError("FORBIDDEN", "이 할 일에는 아직 응원을 보낼 수 없어요.");
    }
    throw new AppError("INVALID_INPUT", "응원을 보내지 못했어요.");
  }
  return data;
}

export async function listEncouragements(occurrenceId: number): Promise<EncouragementDisplay[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("encouragements")
    .select("*")
    .eq("occurrence_id", occurrenceId)
    .order("created_at", { ascending: false });
  if (error) throw new AppError("INVALID_INPUT", "받은 응원을 불러오지 못했어요.");
  const authorIds = [...new Set(data.map((item) => item.author_id))];
  const profiles = authorIds.length
    ? await client.from("profiles").select("id, display_name").in("id", authorIds)
    : { data: [], error: null };
  if (profiles.error) throw new AppError("INVALID_INPUT", "응원 보낸 사람을 불러오지 못했어요.");
  const names = new Map(profiles.data.map((item) => [item.id, item.display_name]));
  return data.map((item) => ({ ...item, authorName: names.get(item.author_id) ?? "친구" }));
}

export async function hideEncouragement(
  encouragementId: number,
  hidden: boolean,
): Promise<{ encouragementId: number; visibility: "hidden_by_owner" | "visible" }> {
  const { data, error } = await getSupabaseClient().rpc("hide_encouragement", {
    target_encouragement_id: encouragementId,
    hidden,
  });
  if (error) throw new AppError("INVALID_INPUT", "응원 표시를 바꾸지 못했어요.");
  if (!data) throw new AppError("NOT_FOUND", "응원을 찾지 못했어요.");
  return { encouragementId, visibility: hidden ? "hidden_by_owner" : "visible" };
}

export async function deleteEncouragement(
  encouragementId: number,
): Promise<{ encouragementId: number; visibility: "deleted_by_author" }> {
  const { data, error } = await getSupabaseClient().rpc("delete_encouragement", {
    target_encouragement_id: encouragementId,
  });
  if (error) throw new AppError("INVALID_INPUT", "응원을 삭제하지 못했어요.");
  if (!data) throw new AppError("NOT_FOUND", "응원을 찾지 못했어요.");
  return { encouragementId, visibility: "deleted_by_author" };
}

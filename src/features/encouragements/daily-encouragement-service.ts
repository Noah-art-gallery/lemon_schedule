import { z } from "zod";
import { AppError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  avatarKeySchema,
  occurrenceSchema,
  ownerSchema,
  parseRead,
  positiveId,
  readError,
} from "@/features/tasks/read-contract";
import { reactionValues } from "@/types/contracts";

export const dailyEncouragementSchema = z.object({
  id: positiveId,
  ownerId: z.uuid(),
  authorId: z.uuid(),
  day: z.iso.date(),
  reaction: z.enum(reactionValues),
  message: z.string().nullable(),
  authorName: z.string(),
  authorAvatarKey: avatarKeySchema,
  quote: z.object({ id: positiveId, title: z.string() }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type DailyEncouragement = z.infer<typeof dailyEncouragementSchema>;
const daySchema = z.object({
  day: z.iso.date(),
  owner: ownerSchema,
  occurrences: z.array(occurrenceSchema),
  mine: dailyEncouragementSchema.nullable(),
});
export type EncouragementDay = z.infer<typeof daySchema>;
export const dailyInputSchema = z.object({
  ownerId: z.uuid(),
  day: z.iso.date(),
  reaction: z.enum(reactionValues),
  message: z.string().trim().max(120),
  quotedOccurrenceId: positiveId.nullable(),
});
export type DailyEncouragementInput = z.infer<typeof dailyInputSchema>;
export async function getEncouragementDay(ownerId: string): Promise<EncouragementDay> {
  const { data, error } = await getSupabaseClient().rpc("get_encouragement_day", {
    target_owner_id: parseRead(z.uuid(), ownerId),
  });
  readError(error);
  return parseRead(daySchema, data);
}
export async function getDailyEncouragement(id: number): Promise<DailyEncouragement> {
  const { data, error } = await getSupabaseClient().rpc("get_daily_encouragement", {
    target_encouragement_id: parseRead(positiveId, id),
  });
  readError(error);
  return parseRead(dailyEncouragementSchema, data);
}
export async function saveDailyEncouragement(
  input: DailyEncouragementInput,
): Promise<DailyEncouragement> {
  const parsed = dailyInputSchema.safeParse(input);
  if (!parsed.success)
    throw new AppError("INVALID_INPUT", "스티커와 120자 이하의 응원글을 확인해 주세요");
  const value = parsed.data;
  const { data, error } = await getSupabaseClient().rpc("upsert_daily_encouragement", {
    target_owner_id: value.ownerId,
    expected_day: value.day,
    selected_reaction: value.reaction,
    selected_message: value.message || null,
    target_occurrence_id: value.quotedOccurrenceId,
  });
  if (error?.message.includes("CONFLICT"))
    throw new AppError("CONFLICT", "친구의 날짜가 바뀌었어요. 오늘을 다시 불러와 주세요");
  if (error?.message.includes("INVALID_QUOTE"))
    throw new AppError("INVALID_INPUT", "인용한 할 일을 다시 확인해 주세요");
  readError(error);
  return parseRead(dailyEncouragementSchema, data);
}
export async function deleteDailyEncouragement(id: number): Promise<void> {
  const { data, error } = await getSupabaseClient().rpc("delete_daily_encouragement", {
    target_encouragement_id: parseRead(positiveId, id),
  });
  readError(error);
  if (data !== true) throw new AppError("NOT_FOUND", "응원을 찾지 못했어요");
}

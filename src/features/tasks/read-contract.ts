import { z } from "zod";
import { AppError } from "@/lib/errors";
import { reactionValues, recurrenceValues, encouragementVisibilityValues } from "@/types/contracts";
export const positiveId = z.number().int().positive();
const timestamp = z.iso.datetime({ offset: true });
export const completionCursor = z.object({ firstCompletedAt: timestamp, occurrenceId: positiveId });
export const historyInput = z.object({
  cursor: completionCursor.optional(),
  limit: positiveId.max(100).default(20),
});
export const occurrenceSchema = z.object({
  id: positiveId,
  task_id: positiveId,
  owner_id: z.uuid(),
  occurrence_date: z.iso.date(),
  title_snapshot: z.string(),
  due_time: z.string().nullable(),
  recurrence_snapshot: z.enum(recurrenceValues),
  status: z.enum(["pending", "completed"]),
  completed_at: timestamp.nullable(),
  first_completed_at: timestamp.nullable(),
  reopened_at: timestamp.nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});
export const summarySchema = z.object({
  count: z.number().int().nonnegative(),
  reactions: z.object({
    lemon: z.number(),
    clap: z.number(),
    heart: z.number(),
    cheer: z.number(),
  }),
  latestMessage: z
    .object({
      encouragementId: positiveId,
      authorName: z.string(),
      message: z.string(),
      createdAt: timestamp,
    })
    .nullable(),
  myEncouragement: z
    .object({
      id: positiveId,
      reaction: z.enum(reactionValues).nullable(),
      message: z.string().nullable(),
      visibility: z.enum(encouragementVisibilityValues),
    })
    .nullable(),
});
export const ownerSchema = z.object({ id: z.uuid(), displayName: z.string() });
export const encouragementSchema = z.object({
  id: positiveId,
  occurrence_id: positiveId,
  author_id: z.uuid(),
  owner_id: z.uuid(),
  reaction: z.enum(reactionValues).nullable(),
  message: z.string().nullable(),
  visibility: z.enum(encouragementVisibilityValues),
  created_at: timestamp,
  updated_at: timestamp,
  authorName: z.string(),
});
export function parseRead<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AppError("INVALID_INPUT", "조회 결과를 확인하지 못했어요");
  return parsed.data;
}
export function readError(error: { message: string } | null): void {
  if (!error) return;
  for (const code of [
    "UNAUTHENTICATED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "RATE_LIMITED",
  ] as const) {
    if (error.message.includes(code))
      throw new AppError(
        code,
        code === "UNAUTHENTICATED" ? "다시 로그인해 주세요" : "현재 이 내용을 볼 수 없어요",
      );
  }
  throw new AppError("INVALID_INPUT", "내용을 불러오지 못했어요");
}

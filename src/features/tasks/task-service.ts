import { z } from "zod";

import { AppError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { TaskOccurrenceRow } from "@/lib/supabase/database.types";
import { recurrenceValues, type TodaySummary } from "@/types/contracts";

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "할 일을 입력해 주세요.").max(80),
  dueDate: z.iso.date("올바른 날짜를 선택해 주세요."),
  dueTime: z.union([z.iso.time({ precision: -1 }), z.literal("")]).optional(),
  recurrence: z.enum(recurrenceValues).default("none"),
});

export type TaskInput = z.input<typeof taskInputSchema>;

const taskIdResult = z.object({ taskId: z.number() });
const taskUpdateResult = z.object({ taskId: z.number(), updatedAt: z.string() });

function validateTask(input: TaskInput) {
  const result = taskInputSchema.safeParse(input);
  if (!result.success) {
    throw new AppError(
      "INVALID_INPUT",
      result.error.issues[0]?.message ?? "할 일을 확인해 주세요.",
    );
  }
  return result.data;
}

export async function createTask(input: TaskInput): Promise<{ taskId: number }> {
  const values = validateTask(input);
  const { data, error } = await getSupabaseClient().rpc("create_task_schedule", {
    target_title: values.title,
    target_due_date: values.dueDate,
    target_due_time: values.dueTime || null,
    target_recurrence: values.recurrence,
  });
  if (error) {
    throw new AppError("INVALID_INPUT", "할 일을 만들지 못했어요. 입력을 확인해 주세요.");
  }
  const parsed = taskIdResult.safeParse(data);
  if (!parsed.success) throw new AppError("INVALID_INPUT", "할 일 생성 결과를 확인하지 못했어요.");
  return parsed.data;
}

export async function listOccurrences(input: {
  ownerId: string;
  from: string;
  to: string;
}): Promise<{ occurrences: TaskOccurrenceRow[]; today: string; todaySummary: TodaySummary }> {
  const client = getSupabaseClient();
  const todayResult = await client.rpc("get_owner_today", { target_owner_id: input.ownerId });
  if (todayResult.error) throw new AppError("INVALID_INPUT", "할 일 목록을 불러오지 못했어요.");

  // PostgREST caps each response at 1,000 rows; a year of three daily tasks exceeds it.
  const occurrences: TaskOccurrenceRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const page = await client
      .rpc("list_task_occurrences", {
        target_owner_id: input.ownerId,
        range_from: input.from,
        range_to: input.to,
      })
      .range(offset, offset + pageSize - 1);
    if (page.error || !page.data) {
      throw new AppError("INVALID_INPUT", "할 일 목록을 불러오지 못했어요.");
    }
    occurrences.push(...page.data);
    if (page.data.length < pageSize) break;
  }
  const todayItems = occurrences.filter((item) => item.occurrence_date === todayResult.data);
  const completedCount = todayItems.filter((item) => item.status === "completed").length;
  const scheduledCount = todayItems.length;
  return {
    occurrences,
    today: todayResult.data,
    todaySummary: {
      scheduledCount,
      completedCount,
      percent: scheduledCount ? Math.round((completedCount / scheduledCount) * 100) : null,
      empty: scheduledCount === 0,
    },
  };
}

export async function updateTask(
  input: { taskId: number } & Partial<{
    title: string;
    dueDate: string;
    dueTime: string | null;
    recurrence: (typeof recurrenceValues)[number];
  }>,
): Promise<{ taskId: number; updatedAt: string }> {
  const client = getSupabaseClient();
  if (
    input.title !== undefined &&
    !z.string().trim().min(1).max(80).safeParse(input.title).success
  ) {
    throw new AppError("INVALID_INPUT", "할 일을 확인해 주세요.");
  }
  if (input.dueDate !== undefined && !z.iso.date().safeParse(input.dueDate).success) {
    throw new AppError("INVALID_INPUT", "날짜를 확인해 주세요.");
  }
  if (
    input.dueTime !== undefined &&
    input.dueTime !== null &&
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.dueTime)
  ) {
    throw new AppError("INVALID_INPUT", "시간을 확인해 주세요.");
  }
  if (input.recurrence !== undefined && !recurrenceValues.includes(input.recurrence)) {
    throw new AppError("INVALID_INPUT", "반복 규칙을 확인해 주세요.");
  }
  const { data, error } = await client.rpc("update_task_schedule", {
    target_task_id: input.taskId,
    target_title: input.title ?? null,
    target_due_date: input.dueDate ?? null,
    target_due_time: input.dueTime ?? null,
    target_recurrence: input.recurrence ?? null,
    due_time_provided: input.dueTime !== undefined,
  });
  if (error) throw new AppError("INVALID_INPUT", "할 일을 수정하지 못했어요.");
  const parsed = taskUpdateResult.safeParse(data);
  if (!parsed.success) throw new AppError("INVALID_INPUT", "할 일 수정 결과를 확인하지 못했어요.");
  return parsed.data;
}

export async function deleteTask(taskId: number): Promise<{ taskId: number; deleted: true }> {
  const { data, error } = await getSupabaseClient().rpc("delete_task", { target_task_id: taskId });
  if (error) throw new AppError("INVALID_INPUT", "할 일을 삭제하지 못했어요.");
  if (!data) throw new AppError("NOT_FOUND", "할 일을 찾지 못했어요.");
  return { taskId, deleted: true };
}

export async function completeOccurrence(occurrenceId: number): Promise<{
  status: "completed";
  completedAt: string;
  firstCompletion: boolean;
  rewardGranted: boolean;
  rewardPoints: number;
  completionEventId: number;
}> {
  const { data, error } = await getSupabaseClient().rpc("complete_occurrence", {
    target_occurrence_id: occurrenceId,
  });
  if (error) throw new AppError("INVALID_INPUT", "완료 상태를 저장하지 못했어요.");
  const parsed = z
    .object({
      status: z.literal("completed"),
      completedAt: z.string(),
      firstCompletion: z.boolean(),
      rewardGranted: z.boolean(),
      rewardPoints: z.number(),
      completionEventId: z.number(),
    })
    .safeParse(data);
  if (!parsed.success) throw new AppError("INVALID_INPUT", "완료 결과를 확인하지 못했어요.");
  return parsed.data;
}

export async function reopenOccurrence(
  occurrenceId: number,
): Promise<{ status: "pending"; rewardReversed: false }> {
  const { data, error } = await getSupabaseClient().rpc("reopen_occurrence", {
    target_occurrence_id: occurrenceId,
  });
  if (error) throw new AppError("INVALID_INPUT", "완료를 취소하지 못했어요.");
  if (!data) throw new AppError("CONFLICT", "이미 진행 중인 할 일이에요.");
  return { status: "pending", rewardReversed: false };
}

export async function getOwnOccurrence(
  occurrenceId: number,
  ownerId: string,
): Promise<TaskOccurrenceRow> {
  const { data, error } = await getSupabaseClient()
    .from("task_occurrences")
    .select("*")
    .eq("id", occurrenceId)
    .eq("owner_id", ownerId)
    .single();
  if (error || !data) throw new AppError("NOT_FOUND", "완료 기록을 찾지 못했어요.");
  return data;
}

import { AppError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { NotificationRow } from "@/lib/supabase/database.types";
import { z } from "zod";

export interface NotificationItem extends NotificationRow {
  actorName: string;
}

export interface NotificationPage {
  items: NotificationItem[];
  nextCursor: number | null;
}

const pageInput = z.object({
  userId: z.uuid(),
  cursor: z.number().int().positive().optional(),
});
const pageSize = 50;

export function splitNotificationPage(rows: NotificationRow[]): {
  rows: NotificationRow[];
  nextCursor: number | null;
} {
  const page = rows.slice(0, pageSize);
  return {
    rows: page,
    nextCursor: rows.length > pageSize ? page[page.length - 1].id : null,
  };
}

export function notificationTarget(
  item: Pick<NotificationRow, "notification_type" | "actor_id" | "occurrence_id">,
): string {
  if (item.notification_type === "task_completed" && item.actor_id && item.occurrence_id) {
    return `/friends/?friend=${encodeURIComponent(item.actor_id)}&occurrence=${item.occurrence_id}`;
  }
  if (item.notification_type === "encouragement_received" && item.occurrence_id) {
    return `/?occurrence=${item.occurrence_id}`;
  }
  return "/friends/";
}

export async function listNotifications(input: {
  userId: string;
  cursor?: number;
}): Promise<NotificationPage> {
  const parsed = pageInput.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", "알림 조회 범위가 올바르지 않아요.");
  const { userId, cursor } = parsed.data;
  const client = getSupabaseClient();
  let query = client
    .from("notifications")
    .select("*")
    .eq("recipient_id", userId)
    .order("id", { ascending: false })
    .limit(pageSize + 1);
  if (cursor) query = query.lt("id", cursor);
  const result = await query;
  if (result.error) throw new AppError("INVALID_INPUT", "알림을 불러오지 못했어요.");
  const { rows, nextCursor } = splitNotificationPage(result.data);
  const actorIds = [
    ...new Set(rows.map((item) => item.actor_id).filter((id): id is string => Boolean(id))),
  ];
  const profiles = actorIds.length
    ? await client.from("profiles").select("id, display_name").in("id", actorIds)
    : { data: [], error: null };
  if (profiles.error) throw new AppError("INVALID_INPUT", "알림 보낸 사람을 불러오지 못했어요.");
  const names = new Map(profiles.data.map((profile) => [profile.id, profile.display_name]));
  return {
    items: rows.map((item) => ({
      ...item,
      actorName: item.actor_id ? (names.get(item.actor_id) ?? "친구") : "레몬스케줄",
    })),
    nextCursor,
  };
}

export async function markNotificationRead(notificationId: number): Promise<boolean> {
  const { data, error } = await getSupabaseClient()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .select("id")
    .maybeSingle();
  if (error) throw new AppError("INVALID_INPUT", "알림을 읽음 처리하지 못했어요.");
  return Boolean(data);
}

export async function markAllNotificationsRead(
  userId: string,
): Promise<{ updatedCount: number; readAt: string }> {
  const readAt = new Date().toISOString();
  const { data, error } = await getSupabaseClient()
    .from("notifications")
    .update({ read_at: readAt })
    .eq("recipient_id", userId)
    .is("read_at", null)
    .select("id");
  if (error) throw new AppError("INVALID_INPUT", "알림을 읽음 처리하지 못했어요.");
  return { updatedCount: data.length, readAt };
}

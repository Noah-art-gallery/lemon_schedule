import {
  reactionValues,
  type InboxFilter,
  type InboxItem,
  type ProfileAvatarKey,
} from "@/types/contracts";
import { parseRead, readError, positiveId, avatarKeySchema } from "@/features/tasks/read-contract";
import { AppError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { NotificationRow } from "@/lib/supabase/database.types";
import { z } from "zod";

export interface NotificationItem extends NotificationRow {
  actorName: string;
  actorAvatarKey: ProfileAvatarKey;
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
  item: Pick<NotificationRow, "notification_type" | "actor_id" | "occurrence_id"> &
    Partial<
      Pick<NotificationRow, "encouragement_id" | "connection_request_id" | "daily_encouragement_id">
    >,
): string {
  if (item.notification_type === "encouragement_received" && item.daily_encouragement_id)
    return `/?dailyEncouragement=${item.daily_encouragement_id}`;
  if (item.notification_type === "task_completed" && item.actor_id && item.occurrence_id) {
    return `/friends/?friend=${encodeURIComponent(item.actor_id)}&occurrence=${item.occurrence_id}`;
  }
  if (item.notification_type === "encouragement_received" && item.occurrence_id) {
    return `/?occurrence=${item.occurrence_id}${item.encouragement_id ? `&encouragement=${item.encouragement_id}` : ""}`;
  }
  if (item.notification_type === "connection_request" && item.connection_request_id)
    return `/friends/?request=${item.connection_request_id}`;
  if (item.notification_type === "connection_accepted" && item.actor_id)
    return `/friends/?friend=${encodeURIComponent(item.actor_id)}`;
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
    .in("notification_type", [
      "encouragement_received",
      "connection_request",
      "connection_accepted",
    ])
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
    ? await client.from("profiles").select("id, display_name, avatar_key").in("id", actorIds)
    : { data: [], error: null };
  if (profiles.error) throw new AppError("INVALID_INPUT", "알림 보낸 사람을 불러오지 못했어요.");
  const names = new Map(profiles.data.map((profile) => [profile.id, profile]));
  return {
    items: rows.map((item) => ({
      ...item,
      actorName: item.actor_id ? (names.get(item.actor_id)?.display_name ?? "친구") : "레몬스케줄",
      actorAvatarKey: parseRead(
        avatarKeySchema,
        item.actor_id ? names.get(item.actor_id)?.avatar_key : undefined,
      ),
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
  const { data, error } = await getSupabaseClient()
    .from("notifications")
    .select("id")
    .eq("recipient_id", userId)
    .in("notification_type", [
      "encouragement_received",
      "connection_request",
      "connection_accepted",
    ])
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new AppError("INVALID_INPUT", "소식을 읽음 처리하지 못했어요");
  return data
    ? markAllInboxRead({ throughId: data.id })
    : { updatedCount: 0, readAt: new Date().toISOString() };
}

export async function listInbox(input: {
  filter: InboxFilter;
  cursor?: number;
  limit?: number;
}): Promise<{ items: InboxItem[]; nextCursor: number | null }> {
  const values = parseRead(
    z.object({
      filter: z.enum(["all", "encouragement", "connection"]),
      cursor: positiveId.optional(),
      limit: positiveId.max(100).default(50),
    }),
    input,
  );
  const { data, error } = await getSupabaseClient().rpc("list_inbox", {
    inbox_filter: values.filter,
    cursor_id: values.cursor ?? null,
    page_limit: values.limit,
  });
  readError(error);
  return parseRead(
    z.object({
      items: z.array(
        z.object({
          id: positiveId,
          type: z.enum(["encouragement_received", "connection_request", "connection_accepted"]),
          actorName: z.string(),
          actorAvatarKey: avatarKeySchema,
          createdAt: z.string(),
          readAt: z.string().nullable(),
          occurrenceId: positiveId.nullable(),
          encouragementId: positiveId.nullable(),
          dailyEncouragementId: positiveId.nullable().optional(),
          connectionRequestId: positiveId.nullable(),
          target: z.string().nullable(),
          availability: z.enum(["available", "unavailable"]),
          taskTitle: z.string().nullable(),
          messagePreview: z.string().nullable(),
          reaction: z.enum(reactionValues).nullable(),
        }),
      ),
      nextCursor: positiveId.nullable(),
    }),
    data,
  );
}
export async function getInboxUnreadCount(): Promise<{ unreadCount: number }> {
  const { data, error } = await getSupabaseClient().rpc("get_inbox_unread_count", {});
  readError(error);
  return parseRead(z.object({ unreadCount: z.number().int().nonnegative() }), data);
}
export async function markAllInboxRead(input: {
  throughId: number;
}): Promise<{ updatedCount: number; readAt: string }> {
  const { throughId } = parseRead(z.object({ throughId: positiveId }), input);
  const { data, error } = await getSupabaseClient().rpc("mark_all_inbox_read", {
    through_id: throughId,
  });
  readError(error);
  return parseRead(
    z.object({ updatedCount: z.number().int().nonnegative(), readAt: z.string() }),
    data,
  );
}

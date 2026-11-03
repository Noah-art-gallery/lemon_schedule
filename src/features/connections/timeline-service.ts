import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase/client";
import { isValidTimeZone } from "@/lib/time";
import { ownerSchema, parseRead, positiveId, readError } from "@/features/tasks/read-contract";

export const timelineCursorSchema = z.object({
  occurredAt: z.iso.datetime({ offset: true }),
  kind: z.enum(["created", "completed"]),
  eventId: positiveId,
});
const timelineItemSchema = timelineCursorSchema
  .extend({
    owner: ownerSchema,
    ownerDay: z.iso.date(),
    cheeredToday: z.boolean(),
    task: z.object({ id: positiveId, title: z.string(), dueDate: z.iso.date() }),
    occurrenceId: positiveId.nullable(),
  })
  .refine((item) =>
    item.kind === "completed" ? item.occurrenceId === item.eventId : item.occurrenceId === null,
  );
export const timelineInputSchema = z.object({
  friendId: z.uuid().optional(),
  cursor: timelineCursorSchema.optional(),
  limit: positiveId.max(100).default(20),
});
export type TimelineCursor = z.infer<typeof timelineCursorSchema>;
export type TimelineItem = z.infer<typeof timelineItemSchema>;
export interface TimelinePage {
  items: TimelineItem[];
  nextCursor: TimelineCursor | null;
  viewerTimeZone: string;
}
export async function listFriendTimeline(
  input: {
    friendId?: string;
    cursor?: TimelineCursor;
    limit?: number;
  } = {},
): Promise<TimelinePage> {
  const value = parseRead(timelineInputSchema, input);
  const { data, error } = await getSupabaseClient().rpc("list_friend_timeline", {
    target_friend_id: value.friendId ?? null,
    cursor_occurred_at: value.cursor?.occurredAt ?? null,
    cursor_kind: value.cursor?.kind ?? null,
    cursor_event_id: value.cursor?.eventId ?? null,
    page_limit: value.limit,
  });
  readError(error);
  return parseRead(
    z.object({
      items: z.array(timelineItemSchema),
      nextCursor: timelineCursorSchema.nullable(),
      viewerTimeZone: z.string().refine(isValidTimeZone),
    }),
    data,
  );
}
export function timelineKey(item: TimelineCursor) {
  return `${item.kind}:${item.eventId}`;
}

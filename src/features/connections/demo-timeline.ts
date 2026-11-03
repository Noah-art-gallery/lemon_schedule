import {
  demoGetConnections,
  demoGetProfile,
  demoGetFriendTasks,
  demoListFriend,
} from "@/features/tasks/demo-task-store";
import { demoGetEncouragementDay } from "@/features/encouragements/demo-daily-encouragement-store";
import { AppError } from "@/lib/errors";
import type { TimelineCursor, TimelineItem, TimelinePage } from "./timeline-service";

export function demoListTimeline(
  input: { friendId?: string; cursor?: TimelineCursor; limit?: number } = {},
): TimelinePage {
  const friends = demoGetConnections().friends;
  if (input.friendId && !friends.some((f) => f.id === input.friendId))
    throw new AppError("FORBIDDEN", "현재 이 내용을 볼 수 없어요");
  const items: TimelineItem[] = friends
    .filter((f) => !input.friendId || input.friendId === f.id)
    .flatMap((owner) => {
      const day = demoGetEncouragementDay(owner.id);
      const shared = { owner, ownerDay: day.day, cheeredToday: Boolean(day.mine) };
      const created: TimelineItem[] = demoGetFriendTasks(owner.id).map((task) => ({
        ...shared,
        kind: "created",
        eventId: task.id,
        occurredAt: task.created_at,
        task: { id: task.id, title: task.title, dueDate: task.due_date },
        occurrenceId: null,
      }));
      return [
        ...created,
        ...demoListFriend(owner.id)
          .filter((o) => o.status === "completed" && o.first_completed_at)
          .map((o): TimelineItem => ({
            ...shared,
            kind: "completed",
            eventId: o.id,
            occurredAt: o.first_completed_at!,
            task: { id: o.task_id, title: o.title_snapshot, dueDate: o.occurrence_date },
            occurrenceId: o.id,
          })),
      ];
    });
  const compare = (a: TimelineCursor, b: TimelineCursor) =>
    Date.parse(b.occurredAt) - Date.parse(a.occurredAt) ||
    Number(b.kind === "completed") - Number(a.kind === "completed") ||
    b.eventId - a.eventId;
  const sorted = items
    .sort(compare)
    .filter((item) => !input.cursor || compare(item, input.cursor) > 0);
  const page = sorted.slice(0, input.limit ?? 20);
  const last = page.at(-1);
  return {
    items: page,
    viewerTimeZone: demoGetProfile().timeZone,
    nextCursor:
      sorted.length > page.length && last
        ? { occurredAt: last.occurredAt, kind: last.kind, eventId: last.eventId }
        : null,
  };
}

import { demoGetDailyEncouragement } from "@/features/encouragements/demo-daily-encouragement-store";
import * as tasks from "@/features/tasks/demo-task-store";
import type { ConnectionData } from "@/features/connections/connection-service";
import type { InboxFilter, InboxItem } from "@/types/contracts";
const read = new Map<number, string>();
const createdAt = new Date().toISOString();
export function subscribeDemoInbox(listener: () => void) {
  const stop = tasks.subscribeDemoTasks(listener);
  return () => {
    stop();
  };
}
function connections() {
  const source = tasks as typeof tasks & { demoGetConnections?: () => ConnectionData };
  return source.demoGetConnections?.();
}
export function demoInboxItems(): InboxItem[] {
  const base = {
    createdAt,
    readAt: null,
    occurrenceId: null,
    encouragementId: null,
    connectionRequestId: null,
    taskTitle: null,
    messagePreview: null,
    reaction: null,
  };
  let cheer: InboxItem = {
    ...base,
    id: 3,
    type: "encouragement_received",
    actorName: "지민",
    actorAvatarKey: tasks.demoAvatarKey("demo-friend-1"),
    availability: "unavailable",
    target: null,
  };
  try {
    const detail = tasks.demoGetDetail(1);
    const row = detail.encouragements.find((item) => item.id === 11);
    if (row)
      cheer = {
        ...cheer,
        availability: "available",
        target: "/?occurrence=1&encouragement=11",
        occurrenceId: 1,
        encouragementId: 11,
        taskTitle: detail.occurrence.title_snapshot,
        messagePreview: row.visibility === "visible" ? row.message : null,
        reaction: row.visibility === "visible" ? row.reaction : null,
      };
  } catch {}
  const data = connections();
  const pending = data ? data.incoming.some((item) => item.id === 41) : true;
  const friend = data ? data.friends.some((item) => item.id === "demo-friend-1") : true;
  const daily = demoGetDailyEncouragement(1);
  return [
    {
      ...base,
      id: 4,
      type: "encouragement_received",
      actorName: daily.authorName,
      actorAvatarKey: daily.authorAvatarKey,
      dailyEncouragementId: daily.id,
      availability: "available",
      target: "/?dailyEncouragement=" + daily.id,
      messagePreview: daily.message,
      reaction: daily.reaction,
    },
    cheer,
    {
      ...base,
      id: 2,
      type: "connection_request",
      actorName: "민서",
      actorAvatarKey: pending ? tasks.demoAvatarKey("demo-requester-1") : "lemon",
      connectionRequestId: 41,
      availability: pending ? "available" : "unavailable",
      target: pending ? "/friends/?request=41" : null,
    },
    {
      ...base,
      id: 1,
      type: "connection_accepted",
      actorName: "지민",
      actorAvatarKey: tasks.demoAvatarKey("demo-friend-1"),
      availability: friend ? "available" : "unavailable",
      target: friend ? "/friends/?friend=demo-friend-1" : null,
    },
  ].map((item) => ({ ...item, readAt: read.get(item.id) ?? null })) as InboxItem[];
}
export function demoListInbox({
  filter,
  cursor,
  limit = 50,
}: {
  filter: InboxFilter;
  cursor?: number;
  limit?: number;
}) {
  const rows = demoInboxItems().filter(
    (item) =>
      (!cursor || item.id < cursor) &&
      (filter === "all" ||
        (filter === "encouragement"
          ? item.type === "encouragement_received"
          : item.type !== "encouragement_received")),
  );
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? items.at(-1)!.id : null };
}
export function demoMarkInboxRead(id: number) {
  if (!demoInboxItems().some((item) => item.id === id)) return false;
  read.set(id, new Date().toISOString());
  window.dispatchEvent(new Event("lemon:notifications-changed"));
  return true;
}
export function demoMarkAllInboxRead(throughId: number) {
  const readAt = new Date().toISOString();
  let updatedCount = 0;
  demoInboxItems().forEach((item) => {
    if (item.id <= throughId && !item.readAt) {
      read.set(item.id, readAt);
      updatedCount++;
    }
  });
  window.dispatchEvent(new Event("lemon:notifications-changed"));
  return { readAt, updatedCount };
}

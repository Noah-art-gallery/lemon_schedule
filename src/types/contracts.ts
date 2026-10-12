export const recurrenceValues = ["none", "daily", "weekly", "monthly"] as const;
export type Recurrence = (typeof recurrenceValues)[number];

export const occurrenceStatusValues = ["pending", "completed"] as const;
export type OccurrenceStatus = (typeof occurrenceStatusValues)[number];

export const connectionRequestStatusValues = [
  "pending",
  "accepted",
  "rejected",
  "cancelled",
] as const;
export type ConnectionRequestStatus = (typeof connectionRequestStatusValues)[number];

export const reactionValues = ["lemon", "clap", "heart", "cheer"] as const;
export type Reaction = (typeof reactionValues)[number];

export const encouragementVisibilityValues = [
  "visible",
  "hidden_by_owner",
  "deleted_by_author",
] as const;
export type EncouragementVisibility = (typeof encouragementVisibilityValues)[number];

export const notificationTypeValues = [
  "connection_request",
  "connection_accepted",
  "task_completed",
  "encouragement_received",
] as const;
export type NotificationType = (typeof notificationTypeValues)[number];

export type Platform = "android" | "ios";

export interface Occurrence {
  occurrenceKey: string;
  taskId: string;
  ownerId: string;
  title: string;
  dueDate: string;
  dueTime: string | null;
  recurrence: Recurrence;
  status: OccurrenceStatus;
  completedAt: string | null;
}

export interface TodaySummary {
  scheduledCount: number;
  completedCount: number;
  percent: number | null;
  empty: boolean;
}

export interface CompletionCursor {
  firstCompletedAt: string;
  occurrenceId: number;
}
export interface EncouragementSummary {
  count: number;
  reactions: Record<Reaction, number>;
  latestMessage: {
    encouragementId: number;
    authorName: string;
    message: string;
    createdAt: string;
  } | null;
  myEncouragement: {
    id: number;
    reaction: Reaction | null;
    message: string | null;
    visibility: EncouragementVisibility;
  } | null;
}
export interface SocialActivityItem {
  occurrence: import("@/lib/supabase/database.types").TaskOccurrenceRow;
  owner: { id: string; displayName: string };
  summary: EncouragementSummary;
}
export interface OwnHistoryItem {
  occurrence: import("@/lib/supabase/database.types").TaskOccurrenceRow;
  taskDeleted: boolean;
  summary: EncouragementSummary;
}
export interface OccurrenceDetail {
  occurrence: import("@/lib/supabase/database.types").TaskOccurrenceRow;
  owner: { id: string; displayName: string };
  taskDeleted: boolean;
  permissions: { canEdit: boolean; canComplete: boolean; canEncourage: boolean };
  encouragements: import("@/features/encouragements/encouragement-service").EncouragementDisplay[];
  summary: EncouragementSummary;
}
export type InboxFilter = "all" | "encouragement" | "connection";
export interface InboxItem {
  id: number;
  type: Exclude<NotificationType, "task_completed">;
  actorName: string;
  createdAt: string;
  readAt: string | null;
  occurrenceId: number | null;
  encouragementId: number | null;
  connectionRequestId: number | null;
  target: string | null;
  availability: "available" | "unavailable";
  taskTitle: string | null;
  messagePreview: string | null;
  reaction: Reaction | null;
}

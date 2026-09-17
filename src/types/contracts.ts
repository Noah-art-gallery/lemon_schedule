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

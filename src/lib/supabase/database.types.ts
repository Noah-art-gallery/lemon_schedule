import type {
  ConnectionRequestStatus,
  EncouragementVisibility,
  NotificationType,
  OccurrenceStatus,
  Platform,
  Reaction,
  Recurrence,
} from "@/types/contracts";

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

type DbTable<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row & Record<string, unknown>;
  Insert: Insert & Record<string, unknown>;
  Update: Update & Record<string, unknown>;
  Relationships: [];
};

export interface ProfileRow {
  id: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

export interface ProfilePrivateRow {
  user_id: string;
  time_zone: string;
  invite_code: string;
  lemon_points: number;
  pet_level: number;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: number;
  owner_id: string;
  title: string;
  due_date: string;
  due_time: string | null;
  recurrence: Recurrence;
  recurrence_changed_at: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskOccurrenceRow {
  id: number;
  task_id: number;
  owner_id: string;
  occurrence_date: string;
  title_snapshot: string;
  due_time: string | null;
  recurrence_snapshot: Recurrence;
  status: OccurrenceStatus;
  completed_at: string | null;
  first_completed_at: string | null;
  reopened_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectionRequestRow {
  id: number;
  requester_id: string;
  addressee_id: string;
  pair_low: string;
  pair_high: string;
  status: ConnectionRequestStatus;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectionRow {
  id: number;
  user_low_id: string;
  user_high_id: string;
  created_at: string;
}

export interface EncouragementRow {
  id: number;
  occurrence_id: number;
  author_id: string;
  owner_id: string;
  reaction: Reaction | null;
  message: string | null;
  visibility: EncouragementVisibility;
  created_at: string;
  updated_at: string;
}

export interface NotificationRow {
  id: number;
  recipient_id: string;
  actor_id: string | null;
  notification_type: NotificationType;
  occurrence_id: number | null;
  connection_request_id: number | null;
  encouragement_id: number | null;
  event_key: string;
  read_at: string | null;
  created_at: string;
}

export type Database = {
  public: {
    Tables: {
      profiles: DbTable<ProfileRow>;
      profile_private: DbTable<ProfilePrivateRow>;
      tasks: DbTable<
        TaskRow,
        Pick<TaskRow, "owner_id" | "title" | "due_date" | "due_time" | "recurrence">,
        Partial<Pick<TaskRow, "title" | "due_date" | "due_time" | "recurrence">>
      >;
      task_occurrences: DbTable<
        TaskOccurrenceRow,
        Pick<
          TaskOccurrenceRow,
          | "task_id"
          | "owner_id"
          | "occurrence_date"
          | "title_snapshot"
          | "due_time"
          | "recurrence_snapshot"
        >
      >;
      connection_requests: DbTable<ConnectionRequestRow>;
      connections: DbTable<ConnectionRow>;
      blocks: DbTable<{
        blocker_id: string;
        blocked_id: string;
        created_at: string;
      }>;
      completion_events: DbTable<{
        id: number;
        occurrence_id: number;
        owner_id: string;
        reward_points: number;
        completed_at: string;
      }>;
      encouragements: DbTable<EncouragementRow>;
      notifications: DbTable<NotificationRow>;
      pets: DbTable<{
        user_id: string;
        drawing_path: string | null;
        selected_color: "leaf-green" | "lemon-yellow";
        selected_accessory: "leaf-hat" | null;
        selected_background: "sunny-garden" | null;
        created_at: string;
        updated_at: string;
      }>;
      pet_unlocks: DbTable<{
        user_id: string;
        item_key: string;
        item_kind: "color" | "accessory" | "background";
        unlocked_at: string;
      }>;
      device_tokens: DbTable<{
        id: number;
        user_id: string;
        device_id: string;
        token: string;
        platform: Platform;
        active: boolean;
        created_at: string;
        updated_at: string;
      }>;
    };
    Views: {
      daily_progress: {
        Row: {
          owner_id: string;
          occurrence_date: string;
          scheduled_count: number;
          completed_count: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      set_pet_decorations: {
        Args: {
          target_color: "leaf-green" | "lemon-yellow";
          target_accessory: "leaf-hat" | null;
          target_background: "sunny-garden" | null;
        };
        Returns: Json;
      };
      request_connection: { Args: { target_invite_code: string }; Returns: number };
      update_my_profile: {
        Args: { new_display_name: string | null; new_time_zone: string | null };
        Returns: Json;
      };
      list_blocked_profiles: {
        Args: Record<string, never>;
        Returns: Array<{ user_id: string; display_name: string; blocked_at: string }>;
      };
      respond_connection_request: {
        Args: { target_request_id: number; accept_request: boolean };
        Returns: boolean;
      };
      cancel_connection_request: {
        Args: { target_request_id: number };
        Returns: boolean;
      };
      disconnect_friend: { Args: { friend_id: string }; Returns: boolean };
      block_user: { Args: { target_user_id: string }; Returns: boolean };
      unblock_user: { Args: { target_user_id: string }; Returns: boolean };
      delete_task: { Args: { target_task_id: number }; Returns: boolean };
      update_task_schedule: {
        Args: {
          target_task_id: number;
          target_title: string | null;
          target_due_date: string | null;
          target_due_time: string | null;
          target_recurrence: Recurrence | null;
          due_time_provided: boolean;
        };
        Returns: Json;
      };
      create_task_schedule: {
        Args: {
          target_title: string;
          target_due_date: string;
          target_due_time: string | null;
          target_recurrence: Recurrence;
        };
        Returns: Json;
      };
      list_task_occurrences: {
        Args: { target_owner_id: string; range_from: string; range_to: string };
        Returns: TaskOccurrenceRow[];
      };
      get_owner_today: { Args: { target_owner_id: string }; Returns: string };
      complete_occurrence: {
        Args: { target_occurrence_id: number };
        Returns: Json;
      };
      reopen_occurrence: {
        Args: { target_occurrence_id: number };
        Returns: boolean;
      };
      upsert_encouragement: {
        Args: {
          target_occurrence_id: number;
          selected_reaction: Reaction | null;
          selected_message: string | null;
        };
        Returns: number;
      };
      hide_encouragement: {
        Args: { target_encouragement_id: number; hidden: boolean };
        Returns: boolean;
      };
      delete_encouragement: {
        Args: { target_encouragement_id: number };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

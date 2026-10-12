"use client";
import { Check, Circle } from "lucide-react";
import type { TaskOccurrenceRow } from "@/lib/supabase/database.types";
import type { EncouragementSummary } from "@/types/contracts";
import {
  EncouragementThread,
  type EncouragementThreadProps,
} from "@/features/encouragements/encouragement-thread";
import styles from "./task-experience.module.css";
export { EncouragementSummaryView } from "@/features/encouragements/encouragement-thread";
export function TaskRowView({
  occurrence,
  summary,
  taskDeleted = false,
  pending = false,
  onOpen,
  onToggle,
  encouragementProps,
}: {
  occurrence: TaskOccurrenceRow;
  summary?: EncouragementSummary;
  taskDeleted?: boolean;
  pending?: boolean;
  onOpen: () => void;
  onToggle?: () => void;
  encouragementProps?: Omit<EncouragementThreadProps, "occurrenceId" | "summary">;
}) {
  return (
    <div className={styles.row}>
      <div className={styles.rowBody}>
        <button className={styles.rowOpen} data-occurrence-trigger={occurrence.id} onClick={onOpen}>
          <span className={styles.taskTitle}>{occurrence.title_snapshot}</span>
          <span className={styles.meta}>
            {occurrence.due_time ? <span>{occurrence.due_time.slice(0, 5)}</span> : null}
            {occurrence.recurrence_snapshot !== "none" ? (
              <span>
                {{ daily: "매일", weekly: "매주", monthly: "매월" }[occurrence.recurrence_snapshot]}
              </span>
            ) : null}
            {taskDeleted ? <span>삭제된 할 일 · 기록만 보기</span> : null}
            {!onToggle ? (
              <span>
                {occurrence.status === "completed"
                  ? "완료"
                  : occurrence.first_completed_at
                    ? "다시 진행 중"
                    : "진행 중"}
              </span>
            ) : null}
          </span>
        </button>
      </div>
      {onToggle && !taskDeleted ? (
        <button
          className={styles.toggle}
          aria-label={`${occurrence.title_snapshot} ${occurrence.status === "completed" ? "완료 취소" : "완료"}`}
          aria-pressed={occurrence.status === "completed"}
          aria-disabled={pending}
          aria-busy={pending}
          onClick={() => {
            if (!pending) onToggle();
          }}
        >
          {occurrence.status === "completed" ? (
            <Check size={19} aria-hidden="true" />
          ) : (
            <Circle size={19} aria-hidden="true" />
          )}
          <span>{occurrence.status === "completed" ? "완료됨" : "완료"}</span>
        </button>
      ) : null}
      {summary && (summary.count > 0 || encouragementProps?.canCompose) ? (
        <div className={styles.rowThread}>
          <EncouragementThread
            {...encouragementProps}
            occurrenceId={occurrence.id}
            summary={summary}
          />
        </div>
      ) : null}
    </div>
  );
}

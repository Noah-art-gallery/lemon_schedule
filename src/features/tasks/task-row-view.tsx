"use client";
import { Check, MessageCircle } from "lucide-react";
import type { TaskOccurrenceRow } from "@/lib/supabase/database.types";
import type { EncouragementSummary } from "@/types/contracts";
import { reactionLabels } from "@/features/encouragements/encouragement-composer";
import styles from "./task-experience.module.css";
export function EncouragementSummaryView({ summary }: { summary: EncouragementSummary }) {
  if (!summary.count) return null;
  return (
    <span className={styles.summary}>
      <MessageCircle size={15} aria-hidden="true" />
      <span className={styles.summaryText}>
        응원 {summary.count}
        {summary.latestMessage
          ? ` · ${summary.latestMessage.authorName}: ${summary.latestMessage.message}`
          : ` · ${Object.entries(summary.reactions)
              .filter(([, count]) => count)
              .map(
                ([reaction, count]) =>
                  `${reactionLabels[reaction as keyof typeof reactionLabels]} ${count}`,
              )
              .join(" · ")}`}
      </span>
    </span>
  );
}
export function TaskRowView({
  occurrence,
  summary,
  taskDeleted = false,
  pending = false,
  onOpen,
  onToggle,
}: {
  occurrence: TaskOccurrenceRow;
  summary?: EncouragementSummary;
  taskDeleted?: boolean;
  pending?: boolean;
  onOpen: () => void;
  onToggle?: () => void;
}) {
  return (
    <div className={styles.row}>
      {onToggle && !taskDeleted ? (
        <button
          className={styles.toggle}
          aria-label={`${occurrence.title_snapshot} ${occurrence.status === "completed" ? "완료 취소" : "완료"}`}
          aria-pressed={occurrence.status === "completed"}
          disabled={pending}
          onClick={onToggle}
        >
          <span
            className={`${styles.check} ${occurrence.status === "completed" ? styles.checked : ""}`}
          >
            {occurrence.status === "completed" ? <Check size={16} /> : null}
          </span>
        </button>
      ) : null}
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
              <span>{occurrence.status === "completed" ? "완료" : "다시 진행 중"}</span>
            ) : null}
          </span>
          {summary ? <EncouragementSummaryView summary={summary} /> : null}
        </button>
      </div>
    </div>
  );
}

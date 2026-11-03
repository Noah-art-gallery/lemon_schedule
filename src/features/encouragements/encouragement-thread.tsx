"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackToast, LoadingIndicator, useFeedback } from "@/components/ui/feedback";
import { useAuth } from "@/features/auth/auth-provider";
import { getOccurrenceDetail } from "@/features/tasks/task-service";
import { demoGetDetail, demoDeleteEncouragement } from "@/features/tasks/demo-task-store";
import { deleteEncouragement } from "./encouragement-service";
import { ReactionImage, reactionLabels } from "./reaction-image";
import type { EncouragementSummary, OccurrenceDetail, Reaction } from "@/types/contracts";
import styles from "@/features/tasks/task-experience.module.css";

export function EncouragementSummaryView({ summary }: { summary: EncouragementSummary }) {
  if (!summary.count) return null;
  return (
    <div className={styles.summary}>
      <MessageCircle size={16} aria-hidden="true" />
      <span className={styles.summaryText}>
        <strong>응원 {summary.count}개</strong>
        {summary.latestMessage ? (
          <span>
            {summary.latestMessage.authorName}: {summary.latestMessage.message}
          </span>
        ) : (
          <ReactionCounts summary={summary} />
        )}
      </span>
    </div>
  );
}
function ReactionCounts({ summary }: { summary: EncouragementSummary }) {
  return (
    <span className={styles.reactionCounts}>
      {Object.entries(summary.reactions)
        .filter(([, count]) => count > 0)
        .map(([reaction, count]) => (
          <span
            key={reaction}
            className={styles.reactionCount}
            role="img"
            aria-label={`${reactionLabels[reaction as Reaction]} ${count}개`}
          >
            <ReactionImage reaction={reaction as Reaction} decorative />
            <span aria-hidden="true">{count}</span>
          </span>
        ))}
    </span>
  );
}
export interface EncouragementThreadProps {
  occurrenceId: number;
  summary: EncouragementSummary;
  initialDetail?: OccurrenceDetail;
  targetEncouragementId?: number | null;
  onChanged?: (detail: OccurrenceDetail) => void;
  onBusyChange?: (busy: boolean) => void;
  /** Change when access to the owner is revoked; this discards cached records. */
  accessKey?: string | number;
}
export function EncouragementThread(props: EncouragementThreadProps) {
  const { demo, user } = useAuth();
  return (
    <ThreadState
      key={`${demo ? "demo" : user?.id}:${props.occurrenceId}:${props.accessKey ?? ""}`}
      {...props}
    />
  );
}
function ThreadState({
  occurrenceId,
  summary,
  initialDetail,
  targetEncouragementId,
  onChanged,
  onBusyChange,
}: EncouragementThreadProps) {
  const { demo, user } = useAuth();
  const viewer = demo ? "demo" : user?.id;
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const restorePermissionFocus = useRef(false);
  const deleteTrigger = useRef<HTMLButtonElement | null>(null);
  const [expanded, setExpanded] = useState(Boolean(targetEncouragementId));
  const [detail, setDetail] = useState(initialDetail ?? null);
  const [loading, setLoading] = useState(false);
  const { feedback, showFeedback, dismissFeedback } = useFeedback();
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const generation = useRef(0);
  const stale = useRef(false);
  const alive = useRef(true);
  const lock = useRef(false);
  const callbacks = useRef({ onChanged, onBusyChange });
  useEffect(() => {
    callbacks.current = { onChanged, onBusyChange };
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- invalidate in-flight requests on unmount
      generation.current++;
    };
  }, []);
  const summaryVersion = JSON.stringify(summary);
  useEffect(() => {
    if (initialDetail) {
      queueMicrotask(() => {
        if (alive.current) setDetail(initialDetail);
      });
    }
  }, [initialDetail]);
  useEffect(() => {
    queueMicrotask(() => {
      if (!alive.current || lock.current || initialDetail) return;
      if (detail) stale.current = true;
      setDetail((previous) => (previous ? { ...previous, summary } : previous));
      if (expanded && detail) void load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh loaded rows only when the incoming summary changes
  }, [summaryVersion]);
  const currentSummary = detail?.summary ?? summary;
  async function load() {
    const version = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const fresh = demo
        ? demoGetDetail(occurrenceId)
        : await getOccurrenceDetail({ occurrenceId });
      if (!alive.current || version !== generation.current) return;
      stale.current = false;
      setDetail(fresh);
      setForbidden(false);
      return fresh;
    } catch (cause) {
      if (!alive.current || version !== generation.current) return;
      reportError(cause);
    } finally {
      if (alive.current && version === generation.current) setLoading(false);
    }
  }
  function reportError(cause: unknown, showReadError = true) {
    const denied =
      cause instanceof Error &&
      "code" in cause &&
      (cause.code === "FORBIDDEN" || cause.code === "NOT_FOUND");
    if (denied) {
      const active = document.activeElement;
      restorePermissionFocus.current = Boolean(
        root.current &&
        !root.current.closest("[hidden]") &&
        content.current &&
        !content.current.hidden &&
        (root.current.contains(active) || (lock.current && active === document.body)),
      );
      setForbidden(true);
      setDetail(null);
    }
    if (denied || showReadError)
      setError(cause instanceof Error ? cause.message : "응원을 불러오지 못했어요");
  }
  useEffect(() => {
    if (!forbidden || !restorePermissionFocus.current) return;
    restorePermissionFocus.current = false;
    const container = root.current;
    const active = document.activeElement;
    if (
      container &&
      !container.closest("[hidden]") &&
      content.current &&
      !content.current.hidden &&
      (active === document.body || container.contains(active))
    )
      trigger.current?.focus();
  }, [forbidden]);
  useEffect(() => {
    if (!targetEncouragementId) return;
    // Deep links are the only automatic expansion; ordinary cards do no detail reads.
    queueMicrotask(() => {
      if (alive.current) {
        setExpanded(true);
        if (!initialDetail) void load();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- target changes, not summary refreshes, open a deep link
  }, [targetEncouragementId]);
  useEffect(() => {
    if (!expanded || loading || !detail || !targetEncouragementId) return;
    const target = root.current?.querySelector<HTMLElement>(
      `[data-encouragement-id="${targetEncouragementId}"]`,
    );
    target?.scrollIntoView?.({ block: "nearest" });
    target?.focus();
  }, [expanded, loading, detail, targetEncouragementId]);
  async function remove() {
    if (lock.current || deleting === null) return;
    lock.current = true;
    setSaving(true);
    callbacks.current.onBusyChange?.(true);
    const version = ++generation.current;
    try {
      if (demo) demoDeleteEncouragement(deleting);
      else await deleteEncouragement(deleting);
      const fresh = demo
        ? demoGetDetail(occurrenceId)
        : await getOccurrenceDetail({ occurrenceId });
      if (!alive.current || version !== generation.current) return;
      setDetail(fresh);
      showFeedback({ kind: "success", title: "응원을 삭제했어요" });
      setDeleting(null);
      callbacks.current.onChanged?.(fresh);
      trigger.current?.focus();
    } catch (cause) {
      if (alive.current && version === generation.current) reportError(cause);
    } finally {
      lock.current = false;
      if (alive.current) {
        setSaving(false);
        callbacks.current.onBusyChange?.(false);
      }
    }
  }

  const visible = detail?.encouragements.filter((item) => item.visibility === "visible") ?? [];
  return (
    <div ref={root} className={styles.thread}>
      <FeedbackToast feedback={feedback} onDismiss={dismissFeedback} />
      <div className={styles.threadActions}>
        <button
          ref={trigger}
          type="button"
          className={styles.threadToggle}
          aria-label={`응원 ${currentSummary.count}개 ${expanded ? "접기" : "펼치기"}`}
          aria-expanded={expanded}
          aria-controls={`${id}-content`}
          onClick={() => {
            setExpanded(!expanded);
            if (!expanded && (!detail || stale.current) && !loading) void load();
          }}
        >
          <MessageCircle size={15} aria-hidden="true" />
          응원 {currentSummary.count}개
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>
      {!forbidden && currentSummary.count > 0 ? (
        currentSummary.latestMessage ? (
          <p className={styles.threadPreview}>
            {currentSummary.latestMessage.authorName}: {currentSummary.latestMessage.message}
          </p>
        ) : (
          <ReactionCounts summary={currentSummary} />
        )
      ) : null}
      <div
        ref={content}
        id={`${id}-content`}
        hidden={!expanded}
        role="region"
        aria-label="응원 내역"
      >
        {loading ? <LoadingIndicator compact label="응원 불러오는 중" /> : null}
        {error ? (
          <div className={styles.error} role="alert">
            {error}
            <Button variant="ghost" onClick={() => void load()}>
              다시 시도
            </Button>
          </div>
        ) : null}
        {!loading && !error && detail && !visible.length ? (
          <p className={styles.status}>아직 응원이 없어요</p>
        ) : null}
        {!loading &&
        detail &&
        targetEncouragementId &&
        !visible.some((item) => item.id === targetEncouragementId) ? (
          <p role="status" className={styles.status}>
            이 응원은 삭제되었거나 볼 수 없어요
          </p>
        ) : null}
        {!forbidden
          ? visible.map((item) => (
              <article
                key={item.id}
                data-encouragement-id={item.id}
                tabIndex={-1}
                className={`${styles.cheer} ${item.id === targetEncouragementId ? styles.highlight : ""}`}
              >
                <div className={styles.cheerHead}>
                  <strong>{item.authorName}</strong>
                  {item.author_id === viewer ? (
                    <div className={styles.threadActions}>
                      <button
                        className={`${styles.threadToggle} ${styles.danger}`}
                        disabled={saving}
                        onClick={(event) => {
                          deleteTrigger.current = event.currentTarget;
                          setDeleting(item.id);
                        }}
                      >
                        응원 삭제
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className={styles.reactionMessage}>
                  {item.reaction ? <ReactionImage reaction={item.reaction} /> : null}
                  {item.message ? <p>{item.message}</p> : null}
                </div>
                <small>
                  {new Intl.DateTimeFormat("ko-KR", {
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(item.created_at))}
                </small>
              </article>
            ))
          : null}
        {deleting !== null ? (
          <section className={styles.inlineConfirm} aria-label="응원 삭제하기">
            <p>보낸 응원을 삭제할까요?</p>
            <div className={styles.actions}>
              <Button
                autoFocus
                variant="secondary"
                disabled={saving}
                onClick={() => {
                  setDeleting(null);
                  (deleteTrigger.current?.isConnected
                    ? deleteTrigger.current
                    : trigger.current
                  )?.focus();
                }}
              >
                취소
              </Button>
              <Button variant="danger" loading={saving} onClick={() => void remove()}>
                삭제하기
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppError } from "@/lib/errors";
import { useAuth } from "@/features/auth/auth-provider";
import { getOccurrenceDetail } from "@/features/tasks/task-service";
import {
  demoGetDetail,
  demoSendEncouragement,
  demoDeleteEncouragement,
} from "@/features/tasks/demo-task-store";
import { deleteEncouragement, sendEncouragement } from "./encouragement-service";
import { EncouragementComposer } from "./encouragement-composer";
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
  canCompose?: boolean;
  initialDetail?: OccurrenceDetail;
  targetEncouragementId?: number | null;
  onChanged?: (detail: OccurrenceDetail) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  /** Change when access to the owner is revoked; this discards all cached drafts. */
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
  canCompose = false,
  initialDetail,
  targetEncouragementId,
  onChanged,
  onDirtyChange,
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
  const [composing, setComposing] = useState(false);
  const [detail, setDetail] = useState(initialDetail ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [composerVersion, setComposerVersion] = useState(0);
  const generation = useRef(0);
  const stale = useRef(false);
  const alive = useRef(true);
  const lock = useRef(false);
  const callbacks = useRef({ onChanged, onDirtyChange, onBusyChange });
  useEffect(() => {
    callbacks.current = { onChanged, onDirtyChange, onBusyChange };
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
      setComposing(false);
      setComposerVersion((v) => v + 1);
      callbacks.current.onDirtyChange?.(false);
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
  useEffect(() => {
    if (expanded && canCompose && composing && detail?.permissions.canEncourage)
      root.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
  }, [expanded, composing, canCompose, detail?.permissions.canEncourage]);
  async function send(reaction: Reaction | null, message: string) {
    if (lock.current)
      throw new AppError("CONFLICT", "다른 응원을 처리 중이에요. 잠시 후 다시 시도해 주세요");
    lock.current = true;
    setSaving(true);
    setError("");
    setLoading(false);
    callbacks.current.onBusyChange?.(true);
    const version = ++generation.current;
    try {
      if (demo) demoSendEncouragement(occurrenceId, reaction, message);
      else await sendEncouragement(occurrenceId, reaction, message);
      const fresh = demo
        ? demoGetDetail(occurrenceId)
        : await getOccurrenceDetail({ occurrenceId });
      if (!alive.current || version !== generation.current) return;
      setDetail(fresh);
      callbacks.current.onChanged?.(fresh);
    } catch (cause) {
      if (alive.current && version === generation.current) reportError(cause, false);
      throw cause;
    } finally {
      lock.current = false;
      if (alive.current) {
        setSaving(false);
        callbacks.current.onBusyChange?.(false);
      }
    }
  }
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
      setDeleting(null);
      setComposing(false);
      setComposerVersion((v) => v + 1);
      callbacks.current.onDirtyChange?.(false);
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
  function openComposer() {
    root.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    setExpanded(true);
    setComposing(true);
    if (!detail || stale.current) void load();
  }
  const visible = detail?.encouragements.filter((item) => item.visibility === "visible") ?? [];
  return (
    <div ref={root} className={styles.thread}>
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
        {!forbidden && canCompose && (!detail || detail.permissions.canEncourage) ? (
          <Button variant="ghost" onClick={openComposer}>
            {currentSummary.myEncouragement ? "응원 수정" : "응원 남기기"}
          </Button>
        ) : null}
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
        {loading ? (
          <p role="status" className={styles.status}>
            응원 불러오는 중
          </p>
        ) : null}
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
          <section className={styles.inlineConfirm} aria-label="응원 삭제 확인">
            <p>보낸 응원을 삭제할까요? 작성 중인 내용도 함께 지워집니다.</p>
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
                삭제 확인
              </Button>
            </div>
          </section>
        ) : null}
        {canCompose && composing && detail?.permissions.canEncourage && !forbidden ? (
          <EncouragementComposer
            key={composerVersion}
            existing={detail.summary.myEncouragement}
            busy={saving}
            onSend={send}
            onDirtyChange={(value) => callbacks.current.onDirtyChange?.(value)}
          />
        ) : null}
      </div>
    </div>
  );
}

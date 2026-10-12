"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { EncouragementThread } from "@/features/encouragements/encouragement-thread";
import type { OccurrenceDetail } from "@/types/contracts";
import {
  completeOccurrence,
  deleteTask,
  getOccurrenceDetail,
  getTaskSource,
  reopenOccurrence,
  updateTask,
  type TaskInput,
} from "./task-service";
import {
  demoGetDetail,
  demoGetTask,
  demoUpdateTask,
  demoDeleteTask,
  demoToggleOccurrence,
} from "./demo-task-store";
import { TaskEditor } from "./task-editor";
import styles from "./task-experience.module.css";

export interface OccurrenceDetailPanelProps {
  occurrenceId: number | null;
  encouragementId?: number | null;
  onClose: () => void;
  onChanged?: () => void;
  onCompletionChanged?: (occurrenceId: number, status: "pending" | "completed") => void;
  onResolved?: (detail: OccurrenceDetail) => void;
  notice?: ReactNode;
}
export function OccurrenceDetailPanel({
  occurrenceId,
  encouragementId,
  onClose,
  onChanged,
  onCompletionChanged,
  onResolved,
  notice,
}: OccurrenceDetailPanelProps) {
  const { demo, user } = useAuth();
  const viewer = demo ? "demo" : user?.id;
  const [detail, setDetail] = useState<OccurrenceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<TaskInput | null>(null);
  const [discard, setDiscard] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [effectiveId, setEffectiveId] = useState(occurrenceId);
  const [feedback, setFeedback] = useState("");
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const restoreDetailFocus = useRef(false);
  const dirty = useRef(false);
  const discardAction = useRef<(() => void) | null>(null);
  const lock = useRef(false);
  const generation = useRef(0);
  const activeId = useRef(effectiveId);
  const targetId = useRef(occurrenceId);
  const callbacks = useRef({ onChanged, onCompletionChanged, onResolved, onClose });
  useEffect(() => {
    callbacks.current = { onChanged, onCompletionChanged, onResolved, onClose };
  });
  useEffect(() => {
    targetId.current = occurrenceId;
    if (effectiveId === occurrenceId) return;
    if (dirty.current) {
      discardAction.current = null;
      setDiscard(true);
      return;
    }
    setEffectiveId(occurrenceId);
  }, [occurrenceId, effectiveId]);
  const load = useCallback(
    async (id: number) => {
      const version = ++generation.current;
      setLoading(true);
      setError("");
      try {
        const result = demo ? demoGetDetail(id) : await getOccurrenceDetail({ occurrenceId: id });
        if (version !== generation.current || activeId.current !== id) return;
        setDetail(result);
        callbacks.current.onResolved?.(result);
      } catch (cause) {
        if (version !== generation.current) return;
        setDetail(null);
        setError(cause instanceof Error ? cause.message : "할 일을 불러오지 못했어요");
      } finally {
        if (version === generation.current) setLoading(false);
      }
    },
    [demo],
  );
  useEffect(() => {
    let active = true;
    activeId.current = effectiveId;
    void Promise.resolve().then(() => {
      if (!active) return;
      setDetail(null);
      setEditor(null);
      setDeleteConfirm(false);
      dirty.current = false;
      if (effectiveId !== null) void load(effectiveId);
    });
    return () => {
      active = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- invalidate all in-flight requests
      generation.current++;
    };
  }, [effectiveId, load]);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(""), 2800);
    return () => clearTimeout(timer);
  }, [feedback]);
  useEffect(() => {
    if (!loading && !saving && !editor && detail && restoreDetailFocus.current) {
      restoreDetailFocus.current = false;
      detailHeading.current?.focus();
    }
  }, [loading, saving, editor, detail]);
  function finishEditing() {
    restoreDetailFocus.current = true;
    setEditor(null);
  }
  function beforeClose() {
    if (lock.current) return false;
    if (dirty.current) {
      discardAction.current = null;
      setDiscard(true);
      return false;
    }
    return true;
  }
  function close() {
    dirty.current = false;
    setDiscard(false);
    if (targetId.current !== effectiveId) {
      setEffectiveId(targetId.current);
    } else callbacks.current.onClose();
  }
  async function mutation(action: () => Promise<void> | void, completion = false) {
    if (lock.current || effectiveId === null) return;
    const id = effectiveId;
    lock.current = true;
    setSaving(true);
    setError("");
    try {
      await action();
      if (activeId.current === id) {
        if (completion && callbacks.current.onCompletionChanged && detail) {
          callbacks.current.onCompletionChanged(
            id,
            detail.occurrence.status === "completed" ? "pending" : "completed",
          );
        } else callbacks.current.onChanged?.();
        restoreDetailFocus.current = true;
        await load(id);
      }
    } catch (cause) {
      if (activeId.current === id) {
        setError(cause instanceof Error ? cause.message : "저장하지 못했어요");
        if (
          cause instanceof Error &&
          "code" in cause &&
          (cause.code === "FORBIDDEN" || cause.code === "NOT_FOUND")
        ) {
          setDetail(null);
          dirty.current = false;
        }
      }
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  async function beginEdit() {
    if (!detail || lock.current) return;
    lock.current = true;
    setSaving(true);
    setError("");
    const id = effectiveId;
    try {
      const original = demo
        ? demoGetTask(detail.occurrence.task_id)
        : await getTaskSource(detail.occurrence.task_id);
      if (activeId.current === id) setEditor(original);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "할 일을 불러오지 못했어요");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  return (
    <Panel
      open={effectiveId !== null}
      title={editor ? "할 일 수정" : "할 일 상세"}
      onClose={close}
      onBeforeClose={beforeClose}
    >
      {!loading && detail?.occurrence.id === effectiveId ? notice : null}
      {discard ? (
        <section className={styles.inlineConfirm} role="alert">
          <p>작성 중인 내용을 버릴까요?</p>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              autoFocus
              onClick={() => {
                setDiscard(false);
                discardAction.current = null;
                targetId.current = effectiveId;
              }}
            >
              계속 작성
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                dirty.current = false;
                setDiscard(false);
                if (discardAction.current) {
                  discardAction.current();
                  discardAction.current = null;
                } else close();
              }}
            >
              내용 버리기
            </Button>
          </div>
        </section>
      ) : null}
      {loading ? (
        <p className={styles.skeleton} role="status">
          불러오는 중
        </p>
      ) : null}
      {error ? (
        <div role="alert" className={styles.error}>
          {error}
          {!detail ? (
            <Button
              variant="secondary"
              onClick={() => effectiveId !== null && void load(effectiveId)}
            >
              다시 시도
            </Button>
          ) : null}
        </div>
      ) : null}
      {!loading && detail && detail.occurrence.id === effectiveId && editor ? (
        <TaskEditor
          key={`${effectiveId}-edit`}
          initial={editor}
          editing
          onBusyChange={(busy) => {
            lock.current = busy;
          }}
          onDirtyChange={(value) => {
            dirty.current = value;
          }}
          onCancel={() => {
            if (dirty.current) {
              discardAction.current = finishEditing;
              setDiscard(true);
            } else finishEditing();
          }}
          onSave={async (values) => {
            if (demo) demoUpdateTask(detail.occurrence.task_id, values);
            else
              await updateTask({
                taskId: detail.occurrence.task_id,
                ...values,
                dueTime: values.dueTime || null,
              });
            dirty.current = false;
            finishEditing();
            callbacks.current.onChanged?.();
            if (effectiveId !== null) await load(effectiveId);
          }}
        />
      ) : null}
      {!loading && detail && detail.occurrence.id === effectiveId && !editor ? (
        <>
          <div className={styles.detailHeader}>
            <div className={styles.detailTop}>
              <span className={styles.status}>
                {detail.owner.id === viewer ? "내 할 일" : `${detail.owner.displayName}의 할 일`}
              </span>
              {detail.permissions.canEdit ? (
                <details className={styles.more}>
                  <summary aria-label="할 일 메뉴">
                    <MoreHorizontal size={20} />
                  </summary>
                  <div className={styles.menu}>
                    <button disabled={saving} onClick={() => void beginEdit()}>
                      수정
                    </button>
                    <button className={styles.danger} onClick={() => setDeleteConfirm(true)}>
                      삭제
                    </button>
                  </div>
                </details>
              ) : null}
            </div>
            <h3 ref={detailHeading} tabIndex={-1} className={styles.detailTitle}>
              {detail.occurrence.title_snapshot}
            </h3>
            <div className={styles.detailMeta}>
              <span>{detail.occurrence.occurrence_date}</span>
              {detail.occurrence.due_time ? (
                <span>{detail.occurrence.due_time.slice(0, 5)}</span>
              ) : null}
              <span>{detail.occurrence.status === "completed" ? "완료" : "진행 중"}</span>
              {detail.taskDeleted ? <span>삭제된 할 일 · 기록만 보기</span> : null}
            </div>
            {detail.permissions.canComplete ? (
              <Button
                variant="secondary"
                className={styles.loadMore}
                loading={saving}
                onClick={() =>
                  void mutation(async () => {
                    if (demo) {
                      if (demoToggleOccurrence(detail.occurrence.id).firstCompletion)
                        setFeedback("완료 · 펫이 1포인트 성장했어요");
                    } else if (detail.occurrence.status === "completed")
                      await reopenOccurrence(detail.occurrence.id);
                    else {
                      const result = await completeOccurrence(detail.occurrence.id);
                      if (result.firstCompletion)
                        setFeedback(`완료 · 펫이 ${result.rewardPoints}포인트 성장했어요`);
                    }
                  }, true)
                }
              >
                {detail.occurrence.status === "completed" ? "완료 취소" : "완료하기"}
              </Button>
            ) : null}
          </div>
          {deleteConfirm ? (
            <section className={styles.inlineConfirm}>
              <p>
                ‘{detail.occurrence.title_snapshot}’
                {detail.occurrence.recurrence_snapshot !== "none" ? " 반복 일정 전체를" : "을"}{" "}
                삭제할까요? 완료한 기록과 포인트는 남습니다.
              </p>
              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  autoFocus
                  disabled={saving}
                  onClick={() => setDeleteConfirm(false)}
                >
                  취소
                </Button>
                <Button
                  variant="danger"
                  loading={saving}
                  onClick={() =>
                    void mutation(async () => {
                      if (demo) demoDeleteTask(detail.occurrence.task_id);
                      else await deleteTask(detail.occurrence.task_id);
                      setDeleteConfirm(false);
                      dirty.current = false;
                      callbacks.current.onClose();
                    })
                  }
                >
                  할 일 삭제
                </Button>
              </div>
            </section>
          ) : null}
          <EncouragementThread
            key={effectiveId}
            occurrenceId={detail.occurrence.id}
            summary={detail.summary}
            initialDetail={detail}
            canCompose={detail.permissions.canEncourage}
            targetEncouragementId={encouragementId}
            onDirtyChange={(value) => {
              dirty.current = value;
            }}
            onBusyChange={(busy) => {
              lock.current = busy;
            }}
            onChanged={(fresh) => {
              setDetail(fresh);
              callbacks.current.onChanged?.();
            }}
          />
        </>
      ) : null}
      {feedback ? (
        <p role="status" className={styles.notice}>
          {feedback}
          {demo ? " · 미리보기" : ""}
        </p>
      ) : null}
    </Panel>
  );
}

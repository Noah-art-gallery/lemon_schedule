"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import {
  EncouragementComposer,
  reactionLabels,
} from "@/features/encouragements/encouragement-composer";
import {
  sendEncouragement,
  hideEncouragement,
  deleteEncouragement,
  type EncouragementDisplay,
} from "@/features/encouragements/encouragement-service";
import type { OccurrenceDetail, Reaction } from "@/types/contracts";
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
  demoSendEncouragement,
  demoHideEncouragement,
  demoDeleteEncouragement,
} from "./demo-task-store";
import { TaskEditor } from "./task-editor";
import styles from "./task-experience.module.css";

export interface OccurrenceDetailPanelProps {
  occurrenceId: number | null;
  encouragementId?: number | null;
  onClose: () => void;
  onChanged?: () => void;
  onResolved?: (detail: OccurrenceDetail) => void;
  notice?: ReactNode;
}
export function OccurrenceDetailPanel({
  occurrenceId,
  encouragementId,
  onClose,
  onChanged,
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
  const [deleteCheer, setDeleteCheer] = useState<number | null>(null);
  const [effectiveId, setEffectiveId] = useState(occurrenceId);
  const [composerVersion, setComposerVersion] = useState(0);
  const [feedback, setFeedback] = useState("");
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const restoreDetailFocus = useRef(false);
  const dirty = useRef(false);
  const discardAction = useRef<(() => void) | null>(null);
  const lock = useRef(false);
  const generation = useRef(0);
  const activeId = useRef(effectiveId);
  const targetId = useRef(occurrenceId);
  const callbacks = useRef({ onChanged, onResolved, onClose });
  useEffect(() => {
    callbacks.current = { onChanged, onResolved, onClose };
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
      setDeleteCheer(null);
      setComposerVersion((value) => value + 1);
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
    if (loading || !detail || !encouragementId) return;
    document
      .getElementById(`encouragement-${encouragementId}`)
      ?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [loading, detail, encouragementId]);
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
  async function mutation(action: () => Promise<void> | void) {
    if (lock.current || effectiveId === null) return;
    const id = effectiveId;
    lock.current = true;
    setSaving(true);
    setError("");
    try {
      await action();
      if (activeId.current === id) {
        callbacks.current.onChanged?.();
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
  async function send(reaction: Reaction | null, message: string) {
    if (effectiveId === null) return;
    const id = effectiveId;
    const version = ++generation.current;
    lock.current = true;
    try {
      if (demo) demoSendEncouragement(id, reaction, message);
      else await sendEncouragement(id, reaction, message);
      if (activeId.current !== id || version !== generation.current) return;
      callbacks.current.onChanged?.();
      const fresh = demo ? demoGetDetail(id) : await getOccurrenceDetail({ occurrenceId: id });
      if (activeId.current === id && version === generation.current) setDetail(fresh);
    } catch (cause) {
      if (
        activeId.current === id &&
        cause instanceof Error &&
        "code" in cause &&
        (cause.code === "FORBIDDEN" || cause.code === "NOT_FOUND")
      ) {
        setDetail(null);
        dirty.current = false;
        setError(cause.message);
      }
      throw cause;
    } finally {
      lock.current = false;
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
  function cheerRow(item: EncouragementDisplay) {
    return (
      <article
        key={item.id}
        id={`encouragement-${item.id}`}
        className={`${styles.cheer} ${item.id === encouragementId ? styles.highlight : ""}`}
      >
        <div className={styles.cheerHead}>
          <strong>
            {item.authorName}
            {item.reaction ? ` · ${reactionLabels[item.reaction]}` : ""}
          </strong>
          {item.author_id === viewer || detail?.owner.id === viewer ? (
            <details className={styles.more}>
              <summary aria-label={`${item.authorName} 응원 메뉴`}>
                <MoreHorizontal size={18} />
              </summary>
              <div className={styles.menu}>
                {item.author_id === viewer ? (
                  <>
                    <button
                      onClick={() => {
                        document
                          .getElementById("detail-composer")
                          ?.scrollIntoView({ block: "center" });
                        document
                          .querySelector<HTMLTextAreaElement>("#detail-composer textarea")
                          ?.focus();
                      }}
                    >
                      수정
                    </button>
                    <button
                      className={styles.danger}
                      disabled={saving}
                      onClick={() => setDeleteCheer(item.id)}
                    >
                      응원 삭제
                    </button>
                  </>
                ) : null}
                {detail?.owner.id === viewer ? (
                  <button
                    disabled={saving}
                    onClick={() =>
                      void mutation(async () => {
                        const hidden = item.visibility !== "hidden_by_owner";
                        if (demo) demoHideEncouragement(item.id, hidden);
                        else await hideEncouragement(item.id, hidden);
                      })
                    }
                  >
                    {item.visibility === "hidden_by_owner" ? "다시 표시" : "숨기기"}
                  </button>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
        {item.message ? <p>{item.message}</p> : null}
        <small>{new Date(item.created_at).toLocaleDateString("ko-KR")}</small>
      </article>
    );
  }
  const hidden =
    detail?.encouragements.filter((item) => item.visibility === "hidden_by_owner") ?? [];
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
                  })
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
          {deleteCheer !== null ? (
            <section className={styles.inlineConfirm} aria-label="응원 삭제 확인">
              <p>보낸 응원을 삭제할까요? 작성 중인 내용도 함께 지워집니다.</p>
              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  autoFocus
                  disabled={saving}
                  onClick={() => setDeleteCheer(null)}
                >
                  취소
                </Button>
                <Button
                  variant="danger"
                  loading={saving}
                  onClick={() =>
                    void mutation(async () => {
                      if (demo) demoDeleteEncouragement(deleteCheer);
                      else await deleteEncouragement(deleteCheer);
                      setDeleteCheer(null);
                      setComposerVersion((value) => value + 1);
                      dirty.current = false;
                    })
                  }
                >
                  삭제 확인
                </Button>
              </div>
            </section>
          ) : null}
          <section aria-label="응원 내역">
            <h3 className={styles.sectionTitle}>
              응원 <span>{detail.summary.count}</span>
            </h3>
            {detail.encouragements.filter((item) => item.visibility === "visible").map(cheerRow)}
            {!detail.summary.count ? <p className={styles.status}>아직 응원이 없어요</p> : null}
          </section>
          {hidden.length > 0 ? (
            <details
              className={styles.hiddenSection}
              open={hidden.some((item) => item.id === encouragementId)}
            >
              <summary>
                {detail.owner.id === viewer ? "숨긴 응원" : "상대가 숨긴 내 응원"} {hidden.length}
              </summary>
              {hidden.map(cheerRow)}
            </details>
          ) : null}
          {detail.permissions.canEncourage ? (
            <div id="detail-composer">
              <EncouragementComposer
                key={`${effectiveId}-${composerVersion}`}
                existing={detail.summary.myEncouragement}
                onSend={send}
                onDirtyChange={(value) => {
                  dirty.current = value;
                }}
              />
            </div>
          ) : null}
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

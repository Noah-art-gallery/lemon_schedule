"use client";
import { Check, Circle, ChevronRight, MessageCircle, Quote, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { FeedbackToast, LoadingIndicator, useFeedback } from "@/components/ui/feedback";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { Panel } from "@/components/ui/panel";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AppError } from "@/lib/errors";
import { reactionValues, type Reaction, type ProfileAvatarKey } from "@/types/contracts";
import { ReactionImage, reactionLabels } from "./reaction-image";
import {
  getEncouragementDay,
  saveDailyEncouragement,
  deleteDailyEncouragement,
  type EncouragementDay,
  type DailyEncouragement,
} from "./daily-encouragement-service";
import {
  demoGetEncouragementDay,
  demoSaveDailyEncouragement,
  demoDeleteDailyEncouragement,
} from "./demo-daily-encouragement-store";
import styles from "./daily-encouragement.module.css";

export function DailyEncouragementContent({ item }: { item: DailyEncouragement }) {
  return (
    <div className={styles.content}>
      <ReactionImage reaction={item.reaction} />
      <div>
        {item.quote ? <span className={styles.quote}>{item.quote.title}</span> : null}
        {item.message ? <p>{item.message}</p> : null}
      </div>
    </div>
  );
}
export function DailyFriendCard({
  friend,
  compact = false,
  onOpen,
  onOpenOccurrence,
  triggerRef,
  onDirtyChange,
  onBusyChange,
}: {
  friend: { id: string; displayName: string; avatarKey: ProfileAvatarKey };
  compact?: boolean;
  onOpen?: () => void;
  onOpenOccurrence?: (id: number) => void;
  triggerRef?: (node: HTMLButtonElement | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { demo, user } = useAuth();
  const [day, setDay] = useState<EncouragementDay | null>(null);
  const dayRef = useRef(day);
  const [loading, setLoading] = useState(true);
  const { feedback, showFeedback, dismissFeedback } = useFeedback();
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [message, setMessage] = useState("");
  const [quote, setQuote] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [discard, setDiscard] = useState(false);
  const request = useRef(0);
  const lock = useRef(false);
  const mounted = useRef(true);
  const savedHeading = useRef<HTMLHeadingElement>(null);
  const sendTrigger = useRef<HTMLButtonElement>(null);
  const editTrigger = useRef<HTMLButtonElement>(null);
  const firstReaction = useRef<HTMLButtonElement>(null);
  const callbacks = useRef({ onDirtyChange, onBusyChange });
  useEffect(() => {
    callbacks.current = { onDirtyChange, onBusyChange };
  });
  useEffect(() => {
    dayRef.current = day;
  }, [day]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- invalidate the latest async request on cleanup
      request.current++;
      callbacks.current.onDirtyChange?.(false);
      callbacks.current.onBusyChange?.(false);
    };
  }, []);
  useEffect(() => {
    let active = true;
    async function load() {
      if (lock.current) return;
      const version = ++request.current;
      try {
        const next = demo
          ? demoGetEncouragementDay(friend.id)
          : await getEncouragementDay(friend.id);
        if (!active || version !== request.current) return;
        if (dayRef.current && dayRef.current.day !== next.day) {
          setEditing(false);
          setMessage("");
          setReaction(null);
          setQuote(null);
          callbacks.current.onDirtyChange?.(false);
          setError("새로운 하루로 바뀌었어요");
        } else setError("");
        dayRef.current = next;
        setDay(next);
      } catch (cause) {
        if (!active || version !== request.current) return;
        setError(cause instanceof Error ? cause.message : "오늘을 불러오지 못했어요");
        if (
          cause instanceof AppError &&
          ["FORBIDDEN", "NOT_FOUND", "UNAUTHENTICATED"].includes(cause.code)
        ) {
          setDay(null);
          setEditing(false);
          setMessage("");
          setQuote(null);
          setReaction(null);
          callbacks.current.onDirtyChange?.(false);
        }
      } finally {
        if (active && version === request.current) setLoading(false);
      }
    }
    queueMicrotask(() => {
      if (active) void load();
    });
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => {
      active = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- invalidate the latest async request on cleanup
      request.current++;
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [friend.id, demo, user?.id, reload]);
  function start() {
    if (!day || lock.current) return;
    setReaction(day.mine?.reaction ?? null);
    setMessage(day.mine?.message ?? "");
    setQuote(day.mine?.quote?.id ?? null);
    setQuoteOpen(Boolean(day.mine?.quote));
    setEditing(true);
    setError("");
    window.setTimeout(() => {
      if (mounted.current) firstReaction.current?.focus();
    }, 0);
  }
  function changed() {
    callbacks.current.onDirtyChange?.(true);
  }
  function closeComposer() {
    if (lock.current) return;
    const changed =
      reaction !== (day?.mine?.reaction ?? null) ||
      message !== (day?.mine?.message ?? "") ||
      quote !== (day?.mine?.quote?.id ?? null);
    if (changed) setDiscard(true);
    else cancel();
  }
  function cancel() {
    if (lock.current) return;
    setEditing(false);
    setDiscard(false);
    callbacks.current.onDirtyChange?.(false);
    window.setTimeout(() => (editTrigger.current ?? sendTrigger.current)?.focus(), 0);
  }
  async function submit(remove = false) {
    if (!day || lock.current || (!remove && !reaction)) return;
    lock.current = true;
    setBusy(true);
    callbacks.current.onBusyChange?.(true);
    const version = ++request.current;
    setError("");
    try {
      let mine: DailyEncouragement | null;
      if (remove) {
        if (!day.mine) return;
        if (demo) demoDeleteDailyEncouragement(day.mine.id);
        else await deleteDailyEncouragement(day.mine.id);
        mine = null;
      } else {
        const input = {
          ownerId: friend.id,
          day: day.day,
          reaction: reaction!,
          message,
          quotedOccurrenceId: quote,
        };
        mine = demo ? demoSaveDailyEncouragement(input) : await saveDailyEncouragement(input);
      }
      if (!mounted.current || version !== request.current) return;
      const next = { ...day, mine };
      dayRef.current = next;
      setDay(next);
      showFeedback({
        kind: "success",
        title: remove ? "응원을 취소했어요" : day.mine ? "응원을 수정했어요" : "응원을 보냈어요",
      });
      setEditing(false);
      setConfirm(false);
      callbacks.current.onDirtyChange?.(false);
      window.setTimeout(() => (mine ? savedHeading.current : sendTrigger.current)?.focus(), 0);
    } catch (cause) {
      if (!mounted.current || version !== request.current) return;
      setConfirm(false);
      setError(cause instanceof Error ? cause.message : "응원을 보내지 못했어요");
      if (cause instanceof AppError && ["FORBIDDEN", "UNAUTHENTICATED"].includes(cause.code)) {
        setDay(null);
        setEditing(false);
        setMessage("");
        setQuote(null);
        setReaction(null);
        callbacks.current.onDirtyChange?.(false);
      }
    } finally {
      lock.current = false;
      if (mounted.current) {
        setBusy(false);
        callbacks.current.onBusyChange?.(false);
      }
    }
  }
  const completed = day?.occurrences.filter((item) => item.status === "completed").length ?? 0;
  const total = day?.occurrences.length ?? 0;
  const dateLabel = day
    ? new Intl.DateTimeFormat("ko-KR", {
        month: "long",
        day: "numeric",
        weekday: "short",
        timeZone: "UTC",
      }).format(new Date(`${day.day}T12:00:00Z`))
    : "";
  const formId = `daily-form-${friend.id}`;
  return (
    <article
      className={`${styles.card} ${compact ? styles.compact : ""}`}
      aria-label={`${friend.displayName}의 하루`}
    >
      {!compact ? (
        <div className={styles.identityRow}>
          <button
            aria-label={friend.displayName}
            className={styles.header}
            onClick={onOpen}
            ref={triggerRef}
          >
            <ProfileAvatar avatarKey={friend.avatarKey} size={36} />
            <span>
              <strong>{friend.displayName}</strong>
              <time dateTime={day?.day}>{dateLabel || "오늘"}</time>
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          {day && total > 0 ? (
            <span className={styles.completion}>
              <b>{completed}</b>
              <span> / {total} 완료</span>
            </span>
          ) : null}
        </div>
      ) : null}
      <FeedbackToast feedback={feedback} onDismiss={dismissFeedback} />
      {loading ? <LoadingIndicator compact label="오늘을 불러오는 중" /> : null}
      {!editing && error ? (
        <div role="alert" className={styles.error}>
          <p>{error}</p>
          <Button variant="ghost" disabled={busy} onClick={() => setReload((v) => v + 1)}>
            오늘 다시 불러오기
          </Button>
        </div>
      ) : null}
      {day ? (
        <>
          {!compact ? (
            <div className={styles.tasks}>
              {day.occurrences.slice(0, 3).map((item) => (
                <button
                  key={item.id}
                  aria-label={item.title_snapshot}
                  className={styles.task}
                  onClick={() => onOpenOccurrence?.(item.id)}
                >
                  <span className={item.status === "completed" ? styles.done : styles.pending}>
                    {item.status === "completed" ? (
                      <Check size={13} aria-label="완료" />
                    ) : (
                      <Circle size={16} aria-label="진행 중" />
                    )}
                  </span>
                  <span>{item.title_snapshot}</span>
                </button>
              ))}
              {!total ? <p className={styles.empty}>오늘은 등록한 할 일이 없어요</p> : null}
              {total > 3 ? (
                <button className={styles.more} onClick={onOpen}>
                  할 일 {total}개 보기 <ChevronRight size={14} />
                </button>
              ) : null}
            </div>
          ) : null}
          {day.mine ? (
            <section className={styles.saved} aria-label="내가 보낸 응원">
              <div className={styles.savedTop}>
                <h3 ref={savedHeading} tabIndex={-1}>
                  <Check size={13} aria-hidden="true" /> 응원 보냄
                </h3>
                <Button
                  ref={editTrigger}
                  className={styles.edit}
                  variant="ghost"
                  size="sm"
                  onClick={start}
                  disabled={busy}
                >
                  수정
                </Button>
              </div>
              <DailyEncouragementContent item={day.mine} />
            </section>
          ) : (
            <div className={styles.cardFooter}>
              <Button
                ref={sendTrigger}
                className={styles.sendEntry}
                variant="ghost"
                onClick={start}
              >
                <MessageCircle size={16} aria-hidden="true" />
                응원 보내기
              </Button>
            </div>
          )}
        </>
      ) : null}
      <Panel
        open={editing && Boolean(day)}
        history={false}
        title={day?.mine ? "응원 수정" : "응원 보내기"}
        className={styles.composerPanel}
        onClose={closeComposer}
        onBeforeClose={() => !lock.current}
        footer={
          <div className={styles.footer}>
            {day?.mine ? (
              <Button
                variant="ghost"
                className={styles.remove}
                onClick={() => setConfirm(true)}
                disabled={busy}
              >
                응원 취소
              </Button>
            ) : null}
            <Button
              form={formId}
              type="submit"
              fullWidth
              loading={busy}
              disabled={!reaction || busy}
            >
              {day?.mine ? "수정 저장" : "응원 보내기"}
            </Button>
          </div>
        }
      >
        {day ? (
          <form
            id={formId}
            className={styles.form}
            aria-label={`${friend.displayName}에게 하루 응원`}
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className={styles.recipient}>
              <ProfileAvatar avatarKey={friend.avatarKey} size={36} />
              <div>
                <strong>
                  {friend.displayName}
                  <span>에게</span>
                </strong>
                <time dateTime={day.day}>{dateLabel}의 하루</time>
              </div>
            </div>
            <div className={styles.reactions} role="group" aria-label="응원 스티커">
              {reactionValues.map((value, index) => (
                <button
                  ref={index === 0 ? firstReaction : undefined}
                  key={value}
                  type="button"
                  aria-label={reactionLabels[value]}
                  aria-pressed={reaction === value}
                  disabled={busy}
                  onClick={() => {
                    setReaction(value);
                    changed();
                  }}
                >
                  <ReactionImage reaction={value} decorative />
                  <span>{reactionLabels[value]}</span>
                  {reaction === value ? (
                    <Check size={14} className={styles.check} aria-hidden="true" />
                  ) : null}
                </button>
              ))}
            </div>
            <div className={styles.note}>
              <textarea
                aria-label="응원글"
                placeholder="전하고 싶은 말이 있나요?"
                maxLength={120}
                value={message}
                disabled={busy}
                onChange={(event) => {
                  setMessage(event.target.value);
                  changed();
                }}
              />
              <span className={styles.count}>{message.length} / 120</span>
            </div>
            {total ? (
              <div className={styles.quoteControl}>
                <button
                  type="button"
                  className={styles.quoteToggle}
                  aria-expanded={quoteOpen}
                  onClick={() => setQuoteOpen((v) => !v)}
                  disabled={busy}
                >
                  <Quote size={15} aria-hidden="true" />할 일 인용<span>선택</span>
                  <ChevronRight size={14} />
                </button>
                {quoteOpen ? (
                  <label className={styles.quoteSelect}>
                    <span className="sr-only">인용할 할 일</span>
                    <select
                      aria-label="인용할 할 일"
                      value={quote ?? ""}
                      disabled={busy}
                      onChange={(event) => {
                        setQuote(event.target.value ? Number(event.target.value) : null);
                        changed();
                      }}
                    >
                      <option value="">하루 전체에 보내기</option>
                      {day.occurrences.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title_snapshot}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {quote && !quoteOpen ? (
                  <div className={styles.quoteChip}>
                    <span>{day.occurrences.find((item) => item.id === quote)?.title_snapshot}</span>
                    <button
                      type="button"
                      aria-label="인용 해제"
                      disabled={busy}
                      onClick={() => {
                        setQuote(null);
                        changed();
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {error ? (
              <div role="alert" className={styles.error}>
                <p>{error}</p>
                <Button variant="ghost" disabled={busy} onClick={() => setReload((v) => v + 1)}>
                  오늘 다시 불러오기
                </Button>
              </div>
            ) : null}
          </form>
        ) : null}
      </Panel>
      <ConfirmDialog
        open={discard && editing}
        history={false}
        title="작성 중인 응원을 버릴까요?"
        description="아직 보내지 않은 내용이 사라져요"
        confirmLabel="버리고 닫기"
        onCancel={() => setDiscard(false)}
        onConfirm={cancel}
      />
      <ConfirmDialog
        open={confirm}
        title="보낸 응원을 취소할까요?"
        description="친구에게 보낸 스티커와 글이 사라져요"
        confirmLabel="응원 취소"
        loading={busy}
        onCancel={() => {
          if (!busy) setConfirm(false);
        }}
        onConfirm={() => void submit(true)}
      />
    </article>
  );
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Plus, RefreshCw, MessageCircle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { FeedbackToast, LoadingIndicator, useFeedback } from "@/components/ui/feedback";
import { DailyFriendCard } from "@/features/encouragements/daily-friend-card";
import { AppError } from "@/lib/errors";
import { toDateKey } from "@/lib/time";
import type { FriendSummary } from "./connection-service";
import { demoListTimeline } from "./demo-timeline";
import {
  listFriendTimeline,
  timelineKey,
  type TimelineCursor,
  type TimelineItem,
} from "./timeline-service";
import styles from "./friend-timeline.module.css";

export function FriendTimeline({
  friends,
  demo,
  onOpenFriend,
  onOpenOccurrence,
  onDirtyChange,
  onBusyChange,
}: {
  friends: FriendSummary[];
  demo: boolean;
  onOpenFriend: (id: string) => void;
  onOpenOccurrence: (id: number, ownerId: string) => void;
  onDirtyChange: (ownerId: string, dirty: boolean) => void;
  onBusyChange: (ownerId: string, busy: boolean) => void;
}) {
  const [filter, setFilter] = useState("");
  const effectiveFilter = friends.some((f) => f.id === filter) ? filter : "";
  const membership = friends
    .map((f) => f.id)
    .sort()
    .join(",");
  const scope = `${membership}:${effectiveFilter}`;
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loadedScope, setLoadedScope] = useState("");
  const [cursor, setCursor] = useState<TimelineCursor | null>(null);
  const [zone, setZone] = useState("UTC");
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState("");
  const [moreError, setMoreError] = useState("");
  const [composer, setComposer] = useState<string | null>(null);
  const generation = useRef(0);
  const lock = useRef(false);
  const { feedback, showFeedback, dismissFeedback } = useFeedback();
  const refreshButton = useRef<HTMLButtonElement>(null);
  const currentFriends = useRef(friends);
  useEffect(() => {
    currentFriends.current = friends;
  });
  const load = useCallback(
    async (next?: TimelineCursor) => {
      if (lock.current) return;
      lock.current = true;
      const token = ++generation.current;
      if (next) {
        setMoreLoading(true);
        setMoreError("");
      } else {
        setLoading(true);
        setError("");
        setMoreError("");
      }
      try {
        const input = { friendId: effectiveFilter || undefined, cursor: next };
        const page = demo ? demoListTimeline(input) : await listFriendTimeline(input);
        if (token !== generation.current) return;
        if (next && page.nextCursor && JSON.stringify(page.nextCursor) === JSON.stringify(next))
          throw new AppError("INVALID_INPUT", "다음 활동을 불러오지 못했어요");
        const allowed = new Set(currentFriends.current.map((f) => f.id));
        const fresh = page.items.filter((item) => allowed.has(item.owner.id));
        setItems((previous) =>
          next
            ? [
                ...new Map(
                  [...previous, ...fresh].map((item) => [timelineKey(item), item]),
                ).values(),
              ]
            : fresh,
        );
        setCursor(page.nextCursor);
        setZone(page.viewerTimeZone);
        setLoadedScope(scope);
      } catch (cause) {
        if (token !== generation.current) return;
        const message = cause instanceof Error ? cause.message : "활동을 불러오지 못했어요";
        if (next) setMoreError(message);
        else {
          setItems([]);
          setCursor(null);
          setError(message);
          setLoadedScope(scope);
        }
      } finally {
        if (token === generation.current) {
          lock.current = false;
          setLoading(false);
          setMoreLoading(false);
        }
      }
    },
    [demo, effectiveFilter, scope],
  );
  useEffect(() => {
    lock.current = false;
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      // This ref is a request counter, so cleanup must invalidate the latest request.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, [load]);
  const visible =
    loadedScope === scope
      ? items.filter((item) => friends.some((f) => f.id === item.owner.id))
      : [];
  const activeFriend = friends.find((f) => f.id === composer);
  const time = (value: string) =>
    new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit", timeZone: zone }).format(
      new Date(value),
    );
  const day = (value: string) => toDateKey(new Date(value), zone);
  const dateLabel = (key: string) =>
    key === toDateKey(new Date(), zone)
      ? "오늘"
      : new Intl.DateTimeFormat("ko-KR", {
          month: "long",
          day: "numeric",
          weekday: "short",
          timeZone: "UTC",
        }).format(new Date(`${key}T12:00:00Z`));
  return (
    <section aria-label="친구 타임라인">
      <FeedbackToast feedback={feedback} onDismiss={dismissFeedback} />
      <div className={styles.filters} role="group" aria-label="활동을 볼 친구">
        <button aria-pressed={!effectiveFilter} onClick={() => setFilter("")}>
          전체
        </button>
        {friends.map((friend) => (
          <button
            key={friend.id}
            aria-label={friend.displayName}
            aria-pressed={effectiveFilter === friend.id}
            onClick={() => setFilter(friend.id)}
          >
            <ProfileAvatar avatarKey={friend.avatarKey} size={26} />
            <span>{friend.displayName}</span>
          </button>
        ))}
      </div>
      <div className={styles.toolbar}>
        <p>함께 쌓아가는 작은 실천</p>
        <Button
          ref={refreshButton}
          variant="ghost"
          loading={loading || moreLoading}
          onClick={() => void load()}
          aria-label="활동 새로고침"
        >
          <RefreshCw size={17} aria-hidden="true" />
          새로고침
        </Button>
      </div>
      {loading || loadedScope !== scope ? (
        <LoadingIndicator label="친구 활동을 불러오는 중" />
      ) : null}
      {!loading && error && loadedScope === scope ? (
        <div role="alert" className={styles.empty}>
          <p>{error}</p>
          <Button variant="secondary" onClick={() => void load()}>
            다시 시도
          </Button>
        </div>
      ) : null}
      {!loading && !error && loadedScope === scope && !visible.length ? (
        <div className={styles.empty}>
          <MessageCircle size={28} aria-hidden="true" />
          <h2>아직 친구 활동이 없어요</h2>
          <p>친구가 할 일을 적거나 완료하면 여기에 모여요.</p>
        </div>
      ) : null}
      <div className={styles.feed}>
        {visible.map((item, index) => {
          const owner = friends.find((f) => f.id === item.owner.id)!;
          const date = day(item.occurredAt);
          return (
            <div key={timelineKey(item)}>
              {!index || day(visible[index - 1].occurredAt) !== date ? (
                <h2 className={styles.date}>{dateLabel(date)}</h2>
              ) : null}
              <article
                className={styles.event}
                aria-label={`${owner.displayName}의 ${item.kind === "completed" ? "완료" : "등록"} 활동`}
              >
                <header className={styles.identity}>
                  <button
                    onClick={() => onOpenFriend(owner.id)}
                    aria-label={`${owner.displayName}의 오늘 보기`}
                  >
                    <ProfileAvatar avatarKey={owner.avatarKey} size={40} />
                    <strong>{owner.displayName}</strong>
                  </button>
                  <time dateTime={item.occurredAt}>{time(item.occurredAt)}</time>
                </header>
                <p
                  className={`${styles.kind} ${item.kind === "completed" ? styles.completed : styles.created}`}
                >
                  {item.kind === "completed" ? (
                    <Check size={16} aria-hidden="true" />
                  ) : (
                    <Plus size={16} aria-hidden="true" />
                  )}
                  {item.kind === "completed" ? "할 일을 완료했어요" : "새 할 일을 적었어요"}
                </p>
                {item.occurrenceId ? (
                  <button
                    className={styles.titleButton}
                    onClick={() => onOpenOccurrence(item.occurrenceId!, owner.id)}
                  >
                    {item.task.title}
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                ) : (
                  <h3 className={styles.title}>{item.task.title}</h3>
                )}
                <p className={styles.taskDate}>
                  {item.kind === "created" ? "예정일" : "할 일 날짜"} · {item.task.dueDate}
                </p>
                <Button
                  className={styles.cheer}
                  variant="secondary"
                  fullWidth
                  onClick={() => setComposer(owner.id)}
                >
                  <MessageCircle size={16} aria-hidden="true" />
                  {item.cheeredToday ? "보낸 응원 수정하기" : "오늘 응원하기"}
                </Button>
              </article>
            </div>
          );
        })}
      </div>
      {moreError && loadedScope === scope ? (
        <p role="alert" className={styles.error}>
          {moreError}
        </p>
      ) : null}
      {cursor && loadedScope === scope ? (
        <Button
          variant="secondary"
          fullWidth
          loading={moreLoading}
          disabled={loading}
          onClick={() => void load(cursor)}
        >
          {moreError ? "이전 활동 다시 불러오기" : "이전 활동 더 보기"}
        </Button>
      ) : null}
      {activeFriend ? (
        <DailyFriendCard
          key={activeFriend.id}
          friend={activeFriend}
          composerOnly
          onComposerClose={() => setComposer(null)}
          onDirtyChange={(dirty) => onDirtyChange(activeFriend.id, dirty)}
          onBusyChange={(busy) => onBusyChange(activeFriend.id, busy)}
          onSaved={(saved) => {
            setItems((previous) =>
              previous.map((item) =>
                item.owner.id === activeFriend.id
                  ? { ...item, ownerDay: saved.day, cheeredToday: Boolean(saved.mine) }
                  : item,
              ),
            );
            showFeedback({
              kind: "success",
              title: saved.mine ? "오늘의 응원을 보냈어요" : "응원을 취소했어요",
              description: demo ? "미리보기" : undefined,
            });
          }}
        />
      ) : null}
    </section>
  );
}

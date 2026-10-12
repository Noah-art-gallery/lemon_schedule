"use client";

import { ArrowLeft, Copy, MoreHorizontal, UserPlus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/features/auth/auth-provider";
import { InboxReadReceipt } from "@/features/notifications/inbox-read-receipt";
import { getProfileDetails } from "@/features/profile/profile-service";
import { listOccurrenceWindow } from "@/features/tasks/task-service";
import { addUtcDays } from "@/features/tasks/recurrence";
import { toDateKey } from "@/lib/time";
import { AppError } from "@/lib/errors";
import { OccurrenceDetailPanel } from "@/features/tasks/occurrence-detail-panel";
import { EncouragementSummaryView, TaskRowView } from "@/features/tasks/task-row-view";
import {
  listEncouragementSummaries,
  sendEncouragement,
} from "@/features/encouragements/encouragement-service";
import {
  demoGetConnections,
  demoDisconnectFriend,
  demoRespondRequest,
  demoCancelRequest,
  demoRequestConnection,
  demoListSocial,
  demoListFriend,
  demoSummary,
  demoSendEncouragement,
  subscribeDemoTasks,
} from "@/features/tasks/demo-task-store";
import {
  blockFriend,
  cancelConnectionRequest,
  disconnectFriend,
  getConnectionData,
  listSocialActivity,
  respondToConnectionRequest,
  sendConnectionRequest,
  type ConnectionData,
} from "./connection-service";
import type { CompletionCursor, EncouragementSummary, SocialActivityItem } from "@/types/contracts";
import type { TaskOccurrenceRow } from "@/lib/supabase/database.types";
import styles from "./friends-experience.module.css";

const emptyConnections: ConnectionData = { friends: [], incoming: [], outgoing: [] };
type View = "today" | "overdue" | "upcoming" | "history";
type FriendView = {
  today: string;
  from: string;
  to: string;
  rows: TaskOccurrenceRow[];
  summaries: Record<number, EncouragementSummary>;
  history: SocialActivityItem[];
  cursor: CompletionCursor | null;
  view: View;
  scroll: number;
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : "불러오지 못했어요. 다시 시도해 주세요";
const positiveId = (value: string | null) =>
  value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0
    ? Number(value)
    : null;

export function FriendsScreen() {
  const { user, demo } = useAuth();
  const userId = user?.id;
  const params = useSearchParams();
  const query = params.toString();
  const notificationId = positiveId(params.get("notification"));
  const [data, setData] = useState<ConnectionData>(emptyConnections);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activity, setActivity] = useState<SocialActivityItem[]>([]);
  const [cursor, setCursor] = useState<CompletionCursor | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const [overview, setOverview] = useState<FriendView | null>(null);
  const cache = useRef(new Map<string, FriendView>());
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendError, setFriendError] = useState("");
  const [detail, setDetail] = useState<number | null>(null);
  const detailOwner = useRef<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [code, setCode] = useState("");
  const [ownCode, setOwnCode] = useState(demo ? "LEMON0001" : "");
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<"disconnect" | "block" | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const mutation = useRef(false);
  const [actionError, setActionError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [requestHighlight, setRequestHighlight] = useState<number | null>(null);
  const generation = useRef(0);
  const connectionGeneration = useRef(0);
  const friendGeneration = useRef(0);
  const mounted = useRef(true);
  const handledQuery = useRef("");
  const activityScroll = useRef(0);
  const activityCount = useRef(0);
  const currentConnections = useRef(emptyConnections);

  const applyConnections = useCallback((next: ConnectionData) => {
    currentConnections.current = next;
    setData(next);
    const allowed = new Set(next.friends.map((friend) => friend.id));
    for (const id of cache.current.keys()) if (!allowed.has(id)) cache.current.delete(id);
    setActivity((items) => items.filter((item) => allowed.has(item.owner.id)));
    if (selectedRef.current && !allowed.has(selectedRef.current)) {
      friendGeneration.current++;
      selectedRef.current = null;
      setSelected(null);
      setOverview(null);
      setConfirm(null);
      setMenu(false);
      setNotice("연결이 해제되어 더 이상 할 일을 볼 수 없어요");
    }
    if (detailOwner.current && !allowed.has(detailOwner.current)) {
      detailOwner.current = null;
      setDetail(null);
    }
  }, []);

  const refreshConnections = useCallback(async () => {
    const token = ++connectionGeneration.current;
    const next = demo
      ? demoGetConnections()
      : userId
        ? await getConnectionData(userId)
        : emptyConnections;
    if (mounted.current && token === connectionGeneration.current) applyConnections(next);
    return token === connectionGeneration.current ? next : currentConnections.current;
  }, [applyConnections, demo, userId]);

  const loadActivity = useCallback(
    async (more?: CompletionCursor) => {
      const token = ++generation.current;
      if (!more) setLoading(true);
      setError("");
      try {
        await refreshConnections();
        const page = demo
          ? { items: demoListSocial(), nextCursor: null }
          : await listSocialActivity(more ? { cursor: more } : {});
        if (!more && !demo) {
          while (page.nextCursor && page.items.length < activityCount.current) {
            const extra = await listSocialActivity({ cursor: page.nextCursor });
            page.items.push(...extra.items);
            page.nextCursor = extra.nextCursor;
          }
        }
        if (!mounted.current || token !== generation.current) return;
        const allowed = new Set(currentConnections.current.friends.map((friend) => friend.id));
        const items = page.items.filter((item) => allowed.has(item.owner.id));
        setActivity((old) =>
          more
            ? [
                ...old,
                ...items.filter(
                  (item) => !old.some((previous) => previous.occurrence.id === item.occurrence.id),
                ),
              ]
            : items,
        );
        activityCount.current = more ? activityCount.current + items.length : items.length;
        setCursor(page.nextCursor);
      } catch (cause) {
        if (token === generation.current) setError(message(cause));
      } finally {
        if (token === generation.current) setLoading(false);
      }
    },
    [demo, refreshConnections],
  );

  useEffect(() => {
    mounted.current = true;
    const activityGeneration = generation,
      connectionsGeneration = connectionGeneration,
      selectedGeneration = friendGeneration;
    const initial = window.setTimeout(() => void loadActivity(), 0);
    const refresh = () => {
      void refreshConnections().catch(() => {});
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(refresh, 15000);
    const unsubscribe = demo ? subscribeDemoTasks(refresh) : () => {};
    return () => {
      mounted.current = false;
      activityGeneration.current++;
      connectionsGeneration.current++;
      selectedGeneration.current++;
      window.clearTimeout(initial);
      window.clearInterval(timer);
      unsubscribe();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [demo, loadActivity, refreshConnections]);

  async function summaries(rows: TaskOccurrenceRow[]) {
    if (demo) return Object.fromEntries(rows.map((row) => [row.id, demoSummary(row.id)]));
    const result: Record<number, EncouragementSummary> = {};
    for (let offset = 0; offset < rows.length; offset += 100) {
      const page = await listEncouragementSummaries({
        occurrenceIds: rows.slice(offset, offset + 100).map((row) => row.id),
      });
      page.items.forEach((item) => {
        result[item.occurrenceId] = item.summary;
      });
    }
    return result;
  }

  async function openFriend(id: string) {
    const previous = cache.current.get(id);
    if (selectedRef.current === id && previous)
      cache.current.set(id, { ...previous, scroll: window.scrollY });
    const token = ++friendGeneration.current;
    if (!selectedRef.current) activityScroll.current = window.scrollY;
    selectedRef.current = id;
    setSelected(id);
    setOverview(cache.current.get(id) ?? null);
    setFriendLoading(true);
    setFriendError("");
    setMenu(false);
    try {
      const next = await refreshConnections();
      if (!next.friends.some((friend) => friend.id === id))
        throw new AppError("FORBIDDEN", "친구 연결이 해제되었어요");
      const saved = cache.current.get(id);
      const date = saved?.today ?? toDateKey(new Date(), "UTC");
      let result = demo
        ? { today: toDateKey(new Date(), "Asia/Seoul"), occurrences: demoListFriend(id) }
        : await listOccurrenceWindow({
            ownerId: id,
            from: saved?.from ?? addUtcDays(date, -30),
            to: saved?.to ?? addUtcDays(date, 30),
          });
      if (!saved && result.today !== date && !demo)
        result = await listOccurrenceWindow({
          ownerId: id,
          from: addUtcDays(result.today, -30),
          to: addUtcDays(result.today, 30),
        });
      const history = demo
        ? { items: demoListSocial(id), nextCursor: null }
        : await listSocialActivity({ friendId: id });
      if (!demo && saved) {
        while (history.nextCursor && history.items.length < saved.history.length) {
          const extra = await listSocialActivity({ friendId: id, cursor: history.nextCursor });
          history.items.push(...extra.items);
          history.nextCursor = extra.nextCursor;
        }
      }
      const summary = await summaries(result.occurrences);
      if (
        token !== friendGeneration.current ||
        !mounted.current ||
        !currentConnections.current.friends.some((friend) => friend.id === id)
      )
        return;
      const value: FriendView = {
        today: result.today,
        from: saved?.from ?? addUtcDays(result.today, -30),
        to: saved?.to ?? addUtcDays(result.today, 30),
        rows: result.occurrences,
        summaries: summary,
        history: history.items,
        cursor: history.nextCursor,
        view: saved?.view ?? "today",
        scroll: saved?.scroll ?? 0,
      };
      cache.current.set(id, value);
      setOverview(value);
      window.requestAnimationFrame(() => window.scrollTo({ top: value.scroll }));
    } catch (cause) {
      if (token === friendGeneration.current) {
        setFriendError(message(cause));
        setOverview(null);
      }
    } finally {
      if (token === friendGeneration.current) setFriendLoading(false);
    }
  }

  useEffect(() => {
    if (loading || error || handledQuery.current === query) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      handledQuery.current = query;
      const target = new URLSearchParams(query);
      const friend = target.get("friend");
      const request = positiveId(target.get("request"));
      const occurrence = positiveId(target.get("occurrence"));
      if (target.has("request")) {
        setAddOpen(true);
        setRequestHighlight(request);
        setUnavailable(
          !request || ![...data.incoming, ...data.outgoing].some((item) => item.id === request),
        );
      } else if (friend) {
        if (!data.friends.some((item) => item.id === friend)) {
          setUnavailable(true);
          return;
        }
        void openFriend(friend);
        if (occurrence) {
          detailOwner.current = friend;
          setDetail(occurrence);
        } else if (target.has("occurrence")) setUnavailable(true);
      }
      if (target.has("invite")) {
        setCode(target.get("invite") ?? "");
        setAddOpen(true);
      }
    });
    return () => {
      active = false;
    };
    // Handle a URL once; connection refresh must not reopen a dismissed panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, loading, error, data]);

  useEffect(() => {
    if (!addOpen || demo || !userId) return;
    let active = true;
    void getProfileDetails(userId)
      .then((profile) => {
        if (active) setOwnCode(profile.inviteCode);
      })
      .catch((cause) => {
        if (active) setActionError(message(cause));
      });
    return () => {
      active = false;
    };
  }, [addOpen, demo, userId]);

  function leaveFriend() {
    if (selected && overview) cache.current.set(selected, { ...overview, scroll: window.scrollY });
    friendGeneration.current++;
    selectedRef.current = null;
    setSelected(null);
    setOverview(null);
    setMenu(false);
    setFriendError("");
    window.requestAnimationFrame(() => window.scrollTo({ top: activityScroll.current }));
  }
  function changeView(view: View) {
    if (!overview || !selected) return;
    const next = { ...overview, view };
    setOverview(next);
    cache.current.set(selected, next);
  }
  async function moreFriend() {
    if (!selected || !overview || mutation.current) return;
    mutation.current = true;
    setPending("more");
    setFriendError("");
    const token = friendGeneration.current;
    const id = selected;
    const old = overview;
    try {
      let next: FriendView;
      if (old.view === "history") {
        if (!old.cursor) return;
        const result = await listSocialActivity({ friendId: id, cursor: old.cursor });
        next = {
          ...old,
          history: [
            ...old.history,
            ...result.items.filter(
              (item) =>
                !old.history.some((previous) => previous.occurrence.id === item.occurrence.id),
            ),
          ],
          cursor: result.nextCursor,
        };
      } else {
        const future = old.view === "upcoming";
        const from = future ? addUtcDays(old.to, 1) : addUtcDays(old.from, -366);
        const to = future ? addUtcDays(old.to, 366) : addUtcDays(old.from, -1);
        const result = demo
          ? { occurrences: demoListFriend(id), today: old.today }
          : await listOccurrenceWindow({ ownerId: id, from, to });
        const summary = await summaries(result.occurrences);
        next = {
          ...old,
          from: future ? old.from : from,
          to: future ? to : old.to,
          rows: [
            ...old.rows,
            ...result.occurrences.filter((item) => !old.rows.some((row) => row.id === item.id)),
          ],
          summaries: { ...old.summaries, ...summary },
        };
      }
      if (
        token !== friendGeneration.current ||
        !currentConnections.current.friends.some((friend) => friend.id === id)
      )
        return;
      setOverview(next);
      cache.current.set(id, next);
    } catch (cause) {
      if (token === friendGeneration.current) setFriendError(message(cause));
    } finally {
      mutation.current = false;
      setPending(null);
    }
  }
  async function run(key: string, action: () => Promise<unknown> | void, success: string) {
    if (mutation.current) return false;
    mutation.current = true;
    setPending(key);
    setActionError("");
    setNotice("");
    try {
      await action();
      await refreshConnections();
      setNotice(success);
      return true;
    } catch (cause) {
      setActionError(message(cause));
      return false;
    } finally {
      mutation.current = false;
      setPending(null);
    }
  }
  async function destroy() {
    if (!selected || !confirm) return;
    const id = selected;
    const mode = confirm;
    const success = await run(
      "destroy",
      () =>
        demo
          ? demoDisconnectFriend(id, mode === "block")
          : mode === "block"
            ? blockFriend(id)
            : disconnectFriend(id),
      mode === "block" ? "차단했어요" : "연결을 해제했어요",
    );
    if (success) {
      cache.current.delete(id);
      setConfirm(null);
      setDetail(null);
      detailOwner.current = null;
      void loadActivity();
    }
  }
  async function quickReaction(item: SocialActivityItem) {
    const id = item.occurrence.id;
    const success = await run(
      `reaction-${id}`,
      async () => {
        const fresh = demo
          ? demoListSocial(item.owner.id).find((row) => row.occurrence.id === id)?.summary
          : (await listEncouragementSummaries({ occurrenceIds: [id] })).items.find(
              (row) => row.occurrenceId === id,
            )?.summary;
        if (!fresh) throw new AppError("FORBIDDEN", "지금은 이 할 일에 응원할 수 없어요");
        if (demo) demoSendEncouragement(id, "clap", fresh.myEncouragement?.message ?? "");
        else await sendEncouragement(id, "clap", fresh.myEncouragement?.message ?? "");
      },
      "응원을 보냈어요",
    );
    if (success) {
      void loadActivity();
      if (selected) void openFriend(selected);
    } else void refreshConnections().catch(() => {});
  }
  function openDetail(id: number, ownerId: string) {
    detailOwner.current = ownerId;
    setDetail(id);
  }
  const friend = data.friends.find((item) => item.id === selected);
  const rows =
    overview?.rows
      .filter((row) =>
        overview.view === "today"
          ? row.occurrence_date === overview.today
          : overview.view === "overdue"
            ? row.occurrence_date < overview.today && row.status === "pending"
            : row.occurrence_date > overview.today,
      )
      .sort((a, b) => a.occurrence_date.localeCompare(b.occurrence_date) || a.id - b.id) ?? [];
  function activityCard(item: SocialActivityItem) {
    return (
      <article key={item.occurrence.id} className={styles.activity}>
        <div className={styles.activityMeta}>
          <span>{item.owner.displayName}</span>
          <time dateTime={item.occurrence.first_completed_at ?? undefined}>
            {item.occurrence.first_completed_at
              ? new Date(item.occurrence.first_completed_at).toLocaleDateString("ko-KR")
              : item.occurrence.occurrence_date}{" "}
            완료
          </time>
        </div>
        <button
          className={styles.activityOpen}
          onClick={() => openDetail(item.occurrence.id, item.owner.id)}
        >
          <strong>{item.occurrence.title_snapshot}</strong>
          <EncouragementSummaryView summary={item.summary} />
        </button>
        <div className={styles.activityActions}>
          <Button
            variant="ghost"
            size="sm"
            disabled={Boolean(pending)}
            onClick={() => void quickReaction(item)}
            aria-pressed={item.summary.myEncouragement?.reaction === "clap"}
          >
            박수{item.summary.reactions.clap ? ` ${item.summary.reactions.clap}` : ""}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openDetail(item.occurrence.id, item.owner.id)}
          >
            {item.summary.myEncouragement ? "내 응원 수정" : "응원 쓰기"}
          </Button>
        </div>
      </article>
    );
  }
  return (
    <AppShell>
      <PageHeading
        title="친구"
        action={
          <Button
            onClick={() => {
              setActionError("");
              setUnavailable(false);
              setAddOpen(true);
            }}
          >
            <UserPlus size={18} />
            친구 추가
          </Button>
        }
      />
      {notice ? (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      ) : null}
      {!addOpen && !confirm && actionError ? (
        <p role="alert" className={styles.error}>
          {actionError}
        </p>
      ) : null}
      {unavailable && !addOpen ? (
        <div role="alert" className={styles.empty}>
          <p>더 이상 볼 수 없는 친구 소식이에요</p>
          <Button variant="secondary" onClick={() => setUnavailable(false)}>
            친구 화면으로
          </Button>
        </div>
      ) : null}
      {data.incoming.length ? (
        <button
          className={styles.requestEntry}
          onClick={() => {
            setAddOpen(true);
            setUnavailable(false);
          }}
        >
          받은 요청 <strong>{data.incoming.length}</strong>
          <span>확인하기</span>
        </button>
      ) : null}
      {!selected ? (
        <>
          <div className={styles.friendPicker} aria-label="친구 선택">
            {data.friends.map((item) => (
              <button key={item.id} onClick={() => void openFriend(item.id)}>
                <span className={styles.avatar} aria-hidden="true">
                  {item.displayName.slice(0, 1)}
                </span>
                <span>{item.displayName}</span>
              </button>
            ))}
          </div>
          <section aria-labelledby="activity-heading">
            <h2 id="activity-heading" className={styles.sectionTitle}>
              최근 완료
            </h2>
            {loading && !activity.length ? (
              <p role="status" className={styles.empty}>
                불러오는 중
              </p>
            ) : error ? (
              <div role="alert" className={styles.empty}>
                <p>{error}</p>
                <Button variant="secondary" onClick={() => void loadActivity()}>
                  다시 시도
                </Button>
              </div>
            ) : !activity.length ? (
              <p className={styles.empty}>
                {data.friends.length
                  ? "아직 친구의 완료 소식이 없어요"
                  : "친구를 추가하면 완료 소식을 볼 수 있어요"}
              </p>
            ) : (
              <div className={styles.feed}>{activity.map(activityCard)}</div>
            )}
            {cursor ? (
              <Button
                variant="secondary"
                loading={pending === "activity-more"}
                onClick={() => void run("activity-more", () => loadActivity(cursor), "")}
              >
                활동 더 보기
              </Button>
            ) : null}
          </section>
        </>
      ) : (
        <section>
          <div className={styles.friendHeader}>
            <button className="icon-button" aria-label="친구 목록으로" onClick={leaveFriend}>
              <ArrowLeft size={20} />
            </button>
            <h2>{friend?.displayName ?? "친구"}</h2>
            <div className={styles.management}>
              <button
                className="icon-button"
                aria-label="친구 관리"
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                <MoreHorizontal size={20} />
              </button>
              {menu ? (
                <div className={styles.menu}>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setMenu(false);
                      setActionError("");
                      setConfirm("disconnect");
                    }}
                  >
                    연결 해제
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setMenu(false);
                      setActionError("");
                      setConfirm("block");
                    }}
                  >
                    차단
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
          <InboxReadReceipt
            notificationId={notificationId}
            target={{ kind: "friend", id: selected }}
            resolved={Boolean(
              overview &&
              !friendLoading &&
              params.get("friend") === selected &&
              !params.has("occurrence"),
            )}
          />
          <div className={styles.tabs} role="tablist" aria-label="친구 할 일">
            {(
              [
                ["today", "오늘"],
                ["overdue", "밀린 일"],
                ["upcoming", "예정"],
                ["history", "기록"],
              ] as const
            ).map(([view, label]) => (
              <button
                key={view}
                role="tab"
                aria-selected={overview?.view === view}
                onClick={() => changeView(view)}
                disabled={!overview}
              >
                {label}
              </button>
            ))}
          </div>
          {friendLoading ? <p role="status">불러오는 중</p> : null}
          {friendError ? (
            <div role="alert" className={styles.error}>
              <p>{friendError}</p>
              <Button variant="secondary" onClick={() => void openFriend(selected)}>
                다시 시도
              </Button>
            </div>
          ) : null}
          {overview ? (
            <>
              <p className={styles.range}>
                {overview.view === "today"
                  ? `${overview.today} · 친구의 오늘`
                  : overview.view === "overdue"
                    ? `${overview.from}부터 ${addUtcDays(overview.today, -1)}까지`
                    : overview.view === "upcoming"
                      ? `${addUtcDays(overview.today, 1)}부터 ${overview.to}까지`
                      : "최근 완료 순"}
              </p>
              {overview.view === "history" ? (
                <div className={styles.feed}>
                  {overview.history.length ? (
                    overview.history.map(activityCard)
                  ) : (
                    <p className={styles.empty}>완료한 기록이 없어요</p>
                  )}
                </div>
              ) : rows.length ? (
                <div>
                  {rows.map((row) => (
                    <div key={row.id} className={styles.task}>
                      <time>{row.occurrence_date}</time>
                      <TaskRowView
                        occurrence={row}
                        summary={overview.summaries[row.id]}
                        onOpen={() => openDetail(row.id, selected)}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.empty}>이 기간에 할 일이 없어요</p>
              )}
              {overview.view !== "today" && (overview.view !== "history" || overview.cursor) ? (
                <Button
                  variant="secondary"
                  loading={pending === "more"}
                  onClick={() => void moreFriend()}
                >
                  {overview.view === "upcoming"
                    ? "다음 1년 보기"
                    : overview.view === "overdue"
                      ? "이전 1년 보기"
                      : "기록 더 보기"}
                </Button>
              ) : null}
            </>
          ) : null}
        </section>
      )}
      <Panel
        open={addOpen}
        title="친구 추가"
        onClose={() => {
          if (!pending) setAddOpen(false);
        }}
        onBeforeClose={() => !pending}
      >
        <div className={styles.addBody}>
          <InboxReadReceipt
            notificationId={notificationId}
            target={{ kind: "request", id: String(requestHighlight) }}
            resolved={Boolean(
              requestHighlight &&
              [...data.incoming, ...data.outgoing].some(
                (request) => request.id === requestHighlight,
              ),
            )}
          />

          {unavailable ? <p role="alert">이미 처리되었거나 더 이상 볼 수 없는 요청이에요</p> : null}
          <section>
            <h3>내 초대 코드</h3>
            <div className={styles.code}>
              <strong>{ownCode || "불러오는 중"}</strong>
              <Button
                variant="secondary"
                disabled={!ownCode}
                onClick={() =>
                  void navigator.clipboard
                    .writeText(ownCode)
                    .then(() => setNotice("코드를 복사했어요"))
                    .catch(() => setActionError("복사하지 못했어요. 코드를 직접 복사해 주세요"))
                }
              >
                <Copy size={16} />
                복사
              </Button>
            </div>
          </section>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                "send",
                () => (demo ? demoRequestConnection(code) : sendConnectionRequest(code.trim())),
                "요청을 보냈어요",
              ).then((success) => {
                if (success) setCode("");
              });
            }}
          >
            <Field
              label="친구 초대 코드"
              name="inviteCode"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              autoComplete="off"
            />
            <Button
              type="submit"
              loading={pending === "send"}
              disabled={!code.trim() || Boolean(pending)}
            >
              요청 보내기
            </Button>
          </form>
          {actionError ? (
            <p role="alert" className={styles.error}>
              {actionError}
            </p>
          ) : null}
          {notice ? <p role="status">{notice}</p> : null}
          <section>
            <h3>
              받은 요청 <span>{data.incoming.length}</span>
            </h3>
            {data.incoming.length ? (
              data.incoming.map((request) => (
                <div
                  key={request.id}
                  className={`${styles.request} ${requestHighlight === request.id ? styles.highlight : ""}`}
                >
                  <strong>{request.displayName}</strong>
                  <div>
                    <Button
                      disabled={Boolean(pending)}
                      onClick={() =>
                        void run(
                          `accept-${request.id}`,
                          () =>
                            demo
                              ? demoRespondRequest(request.id, true)
                              : respondToConnectionRequest(request.id, true),
                          "친구로 연결했어요",
                        )
                      }
                    >
                      수락
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={Boolean(pending)}
                      onClick={() =>
                        void run(
                          `reject-${request.id}`,
                          () =>
                            demo
                              ? demoRespondRequest(request.id, false)
                              : respondToConnectionRequest(request.id, false),
                          "요청을 거절했어요",
                        )
                      }
                    >
                      거절
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p>받은 요청이 없어요</p>
            )}
          </section>
          <section>
            <h3>
              보낸 요청 <span>{data.outgoing.length}</span>
            </h3>
            {data.outgoing.length ? (
              data.outgoing.map((request) => (
                <div
                  key={request.id}
                  className={`${styles.request} ${requestHighlight === request.id ? styles.highlight : ""}`}
                >
                  <div>
                    <strong>{request.displayName}</strong>
                    <p>수락 대기 중</p>
                  </div>
                  <Button
                    variant="ghost"
                    disabled={Boolean(pending)}
                    onClick={() =>
                      void run(
                        `cancel-${request.id}`,
                        () =>
                          demo
                            ? demoCancelRequest(request.id)
                            : cancelConnectionRequest(request.id),
                        "요청을 취소했어요",
                      )
                    }
                  >
                    요청 취소
                  </Button>
                </div>
              ))
            ) : (
              <p>보낸 요청이 없어요</p>
            )}
          </section>
        </div>
      </Panel>
      <ConfirmDialog
        open={Boolean(confirm)}
        title={`${friend?.displayName ?? "친구"}님${confirm === "block" ? "을 차단할까요?" : "과 연결을 해제할까요?"}`}
        description={
          confirm === "block"
            ? "서로의 할 일을 볼 수 없고, 새 연결 요청도 받지 않아요"
            : "서로의 할 일을 볼 수 없어요. 다시 연결하려면 요청과 수락이 필요해요"
        }
        confirmLabel={confirm === "block" ? "차단하기" : "연결 해제하기"}
        onCancel={() => {
          if (!pending) setConfirm(null);
        }}
        onConfirm={() => void destroy()}
        loading={pending === "destroy"}
        error={actionError}
      />
      {detail !== null ? (
        <OccurrenceDetailPanel
          occurrenceId={detail}
          onClose={() => {
            setDetail(null);
            detailOwner.current = null;
          }}
          onChanged={() => {
            void loadActivity();
            if (selected) void openFriend(selected);
          }}
          onResolved={(resolved) => {
            if (detailOwner.current && resolved.owner.id !== detailOwner.current) {
              setDetail(null);
              setUnavailable(true);
            }
          }}
        />
      ) : null}
    </AppShell>
  );
}

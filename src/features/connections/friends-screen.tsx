"use client";

import { ArrowLeft, Copy, MoreHorizontal, UserPlus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
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
import { TaskRowView } from "@/features/tasks/task-row-view";
import { listEncouragementSummaries } from "@/features/encouragements/encouragement-service";
import { EncouragementThread } from "@/features/encouragements/encouragement-thread";
import {
  demoGetConnections,
  demoDisconnectFriend,
  demoRespondRequest,
  demoCancelRequest,
  demoRequestConnection,
  demoListSocial,
  demoListFriend,
  demoSummary,
  subscribeDemoTasks,
} from "@/features/tasks/demo-task-store";
import {
  cancelConnectionRequest,
  disconnectFriend,
  getConnectionData,
  subscribeConnectionChanges,
  listSocialActivity,
  respondToConnectionRequest,
  sendConnectionRequest,
  type ConnectionData,
} from "./connection-service";
import type {
  CompletionCursor,
  EncouragementSummary,
  SocialActivityItem,
  OccurrenceDetail,
} from "@/types/contracts";
import type { TaskOccurrenceRow } from "@/lib/supabase/database.types";
import styles from "./friends-experience.module.css";
import { activityBoundary, needsOlderActivity } from "./activity-boundary";

// Consume only our same-route entry before a new route is pushed. The shared promise
// also prevents an account remount from starting a second traversal in the meantime.
let pendingHistoryRetirement: Promise<void> | null = null;
function retireFriendHistoryEntry() {
  if (!pendingHistoryRetirement) {
    pendingHistoryRetirement = new Promise<void>((resolve) => {
      window.addEventListener(
        "popstate",
        (event) => {
          event.stopImmediatePropagation();
          pendingHistoryRetirement = null;
          resolve();
        },
        { once: true, capture: true },
      );
      window.history.back();
    });
  }
  return pendingHistoryRetirement;
}

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
  return (
    <FriendsContent
      key={demo ? "demo" : (user?.id ?? "signed-out")}
      demo={demo}
      userId={user?.id}
    />
  );
}

function FriendsContent({ demo, userId }: { demo: boolean; userId?: string }) {
  const params = useSearchParams();
  const query = params.toString();
  const notificationId = positiveId(params.get("notification"));
  const [data, setData] = useState<ConnectionData>(emptyConnections);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activity, setActivity] = useState<SocialActivityItem[]>([]);
  const [cursor, setCursor] = useState<CompletionCursor | null>(null);
  const [friendLimit, setFriendLimit] = useState(8);
  const [requestLimit, setRequestLimit] = useState(10);
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
  const incomingHeading = useRef<HTMLHeadingElement>(null);
  const outgoingHeading = useRef<HTMLHeadingElement>(null);
  const requestFocus = useRef<"incoming" | "outgoing" | null>(null);
  const managementTrigger = useRef<HTMLButtonElement>(null);
  const addTrigger = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  const wasAdding = useRef(false);
  useEffect(() => {
    if (!addOpen && wasAdding.current) {
      queueMicrotask(() => {
        if (
          !document.activeElement ||
          document.activeElement === document.body ||
          !document.activeElement.isConnected
        )
          addTrigger.current?.focus();
      });
    }
    wasAdding.current = addOpen;
  }, [addOpen]);
  const [confirm, setConfirm] = useState<"disconnect" | null>(null);
  useEffect(() => {
    if (!confirm && wasConfirming.current) {
      queueMicrotask(() => (managementTrigger.current ?? addTrigger.current)?.focus());
    }
    wasConfirming.current = Boolean(confirm);
  }, [confirm]);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    if (!pending && requestFocus.current) {
      (requestFocus.current === "incoming" ? incomingHeading : outgoingHeading).current?.focus();
      requestFocus.current = null;
    }
  }, [pending, data]);
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
  const lastActivityBoundary = useRef<CompletionCursor | null>(null);
  const friendTriggers = useRef(new Map<string, HTMLButtonElement>());
  const returnFriendFocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (selected || !returnFriendFocus.current) return;
    (friendTriggers.current.get(returnFriendFocus.current) ?? addTrigger.current)?.focus({
      preventScroll: true,
    });
    returnFriendFocus.current = null;
  }, [selected]);
  const currentConnections = useRef(emptyConnections);
  const [threadVersion, setThreadVersion] = useState(0);
  const [discardOpen, setDiscardOpen] = useState(false);
  const leaveAction = useRef<(() => void) | null>(null);
  const dirtyThreads = useRef(new Map<number, string>());
  const busyThreads = useRef(new Map<number, string>());
  const guardedHistory = useRef(false);
  const originalHistory = useRef<unknown>(null);
  const guardUrl = useRef("");
  const routing = useRef(false);

  function adoptHistoryGuard() {
    if (!window.history.state?.lemonFriendDraft) return false;
    const base = { ...window.history.state };
    delete base.lemonFriendDraft;
    guardedHistory.current = true;
    originalHistory.current = base;
    guardUrl.current = window.location.href;
    return true;
  }
  function ensureHistoryGuard() {
    if (guardedHistory.current || adoptHistoryGuard()) return;
    guardedHistory.current = true;
    originalHistory.current = window.history.state;
    guardUrl.current = window.location.href;
    window.history.pushState(
      { ...window.history.state, lemonFriendDraft: true },
      "",
      guardUrl.current,
    );
  }
  async function continueLink(link: HTMLAnchorElement) {
    if (routing.current) return;
    routing.current = true;
    const retire = guardedHistory.current && window.history.state?.lemonFriendDraft;
    guardedHistory.current = false;
    if (retire) await retireFriendHistoryEntry();
    routing.current = false;
    if (mounted.current) link.click();
  }
  function requestLeave(proceed: () => void) {
    if (busyThreads.current.size || leaveAction.current) return false;
    if (!dirtyThreads.current.size) return true;
    leaveAction.current = proceed;
    setDiscardOpen(true);
    return false;
  }
  function cancelLeave() {
    leaveAction.current = null;
    setDiscardOpen(false);
  }
  function confirmLeave() {
    if (busyThreads.current.size) return;
    const proceed = leaveAction.current;
    leaveAction.current = null;
    dirtyThreads.current.clear();
    setThreadVersion((value) => value + 1);
    setDiscardOpen(false);
    // Let the dialog restore focus and unmount before opening a new panel or route.
    window.setTimeout(() => {
      if (mounted.current) proceed?.();
    }, 0);
  }
  useEffect(() => {
    let active = true;
    if (pendingHistoryRetirement)
      void pendingHistoryRetirement.then(() => {
        if (active) adoptHistoryGuard();
      });
    else adoptHistoryGuard();
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyThreads.current.size || busyThreads.current.size) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const destination = new URL(link.href, window.location.href);
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      )
        return;
      if (
        !guardedHistory.current &&
        !routing.current &&
        !dirtyThreads.current.size &&
        !busyThreads.current.size
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (routing.current) return;
      const proceed = () => {
        void continueLink(link);
      };
      if (requestLeave(proceed)) proceed();
    };
    const back = (event: PopStateEvent) => {
      if (pendingHistoryRetirement) return;
      if (!guardedHistory.current || event.state?.lemonFriendDraft) return;
      event.stopImmediatePropagation();
      // Restore the same-route entry before asking, so cancellation never changes the route.
      window.history.pushState(
        { ...(originalHistory.current as object), lemonFriendDraft: true },
        "",
        guardUrl.current,
      );
      const proceed = () => {
        guardedHistory.current = false;
        window.history.go(-2);
      };
      if (requestLeave(proceed)) proceed();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", back, true);
    return () => {
      active = false;
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
      window.removeEventListener("popstate", back, true);
      // Preserve marker ownership for a later mount; replaceState cannot remove an entry.
    };
  }, []);

  function threadProps(id: number, ownerId: string, canCompose: boolean) {
    return {
      canCompose,
      accessKey: `${ownerId}:${canCompose}:${threadVersion}`,
      onDirtyChange: (dirty: boolean) => {
        if (dirty) {
          dirtyThreads.current.set(id, ownerId);
          ensureHistoryGuard();
        } else dirtyThreads.current.delete(id);
      },
      onBusyChange: (busy: boolean) => {
        if (busy) {
          busyThreads.current.set(id, ownerId);
          ensureHistoryGuard();
        } else busyThreads.current.delete(id);
      },
      onChanged: (fresh: OccurrenceDetail) => {
        if (!currentConnections.current.friends.some((item) => item.id === ownerId)) return;
        const update = (items: SocialActivityItem[]) =>
          items.map((item) =>
            item.occurrence.id === id
              ? { ...item, occurrence: fresh.occurrence, summary: fresh.summary }
              : item,
          );
        setActivity(update);
        for (const [key, value] of cache.current) {
          cache.current.set(key, {
            ...value,
            rows: value.rows.map((row) => (row.id === id ? fresh.occurrence : row)),
            summaries: { ...value.summaries, [id]: fresh.summary },
            history: update(value.history),
          });
        }
        if (selectedRef.current) setOverview(cache.current.get(selectedRef.current) ?? null);
      },
    };
  }

  const applyConnections = useCallback((next: ConnectionData) => {
    currentConnections.current = next;
    setData(next);
    const allowed = new Set(next.friends.map((friend) => friend.id));
    for (const [id, owner] of dirtyThreads.current)
      if (!allowed.has(owner)) dirtyThreads.current.delete(id);
    for (const [id, owner] of busyThreads.current)
      if (!allowed.has(owner)) busyThreads.current.delete(id);
    if (!dirtyThreads.current.size && leaveAction.current) {
      leaveAction.current = null;
      setDiscardOpen(false);
    }
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
    if (!mounted.current) return emptyConnections;
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
      if (!mounted.current || (!demo && !userId)) {
        setLoading(false);
        return;
      }
      const token = ++generation.current;
      const previousBoundary = lastActivityBoundary.current;
      if (!more) setLoading(true);
      setError("");
      try {
        await refreshConnections();
        const page = demo
          ? { items: demoListSocial(), nextCursor: null }
          : await listSocialActivity(more ? { cursor: more } : {});
        if (!more && !demo) {
          while (page.nextCursor && needsOlderActivity(page.nextCursor, previousBoundary)) {
            if (!mounted.current || token !== generation.current) return;
            const extra = await listSocialActivity({ cursor: page.nextCursor });
            page.items.push(...extra.items);
            page.nextCursor = extra.nextCursor;
          }
        }
        if (!mounted.current || token !== generation.current) return;
        const allowed = new Set(currentConnections.current.friends.map((friend) => friend.id));
        const items = page.items.filter((item) => allowed.has(item.owner.id));
        if (!more && !selectedRef.current) {
          const completed = new Set(
            items
              .filter((item) => item.occurrence.status === "completed")
              .map((item) => item.occurrence.id),
          );
          for (const id of dirtyThreads.current.keys())
            if (!completed.has(id)) dirtyThreads.current.delete(id);
          for (const id of busyThreads.current.keys())
            if (!completed.has(id)) busyThreads.current.delete(id);
        }
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
        lastActivityBoundary.current = activityBoundary(items) ?? (more ? previousBoundary : null);
        setCursor(page.nextCursor);
      } catch (cause) {
        if (token === generation.current) setError(message(cause));
      } finally {
        if (token === generation.current) setLoading(false);
      }
    },
    [demo, userId, refreshConnections],
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
    const unsubscribe = demo
      ? subscribeDemoTasks(refresh)
      : userId
        ? subscribeConnectionChanges(userId, (event) => {
            if (!mounted.current) return;
            if (event.kind === "connection" && event.change === "DELETE") {
              const current = currentConnections.current;
              const removed = current.friends.find(
                (friend) =>
                  (event.friendId !== undefined && friend.id === event.friendId) ||
                  (event.connectionId !== undefined && friend.connectionId === event.connectionId),
              );
              if (removed) {
                generation.current++;
                connectionGeneration.current++;
                applyConnections({
                  ...current,
                  friends: current.friends.filter((friend) => friend.id !== removed.id),
                });
              }
            }
            // Additions and unrelated changes must preserve the active task and unsent text.
            // An unidentified DELETE is resolved by the authorized connection query.
            if (event.kind === "connection" && event.change === "INSERT") void loadActivity();
            else refresh();
          })
        : () => {};
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
  }, [demo, userId, applyConnections, loadActivity, refreshConnections]);

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
    if (id !== selectedRef.current && !requestLeave(() => void openFriend(id))) return;
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
        const previousBoundary = activityBoundary(saved.history);
        while (history.nextCursor && needsOlderActivity(history.nextCursor, previousBoundary)) {
          if (!mounted.current || token !== friendGeneration.current) return;
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
      const completed = new Set(
        [...value.rows, ...value.history.map((item) => item.occurrence)]
          .filter((row) => row.status === "completed")
          .map((row) => row.id),
      );
      for (const [occurrenceId, owner] of dirtyThreads.current)
        if (owner === id && !completed.has(occurrenceId)) dirtyThreads.current.delete(occurrenceId);
      for (const [occurrenceId, owner] of busyThreads.current)
        if (owner === id && !completed.has(occurrenceId)) busyThreads.current.delete(occurrenceId);
      cache.current.set(id, value);
      setOverview(value);
      window.requestAnimationFrame(() => window.scrollTo({ top: value.scroll }));
    } catch (cause) {
      if (token === friendGeneration.current) {
        setFriendError(message(cause));
        setOverview(cache.current.get(id) ?? null);
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
    if (!requestLeave(leaveFriend)) return;
    returnFriendFocus.current = selected;
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
    if (!overview || !selected || overview.view === view || !requestLeave(() => changeView(view)))
      return;
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
  async function run(
    key: string,
    action: () => Promise<unknown> | void,
    success: string,
    onSuccess?: () => void,
  ) {
    if (mutation.current) return false;
    mutation.current = true;
    setPending(key);
    setActionError("");
    setNotice("");
    try {
      await action();
      if (!mounted.current) return false;
      onSuccess?.();
      if (/^(accept|reject)-/.test(key)) requestFocus.current = "incoming";
      if (key.startsWith("cancel-")) requestFocus.current = "outgoing";
      setNotice(success);
      try {
        await refreshConnections();
      } catch (cause) {
        if (mounted.current)
          setActionError(`변경은 완료했지만 목록을 새로 불러오지 못했어요: ${message(cause)}`);
      }
      return mounted.current;
    } catch (cause) {
      if (mounted.current) setActionError(message(cause));
      return false;
    } finally {
      mutation.current = false;
      setPending(null);
    }
  }
  async function destroy() {
    if (!selected || !confirm) return;
    const id = selected;
    await run(
      "destroy",
      () => (demo ? demoDisconnectFriend(id) : disconnectFriend(id)),
      "친구를 삭제했어요",
      () => {
        connectionGeneration.current++;
        generation.current++;
        const current = currentConnections.current;
        applyConnections({
          ...current,
          friends: current.friends.filter((friend) => friend.id !== id),
          incoming: current.incoming.filter((request) => request.requester_id !== id),
          outgoing: current.outgoing.filter((request) => request.addressee_id !== id),
        });
        cache.current.delete(id);
        setConfirm(null);
        setDetail(null);
        detailOwner.current = null;
      },
    );
  }
  function openDetail(id: number, ownerId: string) {
    if (!requestLeave(() => openDetail(id, ownerId))) return;
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
          <span aria-hidden="true">
            <ProfileAvatar avatarKey={item.owner.avatarKey} size={36} />
          </span>
          <strong>{item.owner.displayName}</strong>
        </div>
        <button
          className={styles.activityOpen}
          data-occurrence-trigger={item.occurrence.id}
          onClick={() => openDetail(item.occurrence.id, item.owner.id)}
        >
          <strong>{item.occurrence.title_snapshot}</strong>
        </button>
        <time
          className={styles.completedAt}
          dateTime={item.occurrence.first_completed_at ?? undefined}
        >
          {item.occurrence.first_completed_at
            ? new Intl.DateTimeFormat("ko-KR", {
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(item.occurrence.first_completed_at))
            : item.occurrence.occurrence_date}{" "}
          완료
        </time>
        <EncouragementThread
          occurrenceId={item.occurrence.id}
          summary={item.summary}
          {...threadProps(
            item.occurrence.id,
            item.owner.id,
            item.occurrence.status === "completed",
          )}
        />
      </article>
    );
  }
  return (
    <AppShell>
      <PageHeading
        title="친구"
        action={
          <Button
            ref={addTrigger}
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
          <section className={styles.friendSection} aria-labelledby="friend-picker-heading">
            <h2 id="friend-picker-heading" className={styles.sectionTitle}>
              친구 <span>{data.friends.length}</span>
            </h2>
            <div className={styles.friendPicker} aria-label="친구 선택">
              {data.friends.slice(0, friendLimit).map((item) => (
                <button
                  key={item.id}
                  ref={(node) => {
                    if (node) friendTriggers.current.set(item.id, node);
                    else friendTriggers.current.delete(item.id);
                  }}
                  onClick={() => void openFriend(item.id)}
                >
                  <span aria-hidden="true">
                    <ProfileAvatar avatarKey={item.avatarKey} size={36} />
                  </span>
                  <span>{item.displayName}</span>
                </button>
              ))}
            </div>
            {data.friends.length > friendLimit ? (
              <Button variant="ghost" onClick={() => setFriendLimit((count) => count + 8)}>
                친구 더 보기
              </Button>
            ) : null}
          </section>
          <section aria-labelledby="activity-heading">
            <h2 id="activity-heading" className={styles.sectionTitle}>
              최근 완료
            </h2>
            {error && activity.length ? (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            ) : null}
            {loading && !activity.length ? (
              <p role="status" className={styles.empty}>
                불러오는 중
              </p>
            ) : error && !activity.length ? (
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
                ref={managementTrigger}
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
                    친구 삭제
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
                      {overview.view !== "today" ? <time>{row.occurrence_date}</time> : null}
                      <TaskRowView
                        occurrence={row}
                        summary={overview.summaries[row.id]}
                        onOpen={() => openDetail(row.id, selected)}
                        encouragementProps={threadProps(
                          row.id,
                          selected,
                          row.status === "completed",
                        )}
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
            <h3 ref={incomingHeading} tabIndex={-1}>
              받은 요청 <span>{data.incoming.length}</span>
            </h3>
            {data.incoming.length ? (
              data.incoming.slice(0, requestLimit).map((request) => (
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
            {data.incoming.length > requestLimit ? (
              <Button variant="ghost" onClick={() => setRequestLimit((count) => count + 10)}>
                받은 요청 더 보기
              </Button>
            ) : null}
          </section>
          <section>
            <h3 ref={outgoingHeading} tabIndex={-1}>
              보낸 요청 <span>{data.outgoing.length}</span>
            </h3>
            {data.outgoing.length ? (
              data.outgoing.slice(0, requestLimit).map((request) => (
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
            {data.outgoing.length > requestLimit ? (
              <Button variant="ghost" onClick={() => setRequestLimit((count) => count + 10)}>
                보낸 요청 더 보기
              </Button>
            ) : null}
          </section>
        </div>
      </Panel>
      <ConfirmDialog
        open={discardOpen}
        title="작성 중인 응원을 버릴까요?"
        description="이동하면 작성 중인 내용이 사라져요"
        confirmLabel="버리고 이동"
        history={false}
        onCancel={cancelLeave}
        onConfirm={confirmLeave}
      />
      <ConfirmDialog
        open={Boolean(confirm)}
        title={`${friend?.displayName ?? "친구"}님을 친구에서 삭제할까요?`}
        description="서로의 할 일 공유가 끝나요. 다시 추가하려면 요청과 수락이 필요해요"
        confirmLabel="친구 삭제하기"
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

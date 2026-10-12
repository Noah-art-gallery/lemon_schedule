"use client";
import { Citrus, UserRoundPlus, ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { StatePanel } from "@/components/ui/state-panel";
import { useAuth } from "@/features/auth/auth-provider";
import { OccurrenceDetailPanel } from "@/features/tasks/occurrence-detail-panel";
import { reactionLabels } from "@/features/encouragements/encouragement-composer";
import type { InboxFilter, InboxItem, OccurrenceDetail } from "@/types/contracts";
import { listInbox, markAllInboxRead } from "./notification-service";
import { demoListInbox, demoMarkAllInboxRead } from "./demo-inbox-store";
import { subscribeInbox } from "./inbox-events";
import { InboxReadReceipt } from "./inbox-read-receipt";
import styles from "./inbox.module.css";
const filters: { key: InboxFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "encouragement", label: "응원" },
  { key: "connection", label: "연결" },
];
export function NotificationScreen() {
  const { demo, user } = useAuth();
  return <NotificationContent key={demo ? "demo" : (user?.id ?? "signed-out")} />;
}
function NotificationContent() {
  const { user, demo } = useAuth();
  const userId = user?.id;
  const router = useRouter();
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reading, setReading] = useState(false);
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const [resolved, setResolved] = useState(false);
  const generation = useRef(0);
  const paging = useRef(false);
  const readLock = useRef(false);
  const account = demo ? "demo" : (userId ?? "");
  const [loadedScope, setLoadedScope] = useState("");
  const load = useCallback(
    async (invalidate = true) => {
      const version = ++generation.current;
      const key = `${account}:${filter}`;
      paging.current = false;
      setMore(false);
      if (invalidate) {
        setLoading(true);
        setItems([]);
      }
      setError("");
      try {
        if (!demo && !userId) return;
        const page = demo ? demoListInbox({ filter }) : await listInbox({ filter });
        if (version !== generation.current) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setLoadedScope(key);
        setSelected((current) => {
          if (!current) return null;
          const refreshed = page.items.find((item) => item.id === current.id);
          return refreshed?.availability === "unavailable" ? null : current;
        });
      } catch (cause) {
        if (version === generation.current)
          setError(cause instanceof Error ? cause.message : "소식을 불러오지 못했어요");
      } finally {
        if (version === generation.current) setLoading(false);
      }
    },
    [account, filter, demo, userId],
  );
  useEffect(() => {
    let active = true;
    const requests = generation;
    queueMicrotask(() => {
      if (active) void load();
    });
    const stop = subscribeInbox(userId, demo, (invalidate) => void load(invalidate ?? true));
    return () => {
      active = false;
      requests.current++;
      stop();
    };
  }, [load, userId, demo]);
  async function loadMore() {
    if (cursor === null || paging.current) return;
    paging.current = true;
    setMore(true);
    setNotice("");
    const version = generation.current;
    try {
      const page = demo ? demoListInbox({ filter, cursor }) : await listInbox({ filter, cursor });
      if (version !== generation.current) return;
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !known.has(item.id))];
      });
      setCursor(page.nextCursor);
    } catch (cause) {
      if (version === generation.current)
        setNotice(cause instanceof Error ? cause.message : "이전 소식을 불러오지 못했어요");
    } finally {
      if (version === generation.current) {
        paging.current = false;
        setMore(false);
      }
    }
  }
  async function readAll() {
    if (readLock.current) return;
    readLock.current = true;
    setReading(true);
    setNotice("");
    const version = generation.current;
    try {
      const head = demo
        ? demoListInbox({ filter: "all", limit: 1 })
        : await listInbox({ filter: "all", limit: 1 });
      const throughId = head.items[0]?.id;
      if (throughId) {
        if (demo) demoMarkAllInboxRead(throughId);
        else await markAllInboxRead({ throughId });
        window.dispatchEvent(new Event("lemon:notifications-changed"));
      } else if (version === generation.current) await load();
    } catch (cause) {
      if (version === generation.current)
        setNotice(cause instanceof Error ? cause.message : "읽음 처리를 완료하지 못했어요");
    } finally {
      readLock.current = false;
      setReading(false);
    }
  }
  function open(item: InboxItem) {
    setNotice("");
    if (item.availability !== "available" || !item.target) {
      setNotice("지금은 이 소식을 확인할 수 없어요");
      return;
    }
    if (item.type === "encouragement_received" && item.occurrenceId) {
      setResolved(false);
      setSelected(item);
    } else {
      const separator = item.target.includes("?") ? "&" : "?";
      router.push(`${item.target}${separator}notification=${item.id}`);
    }
  }
  const onResolved = useCallback(
    (detail: OccurrenceDetail) => {
      if (!selected || detail.occurrence.id !== selected.occurrenceId) return;
      const exists =
        !selected.encouragementId ||
        detail.encouragements.some((row) => row.id === selected.encouragementId);
      setResolved(exists);
      if (!exists) {
        setSelected(null);
        setNotice("이 응원은 더 이상 확인할 수 없어요");
        void load();
      }
    },
    [selected, load],
  );
  const visible = loadedScope === `${account}:${filter}` ? items : [];
  return (
    <AppShell>
      <PageHeading
        title="소식"
        action={
          <Button size="sm" variant="ghost" loading={reading} onClick={() => void readAll()}>
            모두 읽음
          </Button>
        }
      />
      <div className={styles.filters} role="group" aria-label="소식 종류">
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {notice ? (
        <p className="inline-alert" role="status">
          {notice}
        </p>
      ) : null}
      {loading ? (
        <StatePanel kind="loading" title="소식을 불러오는 중" />
      ) : error ? (
        <StatePanel
          kind="error"
          title="소식을 불러오지 못했어요"
          description={error}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              다시 시도
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <StatePanel
          kind="empty"
          title={
            filter === "encouragement"
              ? "받은 응원이 없어요"
              : filter === "connection"
                ? "연결 소식이 없어요"
                : "아직 소식이 없어요"
          }
        />
      ) : (
        <section className={styles.list} aria-label="소식 목록">
          {visible.map((item) => (
            <button
              type="button"
              className={`${styles.row} ${item.readAt ? styles.read : ""}`}
              key={item.id}
              onClick={() => open(item)}
            >
              <span className={styles.icon} aria-hidden="true">
                {item.type === "encouragement_received" ? (
                  <Citrus size={20} />
                ) : (
                  <UserRoundPlus size={20} />
                )}
              </span>
              <span className={styles.body}>
                <span className={styles.label}>
                  {item.actorName}
                  <span>
                    {item.type === "encouragement_received"
                      ? "의 응원"
                      : item.type === "connection_request"
                        ? "의 연결 요청"
                        : "님과 연결됐어요"}
                  </span>
                </span>
                {item.availability === "unavailable" ? (
                  <span className={styles.unavailable}>지금은 확인할 수 없는 소식</span>
                ) : (
                  <>
                    {item.taskTitle ? (
                      <strong className={styles.title}>{item.taskTitle}</strong>
                    ) : null}
                    {item.messagePreview ? (
                      <span className={styles.preview}>{item.messagePreview}</span>
                    ) : item.reaction ? (
                      <span className={styles.preview}>{reactionLabels[item.reaction]}</span>
                    ) : null}
                    {item.type === "connection_request" ? (
                      <span className={styles.preview}>요청 확인하기</span>
                    ) : null}
                  </>
                )}
                <time dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleString("ko-KR", {
                    month: "numeric",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              </span>
              <span className={styles.tail}>
                {!item.readAt ? <span className={styles.dot} aria-label="읽지 않음" /> : null}
                <ArrowUpRight size={16} aria-hidden="true" />
              </span>
            </button>
          ))}
          {cursor !== null ? (
            <Button variant="secondary" loading={more} onClick={() => void loadMore()}>
              이전 소식 더 보기
            </Button>
          ) : null}
        </section>
      )}
      {selected ? (
        <>
          <OccurrenceDetailPanel
            notice={
              <InboxReadReceipt
                notificationId={selected.readAt ? null : selected.id}
                target={{
                  kind: "occurrence",
                  id: String(selected.occurrenceId),
                  encouragementId: selected.encouragementId,
                }}
                resolved={resolved}
              />
            }
            occurrenceId={selected.occurrenceId}
            encouragementId={selected.encouragementId}
            onClose={() => {
              setSelected(null);
              setResolved(false);
            }}
            onChanged={() => void load()}
            onResolved={onResolved}
          />
        </>
      ) : null}
    </AppShell>
  );
}

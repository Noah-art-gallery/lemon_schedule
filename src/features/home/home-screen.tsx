"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus, ChevronRight, Citrus } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { useAuth } from "@/features/auth/auth-provider";
import { listEncouragementSummaries } from "@/features/encouragements/encouragement-service";
import { getPetDetails, getPetDrawingUrl } from "@/features/pet/pet-service";
import {
  listOccurrenceWindow,
  listOwnHistory,
  createTask,
  completeOccurrence,
  reopenOccurrence,
  type TaskInput,
} from "@/features/tasks/task-service";
import { TaskEditor } from "@/features/tasks/task-editor";
import { TaskRowView } from "@/features/tasks/task-row-view";
import { OccurrenceDetailPanel } from "@/features/tasks/occurrence-detail-panel";
import {
  demoListOwn,
  demoListHistory,
  demoSummary,
  demoCreateTask,
  demoToggleOccurrence,
  subscribeDemoTasks,
} from "@/features/tasks/demo-task-store";
import { addUtcDays } from "@/features/tasks/recurrence";
import type { TaskOccurrenceRow } from "@/lib/supabase/database.types";
import type { CompletionCursor, EncouragementSummary, OwnHistoryItem } from "@/types/contracts";
import { toDateKey, getDeviceTimeZone } from "@/lib/time";
import styles from "@/features/tasks/task-experience.module.css";

type Tab = "today" | "upcoming" | "history";
export function HomeScreen() {
  const { demo, user } = useAuth();
  const [initialDate] = useState(() =>
    toDateKey(new Date(), demo ? "Asia/Seoul" : getDeviceTimeZone()),
  );
  const [ownerToday, setOwnerToday] = useState(initialDate);
  const [from, setFrom] = useState(addUtcDays(initialDate, -30));
  const [to, setTo] = useState(addUtcDays(initialDate, 30));
  const [items, setItems] = useState<TaskOccurrenceRow[]>([]);
  const [summaries, setSummaries] = useState<Map<number, EncouragementSummary>>(new Map());
  const [history, setHistory] = useState<OwnHistoryItem[]>([]);
  const [cursor, setCursor] = useState<CompletionCursor | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [pending, setPending] = useState<Set<number>>(new Set());
  const pendingRef = useRef(new Set<number>());
  const [selected, setSelected] = useState<number | null>(null);
  const closingQuery = useRef(false);
  const [targetCheer, setTargetCheer] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [discard, setDiscard] = useState(false);
  const dirty = useRef(false);
  const editorBusy = useRef(false);
  const [futureNotice, setFutureNotice] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pet, setPet] = useState<{ url: string | null; points: number } | null>(
    demo ? { url: null, points: 2 } : null,
  );
  const generation = useRef(0);
  const historyGeneration = useRef(0);
  const historyLock = useRef(false);
  const load = useCallback(async () => {
    const version = ++generation.current;
    if (!demo && !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (demo) {
        const rows = demoListOwn();
        setItems(rows);
        setPet((previous) =>
          previous ? { ...previous, points: demoListHistory().length } : previous,
        );
        setSummaries(new Map(rows.map((row) => [row.id, demoSummary(row.id)])));
      } else {
        const result = await listOccurrenceWindow({ ownerId: user!.id, from, to });
        const ids = result.occurrences.map((row) => row.id);
        const grouped = new Map<number, EncouragementSummary>();
        for (let start = 0; start < ids.length; start += 100) {
          const page = await listEncouragementSummaries({
            occurrenceIds: ids.slice(start, start + 100),
          });
          page.items.forEach((item) => grouped.set(item.occurrenceId, item.summary));
        }
        if (version !== generation.current) return;
        setItems(result.occurrences);
        setOwnerToday(result.today);
        setSummaries(grouped);
      }
    } catch (cause) {
      if (version === generation.current) {
        setItems([]);
        setSummaries(new Map());
        setError(cause instanceof Error ? cause.message : "할 일을 불러오지 못했어요");
      }
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [demo, user, from, to]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => {
      active = false;
      // Invalidate asynchronous list responses after dependency changes.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- invalidating the latest request is intentional
      generation.current++;
    };
  }, [load]);
  const loadHistory = useCallback(
    async (next?: CompletionCursor) => {
      if (historyLock.current && next) return;
      historyLock.current = true;
      const version = ++historyGeneration.current;
      setHistoryLoading(true);
      setHistoryError("");
      try {
        const result = demo
          ? { items: demoListHistory(), nextCursor: null }
          : await listOwnHistory({ cursor: next });
        if (version !== historyGeneration.current) return;
        setHistory((previous) =>
          next
            ? [
                ...previous,
                ...result.items.filter(
                  (item) => !previous.some((old) => old.occurrence.id === item.occurrence.id),
                ),
              ]
            : result.items,
        );
        setCursor(result.nextCursor);
      } catch (cause) {
        if (version === historyGeneration.current) {
          if (!next) setHistory([]);
          setHistoryError(cause instanceof Error ? cause.message : "기록을 불러오지 못했어요");
        }
      } finally {
        if (version === historyGeneration.current) {
          setHistoryLoading(false);
          historyLock.current = false;
        }
      }
    },
    [demo],
  );
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active && tab === "history") void loadHistory();
    });
    return () => {
      active = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- invalidating the latest request is intentional
      historyGeneration.current++;
      historyLock.current = false;
    };
  }, [tab, loadHistory]);
  const refresh = useCallback(() => {
    void load();
    if (tab === "history") void loadHistory();
  }, [load, loadHistory, tab]);
  useEffect(() => (demo ? subscribeDemoTasks(refresh) : undefined), [demo, refresh]);
  useEffect(() => {
    function query() {
      if (closingQuery.current) {
        closingQuery.current = false;
        const clean = new URL(window.location.href);
        clean.searchParams.delete("occurrence");
        clean.searchParams.delete("encouragement");
        window.history.replaceState(window.history.state, "", clean);
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const id = Number(params.get("occurrence"));
      if (Number.isSafeInteger(id) && id > 0) {
        setSelected(id);
        const cheer = Number(params.get("encouragement"));
        setTargetCheer(Number.isSafeInteger(cheer) && cheer > 0 ? cheer : null);
      }
    }
    query();
    window.addEventListener("popstate", query);
    return () => window.removeEventListener("popstate", query);
  }, []);
  useEffect(() => {
    if (demo || !user) return;
    let active = true;
    void getPetDetails(user.id)
      .then(async (result) => ({
        url: await getPetDrawingUrl(result.drawingPath),
        points: result.lemonPoints,
      }))
      .then((result) => {
        if (active) setPet(result);
      })
      .catch(() => {
        if (active) setPet(null);
      });
    return () => {
      active = false;
    };
  }, [demo, user, items]);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(""), 2800);
    return () => clearTimeout(timer);
  }, [feedback]);
  function open(id: number) {
    setTargetCheer(null);
    setSelected(id);
  }
  function closeDetail() {
    setSelected(null);
    setTargetCheer(null);
    const url = new URL(window.location.href);
    closingQuery.current = Boolean(
      url.searchParams.has("occurrence") && window.history.state?.lemonPanel,
    );
    url.searchParams.delete("occurrence");
    url.searchParams.delete("encouragement");
    window.history.replaceState(window.history.state, "", url);
  }
  async function toggle(row: TaskOccurrenceRow) {
    if (pendingRef.current.has(row.id)) return;
    pendingRef.current.add(row.id);
    setPending(new Set(pendingRef.current));
    setError("");
    try {
      if (demo) {
        if (demoToggleOccurrence(row.id).firstCompletion) {
          setFeedback("완료 · 펫이 1포인트 성장했어요 · 미리보기");
        }
      } else if (row.status === "completed") {
        await reopenOccurrence(row.id);
      } else {
        const result = await completeOccurrence(row.id);
        if (result.firstCompletion)
          setFeedback(`완료 · 펫이 ${result.rewardPoints}포인트 성장했어요`);
      }
      await load();
      if (tab === "history") await loadHistory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "상태를 저장하지 못했어요");
    } finally {
      pendingRef.current.delete(row.id);
      setPending(new Set(pendingRef.current));
    }
  }
  async function save(input: TaskInput) {
    if (demo) demoCreateTask(input);
    else await createTask(input);
    dirty.current = false;
    setAdding(false);
    if (input.dueDate > ownerToday) {
      setFutureNotice(input.dueDate);
      if (input.dueDate > to) setTo(input.dueDate);
    }
    await load();
  }
  const todayItems = items.filter((item) => item.occurrence_date === ownerToday);
  const overdue = items
    .filter((item) => item.occurrence_date < ownerToday && item.status === "pending")
    .sort((a, b) => a.occurrence_date.localeCompare(b.occurrence_date));
  const upcoming = items
    .filter((item) => item.occurrence_date > ownerToday)
    .sort((a, b) => a.occurrence_date.localeCompare(b.occurrence_date) || a.id - b.id);
  function rows(list: TaskOccurrenceRow[], dates = false) {
    return list.map((row, index) => (
      <div key={row.id}>
        {dates && (!index || list[index - 1].occurrence_date !== row.occurrence_date) ? (
          <h3 className={styles.groupDate}>{row.occurrence_date}</h3>
        ) : null}
        <TaskRowView
          occurrence={row}
          summary={summaries.get(row.id)}
          pending={pending.has(row.id)}
          onOpen={() => open(row.id)}
          onToggle={() => {
            // The compiler follows this callback through the row factory; it runs only on click.
            // eslint-disable-next-line react-hooks/refs
            void toggle(row);
          }}
        />
      </div>
    ));
  }
  return (
    <AppShell>
      <PageHeading
        title="할 일"
        action={
          <Button
            onClick={() => {
              dirty.current = false;
              setAdding(true);
            }}
          >
            <Plus size={18} aria-hidden="true" />할 일 추가
          </Button>
        }
      />
      <div className={styles.tabs} role="tablist" aria-label="할 일 보기">
        {(
          [
            ["today", "오늘"],
            ["upcoming", "예정"],
            ["history", "기록"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            className={styles.tab}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {futureNotice ? (
        <div className={styles.notice} role="status">
          <span>{futureNotice}에 추가했어요</span>
          <button
            className={styles.link}
            onClick={() => {
              setTab("upcoming");
              setFutureNotice("");
            }}
          >
            예정에서 보기
          </button>
        </div>
      ) : null}
      {error && tab !== "history" ? (
        <div className={styles.error} role="alert">
          {error}
          <Button variant="ghost" onClick={() => void load()}>
            다시 시도
          </Button>
        </div>
      ) : null}
      {loading && tab !== "history" ? (
        <p className={styles.skeleton} role="status">
          할 일 불러오는 중
        </p>
      ) : null}
      {tab === "today" && !loading ? (
        <>
          <div className={styles.toolbar}>
            <h2 className={styles.sectionTitle}>{ownerToday}</h2>
            <span className={styles.status}>
              {todayItems.filter((item) => item.status === "completed").length}/{todayItems.length}{" "}
              완료
            </span>
          </div>
          {overdue.length ? (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                밀린 할 일 <span>{overdue.length}</span>
              </h2>
              {rows(overdue, true)}
            </section>
          ) : null}
          <section className={styles.section} aria-label="오늘 할 일">
            {todayItems.length ? (
              rows(todayItems)
            ) : (
              <div className={styles.empty}>오늘 할 일이 없어요</div>
            )}
          </section>
          <Button
            className={styles.loadMore}
            variant="ghost"
            onClick={() => setFrom(addUtcDays(from, -30))}
          >
            이전 할 일 더 보기 · {from} 이전
          </Button>
          {pet ? (
            <Link href="/pet/" className={styles.pet}>
              {pet.url ? (
                <Image src={pet.url} width={40} height={40} alt="내 펫" />
              ) : (
                <Citrus size={28} aria-hidden="true" />
              )}
              <span>
                내 펫<small>{pet.points}포인트</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          ) : null}
        </>
      ) : null}
      {tab === "upcoming" && !loading ? (
        <section>
          <div className={styles.toolbar}>
            <span className={styles.status}>
              {ownerToday} 이후 · {to}까지
            </span>
          </div>
          {upcoming.length ? (
            rows(upcoming, true)
          ) : (
            <div className={styles.empty}>이 기간에 예정된 할 일이 없어요</div>
          )}
          <Button
            className={styles.loadMore}
            variant="secondary"
            onClick={() => setTo(addUtcDays(to, 30))}
          >
            다음 30일 보기
          </Button>
        </section>
      ) : null}
      {tab === "history" ? (
        <section aria-label="완료 기록">
          {historyError ? (
            <div role="alert" className={styles.error}>
              {historyError}
              <Button variant="ghost" onClick={() => void loadHistory()}>
                다시 시도
              </Button>
            </div>
          ) : null}
          {history.map((item, index) => (
            <div key={item.occurrence.id}>
              {!index ||
              history[index - 1].occurrence.occurrence_date !== item.occurrence.occurrence_date ? (
                <h3 className={styles.groupDate}>{item.occurrence.occurrence_date}</h3>
              ) : null}
              <TaskRowView
                occurrence={item.occurrence}
                summary={item.summary}
                taskDeleted={item.taskDeleted}
                onOpen={() => open(item.occurrence.id)}
              />
            </div>
          ))}
          {historyLoading ? (
            <p role="status" className={styles.skeleton}>
              기록 불러오는 중
            </p>
          ) : null}
          {!historyLoading && !historyError && !history.length ? (
            <div className={styles.empty}>완료한 기록이 없어요</div>
          ) : null}
          {cursor ? (
            <Button
              className={styles.loadMore}
              variant="secondary"
              loading={historyLoading}
              onClick={() => void loadHistory(cursor)}
            >
              이전 기록 더 보기
            </Button>
          ) : null}
        </section>
      ) : null}
      <Panel
        open={adding}
        title="할 일 추가"
        onClose={() => {
          setAdding(false);
          setDiscard(false);
        }}
        onBeforeClose={() => {
          if (editorBusy.current) return false;
          if (dirty.current) {
            setDiscard(true);
            return false;
          }
          return true;
        }}
      >
        {discard ? (
          <section className={styles.inlineConfirm}>
            <p>작성 중인 내용을 버릴까요?</p>
            <div className={styles.actions}>
              <Button variant="secondary" autoFocus onClick={() => setDiscard(false)}>
                계속 작성
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  dirty.current = false;
                  setAdding(false);
                  setDiscard(false);
                }}
              >
                내용 버리기
              </Button>
            </div>
          </section>
        ) : null}
        <TaskEditor
          initial={{ title: "", dueDate: ownerToday, dueTime: "", recurrence: "none" }}
          onDirtyChange={(value) => {
            dirty.current = value;
          }}
          onBusyChange={(busy) => {
            editorBusy.current = busy;
          }}
          onSave={save}
          onCancel={() => {
            if (dirty.current) setDiscard(true);
            else setAdding(false);
          }}
        />
      </Panel>
      <OccurrenceDetailPanel
        occurrenceId={selected}
        encouragementId={targetCheer}
        onClose={closeDetail}
        onChanged={refresh}
      />
      {feedback ? (
        <div role="status" className={styles.toast}>
          {feedback}
        </div>
      ) : null}
    </AppShell>
  );
}

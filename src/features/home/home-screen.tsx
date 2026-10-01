"use client";

import { Check, Clock3, MessageCircle, PencilLine, Plus, Sparkles, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { ProgressRing } from "@/components/ui/progress-ring";
import { useAuth } from "@/features/auth/auth-provider";
import {
  hideEncouragement,
  listEncouragements,
  type EncouragementDisplay,
} from "@/features/encouragements/encouragement-service";
import { getPetDetails, getPetDrawingUrl } from "@/features/pet/pet-service";
import {
  completeOccurrence,
  createTask,
  deleteTask,
  getOwnOccurrence,
  listOccurrences,
  reopenOccurrence,
  updateTask,
} from "@/features/tasks/task-service";
import { addUtcDays } from "@/features/tasks/recurrence";
import { AppError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { TaskOccurrenceRow } from "@/lib/supabase/database.types";
import { getDeviceTimeZone, toDateKey } from "@/lib/time";

const demoOccurrences: TaskOccurrenceRow[] = [
  {
    id: 1,
    task_id: 1,
    owner_id: "demo",
    occurrence_date: "today",
    title_snapshot: "물 2잔 마시기",
    due_time: null,
    recurrence_snapshot: "daily",
    status: "completed",
    completed_at: new Date().toISOString(),
    first_completed_at: new Date().toISOString(),
    reopened_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 2,
    task_id: 2,
    owner_id: "demo",
    occurrence_date: "today",
    title_snapshot: "영어 단어 10개",
    due_time: null,
    recurrence_snapshot: "daily",
    status: "completed",
    completed_at: new Date().toISOString(),
    first_completed_at: new Date().toISOString(),
    reopened_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 3,
    task_id: 3,
    owner_id: "demo",
    occurrence_date: "today",
    title_snapshot: "저녁 산책",
    due_time: "19:30:00",
    recurrence_snapshot: "none",
    status: "pending",
    completed_at: null,
    first_completed_at: null,
    reopened_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

function recurrenceLabel(value: TaskOccurrenceRow["recurrence_snapshot"]): string {
  return { none: "", daily: "매일 반복", weekly: "매주 반복", monthly: "매월 반복" }[value];
}

export function HomeScreen() {
  const { user, demo } = useAuth();
  const [timeZone, setTimeZone] = useState(() => (demo ? "Asia/Seoul" : getDeviceTimeZone()));
  const today = toDateKey(new Date(), timeZone);
  const [ownerToday, setOwnerToday] = useState(today);
  const [items, setItems] = useState<TaskOccurrenceRow[]>(() =>
    demo ? demoOccurrences.map((item) => ({ ...item, occurrence_date: today })) : [],
  );
  const [loading, setLoading] = useState(!demo);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TaskOccurrenceRow | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [petImageUrl, setPetImageUrl] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<TaskOccurrenceRow | null>(null);
  const [encouragements, setEncouragements] = useState<EncouragementDisplay[]>([]);
  const [error, setError] = useState("");

  async function load() {
    if (demo) return;
    if (!user) return;
    try {
      const result = await listOccurrences({
        ownerId: user.id,
        from: addUtcDays(today, -366),
        to: addUtcDays(today, 366),
      });
      setItems(result.occurrences);
      setOwnerToday(result.today);
      setError("");
    } catch (cause) {
      setError(cause instanceof AppError ? cause.message : "목록을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (demo || !user) return;
    let active = true;
    void Promise.all([
      listOccurrences({
        ownerId: user.id,
        from: addUtcDays(today, -366),
        to: addUtcDays(today, 366),
      }),
      getSupabaseClient()
        .from("profile_private")
        .select("time_zone")
        .eq("user_id", user.id)
        .single(),
    ])
      .then(([result, privateProfile]) => {
        if (privateProfile.error)
          throw new AppError("INVALID_INPUT", "시간대 정보를 불러오지 못했어요.");
        if (active) {
          setItems(result.occurrences);
          setOwnerToday(result.today);
          if (privateProfile.data) setTimeZone(privateProfile.data.time_zone);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "목록을 불러오지 못했어요.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [demo, today, user]);

  useEffect(() => {
    if (demo || !user) return;
    let active = true;
    void getPetDetails(user.id)
      .then((pet) => getPetDrawingUrl(pet.drawingPath))
      .then((url) => {
        if (active) setPetImageUrl(url);
      })
      .catch(() => {
        if (active) setPetImageUrl(null);
      });
    return () => {
      active = false;
    };
  }, [demo, user]);

  const openRecord = useCallback(
    async (item: TaskOccurrenceRow) => {
      setSelectedRecord(item);
      if (demo) {
        setEncouragements([]);
        return;
      }
      try {
        setEncouragements(await listEncouragements(item.id));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "받은 응원을 불러오지 못했어요.");
      }
    },
    [demo],
  );

  useEffect(() => {
    if (demo || !user) return;
    const occurrenceId = Number(new URLSearchParams(window.location.search).get("occurrence"));
    if (!Number.isSafeInteger(occurrenceId) || occurrenceId <= 0) return;
    void getOwnOccurrence(occurrenceId, user.id)
      .then(openRecord)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "완료 기록을 찾지 못했어요."),
      );
  }, [demo, user, openRecord]);

  const todayItems = items.filter((item) => item.occurrence_date === ownerToday);
  const overdueItems = items.filter(
    (item) => item.occurrence_date < ownerToday && item.status === "pending",
  );
  const completed = todayItems.filter((item) => item.status === "completed").length;
  const completedHistory = items
    .filter((item) => item.occurrence_date < ownerToday && item.status === "completed")
    .sort((a, b) => b.occurrence_date.localeCompare(a.occurrence_date) || b.id - a.id);

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setError("");
    try {
      if (editing) {
        if (demo) {
          setItems((current) =>
            current.map((item) =>
              item.task_id === editing.task_id
                ? {
                    ...item,
                    title_snapshot: String(data.get("title")),
                    due_time: String(data.get("dueTime") || "") || null,
                    recurrence_snapshot: String(
                      data.get("recurrence"),
                    ) as TaskOccurrenceRow["recurrence_snapshot"],
                  }
                : item,
            ),
          );
        } else {
          await updateTask({
            taskId: editing.task_id,
            title: String(data.get("title") ?? ""),
            dueDate: String(data.get("dueDate") ?? ""),
            dueTime: String(data.get("dueTime") ?? ""),
            recurrence: String(data.get("recurrence") ?? "none") as "none",
          });
          await load();
        }
      } else if (demo) {
        const recurrence = String(
          data.get("recurrence"),
        ) as TaskOccurrenceRow["recurrence_snapshot"];
        setItems((current) => [
          ...current,
          {
            ...demoOccurrences[2],
            id: Date.now(),
            task_id: Date.now(),
            title_snapshot: String(data.get("title")),
            occurrence_date: String(data.get("dueDate")),
            due_time: String(data.get("dueTime") || "") || null,
            recurrence_snapshot: recurrence,
          },
        ]);
      } else if (user) {
        await createTask({
          title: String(data.get("title") ?? ""),
          dueDate: String(data.get("dueDate") ?? ""),
          dueTime: String(data.get("dueTime") ?? ""),
          recurrence: String(data.get("recurrence") ?? "none") as "none",
        });
        await load();
      }
      form.reset();
      setShowForm(false);
      setEditing(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "할 일을 저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: TaskOccurrenceRow) {
    if (!window.confirm(`‘${item.title_snapshot}’ 할 일을 삭제할까요?`)) return;
    try {
      if (demo) setItems((current) => current.filter((value) => value.task_id !== item.task_id));
      else {
        await deleteTask(item.task_id);
        await load();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "할 일을 삭제하지 못했어요.");
    }
  }

  async function edit(item: TaskOccurrenceRow) {
    if (demo) {
      setEditing(item);
    } else {
      const { data, error: taskError } = await getSupabaseClient()
        .from("tasks")
        .select("title, due_date, due_time, recurrence")
        .eq("id", item.task_id)
        .single();
      if (taskError || !data) {
        setError("원본 할 일을 불러오지 못했어요.");
        return;
      }
      setEditing({
        ...item,
        title_snapshot: data.title,
        occurrence_date: data.due_date,
        due_time: data.due_time,
        recurrence_snapshot: data.recurrence,
      });
    }
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggle(item: TaskOccurrenceRow) {
    setError("");
    if (demo) {
      const completing = item.status === "pending";
      setItems((current) =>
        current.map((value) =>
          value.id === item.id
            ? {
                ...value,
                status: completing ? "completed" : "pending",
                completed_at: completing ? new Date().toISOString() : null,
              }
            : value,
        ),
      );
      if (completing) setCelebrate(true);
      return;
    }
    try {
      if (item.status === "completed") await reopenOccurrence(item.id);
      else if ((await completeOccurrence(item.id)).firstCompletion) setCelebrate(true);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "상태를 바꾸지 못했어요.");
    }
  }

  return (
    <AppShell notificationCount={demo ? 2 : undefined}>
      <PageHeading
        eyebrow={new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone }).format(
          new Date(),
        )}
        title="오늘도 한 걸음, 같이 해요"
        description="작은 완료가 쌓일수록 레몬 펫도 함께 자라요."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setShowForm((value) => !value);
            }}
            aria-expanded={showForm}
            aria-label={showForm ? "할 일 추가 닫기" : "할 일 추가"}
          >
            {showForm ? <X size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
            <span className="button-label">{showForm ? "닫기" : "할 일 추가"}</span>
          </Button>
        }
      />

      {showForm ? (
        <Card as="section" className="task-form-card" aria-labelledby="new-task-title">
          <h2 id="new-task-title">{editing ? "할 일 수정" : "새 할 일"}</h2>
          <form className="task-form" onSubmit={submitTask} key={editing?.id ?? "new"}>
            <Field
              label="할 일"
              name="title"
              defaultValue={editing?.title_snapshot}
              maxLength={80}
              required
            />
            <Field
              label="날짜"
              name="dueDate"
              type="date"
              defaultValue={editing?.occurrence_date ?? ownerToday}
              required
            />
            <Field
              label="시간 (선택)"
              name="dueTime"
              type="time"
              defaultValue={editing?.due_time?.slice(0, 5)}
            />
            <label className="field">
              <span className="field__label">반복</span>
              <select
                className="field__input"
                name="recurrence"
                defaultValue={editing?.recurrence_snapshot ?? "none"}
              >
                <option value="none">반복 없음</option>
                <option value="daily">매일</option>
                <option value="weekly">매주</option>
                <option value="monthly">매월</option>
              </select>
            </label>
            <Button type="submit" loading={saving}>
              {editing ? "수정" : "저장"}
            </Button>
          </form>
        </Card>
      ) : null}

      {error ? (
        <p className="inline-alert" role="alert">
          {error}
        </p>
      ) : null}

      <section className="home-grid" aria-label="오늘 요약" aria-busy={loading}>
        <Card as="section" tone="lemon" className="pet-summary">
          <div className="pet-summary__copy">
            <span className="status-pill">
              <Sparkles size={14} aria-hidden="true" /> 레몬 펫의 응원
            </span>
            <h2>
              {completed ? `벌써 ${completed}가지나 해냈어요!` : "첫 완료를 기다리고 있어요!"}
            </h2>
            <p>
              {todayItems.length
                ? "한 번씩 체크할 때마다 레몬 펫이 응원해요."
                : "오늘 할 일을 하나 만들어 볼까요?"}
            </p>
          </div>
          {petImageUrl ? (
            // 비공개 그림은 소유자에게 발급된 짧은 signed URL로만 표시한다.
            <Image
              src={petImageUrl}
              alt="내가 직접 그린 레몬 펫"
              width={240}
              height={240}
              unoptimized
              className="pet-summary__image"
            />
          ) : (
            <Image
              src="/images/lemon-pet-default.png"
              alt="두 팔을 들고 응원하는 기본 레몬 펫"
              width={240}
              height={240}
              className="pet-summary__image"
              priority
            />
          )}
          <ProgressRing completed={completed} total={todayItems.length} />
        </Card>

        <Card as="section" className="task-section" aria-labelledby="today-tasks-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">TODAY</p>
              <h2 id="today-tasks-title">오늘 할 일</h2>
            </div>
            <span className="task-count">
              {completed} / {todayItems.length}
            </span>
          </div>
          {loading ? <p className="muted-copy">할 일을 불러오는 중이에요…</p> : null}
          {!loading && todayItems.length === 0 ? (
            <p className="muted-copy">오늘 할 일이 없어요. 여유를 즐겨도 좋아요.</p>
          ) : null}
          <ul className="task-list">
            {todayItems.map((item) => (
              <TaskRow
                key={item.id}
                item={item}
                onToggle={() => void toggle(item)}
                onEdit={() => void edit(item)}
                onDelete={() => void remove(item)}
                onViewEncouragements={
                  item.status === "completed" ? () => void openRecord(item) : undefined
                }
              />
            ))}
          </ul>
        </Card>
      </section>

      <Card as="section" className="overdue-card" aria-labelledby="overdue-title">
        <div className="section-heading section-heading--compact">
          <div>
            <p className="eyebrow eyebrow--warm">DON&apos;T FORGET</p>
            <h2 id="overdue-title">밀린 할 일</h2>
          </div>
          <span className="overdue-count">{overdueItems.length}</span>
        </div>
        {overdueItems.length === 0 ? (
          <p className="muted-copy">밀린 할 일이 없어요.</p>
        ) : (
          overdueItems.map((item) => (
            <TaskRow
              key={item.id}
              item={item}
              onToggle={() => void toggle(item)}
              onEdit={() => void edit(item)}
              onDelete={() => void remove(item)}
              overdue
            />
          ))
        )}
      </Card>

      {completedHistory.length ? (
        <Card as="section" className="overdue-card" aria-labelledby="history-title">
          <div className="section-heading section-heading--compact">
            <div>
              <p className="eyebrow">DONE</p>
              <h2 id="history-title">완료 기록</h2>
            </div>
            <span className="task-count">{completedHistory.length}</span>
          </div>
          <ul className="task-list">
            {completedHistory.slice(0, 20).map((item) => (
              <li className="task-row task-row--completed" key={item.id}>
                <span className="task-check" aria-hidden="true">
                  <Check size={17} />
                </span>
                <span className="task-row__body">
                  <strong>{item.title_snapshot}</strong>
                  <small>{item.occurrence_date}</small>
                </span>
                <Button size="sm" variant="ghost" onClick={() => void openRecord(item)}>
                  <MessageCircle size={15} aria-hidden="true" /> 응원 보기
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {selectedRecord ? (
        <Card as="section" className="encouragement-panel" aria-labelledby="encouragement-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CHEERS</p>
              <h2 id="encouragement-title">받은 응원 · {selectedRecord.title_snapshot}</h2>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedRecord(null)}
              aria-label="응원 닫기"
            >
              <X size={16} />
            </Button>
          </div>
          {encouragements.length ? (
            <ul className="encouragement-list">
              {encouragements.map((item) => (
                <li key={item.id}>
                  <span>🍋</span>
                  <div>
                    <strong>{item.authorName}</strong>
                    <p>{item.message || "레몬 응원을 보냈어요!"}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        const hidden = item.visibility !== "hidden_by_owner";
                        await hideEncouragement(item.id, hidden);
                        setEncouragements((current) =>
                          current.map((value) =>
                            value.id === item.id
                              ? { ...value, visibility: hidden ? "hidden_by_owner" : "visible" }
                              : value,
                          ),
                        );
                      } catch (cause) {
                        setError(
                          cause instanceof Error ? cause.message : "응원 표시를 바꾸지 못했어요.",
                        );
                      }
                    }}
                  >
                    {item.visibility === "hidden_by_owner" ? "다시 표시" : "숨기기"}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-copy">아직 받은 응원이 없어요.</p>
          )}
        </Card>
      ) : null}

      {celebrate ? (
        <div
          className="celebration"
          role="dialog"
          aria-modal="true"
          aria-labelledby="celebration-title"
        >
          <div className="celebration__card">
            {petImageUrl ? (
              <Image
                src={petImageUrl}
                alt="완료를 축하하는 나만의 펫"
                width={220}
                height={220}
                unoptimized
              />
            ) : (
              <Image
                src="/images/lemon-pet-default.png"
                alt="완료를 축하하는 레몬 펫"
                width={220}
                height={220}
              />
            )}
            <p className="eyebrow">{demo ? "DEMO PREVIEW" : "+1 LEMON POINT"}</p>
            <h2 id="celebration-title">정말 잘했어요!</h2>
            <p>
              {demo
                ? "미리보기예요. 실제 포인트 저장과 친구 알림은 Supabase 연결 후 동작해요."
                : "친구들에게도 완료 소식을 전했어요."}
            </p>
            <Button onClick={() => setCelebrate(false)}>계속하기</Button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function TaskRow({
  item,
  onToggle,
  onEdit,
  onDelete,
  onViewEncouragements,
  overdue = false,
}: {
  item: TaskOccurrenceRow;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onViewEncouragements?: () => void;
  overdue?: boolean;
}) {
  const complete = item.status === "completed";
  const detail = item.due_time
    ? item.due_time.slice(0, 5)
    : recurrenceLabel(item.recurrence_snapshot);
  return (
    <li
      className={`task-row ${complete ? "task-row--completed" : ""} ${overdue ? "task-row--overdue" : ""}`.trim()}
    >
      <button
        type="button"
        className="task-check"
        onClick={onToggle}
        aria-label={`${item.title_snapshot} ${complete ? "완료 취소" : "완료로 표시"}`}
      >
        {complete ? <Check size={17} aria-hidden="true" /> : null}
      </button>
      <span className="task-row__body">
        <strong>{item.title_snapshot}</strong>
        <small>
          {item.due_time ? (
            <>
              <Clock3 size={13} aria-hidden="true" /> {detail}
            </>
          ) : (
            detail || (complete ? "완료했어요" : "한 번만")
          )}
        </small>
      </span>
      <span className="task-row__actions">
        {onViewEncouragements ? (
          <button
            type="button"
            onClick={onViewEncouragements}
            aria-label={`${item.title_snapshot} 응원 보기`}
          >
            <MessageCircle size={15} aria-hidden="true" />
          </button>
        ) : null}
        <button type="button" onClick={onEdit} aria-label={`${item.title_snapshot} 수정`}>
          <PencilLine size={15} aria-hidden="true" />
        </button>
        <button type="button" onClick={onDelete} aria-label={`${item.title_snapshot} 삭제`}>
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </span>
    </li>
  );
}

"use client";
import { useRef, useState, useEffect, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { taskInputSchema, type TaskInput } from "./task-service";
import styles from "./task-experience.module.css";
export function TaskEditor({
  initial,
  onSave,
  onCancel,
  onDirtyChange,
  onBusyChange,
  editing = false,
}: {
  initial: TaskInput;
  onSave: (values: TaskInput) => Promise<void>;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  editing?: boolean;
}) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const title = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    // Let the enclosing panel capture its opening control before moving into the form.
    queueMicrotask(() => {
      if (active) title.current?.focus();
    });
    return () => {
      active = false;
    };
  }, []);
  function change(next: Partial<TaskInput>) {
    const updated = { ...values, ...next };
    setValues(updated);
    onDirtyChange(JSON.stringify(updated) !== JSON.stringify(initial));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    setError("");
    const parsed = taskInputSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요");
      return;
    }
    lock.current = true;
    setSaving(true);
    onBusyChange?.(true);
    try {
      await onSave(parsed.data);
      onDirtyChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "저장하지 못했어요");
    } finally {
      lock.current = false;
      setSaving(false);
      onBusyChange?.(false);
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)} className={styles.form}>
      <label className={styles.label}>
        할 일
        <input
          disabled={saving}
          ref={title}
          className={styles.input}
          value={values.title}
          maxLength={80}
          required
          onChange={(event) => change({ title: event.target.value })}
          placeholder="할 일을 입력하세요"
        />
      </label>
      <label className={styles.label}>
        날짜
        <input
          disabled={saving}
          className={styles.input}
          type="date"
          required
          value={values.dueDate}
          onChange={(event) => change({ dueDate: event.target.value })}
        />
      </label>
      <div className={styles.formGrid}>
        <label className={styles.label}>
          시간 (선택)
          <input
            disabled={saving}
            type="time"
            className={styles.input}
            value={values.dueTime ?? ""}
            onChange={(event) => change({ dueTime: event.target.value })}
          />
        </label>
        <label className={styles.label}>
          반복
          <select
            disabled={saving}
            className={styles.input}
            value={values.recurrence ?? "none"}
            onChange={(event) =>
              change({ recurrence: event.target.value as TaskInput["recurrence"] })
            }
          >
            <option value="none">반복 안 함</option>
            <option value="daily">매일</option>
            <option value="weekly">매주</option>
            <option value="monthly">매월</option>
          </select>
        </label>
      </div>
      {editing && initial.recurrence !== "none" ? (
        <p className={styles.status}>
          반복 일정 전체를 수정합니다. 앞으로 할 일정에 적용되며, 이미 완료한 기록과 포인트는
          유지됩니다.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        <Button variant="secondary" disabled={saving} onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" loading={saving}>
          {editing ? "변경 저장" : "할 일 추가"}
        </Button>
      </div>
    </form>
  );
}

"use client";
import { useRef, useState } from "react";
import { Citrus, Hand, Heart, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EncouragementSummary, Reaction } from "@/types/contracts";
import styles from "@/features/tasks/task-experience.module.css";

export const reactionLabels = { lemon: "레몬", clap: "박수", heart: "좋아요", cheer: "응원" };
const icons = { lemon: Citrus, clap: Hand, heart: Heart, cheer: Flag };
export function EncouragementComposer({
  existing,
  onSend,
  onDirtyChange,
}: {
  existing: EncouragementSummary["myEncouragement"];
  onSend: (reaction: Reaction | null, message: string) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [message, setMessage] = useState(existing?.message ?? "");
  const [reaction, setReaction] = useState<Reaction | null>(existing?.reaction ?? null);
  const [savedMessage, setSavedMessage] = useState(existing?.message ?? "");
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(Boolean(existing));
  async function send(nextReaction: Reaction | null, quick: boolean) {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    setError("");
    const text = quick ? savedMessage : message;
    try {
      await onSend(nextReaction, text);
      setReaction(nextReaction);
      setSent(true);
      if (!quick) {
        setSavedMessage(text);
        onDirtyChange(false);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "응원을 보내지 못했어요");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  return (
    <section className={styles.composer} aria-label="응원 남기기">
      <div className={styles.reactions}>
        {(Object.keys(reactionLabels) as Reaction[]).map((value) => {
          const Icon = icons[value];
          return (
            <button
              type="button"
              key={value}
              className={styles.reaction}
              aria-label={reactionLabels[value]}
              aria-pressed={reaction === value}
              disabled={saving}
              onClick={() => void send(value, true)}
            >
              <Icon size={16} aria-hidden="true" />
              {reactionLabels[value]}
            </button>
          );
        })}
      </div>
      <label className={styles.label}>
        응원글
        <textarea
          disabled={saving}
          className={`${styles.input} ${styles.textArea}`}
          maxLength={120}
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            onDirtyChange(event.target.value !== savedMessage);
          }}
          placeholder="친구에게 한마디"
        />
      </label>
      <div className={styles.composerFooter}>
        <span>
          {message.length}/120{sent ? " · 보낸 응원" : ""}
        </span>
        <Button
          loading={saving}
          disabled={!message.trim() && !reaction}
          onClick={() => void send(reaction, false)}
        >
          {sent ? "응원 수정" : "응원 보내기"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </section>
  );
}

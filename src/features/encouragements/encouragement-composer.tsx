"use client";
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EncouragementSummary, Reaction } from "@/types/contracts";
import styles from "@/features/tasks/task-experience.module.css";

import { ReactionImage, reactionLabels } from "./reaction-image";
export { reactionLabels } from "./reaction-image";
export function EncouragementComposer({
  existing,
  onSend,
  onDirtyChange,
  busy = false,
}: {
  existing: EncouragementSummary["myEncouragement"];
  onSend: (reaction: Reaction | null, message: string) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
  busy?: boolean;
}) {
  const [message, setMessage] = useState(existing?.message ?? "");
  const [reaction, setReaction] = useState<Reaction | null>(existing?.reaction ?? null);
  const [savedMessage, setSavedMessage] = useState(existing?.message ?? "");
  const [savedReaction, setSavedReaction] = useState(existing?.reaction ?? null);
  const [saving, setSaving] = useState(false);
  const interactionBusy = saving || busy;
  const lock = useRef(false);
  const alive = useRef(true);
  const root = useRef<HTMLElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (interactionBusy || !restoreFocus.current) return;
    restoreFocus.current = false;
    const active = document.activeElement;
    if (
      !root.current?.closest("[hidden]") &&
      (!active || active === document.body || root.current?.contains(active))
    )
      input.current?.focus();
  }, [interactionBusy]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(Boolean(existing));
  async function send(nextReaction: Reaction | null) {
    if (lock.current || busy) return;
    restoreFocus.current = Boolean(root.current?.contains(document.activeElement));
    lock.current = true;
    setSaving(true);
    setError("");
    const text = message.trim();
    try {
      await onSend(nextReaction, text);
      if (!alive.current) return;
      setReaction(nextReaction);
      setSent(true);
      setMessage(text);
      setSavedMessage(text);
      setSavedReaction(nextReaction);
      onDirtyChange(false);
    } catch (cause) {
      if (!alive.current) return;
      setError(cause instanceof Error ? cause.message : "응원을 보내지 못했어요");
    } finally {
      lock.current = false;
      if (alive.current) setSaving(false);
    }
  }
  return (
    <section ref={root} className={styles.composer} aria-label="응원 남기기">
      <div className={styles.reactions}>
        {(Object.keys(reactionLabels) as Reaction[]).map((value) => {
          return (
            <button
              type="button"
              key={value}
              className={styles.reaction}
              aria-label={reactionLabels[value]}
              title={reactionLabels[value]}
              aria-pressed={reaction === value}
              disabled={interactionBusy}
              onClick={() => {
                const next = reaction === value ? null : value;
                setReaction(next);
                onDirtyChange(next !== savedReaction || message !== savedMessage);
              }}
            >
              <ReactionImage reaction={value} decorative />
              {reaction === value ? (
                <span className={styles.reactionCheck} aria-hidden="true">
                  <Check size={12} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <label className={styles.label}>
        응원글
        <textarea
          ref={input}
          disabled={interactionBusy}
          className={`${styles.input} ${styles.textArea}`}
          maxLength={120}
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            onDirtyChange(event.target.value !== savedMessage || reaction !== savedReaction);
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
          disabled={interactionBusy || (!message.trim() && !reaction)}
          onClick={() => void send(reaction)}
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

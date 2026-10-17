"use client";

import { Check, CircleAlert, Info, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { CharacterSprite } from "@/components/ui/character-sprite";
import styles from "./feedback.module.css";

export interface FeedbackInput {
  title: string;
  description?: string;
  kind?: "success" | "info" | "error" | "completion";
  rewardPoints?: number;
}

export interface Feedback extends FeedbackInput {
  id: number;
}

const feedbackDismissers = new Set<() => void>();

export function useFeedback() {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const sequence = useRef(0);
  const mounted = useRef(false);
  const dismissFeedback = useCallback(() => setFeedback(null), []);
  useEffect(() => {
    mounted.current = true;
    feedbackDismissers.add(dismissFeedback);
    return () => {
      mounted.current = false;
      feedbackDismissers.delete(dismissFeedback);
    };
  }, [dismissFeedback]);
  const showFeedback = useCallback((input: FeedbackInput) => {
    if (!mounted.current) return;
    feedbackDismissers.forEach((dismiss) => dismiss());
    setFeedback({ ...input, id: ++sequence.current });
  }, []);
  return { feedback, showFeedback, dismissFeedback };
}

function subscribeToPanels(notify: () => void) {
  const observer = new MutationObserver(notify);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

function feedbackContainer() {
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
  return (
    Array.from(dialogs)
      .reverse()
      .find((dialog) => !dialog.closest("[inert]")) ?? document.body
  );
}

export function FeedbackToast({
  feedback,
  onDismiss,
}: {
  feedback: Feedback | null;
  onDismiss: () => void;
}) {
  if (!feedback) return null;
  return <FeedbackPortal feedback={feedback} onDismiss={onDismiss} />;
}

function FeedbackPortal({ feedback, onDismiss }: { feedback: Feedback; onDismiss: () => void }) {
  const container = useSyncExternalStore(subscribeToPanels, feedbackContainer, () => null);
  if (!container) return null;

  // Keep announcements and the dismiss control inside the active panel's inert/focus boundary.
  return createPortal(
    <ActiveFeedback key={feedback.id} feedback={feedback} onDismiss={onDismiss} />,
    container,
  );
}

function ActiveFeedback({ feedback, onDismiss }: { feedback: Feedback; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  const hovered = useRef(false);
  const focused = useRef(false);
  const remaining = useRef(5000);
  const priorFocus = useRef<HTMLElement | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const kind = feedback.kind ?? "success";
  const Icon = kind === "error" ? CircleAlert : kind === "info" ? Info : Check;

  useEffect(() => {
    priorFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timeout = window.setTimeout(onDismiss, remaining.current);
    return () => {
      window.clearTimeout(timeout);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [onDismiss, paused]);

  function dismiss() {
    if (root.current?.contains(document.activeElement) && priorFocus.current?.isConnected) {
      priorFocus.current.focus({ preventScroll: true });
    }
    onDismiss();
  }

  return (
    <div
      ref={root}
      className={[styles.toast, styles[kind]].filter(Boolean).join(" ")}
      data-feedback-kind={kind}
      onMouseEnter={() => {
        hovered.current = true;
        setPaused(true);
      }}
      onMouseLeave={() => {
        hovered.current = false;
        setPaused(focused.current);
      }}
      onFocusCapture={() => {
        focused.current = true;
        setPaused(true);
      }}
      onBlurCapture={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        focused.current = false;
        setPaused(hovered.current);
      }}
    >
      <span className={styles.art} aria-hidden="true">
        {kind === "completion" ? (
          <>
            <span className={styles.burst}>
              {Array.from({ length: 6 }, (_, index) => (
                <i key={index} />
              ))}
            </span>
            <CharacterSprite name="reaction-lemon" size={56} className={styles.character} />
          </>
        ) : (
          <Icon size={22} strokeWidth={2.5} />
        )}
      </span>
      <div
        className={styles.message}
        role={kind === "error" ? "alert" : "status"}
        aria-atomic="true"
      >
        <strong>{feedback.title}</strong>
        {feedback.description ? <p>{feedback.description}</p> : null}
        {kind === "completion" && (feedback.rewardPoints ?? 0) > 0 ? (
          <span className={styles.reward}>+{feedback.rewardPoints} 성장</span>
        ) : null}
      </div>
      <button
        type="button"
        className={styles.dismiss}
        aria-label="안내 닫기"
        onMouseDown={(event) => event.preventDefault()}
        onClick={dismiss}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

export function LoadingIndicator({
  label = "불러오는 중",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <span className={`${styles.loading} ${compact ? styles.compact : ""}`} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

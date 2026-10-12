"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

export type PanelCloseReason = "button" | "escape" | "backdrop" | "back";

export interface PanelProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: (reason: PanelCloseReason) => void;
  description?: string;
  footer?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onBeforeClose?: () => boolean;
  history?: boolean;
  className?: string;
}

const focusableSelector =
  'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex]:not([tabindex="-1"])';

function isAvailableForFocus(item: HTMLElement) {
  if (item.matches(':disabled, input[type="hidden"]')) return false;
  for (let ancestor: HTMLElement | null = item; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor.hidden || ancestor.inert || ancestor.getAttribute("aria-hidden") === "true")
      return false;
    const style = window.getComputedStyle(ancestor);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse"
    )
      return false;
    if (ancestor instanceof HTMLDetailsElement && !ancestor.open) {
      const summary = Array.from(ancestor.children).find((child) => child.tagName === "SUMMARY");
      if (!summary?.contains(item)) return false;
    }
  }
  return true;
}

function focusTargets(element: HTMLElement) {
  return Array.from(element.querySelectorAll<HTMLElement>(focusableSelector)).filter((item) => {
    const tabIndex = item.getAttribute("tabindex");
    return (tabIndex === null || Number(tabIndex) >= 0) && isAvailableForFocus(item);
  });
}

let pendingHistoryBack: Promise<void> | null = null;
const backgroundLocks = new WeakMap<HTMLElement, { count: number; inert: boolean }>();
let scrollLocks = 0;
let originalOverflow = "";

function lockBackground(element: HTMLElement) {
  const existing = backgroundLocks.get(element);
  if (existing) existing.count++;
  else backgroundLocks.set(element, { count: 1, inert: element.inert });
  element.inert = true;
}

function unlockBackground(element: HTMLElement) {
  const lock = backgroundLocks.get(element);
  if (!lock || --lock.count > 0) return;
  element.inert = lock.inert;
  backgroundLocks.delete(element);
}

function removePanelHistoryEntry() {
  pendingHistoryBack = new Promise<void>((resolve) => {
    window.addEventListener(
      "popstate",
      () => {
        pendingHistoryBack = null;
        resolve();
      },
      { once: true },
    );
    window.history.back();
  });
}

export function Panel({
  open,
  title,
  children,
  onClose,
  description,
  footer,
  initialFocusRef,
  onBeforeClose,
  history: manageHistory = true,
  className = "",
}: PanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onClose, onBeforeClose });
  useEffect(() => {
    callbacks.current = { onClose, onBeforeClose };
  });

  function requestClose(reason: PanelCloseReason) {
    if (callbacks.current.onBeforeClose?.() === false) return;
    callbacks.current.onClose(reason);
  }

  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (scrollLocks++ === 0) originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const background = Array.from(document.body.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && !child.contains(element),
    );
    background.forEach(lockBackground);
    const requestedFocus = initialFocusRef?.current;
    const initialFocus =
      requestedFocus && isAvailableForFocus(requestedFocus)
        ? requestedFocus
        : (focusTargets(element)[0] ?? element);
    initialFocus.focus({ preventScroll: true });

    const historyId = `${titleId}-${Date.now()}`;
    let active = true;
    let panelState: Record<string, unknown> | undefined;
    if (manageHistory) {
      void (async () => {
        // Defer registration so StrictMode cleanup cannot traverse a newly opened panel.
        await Promise.resolve();
        while (pendingHistoryBack) await pendingHistoryBack;
        if (!active) return;
        panelState = { ...window.history.state, lemonPanel: historyId };
        window.history.pushState(panelState, "", window.location.href);
        window.addEventListener("popstate", onPopState);
      })();
    }
    function onPopState() {
      if (window.history.state?.lemonPanel === historyId) return;
      if (callbacks.current.onBeforeClose?.() === false) {
        window.history.pushState(panelState, "", window.location.href);
        return;
      }
      callbacks.current.onClose("back");
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (callbacks.current.onBeforeClose?.() !== false) callbacks.current.onClose("escape");
      }
      if (event.key !== "Tab") return;
      const targets = focusTargets(element);
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (!first) {
        event.preventDefault();
        element.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || !element.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !element.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }
    element.addEventListener("keydown", onKeyDown);
    return () => {
      active = false;
      element.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("popstate", onPopState);
      if (--scrollLocks === 0) document.body.style.overflow = originalOverflow;
      background.forEach(unlockBackground);
      if (manageHistory && window.history.state?.lemonPanel === historyId) {
        removePanelHistoryEntry();
      }
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open, initialFocusRef, manageHistory, titleId]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="panel-backdrop"
      data-testid="panel-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose("backdrop");
      }}
    >
      <div
        className={`panel ${className}`.trim()}
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="panel__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="닫기"
            onClick={() => requestClose("button")}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="panel__content">{children}</div>
        {footer ? <footer className="panel__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { AppError } from "@/lib/errors";
import { listInbox, markNotificationRead } from "./notification-service";
import { demoListInbox, demoMarkInboxRead } from "./demo-inbox-store";
export interface InboxResolvedTarget {
  kind: "request" | "friend" | "occurrence" | "dailyEncouragement";
  id: string;
  encouragementId?: number | null;
}
export async function markResolvedInboxRead(
  id: number,
  target: InboxResolvedTarget,
  demo: boolean,
  isCurrent: () => boolean = () => true,
) {
  let cursor: number | undefined;
  for (;;) {
    const page = demo
      ? demoListInbox({ filter: "all", cursor })
      : await listInbox({ filter: "all", cursor });
    const item = page.items.find((row) => row.id === id);
    if (item) {
      const url = item.target ? new URL(item.target, "https://local.invalid") : null;
      const key =
        target.kind === "request"
          ? "request"
          : target.kind === "friend"
            ? "friend"
            : target.kind === "dailyEncouragement"
              ? "dailyEncouragement"
              : "occurrence";
      if (
        item.availability !== "available" ||
        url?.searchParams.get(key) !== target.id ||
        (target.encouragementId &&
          url.searchParams.get("encouragement") !== String(target.encouragementId))
      )
        throw new AppError("NOT_FOUND", "지금은 이 소식을 확인할 수 없어요");
      if (!isCurrent()) return;
      const success = demo ? demoMarkInboxRead(id) : await markNotificationRead(id);
      if (!success) throw new AppError("CONFLICT", "읽음 처리를 완료하지 못했어요");
      window.dispatchEvent(new Event("lemon:notifications-changed"));
      return;
    }
    if (page.nextCursor === null || page.items.at(-1)!.id < id)
      throw new AppError("NOT_FOUND", "소식을 찾지 못했어요");
    cursor = page.nextCursor;
  }
}
export function InboxReadReceipt({
  notificationId,
  target,
  resolved,
  onRead,
}: {
  notificationId: number | null;
  target: InboxResolvedTarget;
  resolved: boolean;
  onRead?: () => void;
}) {
  const { demo, user } = useAuth();
  const userId = user?.id;
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const attempt = useRef(0);
  const callback = useRef(onRead);
  useEffect(() => {
    callback.current = onRead;
  });
  const { kind, id, encouragementId } = target;
  const run = useCallback(async () => {
    if (!notificationId || !resolved || (!demo && !userId)) return;
    const version = ++attempt.current;
    setPending(true);
    setError(false);
    try {
      await markResolvedInboxRead(
        notificationId,
        { kind, id, encouragementId },
        demo,
        () => version === attempt.current,
      );
      if (version === attempt.current) callback.current?.();
    } catch {
      if (version === attempt.current) setError(true);
    } finally {
      if (version === attempt.current) setPending(false);
    }
  }, [notificationId, resolved, demo, userId, kind, id, encouragementId]);
  useEffect(() => {
    let active = true;
    const attempts = attempt;
    queueMicrotask(() => {
      if (active) void run();
    });
    return () => {
      active = false;
      attempts.current++;
    };
  }, [run]);
  if (!error || !resolved) return null;
  return (
    <div className="inline-alert" role="status">
      <span>내용은 열었지만 읽음 처리를 완료하지 못했어요</span>
      <Button variant="ghost" loading={pending} onClick={() => void run()}>
        읽음 처리 다시 시도
      </Button>
    </div>
  );
}

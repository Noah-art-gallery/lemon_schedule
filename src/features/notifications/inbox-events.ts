"use client";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/features/auth/auth-provider";
import { getInboxUnreadCount } from "./notification-service";
import { demoInboxItems, subscribeDemoInbox } from "./demo-inbox-store";
const directTypes = new Set([
  "encouragement_received",
  "connection_request",
  "connection_accepted",
]);
export function isDirectInboxEvent(type: unknown) {
  return typeof type === "string" && directTypes.has(type);
}
export function subscribeInbox(
  userId: string | undefined,
  demo: boolean,
  refresh: (invalidate?: boolean) => void,
) {
  const refreshContent = () => refresh(true);
  const refreshReads = () => refresh(false);
  window.addEventListener("focus", refreshContent);
  window.addEventListener("lemon:notifications-changed", refreshReads);
  const visible = () => {
    if (document.visibilityState === "visible") refresh();
  };
  document.addEventListener("visibilitychange", visible);
  const timer = window.setInterval(visible, 30000);
  let cleanup: () => void = () => {};
  if (demo) cleanup = subscribeDemoInbox(refreshContent);
  else if (userId) {
    const client = getSupabaseClient();
    const channel = client
      .channel(`inbox-${userId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { notification_type?: string };
          if (!row.notification_type || isDirectInboxEvent(row.notification_type)) refresh(false);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "connections" },
        refreshContent,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_encouragements" },
        refreshContent,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "encouragements" },
        refreshContent,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "connection_requests" },
        refreshContent,
      )
      .subscribe();
    cleanup = () => {
      void client.removeChannel(channel);
    };
  }
  return () => {
    window.removeEventListener("focus", refreshContent);
    window.removeEventListener("lemon:notifications-changed", refreshReads);
    document.removeEventListener("visibilitychange", visible);
    window.clearInterval(timer);
    cleanup();
  };
}
export function useInboxUnreadCount() {
  const { demo, user } = useAuth();
  const userId = user?.id;
  const account = demo ? "demo" : (userId ?? "");
  const [state, setState] = useState({ account: "", count: 0 });
  useEffect(() => {
    let active = true;
    let sequence = 0;
    const refresh = async () => {
      const current = ++sequence;
      if (!demo && !userId) return;
      try {
        const count = demo
          ? demoInboxItems().filter((item) => !item.readAt).length
          : (await getInboxUnreadCount()).unreadCount;
        if (active && current === sequence) setState({ account, count });
      } catch {
        if (active && current === sequence) setState({ account, count: 0 });
      }
    };
    void refresh();
    const stop = subscribeInbox(userId, demo, () => void refresh());
    return () => {
      active = false;
      stop();
    };
  }, [demo, userId, account]);
  return state.account === account ? state.count : 0;
}

"use client";

import { Bell, Check, Citrus, Smartphone, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatePanel } from "@/components/ui/state-panel";
import { useAuth } from "@/features/auth/auth-provider";
import { registerPushToken } from "@/features/push/push-service";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationTarget,
  type NotificationItem,
} from "./notification-service";

const demoNotifications: NotificationItem[] = [
  {
    id: 1,
    recipient_id: "demo",
    actor_id: "mom",
    notification_type: "task_completed",
    occurrence_id: 1,
    connection_request_id: null,
    encouragement_id: null,
    event_key: "demo-task",
    read_at: null,
    created_at: "2026-09-01T09:00:00+09:00",
    actorName: "엄마",
  },
  {
    id: 2,
    recipient_id: "demo",
    actor_id: "mom",
    notification_type: "encouragement_received",
    occurrence_id: null,
    connection_request_id: null,
    encouragement_id: 2,
    event_key: "demo-encouragement",
    read_at: null,
    created_at: "2026-09-01T08:40:00+09:00",
    actorName: "엄마",
  },
];

function notificationCopy(item: NotificationItem) {
  if (item.notification_type === "task_completed")
    return `${item.actorName}님이 할 일을 완료했어요.`;
  if (item.notification_type === "encouragement_received")
    return `${item.actorName}님이 레몬 응원을 보냈어요.`;
  if (item.notification_type === "connection_accepted")
    return `${item.actorName}님이 친구 연결을 수락했어요.`;
  return `${item.actorName}님이 친구 연결을 요청했어요.`;
}

export function NotificationScreen() {
  const router = useRouter();
  const { user, demo } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>(demo ? demoNotifications : []);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (demo || !user) return;
    try {
      const page = await listNotifications({ userId: user.id });
      setItems(page.items);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "알림을 불러오지 못했어요.");
    }
  }, [demo, user]);

  useEffect(() => {
    if (demo || !user) return;
    let active = true;
    void listNotifications({ userId: user.id })
      .then((result) => {
        if (active) {
          setItems(result.items);
          setNextCursor(result.nextCursor);
        }
      })
      .catch((cause: unknown) => {
        if (active) setNotice(cause instanceof Error ? cause.message : "알림을 불러오지 못했어요.");
      });
    return () => {
      active = false;
    };
  }, [demo, user]);

  async function loadMore() {
    if (demo || !user || nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listNotifications({ userId: user.id, cursor: nextCursor });
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !known.has(item.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "이전 알림을 불러오지 못했어요.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function markRead(id: number) {
    if (!demo) {
      try {
        await markNotificationRead(id);
      } catch (cause) {
        setNotice(cause instanceof Error ? cause.message : "알림을 읽음 처리하지 못했어요.");
        return;
      }
    }
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, read_at: new Date().toISOString() } : item,
      ),
    );
    if (!demo) window.dispatchEvent(new Event("lemon:notifications-changed"));
  }

  async function enablePush() {
    if (!user || demo) {
      setNotice("미리보기에서는 휴대폰 알림을 설정하지 않아요.");
      return;
    }
    try {
      const result = await registerPushToken(user.id);
      setNotice(
        result.active
          ? "이 기기에서 친구 완료 알림을 받을 수 있어요."
          : "앱에서 알림 권한을 허용하면 받을 수 있어요.",
      );
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "휴대폰 알림을 설정하지 못했어요.");
    }
  }

  async function readAll() {
    if (!demo && user) {
      try {
        await markAllNotificationsRead(user.id);
      } catch (cause) {
        setNotice(cause instanceof Error ? cause.message : "알림을 읽음 처리하지 못했어요.");
        return;
      }
    }
    setItems((current) =>
      current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })),
    );
    if (!demo) window.dispatchEvent(new Event("lemon:notifications-changed"));
  }

  async function open(item: NotificationItem) {
    if (!item.read_at) await markRead(item.id);
    router.push(notificationTarget(item));
  }

  return (
    <AppShell notificationCount={demo ? items.filter((item) => !item.read_at).length : undefined}>
      <PageHeading
        eyebrow="NEWS"
        title="알림"
        description="친구의 완료와 받은 응원을 모아봐요."
        action={
          <Button size="sm" variant="secondary" onClick={() => void enablePush()}>
            <Smartphone size={16} aria-hidden="true" /> 휴대폰 알림 켜기
          </Button>
        }
      />
      {notice ? (
        <p className="inline-alert" role="status">
          {notice}
        </p>
      ) : null}
      {items.some((item) => !item.read_at) ? (
        <div className="notification-toolbar">
          <Button size="sm" variant="ghost" onClick={() => void readAll()}>
            모두 읽음
          </Button>
        </div>
      ) : null}
      {items.length === 0 ? (
        <StatePanel
          kind="empty"
          title="아직 새 알림이 없어요"
          description="친구가 할 일을 완료하거나 응원을 보내면 여기에 나타나요."
          action={
            <Button variant="secondary" onClick={() => void load()}>
              새로 확인하기
            </Button>
          }
        />
      ) : (
        <section className="notification-list" aria-label="알림 목록">
          {items.map((item) => (
            <Card key={item.id} className={`notification-card ${item.read_at ? "is-read" : ""}`}>
              <div className="notification-card__icon">
                {item.notification_type === "encouragement_received" ? (
                  <Citrus size={18} />
                ) : item.notification_type === "task_completed" ? (
                  <Check size={18} />
                ) : (
                  <Bell size={18} />
                )}
              </div>
              <button
                className="notification-card__body"
                type="button"
                onClick={() => void open(item)}
              >
                <strong>{notificationCopy(item)}</strong>
                <span>
                  {new Date(item.created_at).toLocaleString("ko-KR", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: demo ? "Asia/Seoul" : undefined,
                  })}
                </span>
              </button>
              {!item.read_at ? (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="읽음 처리"
                  onClick={() => void markRead(item.id)}
                >
                  <Sparkles size={15} />
                </Button>
              ) : (
                <span className="notification-read">
                  <Check size={14} /> 읽음
                </span>
              )}
            </Card>
          ))}
          {nextCursor !== null ? (
            <Button variant="secondary" loading={loadingMore} onClick={() => void loadMore()}>
              이전 알림 더 보기
            </Button>
          ) : null}
        </section>
      )}
    </AppShell>
  );
}

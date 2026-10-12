"use client";
import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { useAuth } from "@/features/auth/auth-provider";
import { InboxReadReceipt } from "@/features/notifications/inbox-read-receipt";
import { subscribeInbox } from "@/features/notifications/inbox-events";
import { getDailyEncouragement, type DailyEncouragement } from "./daily-encouragement-service";
import { demoGetDailyEncouragement } from "./demo-daily-encouragement-store";
import { DailyEncouragementContent } from "./daily-friend-card";
import styles from "./daily-encouragement.module.css";
export function DailyEncouragementPanel({
  id,
  notificationId = null,
  onClose,
}: {
  id: number;
  notificationId?: number | null;
  onClose: () => void;
}) {
  const { demo, user } = useAuth();
  const [item, setItem] = useState<DailyEncouragement | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    let generation = 0;
    async function load() {
      const version = ++generation;
      setItem(null);
      setLoading(true);
      setError("");
      try {
        const next = demo ? demoGetDailyEncouragement(id) : await getDailyEncouragement(id);
        if (active && version === generation) setItem(next);
      } catch (cause) {
        if (active && version === generation)
          setError(cause instanceof Error ? cause.message : "응원을 불러오지 못했어요");
      } finally {
        if (active && version === generation) setLoading(false);
      }
    }
    queueMicrotask(() => {
      if (active) void load();
    });
    const stop = subscribeInbox(user?.id, demo, (invalidate) => {
      if (invalidate !== false) void load();
    });
    return () => {
      active = false;
      generation++;
      stop();
    };
  }, [id, demo, user?.id, reload]);
  return (
    <Panel open title="받은 하루 응원" onClose={onClose}>
      {loading ? <p role="status">응원을 불러오는 중</p> : null}
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <Button variant="secondary" onClick={() => setReload((value) => value + 1)}>
            다시 시도
          </Button>
        </div>
      ) : null}
      {item ? (
        <section aria-label="받은 하루 응원 내용">
          <div className={styles.header}>
            <ProfileAvatar avatarKey={item.authorAvatarKey} size={40} />
            <strong>{item.authorName}</strong>
          </div>
          <p className={styles.date}>{item.day.replaceAll("-", ".")}의 나에게</p>
          <div className={styles.received}>
            <DailyEncouragementContent item={item} />
          </div>
          <InboxReadReceipt
            notificationId={notificationId}
            target={{ kind: "dailyEncouragement", id: String(item.id) }}
            resolved={item.id === id}
          />
        </section>
      ) : null}
    </Panel>
  );
}

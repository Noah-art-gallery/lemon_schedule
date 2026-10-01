import { describe, expect, it } from "vitest";

import type { NotificationRow } from "@/lib/supabase/database.types";
import { notificationTarget, splitNotificationPage } from "./notification-service";

describe("알림 대상 화면", () => {
  it("친구의 완료를 해당 친구 발생 건으로 연결한다", () => {
    expect(
      notificationTarget({
        notification_type: "task_completed",
        actor_id: "friend-id",
        occurrence_id: 42,
      }),
    ).toBe("/friends/?friend=friend-id&occurrence=42");
  });

  it("받은 응원을 내 완료 기록으로 연결한다", () => {
    expect(
      notificationTarget({
        notification_type: "encouragement_received",
        actor_id: "friend-id",
        occurrence_id: 7,
      }),
    ).toBe("/?occurrence=7");
  });

  it("연결 요청을 친구 화면으로 연결한다", () => {
    expect(
      notificationTarget({
        notification_type: "connection_request",
        actor_id: null,
        occurrence_id: null,
      }),
    ).toBe("/friends/");
  });
});

describe("알림 페이지 경계", () => {
  it("51번째 항목이 있으면 50개와 다음 커서를 반환한다", () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({ id: 51 - index }) as NotificationRow);
    const page = splitNotificationPage(rows);
    expect(page.rows).toHaveLength(50);
    expect(page.nextCursor).toBe(2);
  });

  it("마지막 페이지에는 다음 커서가 없다", () => {
    const page = splitNotificationPage([{ id: 1 } as NotificationRow]);
    expect(page.nextCursor).toBeNull();
  });
});

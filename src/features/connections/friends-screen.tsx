"use client";

import { Check, Link2, UserPlus, UserRoundX, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { StatePanel } from "@/components/ui/state-panel";
import { useAuth } from "@/features/auth/auth-provider";
import {
  blockFriend,
  cancelConnectionRequest,
  disconnectFriend,
  getConnectionData,
  getFriendOverview,
  respondToConnectionRequest,
  sendConnectionRequest,
  type ConnectionData,
} from "./connection-service";
import type { TaskOccurrenceRow } from "@/lib/supabase/database.types";
import {
  deleteEncouragement,
  listEncouragements,
  sendEncouragement,
  type EncouragementDisplay,
  type Reaction,
} from "@/features/encouragements/encouragement-service";
import { friendWindow, groupFriendOccurrences } from "./friend-overview";
import { listOccurrences } from "@/features/tasks/task-service";

const demoData: ConnectionData = {
  incoming: [],
  outgoing: [],
  friends: [
    { id: "mom", displayName: "엄마" },
    { id: "study-buddy", displayName: "공부 친구" },
  ],
};

function demoFriendOccurrence(
  id: number,
  date: string,
  completed: boolean,
  ownerId: string,
  title: string,
): TaskOccurrenceRow {
  const timestamp = new Date().toISOString();
  return {
    id,
    task_id: id,
    owner_id: ownerId,
    occurrence_date: date,
    title_snapshot: title,
    due_time: null,
    recurrence_snapshot: "none",
    status: completed ? "completed" : "pending",
    completed_at: completed ? timestamp : null,
    first_completed_at: completed ? timestamp : null,
    reopened_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export function FriendsScreen() {
  const searchParams = useSearchParams();
  const { user, demo } = useAuth();
  const [data, setData] = useState<ConnectionData>(
    demo ? demoData : { incoming: [], outgoing: [], friends: [] },
  );
  const [inviteCodeDraft, setInviteCode] = useState<string | null>(null);
  const inviteCode = inviteCodeDraft ?? searchParams.get("invite")?.trim().toUpperCase() ?? "";
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [overview, setOverview] = useState<{
    friendId: string;
    occurrences: TaskOccurrenceRow[];
    today: string;
    todaySummary: {
      completedCount: number;
      scheduledCount: number;
      percent: number | null;
      empty: boolean;
    };
  } | null>(null);
  const [highlightOccurrenceId, setHighlightOccurrenceId] = useState<number | null>(null);
  const [encouragementTarget, setEncouragementTarget] = useState<number | null>(null);
  const [encouragements, setEncouragements] = useState<EncouragementDisplay[]>([]);
  const [reaction, setReaction] = useState<Reaction | "">("lemon");
  const [encouragementMessage, setEncouragementMessage] = useState("");
  const [sendingEncouragement, setSendingEncouragement] = useState(false);
  const [rangePages, setRangePages] = useState({ past: 0, future: 0 });
  const [loadingMore, setLoadingMore] = useState(false);
  const overviewRequest = useRef(0);
  const encouragementRequest = useRef(0);
  const connectionRequest = useRef(0);
  const deepLinkHandled = useRef("");

  const closeFriend = useCallback(() => {
    overviewRequest.current += 1;
    encouragementRequest.current += 1;
    setSelected(null);
    setOverview(null);
    setHighlightOccurrenceId(null);
    setEncouragementTarget(null);
    setEncouragements([]);
    setRangePages({ past: 0, future: 0 });
  }, []);

  const load = useCallback(async () => {
    if (demo || !user) return;
    const request = ++connectionRequest.current;
    try {
      const result = await getConnectionData(user.id);
      if (request !== connectionRequest.current) return;
      setData(result);
      if (selected && !result.friends.some((item) => item.id === selected)) closeFriend();
    } catch (cause) {
      if (request !== connectionRequest.current) return;
      setData({ incoming: [], outgoing: [], friends: [] });
      closeFriend();
      setNotice(cause instanceof Error ? cause.message : "친구 연결을 불러오지 못했어요.");
    }
  }, [closeFriend, demo, selected, user]);
  useEffect(() => {
    if (demo || !user) return;
    const refresh = () => void load();
    const initial = window.setTimeout(refresh, 0);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const interval = window.setInterval(refresh, 15000);
    return () => {
      connectionRequest.current += 1;
      window.clearTimeout(initial);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(interval);
    };
  }, [demo, load, user]);

  useEffect(() => {
    if (demo) return;
    const friendId = searchParams.get("friend");
    const targetId = Number(searchParams.get("occurrence"));
    if (!friendId || !data.friends.some((item) => item.id === friendId)) return;
    const deepLinkKey = `${friendId}:${targetId}`;
    if (deepLinkHandled.current === deepLinkKey) return;
    deepLinkHandled.current = deepLinkKey;
    const request = ++overviewRequest.current;
    encouragementRequest.current += 1;
    setSelected(friendId);
    setOverview(null);
    setEncouragementTarget(null);
    let active = true;
    void getFriendOverview(
      friendId,
      Number.isSafeInteger(targetId) && targetId > 0 ? targetId : undefined,
    )
      .then((result) => {
        if (active && request === overviewRequest.current) {
          setOverview({ ...result, friendId });
          setHighlightOccurrenceId(
            Number.isSafeInteger(targetId) && targetId > 0 ? targetId : null,
          );
          setRangePages({ past: 0, future: 0 });
        }
      })
      .catch((cause: unknown) => {
        if (active && request === overviewRequest.current) {
          closeFriend();
          setNotice(cause instanceof Error ? cause.message : "친구 할 일을 불러오지 못했어요.");
        }
      });
    return () => {
      active = false;
    };
  }, [closeFriend, data.friends, demo, searchParams]);

  useEffect(() => {
    if (!highlightOccurrenceId || !overview) return;
    document
      .getElementById(`friend-task-${highlightOccurrenceId}`)
      ?.scrollIntoView({ block: "center" });
  }, [highlightOccurrenceId, overview]);

  async function send() {
    if (!inviteCode.trim()) return;
    try {
      if (!demo) await sendConnectionRequest(inviteCode.trim());
      setNotice("연결 요청을 보냈어요. 상대가 수락하면 서로의 할 일을 볼 수 있어요.");
      setInviteCode("");
      await load();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "연결 요청을 보내지 못했어요.");
    }
  }

  async function respond(requestId: number, accept: boolean) {
    try {
      if (!demo) await respondToConnectionRequest(requestId, accept);
      setNotice(accept ? "친구 연결을 수락했어요." : "연결 요청을 거절했어요.");
      await load();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "요청을 처리하지 못했어요.");
    }
  }

  async function openFriend(friendId: string) {
    const request = ++overviewRequest.current;
    encouragementRequest.current += 1;
    setSelected(friendId);
    setOverview(null);
    setHighlightOccurrenceId(null);
    setEncouragementTarget(null);
    setEncouragements([]);
    setRangePages({ past: 0, future: 0 });
    if (demo) {
      const today = new Date().toISOString().slice(0, 10);
      const mom = friendId === "mom";
      setOverview({
        friendId,
        occurrences: [
          demoFriendOccurrence(
            mom ? 801 : 803,
            today,
            true,
            friendId,
            mom ? "아침 산책" : "함께 공부하기",
          ),
          demoFriendOccurrence(
            mom ? 802 : 804,
            today,
            false,
            friendId,
            mom ? "책 읽기" : "물 마시기",
          ),
        ],
        today,
        todaySummary: { completedCount: 1, scheduledCount: 2, percent: 50, empty: false },
      });
      return;
    }
    if (!user) return;
    try {
      const result = await getFriendOverview(friendId);
      if (request === overviewRequest.current) setOverview({ ...result, friendId });
    } catch (cause) {
      if (request === overviewRequest.current) {
        closeFriend();
        setNotice(cause instanceof Error ? cause.message : "친구 할 일을 불러오지 못했어요.");
      }
    }
  }

  async function removeFriend(friendId: string) {
    if (!window.confirm("연결을 해제할까요? 과거 기록은 친구에게 보이지 않게 돼요.")) return;
    if (!demo) await disconnectFriend(friendId);
    closeFriend();
    await load();
  }

  async function block(friendId: string) {
    if (!demo) await blockFriend(friendId);
    closeFriend();
    setNotice("차단했어요. 연결과 대기 요청이 모두 종료돼요.");
    await load();
  }

  async function encourage(occurrenceId: number) {
    const overview = overviewRequest.current;
    const request = ++encouragementRequest.current;
    setEncouragementTarget(occurrenceId);
    setEncouragements([]);
    if (demo) {
      setEncouragements([]);
      return;
    }
    try {
      const records = await listEncouragements(occurrenceId);
      if (overview !== overviewRequest.current || request !== encouragementRequest.current) return;
      setEncouragements(records);
      const mine = records.find((item) => item.author_id === user?.id);
      setReaction((mine?.reaction as Reaction | null) ?? (mine ? "" : "lemon"));
      setEncouragementMessage(mine?.message ?? "");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "응원을 불러오지 못했어요.");
    }
  }

  async function saveEncouragement() {
    if (!encouragementTarget) return;
    const overview = overviewRequest.current;
    const request = encouragementRequest.current;
    if (demo) {
      setNotice("미리보기에서는 응원이 저장되지 않아요.");
      return;
    }
    setSendingEncouragement(true);
    try {
      await sendEncouragement(encouragementTarget, reaction || null, encouragementMessage);
      const records = await listEncouragements(encouragementTarget);
      if (overview !== overviewRequest.current || request !== encouragementRequest.current) return;
      setEncouragements(records);
      setNotice("응원을 보냈어요!");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "응원을 보내지 못했어요.");
    } finally {
      setSendingEncouragement(false);
    }
  }

  async function removeMyEncouragement(encouragementId: number) {
    if (demo || !encouragementTarget) return;
    const overview = overviewRequest.current;
    const request = encouragementRequest.current;
    try {
      await deleteEncouragement(encouragementId);
      const records = await listEncouragements(encouragementTarget);
      if (overview !== overviewRequest.current || request !== encouragementRequest.current) return;
      setEncouragements(records);
      setReaction("lemon");
      setEncouragementMessage("");
      setNotice("내 응원을 삭제했어요.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "응원을 삭제하지 못했어요.");
    }
  }

  async function loadMore(direction: "past" | "future") {
    if (!selected || !overview || loadingMore) return;
    const request = overviewRequest.current;
    if (demo) {
      setNotice("미리보기에서는 추가 기록이 없어요.");
      return;
    }
    const page = rangePages[direction] + 1;
    const { from, to } = friendWindow(overview.today, direction, page);
    setLoadingMore(true);
    try {
      const extra = await listOccurrences({ ownerId: selected, from, to });
      if (request !== overviewRequest.current) return;
      setOverview((current) => {
        if (!current) return current;
        const known = new Set(current.occurrences.map((item) => item.id));
        return {
          ...current,
          occurrences: [
            ...current.occurrences,
            ...extra.occurrences.filter((item) => !known.has(item.id)),
          ],
        };
      });
      setRangePages((current) => ({ ...current, [direction]: page }));
      if (!extra.occurrences.length) setNotice("이 기간에는 추가 할 일이 없어요.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "추가 할 일을 불러오지 못했어요.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <AppShell>
      <PageHeading
        eyebrow="TOGETHER"
        title="친구와 같이 해볼까요?"
        description="서로 연결되면 할 일을 확인하고 완료한 순간에 응원을 보낼 수 있어요."
      />
      {notice ? (
        <p className="inline-alert" role="status">
          {notice}
        </p>
      ) : null}
      <Card as="section" className="invite-form-card">
        <div>
          <p className="eyebrow">CONNECT</p>
          <h2>초대 코드로 연결하기</h2>
          <p>내 정보에서 코드를 복사해 공유할 수도 있어요.</p>
        </div>
        <div className="invite-form">
          <Field
            name="inviteCode"
            label="친구 초대 코드"
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
            placeholder="LEMON0001"
          />
          <Button onClick={() => void send()}>
            <UserPlus size={17} aria-hidden="true" /> 요청 보내기
          </Button>
        </div>
      </Card>

      {data.incoming.length > 0 ? (
        <section className="connection-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">REQUESTS</p>
              <h2>받은 요청</h2>
            </div>
          </div>
          <div className="connection-list">
            {data.incoming.map((request) => (
              <Card as="article" className="connection-card" key={request.id}>
                <div className="profile-avatar">{request.displayName.slice(0, 1)}</div>
                <div>
                  <h3>{request.displayName}</h3>
                  <p>내 할 일을 함께 보고 싶어 해요.</p>
                </div>
                <div className="button-row">
                  <Button size="sm" onClick={() => void respond(request.id, true)}>
                    <Check size={15} aria-hidden="true" /> 수락
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void respond(request.id, false)}>
                    <X size={15} aria-hidden="true" /> 거절
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {data.outgoing.length > 0 ? (
        <section className="connection-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">PENDING</p>
              <h2>보낸 요청</h2>
            </div>
          </div>
          <div className="connection-list">
            {data.outgoing.map((request) => (
              <Card as="article" className="connection-card" key={request.id}>
                <div className="profile-avatar">{request.displayName.slice(0, 1)}</div>
                <div>
                  <h3>{request.displayName}</h3>
                  <p>수락을 기다리는 중이에요.</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!demo) await cancelConnectionRequest(request.id);
                    await load();
                  }}
                >
                  취소
                </Button>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {data.friends.length === 0 ? (
        <StatePanel
          kind="empty"
          title="아직 연결된 친구가 없어요"
          description="초대 코드를 입력하거나 내 초대 링크를 공유해 첫 친구를 만나보세요."
          action={
            <Button
              onClick={() =>
                document.querySelector<HTMLInputElement>('input[name="inviteCode"]')?.focus()
              }
            >
              <Link2 size={18} aria-hidden="true" /> 친구 초대하기
            </Button>
          }
        />
      ) : (
        <section className="connection-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">FRIENDS</p>
              <h2>함께하는 사람</h2>
            </div>
            <span className="task-count">{data.friends.length}명</span>
          </div>
          <div className="connection-list">
            {data.friends.map((friend) => (
              <Card
                as="article"
                className="connection-card connection-card--friend"
                key={friend.id}
              >
                <button
                  className="connection-card__main"
                  type="button"
                  onClick={() => void openFriend(friend.id)}
                >
                  <div className="profile-avatar">{friend.displayName.slice(0, 1)}</div>
                  <div>
                    <h3>{friend.displayName}</h3>
                    <p>오늘 완료율을 확인해 보세요.</p>
                  </div>
                </button>
                {selected === friend.id && overview?.friendId === friend.id ? (
                  <div className="friend-overview">
                    <strong>
                      {overview.todaySummary.percent === null
                        ? "오늘 할 일 없음"
                        : `오늘 ${overview.todaySummary.percent}% 완료`}
                    </strong>
                    {overview.occurrences.length ? (
                      <FriendOccurrenceSections
                        overview={overview}
                        onEncourage={encourage}
                        highlightId={highlightOccurrenceId}
                      />
                    ) : (
                      <p>아직 공유된 할 일이 없어요.</p>
                    )}
                    <div className="button-row friend-overview__paging">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={loadingMore}
                        onClick={() => void loadMore("past")}
                      >
                        더 지난 기록
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={loadingMore}
                        onClick={() => void loadMore("future")}
                      >
                        더 먼 예정
                      </Button>
                    </div>
                    {encouragementTarget &&
                    overview.occurrences.some((item) => item.id === encouragementTarget) ? (
                      <section className="friend-encouragement" aria-label="완료 항목 응원">
                        <h4>이 완료에 보낸 응원</h4>
                        {encouragements.length ? (
                          <ul className="friend-encouragement__list">
                            {encouragements.map((item) => (
                              <li key={item.id}>
                                <span>
                                  <strong>{item.authorName}</strong>{" "}
                                  {item.reaction ? reactionLabel(item.reaction) : null}{" "}
                                  {item.message}
                                  {item.visibility === "hidden_by_owner"
                                    ? " · 소유자가 숨김"
                                    : null}
                                </span>
                                {item.author_id === user?.id ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => void removeMyEncouragement(item.id)}
                                  >
                                    삭제
                                  </Button>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>아직 응원이 없어요.</p>
                        )}
                        <div className="friend-encouragement__form">
                          <label className="field">
                            <span className="field__label">반응</span>
                            <select
                              className="field__input"
                              value={reaction}
                              onChange={(event) => setReaction(event.target.value as Reaction | "")}
                            >
                              <option value="lemon">🍋 레몬</option>
                              <option value="clap">👏 박수</option>
                              <option value="heart">❤️ 하트</option>
                              <option value="cheer">🎉 축하</option>
                              <option value="">반응 없이 글만</option>
                            </select>
                          </label>
                          <Field
                            label="응원글 (선택, 120자 이하)"
                            name="encouragementMessage"
                            maxLength={120}
                            value={encouragementMessage}
                            onChange={(event) => setEncouragementMessage(event.target.value)}
                            placeholder="잘했어!"
                          />
                          <Button
                            size="sm"
                            onClick={() => void saveEncouragement()}
                            disabled={sendingEncouragement}
                          >
                            {encouragements.some((item) => item.author_id === user?.id)
                              ? "내 응원 수정"
                              : "응원 보내기"}
                          </Button>
                        </div>
                      </section>
                    ) : null}
                    <div className="button-row">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void removeFriend(friend.id)}
                      >
                        <UserRoundX size={15} /> 연결 해제
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void block(friend.id)}>
                        <X size={15} /> 차단
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}

function FriendOccurrenceSections({
  overview,
  onEncourage,
  highlightId,
}: {
  overview: { occurrences: TaskOccurrenceRow[]; today: string };
  onEncourage: (occurrenceId: number) => Promise<void>;
  highlightId: number | null;
}) {
  const groups = groupFriendOccurrences(overview.occurrences, overview.today);
  return (
    <div className="friend-overview__groups">
      {(
        [
          ["오늘", groups.todayItems],
          ["밀린 할 일", groups.overdue],
          ["예정된 할 일", groups.upcoming],
          ["완료 기록", groups.completedPast],
        ] as const
      ).map(([label, items]) =>
        items.length ? (
          <section key={label} className="friend-overview__group">
            <h4>
              {label} · {items.length}
            </h4>
            <ul>
              {items.map((item) => (
                <li
                  id={`friend-task-${item.id}`}
                  key={item.id}
                  className={`${item.status === "completed" ? "is-complete" : ""} ${item.id === highlightId ? "is-highlighted" : ""}`.trim()}
                >
                  {item.status === "completed" ? (
                    <Check size={15} aria-hidden="true" />
                  ) : (
                    <span className="task-dot" />
                  )}
                  <span>
                    {item.title_snapshot} <small>{item.occurrence_date}</small>
                  </span>
                  {item.status === "completed" ? (
                    <Button size="sm" variant="ghost" onClick={() => void onEncourage(item.id)}>
                      응원 보기
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}

function reactionLabel(reaction: string): string {
  return { lemon: "🍋", clap: "👏", heart: "❤️", cheer: "🎉" }[reaction] ?? "";
}

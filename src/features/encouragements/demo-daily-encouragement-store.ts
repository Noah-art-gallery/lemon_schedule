import { AppError } from "@/lib/errors";
import { toDateKey } from "@/lib/time";
import {
  demoGetConnections,
  demoGetProfile,
  demoListFriend,
  demoListOwn,
  demoAvatarKey,
  DEMO_OWNER_ID,
} from "@/features/tasks/demo-task-store";
import type {
  DailyEncouragement,
  DailyEncouragementInput,
  EncouragementDay,
} from "./daily-encouragement-service";
const records = new Map<number, DailyEncouragement>();
const deleted = new Set<number>();
let nextId = 2;
function friend(id: string) {
  return demoGetConnections().friends.find((item) => item.id === id);
}
function seed() {
  if (records.size) return;
  records.set(1, {
    id: 1,
    ownerId: DEMO_OWNER_ID,
    authorId: "demo-friend-1",
    day: toDateKey(new Date(), demoGetProfile().timeZone),
    reaction: "cheer",
    message: "오늘도 네 속도로 해보자",
    authorName: "지민",
    authorAvatarKey: "cat",
    quote: null,
    createdAt: new Date().toISOString(),
  });
}
export function demoGetDailyEncouragement(id: number): DailyEncouragement {
  seed();
  const item = records.get(id);
  if (!item || deleted.has(id)) throw new AppError("NOT_FOUND", "응원을 찾지 못했어요");
  if (item.ownerId !== DEMO_OWNER_ID && (item.authorId !== DEMO_OWNER_ID || !friend(item.ownerId)))
    throw new AppError("FORBIDDEN", "현재 이 응원을 볼 수 없어요");
  const known = item.authorId === DEMO_OWNER_ID || friend(item.authorId);
  const rows = item.ownerId === DEMO_OWNER_ID ? demoListOwn() : demoListFriend(item.ownerId);
  const quote = rows.find((row) => row.id === item.quote?.id);
  return {
    ...item,
    authorName: known ? item.authorName : "친구",
    authorAvatarKey: demoAvatarKey(item.authorId),
    quote: quote ? { id: quote.id, title: quote.title_snapshot } : null,
  };
}
export function demoGetEncouragementDay(ownerId: string): EncouragementDay {
  seed();
  const owner = friend(ownerId);
  if (!owner) throw new AppError("FORBIDDEN", "연결이 해제되어 오늘을 볼 수 없어요");
  const day = toDateKey(new Date(), "Asia/Seoul");
  const row = [...records.values()].find(
    (item) =>
      item.ownerId === ownerId &&
      item.authorId === DEMO_OWNER_ID &&
      item.day === day &&
      !deleted.has(item.id),
  );
  return {
    day,
    owner,
    occurrences: demoListFriend(ownerId).filter((item) => item.occurrence_date === day),
    mine: row ? demoGetDailyEncouragement(row.id) : null,
  };
}
export function demoSaveDailyEncouragement(input: DailyEncouragementInput): DailyEncouragement {
  const context = demoGetEncouragementDay(input.ownerId);
  if (context.day !== input.day)
    throw new AppError("CONFLICT", "친구의 날짜가 바뀌었어요. 오늘을 다시 불러와 주세요");
  if (
    !["lemon", "clap", "heart", "cheer"].includes(input.reaction) ||
    input.message.trim().length > 120
  )
    throw new AppError("INVALID_INPUT", "스티커와 응원글을 확인해 주세요");
  const quote = context.occurrences.find((item) => item.id === input.quotedOccurrenceId);
  if (input.quotedOccurrenceId && !quote)
    throw new AppError("INVALID_INPUT", "인용한 할 일을 다시 확인해 주세요");
  const old = [...records.values()].find(
    (item) =>
      item.ownerId === input.ownerId && item.authorId === DEMO_OWNER_ID && item.day === input.day,
  );
  const row: DailyEncouragement = {
    id: old?.id ?? nextId++,
    ownerId: input.ownerId,
    authorId: DEMO_OWNER_ID,
    day: input.day,
    reaction: input.reaction,
    message: input.message.trim() || null,
    quote: quote ? { id: quote.id, title: quote.title_snapshot } : null,
    authorName: demoGetProfile().displayName,
    authorAvatarKey: demoGetProfile().avatarKey,
    createdAt: old?.createdAt ?? new Date().toISOString(),
  };
  records.set(row.id, row);
  deleted.delete(row.id);
  return { ...row };
}
export function demoDeleteDailyEncouragement(id: number) {
  const row = records.get(id);
  if (!row) throw new AppError("NOT_FOUND", "응원을 찾지 못했어요");
  if (row.authorId !== DEMO_OWNER_ID)
    throw new AppError("FORBIDDEN", "직접 보낸 응원만 취소할 수 있어요");
  deleted.add(id);
}

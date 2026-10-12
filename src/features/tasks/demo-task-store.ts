import type { TaskOccurrenceRow, TaskRow } from "@/lib/supabase/database.types";
import type { EncouragementDisplay } from "@/features/encouragements/encouragement-service";
import type {
  EncouragementSummary,
  OccurrenceDetail,
  OwnHistoryItem,
  Reaction,
  ProfileAvatarKey,
  SocialActivityItem,
} from "@/types/contracts";
import { AppError } from "@/lib/errors";
import type { PetDetails, PetDecorations } from "@/features/pet/pet-service";
import type { ProfileDetails } from "@/features/profile/profile-service";
import { profileInputSchema } from "@/features/profile/profile-service";
import { toDateKey } from "@/lib/time";
import { addUtcDays } from "./recurrence";
import type { TaskInput } from "./task-service";

import type { ConnectionData, FriendSummary } from "@/features/connections/connection-service";

export const DEMO_OWNER_ID = "demo";
export const demoFriends: FriendSummary[] = [
  { id: "demo-friend-1", displayName: "지민", avatarKey: "cat" },
  { id: "demo-friend-2", displayName: "서연", avatarKey: "rabbit" },
];
const connectedIds = new Set(demoFriends.map((friend) => friend.id));
let requests: ConnectionData["incoming"] = [
  {
    id: 41,
    requester_id: "demo-requester-1",
    addressee_id: DEMO_OWNER_ID,
    displayName: "민서",
    avatarKey: "dog",
    status: "pending",
    created_at: new Date().toISOString(),
    responded_at: null,
    pair_low: DEMO_OWNER_ID,
    pair_high: "demo-requester",
    updated_at: new Date().toISOString(),
  },
  {
    id: 42,
    requester_id: DEMO_OWNER_ID,
    addressee_id: "demo-requester-2",
    displayName: "준호",
    avatarKey: "bear",
    status: "pending",
    created_at: new Date().toISOString(),
    responded_at: null,
    pair_low: DEMO_OWNER_ID,
    pair_high: "demo-requester",
    updated_at: new Date().toISOString(),
  },
];
export function demoGetConnections(): ConnectionData {
  return {
    friends: demoFriends
      .filter((friend) => connectedIds.has(friend.id))
      .map((friend) => ({ ...friend })),
    incoming: requests
      .filter((request) => request.addressee_id === DEMO_OWNER_ID)
      .map((request) => ({ ...request })),
    outgoing: requests
      .filter((request) => request.requester_id === DEMO_OWNER_ID)
      .map((request) => ({ ...request })),
  };
}
export function demoDisconnectFriend(friendId: string) {
  connectedIds.delete(friendId);
  requests = requests.filter(
    (request) => request.requester_id !== friendId && request.addressee_id !== friendId,
  );
  emit();
}
export function demoRespondRequest(id: number, accept: boolean) {
  const request = requests.find((item) => item.id === id && item.addressee_id === DEMO_OWNER_ID);
  if (!request) throw new AppError("NOT_FOUND", "연결 요청을 찾지 못했어요");
  if (accept) {
    connectedIds.add(request.requester_id);
    if (!demoFriends.some((friend) => friend.id === request.requester_id))
      demoFriends.push({
        id: request.requester_id,
        displayName: request.displayName,
        avatarKey: request.avatarKey,
      });
  }
  requests = requests.filter((item) => item.id !== id);
  emit();
}
export function demoCancelRequest(id: number) {
  requests = requests.filter((item) => item.id !== id);
  emit();
}
export function demoRequestConnection(code: string) {
  if (!code.trim() || code === "LEMON0001")
    throw new AppError("INVALID_INPUT", "상대의 초대 코드를 확인해 주세요");
  const id = `demo-invite-${code.trim().toUpperCase()}`;
  if (requests.some((request) => request.addressee_id === id))
    throw new AppError("CONFLICT", "이미 보낸 요청이 있어요");
  requests.push({
    id: nextId++,
    requester_id: DEMO_OWNER_ID,
    addressee_id: id,
    displayName: code.trim().toUpperCase(),
    avatarKey: "lemon",
    status: "pending",
    created_at: new Date().toISOString(),
    responded_at: null,
    pair_low: DEMO_OWNER_ID,
    pair_high: "demo-requester",
    updated_at: new Date().toISOString(),
  });
  emit();
}
let profile: { displayName: string; timeZone: string; avatarKey: ProfileAvatarKey } = {
  displayName: "하윤",
  timeZone: "Asia/Seoul",
  avatarKey: "lemon",
};
export function demoAvatarKey(userId: string | null): ProfileAvatarKey {
  if (userId === DEMO_OWNER_ID) return profile.avatarKey;
  return (
    demoFriends.find((friend) => friend.id === userId && connectedIds.has(userId))?.avatarKey ??
    requests.find((request) => request.requester_id === userId || request.addressee_id === userId)
      ?.avatarKey ??
    "lemon"
  );
}
let petImage: string | null = null;
let decorations: PetDecorations = {
  selectedColor: "leaf-green",
  selectedAccessory: null,
  selectedBackground: null,
};
export const demoToday = () => toDateKey(new Date(), profile.timeZone);
const today = demoToday;
export function demoGetProfile(): ProfileDetails {
  const points = demoListHistory().length;
  return {
    ...profile,
    inviteCode: "LEMON0001",
    lemonPoints: points,
    petLevel: Math.floor(points / 5) + 1,
  };
}
export function demoUpdateProfile(input: {
  displayName?: string;
  timeZone?: string;
  avatarKey?: ProfileAvatarKey;
}) {
  const parsed = profileInputSchema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", "닉네임과 시간대를 확인해 주세요");
  profile = { ...profile, ...parsed.data };
  emit();
  return { ...profile };
}
export function demoGetPet(): PetDetails {
  const { lemonPoints, petLevel } = demoGetProfile();
  const unlockedItems = [
    [5, "lemon-yellow"],
    [15, "leaf-hat"],
    [30, "sunny-garden"],
  ]
    .filter(([points]) => lemonPoints >= Number(points))
    .map(([, key]) => String(key));
  return {
    drawingPath: null,
    lemonPoints,
    petLevel,
    unlockedItems,
    unlockCount: unlockedItems.length,
    decorations: { ...decorations },
  };
}
export function demoGetPetImage() {
  return petImage;
}
export function demoSavePetDrawing(url: string) {
  if (petImage?.startsWith("blob:")) URL.revokeObjectURL(petImage);
  petImage = url;
  emit();
}
export function demoSaveDecorations(next: PetDecorations) {
  const unlocked = demoGetPet().unlockedItems;
  if (
    [
      next.selectedColor === "leaf-green" ? null : next.selectedColor,
      next.selectedAccessory,
      next.selectedBackground,
    ].some((item) => item && !unlocked.includes(item))
  )
    throw new AppError("FORBIDDEN", "아직 열리지 않은 꾸미기예요");
  decorations = { ...next };
  emit();
  return { ...decorations };
}
let records: TaskOccurrenceRow[] = [];
let tasks: TaskRow[] = [];
let cheers: EncouragementDisplay[] = [];
let nextId = 200;
const listeners = new Set<() => void>();
export function subscribeDemoTasks(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function emit() {
  listeners.forEach((listener) => listener());
}
function seed() {
  if (records.length) return;
  const now = new Date().toISOString();
  const specs: [number, string, string, number, boolean][] = [
    [1, "demo", "물 2잔 마시기", 0, true],
    [2, "demo", "영어 단어 10개", 0, false],
    [3, "demo", "저녁 산책", 0, false],
    [4, "demo", "도서관 책 반납", -2, false],
    [5, "demo", "주말 독서", 3, false],
    [6, "demo", "독서 기록 정리", -8, true],
    [101, "demo-friend-1", "수학 문제 5개 풀기", 0, true],
    [102, "demo-friend-2", "공원 한 바퀴 걷기", 0, true],
    [103, "demo-friend-1", "내일 발표 준비", 1, false],
  ];
  records = specs.map(([id, owner, title, days, done]) => ({
    id,
    task_id: id,
    owner_id: owner,
    occurrence_date: addUtcDays(today(), days),
    title_snapshot: title,
    due_time: id === 3 ? "19:30:00" : null,
    recurrence_snapshot: id === 1 ? "daily" : "none",
    status: done ? "completed" : "pending",
    completed_at: done ? now : null,
    first_completed_at: done ? now : null,
    reopened_at: null,
    created_at: now,
    updated_at: now,
  }));
  tasks = records.map((row) => ({
    id: row.task_id,
    owner_id: row.owner_id,
    title: row.title_snapshot,
    due_date: row.occurrence_date,
    due_time: row.due_time,
    recurrence: row.recurrence_snapshot,
    recurrence_changed_at: now,
    deleted_at: row.id === 6 ? now : null,
    created_at: now,
    updated_at: now,
  }));
  cheers = [
    {
      id: 11,
      occurrence_id: 1,
      author_id: "demo-friend-1",
      owner_id: "demo",
      authorName: "지민",
      authorAvatarKey: "cat",
      reaction: "clap",
      message: "오늘도 잊지 않고 했네!",
      visibility: "visible",
      created_at: now,
      updated_at: now,
    },
    {
      id: 12,
      occurrence_id: 101,
      author_id: "demo-friend-2",
      owner_id: "demo-friend-1",
      authorName: "서연",
      authorAvatarKey: "rabbit",
      reaction: "heart",
      message: "어려운 문제도 끝까지 풀었네",
      visibility: "visible",
      created_at: now,
      updated_at: now,
    },
  ];
}
export function emptyEncouragementSummary(): EncouragementSummary {
  return {
    count: 0,
    reactions: { lemon: 0, clap: 0, heart: 0, cheer: 0 },
    latestMessage: null,
    myEncouragement: null,
  };
}
export function demoSummary(id: number): EncouragementSummary {
  seed();
  const rows = cheers.filter(
    (item) => item.occurrence_id === id && item.visibility !== "deleted_by_author",
  );
  const visible = rows.filter((item) => item.visibility === "visible");
  const result = emptyEncouragementSummary();
  result.count = visible.length;
  visible.forEach((item) => {
    if (item.reaction) result.reactions[item.reaction]++;
  });
  const latest = visible.filter((item) => item.message).at(-1);
  if (latest)
    result.latestMessage = {
      encouragementId: latest.id,
      authorName: latest.authorName,
      authorAvatarKey: demoAvatarKey(latest.author_id),
      message: latest.message!,
      createdAt: latest.created_at,
    };
  const own = rows.find((item) => item.author_id === DEMO_OWNER_ID);
  if (own)
    result.myEncouragement = {
      id: own.id,
      reaction: own.reaction,
      message: own.message,
      visibility: own.visibility,
    };
  return result;
}
export function demoListOwn() {
  seed();
  return records
    .filter(
      (item) =>
        item.owner_id === DEMO_OWNER_ID &&
        !tasks.find((task) => task.id === item.task_id)?.deleted_at,
    )
    .map((item) => ({ ...item }));
}
export function demoListHistory(): OwnHistoryItem[] {
  seed();
  return records
    .filter((item) => item.owner_id === DEMO_OWNER_ID && item.first_completed_at)
    .sort((a, b) => b.first_completed_at!.localeCompare(a.first_completed_at!) || b.id - a.id)
    .map((occurrence) => ({
      occurrence: { ...occurrence },
      taskDeleted: Boolean(tasks.find((task) => task.id === occurrence.task_id)?.deleted_at),
      summary: demoSummary(occurrence.id),
    }));
}
export function demoListSocial(friendId?: string): SocialActivityItem[] {
  seed();
  return records
    .filter(
      (item) =>
        item.owner_id !== DEMO_OWNER_ID &&
        connectedIds.has(item.owner_id) &&
        (!friendId || item.owner_id === friendId) &&
        item.status === "completed" &&
        !tasks.find((task) => task.id === item.task_id)?.deleted_at,
    )
    .sort((a, b) => b.first_completed_at!.localeCompare(a.first_completed_at!) || b.id - a.id)
    .map((occurrence) => ({
      occurrence: { ...occurrence },
      owner: demoFriends.find((friend) => friend.id === occurrence.owner_id)!,
      summary: demoSummary(occurrence.id),
    }));
}
export function demoListFriend(friendId: string) {
  seed();
  return records
    .filter(
      (item) =>
        connectedIds.has(friendId) &&
        item.owner_id === friendId &&
        !tasks.find((task) => task.id === item.task_id)?.deleted_at,
    )
    .map((item) => ({ ...item }));
}
export function demoGetDetail(id: number): OccurrenceDetail {
  seed();
  const occurrence = records.find((item) => item.id === id);
  if (!occurrence) throw new AppError("NOT_FOUND", "할 일을 찾지 못했어요");
  const own = occurrence.owner_id === DEMO_OWNER_ID;
  if (!own && !connectedIds.has(occurrence.owner_id))
    throw new AppError("FORBIDDEN", "연결이 해제되어 할 일을 볼 수 없어요");
  const taskDeleted = Boolean(tasks.find((task) => task.id === occurrence.task_id)?.deleted_at);
  if (taskDeleted && !own) throw new AppError("NOT_FOUND", "할 일을 찾지 못했어요");
  return {
    occurrence: { ...occurrence },
    owner: own
      ? { id: DEMO_OWNER_ID, displayName: "나", avatarKey: profile.avatarKey }
      : demoFriends.find((friend) => friend.id === occurrence.owner_id)!,
    taskDeleted,
    permissions: {
      canEdit: own && !taskDeleted,
      canComplete: own && !taskDeleted,
      canEncourage: !own && !taskDeleted && occurrence.status === "completed",
    },
    encouragements: cheers
      .filter(
        (item) =>
          item.occurrence_id === id &&
          item.visibility !== "deleted_by_author" &&
          (own || item.visibility === "visible" || item.author_id === DEMO_OWNER_ID),
      )
      .map((item) => ({ ...item, authorAvatarKey: demoAvatarKey(item.author_id) })),
    summary: demoSummary(id),
  };
}
export function demoGetTask(id: number): TaskInput {
  seed();
  const task = tasks.find((item) => item.id === id);
  if (!task) throw new AppError("NOT_FOUND", "할 일을 찾지 못했어요");
  return {
    title: task.title,
    dueDate: task.due_date,
    dueTime: task.due_time?.slice(0, 5) ?? "",
    recurrence: task.recurrence,
  };
}
export function demoCreateTask(input: TaskInput) {
  seed();
  const id = nextId++;
  const now = new Date().toISOString();
  tasks.push({
    id,
    owner_id: DEMO_OWNER_ID,
    title: input.title,
    due_date: input.dueDate,
    due_time: input.dueTime || null,
    recurrence: input.recurrence ?? "none",
    recurrence_changed_at: now,
    deleted_at: null,
    created_at: now,
    updated_at: now,
  });
  records.push({
    id,
    task_id: id,
    owner_id: DEMO_OWNER_ID,
    title_snapshot: input.title,
    occurrence_date: input.dueDate,
    due_time: input.dueTime || null,
    recurrence_snapshot: input.recurrence ?? "none",
    status: "pending",
    completed_at: null,
    first_completed_at: null,
    reopened_at: null,
    created_at: now,
    updated_at: now,
  });
  emit();
  return id;
}
export function demoUpdateTask(id: number, input: TaskInput) {
  seed();
  const task = tasks.find((item) => item.id === id)!;
  Object.assign(task, {
    title: input.title,
    due_date: input.dueDate,
    due_time: input.dueTime || null,
    recurrence: input.recurrence ?? "none",
  });
  records
    .filter((item) => item.task_id === id && item.status === "pending")
    .forEach((item) =>
      Object.assign(item, {
        title_snapshot: input.title,
        occurrence_date: input.dueDate,
        due_time: input.dueTime || null,
        recurrence_snapshot: input.recurrence ?? "none",
      }),
    );
  emit();
}
export function demoDeleteTask(id: number) {
  seed();
  tasks.find((item) => item.id === id)!.deleted_at = new Date().toISOString();
  emit();
}
export function demoToggleOccurrence(id: number) {
  seed();
  const row = records.find((item) => item.id === id)!;
  const firstCompletion = row.status === "pending" && !row.first_completed_at;
  const now = new Date().toISOString();
  if (row.status === "pending") {
    row.status = "completed";
    row.completed_at = now;
    row.first_completed_at ??= now;
  } else {
    row.status = "pending";
    row.completed_at = null;
    row.reopened_at = now;
  }
  emit();
  return { firstCompletion };
}
export function demoSendEncouragement(id: number, reaction: Reaction | null, message: string) {
  const normalizedMessage = message.trim() || null;
  if ((normalizedMessage?.length ?? 0) > 120 || (!reaction && !normalizedMessage))
    throw new AppError("INVALID_INPUT", "반응이나 120자 이하 응원글을 입력해 주세요");
  const detail = demoGetDetail(id);
  if (!detail.permissions.canEncourage)
    throw new AppError("FORBIDDEN", "지금은 응원을 보낼 수 없어요");
  const row = cheers.find((item) => item.occurrence_id === id && item.author_id === DEMO_OWNER_ID);
  const now = new Date().toISOString();
  if (row) {
    Object.assign(row, {
      reaction,
      message: normalizedMessage,
      visibility: "visible",
      updated_at: now,
    });
  } else {
    cheers.push({
      id: nextId++,
      occurrence_id: id,
      owner_id: detail.owner.id,
      author_id: DEMO_OWNER_ID,
      authorName: "나",
      authorAvatarKey: profile.avatarKey,
      reaction,
      message: normalizedMessage,
      visibility: "visible",
      created_at: now,
      updated_at: now,
    });
  }
  emit();
}
export function demoDeleteEncouragement(id: number) {
  seed();
  const row = cheers.find((item) => item.id === id);
  if (!row) throw new AppError("NOT_FOUND", "응원을 찾지 못했어요");
  if (row.author_id !== DEMO_OWNER_ID)
    throw new AppError("FORBIDDEN", "직접 보낸 응원만 삭제할 수 있어요");
  row.visibility = "deleted_by_author";
  emit();
}

import { AppError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ConnectionRequestRow, ConnectionRow } from "@/lib/supabase/database.types";
import { addUtcDays } from "@/features/tasks/recurrence";
import { listOccurrences } from "@/features/tasks/task-service";

export interface FriendSummary {
  id: string;
  displayName: string;
}

export interface ConnectionData {
  incoming: Array<ConnectionRequestRow & { displayName: string }>;
  outgoing: Array<ConnectionRequestRow & { displayName: string }>;
  friends: FriendSummary[];
}

async function profilesById(
  ids: string[],
): Promise<Map<string, { id: string; display_name: string }>> {
  if (!ids.length) return new Map();
  const { data, error } = await getSupabaseClient()
    .from("profiles")
    .select("id, display_name")
    .in("id", ids);
  if (error) throw new AppError("INVALID_INPUT", "친구 프로필을 불러오지 못했어요.");
  return new Map(data.map((profile) => [profile.id, profile]));
}

export async function getConnectionData(userId: string): Promise<ConnectionData> {
  const client = getSupabaseClient();
  const [requestsResult, connectionsResult] = await Promise.all([
    client.from("connection_requests").select("*").eq("status", "pending"),
    client.from("connections").select("*"),
  ]);
  if (requestsResult.error || connectionsResult.error) {
    throw new AppError("INVALID_INPUT", "친구 연결을 불러오지 못했어요.");
  }
  const requests = requestsResult.data;
  const connectionRows = connectionsResult.data as ConnectionRow[];
  const profiles = await profilesById(
    [
      ...requests.flatMap((item) => [item.requester_id, item.addressee_id]),
      ...connectionRows.flatMap((item) => [item.user_low_id, item.user_high_id]),
    ].filter((id) => id !== userId),
  );
  const withName = (request: ConnectionRequestRow) => ({
    ...request,
    displayName:
      profiles.get(request.requester_id === userId ? request.addressee_id : request.requester_id)
        ?.display_name ?? "레몬 친구",
  });
  return {
    incoming: requests.filter((item) => item.addressee_id === userId).map(withName),
    outgoing: requests.filter((item) => item.requester_id === userId).map(withName),
    friends: connectionRows.map((item) => {
      const id = item.user_low_id === userId ? item.user_high_id : item.user_low_id;
      return { id, displayName: profiles.get(id)?.display_name ?? "레몬 친구" };
    }),
  };
}

function connectionError(message: string): AppError {
  if (message.includes("CONFLICT") || message.includes("ALREADY_CONNECTED")) {
    return new AppError("CONFLICT", "이미 연결 요청이 있거나 연결된 친구예요.");
  }
  if (message.includes("BLOCKED"))
    return new AppError("FORBIDDEN", "차단된 사용자와는 연결할 수 없어요.");
  return new AppError("INVALID_INPUT", "친구 연결을 처리하지 못했어요.");
}

export async function sendConnectionRequest(
  inviteCode: string,
): Promise<{ requestId: number; status: "pending" }> {
  const { data, error } = await getSupabaseClient().rpc("request_connection", {
    target_invite_code: inviteCode,
  });
  if (error) throw connectionError(error.message);
  return { requestId: data, status: "pending" };
}

export async function respondToConnectionRequest(
  requestId: number,
  accept: boolean,
): Promise<{ requestId: number; status: "accepted" | "rejected" }> {
  const { data, error } = await getSupabaseClient().rpc("respond_connection_request", {
    target_request_id: requestId,
    accept_request: accept,
  });
  if (error) throw connectionError(error.message);
  if (!data) throw new AppError("CONFLICT", "요청 상태가 바뀌었어요.");
  return { requestId, status: accept ? "accepted" : "rejected" };
}

export async function cancelConnectionRequest(
  requestId: number,
): Promise<{ requestId: number; status: "cancelled" }> {
  const { data, error } = await getSupabaseClient().rpc("cancel_connection_request", {
    target_request_id: requestId,
  });
  if (error) throw connectionError(error.message);
  if (!data) throw new AppError("CONFLICT", "요청 상태가 바뀌었어요.");
  return { requestId, status: "cancelled" };
}

export async function disconnectFriend(friendId: string): Promise<{ disconnected: true }> {
  const { data, error } = await getSupabaseClient().rpc("disconnect_friend", {
    friend_id: friendId,
  });
  if (error) throw connectionError(error.message);
  if (!data) throw new AppError("NOT_FOUND", "친구 연결을 찾지 못했어요.");
  return { disconnected: true };
}

export async function blockFriend(friendId: string): Promise<{ blocked: true }> {
  const { data, error } = await getSupabaseClient().rpc("block_user", { target_user_id: friendId });
  if (error) throw connectionError(error.message);
  if (!data) throw new AppError("NOT_FOUND", "친구를 찾지 못했어요.");
  return { blocked: true };
}

export async function getFriendOverview(friendId: string, targetOccurrenceId?: number) {
  const today = await getSupabaseClient().rpc("get_owner_today", { target_owner_id: friendId });
  if (today.error) throw new AppError("FORBIDDEN", "친구 할 일을 볼 수 없어요.");
  const result = await listOccurrences({
    ownerId: friendId,
    from: addUtcDays(today.data, -366),
    to: addUtcDays(today.data, 366),
  });
  if (targetOccurrenceId && !result.occurrences.some((item) => item.id === targetOccurrenceId)) {
    const { data, error } = await getSupabaseClient()
      .from("task_occurrences")
      .select("*")
      .eq("id", targetOccurrenceId)
      .eq("owner_id", friendId)
      .maybeSingle();
    if (error) throw new AppError("FORBIDDEN", "친구의 완료 기록을 볼 수 없어요.");
    if (data) result.occurrences.push(data);
  }
  return result;
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const integrationEnabled =
  process.env.RUN_SUPABASE_INTEGRATION === "1" && Boolean(url && publishableKey);

const integrationDescribe = integrationEnabled ? describe : describe.skip;

function requireData<T>(result: {
  data: T;
  error: { message: string } | null;
}): NonNullable<T> {
  if (result.error) {
    throw new Error(result.error.message);
  }
  if (result.data === null) {
    throw new Error("Supabase integration query returned no data");
  }
  return result.data as NonNullable<T>;
}

integrationDescribe("Supabase completion concurrency", () => {
  it("awards and notifies exactly once when two devices complete together", async () => {
    const owner = createClient<Database>(url!, publishableKey!);
    const friend = createClient<Database>(url!, publishableKey!);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const ownerAuth = requireData(
      await owner.auth.signUp({
        email: `owner-${suffix}@example.test`,
        password: "Lemon-test-1234!",
        options: { data: { display_name: "Owner", time_zone: "Asia/Seoul" } },
      }),
    );
    const friendAuth = requireData(
      await friend.auth.signUp({
        email: `friend-${suffix}@example.test`,
        password: "Lemon-test-1234!",
        options: { data: { display_name: "Friend", time_zone: "Asia/Seoul" } },
      }),
    );

    expect(ownerAuth.session).not.toBeNull();
    expect(friendAuth.session).not.toBeNull();

    const ownerId = ownerAuth.user!.id;
    const invite = requireData(
      await friend
        .from("profile_private")
        .select("invite_code")
        .eq("user_id", friendAuth.user!.id)
        .single(),
    );
    const requestId = requireData(
      await owner.rpc("request_connection", { target_invite_code: invite.invite_code }),
    );
    requireData(
      await friend.rpc("respond_connection_request", {
        target_request_id: requestId,
        accept_request: true,
      }),
    );

    const task = requireData(
      await owner
        .from("tasks")
        .insert({
          owner_id: ownerId,
          title: "Concurrent completion",
          due_date: "2026-09-17",
          due_time: null,
          recurrence: "none",
        })
        .select("id")
        .single(),
    );
    const occurrence = requireData(
      await owner
        .from("task_occurrences")
        .insert({
          task_id: task.id,
          owner_id: ownerId,
          occurrence_date: "2026-09-17",
          title_snapshot: "Concurrent completion",
          due_time: null,
          recurrence_snapshot: "none",
        })
        .select("id")
        .single(),
    );

    const ownerSession = ownerAuth.session!;
    const secondDevice: SupabaseClient<Database> = createClient<Database>(url!, publishableKey!);
    requireData(await secondDevice.auth.setSession(ownerSession));

    const [firstAttempt, secondAttempt] = await Promise.all([
      owner.rpc("complete_occurrence", { target_occurrence_id: occurrence.id }),
      secondDevice.rpc("complete_occurrence", { target_occurrence_id: occurrence.id }),
    ]);
    requireData(firstAttempt);
    requireData(secondAttempt);

    const privateProfile = requireData(
      await owner.from("profile_private").select("lemon_points").eq("user_id", ownerId).single(),
    );
    const completionEvents = requireData(
      await owner
        .from("completion_events")
        .select("id", { count: "exact" })
        .eq("occurrence_id", occurrence.id),
    );
    const friendNotifications = requireData(
      await friend
        .from("notifications")
        .select("id", { count: "exact" })
        .eq("occurrence_id", occurrence.id)
        .eq("notification_type", "task_completed"),
    );

    expect(privateProfile.lemon_points).toBe(1);
    expect(completionEvents).toHaveLength(1);
    expect(friendNotifications).toHaveLength(1);
  }, 30_000);
});

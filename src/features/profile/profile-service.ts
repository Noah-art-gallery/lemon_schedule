import { z } from "zod";

import { AppError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import { isValidTimeZone } from "@/lib/time";

export interface ProfileDetails {
  displayName: string;
  timeZone: string;
  inviteCode: string;
  lemonPoints: number;
  petLevel: number;
  blocked: Array<{ id: string; displayName: string }>;
}

export const profileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  timeZone: z.string().trim().refine(isValidTimeZone).optional(),
});

const profileUpdateResultSchema = z.object({
  profileId: z.string(),
  displayName: z.string(),
  timeZone: z.string(),
  updatedAt: z.string(),
});

export async function getProfileDetails(userId: string): Promise<ProfileDetails> {
  const client = getSupabaseClient();
  const [profileResult, privateResult, blocksResult] = await Promise.all([
    client.from("profiles").select("display_name").eq("id", userId).single(),
    client
      .from("profile_private")
      .select("time_zone, invite_code, lemon_points, pet_level")
      .eq("user_id", userId)
      .single(),
    client.rpc("list_blocked_profiles"),
  ]);
  if (profileResult.error || privateResult.error || blocksResult.error) {
    throw new AppError("INVALID_INPUT", "프로필을 불러오지 못했어요.");
  }

  return {
    displayName: profileResult.data.display_name,
    timeZone: privateResult.data.time_zone,
    inviteCode: privateResult.data.invite_code,
    lemonPoints: privateResult.data.lemon_points,
    petLevel: privateResult.data.pet_level,
    blocked: blocksResult.data.map((item) => ({
      id: item.user_id,
      displayName: item.display_name,
    })),
  };
}

export async function updateProfile(
  input: z.input<typeof profileInputSchema>,
): Promise<z.infer<typeof profileUpdateResultSchema>> {
  const parsed = profileInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(
      "INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "프로필 입력값을 확인해 주세요.",
    );
  }
  const values = parsed.data;
  const { data, error } = await getSupabaseClient().rpc("update_my_profile", {
    new_display_name: values.displayName ?? null,
    new_time_zone: values.timeZone ?? null,
  });
  if (error) {
    throw new AppError("INVALID_INPUT", "프로필을 저장하지 못했어요.");
  }
  const parsedResult = profileUpdateResultSchema.safeParse(data);
  if (!parsedResult.success) {
    throw new AppError("INVALID_INPUT", "프로필 저장 결과를 확인하지 못했어요.");
  }
  return parsedResult.data;
}

export async function unblockUser(userId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc("unblock_user", { target_user_id: userId });
  if (error) throw new AppError("INVALID_INPUT", "차단을 해제하지 못했어요.");
}

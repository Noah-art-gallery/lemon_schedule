import { AppError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import { z } from "zod";

const decorationSchema = z.object({
  selectedColor: z.enum(["leaf-green", "lemon-yellow"]),
  selectedAccessory: z.enum(["leaf-hat"]).nullable(),
  selectedBackground: z.enum(["sunny-garden"]).nullable(),
});
export type PetDecorations = z.infer<typeof decorationSchema>;

export interface PetDetails {
  drawingPath: string | null;
  lemonPoints: number;
  petLevel: number;
  unlockCount: number;
  unlockedItems: string[];
  decorations: PetDecorations;
}

export async function getPetDetails(userId: string): Promise<PetDetails> {
  const client = getSupabaseClient();
  const [petResult, privateResult, unlockResult] = await Promise.all([
    client
      .from("pets")
      .select("drawing_path, selected_color, selected_accessory, selected_background")
      .eq("user_id", userId)
      .single(),
    client.from("profile_private").select("lemon_points, pet_level").eq("user_id", userId).single(),
    client.from("pet_unlocks").select("item_key").eq("user_id", userId),
  ]);
  if (petResult.error || privateResult.error || unlockResult.error) {
    throw new AppError("INVALID_INPUT", "펫 정보를 불러오지 못했어요.");
  }
  return {
    drawingPath: petResult.data.drawing_path,
    lemonPoints: privateResult.data.lemon_points,
    petLevel: privateResult.data.pet_level,
    unlockCount: unlockResult.data.length,
    unlockedItems: unlockResult.data.map((item) => item.item_key),
    decorations: {
      selectedColor: petResult.data.selected_color,
      selectedAccessory: petResult.data.selected_accessory,
      selectedBackground: petResult.data.selected_background,
    },
  };
}

export async function savePetDecorations(input: PetDecorations): Promise<PetDecorations> {
  const parsed = decorationSchema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", "꾸미기 항목을 확인해 주세요.");
  const { data, error } = await getSupabaseClient().rpc("set_pet_decorations", {
    target_color: parsed.data.selectedColor,
    target_accessory: parsed.data.selectedAccessory,
    target_background: parsed.data.selectedBackground,
  });
  if (error) {
    if (error.message.includes("PET_ITEM_LOCKED")) {
      throw new AppError("FORBIDDEN", "아직 열리지 않은 꾸미기예요.");
    }
    throw new AppError("INVALID_INPUT", "펫 꾸미기를 저장하지 못했어요.");
  }
  const result = decorationSchema.safeParse(data);
  if (!result.success) throw new AppError("INVALID_INPUT", "펫 꾸미기 결과를 확인하지 못했어요.");
  return result.data;
}

export async function getPetDrawingUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await getSupabaseClient()
    .storage.from("pet-drawings")
    .createSignedUrl(path, 60 * 60);
  if (error) throw new AppError("INVALID_INPUT", "펫 그림을 불러오지 못했어요.");
  return data.signedUrl;
}

export async function savePetDrawing(
  userId: string,
  blob: Blob,
): Promise<{ drawingPath: string; updatedAt: string }> {
  const path = `${userId}/pet.png`;
  const client = getSupabaseClient();
  const upload = await client.storage.from("pet-drawings").upload(path, blob, {
    contentType: "image/png",
    upsert: true,
  });
  if (upload.error) throw new AppError("INVALID_INPUT", "펫 그림을 저장하지 못했어요.");

  const { data, error } = await client
    .from("pets")
    .update({ drawing_path: path })
    .eq("user_id", userId)
    .select("drawing_path, updated_at")
    .single();
  if (error) throw new AppError("INVALID_INPUT", "펫 그림을 저장하지 못했어요.");
  return { drawingPath: data.drawing_path ?? path, updatedAt: data.updated_at };
}

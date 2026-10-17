import { beforeEach, expect, it, vi } from "vitest";
import { savePetDrawing } from "./pet-service";
const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  update: vi.fn(),
  single: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
    from: () => ({ update: mocks.update }),
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.upload.mockResolvedValue({ error: null });
  mocks.update.mockReturnValue({ eq: () => ({ select: () => ({ single: mocks.single }) }) });
});
it("저장 실패가 기존 그림을 덮어쓰지 않는다", async () => {
  mocks.single.mockResolvedValue({ error: { message: "write failed" }, data: null });
  await expect(savePetDrawing("owner", new Blob(["drawing"]))).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  expect(mocks.upload.mock.calls[0][0]).toMatch(/^owner\/[a-f0-9-]+\.png$/);
  expect(mocks.upload.mock.calls[0][0]).not.toBe("owner/pet.png");
  expect(mocks.upload.mock.calls[0][2]).toMatchObject({ upsert: false });
  expect(mocks.remove).not.toHaveBeenCalled();
});
it("각 저장은 독립 경로를 사용하고 확인된 경로만 반환한다", async () => {
  mocks.single.mockImplementation(async () => ({
    error: null,
    data: { drawing_path: mocks.upload.mock.calls.at(-1)?.[0], updated_at: "2026-10-12T00:00:00Z" },
  }));
  const first = await savePetDrawing("owner", new Blob(["one"]));
  const second = await savePetDrawing("owner", new Blob(["two"]));
  expect(first.drawingPath).not.toBe(second.drawingPath);
  expect(mocks.update).toHaveBeenNthCalledWith(2, { drawing_path: second.drawingPath });
});

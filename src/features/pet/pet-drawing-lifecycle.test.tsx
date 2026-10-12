import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { PetScreen } from "./pet-screen";

const mocks = vi.hoisted(() => ({ savePetDrawing: vi.fn() }));
const user = { id: "owner" };
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => ({ user, demo: false }) }));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("./pet-service", () => ({
  getPetDetails: vi.fn().mockResolvedValue({
    drawingPath: "owner/pet.png",
    lemonPoints: 3,
    petLevel: 1,
    unlockCount: 0,
    unlockedItems: [],
    decorations: { selectedColor: "leaf-green", selectedAccessory: null, selectedBackground: null },
  }),
  getPetDrawingUrl: vi.fn().mockResolvedValue("https://example.com/original.png"),
  savePetDrawing: mocks.savePetDrawing,
  savePetDecorations: vi.fn(),
}));
const callbacks: BlobCallback[] = [];
beforeEach(() => {
  callbacks.length = 0;
  mocks.savePetDrawing.mockReset();
  mocks.savePetDrawing.mockResolvedValue({ drawingPath: "owner/new.png" });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    scale() {},
    clearRect() {},
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
    callbacks.push(callback);
  });
});
afterEach(() => vi.restoreAllMocks());

async function startThenDiscard() {
  render(<PetScreen />);
  await screen.findByAltText("내 펫");
  fireEvent.click(screen.getByRole("button", { name: "새로 그리기" }));
  fireEvent.click(screen.getByRole("button", { name: "전체 지우기" }));
  fireEvent.click(screen.getByRole("button", { name: "펫 저장" }));
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  fireEvent.click(screen.getByRole("button", { name: "그림 버리기" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
}
it("PNG 변환 중 취소하면 지연 콜백이 기존 펫을 저장하지 않는다", async () => {
  await startThenDiscard();
  await act(async () => callbacks[0](new Blob(["png"], { type: "image/png" })));
  expect(mocks.savePetDrawing).not.toHaveBeenCalled();
  expect(screen.getByAltText("내 펫")).toHaveAttribute("src", "https://example.com/original.png");
});
it("새 도화지를 열어도 취소한 이전 변환은 저장하지 않는다", async () => {
  await startThenDiscard();
  fireEvent.click(screen.getByRole("button", { name: "새로 그리기" }));
  await act(async () => callbacks[0](new Blob(["old png"], { type: "image/png" })));
  expect(mocks.savePetDrawing).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog", { name: "펫 그리기" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "펫 저장" })).toBeEnabled();
});

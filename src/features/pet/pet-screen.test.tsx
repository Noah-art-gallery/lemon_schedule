import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { PetScreen } from "./pet-screen";
const mocks = vi.hoisted(() => ({
  getPetDetails: vi.fn(),
  getPetDrawingUrl: vi.fn(),
  savePetDrawing: vi.fn(),
  savePetDecorations: vi.fn(),
}));
const user = { id: "owner" };
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => ({ user, demo: false }) }));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("./pet-service", () => mocks);
vi.mock("./pet-canvas", () => ({
  PetCanvas: ({
    onSave,
    onDirtyChange,
  }: {
    onSave: (blob: Blob) => Promise<void>;
    onDirtyChange?: (dirty: boolean) => void;
  }) => (
    <div>
      <button onClick={() => onDirtyChange?.(true)}>선 그리기</button>
      <button onClick={() => void onSave(new Blob(["drawing"]))}>펫 저장</button>
    </div>
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPetDetails.mockResolvedValue({
    drawingPath: "owner/pet.png",
    lemonPoints: 3,
    petLevel: 1,
    unlockCount: 0,
    unlockedItems: [],
    decorations: { selectedColor: "leaf-green", selectedAccessory: null, selectedBackground: null },
  });
  mocks.getPetDrawingUrl.mockResolvedValue("https://example.com/original.png");
});
it("저장 실패 뒤에도 도화지와 기존 펫을 유지한다", async () => {
  mocks.savePetDrawing.mockRejectedValue(new Error("그림 저장 실패"));
  render(<PetScreen />);
  await screen.findByAltText("내 펫");
  fireEvent.click(screen.getByRole("button", { name: "새로 그리기" }));
  fireEvent.click(screen.getByRole("button", { name: "선 그리기" }));
  fireEvent.click(screen.getByRole("button", { name: "펫 저장" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("그림 저장 실패");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByAltText("내 펫")).toHaveAttribute("src", "https://example.com/original.png");
});
it("그리기 취소는 저장된 펫을 바꾸지 않는다", async () => {
  render(<PetScreen />);
  await screen.findByAltText("내 펫");
  fireEvent.click(screen.getByRole("button", { name: "새로 그리기" }));
  fireEvent.click(screen.getByRole("button", { name: "선 그리기" }));
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  fireEvent.click(screen.getByRole("button", { name: "그림 버리기" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(mocks.savePetDrawing).not.toHaveBeenCalled();
  expect(screen.getByAltText("내 펫")).toHaveAttribute("src", "https://example.com/original.png");
});
it("미해금 항목은 점수를 표시하고 선택할 수 없다", async () => {
  render(<PetScreen />);
  await screen.findByAltText("내 펫");
  expect(screen.getByRole("option", { name: "레몬 노랑 · 5점" })).toBeDisabled();
  expect(screen.getByRole("option", { name: "잎사귀 모자 · 15점" })).toBeDisabled();
  expect(screen.getByRole("option", { name: "햇살 정원 · 30점" })).toBeDisabled();
});

it("그림 버리기 확인은 계속 그리기에 초점을 두고 그림을 보존한다", async () => {
  render(<PetScreen />);
  await screen.findByAltText("내 펫");
  fireEvent.click(screen.getByRole("button", { name: "새로 그리기" }));
  const draw = screen.getByRole("button", { name: "선 그리기" });
  fireEvent.click(draw);
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  expect(screen.getByRole("button", { name: "계속 그리기" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "계속 그리기" }));
  expect(draw).toHaveFocus();
  expect(mocks.savePetDrawing).not.toHaveBeenCalled();
});

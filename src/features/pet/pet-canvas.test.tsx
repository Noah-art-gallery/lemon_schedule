import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PetCanvas } from "./pet-canvas";
afterEach(() => vi.restoreAllMocks());
it("PNG 변환 실패를 알리고 도화지를 유지한 채 다시 저장한다", async () => {
  const context = {
    scale: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementationOnce((callback) => callback(null))
    .mockImplementationOnce((callback) => callback(new Blob(["png"], { type: "image/png" })));
  const save = vi.fn().mockResolvedValue(undefined);
  render(<PetCanvas onSave={save} strokeColor="#397a4b" />);
  const canvas = screen.getByLabelText("나만의 레몬 펫을 그리는 도화지");
  fireEvent.click(screen.getByRole("button", { name: "펫 저장" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("그림을 준비하지 못했어요");
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByLabelText("나만의 레몬 펫을 그리는 도화지")).toBe(canvas);
  fireEvent.click(screen.getByRole("button", { name: "펫 저장" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(context.clearRect).not.toHaveBeenCalled();
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProgressRing } from "@/components/ui/progress-ring";

describe("ProgressRing", () => {
  it("distinguishes no tasks from zero percent", () => {
    render(<ProgressRing completed={0} total={0} />);
    expect(screen.getByRole("img", { name: "오늘 완료율: 오늘 할 일 없음" })).toBeVisible();
    expect(screen.getByText("할 일 없음")).toBeVisible();
  });

  it("announces a rounded completion percentage", () => {
    render(<ProgressRing completed={2} total={3} />);
    expect(screen.getByRole("img", { name: "오늘 완료율: 67%" })).toBeVisible();
  });
});

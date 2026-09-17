import { expect, test } from "@playwright/test";

test("첫 화면이 모바일과 데스크톱에서 열린다", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "오늘의 작은 완료를 응원해요" })).toBeVisible();
  await expect(page.getByText("LEMON SCHEDULE")).toBeVisible();
});

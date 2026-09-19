import { expect, test } from "@playwright/test";

test("첫 화면이 모바일과 데스크톱에서 열린다", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "오늘도 한 걸음, 같이 해요" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toBeVisible();
  await expect(page.getByRole("link", { name: "알림 열기" })).toBeVisible();
  await expect(page.getByAltText("두 팔을 들고 응원하는 기본 레몬 펫")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("모든 주요 메뉴가 빈 상태에서도 열린다", async ({ page }) => {
  for (const [path, heading] of [
    ["/friends", "친구와 같이 해볼까요?"],
    ["/pet", "나만의 펫"],
    ["/profile", "내 정보"],
    ["/notifications", "알림"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});

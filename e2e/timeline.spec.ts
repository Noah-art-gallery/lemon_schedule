import { expect, test } from "@playwright/test";

test("타임라인에서 등록·완료를 모아 보고 친구의 하루를 응원한다", async ({ page }) => {
  await page.goto("/friends/");
  await expect(page.getByRole("tab", { name: "타임라인", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const feed = page.getByRole("region", { name: "친구 타임라인" });
  await expect(feed.getByRole("article", { name: /등록 활동/ })).toHaveCount(3);
  await expect(feed.getByRole("article", { name: /완료 활동/ })).toHaveCount(2);
  await feed
    .getByRole("group", { name: "활동을 볼 친구" })
    .getByRole("button", { name: "지민", exact: true })
    .click();
  await expect(feed.getByRole("article", { name: /서연/ })).toHaveCount(0);
  await expect(feed.getByRole("article")).toHaveCount(3);
  const trigger = feed.getByRole("button", { name: "오늘 응원하기", exact: true }).first();
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "박수", exact: true }).click();
  await dialog.getByLabel("응원글").fill("꾸준히 하는 모습 멋져!");
  await dialog.getByRole("button", { name: "응원 보내기", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(feed.getByRole("button", { name: "보낸 응원 수정하기", exact: true })).toHaveCount(
    3,
  );
  await expect(
    feed.getByRole("button", { name: "보낸 응원 수정하기", exact: true }).first(),
  ).toBeFocused();
  const friend = feed.getByRole("button", { name: "지민의 오늘 보기" }).first();
  await friend.click();
  await page.getByRole("button", { name: "친구 목록으로" }).click();
  await expect(friend).toBeFocused();
  await expect(feed.getByRole("article")).toHaveCount(3);
  await page.getByRole("tab", { name: "친구별", exact: true }).click();
  await expect(page.getByRole("article", { name: "지민의 하루" })).toContainText(
    "꾸준히 하는 모습 멋져!",
  );
});

test("타임라인은 작은 화면과 확대 글자에서 넘치지 않는다", async ({ page }) => {
  for (const width of [360, 390, 430, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/friends/");
    await expect(page.getByRole("article", { name: /완료 활동/ })).toHaveCount(2);
    if (width === 360)
      await page.addStyleTag({
        content: "main button, main h3, main strong {font-size:32px!important}",
      });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

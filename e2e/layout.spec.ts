import { expect, test, type Page } from "@playwright/test";

async function expectControlsToFit(page: Page) {
  const issues = await page.evaluate(() => {
    const visible = (element: Element) => element.getClientRects().length > 0;
    const problems: string[] = [];
    if (document.documentElement.scrollWidth > innerWidth) problems.push("page overflow");
    for (const element of document.querySelectorAll<HTMLElement>(
      "main button, [role=dialog] button, [role=dialog] input:not([type=radio]), [role=dialog] select",
    )) {
      if (!visible(element) || element.closest("[inert]")) continue;
      const rect = element.getBoundingClientRect();
      const label =
        element.getAttribute("aria-label") ??
        (element instanceof HTMLInputElement ? element.name : element.textContent?.trim());
      if (rect.left < -1 || rect.right > innerWidth + 1)
        problems.push(`${label}: outside viewport`);
      if (element.tagName === "BUTTON" && element.scrollWidth > element.clientWidth + 1)
        problems.push(`${label}: clipped content`);
      if (rect.height < 43) problems.push(`${label}: short touch target`);
      if (element.classList.contains("button")) {
        const icon = element.querySelector(":scope > svg");
        if (icon) {
          const bounds = icon.getBoundingClientRect();
          if (Math.abs(bounds.top + bounds.height / 2 - rect.top - rect.height / 2) > 1)
            problems.push(`${label}: icon alignment`);
        }
      }
    }
    return problems;
  });
  expect.soft(issues, `Control layout: ${page.url()}`).toEqual([]);
}

test("버튼·캐릭터 선택·패널은 모바일과 확대 글자에서도 넘치지 않는다", async ({ page }) => {
  test.setTimeout(240_000);
  for (const width of [360, 390, 430, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/friends/", "/pet/", "/profile/", "/notifications/"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectControlsToFit(page);
      if (path === "/") {
        await page.getByRole("button", { name: "할 일 추가", exact: true }).click();
        await page
          .getByLabel("할 일", { exact: true })
          .fill("긴 할 일 제목 ".repeat(10).slice(0, 80));
        await page.getByRole("button", { name: "시간·반복 펼치기" }).click();
      } else if (path === "/friends/") {
        await page
          .getByRole("article", { name: "지민의 하루" })
          .getByRole("button", { name: "응원 보내기" })
          .click();
        await page.getByRole("button", { name: "좋아요", exact: true }).click();
      } else if (path === "/pet/") {
        await page.getByRole("button", { name: "새로 그리기" }).click();
      } else if (path === "/profile/") {
        await page.getByRole("button", { name: "프로필 수정" }).click();
        await page.getByLabel("닉네임", { exact: true }).fill("긴닉네임".repeat(10));
      }
      await expectControlsToFit(page);
      if (width === 360) {
        await page.addStyleTag({
          content: "button, button > span, input, select, textarea { font-size: 32px !important; }",
        });
        await expectControlsToFit(page);
      }
    }
  }
});

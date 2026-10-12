import { expect, test } from "@playwright/test";

test("주요 화면과 소식 진입점이 좁은 화면에서도 열린다", async ({ page }) => {
  for (const [path, heading] of [
    ["/", "할 일"],
    ["/friends/", "친구"],
    ["/pet/", "펫"],
    ["/profile/", "내 정보"],
    ["/notifications/", "소식"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "소식 열기" })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});

test("추가와 완료 후 재완료는 포인트를 다시 지급하지 않는다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "할 일 추가", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "할 일 추가" });
  await panel.getByLabel("할 일", { exact: true }).fill("레몬 물 주기");
  await panel.getByRole("button", { name: "할 일 추가", exact: true }).click();
  await expect(panel).not.toBeVisible();
  await page.getByRole("button", { name: "레몬 물 주기 완료", exact: true }).click();
  await page.getByRole("button", { name: "레몬 물 주기 완료 취소", exact: true }).click();
  await page.getByRole("button", { name: "레몬 물 주기 완료", exact: true }).click();
  await page.getByRole("link", { name: "펫", exact: true }).click();
  await expect(page.getByRole("heading", { name: "3 포인트" })).toBeVisible();
});

test("간결한 인증 화면에서 초대 코드를 이어간다", async ({ page }) => {
  await page.goto("/signup/?invite=LEMON1234");
  await expect(page.getByRole("heading", { name: "회원가입" })).toBeVisible();
  await expect(page.getByLabel("시간대")).toHaveValue(/.+/);
  await page.getByRole("link", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/login\/\?invite=LEMON1234/);
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  await page.goto("/friends/?invite=LEMON1234");
  await expect(page.getByRole("textbox", { name: "친구 초대 코드" })).toHaveValue("LEMON1234");
});

test("소식에서 응원 원문을 연 뒤 모든 종류를 읽음 처리한다", async ({ page }) => {
  await page.goto("/notifications/");
  await page.getByRole("button", { name: /지민.*응원/ }).click();
  await expect(page.getByRole("dialog", { name: "할 일 상세" })).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("오늘도 잊지 않고 했네!", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "모두 읽음" }).click();
  await expect(page.getByLabel("읽지 않음", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel(/읽지 않은 소식/)).toHaveCount(0);
});

test("펫 그리기 패널을 닫으면 진입 버튼으로 돌아간다", async ({ page }) => {
  await page.goto("/pet/");
  await expect(page.getByRole("option", { name: /레몬 노랑/ })).toBeDisabled();
  const trigger = page.getByRole("button", { name: "새로 그리기" });
  await trigger.click();
  await expect(page.getByLabel("나만의 레몬 펫을 그리는 도화지")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("친구 완료 항목에서 응원글을 보내고 반응만 바꿔도 글을 유지한다", async ({ page }) => {
  await page.goto("/friends/");
  await page.getByRole("button", { name: /수학 문제 5개 풀기/ }).click();
  await page.getByRole("textbox", { name: "응원글" }).fill("끝까지 풀었네!");
  await page.getByRole("button", { name: "응원 보내기" }).click();
  await page.getByRole("button", { name: "박수", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "응원글" })).toHaveValue("끝까지 풀었네!");
});

test("친구 차단 확인은 취소에 초점을 두고 관리 버튼으로 돌아온다", async ({ page }) => {
  await page.goto("/friends/");
  await page.getByRole("button", { name: "지민", exact: true }).click();
  const trigger = page.getByRole("button", { name: "친구 관리" });
  await trigger.click();
  await page.getByRole("button", { name: "차단", exact: true }).click();
  await expect(page.getByRole("button", { name: "취소", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("heading", { name: "지민", exact: true })).toBeVisible();
});

test("데모의 주요 화면 진입에 hydration 오류가 없다", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (/Hydration failed|server rendered text didn't match/i.test(message.text()))
      errors.push(message.text());
  });
  page.on("pageerror", (error) => {
    if (/Hydration failed|server rendered text didn't match/i.test(error.message))
      errors.push(error.message);
  });
  for (const [path, heading] of [
    ["/notifications/", "소식"],
    ["/", "할 일"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

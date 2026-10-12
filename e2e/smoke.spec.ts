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
  const complete = page.getByRole("button", { name: "레몬 물 주기 완료", exact: true });
  const order = await page.locator("[data-occurrence-trigger]").allTextContents();
  await complete.focus();
  await complete.press("Enter");
  const undo = page.getByRole("button", { name: "레몬 물 주기 완료 취소", exact: true });
  await expect(undo).toHaveText("완료됨");
  await expect(undo).toBeFocused();
  await expect(page.getByRole("status")).toContainText("+1 성장");
  expect(await page.locator("[data-occurrence-trigger]").allTextContents()).toEqual(order);
  await undo.click();
  await expect(page.getByRole("status")).toContainText("완료를 취소했어요");
  await page.getByRole("button", { name: "레몬 물 주기 완료", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("해냈어요");
  await expect(page.getByRole("status")).not.toContainText("성장");
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

test("친구 하루에 응원 하나를 보내고 같은 응원을 수정한다", async ({ page }) => {
  await page.goto("/friends/");
  const card = page.getByRole("article", { name: "지민의 하루" });
  await card.getByRole("button", { name: "응원 보내기", exact: true }).click();
  const composer = page.getByRole("form", { name: "지민에게 하루 응원" });
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("button", { name: "응원 보내기" })).toBeDisabled();
  await composer.getByRole("button", { name: "박수", exact: true }).click();
  await composer.getByRole("button", { name: /할 일 인용/ }).click();
  await composer.getByLabel("인용할 할 일").selectOption("101");
  await composer.getByLabel("응원글").fill("끝까지 풀었네!");
  await panel.getByRole("button", { name: "응원 보내기" }).click();
  const sent = card.getByRole("region", { name: "내가 보낸 응원" });
  await expect(sent).toContainText("보냄");
  await expect(sent).toContainText("끝까지 풀었네!");
  await expect(composer).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("응원을 보냈어요");
  await card.getByRole("button", { name: "수정", exact: true }).click();
  await expect(composer.getByLabel("응원글")).toHaveValue("끝까지 풀었네!");
  await composer.getByRole("button", { name: "레몬", exact: true }).click();
  await panel.getByRole("button", { name: "수정 저장" }).click();
  await expect(sent).toHaveCount(1);
  await expect(sent.getByRole("img", { name: "레몬", exact: true })).toBeVisible();
});

test("친구 삭제 확인은 취소에 초점을 두고 관리 버튼으로 돌아온다", async ({ page }) => {
  await page.goto("/friends/");
  await page.getByRole("button", { name: "지민", exact: true }).click();
  const trigger = page.getByRole("button", { name: "친구 관리" });
  await trigger.click();
  await page.getByRole("button", { name: "친구 삭제", exact: true }).click();
  await expect(
    page.getByText("서로의 할 일 공유가 끝나요. 다시 추가하려면 요청과 수락이 필요해요"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "취소", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("heading", { name: "지민", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /차단/ })).toHaveCount(0);
});

test("시간과 반복을 접어도 값이 남고 밀린 완료 행은 자리를 유지한다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "할 일 추가", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "할 일 추가" });
  await expect(panel.getByLabel("날짜", { exact: true })).toBeVisible();
  await expect(panel.getByLabel("시간 (선택)")).not.toBeVisible();
  await panel.getByRole("button", { name: "시간·반복 펼치기" }).click();
  await panel.getByLabel("시간 (선택)").fill("18:30");
  await panel.getByLabel("반복", { exact: true }).selectOption("weekly");
  await panel.getByRole("button", { name: "시간·반복 접기" }).click();
  await panel.getByRole("button", { name: "시간·반복 펼치기" }).click();
  await expect(panel.getByLabel("시간 (선택)")).toHaveValue("18:30");
  await expect(panel.getByLabel("반복", { exact: true })).toHaveValue("weekly");
  await panel.getByRole("button", { name: "닫기", exact: true }).click();
  await panel.getByRole("button", { name: "내용 버리기" }).click();
  const complete = page.getByRole("button", { name: "도서관 책 반납 완료", exact: true });
  await complete.focus();
  await complete.press("Enter");
  const undo = page.getByRole("button", { name: "도서관 책 반납 완료 취소", exact: true });
  await expect(undo).toBeVisible();
  await expect(undo).toBeFocused();
  await expect(page.getByRole("heading", { name: /밀린 할 일/ })).toBeVisible();
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

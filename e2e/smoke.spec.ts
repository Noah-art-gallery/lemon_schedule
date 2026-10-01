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

test("데모에서 할 일을 만들고 완료하면 펫이 축하한다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "할 일 추가" }).click();
  await page.getByRole("textbox", { name: "할 일" }).fill("레몬 물 주기");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(page.getByText("레몬 물 주기")).toBeVisible();
  await page.getByRole("button", { name: "레몬 물 주기 완료로 표시" }).click();
  await expect(page.getByRole("dialog", { name: "정말 잘했어요!" })).toBeVisible();
});

test("로그인과 회원가입 화면이 열린다", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "다시 만나서 반가워요" })).toBeVisible();
  await page.getByRole("link", { name: "회원가입" }).click();
  await expect(page.getByRole("heading", { name: "레몬 펫과 시작해요" })).toBeVisible();
  await expect(page.getByLabel("시간대")).toHaveValue(/.+/);
});

test("초대 링크의 코드를 친구 요청 화면까지 전달한다", async ({ page }) => {
  await page.goto("/signup/?invite=LEMON1234");
  await page.getByRole("link", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/login\/\?invite=LEMON1234/);
  await page.goto("/friends/?invite=LEMON1234");
  await expect(page.getByRole("textbox", { name: "친구 초대 코드" })).toHaveValue("LEMON1234");
});

test("알림을 모두 읽음으로 바꿀 수 있다", async ({ page }) => {
  await page.goto("/notifications/");
  await expect(page.getByRole("button", { name: "모두 읽음" })).toBeVisible();
  await page.getByRole("button", { name: "모두 읽음" }).click();
  await expect(page.getByText("읽음")).toHaveCount(2);
});

test("펫 도화지가 모바일에서도 열린다", async ({ page }) => {
  await page.goto("/pet/");
  await expect(page.getByRole("option", { name: /레몬 노랑/ })).toHaveAttribute("disabled", "");
  await page.getByRole("button", { name: "빈 도화지에서 그리기" }).click();
  await expect(page.getByLabel("나만의 레몬 펫을 그리는 도화지")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("친구의 완료 기록에서 반응과 응원글을 입력할 수 있다", async ({ page }) => {
  await page.goto("/friends/");
  await page.getByRole("button", { name: /엄마/ }).click();
  await page.getByRole("button", { name: "응원 보기" }).click();
  await page.getByLabel("반응").selectOption("heart");
  await page.getByRole("textbox", { name: "응원글 (선택, 120자 이하)" }).fill("잘했어!");
  await page.getByRole("button", { name: "응원 보내기" }).click();
  await expect(page.getByText("미리보기에서는 응원이 저장되지 않아요.")).toBeVisible();
});

test("친구를 바꾸면 이전 친구의 할 일이 다른 카드에 남지 않는다", async ({ page }) => {
  await page.goto("/friends/");
  await page.getByRole("button", { name: /엄마/ }).click();
  await expect(page.getByText("아침 산책")).toBeVisible();
  await page.getByRole("button", { name: /공부 친구/ }).click();
  await expect(page.getByText("함께 공부하기")).toBeVisible();
  await expect(page.getByText("아침 산책")).toHaveCount(0);
});

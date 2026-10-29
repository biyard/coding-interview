import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

const workspacePath = "/workspace/e2e";
const accounts = {
  company: "company@e2e.test",
  investor: "investor@e2e.test",
  peer: "peer@e2e.test",
} as const;

type Diagnostics = {
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
};

function observe(page: Page): Diagnostics {
  const diagnostics: Diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
  };
  page.on("console", (message) => {
    if (message.type() === "error")
      diagnostics.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "unknown failure";
    if (!failure.includes("ERR_ABORTED")) {
      diagnostics.requestFailures.push(
        `${request.method()} ${request.url()}: ${failure}`,
      );
    }
  });
  return diagnostics;
}

function expectNoBrowserErrors(diagnostics: Diagnostics) {
  expect(diagnostics.consoleErrors, "browser console errors").toEqual([]);
  expect(diagnostics.pageErrors, "uncaught page errors").toEqual([]);
  expect(diagnostics.requestFailures, "failed browser requests").toEqual([]);
}

function expectHandledConflictOnly(diagnostics: Diagnostics) {
  const conflictMessages = diagnostics.consoleErrors.filter((message) =>
    message.includes("409 (Conflict)"),
  );
  const unexpectedMessages = diagnostics.consoleErrors.filter(
    (message) => !message.includes("409 (Conflict)"),
  );
  expect(
    conflictMessages,
    "the expected revision conflict console message",
  ).toHaveLength(1);
  expect(unexpectedMessages, "unexpected browser console errors").toEqual([]);
  expect(diagnostics.pageErrors, "uncaught page errors").toEqual([]);
  expect(diagnostics.requestFailures, "failed browser requests").toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    )
    .toBe(true);
}

async function login(page: Page, email: string) {
  await page.goto("/");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("dataroom");
  await page.getByLabel("비밀번호").press("Enter");
  await expect(page).toHaveURL(new RegExp(`${workspacePath}/?$`));
  await expect(page.getByRole("heading", { name: "자료실" })).toBeVisible();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page.getByRole("button", { name: "로그인" })).toBeVisible();
}

async function openReview(page: Page) {
  await page.getByRole("link", { name: "검토" }).click();
  await expect(page).toHaveURL(
    new RegExp(`${workspacePath}/plugins/review/?$`),
  );
  await expect(
    page.getByRole("heading", { name: "검토", exact: true }),
  ).toBeVisible();
}

async function openFirstReviewEditor(page: Page) {
  await page
    .getByRole("button", { name: /검토 작성|검토 수정/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/plugins\/review\/criteria\/business$/);
  await expect(page.getByRole("heading", { name: "사업 이해" })).toBeVisible();
  await expect(page.getByLabel("의견")).toBeVisible();
}

async function selectOnlyFirstEvidence(page: Page) {
  const evidence = page.locator('input[type="checkbox"]');
  await expect(evidence.first()).toBeVisible();
  const count = await evidence.count();
  for (let index = 0; index < count; index += 1) {
    if (await evidence.nth(index).isChecked())
      await evidence.nth(index).uncheck();
  }
  await evidence.first().check();
}

function runId(testInfo: TestInfo) {
  return `${testInfo.project.name}-${Date.now()}-${testInfo.retry}`;
}

async function newObservedPage(context: BrowserContext) {
  const page = await context.newPage();
  return { page, diagnostics: observe(page) };
}

test.describe.configure({ mode: "serial" });

test("company registers, sorts, searches and opens documents; Review is read-only", async ({
  page,
}, testInfo) => {
  const diagnostics = observe(page);
  const id = runId(testInfo);
  const firstTitle = `E2E 회사 자료 ${id} A`;
  const secondTitle = `E2E 회사 자료 ${id} B`;
  const firstContent = `첫 번째 UTF-8 본문 ${id}`;
  const secondContent = `두 번째 UTF-8 본문 ${id}`;

  await login(page, accounts.company);
  await expect(page.getByText("처리 중", { exact: true })).toBeVisible();
  await expect(page.getByText("처리 실패", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "자료 등록" }).click();
  const title = page.getByLabel("제목");
  await title.fill(firstTitle);
  await page.getByLabel("파일").setInputFiles({
    name: `invalid-${id}.pdf`,
    mimeType: "application/pdf",
    buffer: Buffer.from("invalid"),
  });
  await expect(page.getByRole("alert")).toContainText(".txt 또는 .md");
  await expect(title).toHaveValue(firstTitle);

  await page.getByLabel("파일").setInputFiles({
    name: `first-${id}.md`,
    mimeType: "text/markdown",
    buffer: Buffer.from(firstContent),
  });
  await page.getByRole("button", { name: "등록", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: firstTitle })).toBeVisible();
  await expect(page.getByText(firstContent, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /자료 목록으로/ }).click();

  await page.getByRole("link", { name: "자료 등록" }).click();
  await page.getByLabel("제목").fill(secondTitle);
  await page.getByLabel("파일").setInputFiles({
    name: `second-${id}.txt`,
    mimeType: "text/plain",
    buffer: Buffer.from(secondContent),
  });
  await page.getByRole("button", { name: "등록", exact: true }).click();
  await expect(page.getByRole("heading", { name: secondTitle })).toBeVisible();
  await page.getByRole("link", { name: /자료 목록으로/ }).click();

  const rows = await page.locator("main ul > li").allTextContents();
  const firstIndex = rows.findIndex((row) => row.includes(firstTitle));
  const secondIndex = rows.findIndex((row) => row.includes(secondTitle));
  expect(firstIndex).toBeGreaterThanOrEqual(0);
  expect(secondIndex).toBeGreaterThanOrEqual(0);
  expect(secondIndex).toBeLessThan(firstIndex);

  const search = page.getByLabel("자료 제목 검색");
  await search.fill(secondTitle);
  await search.press("Enter");
  await expect(page.getByText(secondTitle, { exact: true })).toBeVisible();
  await expect(page.getByText(firstTitle, { exact: true })).toHaveCount(0);

  await page.getByText(secondTitle, { exact: true }).click();
  await expect(page.getByText(secondContent, { exact: true })).toBeVisible();
  const detailUrl = page.url();
  await page.reload();
  await expect(page).toHaveURL(detailUrl);
  await expect(page.getByText(secondContent, { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "자료실" })).toBeVisible();

  await page.goto(`${workspacePath}`);
  await openReview(page);
  await expect(
    page.getByText("기업 계정은 검토 기준만 확인할 수 있습니다."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "사업 이해" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "팀 구성" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "매출 현황" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /검토 작성|검토 수정/ }),
  ).toHaveCount(0);

  await page.goto(`${workspacePath}/plugins/review/criteria/business`);
  await expect(
    page.getByText("기업 계정은 검토 기준만 확인할 수 있습니다."),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("투자자의 비공개 검토와 진행 현황은 제공되지 않습니다."),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expectNoBrowserErrors(diagnostics);
});

test("investor writes and revisits a review while peer data stays isolated", async ({
  page,
}, testInfo) => {
  const diagnostics = observe(page);
  const id = runId(testInfo);
  const investorOpinion = `투자자 의견 ${id}`;
  const peerOpinion = `동료 의견 ${id}`;

  await login(page, accounts.investor);
  await openReview(page);
  await expect(page.getByRole("heading", { name: "검토 현황" })).toBeVisible();
  await openFirstReviewEditor(page);

  const opinion = page.getByLabel("의견");
  await opinion.fill("   ");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("의견은 공백이 아닌");
  await expect(opinion).toHaveValue("   ");

  await opinion.fill(investorOpinion);
  const evidence = page.locator('input[type="checkbox"]');
  const evidenceCount = await evidence.count();
  expect(evidenceCount).toBeGreaterThanOrEqual(2);
  for (let index = 0; index < evidenceCount; index += 1) {
    if (await evidence.nth(index).isChecked())
      await evidence.nth(index).uncheck();
  }
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("근거 자료를 하나 이상");
  await expect(opinion).toHaveValue(investorOpinion);

  await evidence.first().check();
  await page.getByLabel("판단").selectOption("needs_information");
  await page.getByRole("button", { name: "저장", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(investorOpinion, { exact: true })).toBeVisible();
  await expect(
    page.getByText("추가 확인 필요", { exact: true }).first(),
  ).toBeVisible();

  await openFirstReviewEditor(page);
  await expect(page.getByLabel("의견")).toHaveValue(investorOpinion);
  const editorUrl = page.url();
  await page.getByRole("button", { name: "자료 보기" }).first().click();
  await expect(page.getByText("근거 자료 상세", { exact: true })).toBeVisible();
  await expect(page.locator("main pre")).not.toBeEmpty();
  await page.reload();
  await expect(page.getByText("근거 자료 상세", { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(editorUrl);
  await expect(page.getByLabel("의견")).toHaveValue(investorOpinion);
  await page.goto(editorUrl);
  await page.reload();
  await expect(page.getByLabel("의견")).toHaveValue(investorOpinion);

  await logout(page);
  await login(page, accounts.peer);
  await openReview(page);
  await expect(page.getByText(investorOpinion, { exact: true })).toHaveCount(0);
  await openFirstReviewEditor(page);
  await page.getByLabel("의견").fill(peerOpinion);
  await selectOnlyFirstEvidence(page);
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText(peerOpinion, { exact: true })).toBeVisible();

  await logout(page);
  await login(page, accounts.investor);
  await openReview(page);
  await expect(page.getByText(peerOpinion, { exact: true })).toHaveCount(0);
  await expect(page.getByText(investorOpinion, { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expectNoBrowserErrors(diagnostics);
});

test("two authenticated browser contexts surface and recover from a revision conflict", async ({
  browser,
  page,
}, testInfo) => {
  const firstDiagnostics = observe(page);
  const id = runId(testInfo);
  const firstOpinion = `먼저 저장 ${id}`;
  const secondOpinion = `충돌 입력 보존 ${id}`;

  await login(page, accounts.investor);
  await openReview(page);
  await openFirstReviewEditor(page);

  const secondContext = await browser.newContext({
    baseURL: testInfo.project.use.baseURL as string,
    viewport: page.viewportSize() ?? { width: 1280, height: 720 },
  });
  const { page: secondPage, diagnostics: secondDiagnostics } =
    await newObservedPage(secondContext);
  try {
    await login(secondPage, accounts.investor);
    await openReview(secondPage);
    await openFirstReviewEditor(secondPage);

    const firstRevision = await page.getByText(/^revision \d+$/).textContent();
    await expect(
      secondPage.getByText(firstRevision ?? "missing revision"),
    ).toBeVisible();

    await page.getByLabel("의견").fill(firstOpinion);
    await selectOnlyFirstEvidence(page);
    await secondPage.getByLabel("의견").fill(secondOpinion);
    await selectOnlyFirstEvidence(secondPage);

    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText(firstOpinion, { exact: true })).toBeVisible();

    await secondPage.getByRole("button", { name: "저장", exact: true }).click();
    await expect(
      secondPage.getByText("다른 저장이 먼저 반영되었습니다."),
    ).toBeVisible();
    await expect(secondPage.getByLabel("의견")).toHaveValue(secondOpinion);
    await expect(
      secondPage.getByText(firstOpinion, { exact: true }),
    ).toBeVisible();
    await secondPage
      .getByRole("button", { name: "현재 입력으로 다시 저장" })
      .click();
    await expect(
      secondPage.getByText(secondOpinion, { exact: true }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(secondPage);
    expectHandledConflictOnly(secondDiagnostics);
  } finally {
    await secondContext.close();
  }

  await expectNoHorizontalOverflow(page);
  expectNoBrowserErrors(firstDiagnostics);
});

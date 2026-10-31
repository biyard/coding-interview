import { expect, test, type Page } from "@playwright/test";
import { login, logout, openReviewPlugin, runToken } from "./helpers";

const editorUrl = (criterionId: string) =>
  `/workspace/lighthouse/plugins/review/criteria/${criterionId}`;

/** Leaves exactly the given ready documents checked as evidence. */
async function chooseEvidence(page: Page, titles: string[]) {
  const boxes = page.getByRole("checkbox");
  await expect(boxes.first()).toBeVisible();
  for (const box of await boxes.all()) {
    if ((await box.isEnabled()) && (await box.isChecked())) await box.uncheck();
  }
  for (const title of titles)
    await page.getByRole("checkbox", { name: title, exact: true }).check();
}

async function writeReview(
  page: Page,
  criterionId: string,
  verdict: "확인함" | "추가 확인 필요",
  comment: string,
  evidence: string[],
) {
  await page.goto(editorUrl(criterionId));
  await page.getByRole("radio", { name: new RegExp(`^${verdict}`) }).check();
  await page.getByLabel("의견").fill(comment);
  await chooseEvidence(page, evidence);
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "검토를 저장했습니다." })).toBeVisible();
}

test.describe("Review Plugin (실제 API·DB)", () => {
  test("투자자는 근거를 연결해 검토를 작성·수정하고 현황에서 근거 자료로 이동한다", async ({
    page,
  }) => {
    const token = runToken();
    await login(page, "investor");
    await openReviewPlugin(page);
    await expect(page.getByRole("heading", { level: 1, name: "내 검토 현황" })).toBeVisible();

    await page
      .getByRole("region", { name: "팀 구성" })
      .getByRole("link", { name: /검토 (작성|수정)/ })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "팀 구성 검토" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /고객 인터뷰/ })).toBeDisabled();
    await expect(page.getByRole("checkbox", { name: /매출 자료/ })).toBeDisabled();

    const first = `영업 담당자 부재 확인 필요 ${token}`;
    await page.getByRole("radio", { name: /^추가 확인 필요/ }).check();
    await page.getByLabel("의견").fill(first);
    await chooseEvidence(page, ["팀 소개", "회사 소개"]);
    await page.getByRole("button", { name: "저장", exact: true }).click();

    await expect(
      page.getByRole("status").filter({ hasText: "‘팀 구성’ 검토를 저장했습니다." }),
    ).toBeVisible();
    const card = page.getByRole("region", { name: "팀 구성" });
    await expect(card).toContainText(first);
    await expect(card).toContainText("추가 확인 필요");

    // Re-opening shows the saved values; editing keeps the same review with new evidence.
    await card.getByRole("link", { name: /검토 수정/ }).click();
    await expect(page.getByLabel("의견")).toHaveValue(first);
    await expect(page.getByRole("radio", { name: /^추가 확인 필요/ })).toBeChecked();
    const second = `팀 역량은 확인, 영업은 추가 확인 ${token}`;
    await page.getByLabel("의견").fill(second);
    await chooseEvidence(page, ["팀 소개"]);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(card).toContainText(second);
    await expect(card.getByRole("link", { name: "회사 소개", exact: true })).toHaveCount(0);

    await card.getByRole("link", { name: "팀 소개", exact: true }).click();
    await expect(page).toHaveURL(/\/workspace\/lighthouse\/documents\/doc-team$/);
    await expect(page.getByRole("heading", { level: 1, name: "팀 소개" })).toBeVisible();
  });

  test("현황은 작성·미작성과 확인함·추가 확인 필요를 구분한다", async ({ page }) => {
    const token = runToken();
    await login(page, "investor");
    await writeReview(page, "business", "확인함", `구독 모델 확인 ${token}`, ["회사 소개"]);
    await writeReview(page, "team", "추가 확인 필요", `영업 확인 필요 ${token}`, ["팀 소개"]);
    await writeReview(page, "revenue", "확인함", `월 매출 확인 ${token}`, ["회사 소개"]);

    const summary = page.getByRole("region", { name: /3개 기준 중 3개 작성/ });
    await expect(summary).toBeVisible();
    const stat = (label: string) =>
      summary.locator("div", { has: page.locator("dt", { hasText: label }) }).locator("dd");
    await expect(stat("미작성")).toHaveText("0");
    await expect(stat("확인함")).toHaveText("2");
    await expect(stat("추가 확인 필요")).toHaveText("1");

    // A reload of the plugin URL (deep link) restores the same state.
    await page.reload();
    await expect(page.getByRole("region", { name: "팀 구성" })).toContainText(
      `영업 확인 필요 ${token}`,
    );
  });

  test("의견·판단·근거가 비어 있으면 저장하지 않고 해당 입력으로 이동한다", async ({ page }) => {
    await login(page, "investor");
    await page.goto(editorUrl("revenue"));
    await expect(page.getByRole("heading", { level: 1, name: "매출 현황 검토" })).toBeVisible();
    await page.getByRole("radio", { name: /^확인함/ }).check();
    await page.getByLabel("의견").fill("   \n  ");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("의견을 입력해주세요.")).toBeVisible();
    await expect(page.getByLabel("의견")).toBeFocused();

    await page.getByLabel("의견").fill("근거 없이 저장 시도");
    await chooseEvidence(page, []);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("근거 자료를 1개 이상 선택해주세요.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "매출 현황 검토" })).toBeVisible();
  });

  test("두 탭에서 같은 검토를 고치면 늦은 저장은 충돌로 알리고 입력을 지킨다", async ({
    page,
    context,
  }) => {
    const token = runToken();
    await login(page, "investor");
    await page.goto(editorUrl("business"));
    await page.getByRole("radio", { name: /^확인함/ }).check();
    await chooseEvidence(page, ["회사 소개"]);

    const other = await context.newPage();
    await other.goto(editorUrl("business"));
    await other.getByRole("radio", { name: /^확인함/ }).check();
    await other.getByLabel("의견").fill(`다른 탭 의견 ${token}`);
    await chooseEvidence(other, ["회사 소개"]);
    await other.getByRole("button", { name: "저장", exact: true }).click();
    await expect(
      other.getByRole("status").filter({ hasText: "검토를 저장했습니다." }),
    ).toBeVisible();

    const mine = `이 탭 의견 ${token}`;
    await page.getByLabel("의견").fill(mine);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("다른 곳에서 먼저 수정되었습니다");
    await expect(page.getByLabel("의견")).toHaveValue(mine);

    await page.getByRole("button", { name: "최신 내용 불러오기" }).click();
    await expect(page.getByLabel("의견")).toHaveValue(`다른 탭 의견 ${token}`);
  });

  test("사용자를 바꾸면 이전 사용자의 검토와 작성 중 입력이 보이지 않는다", async ({ page }) => {
    const token = runToken();
    await login(page, "investor");
    await writeReview(page, "team", "확인함", `투자자 비공개 의견 ${token}`, ["팀 소개"]);
    await page.goto(editorUrl("business"));
    await page.getByLabel("의견").fill(`저장하지 않은 초안 ${token}`);
    await logout(page);

    await login(page, "peer");
    await openReviewPlugin(page);
    await expect(page.getByRole("heading", { level: 1, name: "내 검토 현황" })).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText(token);
    await page.goto(editorUrl("business"));
    await expect(page.getByLabel("의견")).not.toHaveValue(new RegExp(token));
    await logout(page);

    await login(page, "company");
    await openReviewPlugin(page);
    await expect(page.getByRole("note")).toContainText(
      "검토 작성과 현황 확인은 투자자만 할 수 있습니다.",
    );
    await expect(page.getByRole("heading", { level: 2, name: "사업 이해" })).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText(token);
    await page.goto(editorUrl("team"));
    await expect(page.getByRole("alert")).toContainText("검토 작성은 투자자만 할 수 있습니다.");
  });
});

const draftReply = (token: string) => ({
  criterionId: "revenue",
  verdict: "needs_information",
  comment: `AI 초안: 회사 소개에 매출 근거가 부족합니다 ${token}`,
  evidence: [{ documentId: "doc-business", title: "회사 소개" }],
  discardedEvidenceCount: 1,
  consideredDocumentCount: 2,
  omittedDocumentCount: 0,
  model: "claude-opus-5-5",
});

/** Answers `draftReview` with the given replies in order; every other RPC reaches the real API. */
async function mockDraft(
  page: Page,
  replies: Array<{ status: number; body: unknown; delayMs?: number }>,
) {
  const queue = [...replies];
  await page.route("**/api/plugins/rpc", async (route) => {
    if (route.request().postDataJSON()?.method !== "draftReview") return route.continue();
    const reply = queue.shift() ?? replies[replies.length - 1];
    if (reply.delayMs) await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
    await route.fulfill({
      status: reply.status,
      contentType: "application/json",
      body: JSON.stringify(reply.body),
    });
  });
}

test.describe("AI 검토 초안 (AI 응답은 route로 모의, 저장·현황은 실제 API·DB)", () => {
  test("초안은 입력란만 채우고, 되돌릴 수 있으며, 저장해야 현황에 반영된다", async ({
    page,
    context,
  }) => {
    const token = runToken();
    const draft = draftReply(token);
    await mockDraft(page, [{ status: 200, body: { result: draft }, delayMs: 400 }]);
    await login(page, "peer");
    await page.goto(editorUrl("revenue"));
    const memo = `직접 쓰던 메모 ${token}`;
    await page.getByLabel("의견").fill(memo);

    await page.getByRole("button", { name: "AI 초안으로 바꾸기" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "초안을 만들고 있습니다" }),
    ).toBeVisible();
    await expect(page.getByLabel("의견")).toBeDisabled();

    const applied = page.getByRole("status").filter({ hasText: "AI 초안을 입력란에 채웠습니다" });
    await expect(applied).toContainText("참고한 자료 2개");
    await expect(applied).toContainText("1개는 서버에서 제외했습니다");
    await expect(applied).toContainText("제안한 근거 자료: 회사 소개");
    await expect(page.getByLabel("의견")).toHaveValue(draft.comment);
    await expect(page.getByRole("radio", { name: /^추가 확인 필요/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /회사 소개.*AI 제안/ })).toBeChecked();

    // Nothing reached the server yet: progress in another tab does not show the draft.
    const overview = await context.newPage();
    await overview.goto("/workspace/lighthouse/plugins/review");
    await expect(overview.getByRole("region", { name: "매출 현황" })).toBeVisible();
    await expect(overview.getByRole("main")).not.toContainText(token);
    await overview.close();

    await page.getByRole("button", { name: "초안 적용 전으로 되돌리기" }).click();
    await expect(page.getByLabel("의견")).toHaveValue(memo);

    await page.getByRole("button", { name: "AI 초안으로 바꾸기" }).click();
    await expect(page.getByLabel("의견")).toHaveValue(draft.comment);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "‘매출 현황’ 검토를 저장했습니다." }),
    ).toBeVisible();
    const card = page.getByRole("region", { name: "매출 현황" });
    await expect(card).toContainText(draft.comment);
    await expect(card.getByRole("link", { name: "회사 소개", exact: true })).toBeVisible();
  });

  test("초안 생성이 실패하면 다시 시도할 수 있고, 직접 작성은 계속 된다", async ({ page }) => {
    const token = runToken();
    const draft = draftReply(token);
    await mockDraft(page, [
      { status: 502, body: { kind: "ai_failed", message: "mocked" } },
      { status: 200, body: { result: draft } },
    ]);
    await login(page, "peer");
    await page.goto(editorUrl("revenue"));

    // The label says "replace" when an earlier run already saved this review.
    await page.getByRole("button", { name: /^AI 초안(으로 바꾸기| 만들기)$/ }).click();
    const failure = page.getByRole("alert");
    await expect(failure).toContainText("AI 초안을 만들지 못했습니다.");
    await expect(failure).toContainText("직접 작성은 그대로 할 수 있습니다.");
    await failure.getByRole("button", { name: "다시 시도" }).click();
    await expect(page.getByLabel("의견")).toHaveValue(draft.comment);

    // A server without an API key: no retry offered, and the manual flow still saves.
    await page.unroute("**/api/plugins/rpc");
    await mockDraft(page, [{ status: 503, body: { kind: "ai_unavailable", message: "mocked" } }]);
    await page.reload();
    await page.getByRole("button", { name: /AI 초안/ }).click();
    await expect(page.getByRole("alert")).toContainText("AI 초안 기능이 설정되어 있지 않습니다");
    await expect(page.getByRole("button", { name: "다시 시도" })).toHaveCount(0);

    const manual = `AI 없이 직접 작성 ${token}`;
    await page.getByRole("radio", { name: /^확인함/ }).check();
    await page.getByLabel("의견").fill(manual);
    await chooseEvidence(page, ["회사 소개"]);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByRole("region", { name: "매출 현황" })).toContainText(manual);
  });
});

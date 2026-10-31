import { expect, test, type Page } from "@playwright/test";
import { login, runToken, uploadDocument } from "./helpers";

const documentList = (page: Page) => page.getByRole("main").getByRole("listitem");

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
}

test.describe("데이터룸 자료 (실제 API·DB)", () => {
  test("기업 담당자는 자료를 등록하고 상세·새로고침·목록·검색에서 확인한다", async ({ page }) => {
    const token = runToken();
    const title = `E2E 매출 보완 ${token}`;
    const fileName = `revenue-${token}.md`;
    await login(page, "company");
    await uploadDocument(page, title, fileName, "# 매출 현황\n\n- 월 구독 매출: 600만 원");

    await expect(
      page.getByRole("status").filter({ hasText: "자료를 등록했습니다." }),
    ).toBeVisible();
    await expect(page.getByText(fileName)).toBeVisible();
    await expect(page.getByText("준비 완료")).toBeVisible();
    await expect(page.locator("pre")).toContainText("- 월 구독 매출: 600만 원");

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

    await page.getByRole("link", { name: /자료 목록으로/ }).click();
    await expect(documentList(page).first()).toContainText(title);

    await page.getByLabel("제목 검색").fill(token);
    await expect(page).toHaveURL(new RegExp(`\\?q=${token}$`));
    await expect(documentList(page)).toHaveCount(1);
    await page.reload();
    await expect(page.getByLabel("제목 검색")).toHaveValue(token);
    await expect(documentList(page)).toHaveCount(1);

    await page.getByLabel("제목 검색").fill(`없는제목${token}`);
    await expect(page.getByText(`‘없는제목${token}’ 제목의 자료가 없습니다.`)).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("등록 폼은 빈 제목·잘못된 확장자·UTF-8이 아닌 파일을 전송 전에 막는다", async ({ page }) => {
    await login(page, "company");
    await page.goto("/workspace/lighthouse/documents/new");
    await page.getByRole("button", { name: "등록", exact: true }).click();
    await expect(page.getByText("제목을 입력해주세요.")).toBeVisible();
    await expect(page.getByText("파일을 선택해주세요.")).toBeVisible();
    await expect(page.getByLabel("파일")).toBeFocused();

    await page.getByLabel("파일").setInputFiles({
      name: "report.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF"),
    });
    await expect(page.getByText(".txt 또는 .md 파일만 등록할 수 있습니다.")).toBeVisible();

    // "café" encoded as Latin-1 is not valid UTF-8.
    await page.getByLabel("파일").setInputFiles({
      name: "latin1.txt",
      mimeType: "text/plain",
      buffer: Buffer.from([0x63, 0x61, 0x66, 0xe9]),
    });
    await expect(
      page.getByText("UTF-8로 인코딩된 텍스트 파일만 등록할 수 있습니다."),
    ).toBeVisible();
  });

  test("등록이 실패하면 입력을 보존하고 다시 시도할 수 있다 (서버 실패는 route로 모의)", async ({
    page,
  }) => {
    const token = runToken();
    const title = `재시도 자료 ${token}`;
    await login(page, "company");
    await page.goto("/workspace/lighthouse/documents/new");
    await page.getByLabel("파일").setInputFiles({
      name: `retry-${token}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from("재시도 본문", "utf8"),
    });
    await page.getByLabel("제목").fill(title);

    await page.route("**/api/dataroom/rpc", (route) =>
      route.request().postDataJSON()?.method === "createDocument"
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ kind: "storage_error", message: "mocked" }),
          })
        : route.continue(),
    );
    await page.getByRole("button", { name: "등록", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("자료를 등록하지 못했습니다.");
    await expect(page.getByLabel("제목")).toHaveValue(title);
    await expect(page.getByText(`retry-${token}.txt`)).toBeVisible();

    await page.unroute("**/api/dataroom/rpc");
    await page.getByRole("button", { name: "등록", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  });

  test("목록 조회 실패를 빈 목록으로 표시하지 않는다 (서버 실패는 route로 모의)", async ({
    page,
  }) => {
    await login(page, "investor");
    await page.route("**/api/dataroom/rpc", (route) =>
      route.request().postDataJSON()?.method === "listDocuments"
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ kind: "storage_error", message: "mocked" }),
          })
        : route.continue(),
    );
    await page.reload();
    await expect(page.getByRole("alert")).toContainText("자료 목록을 불러오지 못했습니다.");
    await expect(page.getByText("아직 등록된 자료가 없습니다.")).toHaveCount(0);

    await page.unroute("**/api/dataroom/rpc");
    await page.getByRole("button", { name: "다시 시도" }).click();
    await expect(documentList(page).filter({ hasText: "회사 소개" })).toHaveCount(1);
  });

  test("투자자는 자료와 상태를 볼 수 있지만 등록할 수 없다", async ({ page }) => {
    await login(page, "investor");
    await expect(page.getByRole("heading", { level: 1, name: "라이트하우스" })).toBeVisible();
    await expect(page.getByText("소규모 제조사를 위한 재고 관리 소프트웨어")).toBeVisible();
    await expect(page.getByRole("link", { name: "자료 등록" })).toHaveCount(0);
    await expect(documentList(page).filter({ hasText: "매출 자료" })).toContainText("처리 실패");
    await expect(documentList(page).filter({ hasText: "고객 인터뷰" })).toContainText("처리 중");
    await expectNoHorizontalScroll(page);

    await page.goto("/workspace/lighthouse/documents/new");
    await expect(page.getByRole("alert")).toContainText(
      "자료 등록은 기업 담당자만 할 수 있습니다.",
    );

    await page.goto("/workspace/lighthouse/documents/doc-does-not-exist");
    await expect(page.getByRole("alert")).toContainText(
      "존재하지 않거나 이 데이터룸에 없는 자료입니다.",
    );
  });
});

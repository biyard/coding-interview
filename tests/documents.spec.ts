import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers/auth";

const LIST = "/workspace/lighthouse";
const detail = (id: string) => `${LIST}/documents/${id}`;
const CLOSE = "닫기";
const ROOM_NAME = "라이트하우스";

/** 목록 화면을 열고 이름이 일치하는 자료를 선택해 모달을 연다. */
async function openFromList(page: Page, name: RegExp) {
  await page.goto(LIST);
  await page.getByRole("link", { name }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("자료 조회 — 같은 데이터룸의 자료를 목록, 제목 검색, 상세로 확인한다", () => {
  test.describe("목록", () => {
    /**
     * @spec DoD-6
     * @given 투자자로 로그인했다
     * @when 데이터룸 목록 화면(/workspace/:id)을 연다
     * @then 각 자료의 제목·파일명·상태·작성 시각(브라우저 로컬 포맷)이 표시된다
     */
    test("[DoD-6] 목록에 자료의 제목·파일명·상태·작성 시각이 표시된다", async ({ page }) => {
      await page.goto(LIST);
      const link = page.getByRole("link", { name: /회사 소개/ });
      await expect(link).toBeVisible();
      await expect(link).toContainText("company-overview.md");
      await expect(link).toContainText("사용 가능");
      const time = link.locator("time");
      await expect(time).toBeVisible();
      // 시간대·포맷에 의존하지 않고, ISO 원문이 그대로 노출되지 않는지만 확인한다.
      await expect(time).not.toHaveText(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
      await expect(time).toHaveText(/\d/);
      const failed = page.getByRole("link", { name: /매출 자료/ });
      await expect(failed).toContainText("revenue.txt");
      await expect(failed).toContainText("실패");
      const processing = page.getByRole("link", { name: /고객 인터뷰/ });
      await expect(processing).toContainText("customer-interviews.md");
      await expect(processing).toContainText("처리 중");
    });
  });

  test.describe("검색", () => {
    /**
     * @spec DoD-7
     * @given 투자자로 로그인했고 데이터룸 목록 화면을 열었다
     * @when 검색어를 입력한다
     * @then 제목이 일치하는 자료만 목록에 남고 URL의 ?q=에 검색어가 반영된다
     */
    test("[DoD-7] 검색어와 일치하는 자료만 남고 URL에 ?q=가 반영된다", async ({ page }) => {
      await page.goto(LIST);
      await expect(page.getByRole("link", { name: /회사 소개/ })).toBeVisible();
      await page.getByLabel("제목으로 검색").fill("팀 소개");
      await expect(page).toHaveURL(/[?&]q=/);
      expect(new URL(page.url()).searchParams.get("q")).toBe("팀 소개");
      await expect(page.getByRole("link", { name: /팀 소개/ })).toBeVisible();
      await expect(page.getByRole("link", { name: /회사 소개/ })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /매출 자료/ })).toHaveCount(0);
    });
  });

  test.describe("상세 모달 — 열기", () => {
    /**
     * @spec DoD-8 DoD-11
     * @given 투자자로 로그인했고 데이터룸 목록 화면을 열었다
     * @when 목록에서 자료를 선택한다
     * @then /workspace/:id/documents/:documentId로 이동한다
     * @then 목록이 뒤에 유지된 채 모달(role="dialog")에 제목·파일명·상태·작성 시각·본문이 표시된다
     * @then 모달에 현재 워크스페이스의 데이터룸 이름이 표시된다
     */
    test("[DoD-8][DoD-11] 목록에서 선택하면 목록 위 모달에 제목·파일명·상태·작성 시각·본문과 데이터룸 이름이 표시된다", async ({
      page,
    }) => {
      await page.goto(LIST);
      await page.getByRole("link", { name: /회사 소개/ }).click();
      await expect(page).toHaveURL(new RegExp(`${detail("doc-business")}$`));
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("heading", { name: "회사 소개" })).toBeVisible();
      await expect(dialog).toContainText("company-overview.md");
      await expect(dialog).toContainText("사용 가능");
      await expect(dialog).toContainText("제조사 재고 관리 구독형 소프트웨어");
      // 시간대·포맷에 의존하지 않고 시각이 표시되는지만 확인한다.
      await expect(dialog.locator("time")).toHaveText(/\d/);
      await expect(dialog).toContainText(ROOM_NAME);
      // 목록은 뒤에 유지된다.
      await expect(page.getByRole("link", { name: /팀 소개/ })).toBeVisible();
      await expect(page.getByRole("link", { name: /매출 자료/ })).toBeVisible();
    });

    /**
     * @spec DoD-9
     * @given 투자자로 로그인했고 목록에서 자료를 선택해 모달이 열려 있다
     * @when 새로고침한다
     * @then 제목·본문이 표시된 같은 모달이 열리고 뒤에 목록이 표시된다
     */
    test("[DoD-9] 상세 주소에서 새로고침해도 같은 모달이 열리고 뒤에 목록이 표시된다", async ({
      page,
    }) => {
      const dialog = await openFromList(page, /팀 소개/);
      await expect(dialog).toContainText("전담 영업 담당자는 없음");
      await page.reload();
      await expect(page).toHaveURL(new RegExp(`${detail("doc-team")}$`));
      const reopened = page.getByRole("dialog");
      await expect(reopened).toBeVisible();
      await expect(reopened.getByRole("heading", { name: "팀 소개" })).toBeVisible();
      await expect(reopened).toContainText("전담 영업 담당자는 없음");
      await expect(page.getByRole("link", { name: /회사 소개/ })).toBeVisible();
    });

    /**
     * @spec DoD-9
     * @given 투자자로 로그인했다
     * @when 자료 상세 주소로 직접 진입한다
     * @then 제목·본문이 표시된 같은 모달이 열리고 뒤에 목록이 표시된다
     */
    test("[DoD-9] 상세 주소로 직접 진입해도 같은 모달이 열리고 뒤에 목록이 표시된다", async ({
      page,
    }) => {
      await page.goto(detail("doc-business"));
      await expect(page).toHaveURL(new RegExp(`${detail("doc-business")}$`));
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("heading", { name: "회사 소개" })).toBeVisible();
      await expect(dialog).toContainText("제조사 재고 관리 구독형 소프트웨어");
      await expect(page.getByRole("link", { name: /팀 소개/ })).toBeVisible();
    });

    /**
     * @spec DoD-16
     * @given 투자자로 로그인했고 검색어를 입력해 목록을 검색했다
     * @when 검색된 목록에서 자료를 선택해 모달을 연다
     * @then 모달의 URL에 같은 ?q=가 유지된다
     * @then 뒤의 목록은 같은 검색 결과이다
     */
    test("[DoD-16] 검색한 목록에서 연 모달의 URL에 ?q=가 유지되고 뒤의 목록이 같은 검색 결과이다", async ({
      page,
    }) => {
      await page.goto(LIST);
      await expect(page.getByRole("link", { name: /회사 소개/ })).toBeVisible();
      await page.getByLabel("제목으로 검색").fill("팀 소개");
      await expect(page).toHaveURL(/[?&]q=/);
      await expect(page.getByRole("link", { name: /회사 소개/ })).toHaveCount(0);
      await page.getByRole("link", { name: /팀 소개/ }).click();
      await expect(page).toHaveURL(new RegExp(`${detail("doc-team")}\\?`));
      expect(new URL(page.url()).searchParams.get("q")).toBe("팀 소개");
      await expect(page.getByRole("dialog")).toBeVisible();
      // 뒤의 목록은 같은 검색 결과다.
      await expect(page.getByRole("link", { name: /팀 소개/ })).toBeVisible();
      await expect(page.getByRole("link", { name: /회사 소개/ })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /매출 자료/ })).toHaveCount(0);
    });
  });

  test.describe("상세 모달 — 닫기", () => {
    /**
     * @spec DoD-16
     * @given 투자자로 로그인했고 검색한 목록에서 모달을 열었다
     * @when 모달을 닫는다
     * @then 같은 검색어의 목록으로 돌아간다
     */
    test("[DoD-16] 검색한 목록에서 연 모달을 닫으면 같은 검색어의 목록으로 돌아간다", async ({
      page,
    }) => {
      await page.goto(LIST);
      await expect(page.getByRole("link", { name: /회사 소개/ })).toBeVisible();
      await page.getByLabel("제목으로 검색").fill("팀 소개");
      await expect(page).toHaveURL(/[?&]q=/);
      await page.getByRole("link", { name: /팀 소개/ }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: CLOSE }).click();
      await expect(dialog).toBeHidden();
      await expect(page).toHaveURL(new RegExp(`${LIST}\\?`));
      expect(new URL(page.url()).searchParams.get("q")).toBe("팀 소개");
      await expect(page.getByLabel("제목으로 검색")).toHaveValue("팀 소개");
      await expect(page.getByRole("link", { name: /팀 소개/ })).toBeVisible();
      await expect(page.getByRole("link", { name: /회사 소개/ })).toHaveCount(0);
    });

    /**
     * @spec DoD-12
     * @given 투자자로 로그인했고 자료 상세 모달이 열려 있다
     * @when 모달의 닫기 버튼을 누른다
     * @then 모달이 닫힌다
     * @then URL이 목록(/workspace/:id)으로 돌아간다
     */
    test("[DoD-12] 닫기 버튼을 누르면 모달이 닫히고 URL이 목록으로 돌아간다", async ({ page }) => {
      const dialog = await openFromList(page, /회사 소개/);
      await dialog.getByRole("button", { name: CLOSE }).click();
      await expect(dialog).toBeHidden();
      await expect(page).toHaveURL(new RegExp(`${LIST}$`));
      await expect(page.getByRole("link", { name: /회사 소개/ })).toBeVisible();
    });

    /**
     * @spec DoD-13 DoD-14
     * @given 투자자로 로그인했고 desktop 폭이며 자료 상세 모달이 열려 있다. 닫는 방법(ESC, 배경 클릭)을 하나씩 반복한다
     * @when 모달을 닫는다
     * @then 모달이 닫힌다
     * @then URL이 목록으로 돌아간다
     */
    test("[DoD-13][DoD-14] ESC 키나 모달 바깥 클릭으로 모달이 닫히고 URL이 목록으로 돌아간다", async ({
      page,
    }) => {
      test.skip(test.info().project.name !== "desktop", "desktop 폭에서만 의미가 있다");
      const methods = [
        { label: "ESC", close: () => page.keyboard.press("Escape") },
        // 모달(화면 중앙) 바깥인 좌상단 배경을 누른다.
        { label: "배경 클릭", close: () => page.mouse.click(5, 5) },
      ];
      for (const method of methods) {
        const dialog = await openFromList(page, /회사 소개/);
        await method.close();
        await expect(dialog, method.label).toBeHidden();
        await expect(page, method.label).toHaveURL(new RegExp(`${LIST}$`));
      }
    });

    /**
     * @spec DoD-15
     * @given 투자자로 로그인했고 desktop 폭이며 목록의 한 항목으로 모달을 열었다. 닫는 방법(닫기 버튼, ESC, 배경 클릭)을 하나씩 반복한다
     * @when 모달을 닫는다
     * @then 포커스가 모달을 열었던 목록 항목으로 돌아간다
     */
    test("[DoD-15] 모달이 닫히면 포커스가 모달을 열었던 목록 항목으로 돌아간다", async ({
      page,
    }) => {
      test.skip(test.info().project.name !== "desktop", "desktop 폭에서만 의미가 있다");
      const methods = [
        {
          label: "닫기 버튼",
          close: () => page.getByRole("dialog").getByRole("button", { name: CLOSE }).click(),
        },
        { label: "ESC", close: () => page.keyboard.press("Escape") },
        { label: "배경 클릭", close: () => page.mouse.click(5, 5) },
      ];
      for (const method of methods) {
        const dialog = await openFromList(page, /회사 소개/);
        await method.close();
        await expect(dialog, method.label).toBeHidden();
        await expect(page.getByRole("link", { name: /회사 소개/ }), method.label).toBeFocused();
      }
    });
  });

  test.describe("상세 모달 — 모바일 폭", () => {
    /**
     * @spec DoD-18
     * @given 투자자로 로그인했고 모바일 폭에서 뷰포트 높이를 줄여 짧은 시드 본문도 넘치게 했다
     * @when 자료 상세 모달을 연다
     * @then 모달이 화면 안에 들어온다
     * @then 본문 영역만 스크롤된다
     */
    test("[DoD-18] 모바일 폭에서 모달이 화면 안에 들어오고 본문 영역만 스크롤된다", async ({
      page,
    }) => {
      test.skip(test.info().project.name !== "mobile", "모바일 폭에서만 의미가 있다");
      const viewport = { width: 412, height: 220 };
      // 높이를 줄여 짧은 시드 본문도 넘치게 만든다.
      await page.setViewportSize(viewport);
      await page.goto(detail("doc-business"));
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("제조사 재고 관리 구독형 소프트웨어");
      // 모달이 화면 안에 들어온다.
      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      // 본문 영역(본문 제목의 부모)만 스크롤된다.
      const body = dialog
        .getByRole("heading", { level: 3, name: "본문", includeHidden: true })
        .locator("..");
      const overflowing = await body.evaluate((el) => el.scrollHeight > el.clientHeight);
      expect(overflowing).toBe(true);
      await body.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      const dialogScrolls = await dialog.evaluate((el) => ({
        overflow: el.scrollHeight > el.clientHeight,
        top: el.scrollTop,
      }));
      expect(dialogScrolls).toEqual({ overflow: false, top: 0 });
    });
  });

  test.describe("상세 모달 — ready가 아닌 자료", () => {
    /**
     * @spec EC-8
     * @given 투자자로 로그인했고 상태가 processing인 자료와 failed인 자료를 하나씩 반복한다
     * @when 해당 자료의 상세 모달을 연다
     * @then "근거로 연결할 수 없음" 안내(role="note")가 표시된다
     * @then 본문이 함께 표시된다
     */
    test("[EC-8] processing·failed 자료의 상세 모달에 근거로 연결할 수 없음 안내와 본문이 표시된다", async ({
      page,
    }) => {
      const cases = [
        { id: "doc-pipeline", title: "고객 인터뷰", content: "아직 준비되지 않았습니다." },
        { id: "doc-revenue", title: "매출 자료", content: "자료를 읽지 못했습니다." },
      ];
      for (const c of cases) {
        await page.goto(detail(c.id));
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByRole("heading", { name: c.title }), c.id).toBeVisible();
        await expect(dialog.getByRole("note"), c.id).toContainText("근거로 연결할 수 없음");
        await expect(dialog, c.id).toContainText(c.content);
      }
    });
  });

  test.describe("상세 모달 — 조회 중·없음·실패", () => {
    /**
     * @spec EC-11
     * @given 투자자로 로그인했고 documents.get 응답이 지연된다
     * @when 목록에서 자료를 선택한다
     * @then 모달이 열린 채 본문 자리에 로딩 표시가 나타난다
     * @then 닫기 버튼을 누르면 모달이 닫히고 URL이 목록으로 돌아간다
     */
    test("[EC-11] 자료 조회 중에는 모달이 열린 채 로딩이 표시되고 닫기 버튼이 동작한다", async ({
      page,
    }) => {
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      // 자료 조회(documents.get)만 지연시키고 나머지 요청은 실제 서버로 보낸다.
      await page.route("**/api/dataroom/rpc", async (route) => {
        const body = route.request().postDataJSON() as { method?: string } | null;
        if (body?.method === "documents.get") await gate;
        await route.continue().catch(() => {});
      });
      try {
        await page.goto(LIST);
        await page.getByRole("link", { name: /회사 소개/ }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("status")).toBeVisible();
        await dialog.getByRole("button", { name: CLOSE }).click();
        await expect(dialog).toBeHidden();
        await expect(page).toHaveURL(new RegExp(`${LIST}$`));
      } finally {
        release();
      }
    });

    /**
     * @spec EC-12
     * @given 투자자로 로그인했고 없는 자료 ID만 다룬다(다른 workspace 자료는 EC-6 Rust 통합 테스트가 덮는다)
     * @when 존재하지 않는 자료 ID의 상세 주소로 직접 진입한다
     * @then 모달 안에 "찾을 수 없음" 상태가 표시된다
     */
    test("[EC-12] 없는 자료 ID로 직접 진입하면 모달 안에 찾을 수 없음 상태가 표시된다", async ({
      page,
    }) => {
      await page.goto(detail("doc-does-not-exist"));
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("alert")).toContainText("존재하지 않는 자료입니다.");
    });

    /**
     * @spec EC-13 EC-14
     * @given 투자자로 로그인했고 documents.get이 404가 아닌 오류로 계속 실패하다가, 사용자가 재시도 버튼을 누른 뒤부터 성공한다
     * @when 자료 상세 모달을 열고 재시도 버튼을 누른다
     * @then 모달 안에 오류와 재시도 버튼이 표시된다
     * @then "자료 없음"(404 상태)으로 표시되지 않는다
     * @then 재시도하면 성공 시 본문이 표시된다
     */
    test("[EC-13][EC-14] 조회 실패는 자료 없음이 아닌 오류와 재시도로 표시되고 재시도하면 본문이 표시된다", async ({
      page,
    }) => {
      let succeed = false;
      // documents.get은 재시도 버튼을 누르기 전까지 500으로 계속 실패한다.
      await page.route("**/api/dataroom/rpc", async (route) => {
        const body = route.request().postDataJSON() as { method?: string } | null;
        if (body?.method === "documents.get" && !succeed) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ kind: "storage_error", message: "mocked failure" }),
          });
        } else {
          await route.continue();
        }
      });
      await page.goto(LIST);
      await page.getByRole("link", { name: /회사 소개/ }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("alert")).toContainText("자료를 불러오지 못했습니다");
      await expect(dialog.getByRole("button", { name: "다시 시도" })).toBeVisible();
      await expect(dialog.getByText("존재하지 않는 자료입니다.")).toHaveCount(0);
      succeed = true;
      await dialog.getByRole("button", { name: "다시 시도" }).click();
      await expect(dialog).toContainText("제조사 재고 관리 구독형 소프트웨어");
      await expect(dialog.getByRole("alert")).toHaveCount(0);
    });
  });

  test.describe("목록 조회 실패", () => {
    /**
     * @spec EC-9
     * @given 투자자로 로그인했고 검색어를 입력했으며 목록 조회 요청이 오류 응답으로 실패한다
     * @when 목록 화면에서 자료를 조회한다
     * @then "자료 없음"이 아닌 오류가 표시되고 입력한 검색어가 보존된다
     */
    test("[EC-9] 목록 조회가 실패하면 오류가 표시되고 검색어가 보존된다", async ({ page }) => {
      // 목록 조회(documents.list)만 500으로 실패시키고 나머지 요청은 실제 서버로 보낸다.
      await page.route("**/api/dataroom/rpc", async (route) => {
        const body = route.request().postDataJSON() as { method?: string } | null;
        if (body?.method === "documents.list") {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ kind: "storage_error", message: "mocked failure" }),
          });
        } else {
          await route.continue();
        }
      });
      await page.goto(LIST);
      const search = page.getByLabel("제목으로 검색");
      await search.fill("팀 소개");
      await expect(page).toHaveURL(/[?&]q=/);
      // 재시도를 거친 뒤 오류가 표시된다.
      await expect(page.getByRole("alert")).toContainText("자료를 불러오지 못했습니다", {
        timeout: 20_000,
      });
      await expect(page.getByText("아직 등록된 자료가 없습니다.")).toHaveCount(0);
      await expect(page.getByText("검색 결과가 없습니다.")).toHaveCount(0);
      await expect(search).toHaveValue("팀 소개");
    });
  });

  test.describe("빈 검색 결과", () => {
    /**
     * @spec EC-10
     * @given 투자자로 로그인했고 데이터룸 목록 화면을 열었다
     * @when 어떤 자료의 제목과도 일치하지 않는 검색어를 입력한다
     * @then 오류나 로딩이 아닌 빈 결과 문구가 표시된다
     */
    test("[EC-10] 검색 결과가 없으면 빈 결과 문구가 표시된다", async ({ page }) => {
      await page.goto(LIST);
      await expect(page.getByRole("link", { name: /회사 소개/ })).toBeVisible();
      await page.getByLabel("제목으로 검색").fill("zzz-일치하는-자료-없음");
      await expect(page.getByText("검색 결과가 없습니다.")).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
      await expect(page.getByRole("status")).toHaveCount(0);
      await expect(page.getByRole("link", { name: /회사 소개/ })).toHaveCount(0);
    });
  });
});

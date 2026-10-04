// 대상 스펙: docs/specs/dataroom-document-view.md (자료 조회, 자료 상세 모달 및 Review Plugin 근거 미리보기 모달)
// 이 파일의 DoD-N은 위 스펙의 번호다. 다른 Plugin 테스트 파일(tests/review-write*.spec.ts)의 DoD-N·EC-N은
// 다른 스펙(docs/specs/review-write.md 등)의 번호이므로 구분한다. 그래서 case 제목에 스펙 접두를 붙인다.
//
// 이 스펙의 나머지 항목은 이 파일에 case가 없다.
// - 이 스펙의 DoD-19(Plugin 미리보기 모달의 시각 디자인 일치)는 사람이 두 모달을 스크린샷으로 나란히 확인한다.
// - 이 스펙의 DoD-21과 EC-15는 기존 Plugin 테스트(tests/review-write.update.status.spec.ts, tests/review-write.update.spec.ts,
//   tests/review-write.spec.ts의 미리보기 관련 case)를 수정 없이 통과시켜 검증한다.
// - 이 스펙의 DoD-22는 tests/review-write.spec.ts의 기존 미리보기 내용 표시 case(그 파일의 DoD-13 표기)를 새 구조 기준으로
//   갱신해 덮는다. 그 파일의 번호 체계는 다른 스펙의 것이라 이번 스펙 태그를 달지 않는다.
import { expect, test } from "@playwright/test";
import { INVESTOR, login } from "./helpers/auth";

const PLUGIN = "/workspace/lighthouse/plugins/review";
// 저장하지 않는 기준(매출 현황)의 작성 폼에서 시드 ready 자료 doc-business(회사 소개)를 미리본다.
const REVENUE_ID = "revenue";
const REVENUE_TITLE = "매출 현황";
const DOC_TITLE = "회사 소개";
const DOC_CONTENT = "제조사 재고 관리 구독형 소프트웨어";

test.describe("Plugin 근거 미리보기 모달 — 모바일 폭에서 화면 안에 들어오고 본문 박스만 스크롤된다", () => {
  /**
   * @spec DoD-20
   * @given 투자자로 로그인했고 모바일 폭에서 뷰포트 높이를 줄여 짧은 시드 본문도 넘치게 했으며, 저장 데이터가 필요 없는 기준 폼을 열었다
   * @when 폼에서 근거 자료 미리보기 모달을 연다
   * @then 모달이 화면 안에 들어온다
   * @then 본문 박스만 스크롤되고 모달 자체는 스크롤되지 않는다
   */
  test("[dataroom-document-view DoD-20] 모바일 폭에서 Plugin 미리보기 모달이 화면 안에 들어오고 본문 박스만 스크롤된다", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "mobile", "모바일 폭에서만 의미가 있다");
    const viewport = { width: 412, height: 220 };
    // 높이를 줄여 짧은 시드 본문도 넘치게 만든다.
    await page.setViewportSize(viewport);
    await login(page, INVESTOR);
    await page.goto(`${PLUGIN}/criteria/${REVENUE_ID}`);
    const form = page.getByRole("dialog", { name: `${REVENUE_TITLE} 검토 작성`, exact: true });
    await expect(form).toBeVisible();
    await form.getByRole("button", { name: `${DOC_TITLE} 미리보기 열기` }).click();
    // 중첩 모달에서는 아래 dialog가 inert라 includeHidden으로 이름을 찾는다.
    const preview = page.getByRole("dialog", {
      name: `${DOC_TITLE} 미리보기`,
      exact: true,
      includeHidden: true,
    });
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(DOC_CONTENT);
    // 모달이 화면 안에 들어온다.
    const box = await preview.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    // 본문 박스(본문 제목의 부모)만 스크롤된다.
    const body = preview
      .getByRole("heading", { level: 3, name: "본문", includeHidden: true })
      .locator("..");
    expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await body.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    const dialogScroll = await preview.evaluate((el) => ({
      overflow: el.scrollHeight > el.clientHeight,
      top: el.scrollTop,
    }));
    expect(dialogScroll).toEqual({ overflow: false, top: 0 });
  });
});

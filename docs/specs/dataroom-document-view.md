# 스펙: 자료 조회 화면·기능

- 상태: 완료
- 최종 갱신: 2026-10-04

## 1. 목표
기업 담당자와 투자자가 같은 데이터룸(workspace)의 자료를 목록, 제목 검색, 상세로 조회한다. 투자자는 이 자료를 근거로 검토를 작성한다. 샘플 시드 데이터가 있으므로 등록보다 조회를 먼저 구현한다. 범위는 DB 마이그레이션·시드(샘플 4건), `dataroom` RPC(목록/상세), 화면(목록·검색·상세)이다. [사용자 결정]

2026-10-04 변경: 자료 상세를 별도 페이지가 아닌 목록 위에 겹치는 모달로 보여준다. 모달은 제목·파일명·상태·작성 시각·본문과 데이터룸 이름을 표시하며, 상세 URL은 유지한다. 서버(API·DB)는 변경하지 않는다. [사용자 결정]

2026-10-04 추가 변경: Review Plugin의 근거 미리보기 모달(자료 상세)의 시각 디자인을 위 본체 자료 상세 모달과 맞춘다. 동작과 기능은 바꾸지 않는다. [사용자 결정]

## 2. 비목표
- 자료 등록은 이번 범위에서 제외한다. [제안 후 승인]
- Review 플러그인의 근거 자료 읽기 전용 화면은 시각 디자인(DoD-19)을 제외한 기능 변경을 이번 범위에서 제외한다. [사용자 결정]
- 자료 상태 자동 전환은 구현하지 않는다. [제안 후 승인]
- 모달에 다운로드 버튼, 파일 크기, 카테고리 태그, 「이 자료로 검토 작성」 버튼을 두지 않는다. [사용자 결정]
- API·DB·마이그레이션을 변경하지 않으며 `make gen-ts-docker`를 실행하지 않는다. [사용자 결정]
- `ui-kit`을 수정하지 않으며 Modal을 `ui-kit`으로 승격하지 않는다. Review Plugin은 근거 미리보기 모달의 시각 디자인 외에는 수정하지 않는다. [사용자 결정]
- Plugin 미리보기 모달에 데이터룸 이름을 표시하지 않는다. `PluginContext`와 `plugin-sdk` 계약을 변경하지 않는다. [사용자 결정]
- Plugin 미리보기 모달의 동작(URL 미연동, 작성·상세 모달 위에 겹침, 닫기 버튼·ESC), 문구, `ready`가 아닌 자료의 안내를 바꾸거나 추가하지 않는다. [사용자 결정]
- 역할별 분기를 두지 않는다. 기업 담당자와 투자자의 상세 조회 권한은 같다. [제안 후 승인]

## 3. 완료의 정의
- DoD-1: 투자자가 `documents.list`를 호출하면 시드 4건이 반환된다 — 검증: Rust 통합 테스트(실 PostgreSQL) [제안 후 승인]
- DoD-2: 기업 담당자가 `documents.list`를 호출해도 시드 4건이 반환된다 — 검증: Rust 통합 테스트(실 PostgreSQL) [제안 후 승인]
- DoD-3: 목록은 `created_at` 내림차순, 같은 시각이면 ID 오름차순으로 정렬된다 — 검증: Rust 통합 테스트(실 PostgreSQL, 같은 시각 시드 포함) [제안 후 승인]
- DoD-4: 검색어를 주면 제목에 대소문자 무시 부분 일치하는 자료만 반환된다 — 검증: Rust 통합 테스트 [사용자 결정]
- DoD-5: `documents.get`은 제목·파일명·상태·본문을 반환한다 — 검증: Rust 통합 테스트 [사용자 결정]
- DoD-6: 목록 화면(`/workspace/:id`)에 자료의 제목·파일명·상태·작성 시각(브라우저 로컬 포맷)이 표시된다 — 검증: Playwright E2E(desktop, mobile) [사용자 결정]
- DoD-7: 검색어를 입력하면 일치하는 자료만 목록에 남고 URL의 `?q=`에 반영된다 — 검증: Playwright E2E(desktop, mobile) [사용자 결정]
- DoD-8: 목록에서 자료를 선택하면 `/workspace/:id/documents/:documentId`로 이동하고, 목록이 뒤에 유지된 채 모달(`role="dialog"`)에 제목·파일명·상태·작성 시각·본문이 표시된다 — 검증: Playwright E2E(실 API·DB, desktop, mobile) [사용자 결정]
- DoD-9: 상세 주소에서 새로고침하거나 직접 진입해도 같은 모달이 열리고 뒤에 목록이 표시된다 — 검증: Playwright E2E(실 API·DB, desktop, mobile) [사용자 결정]
- DoD-10: `make check-docker`, `make test-api`(Makefile에 신설, DB를 띄운 뒤 Rust 통합 테스트 실행), `make test-e2e`가 통과한다. 기존 Rust 통합 테스트는 수정 없이 통과한다 — 검증: 세 명령 실행 [사용자 결정]
- DoD-11: 모달에 현재 워크스페이스의 데이터룸 이름이 표시된다 — 검증: Playwright E2E(실 API·DB, desktop, mobile) [사용자 결정]
- DoD-12: 모달의 닫기 버튼을 누르면 모달이 닫히고 URL이 목록(`/workspace/:id`)으로 돌아간다 — 검증: Playwright E2E(desktop, mobile) [사용자 결정]
- DoD-13: ESC 키를 누르면 모달이 닫히고 URL이 목록으로 돌아간다 — 검증: Playwright E2E(desktop) [사용자 결정]
- DoD-14: 모달 바깥(배경)을 클릭하면 모달이 닫히고 URL이 목록으로 돌아간다 — 검증: Playwright E2E(desktop) [사용자 결정]
- DoD-15: 모달이 닫히면 포커스가 모달을 열었던 목록 항목으로 돌아간다 — 검증: Playwright E2E(desktop) [사용자 결정]
- DoD-16: 검색한 목록에서 연 모달의 URL에 같은 `?q=`가 유지되고 뒤의 목록은 같은 검색 결과이며, 닫으면 같은 검색어의 목록으로 돌아간다 — 검증: Playwright E2E(실 API·DB, desktop, mobile) [사용자 결정]
- DoD-17: 자료 등록에 성공하면 새 자료의 상세 URL로 이동해 목록 위 모달에 그 자료가 표시된다(`dataroom-document-register` 스펙의 상세 이동 단언을 대체한다) — 검증: Playwright E2E(실 API·DB, desktop, mobile) [제안 후 승인]
- DoD-18: 모바일 폭에서 모달이 화면 안에 들어오고 본문 영역만 스크롤된다 — 검증: Playwright E2E(mobile) [제안 후 승인]
- DoD-19: Review Plugin 근거 미리보기 모달의 헤더(문서 아이콘·제목), 파일명·작성 시각 메타, 상태 배지 줄, 본문 박스가 본체 자료 상세 모달과 같은 시각 디자인이다 — 검증: 사람이 두 모달을 스크린샷으로 나란히 확인 [사용자 결정]
- DoD-20: 모바일 폭에서 Plugin 미리보기 모달이 화면 안에 들어오고 본문 박스만 스크롤된다 — 검증: Playwright E2E(mobile, 실 API·DB) [제안 후 승인]
- DoD-21: 기존 Plugin 미리보기 E2E(`tests/review-write.update.status.spec.ts`의 근거 칩 클릭으로 열기·닫기와 조회 실패 case, `tests/review-write.update.spec.ts`의 검색어 유지 case(미리보기 열기·닫기를 부수적으로 단언), `tests/review-write.spec.ts`의 미리보기 조회 실패 case)가 수정 없이 통과한다 — 검증: `make test-e2e` [제안 후 승인]
- DoD-22: Plugin 미리보기 모달에 자료의 제목·파일명·상태·작성 시각·본문이 표시된다 — 검증: `tests/review-write.spec.ts`의 기존 미리보기 내용 표시 case를 새 구조 기준 DOM 단언으로 갱신해 통과(그 파일의 번호 체계는 다른 스펙의 것이라 이번 스펙 태그를 달지 않는다) [사용자 결정]

## 4. 인터페이스 계약
- 데이터 스키마: `api/migrations/0003_*.sql`로 `documents` 테이블을 추가한다. 자료 ID는 TEXT이고 시드 ID는 샘플 label(`doc-business`, `doc-team`, `doc-revenue`, `doc-pipeline`)이며, `status`는 CHECK 제약(`ready`/`processing`/`failed`)을 둔다. [제안 후 승인]
- API 경로: `POST /api/dataroom/rpc`의 method 분기로 `documents.list`, `documents.get`을 제공한다. [제안 후 승인]
- 요청은 기존 형식 `{ "workspaceId": "string", "method": "string", "params": ... }`, 응답은 `{ "result": ... }`, 오류는 `{ "kind": "string", "message": "string" }`를 따른다. [제안 후 승인]
- `documents.list` 요청 `params`는 `{ "query": "string" }`이고 `query`는 생략할 수 있으며 `params`가 `null`이어도 전체 목록을 반환한다. [제안 후 승인]
- `documents.list` 응답 `result`는 `{ "documents": [ { "id": "string", "title": "string", "fileName": "string", "status": "ready|processing|failed", "createdAt": "string" } ] }`이고 항목에 본문은 없다. [제안 후 승인]
- `documents.get` 요청 `params`는 `{ "documentId": "string" }`이다. [제안 후 승인]
- `documents.get` 응답 `result`는 `{ "document": { "id": "string", "title": "string", "fileName": "string", "status": "ready|processing|failed", "content": "string", "createdAt": "string" } }`이다. [사용자 결정]
- 오류 응답은 400 `invalid_input`(검색어 trim 후 100자 초과), 401 `not_authenticated`(미인증), 403 `forbidden`(요청 `workspaceId` 불일치), 404 `not_found`(없는 자료 ID 또는 다른 workspace의 자료 ID), 500 `storage_error`(DB 오류)로 구분한다. [제안 후 승인]
- 작성 시각은 ISO 8601 UTC 문자열로 반환한다. [사용자 결정]
- 화면 URL은 목록 `/workspace/:id`, 상세 `/workspace/:id/documents/:documentId`이고, 검색어는 `?q=`로 유지한다. 상세는 별도 페이지가 아니라 목록 위의 모달이며, 상세 URL에도 `?q=`를 싣는다. [사용자 결정]
- 서버 계약(`documents.list`, `documents.get`, DTO, 오류 응답)과 `api-client/`는 변경하지 않는다. [사용자 결정]
- 데이터룸 이름은 세션의 `workspace.name`을 사용한다(`documents.get` 응답에 추가하지 않는다). [제안 후 승인]
- 모달은 `web/src` 전용 Modal 컴포넌트(네이티브 `dialog` 요소, `aria-labelledby`, 닫기 영역 44px 이상)로 구현한다. [사용자 결정]
- Plugin 미리보기 모달은 Plugin 번들 안에서 자기완결로 구현하며 본체 `web/src` 코드를 import하지 않는다. Plugin 공용 Modal(`plugins/review/ui/modal.tsx`)에 선택 속성을 더해 맞추고 기본 동작은 바꾸지 않는다. `host.call`, `PluginContext`, 서버 계약은 변경하지 않는다. [제안 후 승인]

## 5. 엣지 케이스와 실패 시나리오
- EC-1: 검색어가 공백뿐이면 전체 목록을 반환한다 — 검증: Rust 통합 테스트 [사용자 결정]
- EC-2: 검색어의 `%`·`_`·`\`는 와일드카드가 아닌 글자로 검색된다 — 검증: Rust 통합 테스트 [사용자 결정]
- EC-3: 검색어가 trim 후 100자(문자 수 기준)를 넘으면 400 `invalid_input`이 반환된다 — 검증: Rust 통합 테스트 [사용자 결정]
- EC-4: 요청 `workspaceId`가 사용자 workspace와 다르면 403이 반환된다 — 검증: Rust 통합 테스트 [제안 후 승인]
- EC-5: 없는 자료 ID로 `documents.get`을 호출하면 404가 반환된다 — 검증: Rust 통합 테스트 [사용자 결정]
- EC-6: 다른 workspace의 자료 ID로 `documents.get`을 호출하면 404가 반환된다 — 검증: Rust 통합 테스트 [사용자 결정]
- EC-7: `processing`/`failed` 자료도 `documents.get`으로 조회된다 — 검증: Rust 통합 테스트 [사용자 결정]
- EC-8: `ready`가 아닌 자료의 상세 모달에 "근거로 연결할 수 없음" 안내(`role="note"`)와 본문이 함께 표시된다 — 검증: Playwright E2E(실 API·DB, desktop, mobile) [사용자 결정]
- EC-9: 목록 조회가 실패하면 "자료 없음"이 아닌 오류가 표시되고 입력한 검색어가 보존된다 — 검증: Playwright E2E(mock으로 실패 응답) [제안 후 승인]
- EC-10: 검색 결과가 없으면 오류나 로딩이 아닌 빈 결과 문구가 표시된다 — 검증: Playwright E2E(desktop, mobile) [제안 후 승인]
- EC-11: 모달의 자료 조회 중에는 모달이 열린 채 본문 자리에 로딩 표시가 나타나고 닫기 버튼은 동작한다 — 검증: Playwright E2E(mock으로 응답 지연) [사용자 결정]
- EC-12: 없는 자료 ID나 다른 workspace의 자료 ID로 직접 진입하면 모달 안에 "찾을 수 없음" 상태가 표시된다 — 검증: Playwright E2E(실 API·DB, desktop, mobile) [사용자 결정]
- EC-13: 자료 조회가 404가 아닌 오류로 실패하면 모달 안에 오류와 재시도 버튼이 표시되고, 재시도하면 성공 시 본문이 표시된다 — 검증: Playwright E2E(mock으로 실패 후 성공 응답) [사용자 결정]
- EC-14: 조회 실패는 "자료 없음"(404 상태)으로 표시되지 않는다 — 검증: Playwright E2E(mock으로 실패 응답) [사용자 결정]
- EC-15: 디자인을 바꾼 Plugin 미리보기 모달에서도 찾을 수 없음, 오류+재시도 상태가 서로 구분되어 표시된다 — 검증: 기존 `tests/review-write.update.status.spec.ts`와 `tests/review-write.spec.ts`의 미리보기 조회 실패 case를 수정 없이 통과(로딩 상태의 별도 단언은 추가하지 않는다) [사용자 결정]

## 미결정 사항
없음

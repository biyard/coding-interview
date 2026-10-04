# 계획: 자료 조회 화면·기능

- 상태: 승인
- 스펙: docs/specs/dataroom-document-view.md
- 기준 코드: 작업 트리 (374ced4 기반)
- 최종 갱신: 2026-10-04

## 1. 구현 전략

- 서버는 새 REST 핸들러를 만들지 않고, 기존 `POST /api/dataroom/rpc`의 `dataroom::dispatch` method 분기로 구현한다. 근거: `api/src/dataroom/mod.rs`, `plugins/review/server/mod.rs`(workspace 검사·method match·`RpcResponse` 래핑 선례).
- DTO는 `api/src/dataroom/types.rs`에 `camelCase` + `ts-bridge` 패턴으로 정의하고 `make gen-ts-docker`로 `api-client/`를 재생성한다. `params`·`result`는 `unknown`이므로 프론트가 생성된 DTO 타입으로 캐스트한다. 근거: `api/src/types.rs`, `plugins/review/server/types.rs`.
- 작성 시각은 SQL에서 문자열로 변환해 반환한다(sqlx chrono feature·`Cargo.lock` 변경 불필요). 근거: `api/` 마운트가 compose에서 `:ro`이고 `--locked`를 쓴다.
- 화면은 `web/src/main.tsx`의 `/workspace/:workspaceId/*` splat과 `shell.tsx`의 `DataroomApp` 마운트를 그대로 쓰고, `DataroomApp` 내부의 상대 `Routes`를 쓴다. `main.tsx`·`shell.tsx`는 수정하지 않는다.
- 상세 모달(2026-10-04 스펙 변경)은 목록 라우트 하위에 상세 라우트를 중첩하고 목록 컴포넌트가 `Outlet`으로 모달을 렌더한다. 목록이 모달 뒤에 유지되고 새로고침·직접 진입도 같은 라우트로 처리된다. `documents/new`는 기존처럼 별도 페이지다. 근거: `web/src/dataroom/app.tsx`의 상대 `Routes` 구조, react-router v6 중첩 라우트.
- Modal은 `web/src/components/modal.tsx`에 신규로 만든다. `plugins/review/ui/modal.tsx`와 같은 패턴(네이티브 `dialog`의 `showModal`, `onCancel`로 ESC 처리, 닫을 때 직전 포커스 요소로 복귀, 배경 클릭은 mousedown·click이 모두 배경일 때만 닫기)을 참고해 다시 작성하며, 플러그인 코드를 import하지 않는다. 근거: `plugins/review/ui/modal.tsx`, `web/src/dataroom/document-register.tsx`의 인라인 `dialog`.
- 데이터룸 이름은 `DataroomApp`이 이미 읽는 세션 캐시(`HostSession`)의 workspace 이름을 모달에 전달한다. 근거: `web/src/dataroom/app.tsx`의 세션 읽기, `web/src/components/shell.tsx`의 `workspace.name` 표시.
- Rust 통합 테스트는 `#[sqlx::test]`(임시 DB, `./migrations` 자동 적용)로 `dispatch`를 직접 호출한다. 새 의존성은 추가하지 않는다. `AuthenticatedUser`를 직접 생성해 역할·workspace를 지정한다. 근거: `sqlx` features(`macros`, `migrate`), `api/src/auth.rs`.
- E2E는 `tests/`의 Playwright(desktop, mobile)로 실제 서버·DB를 쓰고, EC-9·EC-11·EC-13·EC-14만 `page.route`로 실패·지연 응답을 만든다.
- 서버(API·DB)와 `api-client/`는 변경하지 않으므로 T-1·T-2·T-3·T-5는 그대로 둔다.
- Plugin 미리보기 모달(2026-10-04 추가 변경)은 `plugins/review/ui/modal.tsx`에 선택 속성(header 슬롯과 고정 본문 레이아웃)을 더해 맞춘다. 기본값은 그대로 두어 같은 Modal을 쓰는 `CriterionModal`(`plugins/review/ui/criterion-page.tsx`)에 영향이 없게 한다. 본체의 클래스·구조는 `web/src/components/modal.tsx`, `web/src/dataroom/document-detail.tsx`를 보고 Plugin 안에 다시 쓰며 본체 코드를 import하지 않는다. `Badge`와 디자인 토큰(`bg-muted`, `border-border` 등)은 Plugin이 이미 `@biyard/components`와 `plugin-sdk/theme.css`로 쓸 수 있다. 근거: `plugins/review/ui/document-view.tsx`, `ui-kit/theme-bridge.css`, `scripts/build-plugins.mjs`(자기완결 번들 검사).
- 기존 Plugin 테스트가 요구하는 접근성 이름·구조(dialog 이름 `{제목} 미리보기`와 조회 중·오류 시 `근거 자료 미리보기`, 성공 시 `article` 래퍼, 오류 시 `role="alert"`와 `재시도`, `닫기`, 파일명이 한 요소에만 나오는 것)는 유지한다. 근거: `tests/review-write.update.status.spec.ts`, `tests/review-write.update.spec.ts`, `tests/review-write.spec.ts`의 미리보기 case.
- 환경 주의: `make gen-ts-docker`가 `api-client` `:ro` 등으로 실패하면 환경 대응 시간으로 분리 기록한다.

## 2. Task

### T-1 — documents 마이그레이션·시드

- 사이드: 백엔드
- 상태: 완료
- 목적: `documents` 테이블과 샘플 4건 시드를 새 마이그레이션으로 추가한다.
- 선행: 없음
- 연결 항목: DoD-1, DoD-2, DoD-3
- 수정 대상: `api/migrations/0003_documents.sql` — `documents` 테이블(workspace 연결, `status` CHECK), 조회 인덱스, 시드 4건(일부는 같은 `created_at`)
- 따라야 할 패턴: 기존 마이그레이션의 TEXT PK·시드 INSERT 방식 — 근거: `api/migrations/0001_review_criteria.sql`, `api/migrations/0002_auth.sql`
- 완료 조건: 연결 항목이 요구하는 데이터(시드 4건, 같은 시각 정렬 동률 포함)가 마이그레이션만으로 존재한다. 시드 ID는 샘플 label이다 — 검증: T-5의 통합 테스트
- 실행 명령: `make reset-db && make db` 후 `docker compose run --rm --no-deps api cargo check --locked --manifest-path api/Cargo.toml --all-targets --all-features`
- 수정 금지: 기존 `0001`·`0002` 마이그레이션

### T-2 — 계약 DTO와 api-client 재생성

- 사이드: 백엔드
- 상태: 완료
- 목적: 목록·상세 DTO를 정의하고 `api-client/` 타입을 재생성한다.
- 선행: 없음
- 연결 항목: DoD-5, DoD-6
- 수정 대상: `api/src/dataroom/types.rs` — 목록 요청·항목·응답, 상세 요청·응답 DTO. `api-client/src/types/**` — `make gen-ts-docker`가 생성(직접 수정 금지). `compose.yaml` — web 서비스의 `./api-client:/app/api-client:ro`에서 `:ro` 제거(환경 대응, `make gen-ts-docker`가 `api-client`에 쓰지 못하는 문제. ui-kit의 `051a54e`와 같은 유형. 사용자 확정)
- 따라야 할 패턴: `#[serde(rename_all = "camelCase")]` + `cfg_attr(feature = "ts-bridge", derive(ts_rs::TS), ts(export, export_to = "types/"))`, 요청 DTO는 `deny_unknown_fields` — 근거: `api/src/types.rs`
- 완료 조건: 스펙 4절의 요청 `params`·응답 `result` 형태와 필드명이 DTO 타입으로 표현되고 생성된 타입이 `api-client/`에 존재한다 — 검증: `make check-gen-ts-docker`
- 실행 명령: `make gen-ts-docker`, `make check-gen-ts-docker`
- 수정 금지: `api-client/` 직접 편집, `api/src/types.rs`의 기존 DTO

### T-3 — dataroom RPC 서버 로직

- 사이드: 백엔드
- 상태: 완료
- 목적: `dispatch`에서 `documents.list`·`documents.get`을 구현한다.
- 선행: T-1, T-2
- 연결 항목: DoD-1, DoD-2, DoD-3, DoD-4, DoD-5, EC-1, EC-2, EC-3, EC-4, EC-5, EC-6, EC-7
- 수정 대상: `api/src/dataroom/mod.rs` — workspace 검사 후 method 분기. `api/src/dataroom/models.rs` — 조회 행 구조체와 쿼리
- 따라야 할 패턴: `request.workspace_id != user.workspace_id`이면 `ApiError::forbidden()`, 결과는 `RpcResponse { result: serde_json::to_value(dto).map_err(ApiError::storage)? }`, SQL은 `sqlx::query_as` 파라미터 바인딩 — 근거: `plugins/review/server/mod.rs`, `api/src/handlers/auth.rs`
- 완료 조건: 연결 항목 충족. 알 수 없는 method와 DB 실패를 성공·빈 결과로 대체하지 않는다 — 검증: T-5의 통합 테스트
- 실행 명령: `docker compose run --rm --no-deps api sh -c 'cargo fmt --manifest-path api/Cargo.toml -- --check && cargo check --locked --manifest-path api/Cargo.toml --all-targets --all-features'`
- 수정 금지: `api/migrations/`, `api/src/types.rs`, `plugins/review/server/`

### T-4 — 자료 목록·검색·상세 화면

- 사이드: 프론트
- 상태: 완료
- 목적: `DataroomApp`에 목록·제목 검색 화면과 목록 위에 겹치는 상세 모달을 구현한다.
- 선행: T-2
- 연결 항목: DoD-6, DoD-7, DoD-8, DoD-9, DoD-11, DoD-12, DoD-13, DoD-14, DoD-15, DoD-16, DoD-17, DoD-18, EC-8, EC-9, EC-10, EC-11, EC-12, EC-13, EC-14
- 수정 대상: `web/src/dataroom/app.tsx` — 목록 라우트 하위에 상세 라우트를 중첩하고 세션의 workspace 이름을 전달. `web/src/dataroom/document-list.tsx` — `Outlet` 렌더, 항목 링크가 `?q=`를 상세 URL에 싣도록 변경. `web/src/dataroom/document-detail.tsx` — 별도 페이지를 모달 내용(로딩·404·오류+재시도·`role="note"` 안내·데이터룸 이름)으로 전환. `web/src/components/modal.tsx`(신규) — 본체 전용 Modal. `web/src/i18n.tsx` — `en`/`ko` 문구 쌍(닫기, 데이터룸 등)
- 따라야 할 패턴: `useQuery` 훅 구조 — 근거: `web/src/api/hooks/use-plugins.ts`. 로딩 `role="status"`·오류 `role="alert"` — 근거: `web/src/auth/session.tsx`. ui-kit(`@biyard/components`) 컴포넌트와 Tailwind 토큰 — 근거: `web/src/auth/login.tsx`. 쿼리 키는 `[user.id, workspaceId, "documents", ...]`(스펙 결정 사항이 아니라 CLAUDE.md의 키 격리 지침을 따른다). 기존 `web/src/api/hooks/use-documents.ts`는 그대로 쓴다. Modal은 `plugins/review/ui/modal.tsx`의 패턴을 참고하되 import하지 않는다 — 근거: `plugins/review/ui/modal.tsx`, CLAUDE.md(본체와 Plugin 분리)
- 완료 조건: 연결 항목 충족. 로딩·오류·빈 결과를 구분하고 조회 실패를 "자료 없음"으로 표시하지 않는다. 작은 화면·폼 레이블·키보드 접근을 지원한다. 모달의 닫기 영역은 44px 이상이고 `aria-labelledby`로 제목을 가리킨다 — 검증: verify 단계의 코드 검토(해당 DoD·EC가 없어 E2E로 덮지 않는다)
- 실행 명령: `docker compose run --rm --no-deps web sh -c 'pnpm lint && pnpm build'`
- 수정 금지: `web/src/main.tsx`, `web/src/components/shell.tsx`, `web/src/dataroom/document-register.tsx`, `api/`, `api-client/`, `plugins/`, `ui-kit/`

### T-5 — Rust 통합 테스트와 test-api 타깃

- 사이드: 테스트
- 상태: 완료
- 목적: 실제 PostgreSQL로 `dispatch`를 검증하고 `make test-api`를 신설한다.
- 선행: T-1, T-2
- 연결 항목: DoD-1, DoD-2, DoD-3, DoD-4, DoD-5, DoD-10, EC-1, EC-2, EC-3, EC-4, EC-5, EC-6, EC-7
- 수정 대상: `api/tests/dataroom_documents.rs`(신규) — 통합 테스트. `Makefile` — `test-api` 타깃(`db` 선행, `cargo test` 실행)
- 따라야 할 패턴: 컴파일 타임 DB 매크로(`sqlx::query!`)를 쓰지 않는다 — 근거: 기존 코드의 런타임 `query_as`
- 완료 조건: 연결 항목 각각을 단언하는 테스트가 있고 `make test-api`로 실행된다 — 검증: `make test-api`
- 실행 명령: `make test-api`
- 수정 금지: 제품 코드(`api/src/`), `api/migrations/`
- 테스트 파일·runner: `api/tests/dataroom_documents.rs`, `cargo test --test dataroom_documents` (`#[sqlx::test]`)
- mock 허용 경계: 없음(실제 PostgreSQL 사용)
- 데이터 격리: `#[sqlx::test]`가 테스트마다 임시 DB를 만들고 `./migrations`를 적용한다. EC-6의 두 번째 workspace와 자료는 해당 테스트 안에서 INSERT한다

### T-6 — 자료 조회 E2E

- 사이드: E2E
- 상태: 완료
- 목적: desktop·mobile에서 목록·검색·상세 모달·새로고침·닫기·오류·빈 결과 흐름을 검증한다.
- 선행: T-4
- 연결 항목: DoD-6, DoD-7, DoD-8, DoD-9, DoD-11, DoD-12, DoD-13, DoD-14, DoD-15, DoD-16, DoD-17, DoD-18, EC-8, EC-9, EC-10, EC-11, EC-12, EC-13, EC-14
- 수정 대상: `tests/documents.spec.ts` — 상세 단언을 `article`에서 `dialog` 기준으로 바꾸고 모달 시나리오 추가. `tests/document-register.spec.ts` — 등록 성공 후 상세 이동 단언(DoD-17)을 모달 기준으로 갱신. 그 파일의 `[DoD-5][DoD-11]` case(`:71`)가 DoD-17의 매핑이며(그 파일의 DoD-N은 등록 스펙의 ID라 이번 스펙 태그를 달지 않는다), `role="dialog"`에 새 자료의 제목·본문 표시와 상세 URL 도달까지 단언한다. `tests/helpers/auth.ts` — 로그인 헬퍼(기존)
- 따라야 할 패턴: role·label·보이는 문구로 요소를 찾고 sleep 대신 자동 대기를 쓴다 — 근거: `.claude/agents/e2e-dev.md`. 로그인은 UI 폼 또는 `page.request.post('/api/auth/login')` — 근거: `web/src/auth/login.tsx`
- 완료 조건: 연결 항목 각각을 단언하는 시나리오가 통과한다. DoD-13·14·15는 desktop만, DoD-18은 mobile만, 나머지는 desktop·mobile 두 프로젝트에서 통과한다. 시각 표시는 시간대에 영향받지 않게 느슨하게 단언한다 — 검증: `make test-e2e`
- 실행 명령: `pnpm typecheck`, `pnpm exec playwright test tests/documents.spec.ts --project=desktop`
- 수정 금지: 제품 코드, `playwright.config.ts`
- 테스트 파일·runner: `tests/documents.spec.ts`, `tests/document-register.spec.ts`, Playwright
- mock 허용 경계: EC-9는 `documents.list` 응답을, EC-11·EC-13·EC-14는 `documents.get` 응답을 `page.route`로 지연·실패시킨다(실패와 지연을 정상 서버로 만들 수 없음). 나머지는 실제 API·DB를 쓴다
- 데이터 격리: 모달 조회 시나리오는 읽기 전용이라 쓰기 격리가 필요 없다. 시드가 고정이며 초기화는 `make reset-db`다. 등록 시나리오(DoD-17)는 기존 `tests/document-register.spec.ts`의 격리 방식을 따른다
- 실행 환경: `make test-e2e`(접속 `http://web:5178`) 또는 호스트 `http://127.0.0.1:5178`. 계정 `company@lighthouse.test`, `investor@lighthouse.test`, 비밀번호 `dataroom`. 사전 데이터는 마이그레이션 시드

### T-7 — Plugin 근거 미리보기 모달 디자인

- 사이드: 프론트
- 상태: 완료
- 목적: Plugin 근거 미리보기 모달의 시각 디자인을 본체 자료 상세 모달과 맞춘다.
- 선행: 없음
- 연결 항목: DoD-19, DoD-20, DoD-21, DoD-22, EC-15
- 수정 대상: `plugins/review/ui/modal.tsx` — header 슬롯과 고정 본문 레이아웃 선택 속성 추가(기본값 불변). `plugins/review/ui/document-view.tsx` — 헤더(문서 아이콘·제목)·메타(파일명·작성 시각)·상태 배지 줄·스크롤 본문 박스로 재구성
- 따라야 할 패턴: 본체의 클래스·구조를 Plugin 안에 다시 쓴다(import 금지) — 근거: `web/src/components/modal.tsx`, `web/src/dataroom/document-detail.tsx`, CLAUDE.md(Plugin 번들 자기완결). 상태 배지는 `@biyard/components`의 `Badge`(ready=success, processing=warning, failed=danger) — 근거: `plugins/review/ui/document-view.tsx`
- 완료 조건: 연결 항목 충족. 데이터룸 이름·`ready`가 아닌 자료 안내를 추가하지 않고 `text.ts` 문구를 바꾸지 않는다. dialog 접근 이름과 닫기·오류·재시도 동작, 성공 시 `article` 래퍼, 파일명이 한 요소에만 나오는 구조를 유지한다. `CriterionModal`의 모양은 변하지 않는다 — 검증: T-8의 E2E와 verify 단계의 코드 검토, DoD-19는 사람이 스크린샷으로 확인
- 실행 명령: `docker compose run --rm --no-deps web sh -c 'pnpm lint && pnpm build'`
- 수정 금지: `web/`, `ui-kit/`, `plugin-sdk/`, `api/`, `api-client/`, `plugins/review/server/`, `plugins/review/ui/text.ts`, `plugins/review/ui/criterion-page.tsx`, `tests/`

### T-8 — Plugin 미리보기 E2E

- 사이드: E2E
- 상태: 완료
- 목적: 모바일 폭에서 본문 박스만 스크롤됨을 검증하고, 새 구조에서도 기존 미리보기 표시 단언이 통과하게 한다.
- 선행: T-7
- 연결 항목: DoD-20, DoD-21, DoD-22, EC-15
- 수정 대상: `tests/review-document-preview.spec.ts`(신규) — DoD-20(파일 상단 주석에 이 스펙 경로를 적고 case 제목 접두로 스펙을 밝힌다). `tests/review-write.spec.ts` — 기존 미리보기 내용 표시 case(DoD-22의 매핑)의 DOM 단언을 새 구조 기준으로 갱신(골자는 바꾸지 않는다)
- 따라야 할 패턴: 본체 모달의 같은 시나리오 — 근거: `tests/documents.spec.ts`의 모바일 스크롤 case(뷰포트 높이를 줄여 짧은 시드 본문도 넘치게 함, 본문 박스를 sr-only 제목의 부모로 찾음). 폼을 열어 미리보기 버튼을 누르는 경로와 `dialogNamed` — 근거: `tests/review-write.spec.ts`
- 완료 조건: 연결 항목 충족. DoD-21·EC-15의 기존 case는 수정 없이 통과하고, DoD-22의 갱신된 case는 제목·파일명·상태·작성 시각·본문 표시를 동작으로 단언한다 — 검증: `make test-e2e`
- 실행 명령: `pnpm typecheck`, `pnpm exec playwright test tests/review-document-preview.spec.ts tests/review-write.spec.ts --project=mobile`
- 수정 금지: 제품 코드, `playwright.config.ts`, `tests/review-write.update.status.spec.ts`, `tests/review-write.update.spec.ts`, `tests/documents.spec.ts`
- 테스트 파일·runner: `tests/review-document-preview.spec.ts`, `tests/review-write.spec.ts`, Playwright
- mock 허용 경계: 없음(실제 API·DB 사용)
- 데이터 격리: 검토를 저장하지 않고 저장 슬롯을 쓰지 않는 기준 폼을 열어 미리보기 버튼을 누르는 경로를 쓰므로 쓰기 격리가 필요 없다. 시드가 고정이며 초기화는 `make reset-db`다
- 실행 환경: `make test-e2e`(접속 `http://web:5178`) 또는 호스트 `http://127.0.0.1:5178`. 계정 `investor@lighthouse.test`, 비밀번호 `dataroom`. 사전 데이터는 마이그레이션 시드

## 3. 항목 coverage

- DoD-1: T-1, T-3, T-5
- DoD-2: T-1, T-3, T-5
- DoD-3: T-1, T-3, T-5
- DoD-4: T-3, T-5
- DoD-5: T-2, T-3, T-5
- DoD-6: T-2, T-4, T-6
- DoD-7: T-4, T-6
- DoD-8: T-4, T-6
- DoD-9: T-4, T-6
- DoD-10: T-5
- DoD-11: T-4, T-6
- DoD-12: T-4, T-6
- DoD-13: T-4, T-6
- DoD-14: T-4, T-6
- DoD-15: T-4, T-6
- DoD-16: T-4, T-6
- DoD-17: T-4, T-6
- DoD-18: T-4, T-6
- DoD-19: T-7
- DoD-20: T-7, T-8
- DoD-21: T-7, T-8
- DoD-22: T-7, T-8
- EC-1: T-3, T-5
- EC-2: T-3, T-5
- EC-3: T-3, T-5
- EC-4: T-3, T-5
- EC-5: T-3, T-5
- EC-6: T-3, T-5
- EC-7: T-3, T-5
- EC-8: T-4, T-6
- EC-9: T-4, T-6
- EC-10: T-4, T-6
- EC-11: T-4, T-6
- EC-12: T-4, T-6
- EC-13: T-4, T-6
- EC-14: T-4, T-6
- EC-15: T-7, T-8

## 4. 실행 순서

- 1구간(병렬): T-1, T-2. 수정 파일이 겹치지 않는다(`api/migrations/` vs `api/src/dataroom/types.rs`·`api-client/`).
- 2구간(병렬): T-3, T-4, T-5. 수정 파일이 겹치지 않는다(`api/src/dataroom/mod.rs`·`models.rs` vs `web/` vs `api/tests/`·`Makefile`).
- 3구간: T-6. 화면(T-4)이 있어야 본문을 채울 수 있다.
- 2026-10-04 변경분은 T-4(화면), T-6(E2E)뿐이다. 서버 Task(T-1·2·3·5)는 이미 완료되어 다시 실행하지 않고, DoD-10의 기존 Rust 통합 테스트 무수정 통과는 검증 단계에서 `make test-api`로 확인한다.
- Plugin 미리보기 변경분: T-7과 T-8은 수정 파일이 겹치지 않는다(`plugins/review/ui/` vs `tests/`). T-8의 본문은 T-7의 화면이 있어야 채울 수 있어 T-7 다음에 순차로 진행한다.
- 검증 단계에서 `make check-docker`, `make test-api`, `make test-e2e`를 실행한다(DoD-10). DoD-19는 사람이 스크린샷으로 확인한다.

## 5. 차단 사항

- 없음

## 테스트 설계 증거

- 상태: 동결(사용자 승인), reviewer PASS 아님 (2026-10-04). 스펙이 바뀌어 2026-10-02 기록(digest `91f4c2bc257c56fe`)은 재사용하지 않고 이 기록으로 교체했다.
- 기준 스펙: docs/specs/dataroom-document-view.md (확정, 2026-10-04 갱신)
- 골자 digest: `5eab04f9f603a51f` (case 33개: E2E 18, Rust 15). 본체 모달 변경분 기준 이전 digest `1c3d76cf48d41809`(case 32개)에 Plugin 미리보기 골격(`tests/review-document-preview.spec.ts`, DoD-20 1개)을 더한 값이다. 동결 확인은 세 파일을 모두 `--files`에 넣는다.
- 골격 파일: `tests/review-document-preview.spec.ts`(1개, `test.fixme`, 2026-10-04 추가), `tests/documents.spec.ts`(17개. 신규·갱신 13개는 `test.fixme`, 동결 후 본문이 채워진 DoD-6·DoD-7·EC-9·EC-10 4개는 유지), `api/tests/dataroom_documents.rs`(15개, 변경 없음)
- 기계 검사: 통과. 항목 32개 중 case 연결 30개, 제외 2개(DoD-10, DoD-17). 본문이 채워진 case가 섞여 있어 `check-skeleton.py`의 골격 모드는 쓰지 못했고, `--frozen` 모드의 digest 계산과 연결 계산으로 대신했다. 신규 case에는 미구현 표기(`test.fixme`)가 있고 assertion이 없음을 확인했다.
- reviewer: 새 `general-purpose` 3라운드. 1라운드 NEEDS-DECISION, 2라운드 NEEDS-FIX, 3라운드 NEEDS-DECISION(고위험 결함·틀린 구현이 통과하는 case 누락 없음). 3라운드 이후의 수정(EC-11 @then 구체화, DoD-16 닫기 case describe 이동)은 reviewer가 보지 못했다. 자동 반복 상한 3회를 넘는 4라운드는 사용자가 생략을 확정했다.
- 사람 확정:
  - DoD-10은 case 없이 제외하고 검증 단계에서 `make check-docker`, `make test-api`, `make test-e2e`를 직접 실행해 판정한다.
  - DoD-17은 case 없이 제외한다. `tests/document-register.spec.ts`의 `[DoD-5][DoD-11]` case(`:71`)를 구현 단계에서 모달 기준으로 갱신해 덮는다(그 파일의 ID는 등록 스펙의 것이라 이번 스펙 태그를 달지 않는다). 단언 범위는 `role="dialog"`에 새 자료의 제목·본문 표시와 상세 URL 도달까지다.
  - EC-12 중 "다른 workspace의 자료 ID"는 E2E case 없이 제외한다. EC-6(Rust 통합)이 같은 404를 덮는다.
  - EC-8에 "ready 자료에는 안내가 없다" 조건을 추가하지 않는다(2026-10-02, 2026-10-04 두 번 확정).
  - DoD-13·14와 DoD-15는 분리를 유지한다(포커스 복귀는 별개 결과 종류).
  - mock 경계: Rust 통합은 mock 없음(실제 PostgreSQL). E2E는 EC-9(`documents.list` 실패), EC-11(`documents.get` 지연), EC-13·14(`documents.get` 실패 후 재시도 성공)에 한해 `page.route`를 쓰고 나머지는 실제 API·DB다. DoD-18은 모바일 뷰포트 높이를 줄여 mock·데이터 쓰기 없이 만든다.
  - 닫기 영역 44px과 `aria-labelledby`는 E2E로 덮지 않고 verify 단계의 코드 검토로 확인한다.
- Plugin 미리보기 변경분(DoD-19~22, EC-15) 사람 확정과 검토 (2026-10-04):
  - 기계 검사: 신규 파일 골격 모드 통과(case 1개, 골자 digest `cefd5e1c89c0ede1`). 스펙 항목 37개 중 case 연결 31개(합산), 제외 6개(DoD-10, DoD-17, DoD-19, DoD-21, DoD-22, EC-15).
  - reviewer: 새 `general-purpose` 1라운드, NEEDS-DECISION(골격 오류 없음, DoD-20은 약화·부풀림 없음). 지적 중 F1(DoD-21·22, EC-15 매핑을 골격 파일 헤더 주석에 명시)은 반영했고 골자 digest는 불변이다. F3(스펙 DoD-21의 `review-write.update.spec.ts` case 표기 정정)은 사용자 승인 후 스펙을 고쳤다.
  - DoD-19는 case 없이 제외한다. 사람이 두 모달을 스크린샷으로 나란히 확인한다(자동 증거 없음).
  - DoD-21·EC-15는 기존 Plugin 테스트(`tests/review-write.update.status.spec.ts`, `tests/review-write.update.spec.ts`, `tests/review-write.spec.ts`의 미리보기 case)를 수정 없이 통과시켜 검증한다. 로딩 상태의 별도 단언은 추가하지 않는다.
  - DoD-22는 case 없이 제외한다. `tests/review-write.spec.ts`의 기존 미리보기 내용 표시 case(그 파일의 `DoD-13` 표기)를 새 구조 기준 DOM 단언으로 갱신해 덮는다(다른 스펙의 번호 체계라 이번 스펙 태그 불가). 갱신 시 작성 시각은 보이는 텍스트로 단언하고 비목표 단언(다운로드·파일 크기·카테고리 없음)은 유지한다(reviewer F2).
  - 미리보기 모달의 ESC·바깥 클릭 닫기는 자동 증거가 없다. 위험을 수용하고 verify의 코드 검토로 `modal.tsx`의 ESC 처리(`onCancel`)가 기본 동작 그대로인지 확인한다(reviewer F4, 사용자 결정).
  - 공용 Modal에 선택 속성을 더하는 방식(T-7)은 사용자 결정이다. 기본값이 바뀌지 않아 `CriterionModal`에 영향이 없어야 한다.
  - EC-15의 404에도 `재시도` 버튼이 있다고 단언하는 기존 case는 스펙이 정하지 않은 동작을 반영하지만 수정 금지 대상이라 그대로 둔다.
- 미검증·검증 불가:
  - EC-9·11·13·14의 mock PASS는 서버의 실제 500(`storage_error`) 처리나 실제 지연을 증명하지 않는다.
  - EC-8은 ready 자료에 안내가 없음을 검증하지 않는다(항상 안내를 띄우는 구현도 통과).
  - DoD-17은 골격 밖이라 동결 장치가 닿지 않는다. 등록 파일의 해당 case가 약하게 갱신돼도 digest로 막지 못하므로 검증 단계에서 단언 범위를 직접 대조한다.
  - 44px·`aria-labelledby`는 자동 회귀 보호가 없다.
  - 골격은 실행하지 않았고 신규·갱신 case는 `skeleton` 상태라 통과로 세지 않는다.
- 구현 단계 선행 조건·주의(Plugin 미리보기 변경분):
  - `tests/review-document-preview.spec.ts`의 DoD-20 case는 mobile만 실행해야 한다. 본문에서 `test.info().project`로 desktop을 skip한다. 뷰포트 높이를 줄인 뒤 본문 박스의 `scrollHeight > clientHeight`를 명시 단언해 단언이 공허해지지 않게 한다.
  - 구현 후 골자 동결 확인은 `check-skeleton.py --frozen 5eab04f9f603a51f --files tests/documents.spec.ts api/tests/dataroom_documents.rs tests/review-document-preview.spec.ts`로 한다.
- 구현 단계 선행 조건·주의(본체 모달 변경분):
  - DoD-13·14·15는 desktop만, DoD-18은 mobile만 실행해야 한다. 본문에서 `test.info().project`로 분기한다. DoD-18은 뷰포트 높이를 줄여 본문 영역 스크롤을 만든다.
  - EC-13·14의 mock은 쿼리 자동 재시도가 첫 실패를 삼키지 않도록 "계속 실패하다 재시도 버튼 이후 성공"으로 만든다.
  - DoD-14 배경 클릭은 모달 바깥(배경)이 있는 desktop 폭에서만 의미가 있다.
  - `tests/document-register.spec.ts`의 `article` 단언과 "자료 목록으로" 링크 단언은 모달 도입 후 깨지므로 본문을 갱신한다. `tests/`는 `pnpm lint` 대상이 아니므로 `pnpm typecheck`로 확인하고, 실행은 `make test-e2e` 기준으로 한다.

# Dataroom

**기업**은 투자 검토에 필요한 자료를 제공하고, **투자자**는 그 자료를 근거로 의견을 남깁니다.
제공된 스켈레톤 코드를 바탕으로 **자료 등록 → 근거 연결 → 검토 작성·수정 → 현황 확인** 흐름을 구현해 주세요.

`samples/`에 담긴 시나리오를 바탕으로 데이터룸 한 개와 자료를 재현해 주세요. 기업 담당자 한 명, 서로 다른 투자자 두 명, 검토 기준 세 개는 DB 초기 마이그레이션에 포함되어 있습니다.

이 과제에서는 **workspace 하나가 데이터룸 하나의 접근 경계입니다.** 구현 대상은 제공된 `lighthouse` workspace이며, API와 저장 데이터의 `workspaceId`가 데이터룸의 범위를 결정합니다. 이 문서에서 “다른 데이터룸”은 `workspaceId`가 다른 데이터룸을 뜻합니다.

## 제공 범위와 구현 범위

### 기술 스택

- FE: React·TypeScript·Vite·React Query·Tailwind·Playwright
- BE: Rust Axum·SQLx
- DB: PostgreSQL

로그인·세션, 공통 UI·CSS, DataRoom 셸, Plugin SDK·로더, API 통신·Gen-TS, DB 연결과 마이그레이션 실행에 필요한 스켈레톤을 제공합니다. Review Plugin의 `health` 호출은 Rust 응답 DTO → Gen-TS → `host.call` → React Query가 이어지는 방식을 보여주는 예제입니다. 과제에서 구현할 업무 기능에는 포함되지 않습니다.

- 자료 관리는 **DataRoom**, 검토 작성·수정·현황은 **Review Plugin**에 구현합니다.
- 제공된 Plugin의 등록·번들·수명주기·호출 경계와 Gen-TS·React Query 연결 방식을 활용합니다.
- 업무 API 계약은 직접 설계합니다. 제공된 인증·검토 기준을 제외한 업무 DB 모델, 관계, 제약, 인덱싱, 마이그레이션, 시드도 직접 구성해 주세요. API 수와 화면 구성에는 제한이 없습니다.
- 프론트엔드 테스트에는 제공된 Playwright를 사용해 주세요. 테스트 코드는 제공하지 않으므로 테스트 전략·케이스·데이터를 직접 설계하고 작성해야 합니다. 백엔드 테스트 도구는 자유롭게 선택할 수 있습니다.

## 스켈레톤 코드 실행 방법

Docker Compose v2와 `make`가 필요합니다. 전달받은 압축을 푼 뒤 `Makefile`이 있는 `dataroom` 디렉터리에서 실행하세요.

```sh
cd dataroom
make dev
```

`make dev`는 PostgreSQL(`db`), Rust API(`api`), React 웹(`web`)을 Docker Compose로 실행하고, 세 서비스가 준비되면 종료됩니다. 처음 실행할 때는 이미지 빌드와 의존성 설치에 시간이 걸릴 수 있습니다. 브라우저에서 <http://localhost:5178/>을 열면 제공된 계정으로 로그인할 수 있습니다. 로그인 이후의 업무 화면은 아직 구현되어 있지 않습니다.

개발 중에는 같은 디렉터리에서 다음 명령을 사용하세요.

```sh
make logs             # 실행 로그 확인 (Ctrl+C로 로그 보기 종료)
make gen-ts-docker    # API 계약을 변경한 뒤 TypeScript 클라이언트 생성
make check-docker     # 생성 결과 일치·lint·타입·빌드 검사
make test-e2e         # tests/에 Playwright 테스트를 작성한 뒤 실행
make stop             # 서비스 종료 (DB 데이터는 보존)
make reset-db         # 서비스 종료 및 과제 DB 데이터 삭제
```

Rust API·Review Plugin 서버 소스와 마이그레이션을 수정하면 `cargo watch`가 API를 자동으로 다시 실행합니다. 웹과 Plugin UI도 변경을 감지해 다시 빌드합니다. Plugin UI가 갱신되면 브라우저를 새로 고침해 주세요.
포트가 겹치면 `WEB_PORT=5188 DB_PORT=5549 make dev`처럼 바꿀 수 있습니다. 이때 웹 주소는 <http://localhost:5188/>입니다. 의존성이나 설정을 변경한 뒤에는 해당 컨테이너를 재시작해 주세요.
Playwright 설정과 빈 `tests/` 폴더가 포함되어 있습니다. 테스트를 작성한 뒤 `make test-e2e`를 실행하면 Docker 환경에서 Chromium 데스크톱·모바일 화면을 검사할 수 있습니다. `make reset-db`는 제공된 초기 데이터까지 다시 만듭니다. 테스트별 데이터 격리 방법은 직접 설계해 주세요.

## 필수 기능

### 제공 계정과 접근권한

세 계정의 비밀번호는 모두 `dataroom`입니다.

| 역할        | 이메일                     |
| ----------- | -------------------------- |
| 기업 담당자 | `company@lighthouse.test`  |
| 투자자      | `investor@lighthouse.test` |
| 투자자      | `peer@lighthouse.test`     |

로그인·세션 복원·로그아웃은 스켈레톤에 포함되어 있습니다. 업무 API는 서버가 확인한 인증 사용자 정보를 기준으로 권한을 검사해야 합니다. 클라이언트가 전달한 사용자 ID나 역할을 신뢰하면 안 됩니다. 다른 사용자로 로그인하거나 Plugin에 다시 진입했을 때 이전 사용자의 데이터·캐시·작성 중인 입력이 섞이지 않아야 합니다.

| 행동                                 | 기업 담당자 | 투자자 |
| ------------------------------------ | ----------- | ------ |
| 데이터룸·자료·검토 기준 조회         | 가능        | 가능   |
| 자료 등록                            | 가능        | 불가   |
| 자신의 검토 조회·작성·수정·현황 확인 | 불가        | 가능   |
| 다른 투자자의 검토 조회              | 불가        | 불가   |

기업 담당자가 비공개 검토 목록을 요청하면 빈 목록을 반환하고, 화면에서도 검토·현황 기능을 사용할 수 없다는 점을 알 수 있어야 합니다.
추가 입력 필드의 허용 범위를 정해 주세요. 쓰기 권한이 없는 요청은 입력값을 검증하기 전에 거부해야 합니다.

### 자료 등록·조회

- 제목과 UTF-8 `.txt` 또는 `.md` 파일을 등록할 수 있어야 합니다. 브라우저에서 파일을 UTF-8 문자열로 읽은 뒤 파일명·본문과 함께 JSON으로 전송합니다. multipart 업로드는 구현하지 않아도 됩니다. 전체 요청은 제공된 256KiB 제한을 넘지 않아야 하며, 필요하다면 더 엄격한 제약을 정할 수 있습니다.
- 자료의 상태는 `ready`(준비 완료), `processing`(처리 중), `failed`(처리 실패)를 구분합니다.
- 목록에 제목·상태를 표시하고 제목 검색을 제공합니다. 작성 시각 내림차순, 같은 시각이면 ID 오름차순으로 정렬합니다.
- 상세 제목·파일명·상태·본문을 확인할 수 있어야 합니다.

### 검토 작성·수정

- 초기 마이그레이션에 포함된 사업 이해·팀 구성·매출 현황 기준을 불러와야 합니다. 기준의 ID·이름·검토 질문은 고정되어 있습니다. 기준 조회 API와 화면 연결은 직접 구현하되, 기준 생성·수정 기능은 구현하지 않아도 됩니다.
- 기준마다 `확인함(satisfied)` 또는 `추가 확인 필요(needs_information)`와 1~2000자의 의견을 저장합니다. 공백뿐인 의견은 거부합니다.
- 같은 데이터룸의 `ready` 자료를 하나 이상 근거로 연결합니다. 파일명이 아닌 자료 ID로 연결하며, 중복·없는 자료·다른 룸·처리 중·실패 자료는 거부합니다.
- 저장한 검토를 다시 열고 수정할 수 있어야 합니다. 투자자 한 명의 기준별 검토는 한 개이며 수정해도 같은 검토로 유지됩니다.
- 검토 내용과 근거 자료는 구분해 관리합니다. 자료 등록 성공만으로 해당 기준을 충족했다고 판단하지 않습니다.

### 선택 구현: AI 검토 초안

필수 기능을 완료한 뒤, 투자자가 **검토 기준과 등록된 자료를 바탕으로 검토 초안을 생성**하는 기능을 선택적으로 구현할 수 있습니다.

- 현재 데이터룸의 `ready` 자료만 사용해 기준별 판단, 의견과 근거 자료 ID를 제안합니다.
- 생성 결과는 검토 입력 화면의 **초안**으로 표시합니다. 투자자가 내용을 확인·수정하고 저장하기 전에는 검토 데이터와 현황에 반영하지 않습니다.
- 존재하지 않거나 다른 데이터룸에 속한 자료, `processing`·`failed` 자료를 근거로 제안하거나 저장하지 않습니다. 최종 저장 시에는 수동 작성과 같은 서버 검증을 적용합니다.
- 생성 중·실패·재시도 상태를 구분하고, AI 기능이 실패해도 수동 검토 작성 흐름은 사용할 수 있어야 합니다.
- 모델·프롬프트·검색 방식은 자유입니다. 특정 모델이나 벡터 DB 사용 자체보다 자료와 판단의 연결, 결과를 검증한 방법, 선택 이유를 확인합니다. 실행에 필요한 설정과 재현 방법을 제출 문서에 남기되 비밀 값은 포함하지 마세요.

이 기능은 선택 사항이며 별도 가산점이 없습니다. 필수 기능의 미완료를 대체하지 않습니다.

### 검토 현황

- 현재 투자자가 작성한 기준 수와 미작성 기준 수를 보여주고, 검토 내용과 연결된 근거 자료로 이동할 수 있어야 합니다.
- `추가 확인 필요`는 작성한 검토입니다. 미작성·확인함과 구분하며, 모든 기준을 작성했다고 모두 확인된 것은 아닙니다.
- 현황은 개인의 검토 진행 상태이며 회사 전체의 합의나 투자 승인 상태가 아닙니다.

## 공통 완료 조건

- **화면:** 로딩·오류·빈 결과를 구분합니다. 조회 실패를 자료 없음이나 검토 완료로 표시하지 않습니다. 등록·저장 성공 후 목록·현황·화면 이동에 반영하고, 실패하면 입력을 보존해 재시도할 수 있게 합니다.
- **사용성:** 상세 주소 새로고침과 Plugin 재진입을 처리합니다. 작은 화면, 폼 레이블, 키보드 접근을 지원합니다. 한국어 UI와 제공된 typed 문자열·스타일 토큰·UI scale을 사용하며 신규 영어 번역 완성도는 평가하지 않습니다.
- **저장:** 자료·검토·근거 연결은 PostgreSQL에 저장하고 API 재시작·DB 재연결 후에도 보존합니다. 샘플 JSON은 초기 입력이며 런타임 저장소가 아닙니다. 관계형 데이터를 JSON 덩어리 하나나 브라우저 저장소로 대체하지 않습니다.
- **일관성:** 검토 수정과 근거 교체는 한 트랜잭션으로 처리합니다. 중간 실패 시 기존 내용과 근거가 보존되고, 동시 저장에서도 검토 중복이나 서로 섞인 근거 목록이 생기지 않아야 합니다.
- **오류·데이터 보호:** 다른 투자자·자료실의 데이터가 응답에 노출되거나 근거로 연결되지 않아야 합니다. 잘못된 입력, 미인증, 권한 없음, 없는 자료·기준, 저장 실패를 구분하고 성공이나 빈 결과로 대체하지 않습니다.
- **DB 변경:** SQL은 파라미터 바인딩을 사용합니다. 적용한 마이그레이션을 덮어쓰거나 데이터를 지워 변경을 해결하지 않고 새 마이그레이션으로 남깁니다.
- **검증:** 권한·입력·오류·영속화·롤백·동시성·사용자 흐름을 검증하는 테스트를 직접 작성합니다. 프론트엔드 브라우저 테스트는 제공된 Playwright를 사용합니다. 테스트 데이터와 DB 격리·초기화 방법, 실행 명령·결과·미검증 범위를 제출합니다. mock과 실제 API·DB 검증을 구분하고, DB 연결 실패를 메모리 저장소의 성공으로 대체하지 않습니다.

새 라이브러리가 필요하다면 선택 이유를 설명하고 사용할 수 있습니다. 코드의 가독성과 필요한 검증을 우선해 주세요.

## 제외 범위

회원가입·외부 OAuth·메일 인증·초대·MFA·계정 복구, workspace 및 데이터룸 생성·삭제, 자료 삭제, 검토 기준 생성·수정, Plugin 설치 관리 UI, 실제 파일 스토리지, PDF·OCR·파일 변환, 실시간 협업·결제·클라우드 배포는 요구하지 않습니다.

샘플의 `processing`·`failed` 자료는 상태 표시와 근거 검증을 위한 고정 데이터입니다. 비동기 처리, 자동 상태 전환과 재시도 기능은 구현하지 않아도 됩니다. 업로드가 성공한 UTF-8 자료는 바로 `ready`로 저장할 수 있습니다.

## 진행·제출·평가

구현을 시작하기 전에 스켈레톤 코드를 살펴보고 **이해한 과제, 확인이 필요한 점과 가정, 구현 순서**를 공유해 주세요.
과제를 진행하는 동안 AI 도구를 적극적으로 활용해도 됩니다.
진행 중 질문과 범위에 대해 협의할 수 있습니다.
최종 코드는 GitHub로 제출해 주세요. 여러 커밋으로 나누어도 됩니다.

결과물에 대한 설명도 GitHub에 함께 남겨 주세요. 별도 양식은 없습니다.

- 실행·계정·DB 초기화 방법, 완료·미완료 범위, 대략적인 작업 시간과 별도의 환경 대응 시간.
- 구현 과정에서 달라진 서비스 이해와 그 근거, 주요 설계 판단과 대안. Plugin·Gen-TS 활용과 API·DB·UI 연결을 실제 코드로 설명해 주세요.
- 직접 작성한 테스트의 실행 명령·결과·한계. AI 활용 사례 2~3개에는 제공한 맥락, 실제 입력·응답 일부 또는 관련 변경, 채택·수정 판단과 검증 근거를 함께 적어 주세요.

| 평가 항목                 | 비중 | 확인할 내용                                                                                   |
| ------------------------- | ---: | --------------------------------------------------------------------------------------------- |
| Plugin·Gen-TS 이해와 확장 |  35% | 제공된 코드 이해, API에서 생성 TS·React Query·화면까지의 연결, 본체와 Plugin의 책임·호출 경계 |
| API·DB 모델 설계          |  35% | 제품 규칙에 맞는 계약·권한·모델·제약·저장 일관성                                              |
| UI 작성과 사용자 흐름     |  30% | 직접 구현한 업무 화면, 등록→검토→현황 흐름, 상태·오류 처리·사용성                             |

---

## 제출 결과

### 과제 이해와 구현 범위

이 구현은 workspace를 데이터룸의 접근 경계로 삼고, 회사가 공유한 자료를 투자자가 개인 검토의 근거로 연결하는 흐름을 완성합니다. 호스트 애플리케이션의 **DataRoom**은 자료 등록·목록·검색·상세를 담당하고, **Review Plugin**은 검토 기준·개인 검토·근거·진행 현황을 담당합니다. 로그인·세션, Plugin 로더와 수명주기, manifest, Plugin SDK의 호출 경계는 제공된 구조를 유지했습니다.

구현한 필수 범위는 다음과 같습니다.

- 회사와 투자자의 자료 목록·제목 검색·상태·상세 조회
- 회사 전용 UTF-8 `.txt`·`.md` 자료 등록
- 회사와 투자자의 검토 기준 조회
- 투자자별 검토 작성·수정, `ready` 자료 근거 연결, 개인 진행 현황
- workspace·역할·검토 작성자 기준의 서버 권한 검사
- PostgreSQL 영속화, 검토와 근거의 원자적 저장, 동시 저장 충돌 처리
- URL 직접 접근·새로고침·뒤로 가기, 로딩·오류·빈 결과·재시도 UI
- 실제 API·PostgreSQL을 사용하는 백엔드 통합 테스트와 Playwright E2E

선택 기능인 AI 검토 초안 생성은 구현하지 않았습니다. 회원가입, workspace 생성·삭제, 자료 삭제, 비동기 파일 처리 등 원문의 제외 범위도 구현하지 않았습니다.

### 실행, 계정과 데이터베이스

Docker Compose v2와 `make`가 준비된 환경에서 다음과 같이 실행합니다.

```sh
make dev
```

브라우저에서 <http://localhost:5178/>에 접속합니다. 기본 계정과 비밀번호는 과제 원문에 기재된 다음 값을 사용합니다.

| 역할 | 이메일 | 비밀번호 |
| --- | --- | --- |
| 회사 | `company@lighthouse.test` | `dataroom` |
| 투자자 | `investor@lighthouse.test` | `dataroom` |
| 동료 투자자 | `peer@lighthouse.test` | `dataroom` |

API 시작 시 `api/migrations/`의 SQLx 마이그레이션이 순서대로 적용됩니다.

- `0001_review_criteria.sql`: 고정 검토 기준 3개
- `0002_auth.sql`: `lighthouse` workspace, 세 계정, 역할과 세션
- `0003_dataroom.sql`: 자료·검토·근거 테이블과 샘플 자료 4개
- `0004_review_revision.sql`: 낙관적 동시성 제어용 `revision`

`make stop`은 컨테이너를 중지하되 DB 볼륨을 보존합니다. `make reset-db`는 기본 DB 볼륨을 삭제하므로 데이터를 완전히 초기화해야 하는 로컬 개발 상황에서만 사용해야 합니다. 제출 검증에서는 기존 DB나 테스트 볼륨에 이 명령을 사용하지 않았습니다.

### lighthouse 환경과 E2E 환경

기본 `dataroom-interview` Compose 프로젝트의 `lighthouse` workspace는 과제 기능을 직접 확인하는 환경입니다. `api/migrations/0002_auth.sql`과 `0003_dataroom.sql`의 세 계정, 기준 3개, 샘플 자료 4개를 사용합니다.

쓰기 E2E는 기본 환경과 분리한 `dataroom-e2e-it` Compose 프로젝트와 `dataroom-e2e-it_platform-pg-data` 볼륨에서 실행했습니다. `tests/e2e-fixture.sql`은 그 DB 안에서도 별도 `e2e` workspace와 전용 회사·투자자·동료 투자자를 준비합니다. 백엔드 통합 테스트는 별도 `dataroom-backend-it` 프로젝트와 `dataroom-backend-it_platform-pg-data` 볼륨을 사용하고, 실행마다 고유한 workspace와 사용자를 생성합니다. 두 테스트 환경은 기본 `dataroom-interview` DB와 포트·Compose 프로젝트·볼륨이 다릅니다.

### 책임과 연결 구조

DataRoom과 Review Plugin은 다음 경계를 유지합니다.

- `api/src/dataroom/`: 자료 RPC, 자료 검증과 workspace·회사 역할 검사
- `web/src/dataroom/`: 호스트의 자료 목록·등록·상세 UI
- `plugins/review/server/`: 검토 기준·개인 검토 RPC와 저장 트랜잭션
- `plugins/review/ui/`: Plugin 내부의 기준·진행 현황·검토 편집·근거 UI

업무 계약은 다음 경로로 연결됩니다.

1. `api/src/dataroom/types.rs`와 `plugins/review/server/types.rs`의 Serde/`ts-rs` DTO가 JSON 필드와 타입의 원본입니다.
2. `scripts/gen-ts.sh`와 `scripts/finish-gen-ts.mjs`가 `api-client/src/types/`에 TypeScript 타입을 생성합니다.
3. 호스트는 `api-client`의 DataRoom RPC handler를 사용하고, Plugin은 `plugin-sdk/index.ts`의 `PluginHost.call`을 사용합니다.
4. `plugins/review/ui/api.ts`는 Review RPC와 `{ target: "dataroom" }` 자료 RPC를 typed 함수로 감쌉니다.
5. `web/src/dataroom/`과 `plugins/review/ui/`는 React Query로 조회·저장 상태와 캐시 무효화를 관리하고 UI를 렌더링합니다.

Plugin은 임의의 HTTP 경로나 별도 전역 상태를 만들지 않았습니다. 자료 근거 조회도 Plugin SDK의 `host.call`을 통해 호스트 DataRoom RPC 경계를 사용합니다. Query key는 `plugin-sdk/index.ts`의 `scopedKey`로 사용자 ID와 workspace ID를 포함하며, `plugin-sdk/react.tsx`는 Plugin unmount 시 전용 QueryClient를 취소하고 비웁니다.

### 업무 API 계약

모든 업무 호출은 기존 RPC endpoint를 사용하고 `workspaceId`, `method`, `params`를 전달합니다.

| 대상 | method | 주요 입력 | 주요 응답 |
| --- | --- | --- | --- |
| DataRoom | `listDocuments` | `search?: string` | `DocumentSummary[]` |
| DataRoom | `getDocument` | `documentId` | `DocumentDetail` |
| DataRoom | `createDocument` | `title`, `fileName`, `content` | 생성된 `DocumentDetail` |
| Review | `listCriteria` | 빈 객체 | `ReviewCriterion[]` |
| Review | `listReviews` | 빈 객체 | 인증 투자자의 `Review[]` |
| Review | `saveReview` | 기준·판단·의견·근거 ID·`expectedRevision` | 저장된 `Review` |

`Review.revision`과 `SaveReviewParams.expectedRevision`은 Rust에서 `i64`지만 JavaScript 안전 범위 안의 DB 증가값으로 사용하며 Gen-TS에서는 각각 `number`, `number | null`로 생성합니다. 잘못된 입력은 400, 미인증은 401, 역할·workspace 위반은 403, 없는 자료는 404, revision 충돌은 409로 구분합니다.

### DB 모델, 관계와 인덱스

`api/migrations/0003_dataroom.sql`은 다음 관계를 정의합니다.

- `documents`: workspace의 자료. 상태는 `ready`, `processing`, `failed` 중 하나입니다.
- `reviews`: workspace·투자자·기준별 하나의 개인 검토입니다.
- `review_evidence`: 검토와 자료의 다대다 연결입니다.

주요 제약은 다음과 같습니다.

- 자료 제목 1자 이상 200자 이하, 파일명 1자 이상 255자 이하, 본문 최대 204800바이트
- 파일명은 경로 구분자를 허용하지 않고 `.txt` 또는 `.md` 확장자만 허용
- 판단은 `satisfied` 또는 `needs_information`, 의견은 공백이 아닌 1자 이상 2000자 이하
- `(workspace_id, investor_id, criterion_id)` UNIQUE로 중복 검토 방지
- 복합 FK `(workspace_id, review_id)`와 `(workspace_id, document_id)`로 다른 workspace 자료 연결 방지
- 근거 PK `(review_id, document_id)`로 중복 연결 방지, 검토 삭제 시 근거 CASCADE
- 자료 목록 정렬용 `(workspace_id, created_at DESC, id ASC)` 인덱스
- 대소문자를 무시한 제목 접두 검색용 `(workspace_id, LOWER(title) TEXT_PATTERN_OPS)` 인덱스
- 검토 조회용 `(workspace_id, investor_id)`, 역방향 근거 조회용 `(workspace_id, document_id)` 인덱스

투자자 역할, `ready` 근거, 최소 한 개 근거 같은 규칙은 여러 행 또는 인증 문맥이 필요하므로 API 트랜잭션에서 추가로 검사합니다.

### 인증, 역할과 데이터 격리

세션 middleware가 서명된 `dr_session` 쿠키를 해석해 `AuthenticatedUser`를 request extension에 넣습니다. 클라이언트가 보낸 사용자 ID나 역할은 신뢰하지 않습니다.

- 모든 DataRoom·Review RPC는 요청 `workspaceId`와 인증 사용자의 workspace를 먼저 비교합니다.
- 자료 조회 SQL은 항상 인증 사용자의 `workspace_id`를 조건으로 사용합니다.
- 자료 등록은 company만 허용하고 권한을 입력 검증보다 먼저 검사합니다.
- 검토 저장은 investor만 허용하며 `investor_id`는 요청이 아니라 인증 사용자 ID를 사용합니다.
- 회사의 비공개 검토 목록 요청은 200과 빈 목록을 반환하지만 저장은 403입니다.
- 투자자는 자신의 검토만 조회·수정할 수 있고 다른 투자자의 검토 ID를 직접 지정할 계약이 없습니다.

### 파일과 요청 크기

브라우저는 `TextDecoder("utf-8", { fatal: true })`로 파일을 읽어 잘못된 UTF-8을 거부합니다. UI와 API 모두 제목·파일명·확장자·NUL 문자·본문 204800바이트 제한을 검사하고 DB CHECK가 마지막 방어선 역할을 합니다.

Axum의 전체 요청 제한은 256KiB입니다. 본문이 204800바이트 이하여도 JSON escaping과 `workspaceId`, method, 제목, 파일명 오버헤드에 따라 전체 요청이 커질 수 있으므로 `web/src/dataroom/api.ts`가 실제 직렬화한 요청의 UTF-8 바이트 수를 계산하고 UI가 256KiB 초과 요청을 전송 전에 거부합니다. 서버의 413도 별도 오류로 표시합니다. DB 본문 상한과 HTTP 전체 요청 상한은 서로 다른 제약으로 유지했습니다.

### 검토 저장과 동시성

`saveReview`는 하나의 PostgreSQL 트랜잭션에서 다음 순서로 실행됩니다.

1. `workspace_id:user_id:criterion_id`에서 만든 키로 `pg_advisory_xact_lock`을 획득합니다.
2. 검토 기준, 중복 없는 근거 ID, 동일 workspace의 `ready` 자료, 최소 한 개 근거를 확인합니다.
3. 기존 검토는 `expectedRevision`과 현재 revision이 일치할 때만 갱신하고 revision을 1 증가시킵니다.
4. 기존 근거를 삭제하고 새 근거를 삽입한 뒤 commit합니다.

검증이나 근거 삽입이 실패하면 트랜잭션 전체가 rollback되어 기존 검토와 근거가 보존됩니다. advisory lock은 동일 투자자의 동일 기준에 대한 최초 동시 INSERT도 직렬화하므로 한 요청의 본문과 다른 요청의 근거가 섞이지 않습니다. revision은 서로 다른 브라우저에서 읽은 오래된 편집을 409로 거부합니다. UI는 로컬 입력을 유지한 채 최신 서버 검토를 보여주고, 사용자가 최신 내용 적용 또는 현재 입력 재시도를 선택할 수 있게 합니다.

대안으로 SERIALIZABLE 격리 수준과 전체 요청 재시도, `INSERT ... ON CONFLICT` 후 행 잠금, 검토마다 별도 version token을 고려할 수 있습니다. 현재 방식은 잠금 범위가 동일 사용자·기준으로 좁고 최초 생성과 수정 모두 같은 흐름으로 처리할 수 있어 선택했습니다. 목록의 검토 본문과 근거는 단일 `LEFT JOIN`/`ARRAY_AGG` SQL로 조회해 한 statement snapshot을 사용합니다.

### 명시적으로 선택한 동작

- 제목 검색은 앞뒤 공백을 제거하고 대소문자를 무시하는 **접두 검색**입니다. 인덱스로 지원할 수 있고 현재 과제 데이터에서 예측 가능한 결과를 제공하기 위해 선택했습니다.
- 자료 목록은 `created_at DESC`, 동률이면 `id ASC`입니다.
- 정상 등록된 자료는 비동기 처리 없이 즉시 `ready`가 됩니다.
- 근거 선택 목록에는 동일 workspace의 `ready` 자료만 표시하고 서버에서도 다시 검증합니다.
- 검토 기준은 회사와 투자자 모두 조회할 수 있지만 회사에는 개인 현황·작성 UI를 제공하지 않습니다.
- 조회 실패, 빈 목록, 로딩, 저장 실패를 서로 다른 상태로 표시하며 실패 시 폼 state를 초기화하지 않습니다.

### 구현 전 이해와 구현 중 보완

구현 전에는 DataRoom이 자료를, Review Plugin이 검토와 현황을 소유하고, workspace와 인증 사용자 역할을 모든 서버 호출의 경계로 사용한다고 이해했습니다. 또한 제공된 RPC·Plugin loader·Gen-TS 흐름을 확장하고 새 HTTP 경로를 만들지 않는 방향을 공유했습니다. 이 가정은 실제 구현에서도 유지됐습니다.

구현 과정에서 과제 원문과 테스트 결과를 근거로 다음을 구체화했습니다.

- 회사가 비공개 검토 목록을 요청할 때 403이 아니라 200 빈 목록이어야 함을 반영하고, 기준 조회는 회사와 투자자 모두 사용할 수 있도록 별도 `listCriteria` method로 분리했습니다.
- 이미 적용된 `0003`을 수정하지 않고 revision을 `0004_review_revision.sql`로 추가했습니다.
- 동일 투자자의 최초 동시 생성은 단순 UNIQUE와 revision만으로 충분하지 않아 transaction advisory lock을 추가했습니다.
- `listReviews`의 본문과 근거를 별도 쿼리로 읽으면 중간 commit을 섞어 볼 수 있어 단일 집계 SQL로 변경했습니다.
- 204800바이트 DB 상한만 확인해서는 JSON escaping으로 256KiB 요청을 넘을 수 있어 직렬화된 전체 요청 크기 검사를 UI에 추가했습니다.

### 테스트 전략과 결과

테스트는 기본 `lighthouse` 데이터를 변경하지 않도록 두 개의 격리 Compose 프로젝트를 사용했습니다. 아래 결과는 2026-10-29에 확인했습니다.

#### Rust 단위 테스트

```sh
cargo fmt --manifest-path api/Cargo.toml -- --check
cargo test --locked --manifest-path api/Cargo.toml --lib
```

결과: 포맷 검사 통과, 단위 테스트 3개 통과. 자료 본문 바이트 경계, 파일명 검증, 검토 의견 검증을 확인합니다.

#### 실제 PostgreSQL 백엔드 통합 테스트

`api/tests/backend_api.rs`는 `INTEGRATION_TEST_ALLOW_WRITES=isolated-compose-volume` guard와 별도 `INTEGRATION_DATABASE_URL` 없이는 쓰기 테스트를 거부합니다.

```sh
INTEGRATION_TEST_ALLOW_WRITES=isolated-compose-volume \
INTEGRATION_DATABASE_URL=postgres://dataroom_interview:dataroom_interview@127.0.0.1:5551/dataroom_interview \
cargo test --locked --manifest-path api/Cargo.toml --test backend_api -- --ignored --nocapture
```

결과: 통합 테스트 1개 통과. 한 테스트 안에서 실제 인증 세션과 Axum router를 사용해 401·403·404·400·409, workspace 경계, 두 투자자 격리, rollback, 최초 동시 생성, 동시 수정, 근거 불혼합을 검증합니다.

#### TypeScript와 생성 계약

```sh
make check-gen-ts-docker
pnpm typecheck
pnpm build
```

결과: 공식 Gen-TS write 후 check mode 일치, 직접 작성·수정한 파일의 Prettier·ESLint 검사, `pnpm typecheck`, `pnpm build` 통과. 전체 `pnpm lint`는 기존 스켈레톤 41개 파일의 Prettier 차이로 실패했으므로 통과 결과에 포함하지 않았습니다.

#### 실제 브라우저 E2E

`tests/dataroom-review.spec.ts`와 `tests/e2e-fixture.sql`을 직접 작성했습니다. request mocking이나 route interception 없이 실제 웹·API·PostgreSQL을 사용합니다.

```sh
docker compose -p dataroom-e2e-it --profile test run --rm --no-deps playwright
```

결과: Desktop Chrome 3개와 Pixel 7 3개, 총 6개 통과. 회사 자료 등록·검색·정렬·상세와 Review 읽기 전용 화면, 투자자 검토 작성·수정·근거·현황, peer 격리, 직접 URL·새로고침·뒤로 가기, 입력 오류 보존, 두 브라우저 context의 409 충돌, 주요 Enter 조작, console 오류와 가로 overflow를 확인합니다.

자동화하지 않은 범위는 임의의 네트워크 단절·서버 500 주입, 완전히 빈 workspace의 브라우저 E2E, 모든 요소의 전체 Tab 순서와 스크린 리더 감사입니다. 로딩·조회 오류·빈 결과·저장 실패·입력 보존 UI 자체는 구현돼 있으며, 이 세 항목은 기능 미구현이 아니라 추가 자동화 범위입니다. DB 프로세스 자체를 재시작하는 E2E는 수행하지 않았지만 모든 업무 데이터는 PostgreSQL에만 저장하며 브라우저 새로고침과 API 재진입 후 조회를 검증했습니다.

### AI 활용 사례

이 구현에서는 OpenAI Codex를 코드 분석, 구현, 검증 보조에 사용했습니다. 아래는 이 작업 기록에서 확인 가능한 사례만 정리한 것입니다.

#### 1. DB 모델과 제약 설계

- **제공한 맥락:** `documents`, `reviews`, `review_evidence` 요구사항과 “다른 workspace 자료를 근거로 연결하지 못하도록 복합 외래키를 설계”하라는 요청을 제공했습니다.
- **AI 제안 또는 변경:** workspace를 포함한 UNIQUE와 복합 FK, 상태·길이 CHECK, 정렬·검색 인덱스가 포함된 `0003_dataroom.sql`을 작성했습니다.
- **채택·수정 판단:** 인증 문맥이 필요한 investor 역할, `ready` 및 최소 한 개 근거는 DB CHECK만으로 표현하지 않고 API 검증으로 분리했습니다. 이미 적용된 마이그레이션은 수정하지 않는 원칙에 따라 revision은 `0004`로 분리했습니다.
- **검증 근거:** 실제 PostgreSQL 마이그레이션 적용, catalog 제약 확인, 샘플 4건 확인과 백엔드 통합 테스트를 사용했습니다.

#### 2. 동시 저장과 조회 일관성

- **제공한 맥락:** “동일 투자자의 최초 동시 생성과 기존 검토의 동시 수정”, “검토 내용과 근거가 서로 다른 요청 사이에서 섞이지 않게” 해 달라는 요청을 제공했습니다.
- **AI 제안 또는 변경:** advisory transaction lock, revision 비교·증가, 검토와 근거 교체 트랜잭션을 구현하고 `listReviews`를 단일 집계 SQL로 변경했습니다.
- **채택·수정 판단:** revision만으로 보호되지 않는 최초 INSERT까지 동일한 잠금 규칙으로 처리하는 방식을 채택했습니다. 조회에는 장시간 REPEATABLE READ transaction보다 단일 statement snapshot을 선택했습니다.
- **검증 근거:** 실제 PostgreSQL에서 최초 동시 생성, 동시 수정, stale revision 409, rollback, 근거 불혼합을 통합 테스트로 검증했습니다.

#### 3. UI와 실제 브라우저 검증

- **제공한 맥락:** Plugin SDK·생성 DTO·`host.call`/`host.navigate`를 유지하면서 등록·검토·409·URL·모바일·키보드 흐름을 구현하고, 실제 API·DB E2E를 작성하도록 요청했습니다.
- **AI 제안 또는 변경:** DataRoom 호스트 UI와 Review Plugin UI를 분리하고 React Query 상태 처리, conflict UI, 전용 E2E fixture와 두 browser context 테스트를 작성했습니다.
- **채택·수정 판단:** 기존 UI Kit, loader, SDK, manifest는 변경하지 않았고 E2E selector는 실제 접근 가능한 label·role 중심으로 조정했습니다. 기본 DB 대신 별도 Compose 프로젝트와 workspace를 사용했습니다.
- **검증 근거:** typecheck·lint·production build와 Desktop Chrome/Pixel 7 Playwright 6개 통과 결과를 확인했습니다.

### 작업 시간

- 전체 작업 시간: **약 30시간** (GitHub Fork 이후 기준). 스켈레톤 구조와 기존 코드 이해, 기능 설계·구현, Codex·ChatGPT를 활용한 코드 작성·검토, 개발환경 구성과 테스트·최종 검증 시간을 모두 포함한 대략적인 추정치입니다.
- Docker·환경 설정 및 테스트 대응 시간: **약 16시간**으로 위 30시간에 포함됩니다. Docker 실행 및 개발환경 설정 약 1시간, 테스트·오류 분석·수정 및 최종 검증 약 15시간입니다. 나머지 약 14시간은 스켈레톤과 기존 코드 이해, 기능 설계·구현, AI 도구를 활용한 코드 작성과 검토에 사용했습니다.

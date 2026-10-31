# Dataroom 과제 제출 문서

자료 등록 → 근거 연결 → 검토 작성·수정 → 현황 확인까지 필수 기능을 모두 구현했고, 끝난 뒤 선택 구현인 AI 검토 초안도 붙였습니다.

## 실행 전에

제출 직전에 GitHub에서 새로 clone해서 돌려 봤더니 web 컨테이너가 뜨지 않았습니다. `compose.yaml`이 `ui-kit`을 읽기 전용으로 마운트하는데, pnpm이 그 안의 `node_modules`에 의존성을 연결하지 못해서였습니다. 제 PC에는 첫날 환경을 맞추면서 만든 설정이 남아 있어서 그동안 몰랐습니다.

`compose.yaml`은 그대로 두고, docker compose가 자동으로 같이 읽는 `compose.override.yaml`에서 그 폴더에만 쓰기 가능한 볼륨을 붙였습니다. 마운트할 자리가 clone에도 남도록 `ui-kit/node_modules/.gitkeep`을 넣었고, Windows에서 받으면 셸 스크립트 줄바꿈이 CRLF로 바뀌어 멈추는 것도 `.gitattributes`로 막았습니다. 새로 clone한 상태에서 `make dev`와 E2E 24개가 통과하는 것까지 확인했으니, 따로 하실 일은 없습니다.

## 실행

```sh
make dev          # http://localhost:5178/
make test-e2e
make check-docker
make reset-db     # DB 초기화. 이후 make dev로 다시 켜면 0001~0004 마이그레이션과 시드가 적용됨
docker compose exec api cargo test --manifest-path api/Cargo.toml   # Rust 테스트
```

제 개발 환경은 Windows라 `make`가 없어서, Makefile의 각 타깃이 실행하는 docker compose 명령을 그대로 입력해 작업했습니다. Makefile과 스크립트는 수정하지 않았으니 README대로 `make`를 쓰시면 됩니다.
계정 비밀번호는 모두 `dataroom`입니다. `company@lighthouse.test`로 자료를 올리고, `investor@lighthouse.test`로 검토를 쓴 다음, `peer@lighthouse.test`로 들어가서 앞 투자자의 검토가 안 보이는지 확인하시면 흐름이 한 번에 보입니다. 올려 볼 파일은 `samples/revenue-update.md`를 쓰시면 됩니다. 일부러 시드에는 넣지 않았습니다.

0003 마이그레이션에 `samples/scenario.json`의 데이터룸 설명과 자료 4건을 넣었습니다. 상태는 ready 2건, failed 1건, processing 1건입니다. 브라우저 테스트를 여러 번 돌리면 테스트 자료가 목록에 쌓이니, 깨끗한 화면이 필요하면 `make reset-db` 후 다시 켜 주세요.

AI 초안은 키가 없어도 앱이 정상 동작하고, 그 경우 화면에 "설정되지 않음"이 표시됩니다. 써 보시려면 루트에 `.env`(git 제외)를 만들어 `ANTHROPIC_API_KEY`를 넣고 `docker compose up -d api`로 api만 다시 켜면 됩니다. 모델은 기본 `claude-opus-5-5`이고 `REVIEW_DRAFT_MODEL`로 바꿀 수 있습니다.

## 완료 / 미완료

README의 필수 기능과 공통 완료 조건은 전부 구현했습니다. 테스트는 Rust 33개, Playwright 24개입니다.

하지 않은 것은 세 가지입니다. AI 초안 요청 횟수·비용 제한(지금은 버튼 중복 클릭만 막음), 제목 부분 검색용 `pg_trgm` 인덱스(현재 자료 수에서는 불필요하다고 판단), JSON 자체가 깨진 요청의 오류 형식(Axum 기본 응답이 그대로 나가는데, 스켈레톤 라우터 영역이라 손대지 않음)입니다.

확인하지 못한 것도 있습니다. 키가 없어서 실제 Claude API는 호출해 보지 못했고 가짜 서버로만 검증했습니다. `make`를 거친 실행은 제 환경에서 해 보지 못했고, 같은 명령을 직접 실행해 확인했습니다. 스크린리더 실기기와 대용량 성능도 확인하지 못했습니다.

## 작업 시간

전체 4일 정도 걸렸습니다. 첫날은 거의 스켈레톤을 읽는 데 썼습니다. Plugin 로더, `host.call`이 어디로 가는지, Gen-TS가 무엇을 생성하는지 따라가는 데 생각보다 오래 걸렸습니다. 이틀째와 사흘째에 자료, 검토, 현황을 만들고 테스트를 붙였고, 마지막 날에 AI 초안과 전체 재검토, 문서 정리를 했습니다.

환경 대응에는 따로 반나절 정도 썼습니다. 처음에는 CRLF 줄바꿈 때문에 셸 스크립트가 컨테이너에서 `set: illegal option -`로 죽었습니다. `core.autocrlf=input`으로 다시 받았더니, 이번에는 SQLx가 적용된 마이그레이션 1번의 체크섬이 다르다며 기동을 거부해서 로컬 DB 볼륨을 새로 만들었습니다. 그 밖에 PATH에 docker가 없었고 make도 없었으며, Windows 바인드 마운트에서 파일 변경 감지가 안 돼서 Plugin UI를 고칠 때마다 web 컨테이너를 재시작해야 했습니다. 모두 로컬 설정으로만 해결했고 저장소 파일은 건드리지 않았습니다.

체크섬 오류는 지금도 기억에 남습니다. "적용한 마이그레이션을 덮어쓰지 말라"는 README 문장을 그냥 규칙으로만 읽었는데, 내용이 같아도 줄바꿈 하나에 DB가 거부하는 걸 보고 나서야 왜 그런 규칙이 있는지 알게 됐습니다.

## 만들면서 바뀐 이해

처음에는 자료를 올리고 댓글을 다는 게시판 정도로 생각했습니다. 테이블을 그리다가 자료와 검토를 어떻게 연결할지에서 막혔고, README를 다시 읽으면서 생각이 바뀌었습니다.

"자료 등록 성공만으로 해당 기준을 충족했다고 판단하지 않습니다"라는 문장을 보고, 자료는 근거 후보일 뿐이고 충족 여부는 투자자가 따로 판단한다는 걸 알았습니다. 그래서 `reviews`와 `review_evidence`를 분리했고, 근거는 검토를 저장할 때만 연결되게 했습니다.

"추가 확인 필요는 작성한 검토"라는 문장은 현황에 "썼는가"와 "어떻게 판단했는가" 두 축이 있다는 뜻이었습니다. 그래서 현황을 작성 / 미작성 / 확인함 / 추가 확인 필요 네 칸으로 나눴습니다. "현황은 개인의 검토 진행 상태"라는 문장에 따라 검토를 읽는 모든 쿼리는 세션 사용자의 것만 읽습니다.

samples의 processing·failed 자료도 처음엔 상태 표시 예시로 봤는데, 다시 보니 "근거로 쓰면 안 되는 자료가 실제로 섞여 있다"는 걸 시험하는 데이터였습니다. 그래서 이 규칙은 API뿐 아니라 DB 제약으로도 막았습니다.

## 설계 판단

**Plugin·Gen-TS.** 스켈레톤의 Gen-TS는 응답 DTO만 내보내기 때문에, Plugin에서는 `host.call<T>("method")`의 T를 손으로 맞춰야 했습니다. 그래서 Rust에 메서드별 계약을 정의해 Gen-TS로 함께 내보내고, SDK에 그 계약에서 타입을 추론하는 `createRpcClient`를 추가했습니다. 기존 `host.call`은 건드리지 않았습니다.

```rust
// plugins/review/server/types.rs
pub struct ReviewRpcContract {
    pub list_criteria: RpcSignature<(), CriteriaResponse>,
    pub get_my_progress: RpcSignature<(), MyProgressResponse>,
    pub save_review: RpcSignature<SaveReviewParams, ReviewDetail>,
    // health, list_my_reviews, draft_review ...
}
```

```ts
// plugin-sdk/index.ts
export function createRpcClient<C extends RpcContract>(
  host: PluginHost,
  target?: "dataroom",
): RpcClient<C> {
  return function call<M extends keyof C & string>(method: M, params: C[M]["params"], options?) {
    return host.call<C[M]["result"]>(method, params, { ...options, target });
  };
}
```

이렇게 하면 `review("saveReview", params)`에서 params와 반환 타입이 계약에서 정해지고, 메서드 이름 오타나 필드 누락은 컴파일 에러가 됩니다. `RpcSignature`는 `ts-bridge` feature에서만 컴파일되므로 서버 런타임에는 영향이 없습니다.

Plugin이 근거 선택에 필요한 자료 목록은 Plugin 서버가 documents를 직접 조회하지 않고, `target: "dataroom"`으로 본체 `listDocuments`를 재사용했습니다. 자료 접근 규칙을 한 곳에 두기 위해서입니다. 현황에서 근거 자료로 이동하는 링크도 Plugin이 본체 URL을 직접 만들지 않게 SDK에 `documentHref`·`openDocument`를 추가했습니다.

React Query 쪽은 스켈레톤의 `scopedKey`를 그대로 써서 캐시 키에 사용자와 workspace가 들어가게 했습니다. 그래서 계정이 바뀌어도 캐시가 섞이지 않습니다. 현황 키를 검토 목록 키 아래에 두어서, 저장 후 `invalidateQueries` 한 번으로 목록과 현황이 함께 갱신됩니다.

**API·DB.** 가장 오래 고민한 부분은 "ready 자료만 근거"를 어디서 지킬지였습니다. API 검사에 더해 `review_evidence`에 `CHECK (document_status = 'ready')` 컬럼을 두고, `(workspace_id, document_id, document_status)`가 documents를 참조하도록 복합 외래키를 걸었습니다.

```sql
document_status TEXT NOT NULL DEFAULT 'ready' CHECK (document_status = 'ready'),
PRIMARY KEY (review_id, document_id),
FOREIGN KEY (review_id, workspace_id) REFERENCES reviews (id, workspace_id) ON DELETE CASCADE,
FOREIGN KEY (workspace_id, document_id, document_status) REFERENCES documents (workspace_id, id, status)
```

없는 자료, 다른 룸 자료, processing·failed 자료는 API를 우회해도 FK 위반으로 거부됩니다. 처음엔 API에서 막는데 DB에서 또 막는 게 과하다고 생각했습니다. 그런데 AI 초안을 붙이면서 근거 ID가 모델 출력에서 들어오는 경로가 생겼고, 그때 마지막 방어선이 DB에 있다는 게 의미 있다고 느꼈습니다. 비용은 documents의 `UNIQUE(workspace_id, id, status)` 인덱스 하나입니다. 트리거도 검토했지만 절차적 코드라 검증하기가 더 어렵다고 봤습니다.

기준당 검토 1개는 `UNIQUE(workspace_id, investor_id, criterion_id)`와 `INSERT ... ON CONFLICT DO UPDATE`로 처리했습니다. 조회 후 분기하는 방식은 동시 첫 저장에서 중복 행이 생길 수 있기 때문입니다. 두 탭에서 같은 검토를 고치는 경우에는 `version` 컬럼으로 낙관적 잠금을 걸었습니다. 마지막 저장이 이기는 방식은 앞선 수정을 조용히 덮어쓰고, 비관적 잠금은 폼을 오래 열어 두는 웹에 맞지 않는다고 판단했습니다.

```rust
// plugins/review/server/mod.rs, save_review
let mut tx = pool.begin().await?;
// 기준 존재 확인, 근거 자료 SELECT ... FOR SHARE로 상태 확인
"INSERT INTO reviews (...) VALUES ($1, $2, $3, $4, $5)
 ON CONFLICT (workspace_id, investor_id, criterion_id) DO UPDATE
 SET verdict = EXCLUDED.verdict, comment = EXCLUDED.comment, version = reviews.version + 1
 WHERE reviews.version = $6
 RETURNING id"                                   // 0행이면 409 review_conflict
"DELETE FROM review_evidence WHERE review_id = $1"
"INSERT INTO review_evidence ... SELECT $1, $2, unnest($3::text[])"
tx.commit().await?;
```

검토 수정과 근거 교체는 한 트랜잭션입니다. 중간에 `?`로 빠지면 `Transaction`이 drop되면서 롤백됩니다. 근거는 최대 20개라 diff 대신 전부 지우고 다시 넣었습니다. 현황은 기준·검토·근거·자료를 한 문장으로 LEFT JOIN해서 읽습니다. 여러 쿼리로 나누면 그 사이에 다른 저장이 끼어 숫자가 어긋날 수 있기 때문입니다.

권한은 항상 입력 검증보다 먼저 봅니다. 사용자 정보는 스켈레톤 인증 계층이 세션에서 만든 `AuthenticatedUser`만 쓰고, `uploaded_by`도 서버가 채웁니다. 다른 룸 자료는 존재 여부가 드러나지 않게 403 대신 404로 응답하고, 요청 파라미터에는 `deny_unknown_fields`를 걸어 클라이언트가 필드를 끼워 넣지 못하게 했습니다. 자료 목록 인덱스는 정렬 순서와 같은 `(workspace_id, created_at DESC, id) INCLUDE (title, status)`로 만들었습니다.

**UI.** 신경 쓴 건 입력을 잃지 않는 것이었습니다. 편집기는 처음 열 때의 값으로 한 번만 초기화하고, 이후 서버 재조회(창 포커스 refetch 등)로 덮어쓰지 않습니다. 저장이 실패하거나 버전 충돌이 나도 입력이 그대로 남고, 충돌 시에는 "다른 곳에서 먼저 저장됨"과 함께 최신 내용을 불러올 수 있습니다. 검증에 실패하면 첫 번째 잘못된 칸으로 포커스를 옮깁니다. 편집기는 `key={사용자:기준}`으로 마운트해서 계정을 바꾸면 이전 입력이 남지 않습니다. 로딩·오류·빈 결과는 각각 다른 화면으로 구분했습니다.

## 테스트

```sh
docker compose exec api cargo test --manifest-path api/Cargo.toml
# 33 passed (단위 10, dataroom_api 7, review_api 11, review_draft 5)
make test-e2e
# 24 passed, 1.7분 (시나리오 12개 × Chromium 데스크톱·Pixel 7)
```

11월 1일에 다시 실행한 결과입니다. `make check-docker`가 실행하는 생성 타입 일치 검사("Gen-TS matches Rust declarations."), web lint·build, `cargo fmt --check`·`cargo check`도 통과했습니다.

Rust 통합 테스트는 `#[sqlx::test]`로 테스트마다 임시 DB를 만들어 실제 PostgreSQL에서 돌립니다. 권한(투자자 등록이 입력 검증 전에 403, 투자자 간 검토 비공개, 다른 룸 자료 은닉), 입력(공백 의견, 2000/2001자, 잘못된 근거), 영속화(새 커넥션 풀로 재조회), DB 제약(SQL로 직접 넣어도 거부), 롤백(근거 INSERT를 트리거로 실패시켜 앞선 UPDATE까지 되돌려지는지), 동시성을 확인합니다.

동시성 테스트에서 한 번 배운 게 있습니다. 처음에는 요청 두 개를 동시에 보내는 테스트를 만들었고 통과했습니다. 그런데 다시 검토해 보니 두 요청이 우연히 순서대로 실행돼도 통과하는 테스트였습니다. 그래서 다른 트랜잭션이 행을 `FOR UPDATE`로 먼저 잡고, `pg_stat_activity`에서 저장 요청이 실제로 Lock 대기 중인지 확인한 다음 커밋해서, 기다리던 요청이 409를 받는지 보는 테스트를 추가했습니다. 다섯 번 연속 통과했습니다.

Playwright는 실제 개발 DB를 쓰고, 실행마다 고유 토큰을 제목·의견에 붙여 그 데이터만 확인합니다. 시나리오는 등록부터 현황까지의 흐름, 새로고침, 두 탭 충돌 시 입력 보존, 계정 전환 격리, AI 초안입니다. 서버 500 상황 2개와 AI 응답 2개만 `page.route`로 모의했고, 테스트 이름에 표시해 두었습니다. AI 시나리오에서도 저장과 현황은 실제 API·DB를 거칩니다.

한계도 있습니다. E2E가 개발 DB를 공유해서 테스트 데이터가 쌓이므로 전용 DB로 분리하는 게 다음 과제입니다. Rust `match`의 메서드 문자열과 계약 필드 이름이 일치하는지는 컴파일러가 보장하지 못해서, 통합 테스트가 모든 메서드를 호출하는 것으로 대신 확인하고 있습니다.

## AI 초안 (선택)

투자자가 "AI 초안 만들기"를 누르면 이 룸의 ready 자료만 Claude에 보내고, 판단·의견·근거 ID를 받아 폼에만 채웁니다. 저장하기 전에는 DB와 현황에 반영되지 않고, 저장할 때는 직접 작성과 같은 `saveReview` 검증을 거칩니다. 생성 중·실패·재시도·적용됨(되돌리기 가능)을 구분하고, AI가 실패해도 직접 작성은 그대로 할 수 있습니다.

없는 자료를 근거로 대지 않게 하려고, 출력 JSON 스키마에서 근거 ID를 이번에 보낸 ID만 담은 `enum`으로 제한했습니다. 서버도 응답을 다시 걸러 범위 밖 ID와 중복을 버리고, 마지막에는 DB FK가 막습니다. 기업이 올린 문서 안의 지시문을 따르지 않도록 시스템 프롬프트에 문서는 평가 대상이지 지시가 아니라고 명시했습니다.

벡터 검색은 쓰지 않았습니다. 텍스트 자료 몇 건이라 전부 컨텍스트에 넣을 수 있고, 예산을 넘으면 최신 자료부터 통째로 넣은 뒤 빠진 개수를 화면에 알립니다. Rust 공식 SDK가 없어서 `reqwest`로 Messages API를 직접 호출합니다. 가짜 Claude 서버를 띄워 요청 형식, ready 자료만 보내는지, 실패 다섯 가지, 저장되지 않는지를 테스트했지만 실제 API 호출은 하지 못했습니다.

## AI 활용 사례

### 1. "ready 자료만 근거"를 DB에서도 막기

자료 테이블을 만들면서 이 규칙을 어디서 지킬지 대안을 비교했습니다.

> 정석: API에서 `status = 'ready'`인지 조회해 검사합니다. 개선: 근거 테이블에 `CHECK (document_status = 'ready')` 컬럼을 두고 `(workspace_id, document_id, document_status)`로 …

API 검사만 하는 방법, 트리거, 상태까지 묶은 복합 외래키 중에서 복합 외래키를 골랐습니다. 트리거보다 검증이 쉽고 비용은 UNIQUE 인덱스 하나입니다. 이어진 검토에서 공백만 있는 제목과 NUL 문자 문제가 나와, DB로 막을 수 있는 건 CHECK 제약으로, 못 막는 NUL은 API 검증으로 나눠 고쳤습니다. API를 거치지 않은 SQL INSERT도 거부되는지 `database_rejects_evidence_that_bypasses_the_api` 테스트로 확인합니다.

### 2. 통과하던 동시성 테스트 다시 짜기

필수 기능을 마치고 README와 항목별로 다시 대조하면서 동시성 테스트도 다시 봤습니다.

> 기존 `tokio::join!` 테스트는 두 요청이 순서대로 실행돼도 통과할 수 있었습니다.

통과는 했지만 겹쳤을 때 안전하다는 증거는 아니었습니다. 그래서 다른 트랜잭션이 행을 `FOR UPDATE`로 잡고, `pg_stat_activity`에서 저장 요청이 실제로 Lock 대기 중인지 확인한 뒤 풀어서, 기다리던 저장이 409를 받는지 보는 테스트를 추가했습니다. 다섯 번 연속 통과했습니다.

## 스켈레톤에서 지운 부분

기존 코드는 추가만 하는 걸 원칙으로 했고, 지운 줄은 다음이 전부입니다. `not_implemented`와 `return null` 같은 빈 자리, 미사용 표시(`_pool` 등), `health` 예제 화면(README가 업무 기능이 아닌 예제라고 해서 업무 화면으로 교체, API는 유지), `shell.tsx`에서 `DataroomApp`에 session을 넘긴 한 줄, `reqwest` 추가로 바뀐 `Cargo.lock`입니다. 새 라이브러리는 `reqwest` 하나입니다.

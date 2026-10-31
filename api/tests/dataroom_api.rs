//! Data room RPC against a real PostgreSQL database. `#[sqlx::test]` creates a fresh database per
//! test and applies every migration (including the seed data), so tests never share state.
mod common;

use common::{add_other_workspace, company, failure, investor, room};
use serde_json::{Value, json};
use sqlx::{
    PgPool,
    postgres::{PgConnectOptions, PgPoolOptions},
};

fn ids(list: &Value) -> Vec<&str> {
    list["documents"]
        .as_array()
        .unwrap()
        .iter()
        .map(|document| document["id"].as_str().unwrap())
        .collect()
}

#[sqlx::test]
async fn lists_newest_first_and_breaks_ties_by_id(pool: PgPool) {
    sqlx::raw_sql(
        "INSERT INTO documents (id, workspace_id, title, file_name, status, content, uploaded_by, created_at)
         VALUES ('tie-b', 'lighthouse', '동시각 B', 'b.md', 'ready', 'b', 'company-user', '2026-09-02T00:00:00Z'),
                ('tie-a', 'lighthouse', '동시각 A', 'a.md', 'ready', 'a', 'company-user', '2026-09-02T00:00:00Z');",
    )
    .execute(&pool)
    .await
    .unwrap();
    let list = room(&pool, &investor(), "listDocuments", Value::Null)
        .await
        .unwrap();
    assert_eq!(
        ids(&list),
        [
            "tie-a",
            "tie-b",
            "doc-pipeline",
            "doc-revenue",
            "doc-team",
            "doc-business"
        ]
    );
}

#[sqlx::test]
async fn search_matches_titles_and_treats_wildcards_literally(pool: PgPool) {
    let found = room(
        &pool,
        &investor(),
        "listDocuments",
        json!({ "query": " 소개 " }),
    )
    .await
    .unwrap();
    assert_eq!(ids(&found), ["doc-team", "doc-business"]);

    let wildcard = room(&pool, &investor(), "listDocuments", json!({ "query": "%" }))
        .await
        .unwrap();
    assert!(ids(&wildcard).is_empty(), "% must not match every title");

    let ready = room(
        &pool,
        &investor(),
        "listDocuments",
        json!({ "status": "ready" }),
    )
    .await
    .unwrap();
    assert_eq!(ids(&ready), ["doc-team", "doc-business"]);
}

#[sqlx::test]
async fn investor_upload_is_forbidden_before_input_is_validated(pool: PgPool) {
    let result = room(
        &pool,
        &investor(),
        "createDocument",
        json!({ "bogus": true }),
    )
    .await;
    assert_eq!(failure(result), (403, "forbidden"));
}

#[sqlx::test]
async fn company_upload_is_ready_attributed_and_listed_first(pool: PgPool) {
    let created = room(
        &pool,
        &company(),
        "createDocument",
        json!({ "title": "  매출 현황 보완 ", "fileName": "revenue-update.md", "content": "# 매출\n600만 원" }),
    )
    .await
    .unwrap();
    assert_eq!(created["title"], "매출 현황 보완");
    assert_eq!(created["status"], "ready");
    assert_eq!(created["uploaderName"], "김서연");
    assert_eq!(created["content"], "# 매출\n600만 원");

    let list = room(&pool, &investor(), "listDocuments", Value::Null)
        .await
        .unwrap();
    assert_eq!(ids(&list)[0], created["id"].as_str().unwrap());
}

#[sqlx::test]
async fn upload_rejects_invalid_input(pool: PgPool) {
    let cases = [
        json!({ "title": "   ", "fileName": "a.md", "content": "x" }),
        json!({ "title": "가".repeat(201), "fileName": "a.md", "content": "x" }),
        json!({ "title": "a", "fileName": "a.pdf", "content": "x" }),
        json!({ "title": "a", "fileName": "../a.md", "content": "x" }),
        json!({ "title": "a", "fileName": "a.md", "content": " \n " }),
        json!({ "title": "a", "fileName": "a.md", "content": "a\u{0}b" }),
        json!({ "title": "a", "fileName": "a.md", "content": "a".repeat(200 * 1024 + 1) }),
        json!({ "title": "a", "fileName": "a.md", "content": "x", "uploadedBy": "investor-user" }),
    ];
    for params in cases {
        let result = room(&pool, &company(), "createDocument", params.clone()).await;
        assert_eq!(failure(result), (400, "invalid_input"), "{params}");
    }
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM documents")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 4, "rejected uploads must not be stored");
}

#[sqlx::test]
async fn other_workspace_documents_stay_hidden(pool: PgPool) {
    add_other_workspace(&pool).await;
    let detail = room(
        &pool,
        &investor(),
        "getDocument",
        json!({ "documentId": "doc-other" }),
    )
    .await;
    assert_eq!(failure(detail), (404, "not_found"));

    let list = room(&pool, &investor(), "listDocuments", Value::Null)
        .await
        .unwrap();
    assert!(!ids(&list).contains(&"doc-other"));

    // Asking for another workspace's data room is refused even though the session is valid.
    let result = dataroom_api::dataroom::dispatch(
        &pool,
        &investor(),
        dataroom_api::types::DataroomRpcRequest {
            workspace_id: "other".into(),
            method: "listDocuments".into(),
            params: Value::Null,
        },
    )
    .await
    .map(|response| response.result);
    assert_eq!(failure(result), (403, "forbidden"));
}

#[sqlx::test]
async fn uploaded_documents_survive_a_reconnect(
    pool_options: PgPoolOptions,
    connect_options: PgConnectOptions,
) {
    let pool = pool_options
        .clone()
        .connect_with(connect_options.clone())
        .await
        .unwrap();
    let created = room(
        &pool,
        &company(),
        "createDocument",
        json!({ "title": "재연결 확인", "fileName": "persist.txt", "content": "보존" }),
    )
    .await
    .unwrap();
    pool.close().await;

    let reconnected = pool_options.connect_with(connect_options).await.unwrap();
    let detail = room(
        &reconnected,
        &investor(),
        "getDocument",
        json!({ "documentId": created["id"] }),
    )
    .await
    .unwrap();
    assert_eq!(detail["content"], "보존");
}

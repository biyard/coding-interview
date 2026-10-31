//! AI review drafts against a real PostgreSQL database and a stand-in for the Claude Messages API,
//! so the HTTP call, the server-side checks and every failure path run without a key or cost.
mod common;

use std::sync::{Arc, Mutex};

use axum::{Json, Router, http::HeaderMap, http::StatusCode, routing::post};
use common::{add_other_workspace, company, failure, investor, review};
use dataroom_api::plugins::review::{
    draft::{DraftModel, draft_review},
    types::DraftReviewParams,
};
use serde_json::{Value, json};
use sqlx::PgPool;

#[derive(Clone, Default)]
struct Captured(Arc<Mutex<Vec<(HeaderMap, Value)>>>);

impl Captured {
    fn requests(&self) -> Vec<(HeaderMap, Value)> {
        self.0.lock().unwrap().clone()
    }
}

/// Serves one fixed reply on `/v1/messages` and records what it was sent.
async fn fake_claude(status: StatusCode, reply: Value) -> (String, Captured) {
    let captured = Captured::default();
    let recorder = captured.clone();
    let app = Router::new().route(
        "/v1/messages",
        post(move |headers: HeaderMap, Json(body): Json<Value>| {
            let recorder = recorder.clone();
            let reply = reply.clone();
            async move {
                recorder.0.lock().unwrap().push((headers, body));
                (status, Json(reply))
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (format!("http://{address}"), captured)
}

fn message(stop_reason: &str, draft: Value) -> Value {
    json!({
        "id": "msg_test",
        "type": "message",
        "role": "assistant",
        "model": "claude-opus-5-5",
        "content": [
            { "type": "thinking", "thinking": "", "signature": "sig" },
            { "type": "text", "text": draft.to_string() },
        ],
        "stop_reason": stop_reason,
        "usage": { "input_tokens": 10, "output_tokens": 10 },
    })
}

fn params(criterion: &str) -> DraftReviewParams {
    DraftReviewParams {
        criterion_id: criterion.into(),
    }
}

fn model(base_url: &str) -> DraftModel {
    DraftModel::new(base_url, Some("test-key".into()), "claude-opus-5-5")
}

async fn review_count(pool: &PgPool) -> i64 {
    sqlx::query_scalar("SELECT COUNT(*) FROM reviews")
        .fetch_one(pool)
        .await
        .unwrap()
}

#[sqlx::test]
async fn draft_uses_only_ready_documents_of_this_room_and_stores_nothing(pool: PgPool) {
    add_other_workspace(&pool).await;
    let (url, captured) = fake_claude(
        StatusCode::OK,
        message(
            "end_turn",
            json!({
                "verdict": "needs_information",
                "comment": "팀 소개 자료로 개발 인력은 확인했지만 영업 담당자가 없습니다.",
                // An injected or hallucinated id from outside the sent set must be dropped.
                "evidence_document_ids": ["doc-team", "doc-team", "doc-pipeline", "doc-other"],
            }),
        ),
    )
    .await;

    let draft = draft_review(&pool, &investor(), params("team"), &model(&url))
        .await
        .unwrap();
    assert_eq!(draft.criterion_id, "team");
    assert_eq!(draft.verdict.as_str(), "needs_information");
    let ids: Vec<_> = draft
        .evidence
        .iter()
        .map(|e| e.document_id.as_str())
        .collect();
    assert_eq!(ids, ["doc-team"]);
    assert_eq!(draft.discarded_evidence_count, 3);
    assert_eq!(draft.considered_document_count, 2);
    assert_eq!(draft.model, "claude-opus-5-5");

    let requests = captured.requests();
    assert_eq!(requests.len(), 1);
    let (headers, body) = &requests[0];
    assert_eq!(headers["x-api-key"], "test-key");
    assert_eq!(headers["anthropic-version"], "2026-10-21");
    let prompt = body["messages"][0]["content"].as_str().unwrap();
    assert!(prompt.contains("id=\"doc-team\"") && prompt.contains("id=\"doc-business\""));
    for hidden in ["doc-pipeline", "doc-revenue", "doc-other", "비공개"] {
        assert!(
            !prompt.contains(hidden),
            "{hidden} must not reach the model"
        );
    }
    let allowed = &body["output_config"]["format"]["schema"]["properties"]["evidence_document_ids"]
        ["items"]["enum"];
    let mut allowed: Vec<&str> = allowed
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    allowed.sort();
    assert_eq!(allowed, ["doc-business", "doc-team"]);

    // A draft is only a suggestion until the investor saves it.
    assert_eq!(review_count(&pool).await, 0);
    let progress = review(&pool, &investor(), "getMyProgress", Value::Null)
        .await
        .unwrap();
    assert_eq!(progress["summary"]["writtenCount"], 0);
}

#[sqlx::test]
async fn saving_a_draft_goes_through_the_normal_review_validation(pool: PgPool) {
    let (url, _) = fake_claude(
        StatusCode::OK,
        message(
            "end_turn",
            json!({
                "verdict": "satisfied",
                "comment": "회사 소개에서 구독 모델을 확인했습니다.",
                "evidence_document_ids": ["doc-business"],
            }),
        ),
    )
    .await;
    let draft = draft_review(&pool, &investor(), params("business"), &model(&url))
        .await
        .unwrap();
    let ids: Vec<&str> = draft
        .evidence
        .iter()
        .map(|e| e.document_id.as_str())
        .collect();

    let saved = review(
        &pool,
        &investor(),
        "saveReview",
        json!({
            "criterionId": draft.criterion_id,
            "verdict": draft.verdict,
            "comment": draft.comment,
            "evidenceDocumentIds": ids,
            "expectedVersion": null,
        }),
    )
    .await
    .unwrap();
    assert_eq!(saved["version"], 1);
    // An edited draft that adds a document still cannot link one that is not ready.
    let rejected = review(
        &pool,
        &investor(),
        "saveReview",
        json!({
            "criterionId": "business",
            "verdict": "satisfied",
            "comment": "수정한 초안",
            "evidenceDocumentIds": ["doc-business", "doc-pipeline"],
            "expectedVersion": 1,
        }),
    )
    .await;
    assert_eq!(failure(rejected), (400, "evidence_not_ready"));
}

#[sqlx::test]
async fn only_investors_can_draft_and_role_is_checked_before_input(pool: PgPool) {
    let result = review(&pool, &company(), "draftReview", json!({ "bogus": true })).await;
    assert_eq!(failure(result), (403, "forbidden"));
    let result = review(&pool, &investor(), "draftReview", json!({ "bogus": true })).await;
    assert_eq!(failure(result), (400, "invalid_input"));
}

#[sqlx::test]
async fn missing_criterion_or_configuration_fails_without_calling_the_model(pool: PgPool) {
    let (url, captured) = fake_claude(StatusCode::OK, json!({})).await;
    let error = draft_review(&pool, &investor(), params("nope"), &model(&url))
        .await
        .unwrap_err();
    assert_eq!((error.0.as_u16(), error.1), (404, "criterion_not_found"));

    let unconfigured = DraftModel::new(&url, None, "claude-opus-5-5");
    let error = draft_review(&pool, &investor(), params("team"), &unconfigured)
        .await
        .unwrap_err();
    assert_eq!((error.0.as_u16(), error.1), (503, "ai_unavailable"));

    sqlx::query("UPDATE documents SET status = 'failed' WHERE status = 'ready'")
        .execute(&pool)
        .await
        .unwrap();
    let error = draft_review(&pool, &investor(), params("team"), &model(&url))
        .await
        .unwrap_err();
    assert_eq!((error.0.as_u16(), error.1), (400, "no_ready_documents"));
    assert!(captured.requests().is_empty());
}

#[sqlx::test]
async fn model_failures_are_reported_as_distinct_errors(pool: PgPool) {
    let cases = [
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            json!({ "type": "error" }),
            "ai_failed",
        ),
        (StatusCode::OK, message("refusal", json!({})), "ai_refused"),
        (
            StatusCode::OK,
            message("max_tokens", json!({})),
            "ai_failed",
        ),
        (
            StatusCode::OK,
            message(
                "end_turn",
                json!({ "verdict": "maybe", "comment": "", "evidence_document_ids": [] }),
            ),
            "ai_invalid_output",
        ),
    ];
    for (status, reply, kind) in cases {
        let (url, _) = fake_claude(status, reply).await;
        let error = draft_review(&pool, &investor(), params("team"), &model(&url))
            .await
            .unwrap_err();
        assert_eq!((error.0.as_u16(), error.1), (502, kind));
    }
    // Unreachable model API.
    let error = draft_review(
        &pool,
        &investor(),
        params("team"),
        &model("http://127.0.0.1:9"),
    )
    .await
    .unwrap_err();
    assert_eq!((error.0.as_u16(), error.1), (502, "ai_failed"));
    assert_eq!(review_count(&pool).await, 0);
}

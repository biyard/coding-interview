use std::time::{SystemTime, UNIX_EPOCH};

use argon2::{Argon2, PasswordHasher, password_hash::SaltString};
use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Method, Request, StatusCode, header},
};
use dataroom_api::{app, db};
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;

#[derive(Debug)]
struct TestResponse {
    status: StatusCode,
    body: Value,
    cookie: Option<String>,
}

async fn request(
    router: &Router,
    method: Method,
    uri: &str,
    cookie: Option<&str>,
    body: Value,
) -> TestResponse {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json");
    if let Some(cookie) = cookie {
        builder = builder.header(header::COOKIE, cookie);
    }
    let response = router
        .clone()
        .oneshot(builder.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let cookie = response
        .headers()
        .get_all(header::SET_COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .find(|value| value.starts_with("dr_session="))
        .and_then(|value| value.split(';').next())
        .map(str::to_owned);
    let bytes = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
    let body = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap()
    };
    TestResponse {
        status,
        body,
        cookie,
    }
}

async fn login(router: &Router, email: &str) -> String {
    let response = request(
        router,
        Method::POST,
        "/api/auth/login",
        None,
        json!({ "email": email, "password": "dataroom" }),
    )
    .await;
    assert_eq!(response.status, StatusCode::OK, "{response:?}");
    response.cookie.expect("login must issue a session cookie")
}

fn dataroom_request(workspace_id: &str, method: &str, params: Value) -> Value {
    json!({
        "workspaceId": workspace_id,
        "method": method,
        "params": params,
    })
}

fn review_request(workspace_id: &str, method: &str, params: Value) -> Value {
    json!({
        "pluginId": "review",
        "workspaceId": workspace_id,
        "method": method,
        "params": params,
    })
}

async fn dataroom_rpc(
    router: &Router,
    cookie: Option<&str>,
    workspace_id: &str,
    method: &str,
    params: Value,
) -> TestResponse {
    request(
        router,
        Method::POST,
        "/api/dataroom/rpc",
        cookie,
        dataroom_request(workspace_id, method, params),
    )
    .await
}

async fn review_rpc(
    router: &Router,
    cookie: Option<&str>,
    workspace_id: &str,
    method: &str,
    params: Value,
) -> TestResponse {
    request(
        router,
        Method::POST,
        "/api/plugins/rpc",
        cookie,
        review_request(workspace_id, method, params),
    )
    .await
}

fn assert_error(response: &TestResponse, status: StatusCode, kind: &str) {
    assert_eq!(response.status, status, "{response:?}");
    assert_eq!(response.body["kind"], kind, "{response:?}");
}

fn review<'a>(response: &'a TestResponse, criterion_id: &str) -> &'a Value {
    response.body["result"]["reviews"]
        .as_array()
        .unwrap()
        .iter()
        .find(|review| review["criterionId"] == criterion_id)
        .unwrap_or_else(|| panic!("criterion {criterion_id} missing from {response:?}"))
}

async fn seed_fixtures(pool: &PgPool, run: &str) -> Fixture {
    let salt = SaltString::encode_b64(format!("integration-{run}").as_bytes()).unwrap();
    let password_hash = Argon2::default()
        .hash_password(b"dataroom", &salt)
        .unwrap()
        .to_string();
    let fixture = Fixture {
        workspace: format!("it-{run}"),
        other_workspace: format!("it-other-{run}"),
        company_id: format!("it-company-{run}"),
        investor_id: format!("it-investor-{run}"),
        peer_id: format!("it-peer-{run}"),
        company_email: format!("company-{run}@integration.test"),
        investor_email: format!("investor-{run}@integration.test"),
        peer_email: format!("peer-{run}@integration.test"),
        document_a: format!("it-doc-a-{run}"),
        document_b: format!("it-doc-b-{run}"),
        rollback_document: format!("it-doc-rollback-{run}"),
        failed_document: format!("it-doc-failed-{run}"),
        other_document: format!("it-doc-other-{run}"),
    };

    let mut tx = pool.begin().await.unwrap();
    sqlx::query("INSERT INTO workspaces (id, name) VALUES ($1, $2), ($3, $4)")
        .bind(&fixture.workspace)
        .bind("Integration workspace")
        .bind(&fixture.other_workspace)
        .bind("Other integration workspace")
        .execute(&mut *tx)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO users (id, email, display_name, password_hash)
         VALUES ($1, $2, 'Integration company', $3),
                ($4, $5, 'Integration investor', $3),
                ($6, $7, 'Integration peer', $3)",
    )
    .bind(&fixture.company_id)
    .bind(&fixture.company_email)
    .bind(&password_hash)
    .bind(&fixture.investor_id)
    .bind(&fixture.investor_email)
    .bind(&fixture.peer_id)
    .bind(&fixture.peer_email)
    .execute(&mut *tx)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO workspace_users (workspace_id, user_id, role)
         VALUES ($1, $2, 'company'), ($1, $3, 'investor'), ($1, $4, 'investor')",
    )
    .bind(&fixture.workspace)
    .bind(&fixture.company_id)
    .bind(&fixture.investor_id)
    .bind(&fixture.peer_id)
    .execute(&mut *tx)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO documents (id, workspace_id, title, file_name, content, status)
         VALUES ($1, $2, 'Evidence A', 'a.md', 'A', 'ready'),
                ($3, $2, 'Evidence B', 'b.md', 'B', 'ready'),
                ($4, $2, 'Rollback evidence', 'rollback.md', 'rollback', 'ready'),
                ($5, $2, 'Failed evidence', 'failed.md', 'failed', 'failed'),
                ($6, $7, 'Other workspace evidence', 'other.md', 'other', 'ready')",
    )
    .bind(&fixture.document_a)
    .bind(&fixture.workspace)
    .bind(&fixture.document_b)
    .bind(&fixture.rollback_document)
    .bind(&fixture.failed_document)
    .bind(&fixture.other_document)
    .bind(&fixture.other_workspace)
    .execute(&mut *tx)
    .await
    .unwrap();
    tx.commit().await.unwrap();
    fixture
}

struct Fixture {
    workspace: String,
    other_workspace: String,
    company_id: String,
    investor_id: String,
    peer_id: String,
    company_email: String,
    investor_email: String,
    peer_email: String,
    document_a: String,
    document_b: String,
    rollback_document: String,
    failed_document: String,
    other_document: String,
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires INTEGRATION_DATABASE_URL pointing to an isolated PostgreSQL volume"]
async fn authenticated_api_enforces_boundaries_and_consistency() {
    assert_eq!(
        std::env::var("INTEGRATION_TEST_ALLOW_WRITES").as_deref(),
        Ok("isolated-compose-volume"),
        "refusing writes without the explicit isolated database guard"
    );
    let database_url = std::env::var("INTEGRATION_DATABASE_URL")
        .expect("set INTEGRATION_DATABASE_URL to the isolated PostgreSQL instance");
    let pool = db::connect(&database_url).await.unwrap();
    db::initialize(&pool).await.unwrap();

    let run = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos()
        .to_string();
    let fixture = seed_fixtures(&pool, &run).await;
    let router = app(pool.clone());

    let unauthorized = dataroom_rpc(
        &router,
        None,
        &fixture.workspace,
        "listDocuments",
        json!({}),
    )
    .await;
    assert_error(&unauthorized, StatusCode::UNAUTHORIZED, "not_authenticated");

    let company_cookie = login(&router, &fixture.company_email).await;
    let investor_cookie = login(&router, &fixture.investor_email).await;
    let peer_cookie = login(&router, &fixture.peer_email).await;

    let investor_create = dataroom_rpc(
        &router,
        Some(&investor_cookie),
        &fixture.workspace,
        "createDocument",
        json!({ "title": "", "fileName": "bad.pdf", "content": "" }),
    )
    .await;
    assert_error(&investor_create, StatusCode::FORBIDDEN, "forbidden");

    let company_review = review_rpc(
        &router,
        Some(&company_cookie),
        &fixture.workspace,
        "saveReview",
        json!({
            "criterionId": "business",
            "decision": "satisfied",
            "opinion": "",
            "evidenceDocumentIds": [],
            "expectedRevision": null
        }),
    )
    .await;
    assert_error(&company_review, StatusCode::FORBIDDEN, "forbidden");

    let company_list = review_rpc(
        &router,
        Some(&company_cookie),
        &fixture.workspace,
        "listReviews",
        json!({}),
    )
    .await;
    assert_eq!(company_list.status, StatusCode::OK, "{company_list:?}");
    assert_eq!(company_list.body["result"]["reviews"], json!([]));

    let invalid_document = dataroom_rpc(
        &router,
        Some(&company_cookie),
        &fixture.workspace,
        "createDocument",
        json!({ "title": "Invalid", "fileName": "bad.pdf", "content": "x" }),
    )
    .await;
    assert_error(&invalid_document, StatusCode::BAD_REQUEST, "invalid_input");

    let missing_document = dataroom_rpc(
        &router,
        Some(&investor_cookie),
        &fixture.workspace,
        "getDocument",
        json!({ "documentId": "missing-document" }),
    )
    .await;
    assert_error(&missing_document, StatusCode::NOT_FOUND, "not_found");

    let wrong_workspace = dataroom_rpc(
        &router,
        Some(&investor_cookie),
        &fixture.other_workspace,
        "listDocuments",
        json!({}),
    )
    .await;
    assert_error(&wrong_workspace, StatusCode::FORBIDDEN, "forbidden");

    let hidden_other_document = dataroom_rpc(
        &router,
        Some(&investor_cookie),
        &fixture.workspace,
        "getDocument",
        json!({ "documentId": fixture.other_document }),
    )
    .await;
    assert_error(&hidden_other_document, StatusCode::NOT_FOUND, "not_found");

    let invalid_review = review_rpc(
        &router,
        Some(&investor_cookie),
        &fixture.workspace,
        "saveReview",
        json!({
            "criterionId": "business",
            "decision": "satisfied",
            "opinion": "   ",
            "evidenceDocumentIds": [],
            "expectedRevision": null
        }),
    )
    .await;
    assert_error(&invalid_review, StatusCode::BAD_REQUEST, "invalid_input");

    let missing_criterion = review_rpc(
        &router,
        Some(&investor_cookie),
        &fixture.workspace,
        "saveReview",
        json!({
            "criterionId": "missing-criterion",
            "decision": "satisfied",
            "opinion": "valid",
            "evidenceDocumentIds": [fixture.document_a],
            "expectedRevision": null
        }),
    )
    .await;
    assert_error(&missing_criterion, StatusCode::NOT_FOUND, "not_found");

    let cross_workspace_evidence = review_rpc(
        &router,
        Some(&investor_cookie),
        &fixture.workspace,
        "saveReview",
        json!({
            "criterionId": "business",
            "decision": "satisfied",
            "opinion": "valid",
            "evidenceDocumentIds": [fixture.other_document],
            "expectedRevision": null
        }),
    )
    .await;
    assert_error(
        &cross_workspace_evidence,
        StatusCode::NOT_FOUND,
        "not_found",
    );

    let failed_evidence = review_rpc(
        &router,
        Some(&investor_cookie),
        &fixture.workspace,
        "saveReview",
        json!({
            "criterionId": "business",
            "decision": "satisfied",
            "opinion": "valid",
            "evidenceDocumentIds": [fixture.failed_document],
            "expectedRevision": null
        }),
    )
    .await;
    assert_error(&failed_evidence, StatusCode::BAD_REQUEST, "invalid_input");

    let create_business = review_rpc(
        &router,
        Some(&investor_cookie),
        &fixture.workspace,
        "saveReview",
        json!({
            "criterionId": "business",
            "decision": "satisfied",
            "opinion": "investor-only",
            "evidenceDocumentIds": [fixture.document_a],
            "expectedRevision": null
        }),
    )
    .await;
    assert_eq!(
        create_business.status,
        StatusCode::OK,
        "{create_business:?}"
    );

    let stale_revision = review_rpc(
        &router,
        Some(&investor_cookie),
        &fixture.workspace,
        "saveReview",
        json!({
            "criterionId": "business",
            "decision": "needs_information",
            "opinion": "stale",
            "evidenceDocumentIds": [fixture.document_b],
            "expectedRevision": 999
        }),
    )
    .await;
    assert_error(&stale_revision, StatusCode::CONFLICT, "conflict");

    let peer_before = review_rpc(
        &router,
        Some(&peer_cookie),
        &fixture.workspace,
        "listReviews",
        json!({}),
    )
    .await;
    assert_eq!(peer_before.status, StatusCode::OK, "{peer_before:?}");
    assert_eq!(peer_before.body["result"]["reviews"], json!([]));

    let create_team = review_rpc(
        &router,
        Some(&investor_cookie),
        &fixture.workspace,
        "saveReview",
        json!({
            "criterionId": "team",
            "decision": "satisfied",
            "opinion": "before rollback",
            "evidenceDocumentIds": [fixture.document_a],
            "expectedRevision": null
        }),
    )
    .await;
    assert_eq!(create_team.status, StatusCode::OK, "{create_team:?}");

    let constraint_name = format!("it_rollback_{run}");
    let rollback_guard = format!(
        "ALTER TABLE review_evidence ADD CONSTRAINT {constraint_name} CHECK (document_id <> '{}')",
        fixture.rollback_document
    );
    sqlx::query(&rollback_guard).execute(&pool).await.unwrap();

    let rollback_failure = review_rpc(
        &router,
        Some(&investor_cookie),
        &fixture.workspace,
        "saveReview",
        json!({
            "criterionId": "team",
            "decision": "needs_information",
            "opinion": "must roll back",
            "evidenceDocumentIds": [fixture.rollback_document],
            "expectedRevision": 1
        }),
    )
    .await;
    assert_error(
        &rollback_failure,
        StatusCode::INTERNAL_SERVER_ERROR,
        "storage_error",
    );

    let after_rollback = review_rpc(
        &router,
        Some(&investor_cookie),
        &fixture.workspace,
        "listReviews",
        json!({}),
    )
    .await;
    assert_eq!(after_rollback.status, StatusCode::OK, "{after_rollback:?}");
    let team = review(&after_rollback, "team");
    assert_eq!(team["revision"], 1);
    assert_eq!(team["opinion"], "before rollback");
    assert_eq!(team["evidenceDocumentIds"], json!([fixture.document_a]));

    let create_left = review_request(
        &fixture.workspace,
        "saveReview",
        json!({
            "criterionId": "revenue",
            "decision": "satisfied",
            "opinion": "create-left",
            "evidenceDocumentIds": [fixture.document_a],
            "expectedRevision": null
        }),
    );
    let create_right = review_request(
        &fixture.workspace,
        "saveReview",
        json!({
            "criterionId": "revenue",
            "decision": "needs_information",
            "opinion": "create-right",
            "evidenceDocumentIds": [fixture.document_b],
            "expectedRevision": null
        }),
    );
    let (create_one, create_two) = tokio::join!(
        request(
            &router,
            Method::POST,
            "/api/plugins/rpc",
            Some(&peer_cookie),
            create_left,
        ),
        request(
            &router,
            Method::POST,
            "/api/plugins/rpc",
            Some(&peer_cookie),
            create_right,
        )
    );
    let (create_success, create_conflict) = if create_one.status == StatusCode::OK {
        (&create_one, &create_two)
    } else {
        (&create_two, &create_one)
    };
    assert_eq!(create_success.status, StatusCode::OK, "{create_success:?}");
    assert_error(create_conflict, StatusCode::CONFLICT, "conflict");

    let created_review = &create_success.body["result"]["review"];
    let created_opinion = created_review["opinion"].clone();
    let created_evidence = created_review["evidenceDocumentIds"].clone();
    let peer_after_create = review_rpc(
        &router,
        Some(&peer_cookie),
        &fixture.workspace,
        "listReviews",
        json!({}),
    )
    .await;
    let revenue = review(&peer_after_create, "revenue");
    assert_eq!(revenue["revision"], 1);
    assert_eq!(revenue["opinion"], created_opinion);
    assert_eq!(revenue["evidenceDocumentIds"], created_evidence);

    let update_left = review_request(
        &fixture.workspace,
        "saveReview",
        json!({
            "criterionId": "revenue",
            "decision": "satisfied",
            "opinion": "update-left",
            "evidenceDocumentIds": [fixture.document_a],
            "expectedRevision": 1
        }),
    );
    let update_right = review_request(
        &fixture.workspace,
        "saveReview",
        json!({
            "criterionId": "revenue",
            "decision": "needs_information",
            "opinion": "update-right",
            "evidenceDocumentIds": [fixture.document_b],
            "expectedRevision": 1
        }),
    );
    let (update_one, update_two) = tokio::join!(
        request(
            &router,
            Method::POST,
            "/api/plugins/rpc",
            Some(&peer_cookie),
            update_left,
        ),
        request(
            &router,
            Method::POST,
            "/api/plugins/rpc",
            Some(&peer_cookie),
            update_right,
        )
    );
    let (update_success, update_conflict) = if update_one.status == StatusCode::OK {
        (&update_one, &update_two)
    } else {
        (&update_two, &update_one)
    };
    assert_eq!(update_success.status, StatusCode::OK, "{update_success:?}");
    assert_error(update_conflict, StatusCode::CONFLICT, "conflict");

    let updated_review = &update_success.body["result"]["review"];
    let updated_opinion = updated_review["opinion"].clone();
    let updated_evidence = updated_review["evidenceDocumentIds"].clone();
    let peer_after_update = review_rpc(
        &router,
        Some(&peer_cookie),
        &fixture.workspace,
        "listReviews",
        json!({}),
    )
    .await;
    let revenue = review(&peer_after_update, "revenue");
    assert_eq!(revenue["revision"], 2);
    assert_eq!(revenue["opinion"], updated_opinion);
    assert_eq!(revenue["evidenceDocumentIds"], updated_evidence);

    let investor_after_peer_writes = review_rpc(
        &router,
        Some(&investor_cookie),
        &fixture.workspace,
        "listReviews",
        json!({}),
    )
    .await;
    assert!(
        investor_after_peer_writes.body["result"]["reviews"]
            .as_array()
            .unwrap()
            .iter()
            .all(|review| review["criterionId"] != "revenue")
    );

    pool.close().await;
}

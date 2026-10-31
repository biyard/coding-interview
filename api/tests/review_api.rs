//! Review plugin RPC against a real PostgreSQL database (fresh database per test).
mod common;

use common::{add_other_workspace, company, failure, investor, peer, review};
use serde_json::{Value, json};
use sqlx::PgPool;

fn save(
    criterion: &str,
    verdict: &str,
    comment: &str,
    evidence: &[&str],
    expected: Option<i32>,
) -> Value {
    json!({
        "criterionId": criterion,
        "verdict": verdict,
        "comment": comment,
        "evidenceDocumentIds": evidence,
        "expectedVersion": expected,
    })
}

fn evidence_ids(review: &Value) -> Vec<&str> {
    review["evidence"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["documentId"].as_str().unwrap())
        .collect()
}

async fn stored_evidence(pool: &PgPool) -> Vec<String> {
    sqlx::query_scalar("SELECT document_id FROM review_evidence ORDER BY document_id")
        .fetch_all(pool)
        .await
        .unwrap()
}

#[sqlx::test]
async fn company_gets_an_empty_list_and_cannot_write_or_see_progress(pool: PgPool) {
    let list = review(&pool, &company(), "listMyReviews", Value::Null)
        .await
        .unwrap();
    assert_eq!(list, json!({ "reviews": [] }));
    assert_eq!(
        failure(review(&pool, &company(), "getMyProgress", Value::Null).await),
        (403, "forbidden")
    );
    // Forbidden wins over invalid input: the body is not even parsed.
    assert_eq!(
        failure(review(&pool, &company(), "saveReview", json!({ "bogus": true })).await),
        (403, "forbidden")
    );
    let criteria = review(&pool, &company(), "listCriteria", Value::Null)
        .await
        .unwrap();
    assert_eq!(criteria["criteria"].as_array().unwrap().len(), 3);
}

#[sqlx::test]
async fn saving_again_updates_the_same_review_and_replaces_evidence(pool: PgPool) {
    let created = review(
        &pool,
        &investor(),
        "saveReview",
        save(
            "team",
            "satisfied",
            "팀 확인",
            &["doc-team", "doc-business"],
            None,
        ),
    )
    .await
    .unwrap();
    assert_eq!(created["version"], 1);

    let updated = review(
        &pool,
        &investor(),
        "saveReview",
        save(
            "team",
            "needs_information",
            "영업 담당자 확인 필요",
            &["doc-team"],
            Some(1),
        ),
    )
    .await
    .unwrap();
    assert_eq!(updated["id"], created["id"], "still the same review");
    assert_eq!(updated["version"], 2);
    assert_eq!(updated["verdict"], "needs_information");
    assert_eq!(evidence_ids(&updated), ["doc-team"]);
    assert_eq!(
        stored_evidence(&pool).await,
        ["doc-team"],
        "evidence replaced, not appended"
    );
}

#[sqlx::test]
async fn stale_or_missing_versions_conflict_and_keep_the_saved_review(pool: PgPool) {
    review(
        &pool,
        &investor(),
        "saveReview",
        save("team", "satisfied", "v1", &["doc-team"], None),
    )
    .await
    .unwrap();
    review(
        &pool,
        &investor(),
        "saveReview",
        save("team", "satisfied", "v2", &["doc-team"], Some(1)),
    )
    .await
    .unwrap();

    let stale = review(
        &pool,
        &investor(),
        "saveReview",
        save("team", "satisfied", "old tab", &["doc-business"], Some(1)),
    )
    .await;
    assert_eq!(failure(stale), (409, "review_conflict"));
    let recreate = review(
        &pool,
        &investor(),
        "saveReview",
        save("team", "satisfied", "new tab", &["doc-business"], None),
    )
    .await;
    assert_eq!(failure(recreate), (409, "review_conflict"));

    let mine = review(&pool, &investor(), "listMyReviews", Value::Null)
        .await
        .unwrap();
    assert_eq!(mine["reviews"][0]["comment"], "v2");
    assert_eq!(stored_evidence(&pool).await, ["doc-team"]);
}

#[sqlx::test]
async fn evidence_must_be_existing_unique_ready_documents_of_this_room(pool: PgPool) {
    add_other_workspace(&pool).await;
    let cases: [(&[&str], (u16, &str)); 6] = [
        (&[], (400, "evidence_required")),
        (&["doc-team", "doc-team"], (400, "duplicate_evidence")),
        (&["doc-revenue"], (400, "evidence_not_ready")),
        (&["doc-pipeline"], (400, "evidence_not_ready")),
        (&["missing"], (404, "evidence_not_found")),
        (&["doc-team", "doc-other"], (404, "evidence_not_found")),
    ];
    for (evidence, expected) in cases {
        let result = review(
            &pool,
            &investor(),
            "saveReview",
            save("revenue", "satisfied", "x", evidence, None),
        )
        .await;
        assert_eq!(failure(result), expected, "{evidence:?}");
    }
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM reviews")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0, "nothing is stored when evidence is rejected");
}

#[sqlx::test]
async fn database_rejects_evidence_that_bypasses_the_api(pool: PgPool) {
    add_other_workspace(&pool).await;
    let created = review(
        &pool,
        &investor(),
        "saveReview",
        save("team", "satisfied", "x", &["doc-team"], None),
    )
    .await
    .unwrap();
    let review_id = created["id"].as_str().unwrap();
    for document in ["doc-revenue", "doc-pipeline", "doc-other", "missing"] {
        let insert = sqlx::query(
            "INSERT INTO review_evidence (review_id, workspace_id, document_id) VALUES ($1, 'lighthouse', $2)",
        )
        .bind(review_id)
        .bind(document)
        .execute(&pool)
        .await;
        assert!(insert.is_err(), "{document} must violate the foreign key");
    }
    // A document that is cited as evidence cannot silently become unusable.
    let downgrade = sqlx::query("UPDATE documents SET status = 'failed' WHERE id = 'doc-team'")
        .execute(&pool)
        .await;
    assert!(downgrade.is_err());
}

#[sqlx::test]
async fn comment_must_have_one_to_two_thousand_characters(pool: PgPool) {
    for comment in ["   ".to_string(), " \n\t ".to_string(), "가".repeat(2001)] {
        let result = review(
            &pool,
            &investor(),
            "saveReview",
            save("business", "satisfied", &comment, &["doc-business"], None),
        )
        .await;
        assert_eq!(failure(result), (400, "invalid_input"));
    }
    let longest = review(
        &pool,
        &investor(),
        "saveReview",
        save(
            "business",
            "satisfied",
            &"가".repeat(2000),
            &["doc-business"],
            None,
        ),
    )
    .await;
    assert!(longest.is_ok());
    let unknown = review(
        &pool,
        &investor(),
        "saveReview",
        save("nope", "satisfied", "x", &["doc-business"], None),
    )
    .await;
    assert_eq!(failure(unknown), (404, "criterion_not_found"));
}

#[sqlx::test]
async fn reviews_and_progress_are_private_to_each_investor(pool: PgPool) {
    review(
        &pool,
        &investor(),
        "saveReview",
        save(
            "business",
            "satisfied",
            "사업 확인",
            &["doc-business"],
            None,
        ),
    )
    .await
    .unwrap();
    review(
        &pool,
        &investor(),
        "saveReview",
        save(
            "team",
            "needs_information",
            "영업 확인 필요",
            &["doc-team"],
            None,
        ),
    )
    .await
    .unwrap();

    let progress = review(&pool, &investor(), "getMyProgress", Value::Null)
        .await
        .unwrap();
    assert_eq!(
        progress["summary"],
        json!({ "totalCount": 3, "writtenCount": 2, "pendingCount": 1, "satisfiedCount": 1, "needsInformationCount": 1 })
    );
    assert_eq!(progress["entries"][2]["criterion"]["id"], "revenue");
    assert_eq!(progress["entries"][2]["review"], Value::Null);

    let peer_reviews = review(&pool, &peer(), "listMyReviews", Value::Null)
        .await
        .unwrap();
    assert_eq!(peer_reviews, json!({ "reviews": [] }));
    let peer_progress = review(&pool, &peer(), "getMyProgress", Value::Null)
        .await
        .unwrap();
    assert_eq!(peer_progress["summary"]["writtenCount"], 0);
}

#[sqlx::test]
async fn failure_after_the_review_update_rolls_everything_back(pool: PgPool) {
    review(
        &pool,
        &investor(),
        "saveReview",
        save("team", "satisfied", "원래 의견", &["doc-team"], None),
    )
    .await
    .unwrap();
    // Make the evidence insert (the last write in the transaction) fail for one document.
    sqlx::raw_sql(
        "CREATE FUNCTION fail_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN
             IF NEW.document_id = 'doc-business' THEN RAISE EXCEPTION 'injected failure'; END IF;
             RETURN NEW;
         END $$;
         CREATE TRIGGER fail_evidence BEFORE INSERT ON review_evidence
             FOR EACH ROW EXECUTE FUNCTION fail_evidence();",
    )
    .execute(&pool)
    .await
    .unwrap();

    let result = review(
        &pool,
        &investor(),
        "saveReview",
        save(
            "team",
            "needs_information",
            "바뀐 의견",
            &["doc-business"],
            Some(1),
        ),
    )
    .await;
    assert_eq!(failure(result), (500, "storage_error"));

    let mine = review(&pool, &investor(), "listMyReviews", Value::Null)
        .await
        .unwrap();
    let saved = &mine["reviews"][0];
    assert_eq!(saved["comment"], "원래 의견");
    assert_eq!(saved["verdict"], "satisfied");
    assert_eq!(saved["version"], 1);
    assert_eq!(evidence_ids(saved), ["doc-team"]);
}

#[sqlx::test]
async fn concurrent_edits_of_one_version_let_exactly_one_win(pool: PgPool) {
    review(
        &pool,
        &investor(),
        "saveReview",
        save("team", "satisfied", "v1", &["doc-team"], None),
    )
    .await
    .unwrap();
    let user = investor();
    let (first, second) = tokio::join!(
        review(
            &pool,
            &user,
            "saveReview",
            save(
                "team",
                "satisfied",
                "탭 A",
                &["doc-team", "doc-business"],
                Some(1)
            )
        ),
        review(
            &pool,
            &user,
            "saveReview",
            save(
                "team",
                "needs_information",
                "탭 B",
                &["doc-business"],
                Some(1)
            )
        ),
    );
    let (winner, loser) = match (first, second) {
        (Ok(winner), Err(loser)) | (Err(loser), Ok(winner)) => (winner, loser),
        other => panic!("exactly one save must win: {other:?}"),
    };
    assert_eq!((loser.0.as_u16(), loser.1), (409, "review_conflict"));
    assert_eq!(winner["version"], 2);

    let mut expected: Vec<String> = evidence_ids(&winner)
        .iter()
        .map(|id| id.to_string())
        .collect();
    expected.sort();
    assert_eq!(
        stored_evidence(&pool).await,
        expected,
        "evidence is the winner's set only"
    );
}

#[sqlx::test]
async fn concurrent_first_saves_create_a_single_review(pool: PgPool) {
    let user = investor();
    let (first, second) = tokio::join!(
        review(
            &pool,
            &user,
            "saveReview",
            save("revenue", "satisfied", "A", &["doc-team"], None)
        ),
        review(
            &pool,
            &user,
            "saveReview",
            save("revenue", "needs_information", "B", &["doc-business"], None)
        ),
    );
    assert!(
        first.is_ok() != second.is_ok(),
        "one create wins, the other conflicts"
    );
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM reviews")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    assert_eq!(stored_evidence(&pool).await.len(), 1);
}

/// Forces the interleaving instead of hoping `join!` overlaps: another transaction holds the
/// review row lock, our save is observed waiting on it, then the other side commits a newer version.
#[sqlx::test]
async fn save_waiting_on_a_locked_review_rechecks_the_version_after_the_lock_is_released(
    pool: PgPool,
) {
    review(
        &pool,
        &investor(),
        "saveReview",
        save("team", "satisfied", "v1", &["doc-team"], None),
    )
    .await
    .unwrap();

    let mut other_tab = pool.begin().await.unwrap();
    sqlx::query("SELECT id FROM reviews WHERE criterion_id = 'team' FOR UPDATE")
        .execute(&mut *other_tab)
        .await
        .unwrap();

    let waiting = tokio::spawn({
        let pool = pool.clone();
        async move {
            review(
                &pool,
                &investor(),
                "saveReview",
                save(
                    "team",
                    "needs_information",
                    "늦은 저장",
                    &["doc-business"],
                    Some(1),
                ),
            )
            .await
        }
    });

    // Proceed only once PostgreSQL reports the save blocked on the row lock.
    let mut blocked = false;
    for _ in 0..200 {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM pg_stat_activity
             WHERE datname = current_database() AND wait_event_type = 'Lock'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        if count == 1 {
            blocked = true;
            break;
        }
        // tokio's timer feature is not enabled, so the database does the short wait.
        sqlx::query("SELECT pg_sleep(0.025)")
            .execute(&pool)
            .await
            .unwrap();
    }
    assert!(blocked, "the save should be waiting on the review row lock");

    sqlx::query(
        "UPDATE reviews SET comment = '다른 탭', version = version + 1 WHERE criterion_id = 'team'",
    )
    .execute(&mut *other_tab)
    .await
    .unwrap();
    other_tab.commit().await.unwrap();

    // Re-evaluated against the committed row (version 2), the expected version 1 no longer matches.
    assert_eq!(failure(waiting.await.unwrap()), (409, "review_conflict"));
    let mine = review(&pool, &investor(), "listMyReviews", Value::Null)
        .await
        .unwrap();
    assert_eq!(mine["reviews"][0]["comment"], "다른 탭");
    assert_eq!(mine["reviews"][0]["version"], 2);
    assert_eq!(stored_evidence(&pool).await, ["doc-team"]);
}

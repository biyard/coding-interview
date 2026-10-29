pub mod models;
pub mod types;

use std::collections::HashSet;

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::RngCore;
use serde::{Serialize, de::DeserializeOwned};
use sqlx::PgPool;

use crate::{
    auth::AuthenticatedUser,
    error::ApiError,
    types::{PluginRpcRequest, RpcResponse, UserRole},
};
use models::{
    EvidenceDocumentRow, ExistingReviewRow, ReviewCriterionRow, ReviewRow, ReviewWithEvidenceRow,
};
use types::{
    ListReviewCriteriaParams, ListReviewCriteriaResponse, ListReviewsParams, ListReviewsResponse,
    Review, ReviewCriterion, ReviewDecision, ReviewHealthResponse, SaveReviewParams,
    SaveReviewResponse,
};

pub const ID: &str = "review";

const MAX_ID_CHARS: usize = 100;
const MAX_OPINION_CHARS: usize = 2_000;

pub async fn dispatch(
    pool: &PgPool,
    user: &AuthenticatedUser,
    request: PluginRpcRequest,
) -> Result<RpcResponse, ApiError> {
    if request.workspace_id != user.workspace_id {
        return Err(ApiError::forbidden());
    }

    match request.method.as_str() {
        "health" => respond(ReviewHealthResponse {
            status: "ok".into(),
            plugin_id: ID.into(),
        }),
        "listCriteria" => list_criteria(pool, request.params).await,
        "listReviews" => list_reviews(pool, user, request.params).await,
        "saveReview" => {
            if !matches!(user.role, UserRole::Investor) {
                return Err(ApiError::forbidden_action());
            }
            save_review(pool, user, request.params).await
        }
        _ => Err(ApiError::not_found()),
    }
}

async fn list_criteria(pool: &PgPool, params: serde_json::Value) -> Result<RpcResponse, ApiError> {
    let _: ListReviewCriteriaParams = parse_empty_params(params)?;
    let rows = sqlx::query_as::<_, ReviewCriterionRow>(
        "SELECT id, title, review_question, display_order
         FROM review_criteria
         ORDER BY display_order ASC, id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(ApiError::storage)?;

    respond(ListReviewCriteriaResponse {
        criteria: rows
            .into_iter()
            .map(|row| ReviewCriterion {
                id: row.id,
                title: row.title,
                review_question: row.review_question,
                display_order: row.display_order,
            })
            .collect(),
    })
}

async fn list_reviews(
    pool: &PgPool,
    user: &AuthenticatedUser,
    params: serde_json::Value,
) -> Result<RpcResponse, ApiError> {
    let _: ListReviewsParams = parse_empty_params(params)?;
    if matches!(user.role, UserRole::Company) {
        return respond(ListReviewsResponse { reviews: vec![] });
    }

    let rows = sqlx::query_as::<_, ReviewWithEvidenceRow>(
        "SELECT r.id, r.criterion_id, r.decision, r.opinion, r.revision,
                TO_CHAR(r.created_at AT TIME ZONE 'UTC',
                        'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at,
                TO_CHAR(r.updated_at AT TIME ZONE 'UTC',
                        'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS updated_at,
                COALESCE(
                    ARRAY_AGG(e.document_id ORDER BY e.document_id)
                        FILTER (WHERE e.document_id IS NOT NULL),
                    ARRAY[]::TEXT[]
                ) AS evidence_document_ids
         FROM reviews r
         JOIN review_criteria c ON c.id = r.criterion_id
         LEFT JOIN review_evidence e
           ON e.workspace_id = r.workspace_id AND e.review_id = r.id
         WHERE r.workspace_id = $1 AND r.investor_id = $2
         GROUP BY r.id, r.criterion_id, r.decision, r.opinion, r.revision,
                  r.created_at, r.updated_at, c.display_order
         ORDER BY c.display_order ASC, r.id ASC",
    )
    .bind(&user.workspace_id)
    .bind(&user.id)
    .fetch_all(pool)
    .await
    .map_err(ApiError::storage)?;

    let reviews = rows
        .into_iter()
        .map(|row| {
            review_from_row(
                ReviewRow {
                    id: row.id,
                    criterion_id: row.criterion_id,
                    decision: row.decision,
                    opinion: row.opinion,
                    revision: row.revision,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                },
                row.evidence_document_ids,
            )
        })
        .collect::<Result<Vec<_>, _>>()?;
    respond(ListReviewsResponse { reviews })
}

async fn save_review(
    pool: &PgPool,
    user: &AuthenticatedUser,
    params: serde_json::Value,
) -> Result<RpcResponse, ApiError> {
    let params: SaveReviewParams = parse_params(params)?;
    validate_id(&params.criterion_id, "Review criterion ID is invalid.")?;
    validate_opinion(&params.opinion)?;
    validate_evidence_ids(&params.evidence_document_ids)?;
    if params
        .expected_revision
        .is_some_and(|revision| revision < 1)
    {
        return Err(ApiError::invalid("Expected revision must be positive."));
    }

    let mut transaction = pool.begin().await.map_err(ApiError::storage)?;
    let lock_key = format!(
        "review\u{1f}{}\u{1f}{}\u{1f}{}",
        user.workspace_id, user.id, params.criterion_id
    );
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
        .bind(lock_key)
        .fetch_one(&mut *transaction)
        .await
        .map_err(ApiError::storage)?;

    let criterion_exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM review_criteria WHERE id = $1)")
            .bind(&params.criterion_id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(ApiError::storage)?;
    if !criterion_exists {
        return Err(ApiError::not_found());
    }

    let documents = sqlx::query_as::<_, EvidenceDocumentRow>(
        "SELECT id, status
         FROM documents
         WHERE workspace_id = $1 AND id = ANY($2::TEXT[])
         FOR SHARE",
    )
    .bind(&user.workspace_id)
    .bind(&params.evidence_document_ids)
    .fetch_all(&mut *transaction)
    .await
    .map_err(ApiError::storage)?;
    if documents.len() != params.evidence_document_ids.len() {
        return Err(ApiError::not_found());
    }
    if documents.iter().any(|document| document.status != "ready") {
        return Err(ApiError::invalid("Every evidence document must be ready."));
    }
    let returned_ids: HashSet<&str> = documents.iter().map(|row| row.id.as_str()).collect();
    if params
        .evidence_document_ids
        .iter()
        .any(|id| !returned_ids.contains(id.as_str()))
    {
        return Err(ApiError::not_found());
    }

    let existing = sqlx::query_as::<_, ExistingReviewRow>(
        "SELECT id, revision
         FROM reviews
         WHERE workspace_id = $1 AND investor_id = $2 AND criterion_id = $3
         FOR UPDATE",
    )
    .bind(&user.workspace_id)
    .bind(&user.id)
    .bind(&params.criterion_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(ApiError::storage)?;

    let decision = decision_value(&params.decision);
    let review_row = match existing {
        Some(existing) => {
            if params.expected_revision != Some(existing.revision) {
                return Err(ApiError::conflict(
                    "The review changed after it was loaded. Reload and try again.",
                ));
            }
            sqlx::query_as::<_, ReviewRow>(
                "UPDATE reviews
                 SET decision = $1, opinion = $2, revision = revision + 1,
                     updated_at = clock_timestamp()
                 WHERE workspace_id = $3 AND investor_id = $4 AND id = $5
                   AND revision = $6
                 RETURNING id, criterion_id, decision, opinion, revision,
                           TO_CHAR(created_at AT TIME ZONE 'UTC',
                                   'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at,
                           TO_CHAR(updated_at AT TIME ZONE 'UTC',
                                   'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS updated_at",
            )
            .bind(decision)
            .bind(&params.opinion)
            .bind(&user.workspace_id)
            .bind(&user.id)
            .bind(&existing.id)
            .bind(existing.revision)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(ApiError::storage)?
            .ok_or_else(|| {
                ApiError::conflict("The review changed after it was loaded. Reload and try again.")
            })?
        }
        None => {
            if params.expected_revision.is_some() {
                return Err(ApiError::conflict(
                    "The review no longer exists. Reload and try again.",
                ));
            }
            let id = new_review_id();
            sqlx::query_as::<_, ReviewRow>(
                "INSERT INTO reviews
                    (id, workspace_id, investor_id, criterion_id, decision, opinion, revision)
                 VALUES ($1, $2, $3, $4, $5, $6, 1)
                 RETURNING id, criterion_id, decision, opinion, revision,
                           TO_CHAR(created_at AT TIME ZONE 'UTC',
                                   'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at,
                           TO_CHAR(updated_at AT TIME ZONE 'UTC',
                                   'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS updated_at",
            )
            .bind(id)
            .bind(&user.workspace_id)
            .bind(&user.id)
            .bind(&params.criterion_id)
            .bind(decision)
            .bind(&params.opinion)
            .fetch_one(&mut *transaction)
            .await
            .map_err(ApiError::storage)?
        }
    };

    sqlx::query("DELETE FROM review_evidence WHERE workspace_id = $1 AND review_id = $2")
        .bind(&user.workspace_id)
        .bind(&review_row.id)
        .execute(&mut *transaction)
        .await
        .map_err(ApiError::storage)?;
    for document_id in &params.evidence_document_ids {
        sqlx::query(
            "INSERT INTO review_evidence (workspace_id, review_id, document_id)
             VALUES ($1, $2, $3)",
        )
        .bind(&user.workspace_id)
        .bind(&review_row.id)
        .bind(document_id)
        .execute(&mut *transaction)
        .await
        .map_err(ApiError::storage)?;
    }

    transaction.commit().await.map_err(ApiError::storage)?;
    let mut evidence_document_ids = params.evidence_document_ids;
    evidence_document_ids.sort();
    respond(SaveReviewResponse {
        review: review_from_row(review_row, evidence_document_ids)?,
    })
}

fn parse_empty_params<T: DeserializeOwned>(params: serde_json::Value) -> Result<T, ApiError> {
    parse_params(if params.is_null() {
        serde_json::json!({})
    } else {
        params
    })
}

fn parse_params<T: DeserializeOwned>(params: serde_json::Value) -> Result<T, ApiError> {
    serde_json::from_value(params).map_err(|_| ApiError::invalid("Invalid request parameters."))
}

fn respond(value: impl Serialize) -> Result<RpcResponse, ApiError> {
    Ok(RpcResponse {
        result: serde_json::to_value(value).map_err(ApiError::storage)?,
    })
}

fn validate_id(id: &str, message: &'static str) -> Result<(), ApiError> {
    if id.is_empty()
        || id.chars().count() > MAX_ID_CHARS
        || id.chars().any(char::is_whitespace)
        || id.contains('\0')
    {
        return Err(ApiError::invalid(message));
    }
    Ok(())
}

fn validate_opinion(opinion: &str) -> Result<(), ApiError> {
    if opinion.trim().is_empty()
        || opinion.chars().count() > MAX_OPINION_CHARS
        || opinion.contains('\0')
    {
        return Err(ApiError::invalid(
            "Opinion must be 1 to 2000 characters and must not be blank.",
        ));
    }
    Ok(())
}

fn validate_evidence_ids(ids: &[String]) -> Result<(), ApiError> {
    if ids.is_empty() {
        return Err(ApiError::invalid(
            "At least one evidence document is required.",
        ));
    }
    let mut unique = HashSet::with_capacity(ids.len());
    for id in ids {
        validate_id(id, "Evidence document ID is invalid.")?;
        if !unique.insert(id) {
            return Err(ApiError::invalid(
                "Evidence document IDs must not contain duplicates.",
            ));
        }
    }
    Ok(())
}

fn decision_value(decision: &ReviewDecision) -> &'static str {
    match decision {
        ReviewDecision::Satisfied => "satisfied",
        ReviewDecision::NeedsInformation => "needs_information",
    }
}

fn parse_decision(decision: &str) -> Result<ReviewDecision, ApiError> {
    match decision {
        "satisfied" => Ok(ReviewDecision::Satisfied),
        "needs_information" => Ok(ReviewDecision::NeedsInformation),
        _ => Err(ApiError::storage("Unknown review decision.")),
    }
}

fn review_from_row(row: ReviewRow, evidence_document_ids: Vec<String>) -> Result<Review, ApiError> {
    Ok(Review {
        id: row.id,
        criterion_id: row.criterion_id,
        decision: parse_decision(&row.decision)?,
        opinion: row.opinion,
        evidence_document_ids,
        revision: row.revision,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

fn new_review_id() -> String {
    let mut bytes = [0_u8; 18];
    rand::rng().fill_bytes(&mut bytes);
    format!("review-{}", URL_SAFE_NO_PAD.encode(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_review_input_boundaries() {
        assert!(validate_opinion("확인했습니다.").is_ok());
        assert!(validate_opinion(" \n\t").is_err());
        assert!(validate_opinion(&"가".repeat(MAX_OPINION_CHARS)).is_ok());
        assert!(validate_opinion(&"가".repeat(MAX_OPINION_CHARS + 1)).is_err());
        assert!(validate_evidence_ids(&["doc-business".into()]).is_ok());
        assert!(validate_evidence_ids(&["doc-business".into(), "doc-business".into()]).is_err());
        assert!(validate_evidence_ids(&[]).is_err());
    }
}

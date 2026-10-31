pub mod draft;
pub mod models;
pub mod types;
use std::collections::HashSet;

use crate::{
    auth::AuthenticatedUser,
    error::ApiError,
    types::{PluginRpcRequest, RpcResponse, UserRole, parse_params},
};
use axum::http::StatusCode;
use models::BoardRow;
use sqlx::{PgExecutor, PgPool};
use types::{
    CriteriaResponse, MyProgressResponse, MyReviewsResponse, ProgressEntry, ProgressSummary,
    ReviewCriterion, ReviewDetail, ReviewHealthResponse, ReviewVerdict, SaveReviewParams,
};

pub const ID: &str = "review";
const MAX_COMMENT_CHARS: usize = 2000;
const MAX_EVIDENCE_DOCUMENTS: usize = 20;

pub async fn dispatch(
    pool: &PgPool,
    user: &AuthenticatedUser,
    request: PluginRpcRequest,
) -> Result<RpcResponse, ApiError> {
    if request.workspace_id != user.workspace_id {
        return Err(ApiError::forbidden());
    }
    let is_investor = matches!(user.role, UserRole::Investor);
    match request.method.as_str() {
        "health" => Ok(RpcResponse {
            result: serde_json::to_value(ReviewHealthResponse {
                status: "ok".into(),
                plugin_id: ID.into(),
            })
            .map_err(ApiError::storage)?,
        }),
        "listCriteria" => RpcResponse::new(list_criteria(pool).await?),
        // Reviews are private to each investor, so company members receive an empty list.
        "listMyReviews" => {
            let reviews = if is_investor {
                load_board(pool, user, None)
                    .await?
                    .into_iter()
                    .filter_map(|entry| entry.review)
                    .collect()
            } else {
                Vec::new()
            };
            RpcResponse::new(MyReviewsResponse { reviews })
        }
        "getMyProgress" => {
            require_investor(user)?;
            let entries = load_board(pool, user, None).await?;
            RpcResponse::new(MyProgressResponse {
                summary: summarize(&entries),
                entries,
            })
        }
        "saveReview" => {
            // Callers without write access are rejected before their input is inspected.
            require_investor(user)?;
            RpcResponse::new(save_review(pool, user, parse_params(request.params)?).await?)
        }
        "draftReview" => {
            require_investor(user)?;
            let params = parse_params(request.params)?;
            RpcResponse::new(
                draft::draft_review(pool, user, params, draft::DraftModel::shared()).await?,
            )
        }
        _ => Err(ApiError::not_found()),
    }
}

fn require_investor(user: &AuthenticatedUser) -> Result<(), ApiError> {
    if matches!(user.role, UserRole::Investor) {
        Ok(())
    } else {
        Err(ApiError::role_forbidden())
    }
}

async fn list_criteria(pool: &PgPool) -> Result<CriteriaResponse, ApiError> {
    let rows = sqlx::query_as::<_, (String, String, String)>(
        "SELECT id, title, review_question FROM review_criteria ORDER BY display_order",
    )
    .fetch_all(pool)
    .await
    .map_err(ApiError::storage)?;
    Ok(CriteriaResponse {
        criteria: rows
            .into_iter()
            .map(|(id, title, review_question)| ReviewCriterion {
                id,
                title,
                review_question,
            })
            .collect(),
    })
}

/// Every criterion with the investor's review and evidence, read in one statement so the
/// written/pending counts and the review contents always come from the same snapshot.
async fn load_board<'e>(
    executor: impl PgExecutor<'e>,
    user: &AuthenticatedUser,
    criterion_id: Option<&str>,
) -> Result<Vec<ProgressEntry>, ApiError> {
    let rows = sqlx::query_as::<_, BoardRow>(
        r#"SELECT c.id AS criterion_id, c.title, c.review_question,
                  r.id AS review_id, r.verdict, r.comment, r.version,
                  to_char(r.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
                  COALESCE(
                      json_agg(json_build_object('documentId', d.id, 'title', d.title)
                               ORDER BY d.created_at DESC, d.id)
                          FILTER (WHERE d.id IS NOT NULL),
                      '[]'::json
                  )::text AS evidence
           FROM review_criteria c
           LEFT JOIN reviews r
                  ON r.criterion_id = c.id AND r.workspace_id = $1 AND r.investor_id = $2
           LEFT JOIN review_evidence e ON e.review_id = r.id
           LEFT JOIN documents d ON d.workspace_id = e.workspace_id AND d.id = e.document_id
           WHERE ($3::text IS NULL OR c.id = $3)
           GROUP BY c.id, r.id
           ORDER BY c.display_order"#,
    )
    .bind(&user.workspace_id)
    .bind(&user.id)
    .bind(criterion_id)
    .fetch_all(executor)
    .await
    .map_err(ApiError::storage)?;
    rows.into_iter().map(TryInto::try_into).collect()
}

fn summarize(entries: &[ProgressEntry]) -> ProgressSummary {
    let mut summary = ProgressSummary {
        total_count: entries.len() as u32,
        ..ProgressSummary::default()
    };
    for entry in entries {
        match entry.review.as_ref().map(|review| review.verdict) {
            Some(ReviewVerdict::Satisfied) => summary.satisfied_count += 1,
            Some(ReviewVerdict::NeedsInformation) => summary.needs_information_count += 1,
            None => summary.pending_count += 1,
        }
    }
    summary.written_count = summary.satisfied_count + summary.needs_information_count;
    summary
}

async fn save_review(
    pool: &PgPool,
    user: &AuthenticatedUser,
    params: SaveReviewParams,
) -> Result<ReviewDetail, ApiError> {
    let comment = normalize_comment(&params.comment)?;
    validate_evidence_ids(&params.evidence_document_ids)?;
    if params.expected_version.is_some_and(|version| version < 1) {
        return Err(ApiError::invalid("Expected version must be positive."));
    }

    let mut tx = pool.begin().await.map_err(ApiError::storage)?;
    let criterion_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM review_criteria WHERE id = $1)",
    )
    .bind(&params.criterion_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(ApiError::storage)?;
    if !criterion_exists {
        return Err(error(
            StatusCode::NOT_FOUND,
            "criterion_not_found",
            "Review criterion not found.",
        ));
    }

    // FOR SHARE keeps the selected documents from changing status until this transaction ends.
    let statuses = sqlx::query_scalar::<_, String>(
        "SELECT status FROM documents WHERE workspace_id = $1 AND id = ANY($2) FOR SHARE",
    )
    .bind(&user.workspace_id)
    .bind(&params.evidence_document_ids)
    .fetch_all(&mut *tx)
    .await
    .map_err(ApiError::storage)?;
    if statuses.len() != params.evidence_document_ids.len() {
        return Err(error(
            StatusCode::NOT_FOUND,
            "evidence_not_found",
            "An evidence document does not exist in this data room.",
        ));
    }
    if statuses.iter().any(|status| status != "ready") {
        return Err(evidence_not_ready());
    }

    // The WHERE clause turns a stale or missing expected version into "no row", i.e. a conflict,
    // and the conflicting row stays locked until commit so concurrent saves are serialized.
    let review_id = sqlx::query_scalar::<_, String>(
        "INSERT INTO reviews (workspace_id, investor_id, criterion_id, verdict, comment)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (workspace_id, investor_id, criterion_id) DO UPDATE
         SET verdict = EXCLUDED.verdict,
             comment = EXCLUDED.comment,
             version = reviews.version + 1,
             updated_at = NOW()
         WHERE reviews.version = $6
         RETURNING id",
    )
    .bind(&user.workspace_id)
    .bind(&user.id)
    .bind(&params.criterion_id)
    .bind(params.verdict.as_str())
    .bind(&comment)
    .bind(params.expected_version)
    .fetch_optional(&mut *tx)
    .await
    .map_err(ApiError::storage)?
    .ok_or_else(|| {
        error(
            StatusCode::CONFLICT,
            "review_conflict",
            "The review was changed elsewhere. Reload it before saving.",
        )
    })?;

    sqlx::query("DELETE FROM review_evidence WHERE review_id = $1")
        .bind(&review_id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::storage)?;
    sqlx::query(
        "INSERT INTO review_evidence (review_id, workspace_id, document_id)
         SELECT $1, $2, unnest($3::text[])",
    )
    .bind(&review_id)
    .bind(&user.workspace_id)
    .bind(&params.evidence_document_ids)
    .execute(&mut *tx)
    .await
    .map_err(|error| {
        if is_foreign_key_violation(&error) {
            evidence_not_ready()
        } else {
            ApiError::storage(error)
        }
    })?;

    let saved = load_board(&mut *tx, user, Some(&params.criterion_id))
        .await?
        .into_iter()
        .find_map(|entry| entry.review)
        .ok_or_else(|| ApiError::storage("Saved review is missing."))?;
    tx.commit().await.map_err(ApiError::storage)?;
    Ok(saved)
}

fn normalize_comment(comment: &str) -> Result<String, ApiError> {
    let comment = comment.replace("\r\n", "\n");
    let comment = comment.trim();
    if comment.is_empty() {
        return Err(ApiError::invalid("Comment cannot be blank."));
    }
    if comment.chars().count() > MAX_COMMENT_CHARS {
        return Err(ApiError::invalid(
            "Comment must be at most 2000 characters.",
        ));
    }
    if comment
        .chars()
        .any(|c| c.is_control() && c != '\n' && c != '\t')
    {
        return Err(ApiError::invalid(
            "Comment cannot contain control characters.",
        ));
    }
    Ok(comment.to_string())
}

fn validate_evidence_ids(ids: &[String]) -> Result<(), ApiError> {
    if ids.is_empty() {
        return Err(error(
            StatusCode::BAD_REQUEST,
            "evidence_required",
            "Select at least one evidence document.",
        ));
    }
    if ids.len() > MAX_EVIDENCE_DOCUMENTS {
        return Err(ApiError::invalid(
            "At most 20 evidence documents can be linked.",
        ));
    }
    let mut seen = HashSet::with_capacity(ids.len());
    if !ids.iter().all(|id| seen.insert(id.as_str())) {
        return Err(error(
            StatusCode::BAD_REQUEST,
            "duplicate_evidence",
            "The same evidence document was selected twice.",
        ));
    }
    Ok(())
}

fn evidence_not_ready() -> ApiError {
    error(
        StatusCode::BAD_REQUEST,
        "evidence_not_ready",
        "Only ready documents can be linked as evidence.",
    )
}

fn error(status: StatusCode, kind: &'static str, message: &'static str) -> ApiError {
    ApiError(status, kind, message)
}

fn is_foreign_key_violation(error: &sqlx::Error) -> bool {
    error
        .as_database_error()
        .and_then(|database_error| database_error.code())
        .is_some_and(|code| code == "23503")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(verdict: Option<ReviewVerdict>) -> ProgressEntry {
        ProgressEntry {
            criterion: ReviewCriterion {
                id: "c".into(),
                title: "t".into(),
                review_question: "q".into(),
            },
            review: verdict.map(|verdict| ReviewDetail {
                id: "r".into(),
                criterion_id: "c".into(),
                verdict,
                comment: "c".into(),
                version: 1,
                updated_at: String::new(),
                evidence: Vec::new(),
            }),
        }
    }

    #[test]
    fn needs_information_counts_as_written_but_not_satisfied() {
        let summary = summarize(&[
            entry(Some(ReviewVerdict::Satisfied)),
            entry(Some(ReviewVerdict::NeedsInformation)),
            entry(None),
        ]);
        assert_eq!(
            summary,
            ProgressSummary {
                total_count: 3,
                written_count: 2,
                pending_count: 1,
                satisfied_count: 1,
                needs_information_count: 1,
            }
        );
    }

    #[test]
    fn comment_is_normalized_and_bounded() {
        assert_eq!(
            normalize_comment("  첫 줄\r\n둘째 줄 ").unwrap(),
            "첫 줄\n둘째 줄"
        );
        assert!(normalize_comment(" \n\t ").is_err());
        assert!(normalize_comment(&"가".repeat(2000)).is_ok());
        assert!(normalize_comment(&"가".repeat(2001)).is_err());
        assert!(normalize_comment("a\0b").is_err());
    }

    #[test]
    fn evidence_ids_must_be_present_and_unique() {
        let ids = |values: &[&str]| values.iter().map(|v| v.to_string()).collect::<Vec<_>>();
        assert!(validate_evidence_ids(&ids(&["doc-team"])).is_ok());
        assert_eq!(
            validate_evidence_ids(&[]).unwrap_err().1,
            "evidence_required"
        );
        assert_eq!(
            validate_evidence_ids(&ids(&["doc-team", "doc-team"]))
                .unwrap_err()
                .1,
            "duplicate_evidence"
        );
        assert!(validate_evidence_ids(&ids(&["x"; 21])).is_err());
    }
}

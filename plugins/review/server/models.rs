use super::types::{EvidenceDocument, ProgressEntry, ReviewCriterion, ReviewDetail, ReviewVerdict};
use crate::error::ApiError;

/// One criterion joined with the current investor's review (if any) and its evidence.
#[derive(Debug, sqlx::FromRow)]
pub(super) struct BoardRow {
    pub(super) criterion_id: String,
    pub(super) title: String,
    pub(super) review_question: String,
    pub(super) review_id: Option<String>,
    pub(super) verdict: Option<String>,
    pub(super) comment: Option<String>,
    pub(super) version: Option<i32>,
    pub(super) updated_at: Option<String>,
    pub(super) evidence: String,
}

impl TryFrom<BoardRow> for ProgressEntry {
    type Error = ApiError;

    fn try_from(row: BoardRow) -> Result<Self, ApiError> {
        let criterion = ReviewCriterion {
            id: row.criterion_id,
            title: row.title,
            review_question: row.review_question,
        };
        let review = match (
            row.review_id,
            row.verdict,
            row.comment,
            row.version,
            row.updated_at,
        ) {
            (Some(id), Some(verdict), Some(comment), Some(version), Some(updated_at)) => {
                Some(ReviewDetail {
                    id,
                    criterion_id: criterion.id.clone(),
                    verdict: ReviewVerdict::from_db(&verdict)?,
                    comment,
                    version,
                    updated_at,
                    evidence: serde_json::from_str::<Vec<EvidenceDocument>>(&row.evidence)
                        .map_err(ApiError::storage)?,
                })
            }
            (None, ..) => None,
            _ => return Err(ApiError::storage("Incomplete review row.")),
        };
        Ok(Self { criterion, review })
    }
}

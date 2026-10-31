use serde::{Deserialize, Serialize};

use crate::error::ApiError;
#[cfg(feature = "ts-bridge")]
use crate::types::RpcSignature;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct ReviewHealthResponse {
    pub status: String,
    pub plugin_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub enum ReviewVerdict {
    Satisfied,
    NeedsInformation,
}

impl ReviewVerdict {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Satisfied => "satisfied",
            Self::NeedsInformation => "needs_information",
        }
    }

    pub fn from_db(value: &str) -> Result<Self, ApiError> {
        match value {
            "satisfied" => Ok(Self::Satisfied),
            "needs_information" => Ok(Self::NeedsInformation),
            _ => Err(ApiError::storage("Unknown review verdict.")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct ReviewCriterion {
    pub id: String,
    pub title: String,
    pub review_question: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct CriteriaResponse {
    pub criteria: Vec<ReviewCriterion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct EvidenceDocument {
    pub document_id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct ReviewDetail {
    pub id: String,
    pub criterion_id: String,
    pub verdict: ReviewVerdict,
    pub comment: String,
    pub version: i32,
    pub updated_at: String,
    pub evidence: Vec<EvidenceDocument>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct MyReviewsResponse {
    pub reviews: Vec<ReviewDetail>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct ProgressEntry {
    pub criterion: ReviewCriterion,
    pub review: Option<ReviewDetail>,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct ProgressSummary {
    pub total_count: u32,
    pub written_count: u32,
    pub pending_count: u32,
    pub satisfied_count: u32,
    pub needs_information_count: u32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct MyProgressResponse {
    pub summary: ProgressSummary,
    pub entries: Vec<ProgressEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct SaveReviewParams {
    pub criterion_id: String,
    pub verdict: ReviewVerdict,
    pub comment: String,
    pub evidence_document_ids: Vec<String>,
    /// Version the investor edited; `null` when creating the first review for the criterion.
    pub expected_version: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct DraftReviewParams {
    pub criterion_id: String,
}

/// AI suggestion for one criterion. It is never stored: the investor edits it and saves it
/// through `saveReview`, which applies the same validation as a hand-written review.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct ReviewDraft {
    pub criterion_id: String,
    pub verdict: ReviewVerdict,
    pub comment: String,
    /// Only ready documents of this data room that the model was given.
    pub evidence: Vec<EvidenceDocument>,
    /// Suggested evidence the server dropped (unknown, duplicate or over the limit).
    pub discarded_evidence_count: u32,
    /// Ready documents sent to the model.
    pub considered_document_count: u32,
    /// Ready documents left out because the input size limit was reached.
    pub omitted_document_count: u32,
    pub model: String,
}

/// Method → params/result map that types `host.call(...)` for the review plugin on the TS side.
#[cfg(feature = "ts-bridge")]
#[derive(ts_rs::TS)]
#[ts(export, export_to = "types/", rename_all = "camelCase")]
pub struct ReviewRpcContract {
    pub health: RpcSignature<(), ReviewHealthResponse>,
    pub list_criteria: RpcSignature<(), CriteriaResponse>,
    pub list_my_reviews: RpcSignature<(), MyReviewsResponse>,
    pub get_my_progress: RpcSignature<(), MyProgressResponse>,
    pub save_review: RpcSignature<SaveReviewParams, ReviewDetail>,
    pub draft_review: RpcSignature<DraftReviewParams, ReviewDraft>,
}

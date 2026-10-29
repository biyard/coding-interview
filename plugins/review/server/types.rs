use serde::{Deserialize, Serialize};

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

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct ListReviewCriteriaParams {}

#[derive(Debug, Serialize, Deserialize)]
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
    pub display_order: i16,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct ListReviewCriteriaResponse {
    pub criteria: Vec<ReviewCriterion>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct ListReviewsParams {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub enum ReviewDecision {
    Satisfied,
    NeedsInformation,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct Review {
    pub id: String,
    pub criterion_id: String,
    pub decision: ReviewDecision,
    pub opinion: String,
    pub evidence_document_ids: Vec<String>,
    #[cfg_attr(feature = "ts-bridge", ts(type = "number"))]
    pub revision: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct ListReviewsResponse {
    pub reviews: Vec<Review>,
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
    pub decision: ReviewDecision,
    pub opinion: String,
    pub evidence_document_ids: Vec<String>,
    #[serde(default)]
    #[cfg_attr(feature = "ts-bridge", ts(type = "number | null"))]
    pub expected_revision: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct SaveReviewResponse {
    pub review: Review,
}

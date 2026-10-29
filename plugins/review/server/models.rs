#[derive(Debug, sqlx::FromRow)]
pub(super) struct ReviewCriterionRow {
    pub(super) id: String,
    pub(super) title: String,
    pub(super) review_question: String,
    pub(super) display_order: i16,
}

#[derive(Debug, sqlx::FromRow)]
pub(super) struct ReviewRow {
    pub(super) id: String,
    pub(super) criterion_id: String,
    pub(super) decision: String,
    pub(super) opinion: String,
    pub(super) revision: i64,
    pub(super) created_at: String,
    pub(super) updated_at: String,
}

#[derive(Debug, sqlx::FromRow)]
pub(super) struct ReviewWithEvidenceRow {
    pub(super) id: String,
    pub(super) criterion_id: String,
    pub(super) decision: String,
    pub(super) opinion: String,
    pub(super) revision: i64,
    pub(super) created_at: String,
    pub(super) updated_at: String,
    pub(super) evidence_document_ids: Vec<String>,
}

#[derive(Debug, sqlx::FromRow)]
pub(super) struct ExistingReviewRow {
    pub(super) id: String,
    pub(super) revision: i64,
}

#[derive(Debug, sqlx::FromRow)]
pub(super) struct EvidenceDocumentRow {
    pub(super) id: String,
    pub(super) status: String,
}

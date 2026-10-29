#[derive(Debug, sqlx::FromRow)]
pub(super) struct DocumentSummaryRow {
    pub(super) id: String,
    pub(super) title: String,
    pub(super) status: String,
    pub(super) created_at: String,
}

#[derive(Debug, sqlx::FromRow)]
pub(super) struct DocumentDetailRow {
    pub(super) id: String,
    pub(super) title: String,
    pub(super) file_name: String,
    pub(super) content: String,
    pub(super) status: String,
    pub(super) created_at: String,
}

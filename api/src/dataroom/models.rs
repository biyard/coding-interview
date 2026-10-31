use super::types::{DataroomSummary, DocumentDetail, DocumentStatus, DocumentSummary};
use crate::error::ApiError;

#[derive(Debug, sqlx::FromRow)]
pub(super) struct DataroomRow {
    pub(super) id: String,
    pub(super) name: String,
    pub(super) description: String,
}

impl From<DataroomRow> for DataroomSummary {
    fn from(row: DataroomRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            description: row.description,
        }
    }
}

#[derive(Debug, sqlx::FromRow)]
pub(super) struct DocumentSummaryRow {
    pub(super) id: String,
    pub(super) title: String,
    pub(super) status: String,
    pub(super) created_at: String,
}

impl TryFrom<DocumentSummaryRow> for DocumentSummary {
    type Error = ApiError;

    fn try_from(row: DocumentSummaryRow) -> Result<Self, ApiError> {
        Ok(Self {
            id: row.id,
            title: row.title,
            status: DocumentStatus::from_db(&row.status)?,
            created_at: row.created_at,
        })
    }
}

#[derive(Debug, sqlx::FromRow)]
pub(super) struct DocumentDetailRow {
    pub(super) id: String,
    pub(super) title: String,
    pub(super) file_name: String,
    pub(super) status: String,
    pub(super) content: String,
    pub(super) uploader_name: String,
    pub(super) created_at: String,
}

impl TryFrom<DocumentDetailRow> for DocumentDetail {
    type Error = ApiError;

    fn try_from(row: DocumentDetailRow) -> Result<Self, ApiError> {
        Ok(Self {
            id: row.id,
            title: row.title,
            file_name: row.file_name,
            status: DocumentStatus::from_db(&row.status)?,
            content: row.content,
            uploader_name: row.uploader_name,
            created_at: row.created_at,
        })
    }
}

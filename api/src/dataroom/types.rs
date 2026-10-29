use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub enum DocumentStatus {
    Ready,
    Processing,
    Failed,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct ListDocumentsParams {
    #[serde(default)]
    pub search: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct DocumentSummary {
    pub id: String,
    pub title: String,
    pub status: DocumentStatus,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct ListDocumentsResponse {
    pub documents: Vec<DocumentSummary>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct GetDocumentParams {
    pub document_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct CreateDocumentParams {
    pub title: String,
    pub file_name: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct DocumentDetail {
    pub id: String,
    pub title: String,
    pub file_name: String,
    pub content: String,
    pub status: DocumentStatus,
    pub created_at: String,
}

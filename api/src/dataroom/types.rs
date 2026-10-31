use serde::{Deserialize, Serialize};

use crate::error::ApiError;
#[cfg(feature = "ts-bridge")]
use crate::types::RpcSignature;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
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

impl DocumentStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Ready => "ready",
            Self::Processing => "processing",
            Self::Failed => "failed",
        }
    }

    pub fn from_db(value: &str) -> Result<Self, ApiError> {
        match value {
            "ready" => Ok(Self::Ready),
            "processing" => Ok(Self::Processing),
            "failed" => Ok(Self::Failed),
            _ => Err(ApiError::storage("Unknown document status.")),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct DataroomSummary {
    pub id: String,
    pub name: String,
    pub description: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct ListDocumentsParams {
    #[serde(default)]
    #[cfg_attr(feature = "ts-bridge", ts(optional))]
    pub query: Option<String>,
    #[serde(default)]
    #[cfg_attr(feature = "ts-bridge", ts(optional))]
    pub status: Option<DocumentStatus>,
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
pub struct DocumentListResponse {
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
    pub status: DocumentStatus,
    pub content: String,
    pub uploader_name: String,
    pub created_at: String,
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

/// Method → params/result map that types `host.call(..., { target: "dataroom" })` on the TS side.
#[cfg(feature = "ts-bridge")]
#[derive(ts_rs::TS)]
#[ts(export, export_to = "types/", rename_all = "camelCase")]
pub struct DataroomRpcContract {
    pub get_dataroom: RpcSignature<(), DataroomSummary>,
    pub list_documents: RpcSignature<ListDocumentsParams, DocumentListResponse>,
    pub get_document: RpcSignature<GetDocumentParams, DocumentDetail>,
    pub create_document: RpcSignature<CreateDocumentParams, DocumentDetail>,
}

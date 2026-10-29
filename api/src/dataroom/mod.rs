pub mod models;
pub mod types;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::RngCore;
use serde::{Serialize, de::DeserializeOwned};
use sqlx::PgPool;

use crate::{
    auth::AuthenticatedUser,
    error::ApiError,
    types::{DataroomRpcRequest, RpcResponse, UserRole},
};
use models::{DocumentDetailRow, DocumentSummaryRow};
use types::{
    CreateDocumentParams, DocumentDetail, DocumentStatus, DocumentSummary, GetDocumentParams,
    ListDocumentsParams, ListDocumentsResponse,
};

const MAX_TITLE_CHARS: usize = 200;
const MAX_FILE_NAME_CHARS: usize = 255;
const MAX_CONTENT_BYTES: usize = 204_800;
const MAX_SEARCH_CHARS: usize = 200;

pub async fn dispatch(
    pool: &PgPool,
    user: &AuthenticatedUser,
    request: DataroomRpcRequest,
) -> Result<RpcResponse, ApiError> {
    if request.workspace_id != user.workspace_id {
        return Err(ApiError::forbidden());
    }

    match request.method.as_str() {
        "listDocuments" => list_documents(pool, user, request.params).await,
        "getDocument" => get_document(pool, user, request.params).await,
        "createDocument" => {
            if !matches!(user.role, UserRole::Company) {
                return Err(ApiError::forbidden_action());
            }
            create_document(pool, user, request.params).await
        }
        _ => Err(ApiError::not_found()),
    }
}

async fn list_documents(
    pool: &PgPool,
    user: &AuthenticatedUser,
    params: serde_json::Value,
) -> Result<RpcResponse, ApiError> {
    let params: ListDocumentsParams = if params.is_null() {
        ListDocumentsParams { search: None }
    } else {
        parse_params(params)?
    };
    let search = normalize_search(params.search)?;
    let rows = sqlx::query_as::<_, DocumentSummaryRow>(
        "SELECT d.id, d.title, d.status,
                TO_CHAR(d.created_at AT TIME ZONE 'UTC',
                        'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at
         FROM documents d
         WHERE d.workspace_id = $1
           AND ($2::TEXT IS NULL OR LOWER(d.title) LIKE LOWER($2) || '%')
         ORDER BY d.created_at DESC, d.id ASC",
    )
    .bind(&user.workspace_id)
    .bind(search.as_deref())
    .fetch_all(pool)
    .await
    .map_err(ApiError::storage)?;

    respond(ListDocumentsResponse {
        documents: rows
            .into_iter()
            .map(document_summary)
            .collect::<Result<_, _>>()?,
    })
}

async fn get_document(
    pool: &PgPool,
    user: &AuthenticatedUser,
    params: serde_json::Value,
) -> Result<RpcResponse, ApiError> {
    let params: GetDocumentParams = parse_params(params)?;
    validate_document_id(&params.document_id)?;
    let row = sqlx::query_as::<_, DocumentDetailRow>(
        "SELECT id, title, file_name, content, status,
                TO_CHAR(created_at AT TIME ZONE 'UTC',
                        'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at
         FROM documents
         WHERE workspace_id = $1 AND id = $2",
    )
    .bind(&user.workspace_id)
    .bind(params.document_id)
    .fetch_optional(pool)
    .await
    .map_err(ApiError::storage)?
    .ok_or_else(ApiError::not_found)?;

    respond(document_detail(row)?)
}

async fn create_document(
    pool: &PgPool,
    user: &AuthenticatedUser,
    params: serde_json::Value,
) -> Result<RpcResponse, ApiError> {
    let params: CreateDocumentParams = parse_params(params)?;
    validate_title(&params.title)?;
    validate_file_name(&params.file_name)?;
    validate_content(&params.content)?;

    let id = new_document_id();
    let row = sqlx::query_as::<_, DocumentDetailRow>(
        "INSERT INTO documents (id, workspace_id, title, file_name, content, status)
         VALUES ($1, $2, $3, $4, $5, 'ready')
         RETURNING id, title, file_name, content, status,
                   TO_CHAR(created_at AT TIME ZONE 'UTC',
                           'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at",
    )
    .bind(&id)
    .bind(&user.workspace_id)
    .bind(params.title)
    .bind(params.file_name)
    .bind(params.content)
    .fetch_one(pool)
    .await
    .map_err(ApiError::storage)?;

    respond(document_detail(row)?)
}

fn parse_params<T: DeserializeOwned>(params: serde_json::Value) -> Result<T, ApiError> {
    serde_json::from_value(params).map_err(|_| ApiError::invalid("Invalid request parameters."))
}

fn respond(value: impl Serialize) -> Result<RpcResponse, ApiError> {
    Ok(RpcResponse {
        result: serde_json::to_value(value).map_err(ApiError::storage)?,
    })
}

fn normalize_search(search: Option<String>) -> Result<Option<String>, ApiError> {
    let Some(search) = search else {
        return Ok(None);
    };
    let search = search.trim();
    if search.chars().count() > MAX_SEARCH_CHARS || search.contains('\0') {
        return Err(ApiError::invalid(
            "Search must contain at most 200 characters.",
        ));
    }
    Ok((!search.is_empty()).then(|| search.to_string()))
}

fn validate_document_id(id: &str) -> Result<(), ApiError> {
    if id.is_empty() || id.chars().count() > 100 || id.chars().any(char::is_whitespace) {
        return Err(ApiError::invalid("Document ID is invalid."));
    }
    Ok(())
}

fn validate_title(title: &str) -> Result<(), ApiError> {
    if title.trim().is_empty() || title.chars().count() > MAX_TITLE_CHARS || title.contains('\0') {
        return Err(ApiError::invalid(
            "Title must be 1 to 200 characters and must not be blank.",
        ));
    }
    Ok(())
}

fn validate_file_name(file_name: &str) -> Result<(), ApiError> {
    let valid_extension = file_name.rsplit_once('.').is_some_and(|(_, extension)| {
        extension.eq_ignore_ascii_case("txt") || extension.eq_ignore_ascii_case("md")
    });
    if file_name.trim().is_empty()
        || file_name.chars().count() > MAX_FILE_NAME_CHARS
        || file_name.contains(['/', '\\', '\0'])
        || !valid_extension
    {
        return Err(ApiError::invalid(
            "File name must be 1 to 255 characters and end in .txt or .md.",
        ));
    }
    Ok(())
}

fn validate_content(content: &str) -> Result<(), ApiError> {
    if content.len() > MAX_CONTENT_BYTES || content.contains('\0') {
        return Err(ApiError::invalid(
            "Document content must be valid UTF-8 and at most 204800 bytes.",
        ));
    }
    Ok(())
}

fn document_status(status: &str) -> Result<DocumentStatus, ApiError> {
    match status {
        "ready" => Ok(DocumentStatus::Ready),
        "processing" => Ok(DocumentStatus::Processing),
        "failed" => Ok(DocumentStatus::Failed),
        _ => Err(ApiError::storage("Unknown document status.")),
    }
}

fn document_summary(row: DocumentSummaryRow) -> Result<DocumentSummary, ApiError> {
    Ok(DocumentSummary {
        id: row.id,
        title: row.title,
        status: document_status(&row.status)?,
        created_at: row.created_at,
    })
}

fn document_detail(row: DocumentDetailRow) -> Result<DocumentDetail, ApiError> {
    Ok(DocumentDetail {
        id: row.id,
        title: row.title,
        file_name: row.file_name,
        content: row.content,
        status: document_status(&row.status)?,
        created_at: row.created_at,
    })
}

fn new_document_id() -> String {
    let mut bytes = [0_u8; 18];
    rand::rng().fill_bytes(&mut bytes);
    format!("doc-{}", URL_SAFE_NO_PAD.encode(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_document_input_boundaries() {
        assert!(validate_title("자료").is_ok());
        assert!(validate_title(" \n\t").is_err());
        assert!(validate_file_name("report.MD").is_ok());
        assert!(validate_file_name("../report.md").is_err());
        assert!(validate_file_name("report.pdf").is_err());
        assert!(validate_content(&"a".repeat(MAX_CONTENT_BYTES)).is_ok());
        assert!(validate_content(&"a".repeat(MAX_CONTENT_BYTES + 1)).is_err());
    }

    #[test]
    fn normalizes_optional_search() {
        assert_eq!(normalize_search(None).unwrap(), None);
        assert_eq!(normalize_search(Some("   ".into())).unwrap(), None);
        assert_eq!(
            normalize_search(Some("  회사  ".into())).unwrap(),
            Some("회사".into())
        );
    }
}

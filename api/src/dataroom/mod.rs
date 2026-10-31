pub mod models;
pub mod types;
use crate::{
    auth::AuthenticatedUser,
    error::ApiError,
    types::{DataroomRpcRequest, RpcResponse, UserRole, parse_params},
};
use models::{DataroomRow, DocumentDetailRow, DocumentSummaryRow};
use sqlx::PgPool;
use types::{
    CreateDocumentParams, DataroomSummary, DocumentDetail, DocumentListResponse, DocumentStatus,
    GetDocumentParams, ListDocumentsParams,
};

const MAX_TITLE_CHARS: usize = 200;
const MAX_FILE_NAME_CHARS: usize = 255;
const MAX_CONTENT_BYTES: usize = 200 * 1024;
const MAX_QUERY_CHARS: usize = 200;

pub async fn dispatch(
    pool: &PgPool,
    user: &AuthenticatedUser,
    request: DataroomRpcRequest,
) -> Result<RpcResponse, ApiError> {
    if request.workspace_id != user.workspace_id {
        return Err(ApiError::forbidden());
    }
    match request.method.as_str() {
        "getDataroom" => RpcResponse::new(get_dataroom(pool, user).await?),
        "listDocuments" => {
            RpcResponse::new(list_documents(pool, user, parse_params(request.params)?).await?)
        }
        "getDocument" => {
            RpcResponse::new(get_document(pool, user, parse_params(request.params)?).await?)
        }
        "createDocument" => {
            // Callers without write access are rejected before their input is inspected.
            if !matches!(user.role, UserRole::Company) {
                return Err(ApiError::role_forbidden());
            }
            RpcResponse::new(create_document(pool, user, parse_params(request.params)?).await?)
        }
        _ => Err(ApiError::not_found()),
    }
}

async fn get_dataroom(
    pool: &PgPool,
    user: &AuthenticatedUser,
) -> Result<DataroomSummary, ApiError> {
    sqlx::query_as::<_, DataroomRow>("SELECT id, name, description FROM workspaces WHERE id = $1")
        .bind(&user.workspace_id)
        .fetch_optional(pool)
        .await
        .map_err(ApiError::storage)?
        .map(DataroomSummary::from)
        .ok_or_else(ApiError::not_found)
}

async fn list_documents(
    pool: &PgPool,
    user: &AuthenticatedUser,
    params: ListDocumentsParams,
) -> Result<DocumentListResponse, ApiError> {
    let query = params
        .query
        .as_deref()
        .map(str::trim)
        .filter(|q| !q.is_empty());
    if query.is_some_and(|q| q.chars().count() > MAX_QUERY_CHARS) {
        return Err(ApiError::invalid(
            "Search text must be at most 200 characters.",
        ));
    }
    let pattern = query.map(|q| format!("%{}%", escape_like(q)));
    let rows = sqlx::query_as::<_, DocumentSummaryRow>(
        r#"SELECT d.id, d.title, d.status,
                  to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
           FROM documents d
           WHERE d.workspace_id = $1
             AND ($2::text IS NULL OR d.title ILIKE $2 ESCAPE '\')
             AND ($3::text IS NULL OR d.status = $3)
           ORDER BY d.created_at DESC, d.id"#,
    )
    .bind(&user.workspace_id)
    .bind(pattern)
    .bind(params.status.map(DocumentStatus::as_str))
    .fetch_all(pool)
    .await
    .map_err(ApiError::storage)?;
    Ok(DocumentListResponse {
        documents: rows
            .into_iter()
            .map(TryInto::try_into)
            .collect::<Result<_, _>>()?,
    })
}

async fn get_document(
    pool: &PgPool,
    user: &AuthenticatedUser,
    params: GetDocumentParams,
) -> Result<DocumentDetail, ApiError> {
    // Documents of another workspace answer 404 so their existence is not revealed.
    sqlx::query_as::<_, DocumentDetailRow>(
        r#"SELECT d.id, d.title, d.file_name, d.status, d.content,
                  u.display_name AS uploader_name,
                  to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
           FROM documents d
           JOIN users u ON u.id = d.uploaded_by
           WHERE d.workspace_id = $1 AND d.id = $2"#,
    )
    .bind(&user.workspace_id)
    .bind(&params.document_id)
    .fetch_optional(pool)
    .await
    .map_err(ApiError::storage)?
    .ok_or_else(ApiError::not_found)?
    .try_into()
}

async fn create_document(
    pool: &PgPool,
    user: &AuthenticatedUser,
    params: CreateDocumentParams,
) -> Result<DocumentDetail, ApiError> {
    let title = validate_title(&params.title)?;
    let file_name = validate_file_name(&params.file_name)?;
    validate_content(&params.content)?;
    sqlx::query_as::<_, DocumentDetailRow>(
        r#"WITH inserted AS (
               INSERT INTO documents (workspace_id, title, file_name, status, content, uploaded_by)
               VALUES ($1, $2, $3, 'ready', $4, $5)
               RETURNING *
           )
           SELECT i.id, i.title, i.file_name, i.status, i.content,
                  u.display_name AS uploader_name,
                  to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
           FROM inserted i
           JOIN users u ON u.id = i.uploaded_by"#,
    )
    .bind(&user.workspace_id)
    .bind(title)
    .bind(file_name)
    .bind(&params.content)
    .bind(&user.id)
    .fetch_one(pool)
    .await
    .map_err(ApiError::storage)?
    .try_into()
}

fn validate_title(title: &str) -> Result<&str, ApiError> {
    let title = title.trim();
    if title.is_empty() || title.chars().count() > MAX_TITLE_CHARS {
        return Err(ApiError::invalid("Title must be 1 to 200 characters."));
    }
    if title.chars().any(char::is_control) {
        return Err(ApiError::invalid(
            "Title cannot contain control characters.",
        ));
    }
    Ok(title)
}

fn validate_file_name(file_name: &str) -> Result<&str, ApiError> {
    let file_name = file_name.trim();
    let supported = file_name.rsplit_once('.').is_some_and(|(stem, extension)| {
        !stem.is_empty()
            && (extension.eq_ignore_ascii_case("txt") || extension.eq_ignore_ascii_case("md"))
    });
    if !supported {
        return Err(ApiError::invalid("Only .txt or .md files can be uploaded."));
    }
    if file_name.chars().count() > MAX_FILE_NAME_CHARS
        || file_name
            .chars()
            .any(|c| c == '/' || c == '\\' || c.is_control())
    {
        return Err(ApiError::invalid("File name is invalid."));
    }
    Ok(file_name)
}

fn validate_content(content: &str) -> Result<(), ApiError> {
    if content.trim().is_empty() {
        return Err(ApiError::invalid("File content is empty."));
    }
    if content.len() > MAX_CONTENT_BYTES {
        return Err(ApiError::invalid("File content must be at most 200 KiB."));
    }
    // PostgreSQL text cannot store NUL; reject it here instead of failing as a storage error.
    if content.contains('\0') {
        return Err(ApiError::invalid("File content must be UTF-8 text."));
    }
    Ok(())
}

fn escape_like(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for c in value.chars() {
        if matches!(c, '\\' | '%' | '_') {
            escaped.push('\\');
        }
        escaped.push(c);
    }
    escaped
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_is_trimmed_and_bounded() {
        assert_eq!(validate_title("  회사 소개 ").unwrap(), "회사 소개");
        assert!(validate_title(" \t\n ").is_err());
        assert!(validate_title(&"가".repeat(200)).is_ok());
        assert!(validate_title(&"가".repeat(201)).is_err());
        assert!(validate_title("a\nb").is_err());
    }

    #[test]
    fn file_name_accepts_only_txt_and_md() {
        assert!(validate_file_name("revenue-update.md").is_ok());
        assert!(validate_file_name("NOTES.TXT").is_ok());
        assert!(validate_file_name("report.pdf").is_err());
        assert!(validate_file_name(".md").is_err());
        assert!(validate_file_name("md").is_err());
        assert!(validate_file_name("../secret.md").is_err());
        assert!(validate_file_name("a\\b.md").is_err());
        assert!(validate_file_name("a\nb.md").is_err());
    }

    #[test]
    fn content_rejects_empty_oversized_and_nul() {
        assert!(validate_content("본문").is_ok());
        assert!(validate_content("  \n ").is_err());
        assert!(validate_content(&"a".repeat(MAX_CONTENT_BYTES)).is_ok());
        assert!(validate_content(&"a".repeat(MAX_CONTENT_BYTES + 1)).is_err());
        assert!(validate_content("a\0b").is_err());
    }

    #[test]
    fn like_wildcards_are_escaped() {
        assert_eq!(escape_like("100%_a\\b"), "100\\%\\_a\\\\b");
        assert_eq!(escape_like("매출"), "매출");
    }
}

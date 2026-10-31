#![allow(dead_code)]

use dataroom_api::{
    auth::AuthenticatedUser,
    dataroom,
    error::ApiError,
    plugins,
    types::{DataroomRpcRequest, PluginRpcRequest, UserRole},
};
use serde_json::Value;
use sqlx::PgPool;

fn user(id: &str, role: UserRole) -> AuthenticatedUser {
    AuthenticatedUser {
        id: id.into(),
        name: id.into(),
        role,
        workspace_id: "lighthouse".into(),
        workspace_name: "라이트하우스".into(),
    }
}

pub fn company() -> AuthenticatedUser {
    user("company-user", UserRole::Company)
}

pub fn investor() -> AuthenticatedUser {
    user("investor-user", UserRole::Investor)
}

pub fn peer() -> AuthenticatedUser {
    user("investor-peer", UserRole::Investor)
}

pub async fn room(
    pool: &PgPool,
    user: &AuthenticatedUser,
    method: &str,
    params: Value,
) -> Result<Value, ApiError> {
    dataroom::dispatch(
        pool,
        user,
        DataroomRpcRequest {
            workspace_id: user.workspace_id.clone(),
            method: method.into(),
            params,
        },
    )
    .await
    .map(|response| response.result)
}

pub async fn review(
    pool: &PgPool,
    user: &AuthenticatedUser,
    method: &str,
    params: Value,
) -> Result<Value, ApiError> {
    plugins::dispatch(
        pool,
        user,
        PluginRpcRequest {
            plugin_id: "review".into(),
            workspace_id: user.workspace_id.clone(),
            method: method.into(),
            params,
        },
    )
    .await
    .map(|response| response.result)
}

/// HTTP status and error kind of a failed call.
pub fn failure(result: Result<Value, ApiError>) -> (u16, &'static str) {
    let error = result.expect_err("call should fail");
    (error.0.as_u16(), error.1)
}

/// A second workspace with its own member and one ready document, to prove isolation.
pub async fn add_other_workspace(pool: &PgPool) {
    sqlx::raw_sql(
        "INSERT INTO workspaces (id, name) VALUES ('other', '다른 데이터룸');
         INSERT INTO users (id, email, display_name, password_hash)
             VALUES ('other-company', 'company@other.test', '타사 담당자', 'unused');
         INSERT INTO workspace_users (workspace_id, user_id, role)
             VALUES ('other', 'other-company', 'company');
         INSERT INTO documents (id, workspace_id, title, file_name, status, content, uploaded_by)
             VALUES ('doc-other', 'other', '타사 자료', 'other.md', 'ready', '비공개', 'other-company');",
    )
    .execute(pool)
    .await
    .expect("seed other workspace");
}

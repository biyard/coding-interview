use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub enum UserRole {
    Company,
    Investor,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct Viewer {
    pub id: String,
    pub name: String,
    pub role: UserRole,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct Workspace {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct HostSession {
    pub user: Viewer,
    pub workspace: Workspace,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct GetSessionResponse {
    pub session: Option<HostSession>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct LogoutResponse {
    pub ok: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct HealthResponse {
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct PluginRegistration {
    pub id: String,
    pub name: String,
    pub manifest_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct DataroomRpcRequest {
    pub workspace_id: String,
    pub method: String,
    #[serde(default)]
    #[cfg_attr(feature = "ts-bridge", ts(type = "unknown"))]
    pub params: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct PluginRpcRequest {
    pub plugin_id: String,
    pub workspace_id: String,
    pub method: String,
    #[serde(default)]
    #[cfg_attr(feature = "ts-bridge", ts(type = "unknown"))]
    pub params: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct RpcResponse {
    #[cfg_attr(feature = "ts-bridge", ts(type = "unknown"))]
    pub result: serde_json::Value,
}

impl RpcResponse {
    pub fn new(result: impl Serialize) -> Result<Self, crate::error::ApiError> {
        Ok(Self {
            result: serde_json::to_value(result).map_err(crate::error::ApiError::storage)?,
        })
    }
}

/// Reads RPC params into a typed struct; a missing (`null`) value counts as an empty object.
pub fn parse_params<T: serde::de::DeserializeOwned>(
    params: serde_json::Value,
) -> Result<T, crate::error::ApiError> {
    let params = if params.is_null() {
        serde_json::Value::Object(Default::default())
    } else {
        params
    };
    serde_json::from_value(params)
        .map_err(|_| crate::error::ApiError::invalid("Request parameters are invalid."))
}

/// Params and result of one RPC method, exported only to type RPC contracts on the TS side.
#[cfg(feature = "ts-bridge")]
#[derive(ts_rs::TS)]
#[ts(export, export_to = "types/")]
pub struct RpcSignature<P, R> {
    pub params: P,
    pub result: R,
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(
    feature = "ts-bridge",
    derive(ts_rs::TS),
    ts(export, export_to = "types/")
)]
pub struct ApiErrorBody {
    pub kind: String,
    pub message: String,
}

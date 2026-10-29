import { dataroomRpcHandler } from "@interview/api-client/handlers/dataroomRpcHandler";
import type { CreateDocumentParams } from "@interview/api-types/CreateDocumentParams";
import type { DocumentDetail } from "@interview/api-types/DocumentDetail";
import type { GetDocumentParams } from "@interview/api-types/GetDocumentParams";
import type { ListDocumentsParams } from "@interview/api-types/ListDocumentsParams";
import type { ListDocumentsResponse } from "@interview/api-types/ListDocumentsResponse";

export const dataroomKeys = {
  documents: (workspaceId: string) =>
    ["dataroom", workspaceId, "documents"] as const,
  documentList: (workspaceId: string, search: string) =>
    [...dataroomKeys.documents(workspaceId), search] as const,
  document: (workspaceId: string, documentId: string) =>
    ["dataroom", workspaceId, "document", documentId] as const,
};

async function call<T>(
  workspaceId: string,
  method: string,
  params: unknown,
): Promise<T> {
  const response = await dataroomRpcHandler({ workspaceId, method, params });
  return response.result as T;
}

export function listDocuments(
  workspaceId: string,
  params: ListDocumentsParams,
) {
  return call<ListDocumentsResponse>(workspaceId, "listDocuments", params);
}

export function getDocument(workspaceId: string, params: GetDocumentParams) {
  return call<DocumentDetail>(workspaceId, "getDocument", params);
}

export function createDocument(
  workspaceId: string,
  params: CreateDocumentParams,
) {
  return call<DocumentDetail>(workspaceId, "createDocument", params);
}

export function createDocumentRequestBytes(
  workspaceId: string,
  params: CreateDocumentParams,
) {
  return new TextEncoder().encode(
    JSON.stringify({ workspaceId, method: "createDocument", params }),
  ).byteLength;
}

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dataroomRpcHandler } from "@interview/api-client/handlers/dataroomRpcHandler";
import { ApiError } from "@interview/api-client/runtime/client";
import type { RpcClient } from "@interview/plugin-sdk";
import type { CreateDocumentParams } from "@interview/api-types/CreateDocumentParams";
import type { DataroomRpcContract } from "@interview/api-types/DataroomRpcContract";
import type { HostSession } from "../../../shared/platform";
import { expireSession } from "../auth/session";

/** Host-side twin of `createRpcClient`: the same generated contract types both callers. */
export function dataroomClient(workspaceId: string): RpcClient<DataroomRpcContract> {
  return async function call<M extends keyof DataroomRpcContract & string>(
    method: M,
    params: DataroomRpcContract[M]["params"],
  ) {
    try {
      const response = await dataroomRpcHandler({ workspaceId, method, params });
      return response.result as DataroomRpcContract[M]["result"];
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) expireSession();
      throw error;
    }
  };
}

const roomKey = (session: HostSession) =>
  ["dataroom", session.user.id, session.workspace.id] as const;

export const dataroomKeys = {
  summary: (session: HostSession) => [...roomKey(session), "summary"] as const,
  lists: (session: HostSession) => [...roomKey(session), "documents", "list"] as const,
  list: (session: HostSession, query: string) => [...dataroomKeys.lists(session), query] as const,
  document: (session: HostSession, documentId: string) =>
    [...roomKey(session), "documents", "detail", documentId] as const,
};

export function useDataroom(session: HostSession) {
  return useQuery({
    queryKey: dataroomKeys.summary(session),
    queryFn: () => dataroomClient(session.workspace.id)("getDataroom", null),
  });
}

export function useDocuments(session: HostSession, query: string) {
  return useQuery({
    queryKey: dataroomKeys.list(session, query),
    queryFn: () => dataroomClient(session.workspace.id)("listDocuments", query ? { query } : {}),
    placeholderData: keepPreviousData,
  });
}

export function useDocument(session: HostSession, documentId: string) {
  return useQuery({
    queryKey: dataroomKeys.document(session, documentId),
    queryFn: () => dataroomClient(session.workspace.id)("getDocument", { documentId }),
  });
}

export function useCreateDocument(session: HostSession) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateDocumentParams) =>
      dataroomClient(session.workspace.id)("createDocument", params),
    onSuccess: (document) => {
      queryClient.setQueryData(dataroomKeys.document(session, document.id), document);
      return queryClient.invalidateQueries({ queryKey: dataroomKeys.lists(session) });
    },
  });
}

export function errorStatus(error: unknown): number | null {
  return error instanceof ApiError ? error.status : null;
}

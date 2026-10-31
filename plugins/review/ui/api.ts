import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRpcClient,
  isPluginRpcError,
  scopedKey,
  type PluginContext,
  type PluginHost,
} from "@interview/plugin-sdk";
import type { DataroomRpcContract } from "@interview/api-types/DataroomRpcContract";
import type { ReviewRpcContract } from "@interview/api-types/ReviewRpcContract";
import type { SaveReviewParams } from "@interview/api-types/SaveReviewParams";

export function useClients(host: PluginHost) {
  return useMemo(
    () => ({
      review: createRpcClient<ReviewRpcContract>(host),
      // Documents are owned by the data room, so the plugin reads them through the host boundary.
      dataroom: createRpcClient<DataroomRpcContract>(host, "dataroom"),
    }),
    [host],
  );
}

const keys = {
  reviews: (context: PluginContext) => scopedKey(context, "review", "reviews"),
  progress: (context: PluginContext) => scopedKey(context, "review", "reviews", "progress"),
  mine: (context: PluginContext) => scopedKey(context, "review", "reviews", "mine"),
  criteria: (context: PluginContext) => scopedKey(context, "review", "criteria"),
  documents: (context: PluginContext) => scopedKey(context, "dataroom", "documents"),
};

export function useProgress(host: PluginHost, context: PluginContext) {
  const { review } = useClients(host);
  return useQuery({
    queryKey: keys.progress(context),
    queryFn: ({ signal }) => review("getMyProgress", null, { signal }),
  });
}

export function useCriteria(host: PluginHost, context: PluginContext) {
  const { review } = useClients(host);
  return useQuery({
    queryKey: keys.criteria(context),
    queryFn: ({ signal }) => review("listCriteria", null, { signal }),
    staleTime: Infinity,
  });
}

export function useMyReviews(host: PluginHost, context: PluginContext) {
  const { review } = useClients(host);
  return useQuery({
    queryKey: keys.mine(context),
    queryFn: ({ signal }) => review("listMyReviews", null, { signal }),
  });
}

export function useDocuments(host: PluginHost, context: PluginContext) {
  const { dataroom } = useClients(host);
  return useQuery({
    queryKey: keys.documents(context),
    queryFn: ({ signal }) => dataroom("listDocuments", {}, { signal }),
  });
}

export function useSaveReview(host: PluginHost, context: PluginContext) {
  const { review } = useClients(host);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: SaveReviewParams) => review("saveReview", params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.reviews(context) }),
  });
}

/** Asks the server for an AI draft. Nothing is saved, so no cached review or progress changes. */
export function useDraftReview(host: PluginHost) {
  const { review } = useClients(host);
  return useMutation({
    mutationFn: (criterionId: string) => review("draftReview", { criterionId }),
  });
}

export function rpcError(error: unknown) {
  return isPluginRpcError(error) ? { status: error.status, kind: error.kind } : null;
}

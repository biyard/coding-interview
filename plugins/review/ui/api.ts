import {
  scopedKey,
  type PluginContext,
  type PluginHost,
} from "@interview/plugin-sdk";
import type { DocumentDetail } from "@interview/api-types/DocumentDetail";
import type { ListDocumentsResponse } from "@interview/api-types/ListDocumentsResponse";
import type { ListReviewCriteriaResponse } from "@interview/api-types/ListReviewCriteriaResponse";
import type { ListReviewsResponse } from "@interview/api-types/ListReviewsResponse";
import type { SaveReviewParams } from "@interview/api-types/SaveReviewParams";
import type { SaveReviewResponse } from "@interview/api-types/SaveReviewResponse";

export const reviewKeys = {
  criteria: (context: PluginContext) =>
    scopedKey(context, "review", "criteria"),
  reviews: (context: PluginContext) => scopedKey(context, "review", "reviews"),
  documents: (context: PluginContext) =>
    scopedKey(context, "review", "documents"),
  document: (context: PluginContext, documentId: string) =>
    scopedKey(context, "review", "document", documentId),
};

export function listCriteria(host: PluginHost) {
  return host.call<ListReviewCriteriaResponse>("listCriteria", {});
}

export function listReviews(host: PluginHost) {
  return host.call<ListReviewsResponse>("listReviews", {});
}

export function saveReview(host: PluginHost, params: SaveReviewParams) {
  return host.call<SaveReviewResponse>("saveReview", params);
}

export function listEvidenceDocuments(host: PluginHost) {
  return host.call<ListDocumentsResponse>(
    "listDocuments",
    { search: null },
    { target: "dataroom" },
  );
}

export function getEvidenceDocument(host: PluginHost, documentId: string) {
  return host.call<DocumentDetail>(
    "getDocument",
    { documentId },
    { target: "dataroom" },
  );
}

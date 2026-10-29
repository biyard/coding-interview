import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PluginProps } from "@interview/plugin-sdk/react";
import type { ListReviewsResponse } from "@interview/api-types/ListReviewsResponse";
import { Button } from "@biyard/components";
import { listCriteria, listReviews, reviewKeys } from "./api";
import { reviewCopy } from "./copy";
import { EvidenceDocumentDetail } from "./document-detail";
import { ReviewEditor } from "./review-editor";
import { ReviewOverview } from "./review-overview";

type ReviewRoute =
  | { kind: "overview" }
  | { kind: "criterion"; criterionId: string }
  | { kind: "document"; documentId: string; criterionId: string | null }
  | { kind: "invalid" };

function decodePathSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function parseRoute(location: string): ReviewRoute {
  const url = new URL(location, "https://review.plugin.local");
  const segments = url.pathname.split("/").filter(Boolean);
  if (!segments.length) return { kind: "overview" };
  if (segments.length === 2 && segments[0] === "criteria") {
    const criterionId = decodePathSegment(segments[1]);
    return criterionId
      ? { kind: "criterion", criterionId }
      : { kind: "invalid" };
  }
  if (segments.length === 2 && segments[0] === "documents") {
    const documentId = decodePathSegment(segments[1]);
    const criterionId = url.searchParams.get("criterion");
    return documentId
      ? { kind: "document", documentId, criterionId }
      : { kind: "invalid" };
  }
  return { kind: "invalid" };
}

export function App({ host, context }: PluginProps) {
  const text = reviewCopy[context.locale];
  const queryClient = useQueryClient();
  const investor = context.user.role === "investor";
  const route = parseRoute(context.location);
  const criteria = useQuery({
    queryKey: reviewKeys.criteria(context),
    queryFn: () => listCriteria(host),
  });
  const reviews = useQuery({
    queryKey: reviewKeys.reviews(context),
    queryFn: () => listReviews(host),
    enabled: investor,
  });

  if (criteria.isPending || (investor && reviews.isPending))
    return <p role="status">{text.loading}</p>;

  if (criteria.isError || (investor && reviews.isError))
    return (
      <div
        role="alert"
        className="space-y-3 rounded-lg border border-border bg-card p-6"
      >
        <p>{text.loadError}</p>
        <Button
          variant="outline"
          onClick={() => {
            void criteria.refetch();
            if (investor) void reviews.refetch();
          }}
        >
          {text.retry}
        </Button>
      </div>
    );

  const criterionItems = criteria.data?.criteria ?? [];
  const reviewItems = reviews.data?.reviews ?? [];

  if (!investor)
    return (
      <ReviewOverview
        host={host}
        criteria={criterionItems}
        reviews={[]}
        company
        text={text}
      />
    );

  if (route.kind === "overview")
    return (
      <ReviewOverview
        host={host}
        criteria={criterionItems}
        reviews={reviewItems}
        company={false}
        text={text}
      />
    );

  if (route.kind === "criterion") {
    const criterion = criterionItems.find(
      (item) => item.id === route.criterionId,
    );
    if (criterion) {
      const initialReview =
        reviewItems.find((item) => item.criterionId === criterion.id) ?? null;
      return (
        <ReviewEditor
          key={criterion.id}
          host={host}
          context={context}
          criterion={criterion}
          initialReview={initialReview}
          text={text}
          reloadReviews={async () => {
            const result = await reviews.refetch();
            if (result.error) throw result.error;
            return result.data?.reviews.find(
              (item) => item.criterionId === criterion.id,
            );
          }}
          onSaved={(review) => {
            queryClient.setQueryData<ListReviewsResponse>(
              reviewKeys.reviews(context),
              (current) => {
                const currentReviews = current?.reviews ?? [];
                const exists = currentReviews.some(
                  (item) => item.id === review.id,
                );
                return {
                  reviews: exists
                    ? currentReviews.map((item) =>
                        item.id === review.id ? review : item,
                      )
                    : [...currentReviews, review],
                };
              },
            );
            host.navigate("/");
          }}
        />
      );
    }
  }

  if (route.kind === "document")
    return (
      <EvidenceDocumentDetail
        host={host}
        context={context}
        documentId={route.documentId}
        criterionId={route.criterionId}
        text={text}
      />
    );

  return (
    <div
      role="alert"
      className="space-y-3 rounded-lg border border-border bg-card p-6"
    >
      <p>{text.invalidRoute}</p>
      <Button variant="outline" onClick={() => host.navigate("/")}>
        {text.backToOverview}
      </Button>
    </div>
  );
}

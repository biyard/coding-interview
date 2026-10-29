import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@biyard/components";
import type { PluginHost } from "@interview/plugin-sdk";
import type { Review } from "@interview/api-types/Review";
import type { ReviewCriterion } from "@interview/api-types/ReviewCriterion";
import type { ReviewText } from "./copy";

function reviewStatus(review: Review | undefined, text: ReviewText) {
  if (!review) return { label: text.notStarted, variant: "default" as const };
  if (review.decision === "satisfied")
    return { label: text.satisfied, variant: "success" as const };
  return { label: text.needsInformation, variant: "warning" as const };
}

export function ReviewOverview({
  host,
  criteria,
  reviews,
  company,
  text,
}: {
  host: PluginHost;
  criteria: ReviewCriterion[];
  reviews: Review[];
  company: boolean;
  text: ReviewText;
}) {
  const reviewsByCriterion = new Map(
    reviews.map((review) => [review.criterionId, review]),
  );
  const reviewed = reviews.length;
  const needsInformation = reviews.filter(
    (review) => review.decision === "needs_information",
  ).length;

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-heading-3 font-semibold">{text.title}</h1>
        <p className="text-muted-foreground">{text.description}</p>
      </header>

      {company ? (
        <Card>
          <CardContent className="space-y-1 p-5">
            <p className="font-semibold">{text.companyNotice}</p>
            <p className="text-muted-foreground">{text.companyPrivateNotice}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-heading-5 font-semibold">{text.progress}</h2>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              [text.total, criteria.length],
              [text.reviewed, reviewed],
              [text.pending, Math.max(criteria.length - reviewed, 0)],
              [text.needsInformationCount, needsInformation],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-lg border border-border bg-card p-4"
              >
                <dt className="text-caption text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-heading-4 font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-heading-5 font-semibold">{text.criteriaTitle}</h2>
        {criteria.length ? (
          <div className="grid gap-3">
            {criteria.map((criterion) => {
              const review = reviewsByCriterion.get(criterion.id);
              const status = reviewStatus(review, text);
              return (
                <Card key={criterion.id}>
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div className="space-y-1">
                      <CardTitle>{criterion.title}</CardTitle>
                      <p className="text-muted-foreground">
                        {criterion.reviewQuestion}
                      </p>
                    </div>
                    {!company ? (
                      <Badge variant={status.variant}>{status.label}</Badge>
                    ) : null}
                  </CardHeader>
                  {!company ? (
                    <CardContent className="flex flex-wrap items-end justify-between gap-4">
                      {review ? (
                        <p className="line-clamp-2 min-w-0 flex-1 text-body-sm text-muted-foreground">
                          {review.opinion}
                        </p>
                      ) : (
                        <span />
                      )}
                      <Button
                        variant="outline"
                        onClick={() =>
                          host.navigate(
                            `/criteria/${encodeURIComponent(criterion.id)}`,
                          )
                        }
                      >
                        {review ? text.editReview : text.openReview}
                      </Button>
                    </CardContent>
                  ) : null}
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            {text.emptyCriteria}
          </div>
        )}
      </div>
    </section>
  );
}

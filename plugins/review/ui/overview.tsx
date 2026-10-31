import { Badge, Button, Card } from "@biyard/components";
import type { PluginContext, PluginHost } from "@interview/plugin-sdk";
import type { ProgressEntry } from "@interview/api-types/ProgressEntry";
import type { ProgressSummary } from "@interview/api-types/ProgressSummary";
import type { ReviewVerdict } from "@interview/api-types/ReviewVerdict";
import { useCriteria, useProgress } from "./api";
import { DocumentLink, PluginLink } from "./links";
import { fill, formatDateTime, type Strings } from "./strings";

interface Props {
  host: PluginHost;
  context: PluginContext;
  text: Strings;
}

export function VerdictBadge({ verdict, text }: { verdict: ReviewVerdict | null; text: Strings }) {
  if (verdict === "satisfied") return <Badge variant="success">{text.satisfied}</Badge>;
  if (verdict === "needs_information")
    return <Badge variant="warning">{text.needsInformation}</Badge>;
  return <Badge>{text.pending}</Badge>;
}

function Failure({ message, retry, text }: { message: string; retry(): void; text: Strings }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-4 rounded-lg border border-border bg-card p-6"
    >
      <p>{message}</p>
      <Button variant="outline" onClick={retry}>
        {text.retry}
      </Button>
    </div>
  );
}

export function Overview({
  host,
  context,
  text,
  savedCriterionId,
}: Props & { savedCriterionId: string | null }) {
  return context.user.role === "investor" ? (
    <InvestorOverview
      host={host}
      context={context}
      text={text}
      savedCriterionId={savedCriterionId}
    />
  ) : (
    <CompanyOverview host={host} context={context} text={text} />
  );
}

function CompanyOverview({ host, context, text }: Props) {
  const criteria = useCriteria(host, context);
  return (
    <div className="space-y-6">
      <h1 className="text-heading-3 font-semibold">{text.criteriaTitle}</h1>
      <p
        role="note"
        className="rounded-md border border-border bg-secondary px-4 py-3 text-secondary-foreground"
      >
        {text.companyNotice}
      </p>
      {criteria.isPending ? (
        <p role="status">{text.loading}</p>
      ) : criteria.isError ? (
        <Failure message={text.criteriaError} retry={() => criteria.refetch()} text={text} />
      ) : (
        <ol className="space-y-3">
          {criteria.data.criteria.map((criterion) => (
            <li key={criterion.id}>
              <Card className="space-y-1 p-5">
                <h2 className="text-heading-5 font-semibold">{criterion.title}</h2>
                <p className="text-muted-foreground">{criterion.reviewQuestion}</p>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function InvestorOverview({
  host,
  context,
  text,
  savedCriterionId,
}: Props & { savedCriterionId: string | null }) {
  const progress = useProgress(host, context);
  const saved = progress.data?.entries.find((entry) => entry.criterion.id === savedCriterionId);
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-heading-3 font-semibold">{text.overviewTitle}</h1>
        <p className="text-muted-foreground">{text.overviewIntro}</p>
      </header>
      {saved ? (
        <p role="status" className="rounded-md bg-success-muted px-4 py-3 text-success">
          {fill(text.savedNotice, { title: saved.criterion.title })}
        </p>
      ) : null}
      {progress.isPending ? (
        <p role="status">{text.loading}</p>
      ) : progress.isError ? (
        <Failure message={text.progressError} retry={() => progress.refetch()} text={text} />
      ) : (
        <>
          <SummaryPanel summary={progress.data.summary} text={text} />
          <ol className="space-y-4">
            {progress.data.entries.map((entry) => (
              <li key={entry.criterion.id}>
                <CriterionCard entry={entry} host={host} context={context} text={text} />
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function SummaryPanel({ summary, text }: { summary: ProgressSummary; text: Strings }) {
  const share = (count: number) => (summary.totalCount ? (count / summary.totalCount) * 100 : 0);
  const stats = [
    { label: text.written, value: summary.writtenCount },
    { label: text.pending, value: summary.pendingCount },
    { label: text.satisfied, value: summary.satisfiedCount },
    { label: text.needsInformation, value: summary.needsInformationCount },
  ];
  return (
    <section
      aria-labelledby="progress-heading"
      className="space-y-4 rounded-lg border border-border bg-card p-6"
    >
      <h2 id="progress-heading" className="text-heading-5 font-semibold">
        {fill(text.writtenOf, { written: summary.writtenCount, total: summary.totalCount })}
      </h2>
      {/* Decorative: the same numbers are listed right below as text. */}
      <div aria-hidden="true" className="flex h-3 overflow-hidden rounded-full bg-secondary">
        <span className="bg-success" style={{ width: `${share(summary.satisfiedCount)}%` }} />
        <span
          className="bg-warning"
          style={{ width: `${share(summary.needsInformationCount)}%` }}
        />
      </div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="space-y-1">
            <dt className="text-caption text-muted-foreground">{stat.label}</dt>
            <dd className="text-heading-4 font-semibold">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function CriterionCard({ entry, host, context, text }: Props & { entry: ProgressEntry }) {
  const { criterion, review } = entry;
  const headingId = `criterion-${criterion.id}`;
  return (
    <Card aria-labelledby={headingId} role="region" className="space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id={headingId} className="text-heading-5 font-semibold">
            {criterion.title}
          </h2>
          <p className="text-muted-foreground">{criterion.reviewQuestion}</p>
        </div>
        <VerdictBadge verdict={review?.verdict ?? null} text={text} />
      </div>
      {review ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-caption font-semibold text-muted-foreground">{text.comment}</h3>
            <p className="whitespace-pre-wrap break-words">{review.comment}</p>
          </div>
          <div className="space-y-1">
            <h3 className="text-caption font-semibold text-muted-foreground">{text.evidence}</h3>
            <ul className="flex flex-wrap gap-2">
              {review.evidence.map((document) => (
                <li key={document.documentId}>
                  <DocumentLink
                    host={host}
                    documentId={document.documentId}
                    className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-primary hover:bg-accent"
                  >
                    {document.title}
                  </DocumentLink>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-caption text-muted-foreground">
            {fill(text.lastSaved, { time: formatDateTime(review.updatedAt, context.locale) })}
          </p>
        </div>
      ) : null}
      <PluginLink
        host={host}
        context={context}
        to={`/criteria/${encodeURIComponent(criterion.id)}`}
        className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary-hover"
      >
        {review ? text.editReview : text.writeReview}
        <span className="sr-only">: {criterion.title}</span>
      </PluginLink>
    </Card>
  );
}

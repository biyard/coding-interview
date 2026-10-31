import { Link, useLocation, useParams } from "react-router-dom";
import { Button } from "@biyard/components";
import type { HostSession } from "../../../shared/platform";
import { useI18n } from "../i18n";
import { errorStatus, useDocument } from "./api";
import { roomPath } from "./paths";
import { formatDateTime } from "./format";
import { StatusBadge } from "./status-badge";

interface DetailState {
  fromSearch?: string;
  created?: boolean;
}

export function DocumentDetailPage({ session }: { session: HostSession }) {
  const { t, locale } = useI18n();
  const { documentId = "" } = useParams();
  const state = (useLocation().state ?? {}) as DetailState;
  const document = useDocument(session, documentId);
  const fromSearch = state.fromSearch?.startsWith("?") ? state.fromSearch : "";

  return (
    <div className="space-y-6">
      <Link
        to={`${roomPath(session)}${fromSearch}`}
        className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline"
      >
        ← {t.backToList}
      </Link>
      {state.created ? (
        <p role="status" className="rounded-md bg-success-muted px-4 py-3 text-success">
          {t.documentCreated}
        </p>
      ) : null}

      {document.isPending ? (
        <p role="status">{t.loading}</p>
      ) : document.isError ? (
        errorStatus(document.error) === 404 ? (
          <p role="alert" className="rounded-lg border border-border bg-card p-6">
            {t.documentNotFound}
          </p>
        ) : (
          <div
            role="alert"
            className="flex flex-col items-start gap-4 rounded-lg border border-border bg-card p-6"
          >
            <p>{t.documentError}</p>
            <Button variant="outline" onClick={() => document.refetch()}>
              {t.retry}
            </Button>
          </div>
        )
      ) : (
        <article className="space-y-6 rounded-lg border border-border bg-card p-6">
          <header className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="min-w-0 text-heading-3 font-semibold break-words">
                {document.data.title}
              </h1>
              <StatusBadge status={document.data.status} />
            </div>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
              <dt className="text-muted-foreground">{t.fileName}</dt>
              <dd className="break-all">{document.data.fileName}</dd>
              <dt className="text-muted-foreground">{t.uploadedBy}</dt>
              <dd>{document.data.uploaderName}</dd>
              <dt className="text-muted-foreground">{t.uploadedAt}</dt>
              <dd>
                <time dateTime={document.data.createdAt}>
                  {formatDateTime(document.data.createdAt, locale)}
                </time>
              </dd>
            </dl>
          </header>
          <section aria-labelledby="document-content-heading" className="space-y-2">
            <h2 id="document-content-heading" className="text-heading-5 font-semibold">
              {t.documentContent}
            </h2>
            {/* Rendered as plain text on purpose: uploaded Markdown is never interpreted as HTML. */}
            <pre className="max-h-[60vh] overflow-auto rounded-md border border-border bg-background p-4 font-sans text-body-sm whitespace-pre-wrap break-words">
              {document.data.content}
            </pre>
          </section>
        </article>
      )}
    </div>
  );
}

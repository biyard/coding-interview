import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Button, Input } from "@biyard/components";
import type { HostSession } from "../../../shared/platform";
import { useI18n } from "../i18n";
import { useDataroom, useDocuments } from "./api";
import { documentPath, roomPath } from "./paths";
import { fill, formatDateTime, useDebouncedValue } from "./format";
import { StatusBadge } from "./status-badge";

export function DocumentList({ session }: { session: HostSession }) {
  const { t, locale } = useI18n();
  const location = useLocation();
  const room = useDataroom(session);
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";
  const [input, setInput] = useState(query);
  const debounced = useDebouncedValue(input.trim(), 300);
  // The URL is the source of truth for the search, so refreshes and shared links keep it.
  useEffect(() => {
    if (debounced !== query) setSearchParams(debounced ? { q: debounced } : {}, { replace: true });
  }, [debounced, query, setSearchParams]);
  const documents = useDocuments(session, query);
  const searching = documents.isFetching && documents.isPlaceholderData;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-heading-3 font-semibold">
            {room.data?.name ?? session.workspace.name}
          </h1>
          {room.data?.description ? (
            <p className="text-muted-foreground">{room.data.description}</p>
          ) : null}
          {room.isError ? (
            <p role="alert" className="flex flex-wrap items-center gap-2 text-destructive">
              {t.roomError}
              <Button variant="ghost" size="sm" onClick={() => room.refetch()}>
                {t.retry}
              </Button>
            </p>
          ) : null}
        </div>
        {session.user.role === "company" ? (
          <Button asChild className="min-h-11">
            <Link to={`${roomPath(session)}/documents/new`}>{t.uploadDocument}</Link>
          </Button>
        ) : null}
      </header>

      <section aria-labelledby="documents-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="documents-heading" className="text-heading-5 font-semibold">
            {t.documents}
            {documents.data && !documents.isError ? (
              <span className="ml-2 text-body-sm font-normal text-muted-foreground">
                {fill(t.documentCount, { count: documents.data.documents.length })}
              </span>
            ) : null}
          </h2>
          <label className="flex w-full flex-col gap-2 sm:w-80">
            {t.searchLabel}
            <Input
              type="search"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t.searchPlaceholder}
              maxLength={200}
              className="min-h-11"
            />
          </label>
        </div>
        <p aria-live="polite" className="min-h-5 text-caption text-muted-foreground">
          {searching ? t.searching : ""}
        </p>

        {documents.isError ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-4 rounded-lg border border-border bg-card p-6"
          >
            <p>{t.documentsError}</p>
            <Button variant="outline" onClick={() => documents.refetch()}>
              {t.retry}
            </Button>
          </div>
        ) : documents.isPending ? (
          <p role="status">{t.loading}</p>
        ) : documents.data.documents.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-muted-foreground">
            {query ? fill(t.noSearchResults, { query }) : t.noDocuments}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {documents.data.documents.map((document) => (
              <li key={document.id}>
                <Link
                  to={documentPath(session, document.id)}
                  state={{ fromSearch: location.search }}
                  className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 hover:bg-accent"
                >
                  <span className="min-w-0 font-semibold break-words">{document.title}</span>
                  <span className="flex items-center gap-3">
                    <time
                      dateTime={document.createdAt}
                      className="text-caption text-muted-foreground"
                    >
                      {formatDateTime(document.createdAt, locale)}
                    </time>
                    <StatusBadge status={document.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
} from "@biyard/components";
import { Link, useSearchParams } from "react-router-dom";
import type { DocumentStatus } from "@interview/api-types/DocumentStatus";
import type { UserRole } from "@interview/api-types/UserRole";
import { dataroomKeys, listDocuments } from "./api";
import type { DataroomText } from "./copy";

function statusPresentation(status: DocumentStatus, text: DataroomText) {
  switch (status) {
    case "ready":
      return { label: text.ready, variant: "success" as const };
    case "processing":
      return { label: text.processing, variant: "warning" as const };
    case "failed":
      return { label: text.failed, variant: "danger" as const };
  }
}

export function DocumentList({
  workspaceId,
  role,
  locale,
  text,
}: {
  workspaceId: string;
  role: UserRole;
  locale: "ko" | "en";
  text: DataroomText;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("q")?.trim() ?? "";
  const [draft, setDraft] = useState(search);
  const documents = useQuery({
    queryKey: dataroomKeys.documentList(workspaceId, search),
    queryFn: () => listDocuments(workspaceId, { search: search || null }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    setSearchParams(value ? { q: value } : {}, { replace: true });
  }

  function clearSearch() {
    setDraft("");
    setSearchParams({}, { replace: true });
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-heading-3 font-semibold">{text.title}</h1>
          <p className="text-muted-foreground">{text.description}</p>
        </div>
        {role === "company" ? (
          <Button asChild>
            <Link
              to={`/workspace/${encodeURIComponent(workspaceId)}/documents/new`}
            >
              {text.createDocument}
            </Link>
          </Button>
        ) : null}
      </header>

      <form
        onSubmit={submit}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1 space-y-2">
          <Label htmlFor="document-search">{text.searchLabel}</Label>
          <Input
            id="document-search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={text.searchPlaceholder}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit">{text.search}</Button>
          {search ? (
            <Button type="button" variant="outline" onClick={clearSearch}>
              {text.clearSearch}
            </Button>
          ) : null}
        </div>
      </form>

      {documents.isPending ? <p role="status">{text.loading}</p> : null}
      {documents.isError ? (
        <div
          role="alert"
          className="space-y-3 rounded-lg border border-border bg-card p-6"
        >
          <p>{text.loadError}</p>
          <Button variant="outline" onClick={() => documents.refetch()}>
            {text.retry}
          </Button>
        </div>
      ) : null}
      {documents.data ? (
        documents.data.documents.length ? (
          <ul className="grid gap-3">
            {documents.data.documents.map((document) => {
              const presentation = statusPresentation(document.status, text);
              return (
                <li key={document.id}>
                  <Link
                    to={`/workspace/${encodeURIComponent(workspaceId)}/documents/${encodeURIComponent(document.id)}`}
                    className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Card className="transition-colors hover:bg-accent">
                      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {document.title}
                          </p>
                          <p className="mt-1 text-caption text-muted-foreground">
                            {text.createdAt}:{" "}
                            {new Intl.DateTimeFormat(locale, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(document.createdAt))}
                          </p>
                        </div>
                        <Badge variant={presentation.variant}>
                          {presentation.label}
                        </Badge>
                      </CardContent>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            {search ? text.emptySearch : text.empty}
          </div>
        )
      ) : null}
    </section>
  );
}

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  isPluginRpcError,
  type PluginContext,
  type PluginHost,
} from "@interview/plugin-sdk";
import type { Review } from "@interview/api-types/Review";
import type { ReviewCriterion } from "@interview/api-types/ReviewCriterion";
import type { ReviewDecision } from "@interview/api-types/ReviewDecision";
import type { SaveReviewParams } from "@interview/api-types/SaveReviewParams";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Select,
  Textarea,
} from "@biyard/components";
import { listEvidenceDocuments, reviewKeys, saveReview } from "./api";
import type { ReviewText } from "./copy";

const MAX_OPINION_CHARS = 2_000;

function characterCount(value: string) {
  return Array.from(value).length;
}

export function ReviewEditor({
  host,
  context,
  criterion,
  initialReview,
  text,
  reloadReviews,
  onSaved,
}: {
  host: PluginHost;
  context: PluginContext;
  criterion: ReviewCriterion;
  initialReview: Review | null;
  text: ReviewText;
  reloadReviews(): Promise<Review | null | undefined>;
  onSaved(review: Review): void;
}) {
  const [decision, setDecision] = useState<ReviewDecision>(
    initialReview?.decision ?? "satisfied",
  );
  const [opinion, setOpinion] = useState(initialReview?.opinion ?? "");
  const [evidenceIds, setEvidenceIds] = useState<string[]>(
    initialReview?.evidenceDocumentIds ?? [],
  );
  const [revision, setRevision] = useState<number | null>(
    initialReview?.revision ?? null,
  );
  const [inputError, setInputError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Review | null>(null);
  const [conflictDetected, setConflictDetected] = useState(false);
  const [conflictReloadFailed, setConflictReloadFailed] = useState(false);
  const documents = useQuery({
    queryKey: reviewKeys.documents(context),
    queryFn: () => listEvidenceDocuments(host),
  });
  const readyDocuments = documents.data?.documents.filter(
    (document) => document.status === "ready",
  );

  const save = useMutation({
    mutationFn: (params: SaveReviewParams) => saveReview(host, params),
    onSuccess: ({ review }) => onSaved(review),
    onError: async (error) => {
      if (!isPluginRpcError(error) || error.status !== 409) return;
      setConflictDetected(true);
      setConflict(null);
      setConflictReloadFailed(false);
      try {
        const latest = await reloadReviews();
        if (latest) setConflict(latest);
        else setConflictReloadFailed(true);
      } catch {
        setConflictReloadFailed(true);
      }
    },
  });

  function toggleEvidence(documentId: string) {
    setEvidenceIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId],
    );
  }

  function submitWithRevision(expectedRevision: number | null) {
    setInputError(null);
    setConflictDetected(false);
    setConflict(null);
    setConflictReloadFailed(false);
    save.reset();
    if (
      opinion.trim().length === 0 ||
      characterCount(opinion) > MAX_OPINION_CHARS ||
      opinion.includes("\0")
    ) {
      setInputError(text.opinionInvalid);
      return;
    }
    if (!evidenceIds.length) {
      setInputError(text.evidenceRequired);
      return;
    }
    save.mutate({
      criterionId: criterion.id,
      decision,
      opinion,
      evidenceDocumentIds: evidenceIds,
      expectedRevision,
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    submitWithRevision(revision);
  }

  function loadLatest() {
    if (!conflict) return;
    setDecision(conflict.decision);
    setOpinion(conflict.opinion);
    setEvidenceIds(conflict.evidenceDocumentIds);
    setRevision(conflict.revision);
    setConflictDetected(false);
    setConflict(null);
    setConflictReloadFailed(false);
    save.reset();
  }

  const conflictError =
    isPluginRpcError(save.error) && save.error.status === 409;

  return (
    <section className="space-y-6">
      <Button variant="ghost" onClick={() => host.navigate("/")}>
        ← {text.backToOverview}
      </Button>
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle className="text-heading-3">{criterion.title}</CardTitle>
            {revision !== null ? (
              <Badge variant="default">revision {revision}</Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground">{criterion.reviewQuestion}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="review-decision">{text.decision}</Label>
              <Select
                id="review-decision"
                value={decision}
                onChange={(event) =>
                  setDecision(event.target.value as ReviewDecision)
                }
                disabled={save.isPending}
              >
                <option value="satisfied">{text.satisfied}</option>
                <option value="needs_information">
                  {text.needsInformation}
                </option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="review-opinion">{text.opinion}</Label>
              <Textarea
                id="review-opinion"
                value={opinion}
                onChange={(event) => setOpinion(event.target.value)}
                placeholder={text.opinionPlaceholder}
                disabled={save.isPending}
                required
                aria-describedby="review-opinion-help"
              />
              <div
                id="review-opinion-help"
                className="flex justify-between gap-4 text-caption text-muted-foreground"
              >
                <span>{text.opinionHelp}</span>
                <span>
                  {characterCount(opinion)}/{MAX_OPINION_CHARS}
                </span>
              </div>
            </div>

            <fieldset className="space-y-3" disabled={save.isPending}>
              <legend className="font-semibold">{text.evidence}</legend>
              <p className="text-caption text-muted-foreground">
                {text.evidenceHelp}
              </p>
              {documents.isPending ? (
                <p role="status">{text.evidenceLoading}</p>
              ) : null}
              {documents.isError ? (
                <div
                  role="alert"
                  className="space-y-2 rounded-md border border-border p-4"
                >
                  <p>{text.evidenceError}</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => documents.refetch()}
                  >
                    {text.retry}
                  </Button>
                </div>
              ) : null}
              {readyDocuments ? (
                readyDocuments.length ? (
                  <div className="grid gap-2">
                    {readyDocuments.map((document) => (
                      <div
                        key={document.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
                      >
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            checked={evidenceIds.includes(document.id)}
                            onChange={() => toggleEvidence(document.id)}
                            className="h-4 w-4 accent-primary"
                          />
                          <span className="truncate">{document.title}</span>
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            host.navigate(
                              `/documents/${encodeURIComponent(document.id)}?criterion=${encodeURIComponent(criterion.id)}`,
                            )
                          }
                        >
                          {text.viewDocument}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-border p-5 text-muted-foreground">
                    {text.noReadyDocuments}
                  </p>
                )
              ) : null}
            </fieldset>

            {inputError ? (
              <p role="alert" className="text-destructive">
                {inputError}
              </p>
            ) : null}
            {save.isError && !conflictError ? (
              <p role="alert" className="text-destructive">
                {text.saveError}
              </p>
            ) : null}
            {save.isPending ? <p role="status">{text.saving}</p> : null}

            {conflictDetected ? (
              <div
                role="alert"
                className="space-y-4 rounded-lg border border-warning bg-warning-muted p-4"
              >
                <div>
                  <p className="font-semibold">{text.conflictTitle}</p>
                  <p>{text.conflictDescription}</p>
                </div>
                {conflict ? (
                  <div className="space-y-2 rounded-md bg-card p-3">
                    <p className="font-semibold">
                      {text.latestReview} · revision {conflict.revision}
                    </p>
                    <Badge
                      variant={
                        conflict.decision === "satisfied"
                          ? "success"
                          : "warning"
                      }
                    >
                      {conflict.decision === "satisfied"
                        ? text.satisfied
                        : text.needsInformation}
                    </Badge>
                    <p className="whitespace-pre-wrap">{conflict.opinion}</p>
                  </div>
                ) : null}
                {conflictReloadFailed ? (
                  <p className="text-destructive">{text.conflictReloadError}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={loadLatest}
                    disabled={!conflict}
                  >
                    {text.loadLatest}
                  </Button>
                  <Button
                    type="button"
                    onClick={() =>
                      conflict && submitWithRevision(conflict.revision)
                    }
                    disabled={!conflict || save.isPending}
                  >
                    {text.retryMine}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => host.navigate("/")}
              >
                {text.cancel}
              </Button>
              <Button
                type="submit"
                disabled={
                  save.isPending || documents.isPending || documents.isError
                }
              >
                {text.save}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}

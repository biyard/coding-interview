import { useRef, useState, type FormEvent } from "react";
import { Badge, Button, Textarea } from "@biyard/components";
import type { PluginContext, PluginHost } from "@interview/plugin-sdk";
import type { DocumentSummary } from "@interview/api-types/DocumentSummary";
import type { ReviewCriterion } from "@interview/api-types/ReviewCriterion";
import type { ReviewDetail } from "@interview/api-types/ReviewDetail";
import type { ReviewDraft } from "@interview/api-types/ReviewDraft";
import type { ReviewVerdict } from "@interview/api-types/ReviewVerdict";
import { AiDraftPanel } from "./ai-draft";
import {
  rpcError,
  useCriteria,
  useDocuments,
  useDraftReview,
  useMyReviews,
  useSaveReview,
} from "./api";
import { PluginLink } from "./links";
import { fill, formatDateTime, type Strings } from "./strings";

const MAX_COMMENT_CHARS = 2000;

interface Props {
  host: PluginHost;
  context: PluginContext;
  text: Strings;
}

const normalize = (comment: string) => comment.replace(/\r\n/g, "\n").trim();
const countChars = (value: string) => [...value].length;

export function Editor({ host, context, text, criterionId }: Props & { criterionId: string }) {
  const criteria = useCriteria(host, context);
  const reviews = useMyReviews(host, context);
  // Bumping the key remounts the form, which is the only way saved data replaces a draft.
  const [formKey, setFormKey] = useState(0);
  const back = (
    <PluginLink
      host={host}
      context={context}
      to="/"
      className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline"
    >
      ← {text.backToOverview}
    </PluginLink>
  );
  if (criteria.isPending || reviews.isPending)
    return (
      <div className="space-y-6">
        {back}
        <p role="status">{text.loading}</p>
      </div>
    );
  if (criteria.isError || reviews.isError)
    return (
      <div className="space-y-6">
        {back}
        <div
          role="alert"
          className="flex flex-col items-start gap-4 rounded-lg border border-border bg-card p-6"
        >
          <p>{text.editorError}</p>
          <Button
            variant="outline"
            onClick={() => {
              void criteria.refetch();
              void reviews.refetch();
            }}
          >
            {text.retry}
          </Button>
        </div>
      </div>
    );
  const criterion = criteria.data.criteria.find((item) => item.id === criterionId);
  if (!criterion)
    return (
      <div className="space-y-6">
        {back}
        <p role="alert">{text.criterionNotFound}</p>
      </div>
    );
  return (
    <div className="space-y-6">
      {back}
      <ReviewForm
        key={formKey}
        host={host}
        context={context}
        text={text}
        criterion={criterion}
        initial={reviews.data.reviews.find((review) => review.criterionId === criterionId) ?? null}
        reload={async () => {
          await reviews.refetch();
          setFormKey((key) => key + 1);
        }}
      />
    </div>
  );
}

function ReviewForm({
  host,
  context,
  text,
  criterion,
  initial,
  reload,
}: Props & {
  criterion: ReviewCriterion;
  initial: ReviewDetail | null;
  reload(): Promise<void>;
}) {
  const documents = useDocuments(host, context);
  const save = useSaveReview(host, context);
  const aiDraft = useDraftReview(host);
  // The form owns its draft from mount on; background refetches never overwrite what was typed.
  const [verdict, setVerdict] = useState<ReviewVerdict | null>(initial?.verdict ?? null);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [evidence, setEvidence] = useState<Set<string>>(
    () => new Set(initial?.evidence.map((item) => item.documentId)),
  );
  const [expectedVersion] = useState(initial?.version ?? null);
  const [submitted, setSubmitted] = useState(false);
  // The AI draft only fills the form; `before` lets the investor take it back.
  const [applied, setApplied] = useState<{
    draft: ReviewDraft;
    before: { verdict: ReviewVerdict | null; comment: string; evidence: Set<string> };
  } | null>(null);
  const busy = save.isPending || aiDraft.isPending;
  const verdictGroup = useRef<HTMLFieldSetElement>(null);
  const commentInput = useRef<HTMLTextAreaElement>(null);
  const evidenceGroup = useRef<HTMLFieldSetElement>(null);

  const commentLength = countChars(normalize(comment));
  const problems = {
    verdict: verdict ? null : text.verdictRequired,
    comment:
      commentLength === 0
        ? text.commentRequired
        : commentLength > MAX_COMMENT_CHARS
          ? text.commentTooLong
          : null,
    evidence: evidence.size ? null : text.evidenceRequired,
  };
  const shown = submitted ? problems : { verdict: null, comment: null, evidence: null };

  function toggle(document: DocumentSummary, checked: boolean) {
    setEvidence((current) => {
      const next = new Set(current);
      if (checked) next.add(document.id);
      else next.delete(document.id);
      return next;
    });
  }

  function requestDraft() {
    aiDraft.mutate(criterion.id, {
      onSuccess: (draft) => {
        // Inputs are disabled while drafting, so these are still the values the investor had.
        setApplied((current) => ({
          draft,
          before: current?.before ?? { verdict, comment, evidence },
        }));
        setVerdict(draft.verdict);
        setComment(draft.comment);
        setEvidence(new Set(draft.evidence.map((item) => item.documentId)));
        void documents.refetch();
      },
    });
  }

  function undoDraft() {
    if (!applied) return;
    setVerdict(applied.before.verdict);
    setComment(applied.before.comment);
    setEvidence(applied.before.evidence);
    setApplied(null);
    aiDraft.reset();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (problems.verdict) return focusFirst(verdictGroup.current);
    if (problems.comment) return commentInput.current?.focus();
    if (problems.evidence || !verdict) return focusFirst(evidenceGroup.current);
    save.mutate(
      {
        criterionId: criterion.id,
        verdict,
        comment: normalize(comment),
        evidenceDocumentIds: [...evidence],
        expectedVersion,
      },
      {
        onSuccess: () => host.navigate(`/?saved=${encodeURIComponent(criterion.id)}`),
        onError: (error) => {
          const kind = rpcError(error)?.kind;
          if (kind === "evidence_not_ready" || kind === "evidence_not_found")
            void documents.refetch();
        },
      },
    );
  }

  const failure = rpcError(save.error);
  const saveMessage = !save.isError
    ? null
    : failure?.kind === "review_conflict"
      ? text.conflict
      : failure?.kind === "evidence_not_ready" || failure?.kind === "evidence_not_found"
        ? text.evidenceInvalid
        : failure?.status === 403
          ? text.saveForbidden
          : failure?.kind === "criterion_not_found"
            ? text.criterionNotFound
            : failure?.status === 400
              ? text.saveRejected
              : text.saveError;

  return (
    <form noValidate onSubmit={submit} aria-labelledby="editor-heading" className="space-y-8">
      <header className="space-y-2">
        <h1 id="editor-heading" className="text-heading-3 font-semibold">
          {fill(text.editorTitle, { title: criterion.title })}
        </h1>
        <p>
          <span className="font-semibold">{text.question}</span>{" "}
          <span className="text-muted-foreground">{criterion.reviewQuestion}</span>
        </p>
        {initial ? (
          <p className="text-caption text-muted-foreground">
            {fill(text.lastSaved, { time: formatDateTime(initial.updatedAt, context.locale) })}
          </p>
        ) : null}
      </header>

      <AiDraftPanel
        text={text}
        hasInput={verdict !== null || normalize(comment) !== "" || evidence.size > 0}
        disabled={busy}
        pending={aiDraft.isPending}
        error={aiDraft.error}
        applied={applied?.draft ?? null}
        onCreate={requestDraft}
        onUndo={undoDraft}
      />

      <fieldset
        ref={verdictGroup}
        aria-describedby={shown.verdict ? "verdict-error" : undefined}
        className="space-y-3"
      >
        <legend className="mb-3 font-semibold">{text.verdictLegend}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["satisfied", text.satisfied, text.verdictSatisfiedHint],
              ["needs_information", text.needsInformation, text.verdictNeedsInformationHint],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer gap-3 rounded-lg border border-border bg-card p-4 has-[:checked]:border-primary has-[:checked]:bg-accent"
            >
              <input
                type="radio"
                name="verdict"
                value={value}
                checked={verdict === value}
                onChange={() => setVerdict(value)}
                disabled={busy}
                className="mt-1 size-4 accent-[var(--primary)]"
              />
              <span className="space-y-1">
                <span className="block font-semibold">{label}</span>
                <span className="block text-caption text-muted-foreground">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        {shown.verdict ? (
          <p id="verdict-error" className="text-destructive">
            {shown.verdict}
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="review-comment" className="font-semibold">
          {text.comment}
        </label>
        <Textarea
          id="review-comment"
          ref={commentInput}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          disabled={busy}
          rows={6}
          aria-invalid={shown.comment ? true : undefined}
          aria-describedby={`review-comment-hint${shown.comment ? " review-comment-error" : ""}`}
        />
        <p
          id="review-comment-hint"
          className="flex justify-between gap-4 text-caption text-muted-foreground"
        >
          <span>{text.commentHint}</span>
          <span className={commentLength > MAX_COMMENT_CHARS ? "text-destructive" : undefined}>
            {fill(text.commentCount, { count: commentLength })}
          </span>
        </p>
        {shown.comment ? (
          <p id="review-comment-error" className="text-destructive">
            {shown.comment}
          </p>
        ) : null}
      </div>

      <fieldset
        ref={evidenceGroup}
        aria-describedby={`evidence-hint${shown.evidence ? " evidence-error" : ""}`}
        className="space-y-3"
      >
        <legend className="mb-1 font-semibold">{text.evidenceLegend}</legend>
        <p id="evidence-hint" className="text-caption text-muted-foreground">
          {text.evidenceHint}
        </p>
        {documents.isPending ? (
          <p role="status">{text.loading}</p>
        ) : documents.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3">
            <p>{text.documentsError}</p>
            <Button type="button" variant="outline" onClick={() => documents.refetch()}>
              {text.retry}
            </Button>
          </div>
        ) : documents.data.documents.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-muted-foreground">
            {text.noDocuments}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {documents.data.documents.map((document) => {
              const ready = document.status === "ready";
              const inputId = `evidence-${document.id}`;
              return (
                <li
                  key={document.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-2"
                >
                  <label
                    htmlFor={inputId}
                    className={`flex min-h-11 min-w-0 flex-1 items-center gap-3 ${ready ? "cursor-pointer" : "text-muted-foreground"}`}
                  >
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={evidence.has(document.id)}
                      onChange={(event) => toggle(document, event.target.checked)}
                      disabled={!ready || busy}
                      aria-describedby={ready ? undefined : `${inputId}-reason`}
                      className="size-4 accent-[var(--primary)]"
                    />
                    <span className="min-w-0 break-words">{document.title}</span>
                    {applied?.draft.evidence.some((item) => item.documentId === document.id) ? (
                      <Badge>{text.aiSuggested}</Badge>
                    ) : null}
                    {ready ? null : (
                      <span id={`${inputId}-reason`} className="flex items-center gap-2">
                        <Badge variant={document.status === "failed" ? "danger" : "warning"}>
                          {document.status === "failed" ? text.statusFailed : text.statusProcessing}
                        </Badge>
                        <span className="text-caption">{text.evidenceUnavailable}</span>
                      </span>
                    )}
                  </label>
                  {/* Opens in a new tab so the draft on this page is not lost. */}
                  <a
                    href={host.documentHref(document.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center text-caption text-primary underline-offset-4 hover:underline"
                  >
                    {text.openDocument}
                    <span className="sr-only">: {document.title}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
        {shown.evidence ? (
          <p id="evidence-error" className="text-destructive">
            {shown.evidence}
          </p>
        ) : null}
      </fieldset>

      {saveMessage ? (
        <div
          role="alert"
          className="space-y-3 rounded-md bg-destructive-muted px-4 py-3 text-destructive"
        >
          <p>{saveMessage}</p>
          {failure?.kind === "review_conflict" ? (
            <Button type="button" variant="outline" onClick={() => void reload()}>
              {text.reloadLatest}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy} className="min-h-11">
          {save.isPending ? text.saving : text.save}
        </Button>
        <PluginLink
          host={host}
          context={context}
          to="/"
          className="inline-flex min-h-11 items-center rounded-md border border-input bg-card px-4 font-semibold hover:bg-accent"
        >
          {text.cancel}
        </PluginLink>
      </div>
    </form>
  );
}

function focusFirst(group: HTMLFieldSetElement | null) {
  group?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus();
}

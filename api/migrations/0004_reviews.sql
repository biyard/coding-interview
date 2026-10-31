CREATE TABLE reviews (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    workspace_id TEXT NOT NULL,
    investor_id TEXT NOT NULL,
    criterion_id TEXT NOT NULL REFERENCES review_criteria(id),
    verdict TEXT NOT NULL CHECK (verdict IN ('satisfied', 'needs_information')),
    comment TEXT NOT NULL,
    -- Incremented on every save; clients send the version they edited to detect lost updates.
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT reviews_one_per_criterion UNIQUE (workspace_id, investor_id, criterion_id),
    CONSTRAINT reviews_id_workspace_key UNIQUE (id, workspace_id),
    CONSTRAINT reviews_investor_member_fkey FOREIGN KEY (workspace_id, investor_id)
        REFERENCES workspace_users (workspace_id, user_id),
    CONSTRAINT reviews_comment_format CHECK (
        char_length(comment) <= 2000
        AND comment ~ '^\S(.*\S)?$'
    )
);

CREATE TABLE review_evidence (
    review_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    document_status TEXT NOT NULL DEFAULT 'ready' CHECK (document_status = 'ready'),
    PRIMARY KEY (review_id, document_id),
    CONSTRAINT review_evidence_review_fkey FOREIGN KEY (review_id, workspace_id)
        REFERENCES reviews (id, workspace_id) ON DELETE CASCADE,
    -- Only ready documents of the review's own workspace can be referenced.
    CONSTRAINT review_evidence_document_fkey FOREIGN KEY (workspace_id, document_id, document_status)
        REFERENCES documents (workspace_id, id, status)
);

CREATE INDEX review_evidence_document_idx
    ON review_evidence (workspace_id, document_id, document_status);

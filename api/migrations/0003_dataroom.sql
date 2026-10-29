CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    file_name TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT documents_id_length CHECK (CHAR_LENGTH(id) BETWEEN 1 AND 100),
    CONSTRAINT documents_title_length CHECK (CHAR_LENGTH(title) BETWEEN 1 AND 200),
    CONSTRAINT documents_title_not_blank CHECK (title !~ '^[[:space:]]*$'),
    CONSTRAINT documents_file_name_length CHECK (CHAR_LENGTH(file_name) BETWEEN 1 AND 255),
    CONSTRAINT documents_file_name_not_blank CHECK (file_name !~ '^[[:space:]]*$'),
    CONSTRAINT documents_file_name_leaf CHECK (file_name !~ '[/\\]'),
    CONSTRAINT documents_file_name_extension CHECK (LOWER(file_name) ~ '\.(txt|md)$'),
    CONSTRAINT documents_content_size CHECK (OCTET_LENGTH(content) <= 204800),
    CONSTRAINT documents_status_valid CHECK (status IN ('ready', 'processing', 'failed')),
    CONSTRAINT documents_workspace_id_id_unique UNIQUE (workspace_id, id)
);

CREATE INDEX documents_workspace_created_id_idx
    ON documents (workspace_id, created_at DESC, id ASC);

CREATE INDEX documents_workspace_title_idx
    ON documents (workspace_id, LOWER(title) TEXT_PATTERN_OPS);

CREATE TABLE reviews (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    investor_id TEXT NOT NULL,
    criterion_id TEXT NOT NULL REFERENCES review_criteria(id) ON DELETE RESTRICT,
    decision TEXT NOT NULL,
    opinion TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT reviews_id_length CHECK (CHAR_LENGTH(id) BETWEEN 1 AND 100),
    CONSTRAINT reviews_decision_valid CHECK (
        decision IN ('satisfied', 'needs_information')
    ),
    CONSTRAINT reviews_opinion_length CHECK (CHAR_LENGTH(opinion) BETWEEN 1 AND 2000),
    CONSTRAINT reviews_opinion_not_blank CHECK (opinion !~ '^[[:space:]]*$'),
    CONSTRAINT reviews_updated_after_created CHECK (updated_at >= created_at),
    CONSTRAINT reviews_workspace_investor_fk
        FOREIGN KEY (workspace_id, investor_id)
        REFERENCES workspace_users (workspace_id, user_id)
        ON DELETE CASCADE,
    CONSTRAINT reviews_workspace_investor_criterion_unique
        UNIQUE (workspace_id, investor_id, criterion_id),
    CONSTRAINT reviews_workspace_id_id_unique UNIQUE (workspace_id, id)
);

CREATE INDEX reviews_workspace_investor_idx
    ON reviews (workspace_id, investor_id);

CREATE TABLE review_evidence (
    workspace_id TEXT NOT NULL,
    review_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    CONSTRAINT review_evidence_pkey PRIMARY KEY (review_id, document_id),
    CONSTRAINT review_evidence_review_fk
        FOREIGN KEY (workspace_id, review_id)
        REFERENCES reviews (workspace_id, id)
        ON DELETE CASCADE,
    CONSTRAINT review_evidence_document_fk
        FOREIGN KEY (workspace_id, document_id)
        REFERENCES documents (workspace_id, id)
        ON DELETE RESTRICT
);

CREATE INDEX review_evidence_workspace_document_idx
    ON review_evidence (workspace_id, document_id);

INSERT INTO documents (id, workspace_id, title, file_name, content, status) VALUES
    (
        'doc-business',
        'lighthouse',
        '회사 소개',
        'company-overview.md',
        '제조사 재고 관리 구독형 소프트웨어. 사업장당 월 15만 원, 2026년 8월 유료 고객 40개.',
        'ready'
    ),
    (
        'doc-team',
        'lighthouse',
        '팀 소개',
        'team.md',
        '대표 제조업 운영 8년, 개발 책임자 B2B 개발 6년, 디자이너 4년. 전담 영업 담당자는 없음.',
        'ready'
    ),
    (
        'doc-revenue',
        'lighthouse',
        '매출 자료',
        'revenue.txt',
        '자료를 읽지 못했습니다.',
        'failed'
    ),
    (
        'doc-pipeline',
        'lighthouse',
        '고객 인터뷰',
        'customer-interviews.md',
        '아직 준비되지 않았습니다.',
        'processing'
    );

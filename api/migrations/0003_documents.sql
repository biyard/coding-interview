ALTER TABLE workspaces ADD COLUMN description TEXT NOT NULL DEFAULT '';

UPDATE workspaces
SET description = '소규모 제조사를 위한 재고 관리 소프트웨어'
WHERE id = 'lighthouse';

CREATE TABLE documents (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    file_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ready', 'processing', 'failed')),
    content TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Evidence rows reference (workspace_id, id, status) so the database itself rejects
    -- documents from another workspace and documents that are not ready.
    CONSTRAINT documents_workspace_id_id_status_key UNIQUE (workspace_id, id, status),
    CONSTRAINT documents_uploader_member_fkey FOREIGN KEY (workspace_id, uploaded_by)
        REFERENCES workspace_users (workspace_id, user_id),
    CONSTRAINT documents_title_format CHECK (
        char_length(title) <= 200
        AND title ~ '^\S(.*\S)?$'
        AND title !~ '[[:cntrl:]]'
    ),
    CONSTRAINT documents_file_name_format CHECK (
        char_length(file_name) <= 255
        AND file_name ~* '^[^/\\[:cntrl:]]+\.(txt|md)$'
    ),
    CONSTRAINT documents_content_size CHECK (octet_length(content) <= 204800)
);

CREATE INDEX documents_workspace_created_idx
    ON documents (workspace_id, created_at DESC, id)
    INCLUDE (title, status);

INSERT INTO documents (id, workspace_id, title, file_name, status, content, uploaded_by, created_at) VALUES
    ('doc-business', 'lighthouse', '회사 소개', 'company-overview.md', 'ready',
     '제조사 재고 관리 구독형 소프트웨어. 사업장당 월 15만 원, 2026년 8월 유료 고객 40개.',
     'company-user', '2026-09-01 09:00:00+09'),
    ('doc-team', 'lighthouse', '팀 소개', 'team.md', 'ready',
     '대표 제조업 운영 8년, 개발 책임자 B2B 개발 6년, 디자이너 4년. 전담 영업 담당자는 없음.',
     'company-user', '2026-09-01 09:10:00+09'),
    ('doc-revenue', 'lighthouse', '매출 자료', 'revenue.txt', 'failed',
     '자료를 읽지 못했습니다.',
     'company-user', '2026-09-01 09:20:00+09'),
    ('doc-pipeline', 'lighthouse', '고객 인터뷰', 'customer-interviews.md', 'processing',
     '아직 준비되지 않았습니다.',
     'company-user', '2026-09-01 09:30:00+09');

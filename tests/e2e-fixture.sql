INSERT INTO workspaces (id, name)
VALUES ('e2e', 'E2E 전용 워크스페이스')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO users (id, email, display_name, password_hash) VALUES
    (
        'e2e-company',
        'company@e2e.test',
        'E2E 기업 담당자',
        '$argon2id$v=19$m=19456,t=2,p=1$aW50ZWdyYXRpb24tMTc5MzI1MDk5OTYwMzE2MzMxMQ$qyMpZsrpXmun9xW+i7YIn5pnz0QesW0AGZeEDHuJkO4'
    ),
    (
        'e2e-investor',
        'investor@e2e.test',
        'E2E 투자자',
        '$argon2id$v=19$m=19456,t=2,p=1$aW50ZWdyYXRpb24tMTc5MzI1MDk5OTYwMzE2MzMxMQ$qyMpZsrpXmun9xW+i7YIn5pnz0QesW0AGZeEDHuJkO4'
    ),
    (
        'e2e-peer',
        'peer@e2e.test',
        'E2E 동료 투자자',
        '$argon2id$v=19$m=19456,t=2,p=1$aW50ZWdyYXRpb24tMTc5MzI1MDk5OTYwMzE2MzMxMQ$qyMpZsrpXmun9xW+i7YIn5pnz0QesW0AGZeEDHuJkO4'
    )
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    password_hash = EXCLUDED.password_hash;

INSERT INTO workspace_users (workspace_id, user_id, role) VALUES
    ('e2e', 'e2e-company', 'company'),
    ('e2e', 'e2e-investor', 'investor'),
    ('e2e', 'e2e-peer', 'investor')
ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO documents (id, workspace_id, title, file_name, content, status) VALUES
    ('e2e-doc-ready-a', 'e2e', 'E2E 준비 자료 A', 'evidence-a.md', 'E2E 근거 자료 A 본문', 'ready'),
    ('e2e-doc-ready-b', 'e2e', 'E2E 준비 자료 B', 'evidence-b.txt', 'E2E 근거 자료 B 본문', 'ready'),
    ('e2e-doc-processing', 'e2e', 'E2E 처리 중 자료', 'processing.md', '처리 중', 'processing'),
    ('e2e-doc-failed', 'e2e', 'E2E 실패 자료', 'failed.txt', '처리 실패', 'failed')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE reviews
    ADD COLUMN revision BIGINT NOT NULL DEFAULT 1,
    ADD CONSTRAINT reviews_revision_positive CHECK (revision >= 1);

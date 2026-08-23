ALTER TABLE students
  ADD COLUMN view_duration_seconds BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER viewed_at;

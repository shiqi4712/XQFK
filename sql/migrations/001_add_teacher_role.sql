ALTER TABLE teachers
  ADD COLUMN role ENUM('admin', 'teacher') NOT NULL DEFAULT 'teacher' AFTER password_hash;

UPDATE teachers SET role = 'admin' WHERE LOWER(account) = 'shiqi';

CREATE TABLE IF NOT EXISTS teachers (
  teacher_id VARCHAR(36) PRIMARY KEY,
  account VARCHAR(80) NOT NULL UNIQUE,
  display_name VARCHAR(80) NOT NULL,
  password_salt CHAR(32) NOT NULL,
  password_hash CHAR(128) NOT NULL,
  role ENUM('admin', 'teacher') NOT NULL DEFAULT 'teacher',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS students (
  student_id VARCHAR(64) PRIMARY KEY,
  teacher_id VARCHAR(36) NOT NULL,
  report_code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  level VARCHAR(120) NOT NULL DEFAULT '',
  course_line VARCHAR(120) NOT NULL DEFAULT '',
  team_leader VARCHAR(80) NOT NULL DEFAULT '',
  schedule_id VARCHAR(80) NOT NULL DEFAULT '',
  learning_data JSON NOT NULL,
  viewed_at DATETIME(3) NULL,
  seat_locked BOOLEAN NOT NULL DEFAULT FALSE,
  seat_locked_at DATETIME(3) NULL,
  selected_class_time JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_students_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id),
  INDEX idx_students_teacher (teacher_id),
  INDEX idx_students_viewed (teacher_id, viewed_at),
  INDEX idx_students_locked (teacher_id, seat_locked)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS import_batches (
  batch_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  teacher_id VARCHAR(36) NOT NULL,
  file_name VARCHAR(255) NOT NULL DEFAULT '',
  imported_count INT UNSIGNED NOT NULL,
  total_students INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_import_batches_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id),
  INDEX idx_import_batches_teacher_time (teacher_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  teacher_id VARCHAR(36) NULL,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(40) NOT NULL DEFAULT '',
  target_id VARCHAR(80) NOT NULL DEFAULT '',
  metadata JSON NULL,
  ip_address VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_audit_teacher_time (teacher_id, created_at),
  INDEX idx_audit_action_time (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

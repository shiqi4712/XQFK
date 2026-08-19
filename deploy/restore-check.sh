#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /var/backups/learning-report/file.sql.gz" >&2
  exit 1
fi

backup_file="$(realpath "$1")"
backup_root="/var/backups/learning-report"
config_file="/etc/learning-report/backup.env"

if [[ "$backup_file" != "$backup_root/"*.sql.gz || ! -f "$backup_file" ]]; then
  echo "Backup file must be an existing .sql.gz under $backup_root" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$config_file"

required=(DB_HOST DB_PORT DB_NAME RESTORE_DB_USER RESTORE_DB_PASSWORD)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing $name in $config_file" >&2
    exit 1
  fi
done

if [[ ! "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "DB_NAME may only contain letters, digits, and underscores" >&2
  exit 1
fi

test_database="${DB_NAME}_restore_check"
MYSQL_PWD="$RESTORE_DB_PASSWORD" mysql --host="$DB_HOST" --port="$DB_PORT" --user="$RESTORE_DB_USER" \
  -e "CREATE DATABASE IF NOT EXISTS \`${test_database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"

gunzip -c "$backup_file" | MYSQL_PWD="$RESTORE_DB_PASSWORD" mysql \
  --host="$DB_HOST" --port="$DB_PORT" --user="$RESTORE_DB_USER" "$test_database"

MYSQL_PWD="$RESTORE_DB_PASSWORD" mysql --host="$DB_HOST" --port="$DB_PORT" --user="$RESTORE_DB_USER" \
  -N -e "SELECT CONCAT('teachers=', COUNT(*)) FROM \`${test_database}\`.teachers;
         SELECT CONCAT('students=', COUNT(*)) FROM \`${test_database}\`.students;"

echo "Restore check passed in database $test_database. Drop it manually after review."

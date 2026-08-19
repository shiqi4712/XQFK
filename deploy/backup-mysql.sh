#!/usr/bin/env bash
set -euo pipefail

config_file="/etc/learning-report/backup.env"
backup_dir="/var/backups/learning-report"

if [[ ! -r "$config_file" ]]; then
  echo "Missing $config_file" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$config_file"

required=(DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME)
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

install -d -m 700 "$backup_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="$backup_dir/${DB_NAME}-${timestamp}.sql.gz"

MYSQL_PWD="$DB_PASSWORD" mysqldump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  --single-transaction \
  --no-tablespaces \
  --triggers \
  --set-gtid-purged=OFF \
  "$DB_NAME" | gzip -9 > "$output"

gzip -t "$output"
find "$backup_dir" -maxdepth 1 -type f -name "${DB_NAME}-*.sql.gz" -mtime +14 -delete
echo "$output"

#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${OSS_DESTINATION:-}" ]]; then
  echo "Set OSS_DESTINATION, for example oss://bucket/learning-report/assets" >&2
  exit 1
fi

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ossutil cp -r "$project_dir/assets/" "${OSS_DESTINATION%/}/" --update

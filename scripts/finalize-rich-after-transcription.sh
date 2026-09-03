#!/usr/bin/env bash
# Wait for the current transcription pool, then run a final idempotent wiki pass.
set -uo pipefail

addon_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
wiki_root="${1:-${KNOWLEDGE_FORGE_ROOT:-${addon_root}/../llm-wiki}}"
input_root="${2:-${wiki_root}/raw/media}"
job_root="${3:-${MEDIA_INGEST_JOB_ROOT:-${addon_root}/.media-cache/finalize}}"
log_file="${job_root}/ingest-rich-watcher.log"
qmd_bin="${QMD_BIN:-${HOME}/.npm-global/bin/qmd}"
query_base_url="${KNOWLEDGE_FORGE_URL:-http://127.0.0.1:3000}"

mkdir -p "${job_root}"
exec >>"${log_file}" 2>&1
printf '%s FINALIZER_WAIT_START\n' "$(date -Is)"

while pgrep -f '[t]ranscribe_fw.py' >/dev/null; do
  printf '%s FINALIZER_WAIT workers=%s markdown=%s\n' \
    "$(date -Is)" \
    "$(pgrep -fc '[t]ranscribe_fw.py')" \
    "$(find "${input_root}" -type f -name '*.md' | wc -l)"
  sleep 60
done

# Give the media process time to atomically finish its last Markdown/manifests.
sleep 15
printf '%s FINALIZER_INGEST_START markdown=%s\n' \
  "$(date -Is)" "$(find "${input_root}" -type f -name '*.md' | wc -l)"

"${addon_root}/scripts/ingest-knowledge-forge-rich.sh" \
  "${wiki_root}" "${input_root}" "${job_root}"
result=$?

if [ "${result}" -eq 0 ]; then
  export XDG_CONFIG_HOME="/home/javadex-homelab/.config/knowledge-forge-qmd"
  export XDG_CACHE_HOME="/home/javadex-homelab/.cache/knowledge-forge-qmd"
  export QMD_FORCE_CPU=1
  printf '%s FINALIZER_SEARCH_INDEX_START\n' "$(date -Is)"
  "${qmd_bin}" update && \
    "${qmd_bin}" embed -c forge --max-docs-per-batch 12 --max-batch-mb 24 --timeout 90 && \
    systemctl --user enable --now knowledge-forge-qmd.service
  search_result=$?
  if [ "${search_result}" -eq 0 ]; then
    printf '%s FINALIZER_SEARCH_INDEX_END result=0\n' "$(date -Is)"
    printf '%s FINALIZER_QUERY_VALIDATION_START\n' "$(date -Is)"
    node "${addon_root}/scripts/run-final-wiki-queries.mjs" "${query_base_url}"
    query_result=$?
    printf '%s FINALIZER_QUERY_VALIDATION_END result=%s\n' "$(date -Is)" "${query_result}"
    if [ "${query_result}" -ne 0 ]; then
      result="${query_result}"
    fi
  else
    printf '%s FINALIZER_SEARCH_INDEX_END result=%s\n' "$(date -Is)" "${search_result}"
    result="${search_result}"
  fi
fi

printf '%s FINALIZER_END result=%s\n' "$(date -Is)" "${result}"
exit "${result}"

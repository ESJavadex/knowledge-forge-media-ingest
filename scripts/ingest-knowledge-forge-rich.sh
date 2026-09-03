#!/usr/bin/env bash
# Incrementally compile generated podcast Markdown into Knowledge Forge.
# The API credential must be supplied by the caller's environment/secret manager.
set -uo pipefail

export PATH="${HOME}/.npm-global/bin:${HOME}/.local/bin:${PATH}"
export OPENCLAW_BIN="${OPENCLAW_BIN:-${HOME}/.npm-global/bin/openclaw}"

addon_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
wiki_root="${1:-${KNOWLEDGE_FORGE_ROOT:-${addon_root}/../llm-wiki}}"
input_root="${2:-${wiki_root}/raw/media}"
job_root="${3:-${MEDIA_INGEST_JOB_ROOT:-${addon_root}/.media-cache/finalize}}"
model="${KNOWLEDGE_FORGE_MODEL:-zai/glm-5.3-flash}"
log_file="${job_root}/ingest-rich.log"
lock_file="${job_root}/ingest-rich.lock"

mkdir -p "${job_root}"
exec 9>"${lock_file}"
flock 9

exec > >(tee -a "${log_file}") 2>&1

log_status() { printf '%s %s\n' "$(date -Is)" "$*"; }

if [[ ! -d "${wiki_root}" || ! -d "${input_root}" ]]; then
  log_status "INGEST_BLOCKED invalid_path wiki=${wiki_root} input=${input_root}"
  exit 2
fi

mapfile -d '' discovered < <(find "${input_root}" -type f -name '*.md' -print0 | sort -z)
mapfile -d '' files < <(node "$(dirname "$0")/select-unique-markdown.mjs" "${discovered[@]}")
total=${#files[@]}
completed=0
failed=0

log_status "INGEST_RICH_START discovered=${#discovered[@]} unique=${total} duplicates=$((${#discovered[@]} - total)) model=${model} schema=4"

for file in "${files[@]}"; do
  relative="${file#${input_root}/}"
  result=1
  for attempt in 1 2 3; do
    log_status "SOURCE_START file=${relative} attempt=${attempt}"
    (
      cd "${wiki_root}" &&
      node src/cli.js ingest "${file}" --provider openclaw --model "${model}" --require-llm
    )
    result=$?
    if [[ ${result} -eq 0 ]]; then
      completed=$((completed + 1))
      log_status "SOURCE_END file=${relative} result=0 progress=${completed}/${total}"
      break
    fi
    log_status "SOURCE_RETRY file=${relative} result=${result} attempt=${attempt}"
    [[ ${attempt} -lt 3 ]] && sleep $((attempt * 10))
  done
  if [[ ${result} -ne 0 ]]; then
    failed=$((failed + 1))
    log_status "SOURCE_FAILED file=${relative} result=${result}"
  fi
done

log_status "LINT_START"
( cd "${wiki_root}" && npm run lint ) || log_status "LINT_WARNING exit=$?"

log_status "INGEST_RICH_END completed=${completed} failed=${failed} total=${total} model=${model}"
[[ ${failed} -eq 0 ]]

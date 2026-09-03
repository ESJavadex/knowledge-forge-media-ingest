import fs from 'node:fs';
import path from 'node:path';

export function selectUniqueMarkdown(files) {
  const selected = new Map();
  const duplicates = [];

  for (const file of files) {
    const candidate = describeMarkdown(file);
    const current = selected.get(candidate.identity);
    if (!current) {
      selected.set(candidate.identity, candidate);
      continue;
    }

    const keepCandidate = compareCandidates(candidate, current) > 0;
    const kept = keepCandidate ? candidate : current;
    const skipped = keepCandidate ? current : candidate;
    selected.set(candidate.identity, kept);
    duplicates.push({ identity: candidate.identity, kept: kept.file, skipped: skipped.file });
  }

  return {
    files: [...selected.values()].map((item) => item.file).sort(),
    duplicates,
  };
}

function describeMarkdown(file) {
  const content = fs.readFileSync(file, 'utf8');
  const sourceUrl = frontmatterValue(content, 'source_url');
  const episodeId = frontmatterValue(content, 'episode_id');
  const podcast = frontmatterValue(content, 'podcast');
  const transcribedAt = Date.parse(frontmatterValue(content, 'transcribed_at') || '') || 0;
  const identity = sourceUrl || (episodeId ? `${podcast || 'unknown'}:${episodeId}` : path.resolve(file));

  return {
    file,
    identity,
    bytes: Buffer.byteLength(content),
    transcribedAt,
  };
}

function frontmatterValue(content, key) {
  const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  if (!match) return '';
  const value = match[1].trim().replace(/^(["'])(.*)\1$/, '$2');
  return value === 'null' ? '' : value;
}

function compareCandidates(left, right) {
  if (left.bytes !== right.bytes) return left.bytes - right.bytes;
  if (left.transcribedAt !== right.transcribedAt) return left.transcribedAt - right.transcribedAt;
  return right.file.localeCompare(left.file);
}
